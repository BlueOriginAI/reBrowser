use crate::{
    clock::now_epoch_ms,
    error::{AppError, AppResult, IoPath},
    services::account_bridge::{AccountBridgeService, AccountBridgeSnapshot},
};
use claw_api::models::{ReroutePeerDevice, RerouteState};
use futures_util::{SinkExt, StreamExt, future::BoxFuture};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, RwLock, mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};
use uuid::Uuid;

const SETTINGS_FILENAME: &str = "reroute-settings.json";
const BINARY_FILE_CHUNK_MARKER: u8 = 0x01;
const MAX_FORWARD_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_TICKET_ENDPOINT: &str = "https://reroute.remocode.cc/v1/rebrowser/ticket";
const TICKET_REFRESH_MARGIN_MS: i64 = 60_000;

#[derive(Clone, Debug)]
struct CachedRelayTicket {
    installation_id: String,
    relay_url: String,
    ticket: String,
    expires_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTicketPayload {
    relay_url: String,
    ticket: String,
    expires_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RerouteSettings {
    #[serde(default = "default_allow_incoming")]
    allow_incoming_reroute: bool,
    #[serde(default)]
    target_device_id: Option<String>,
}

fn default_allow_incoming() -> bool {
    true
}

impl Default for RerouteSettings {
    fn default() -> Self {
        Self {
            allow_incoming_reroute: true,
            target_device_id: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDescriptor {
    pub attachment_id: String,
    pub original_path: String,
    pub filename: String,
    #[serde(default)]
    pub mime_type: String,
    pub size: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayPeerPayload {
    installation_id: String,
    #[serde(default)]
    device_name: String,
    #[serde(default)]
    os: String,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    online: bool,
    #[serde(default)]
    allow_incoming: bool,
    #[serde(default)]
    rtt_ms: Option<i64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayControlFrame {
    #[serde(rename = "type")]
    frame_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ticket: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    allow_incoming: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rtt_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    req_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    src_iid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dst_iid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    arguments: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    attachments: Vec<AttachmentDescriptor>,
    #[serde(default)]
    is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    #[serde(default)]
    devices: Vec<RelayPeerPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp_ms: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct RemoteToolOutput {
    pub result_json: Value,
    pub is_error: bool,
    pub attachment_paths: Vec<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct IncomingToolRequest {
    pub req_id: String,
    pub src_iid: String,
    pub tool_name: String,
    pub arguments: Value,
    pub client_name: String,
    pub session_id: String,
}

pub type LocalToolExecutor = Arc<
    dyn Fn(IncomingToolRequest, CancellationToken) -> BoxFuture<'static, Result<RemoteToolOutput, String>>
        + Send
        + Sync,
>;

#[derive(Debug)]
struct PendingForward {
    tx: oneshot::Sender<Result<Value, (String, String)>>,
}

/// Manages the outbound WebSocket tunnel to the Go Relay Server,同账号设备列表,
/// transparent remote MCP forwarding, and local attachment materialization.
pub struct RerouteService {
    browserclaw_dir: PathBuf,
    settings_path: PathBuf,
    account_bridge: Arc<AccountBridgeService>,
    settings: RwLock<RerouteSettings>,
    peers: RwLock<Vec<ReroutePeerDevice>>,
    relay_connected: AtomicBool,
    outbound_tx: RwLock<Option<mpsc::Sender<Message>>>,
    pending_forwards: Mutex<HashMap<String, PendingForward>>,
    incoming_cancels: Mutex<HashMap<String, CancellationToken>>,
    received_chunks: Mutex<HashMap<Uuid, Vec<u8>>>,
    tool_executor: std::sync::RwLock<Option<LocalToolExecutor>>,
    connect_lock: Mutex<()>,
    ticket_endpoint: Option<String>,
    http: reqwest::Client,
    cached_ticket: RwLock<Option<CachedRelayTicket>>,
}

impl RerouteService {
    #[must_use]
    pub fn new(browserclaw_dir: &Path, account_bridge: Arc<AccountBridgeService>) -> Self {
        let settings_path = browserclaw_dir.join(SETTINGS_FILENAME);
        let settings = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<RerouteSettings>(&raw).ok())
            .unwrap_or_default();
        let ticket_endpoint = match env::var("REBROWSER_REROUTE_TICKET_URL") {
            Ok(value) => {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            }
            Err(_) => Some(DEFAULT_TICKET_ENDPOINT.to_string()),
        };
        Self {
            browserclaw_dir: browserclaw_dir.to_path_buf(),
            settings_path,
            account_bridge,
            settings: RwLock::new(settings),
            peers: RwLock::new(Vec::new()),
            relay_connected: AtomicBool::new(false),
            outbound_tx: RwLock::new(None),
            pending_forwards: Mutex::new(HashMap::new()),
            incoming_cancels: Mutex::new(HashMap::new()),
            received_chunks: Mutex::new(HashMap::new()),
            tool_executor: std::sync::RwLock::new(None),
            connect_lock: Mutex::new(()),
            ticket_endpoint,
            http: reqwest::Client::new(),
            cached_ticket: RwLock::new(None),
        }
    }

    pub fn set_tool_executor(&self, executor: LocalToolExecutor) {
        if let Ok(mut guard) = self.tool_executor.write() {
            *guard = Some(executor);
        }
    }

    pub async fn target_device_id(&self) -> Option<String> {
        self.settings.read().await.target_device_id.clone()
    }

    pub async fn allow_incoming_reroute(&self) -> bool {
        self.settings.read().await.allow_incoming_reroute
    }

    pub async fn set_preferences(&self, allow_incoming: bool) -> AppResult<RerouteState> {
        {
            let mut settings = self.settings.write().await;
            settings.allow_incoming_reroute = allow_incoming;
            self.persist_settings(&settings).await?;
        }
        self.send_control_frame(RelayControlFrame {
            frame_type: "set_preferences".to_string(),
            allow_incoming: Some(allow_incoming),
            ..Default::default()
        })
        .await;
        Ok(self.get_state().await)
    }

    pub async fn set_target_device(&self, target_device_id: Option<String>) -> AppResult<RerouteState> {
        let normalized = target_device_id
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty());
        let bridge = self.account_bridge.read_snapshot().await;
        if let Some(ref target) = normalized
            && target != &bridge.installation_id
        {
            if !bridge.signed_in {
                return Err(AppError::unauthorized(
                    "Sign in to your Remocode account to use cross-device reroute.",
                ));
            }
            if !bridge.is_pro() {
                return Err(AppError::forbidden(
                    "Upgrade to reBrowser Pro to reroute MCP calls across devices.",
                ));
            }
        }
        {
            let mut settings = self.settings.write().await;
            settings.target_device_id = normalized.filter(|id| id != &bridge.installation_id);
            self.persist_settings(&settings).await?;
        }
        Ok(self.get_state().await)
    }

    pub async fn get_state(&self) -> RerouteState {
        let bridge = self.account_bridge.read_snapshot().await;
        let settings = self.settings.read().await.clone();
        let peers = self.peers.read().await.clone();
        let target_device_name = settings.target_device_id.as_ref().and_then(|target_id| {
            peers
                .iter()
                .find(|peer| peer.installation_id == *target_id)
                .map(|peer| peer.device_name.clone())
        });
        let self_name = if bridge.device_name.is_empty() {
            "This Device".to_string()
        } else {
            bridge.device_name.clone()
        };
        RerouteState {
            signed_in: bridge.signed_in,
            email: bridge.email.clone(),
            display_name: bridge.display_name.clone(),
            entitlement: bridge.entitlement.clone(),
            vip_expires_at: bridge.vip_expires_at,
            is_pro: bridge.is_pro(),
            self_installation_id: bridge.installation_id.clone(),
            self_device_name: self_name,
            allow_incoming_reroute: settings.allow_incoming_reroute,
            target_device_id: settings.target_device_id,
            target_device_name,
            relay_connected: self.relay_connected.load(Ordering::SeqCst),
            devices: peers,
        }
    }

    /// Ensures the outbound WebSocket connection to the Go Relay is active
    /// whenever a signed-in bridge ticket is configured or can be minted.
    pub async fn sync_relay_connection(self: &Arc<Self>, shutdown: CancellationToken) -> AppResult<()> {
        let _guard = self.connect_lock.lock().await;
        let bridge = self.account_bridge.read_snapshot().await;
        if !bridge.signed_in {
            *self.cached_ticket.write().await = None;
            self.disconnect_internal().await;
            return Ok(());
        }
        let Some((relay_url, ticket)) = self.resolve_relay_ticket(&bridge).await else {
            return Ok(());
        };
        if self.relay_connected.load(Ordering::SeqCst) {
            self.send_control_frame(RelayControlFrame {
                frame_type: "update_ticket".to_string(),
                ticket: Some(ticket),
                ..Default::default()
            })
            .await;
            return Ok(());
        }
        self.connect_internal(&relay_url, &ticket, &bridge, shutdown).await
    }

    async fn resolve_relay_ticket(&self, bridge: &AccountBridgeSnapshot) -> Option<(String, String)> {
        let now_ms = now_epoch_ms();
        let bridge_valid = bridge
            .relay_ticket_expires_at
            .is_none_or(|exp| exp > now_ms + TICKET_REFRESH_MARGIN_MS);
        if bridge_valid
            && let (Some(url), Some(ticket)) = (bridge.relay_url.as_deref(), bridge.relay_ticket.as_deref())
            && !url.is_empty()
            && !ticket.is_empty()
        {
            return Some((url.to_string(), ticket.to_string()));
        }

        if let Some(cached) = self.cached_ticket.read().await.as_ref()
            && cached.installation_id == bridge.installation_id
            && cached.expires_at > now_ms + TICKET_REFRESH_MARGIN_MS
        {
            return Some((cached.relay_url.clone(), cached.ticket.clone()));
        }

        let endpoint = self.ticket_endpoint.as_deref()?;
        if bridge.installation_id.is_empty() {
            return None;
        }
        let auth_token = env::var("REBROWSER_REROUTE_AUTH_TOKEN")
            .ok()
            .filter(|v| !v.trim().is_empty())?;
        let req_body = serde_json::json!({
            "installationId": bridge.installation_id,
            "deviceName": bridge.device_name,
            "os": bridge.os,
            "appVersion": env!("CARGO_PKG_VERSION"),
        });
        let resp = match self
            .http
            .post(endpoint)
            .bearer_auth(auth_token)
            .json(&req_body)
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(error) => {
                warn!(error = %error, "failed to fetch reroute relay ticket");
                return None;
            }
        };
        if !resp.status().is_success() {
            warn!(status = %resp.status(), "reroute ticket endpoint returned non-success status");
            return None;
        }
        let issued = match resp.json::<IssueTicketPayload>().await {
            Ok(payload) => payload,
            Err(error) => {
                warn!(error = %error, "invalid reroute ticket response payload");
                return None;
            }
        };
        if issued.relay_url.is_empty() || issued.ticket.is_empty() {
            return None;
        }
        let cached = CachedRelayTicket {
            installation_id: bridge.installation_id.clone(),
            relay_url: issued.relay_url.clone(),
            ticket: issued.ticket.clone(),
            expires_at: issued.expires_at,
        };
        *self.cached_ticket.write().await = Some(cached);
        Some((issued.relay_url, issued.ticket))
    }

    pub fn spawn_background_loop(self: &Arc<Self>, shutdown: CancellationToken) -> tokio::task::JoinHandle<()> {
        let this = Arc::clone(self);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            loop {
                tokio::select! {
                    () = shutdown.cancelled() => {
                        this.disconnect_internal().await;
                        return;
                    }
                    _ = interval.tick() => {
                        if let Err(error) = this.sync_relay_connection(shutdown.child_token()).await {
                            warn!(error = %error, "reroute relay sync attempt failed");
                        }
                    }
                }
            }
        })
    }

    async fn connect_internal(
        self: &Arc<Self>,
        relay_url: &str,
        ticket: &str,
        bridge: &AccountBridgeSnapshot,
        shutdown: CancellationToken,
    ) -> AppResult<()> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let separator = if relay_url.contains('?') { '&' } else { '?' };
        let ws_url = format!("{relay_url}{separator}ticket={ticket}");
        let (stream, _) = connect_async(&ws_url)
            .await
            .map_err(|error| AppError::unavailable(format!("relay connection failed: {error}")))?;
        let (mut sink, mut source) = stream.split();
        let (tx, mut rx) = mpsc::channel::<Message>(128);

        let allow_incoming = self.settings.read().await.allow_incoming_reroute;
        let hello = RelayControlFrame {
            frame_type: "hello".to_string(),
            allow_incoming: Some(allow_incoming),
            ..Default::default()
        };
        if let Ok(hello_json) = serde_json::to_string(&hello) {
            let _ = tx.send(Message::Text(hello_json.into())).await;
        }

        *self.outbound_tx.write().await = Some(tx);
        self.relay_connected.store(true, Ordering::SeqCst);
        info!(relay_url, "connected to reBrowser reroute relay");

        let self_iid = bridge.installation_id.clone();
        let this_writer = Arc::clone(self);
        let shutdown_writer = shutdown.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    () = shutdown_writer.cancelled() => break,
                    maybe_msg = rx.recv() => {
                        let Some(msg) = maybe_msg else { break; };
                        if sink.send(msg).await.is_err() {
                            break;
                        }
                    }
                }
            }
            this_writer.relay_connected.store(false, Ordering::SeqCst);
        });

        let this_reader = Arc::clone(self);
        tokio::spawn(async move {
            while let Some(item) = source.next().await {
                match item {
                    Ok(Message::Text(text)) => {
                        if let Ok(frame) = serde_json::from_str::<RelayControlFrame>(&text) {
                            this_reader.handle_inbound_frame(frame, &self_iid).await;
                        }
                    }
                    Ok(Message::Binary(bytes)) => {
                        this_reader.handle_inbound_binary(&bytes).await;
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    Ok(_) => {}
                }
            }
            this_reader.disconnect_internal().await;
        });

        Ok(())
    }

    async fn disconnect_internal(&self) {
        self.relay_connected.store(false, Ordering::SeqCst);
        *self.outbound_tx.write().await = None;
        self.peers.write().await.clear();
        let mut pending = self.pending_forwards.lock().await;
        for (_, waiter) in pending.drain() {
            let _ = waiter.tx.send(Err((
                "ERR_RELAY_DISCONNECTED".to_string(),
                "Relay connection closed".to_string(),
            )));
        }
    }

    async fn send_control_frame(&self, frame: RelayControlFrame) {
        let Some(tx) = self.outbound_tx.read().await.clone() else {
            return;
        };
        if let Ok(encoded) = serde_json::to_string(&frame) {
            let _ = tx.send(Message::Text(encoded.into())).await;
        }
    }

    async fn send_binary_frame(&self, bytes: Vec<u8>) -> bool {
        let Some(tx) = self.outbound_tx.read().await.clone() else {
            return false;
        };
        tx.send(Message::Binary(bytes.into())).await.is_ok()
    }

    async fn handle_inbound_binary(&self, bytes: &[u8]) {
        if bytes.len() < 19 || bytes[0] != BINARY_FILE_CHUNK_MARKER {
            return;
        }
        let Ok(uuid_bytes) = <[u8; 16]>::try_from(&bytes[1..17]) else {
            return;
        };
        let transfer_id = Uuid::from_bytes(uuid_bytes);
        let dst_len = usize::from(bytes[17]);
        let header_end = 18 + dst_len;
        if dst_len == 0 || bytes.len() < header_end {
            return;
        }
        let chunk = &bytes[header_end..];
        let mut map = self.received_chunks.lock().await;
        map.entry(transfer_id).or_default().extend_from_slice(chunk);
    }

    async fn handle_inbound_frame(self: &Arc<Self>, frame: RelayControlFrame, self_iid: &str) {
        match frame.frame_type.as_str() {
            "presence_snapshot" => {
                let mapped = frame
                    .devices
                    .into_iter()
                    .map(|dev| {
                        let is_self = dev.installation_id == self_iid;
                        ReroutePeerDevice {
                            installation_id: dev.installation_id,
                            device_name: dev.device_name,
                            os: dev.os,
                            app_version: dev.app_version,
                            online: dev.online,
                            allow_incoming: dev.allow_incoming,
                            rtt_ms: dev.rtt_ms,
                            is_self,
                        }
                    })
                    .collect();
                *self.peers.write().await = mapped;
            }
            "mcp_response" => {
                let Some(req_id) = frame.req_id.clone() else {
                    return;
                };
                let mut value = frame.result.unwrap_or(Value::Null);
                if !frame.is_error && !frame.attachments.is_empty() {
                    let session_dir = frame.session_id.as_deref().unwrap_or("default");
                    if let Err(error) = self
                        .materialize_attachments_and_rewrite(
                            session_dir,
                            &frame.attachments,
                            &mut value,
                        )
                        .await
                    {
                        warn!(error = %error, "failed to materialize remote attachments");
                    }
                }
                if let Some(waiter) = self.pending_forwards.lock().await.remove(&req_id) {
                    if frame.is_error {
                        let code = frame.error_code.unwrap_or_else(|| "ERR_REMOTE".to_string());
                        let msg = frame
                            .error_message
                            .unwrap_or_else(|| "Remote tool call failed".to_string());
                        let _ = waiter.tx.send(Err((code, msg)));
                    } else {
                        let _ = waiter.tx.send(Ok(value));
                    }
                }
            }
            "mcp_cancel" => {
                if let Some(req_id) = frame.req_id
                    && let Some(token) = self.incoming_cancels.lock().await.remove(&req_id)
                {
                    token.cancel();
                }
            }
            "mcp_request" => {
                let Some(req_id) = frame.req_id else {
                    return;
                };
                let Some(src_iid) = frame.src_iid else {
                    return;
                };
                let Some(tool_name) = frame.tool_name else {
                    return;
                };
                let this = Arc::clone(self);
                let req = IncomingToolRequest {
                    req_id: req_id.clone(),
                    src_iid: src_iid.clone(),
                    tool_name,
                    arguments: frame.arguments.unwrap_or(Value::Null),
                    client_name: frame.client_name.unwrap_or_else(|| "remote-agent".to_string()),
                    session_id: frame.session_id.unwrap_or_else(|| "remote".to_string()),
                };
                tokio::spawn(async move {
                    this.execute_incoming_request(req).await;
                });
            }
            _ => {}
        }
    }

    async fn execute_incoming_request(&self, req: IncomingToolRequest) {
        if !self.settings.read().await.allow_incoming_reroute {
            self.send_control_frame(RelayControlFrame {
                frame_type: "mcp_response".to_string(),
                req_id: Some(req.req_id),
                dst_iid: Some(req.src_iid),
                is_error: true,
                error_code: Some("ERR_INCOMING_DISABLED".to_string()),
                error_message: Some("Target device has disabled incoming remote reroute.".to_string()),
                ..Default::default()
            })
            .await;
            return;
        }
        let executor = self
            .tool_executor
            .read()
            .ok()
            .and_then(|guard| guard.clone());
        let Some(executor) = executor else {
            self.send_control_frame(RelayControlFrame {
                frame_type: "mcp_response".to_string(),
                req_id: Some(req.req_id),
                dst_iid: Some(req.src_iid),
                is_error: true,
                error_code: Some("ERR_NO_EXECUTOR".to_string()),
                error_message: Some("Remote executor is not initialized.".to_string()),
                ..Default::default()
            })
            .await;
            return;
        };

        let cancel = CancellationToken::new();
        self.incoming_cancels
            .lock()
            .await
            .insert(req.req_id.clone(), cancel.clone());
        let outcome = executor(req.clone(), cancel).await;
        self.incoming_cancels.lock().await.remove(&req.req_id);

        match outcome {
            Ok(output) => {
                let mut attachments = Vec::new();
                for path in &output.attachment_paths {
                    if let Ok(bytes) = tokio::fs::read(path).await {
                        let attachment_id = Uuid::new_v4();
                        let filename = path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("attachment.bin")
                            .to_string();
                        let sent = self
                            .send_attachment_chunks(attachment_id, &req.src_iid, &bytes)
                            .await;
                        if sent {
                            attachments.push(AttachmentDescriptor {
                                attachment_id: attachment_id.to_string(),
                                original_path: path.to_string_lossy().into_owned(),
                                filename,
                                mime_type: guess_mime(path),
                                size: bytes.len() as i64,
                            });
                        }
                    }
                }
                self.send_control_frame(RelayControlFrame {
                    frame_type: "mcp_response".to_string(),
                    req_id: Some(req.req_id),
                    dst_iid: Some(req.src_iid),
                    session_id: Some(req.session_id),
                    result: Some(output.result_json),
                    attachments,
                    is_error: output.is_error,
                    ..Default::default()
                })
                .await;
            }
            Err(message) => {
                self.send_control_frame(RelayControlFrame {
                    frame_type: "mcp_response".to_string(),
                    req_id: Some(req.req_id),
                    dst_iid: Some(req.src_iid),
                    is_error: true,
                    error_code: Some("ERR_EXECUTION_FAILED".to_string()),
                    error_message: Some(message),
                    ..Default::default()
                })
                .await;
            }
        }
    }

    async fn send_attachment_chunks(&self, transfer_id: Uuid, dst_iid: &str, bytes: &[u8]) -> bool {
        let Ok(dst_len) = u8::try_from(dst_iid.len()) else {
            return false;
        };
        if dst_len == 0 {
            return false;
        }
        const CHUNK_SIZE: usize = 256 * 1024;
        for chunk in bytes.chunks(CHUNK_SIZE.max(1)) {
            let mut frame = Vec::with_capacity(18 + usize::from(dst_len) + chunk.len());
            frame.push(BINARY_FILE_CHUNK_MARKER);
            frame.extend_from_slice(transfer_id.as_bytes());
            frame.push(dst_len);
            frame.extend_from_slice(dst_iid.as_bytes());
            frame.extend_from_slice(chunk);
            if !self.send_binary_frame(frame).await {
                return false;
            }
        }
        if bytes.is_empty() {
            let mut frame = Vec::with_capacity(18 + usize::from(dst_len));
            frame.push(BINARY_FILE_CHUNK_MARKER);
            frame.extend_from_slice(transfer_id.as_bytes());
            frame.push(dst_len);
            frame.extend_from_slice(dst_iid.as_bytes());
            return self.send_binary_frame(frame).await;
        }
        true
    }

    async fn materialize_attachments_and_rewrite(
        &self,
        session_id: &str,
        attachments: &[AttachmentDescriptor],
        result_json: &mut Value,
    ) -> AppResult<()> {
        let safe_session: String = session_id
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
            .collect();
        let out_dir = self
            .browserclaw_dir
            .join("reroute-outputs")
            .join(if safe_session.is_empty() { "default" } else { &safe_session });
        tokio::fs::create_dir_all(&out_dir)
            .await
            .with_path(&out_dir)?;

        let mut replacements = Vec::with_capacity(attachments.len());
        for attachment in attachments {
            let Ok(transfer_id) = Uuid::parse_str(&attachment.attachment_id) else {
                continue;
            };
            let bytes = self
                .received_chunks
                .lock()
                .await
                .remove(&transfer_id)
                .unwrap_or_default();
            let clean_name = Path::new(&attachment.filename)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("output.bin");
            let local_path = out_dir.join(format!("{}-{}", transfer_id.simple(), clean_name));
            tokio::fs::write(&local_path, &bytes)
                .await
                .with_path(&local_path)?;
            replacements.push((
                attachment.original_path.clone(),
                local_path.to_string_lossy().into_owned(),
            ));
        }
        if !replacements.is_empty() {
            rewrite_paths_in_value(result_json, &replacements);
        }
        Ok(())
    }

    /// Forwards an MCP tool call to the specified remote installation_id.
    pub async fn forward_tool_call(
        &self,
        dst_iid: &str,
        tool_name: &str,
        arguments: Value,
        client_name: &str,
        session_id: &str,
        cancel: CancellationToken,
    ) -> Result<Value, (String, String)> {
        let bridge = self.account_bridge.read_snapshot().await;
        if !bridge.signed_in {
            return Err((
                "ERR_LOGIN_REQUIRED".to_string(),
                "Sign in to your Remocode account to use cross-device reroute.".to_string(),
            ));
        }
        if !bridge.is_pro() {
            return Err((
                "ERR_PRO_REQUIRED".to_string(),
                "Upgrade to reBrowser Pro to reroute MCP calls across devices.".to_string(),
            ));
        }
        if !self.relay_connected.load(Ordering::SeqCst) {
            return Err((
                "ERR_RELAY_OFFLINE".to_string(),
                "Cross-device relay is not connected.".to_string(),
            ));
        }

        let req_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending_forwards
            .lock()
            .await
            .insert(req_id.clone(), PendingForward { tx });

        self.send_control_frame(RelayControlFrame {
            frame_type: "mcp_request".to_string(),
            req_id: Some(req_id.clone()),
            dst_iid: Some(dst_iid.to_string()),
            tool_name: Some(tool_name.to_string()),
            arguments: Some(arguments),
            client_name: Some(client_name.to_string()),
            session_id: Some(session_id.to_string()),
            ..Default::default()
        })
        .await;

        tokio::select! {
            () = cancel.cancelled() => {
                self.pending_forwards.lock().await.remove(&req_id);
                self.send_control_frame(RelayControlFrame {
                    frame_type: "mcp_cancel".to_string(),
                    req_id: Some(req_id),
                    dst_iid: Some(dst_iid.to_string()),
                    ..Default::default()
                }).await;
                Err(("ERR_CANCELLED".to_string(), "Operation cancelled".to_string()))
            }
            () = tokio::time::sleep(MAX_FORWARD_TIMEOUT) => {
                self.pending_forwards.lock().await.remove(&req_id);
                Err(("ERR_TIMEOUT".to_string(), "Remote browser execution timed out".to_string()))
            }
            res = rx => {
                match res {
                    Ok(inner) => inner,
                    Err(_) => Err(("ERR_RELAY_CLOSED".to_string(), "Relay waiter closed".to_string())),
                }
            }
        }
    }

    async fn persist_settings(&self, settings: &RerouteSettings) -> AppResult<()> {
        if let Some(parent) = self.settings_path.parent() {
            tokio::fs::create_dir_all(parent).await.with_path(parent)?;
        }
        let encoded = serde_json::to_string_pretty(settings)?;
        tokio::fs::write(&self.settings_path, encoded)
            .await
            .with_path(&self.settings_path)?;
        Ok(())
    }
}

fn rewrite_paths_in_value(value: &mut Value, replacements: &[(String, String)]) {
    match value {
        Value::String(text) => {
            for (remote, local) in replacements {
                if text.contains(remote.as_str()) {
                    *text = text.replace(remote.as_str(), local.as_str());
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                rewrite_paths_in_value(item, replacements);
            }
        }
        Value::Object(map) => {
            for val in map.values_mut() {
                rewrite_paths_in_value(val, replacements);
            }
        }
        _ => {}
    }
}

fn guess_mime(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("pdf") => "application/pdf",
        Some("md") => "text/markdown",
        _ => "application/octet-stream",
    }
    .to_string()
}

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use claw_server_rust::{
    AppState, build_router,
    config::Config,
    db::audit_log::{RecordToolDispatchInput, bounded_args_json, result_meta},
    ids::DispatchId,
    services::{
        account_bridge::AccountBridgeSnapshot,
        reroute::{RemoteToolOutput, RerouteService},
        skills::{CreateSkill, SkillOrigin},
    },
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};
use tempfile::TempDir;
use tokio::{net::TcpListener, sync::Mutex};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;
use tower::ServiceExt;

struct TestApp {
    router: Router,
    _dir: TempDir,
    root: PathBuf,
    state: AppState,
}

async fn test_app() -> anyhow::Result<TestApp> {
    let dir = tempfile::tempdir()?;
    let root = dir.path().join("browserclaw");
    let config = Arc::new(Config {
        server_port: 9200,
        cdp_port: 49361,
        proxy_port: None,
        resources_dir: dir.path().join("resources"),
        browserclaw_dir: root.clone(),
        session_idle: Duration::from_secs(300),
        session_retention: Duration::from_secs(7_200),
        session_sweep_interval: Duration::from_secs(60),
        replay_retention_days: 7,
        dev_mode: false,
    });
    let state = AppState::new_with_home(config, dir.path().join("home")).await?;
    Ok(TestApp {
        router: build_router(state.clone()),
        _dir: dir,
        root,
        state,
    })
}

async fn request(
    router: &Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> anyhow::Result<(StatusCode, Value)> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::HOST, "localhost");
    let request_body = if let Some(body) = body {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let response = router.clone().oneshot(builder.body(request_body)?).await?;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok((status, value))
}

#[tokio::test]
async fn verified_skills_catalog_enforces_login_and_pro_gating() -> anyhow::Result<()> {
    let app = test_app().await?;
    let router = &app.router;

    // 1. Catalog is publicly readable with the 5 seeded verified skills.
    let (status, catalog) = request(router, "GET", "/api/v1/skills/catalog", None).await?;
    assert_eq!(status, StatusCode::OK);
    let items = catalog["items"].as_array().ok_or_else(|| anyhow::anyhow!("missing items"))?;
    assert_eq!(items.len(), 5);
    assert!(items.iter().all(|item| item["installed"] == false));

    // 2. Signed-out user gets 401 account_login_required on install.
    let (status, err) = request(
        router,
        "POST",
        "/api/v1/skills/catalog/wechat-default-draft/install",
        Some(json!({})),
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(err["code"], "account_login_required");

    // 3. Signed-in Free user can install free skills, but gets 403 on proOnly skills.
    app.state
        .account_bridge
        .write_primary_snapshot(&AccountBridgeSnapshot {
            version: 1,
            signed_in: true,
            email: "free@example.com".to_string(),
            display_name: "Free".to_string(),
            entitlement: "free".to_string(),
            vip_expires_at: None,
            installation_id: "inst-free".to_string(),
            device_name: "MacBook".to_string(),
            os: "macos".to_string(),
            relay_url: None,
            relay_ticket: None,
            relay_ticket_expires_at: None,
        })
        .await?;

    let (status, installed) = request(
        router,
        "POST",
        "/api/v1/skills/catalog/wechat-default-draft/install",
        Some(json!({})),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(installed["installed"], true);
    assert_eq!(installed["skill"]["name"], "neo-wechat-default-draft");
    assert!(
        app.root
            .join("skills/neo-wechat-default-draft/SKILL.md")
            .is_file()
    );

    let (status, catalog_after) = request(router, "GET", "/api/v1/skills/catalog", None).await?;
    assert_eq!(status, StatusCode::OK);
    let wechat = catalog_after["items"]
        .as_array()
        .and_then(|arr| arr.iter().find(|i| i["id"] == "wechat-default-draft"))
        .ok_or_else(|| anyhow::anyhow!("missing wechat item"))?;
    assert_eq!(wechat["installed"], true);

    let (status, err) = request(
        router,
        "POST",
        "/api/v1/skills/catalog/multiplatform-content-matrix/install",
        Some(json!({})),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(err["code"], "pro_subscription_required");

    // 4. Pro user can install proOnly skill.
    app.state
        .account_bridge
        .write_primary_snapshot(&AccountBridgeSnapshot {
            version: 1,
            signed_in: true,
            email: "pro@example.com".to_string(),
            display_name: "Pro".to_string(),
            entitlement: "active".to_string(),
            vip_expires_at: Some(4_000_000_000_000),
            installation_id: "inst-pro".to_string(),
            device_name: "MacBook".to_string(),
            os: "macos".to_string(),
            relay_url: None,
            relay_ticket: None,
            relay_ticket_expires_at: None,
        })
        .await?;

    let (status, pro_installed) = request(
        router,
        "POST",
        "/api/v1/skills/catalog/multiplatform-content-matrix/install",
        Some(json!({})),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        pro_installed["skill"]["name"],
        "neo-multiplatform-content-matrix"
    );
    Ok(())
}

#[tokio::test]
async fn skill_contributor_sanitizes_and_deduplicates_after_two_clean_runs() -> anyhow::Result<()> {
    let app = test_app().await?;
    app.state
        .skills
        .create(CreateSkill {
            name: "neo-wechat-test".to_string(),
            description: "Draft by alice@example.com".to_string(),
            site: Some("mp.weixin.qq.com".to_string()),
            steps: vec![
                "Open /Users/alice/Desktop/article.html with sk-secret1234567890".to_string(),
            ],
            learned_notes: vec![],
            origin: SkillOrigin::Agent,
            source_session_id: None,
        })
        .await?;

    // Record 2 clean runs
    for idx in 1..=2 {
        let session_id = format!("sess-{idx}");
        app.state
            .audit_log
            .record_session_start(
                &session_id,
                "convo-run",
                "codex",
                "codex/inbox",
                "codex",
                "1",
            )
            .await?;
        app.state
            .audit_log
            .record_tool_dispatch(RecordToolDispatchInput {
                agent_id: "convo-run".to_string(),
                slug: "codex".to_string(),
                agent_label: "codex/inbox".to_string(),
                session_id: session_id.clone(),
                tool_name: "run".to_string(),
                page_id: None,
                tab_id: None,
                target_id: None,
                url: Some("https://mp.weixin.qq.com/".to_string()),
                title: None,
                args_json: bounded_args_json(&json!({})),
                result_meta: result_meta(false, false, &json!({}), 0),
                duration_ms: 100,
                created_at: None,
                dispatch_id: DispatchId::new(),
                parent_dispatch_id: None,
                tool_input_token_estimate: 100,
                tool_output_token_estimate: 50,
                token_estimator_version: 1,
            })
            .await?;
        app.state
            .audit_log
            .record_session_end(&session_id, "closed", None)
            .await?;
        app.state
            .skill_runs
            .mark(&session_id, "neo-wechat-test")
            .await?;
        assert!(app.state.skill_runs.finalize(&session_id).await?);
    }

    let contributed = app
        .state
        .skill_contributor
        .evaluate_and_contribute("neo-wechat-test")
        .await?
        .ok_or_else(|| anyhow::anyhow!("expected sanitized contribution"))?;
    assert!(!contributed.body.contains("alice"));
    assert!(!contributed.body.contains("sk-secret"));
    assert!(contributed.body.contains("<LOCAL_USER_HOME>"));
    assert!(contributed.description.contains("<EMAIL>"));
    assert!(
        app.root
            .join("contributed-skills/neo-wechat-test.json")
            .is_file()
    );

    // Repeating with unchanged content deduplicates via last_contributed_hash.
    assert!(
        app.state
            .skill_contributor
            .evaluate_and_contribute("neo-wechat-test")
            .await?
            .is_none()
    );
    Ok(())
}

#[tokio::test]
async fn cross_device_reroute_forwards_calls_and_materializes_binary_files() -> anyhow::Result<()> {
    // Spin up an in-process mock Go Relay WebSocket hub.
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let relay_url = format!("ws://{addr}/v1/tunnel");

    type PeerMap = Arc<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Message>>>>;
    let peers: PeerMap = Arc::new(Mutex::new(HashMap::new()));

    let server_peers = peers.clone();
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let peers = server_peers.clone();
            tokio::spawn(async move {
                let Ok(ws) = accept_async(stream).await else {
                    return;
                };
                let (mut sink, mut source) = ws.split();
                let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
                let iid = Arc::new(Mutex::new(String::new()));

                let writer = tokio::spawn(async move {
                    while let Some(msg) = rx.recv().await {
                        if sink.send(msg).await.is_err() {
                            break;
                        }
                    }
                });

                while let Some(Ok(msg)) = source.next().await {
                    match msg {
                        Message::Text(text) => {
                            let Ok(mut val) = serde_json::from_str::<Value>(&text) else {
                                continue;
                            };
                            match val["type"].as_str() {
                                Some("hello") => {
                                    // Extract iid from first message or allow_incoming ack;
                                    // test uses query `?ticket=<iid>` as device id.
                                }
                                Some("mcp_request" | "mcp_response" | "mcp_cancel") => {
                                    let src = iid.lock().await.clone();
                                    if let Some(dst) = val["dstIid"].as_str().map(str::to_string) {
                                        val["srcIid"] = Value::String(src);
                                        if let Some(target_tx) = peers.lock().await.get(&dst) {
                                            let _ = target_tx
                                                .send(Message::Text(val.to_string().into()));
                                        }
                                    }
                                }
                                _ => {}
                            }
                            if iid.lock().await.is_empty() {
                                let assigned = if peers.lock().await.is_empty() {
                                    "device-a"
                                } else {
                                    "device-b"
                                };
                                *iid.lock().await = assigned.to_string();
                                peers.lock().await.insert(assigned.to_string(), tx.clone());
                                let snapshot = json!({
                                    "type": "presence_snapshot",
                                    "devices": peers.lock().await.keys().map(|k| json!({
                                        "installationId": k,
                                        "deviceName": k,
                                        "os": "macos",
                                        "appVersion": "0.1.5",
                                        "online": true,
                                        "allowIncoming": true,
                                        "rttMs": 12
                                    })).collect::<Vec<_>>()
                                });
                                for peer_tx in peers.lock().await.values() {
                                    let _ = peer_tx
                                        .send(Message::Text(snapshot.to_string().into()));
                                }
                            }
                        }
                        Message::Binary(bin) => {
                            if bin.len() >= 19 && bin[0] == 0x01 {
                                let dst_len = usize::from(bin[17]);
                                if bin.len() >= 18 + dst_len
                                    && let Ok(dst) = std::str::from_utf8(&bin[18..18 + dst_len])
                                    && let Some(target_tx) = peers.lock().await.get(dst)
                                {
                                    let _ = target_tx.send(Message::Binary(bin));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                writer.abort();
            });
        }
    });

    let app_a = test_app().await?;
    let app_b = test_app().await?;
    let shutdown = CancellationToken::new();

    app_a
        .state
        .account_bridge
        .write_primary_snapshot(&AccountBridgeSnapshot {
            version: 1,
            signed_in: true,
            email: "pro@example.com".to_string(),
            display_name: "Pro".to_string(),
            entitlement: "active".to_string(),
            vip_expires_at: Some(4_000_000_000_000),
            installation_id: "device-a".to_string(),
            device_name: "MacBook Pro".to_string(),
            os: "macos".to_string(),
            relay_url: Some(relay_url.clone()),
            relay_ticket: Some("ticket-a".to_string()),
            relay_ticket_expires_at: Some(4_000_000_000_000),
        })
        .await?;

    app_b
        .state
        .account_bridge
        .write_primary_snapshot(&AccountBridgeSnapshot {
            version: 1,
            signed_in: true,
            email: "pro@example.com".to_string(),
            display_name: "Pro".to_string(),
            entitlement: "active".to_string(),
            vip_expires_at: Some(4_000_000_000_000),
            installation_id: "device-b".to_string(),
            device_name: "Home Mac Studio".to_string(),
            os: "macos".to_string(),
            relay_url: Some(relay_url),
            relay_ticket: Some("ticket-b".to_string()),
            relay_ticket_expires_at: Some(4_000_000_000_000),
        })
        .await?;

    // Register a custom executor on Device B that creates a PNG file and returns its path.
    let remote_png_dir = app_b.root.join("tmp-shots");
    tokio::fs::create_dir_all(&remote_png_dir).await?;
    let remote_png = remote_png_dir.join("shot.png");
    tokio::fs::write(&remote_png, b"\x89PNG-REMOTE-PAYLOAD").await?;
    let remote_png_for_closure = remote_png.clone();
    app_b.state.reroute.set_tool_executor(Arc::new(move |_req, _cancel| {
        let path = remote_png_for_closure.clone();
        Box::pin(async move {
            Ok(RemoteToolOutput {
                result_json: json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Saved screenshot to {}", path.display())
                    }],
                    "isError": false
                }),
                is_error: false,
                attachment_paths: vec![path],
            })
        })
    }));

    app_a
        .state
        .reroute
        .sync_relay_connection(shutdown.child_token())
        .await?;
    app_b
        .state
        .reroute
        .sync_relay_connection(shutdown.child_token())
        .await?;
    tokio::time::sleep(Duration::from_millis(120)).await;

    let (status, reroute_state) =
        request(&app_a.router, "GET", "/api/v1/reroute/state", None).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reroute_state["relayConnected"], true);
    assert_eq!(
        reroute_state["devices"].as_array().map(Vec::len),
        Some(2)
    );

    let (status, updated) = request(
        &app_a.router,
        "PUT",
        "/api/v1/reroute/target",
        Some(json!({ "targetDeviceId": "device-b" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["targetDeviceId"], "device-b");

    let forwarded: Value = RerouteService::forward_tool_call(
        &app_a.state.reroute,
        "device-b",
        "screenshot",
        json!({}),
        "claude-code",
        "sess-remote-1",
        CancellationToken::new(),
    )
    .await
    .map_err(|(code, msg)| anyhow::anyhow!("{code}: {msg}"))?;

    let text = forwarded["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing text"))?;
    assert!(!text.contains(&remote_png.to_string_lossy().into_owned()));
    let materialized_path = text
        .strip_prefix("Saved screenshot to ")
        .ok_or_else(|| anyhow::anyhow!("unexpected text format: {text}"))?;
    let bytes = tokio::fs::read(materialized_path).await?;
    assert_eq!(bytes, b"\x89PNG-REMOTE-PAYLOAD");

    shutdown.cancel();
    Ok(())
}

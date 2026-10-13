pub mod dispatch;
pub mod distill;
pub mod effects;
pub mod guards;
pub mod helper_runtime;
pub mod naming;
pub mod observers;
mod prompt;
pub mod script_hook;
mod service;
mod timeouts;

#[cfg(test)]
pub mod test_support;

use crate::{AppState, services::sessions::RetainedGroupAction};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager,
    tower::{StreamableHttpServerConfig, StreamableHttpService},
};
use std::sync::Arc;

pub use service::ClawMcpService;
// Re-exported so the route tests assert against the real text instead of keeping a
// copy of it, which is what let the two drift apart.
pub use service::SESSION_ARG_DESCRIPTION;

/// Builds the shared MCP service used by both streamable HTTP and stdio.
#[must_use]
pub fn browser_mcp_service(state: AppState) -> ClawMcpService {
    let browser = Arc::downgrade(&state.browser);
    state
        .sessions
        .set_retained_group_hook(Arc::new(move |ownership, key, action| {
            let browser = browser.clone();
            Box::pin(async move {
                let session = match browser.upgrade() {
                    Some(browser) => browser.session().await,
                    None => None,
                };
                match action {
                    RetainedGroupAction::Collapse => {
                        effects::tab_groups::collapse_agent_tab_group(
                            session.as_ref(),
                            &ownership,
                            &key,
                        )
                        .await
                    }
                    RetainedGroupAction::Close => {
                        effects::tab_groups::close_agent_tab_group(
                            session.as_ref(),
                            &ownership,
                            &key,
                        )
                        .await
                    }
                }
            })
        }));
    ClawMcpService::new(state)
}

/// Builds the rmcp streamable HTTP service mounted at `/mcp`.
#[must_use]
pub fn streamable_http_service(
    state: AppState,
) -> StreamableHttpService<ClawMcpService, LocalSessionManager> {
    streamable_http_service_with_manager(state, Arc::new(local_session_manager(HTTP_SESSION_IDLE)))
}

// Transport inactivity is separate from the 30-minute business-session idle sweep.
// Keep the transport through long thinking gaps, but still reclaim abandoned workers.
const HTTP_SESSION_IDLE: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

fn local_session_manager(keep_alive: std::time::Duration) -> LocalSessionManager {
    let mut manager = LocalSessionManager::default();
    manager.session_config.keep_alive = Some(keep_alive);
    manager
}

fn streamable_http_service_with_manager(
    state: AppState,
    manager: Arc<LocalSessionManager>,
) -> StreamableHttpService<ClawMcpService, LocalSessionManager> {
    StreamableHttpService::new(
        move || Ok(browser_mcp_service(state.clone())),
        manager,
        StreamableHttpServerConfig::default(),
    )
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Request, Response, StatusCode},
    };
    use serde_json::{Value, json};
    use std::time::Duration;
    use tower::ServiceExt;

    fn router(state: AppState, manager: Arc<LocalSessionManager>) -> Router {
        Router::new().route_service("/mcp", streamable_http_service_with_manager(state, manager))
    }

    async fn request(
        router: &Router,
        method: &str,
        session: Option<&str>,
        body: Option<Value>,
    ) -> anyhow::Result<Response<Body>> {
        let mut request = Request::builder()
            .method(method)
            .uri("/mcp")
            .header("host", "localhost")
            .header("accept", "application/json, text/event-stream");
        if let Some(session) = session {
            request = request
                .header("mcp-session-id", session)
                .header("mcp-protocol-version", "2025-06-18");
        }
        let body = if let Some(body) = body {
            request = request.header("content-type", "application/json");
            Body::from(body.to_string())
        } else {
            Body::empty()
        };
        Ok(router.clone().oneshot(request.body(body)?).await?)
    }

    async fn list(router: &Router, session: &str) -> anyhow::Result<StatusCode> {
        let response = request(
            router,
            "POST",
            Some(session),
            Some(json!({
                "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
            })),
        )
        .await?;
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await?;
        if status == StatusCode::OK {
            // Await the result, not just the response headers: this is the worker-ready barrier.
            assert!(std::str::from_utf8(&bytes)?.contains("\"tools\""));
        } else if status == StatusCode::NOT_FOUND {
            assert!(std::str::from_utf8(&bytes)?.contains("Session not found"));
        }
        tokio::task::yield_now().await;
        Ok(status)
    }

    async fn initialize(router: &Router) -> anyhow::Result<String> {
        let response = request(
            router,
            "POST",
            None,
            Some(json!({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": { "protocolVersion": "2025-06-18", "capabilities": {},
                    "clientInfo": { "name": "transport-test", "version": "1" } }
            })),
        )
        .await?;
        assert_eq!(response.status(), StatusCode::OK);
        let session = response
            .headers()
            .get("mcp-session-id")
            .ok_or_else(|| anyhow::anyhow!("missing transport id"))?
            .to_str()?
            .to_string();
        to_bytes(response.into_body(), usize::MAX).await?;
        let response = request(
            router,
            "POST",
            Some(&session),
            Some(json!({
                "jsonrpc": "2.0", "method": "notifications/initialized"
            })),
        )
        .await?;
        assert_eq!(response.status(), StatusCode::ACCEPTED);
        assert_eq!(list(router, &session).await?, StatusCode::OK);
        Ok(session)
    }

    async fn expired(manager: &LocalSessionManager) {
        for _ in 0..100 {
            if manager.sessions.read().await.is_empty() {
                return;
            }
            tokio::task::yield_now().await;
        }
        panic!("expired transport worker was not removed");
    }

    #[tokio::test]
    async fn default_transport_survives_five_minutes_and_activity_refreshes_expiry()
    -> anyhow::Result<()> {
        let call = test_support::tool_call("tabs", json!({})).await?;
        let manager = Arc::new(local_session_manager(HTTP_SESSION_IDLE));
        assert_eq!(
            manager.session_config.keep_alive,
            Some(Duration::from_secs(86_400))
        );
        let router = router(call.state.clone(), manager.clone());
        let session = initialize(&router).await?;
        tokio::time::pause();
        tokio::time::advance(Duration::from_secs(301)).await;
        assert_eq!(list(&router, &session).await?, StatusCode::OK);
        tokio::time::advance(HTTP_SESSION_IDLE - Duration::from_secs(1)).await;
        assert_eq!(list(&router, &session).await?, StatusCode::OK);
        tokio::time::advance(HTTP_SESSION_IDLE + Duration::from_secs(1)).await;
        expired(&manager).await;
        assert_eq!(list(&router, &session).await?, StatusCode::NOT_FOUND);
        Ok(())
    }

    #[tokio::test]
    async fn rmcp_default_reproduces_five_minute_expiry() -> anyhow::Result<()> {
        let call = test_support::tool_call("tabs", json!({})).await?;
        let manager = Arc::new(LocalSessionManager::default());
        assert_eq!(
            manager.session_config.keep_alive,
            Some(Duration::from_secs(300))
        );
        let router = router(call.state.clone(), manager.clone());
        let session = initialize(&router).await?;
        tokio::time::pause();
        tokio::time::advance(Duration::from_secs(301)).await;
        expired(&manager).await;
        assert_eq!(list(&router, &session).await?, StatusCode::NOT_FOUND);
        Ok(())
    }

    #[tokio::test]
    async fn sse_disconnect_reconnect_preserves_id_but_does_not_prevent_expiry()
    -> anyhow::Result<()> {
        let call = test_support::tool_call("tabs", json!({})).await?;
        let manager = Arc::new(local_session_manager(Duration::from_secs(20)));
        let router = router(call.state.clone(), manager.clone());
        let session = initialize(&router).await?;
        let stream = request(&router, "GET", Some(&session), None).await?;
        assert_eq!(stream.status(), StatusCode::OK);
        drop(stream);
        let stream = request(&router, "GET", Some(&session), None).await?;
        assert_eq!(stream.status(), StatusCode::OK);
        assert_eq!(list(&router, &session).await?, StatusCode::OK);
        tokio::time::pause();
        // Keep consuming SSE (including its 15-second heartbeat) while the worker idles.
        let heartbeat_reader = tokio::spawn(async move {
            let mut body = stream.into_body().into_data_stream();
            use futures_util::StreamExt;
            while body.next().await.is_some() {}
        });
        tokio::time::advance(Duration::from_secs(15)).await;
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(6)).await;
        expired(&manager).await;
        assert_eq!(list(&router, &session).await?, StatusCode::NOT_FOUND);
        heartbeat_reader.abort();
        Ok(())
    }

    #[tokio::test]
    async fn deleted_unknown_and_pre_restart_ids_refuse_but_fresh_initialize_succeeds()
    -> anyhow::Result<()> {
        let call = test_support::tool_call("tabs", json!({})).await?;
        let router_a = router(
            call.state.clone(),
            Arc::new(local_session_manager(HTTP_SESSION_IDLE)),
        );
        let deleted = initialize(&router_a).await?;
        assert_eq!(
            request(&router_a, "DELETE", Some(&deleted), None)
                .await?
                .status(),
            StatusCode::ACCEPTED
        );
        assert_eq!(list(&router_a, &deleted).await?, StatusCode::NOT_FOUND);
        assert_eq!(
            list(&router_a, "unknown-transport-id").await?,
            StatusCode::NOT_FOUND
        );
        let old = initialize(&router_a).await?;
        // A recreated transport manager models the in-memory identity boundary on restart.
        let router_b = router(
            call.state.clone(),
            Arc::new(local_session_manager(HTTP_SESSION_IDLE)),
        );
        assert_eq!(list(&router_b, &old).await?, StatusCode::NOT_FOUND);
        let fresh = initialize(&router_b).await?;
        assert_ne!(fresh, old);
        assert_ne!(fresh, deleted);
        assert_eq!(list(&router_b, &fresh).await?, StatusCode::OK);
        Ok(())
    }
}

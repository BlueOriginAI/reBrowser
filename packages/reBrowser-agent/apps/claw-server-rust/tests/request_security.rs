use axum::{
    Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Request, StatusCode},
};
use claw_server_rust::{AppState, build_router, config::Config};
use std::{sync::Arc, time::Duration};
use tower::ServiceExt;

const EXTENSION: &str = "chrome-extension://naenhmeajakeeifaphccfdccdpnhkdmj";

async fn app() -> anyhow::Result<(tempfile::TempDir, AppState, Router)> {
    let dir = tempfile::tempdir()?;
    let config = Arc::new(Config {
        server_port: 9200,
        cdp_port: 49337,
        proxy_port: None,
        resources_dir: dir.path().join("resources"),
        browserclaw_dir: dir.path().join("browserclaw"),
        session_idle: Duration::from_secs(300),
        session_retention: Duration::from_secs(7200),
        session_sweep_interval: Duration::from_secs(60),
        replay_retention_days: 7,
        dev_mode: false,
    });
    let state = AppState::new_with_home(config, dir.path().join("home")).await?;
    let router = build_router(state.clone());
    Ok((dir, state, router))
}

async fn request(
    router: &Router,
    method: &str,
    path: &str,
    host: Option<&str>,
    headers: &[(&str, &str)],
) -> anyhow::Result<(StatusCode, HeaderMap)> {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(host) = host {
        request = request.header("host", host);
    }
    for (key, value) in headers {
        request = request.header(*key, *value);
    }
    let response = router.clone().oneshot(request.body(Body::empty())?).await?;
    let status = response.status();
    let headers = response.headers().clone();
    let _ = to_bytes(response.into_body(), 1024 * 1024).await?;
    Ok((status, headers))
}

#[tokio::test]
async fn hostile_browser_reads_writes_and_preflights_are_denied_before_handlers()
-> anyhow::Result<()> {
    let (_dir, state, router) = app().await?;
    for (method, path) in [
        ("GET", "/api/v1/connections"),
        ("GET", "/api/v1/sessions?limit=1"),
        ("POST", "/system/shutdown"),
        ("PUT", "/api/v1/audit/retention"),
        ("DELETE", "/api/v1/connections/codex"),
        ("OPTIONS", "/api/v1/skills"),
    ] {
        let (status, headers) = request(
            &router,
            method,
            path,
            Some("127.0.0.1:9010"),
            &[
                ("origin", "http://127.0.0.1:49292"),
                ("sec-fetch-site", "same-site"),
                ("access-control-request-method", "POST"),
            ],
        )
        .await?;
        assert_eq!(status, StatusCode::FORBIDDEN, "{method} {path}");
        assert!(!headers.contains_key("access-control-allow-origin"));
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(10), state.shutdown.requested())
            .await
            .is_err()
    );
    Ok(())
}

#[tokio::test]
async fn forged_hosts_missing_origins_and_duplicate_headers_fail_closed() -> anyhow::Result<()> {
    let (_dir, _state, router) = app().await?;
    for host in [
        None,
        Some("attacker.example:9010"),
        Some("localhost.attacker.example"),
        Some("user@localhost"),
        Some("127.0.0.1:65536"),
    ] {
        let (status, _) = request(&router, "GET", "/api/v1/system", host, &[]).await?;
        assert_eq!(status, StatusCode::FORBIDDEN, "host={host:?}");
    }
    for headers in [
        vec![("sec-fetch-site", "cross-site")],
        vec![("origin", "null"), ("sec-fetch-site", "none")],
        vec![
            ("origin", EXTENSION),
            ("origin", "https://attacker.example"),
        ],
        vec![("host", "attacker.example")],
    ] {
        let (status, _) = request(
            &router,
            "GET",
            "/api/v1/connections",
            Some("localhost"),
            &headers,
        )
        .await?;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
    Ok(())
}

#[tokio::test]
async fn trusted_extension_and_native_clients_keep_their_supported_contract() -> anyhow::Result<()>
{
    let (_dir, _state, router) = app().await?;
    for host in ["localhost", "127.0.0.1:9010", "[::1]:9010"] {
        let (status, headers) = request(&router, "GET", "/api/v1/system", Some(host), &[]).await?;
        assert_eq!(status, StatusCode::OK);
        assert!(!headers.contains_key("access-control-allow-origin"));
    }
    let (status, headers) = request(
        &router,
        "GET",
        "/api/v1/system",
        Some("127.0.0.1:9010"),
        &[("origin", EXTENSION), ("sec-fetch-site", "cross-site")],
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some(EXTENSION)
    );
    let (status, headers) = request(
        &router,
        "OPTIONS",
        "/api/v1/skills",
        Some("127.0.0.1:9010"),
        &[
            ("origin", EXTENSION),
            ("access-control-request-method", "POST"),
            ("access-control-request-headers", "content-type"),
        ],
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        headers
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some(EXTENSION)
    );
    let (status, _) = request(
        &router,
        "OPTIONS",
        "/api/v1/skills",
        Some("127.0.0.1"),
        &[
            ("origin", EXTENSION),
            ("access-control-request-method", "POST"),
            ("access-control-request-headers", "x-untrusted-header"),
        ],
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    Ok(())
}

#[tokio::test]
async fn opaque_native_recording_exception_does_not_authorize_management_or_mcp()
-> anyhow::Result<()> {
    let (_dir, _state, router) = app().await?;
    let headers = [
        ("origin", "null"),
        ("sec-fetch-site", "none"),
        ("access-control-request-method", "POST"),
    ];
    let (status, cors) = request(
        &router,
        "OPTIONS",
        "/api/v1/recordings/events",
        Some("localhost"),
        &headers,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        cors.get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("null")
    );
    for path in ["/api/v1/connections", "/mcp"] {
        let (status, _) = request(&router, "GET", path, Some("localhost"), &headers).await?;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
    Ok(())
}

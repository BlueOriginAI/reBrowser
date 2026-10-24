//! Canonical BrowserOS neo HTTP API and shared request middleware.

use super::mcp::streamable_http_service;
use crate::{
    AppState,
    error::{AppError, CanonicalError, RequestId},
};
use axum::{
    Router,
    extract::{DefaultBodyLimit, Request},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use std::time::Instant;
use tracing::{Instrument, info_span};
use ulid::Ulid;

pub(crate) mod audit;
mod cockpit;
mod connections;
mod feedback;
mod live;
mod previews;
mod recordings;
mod replay;
mod request_security;
mod screenshots;
mod sessions;
mod settings;
mod skills;
mod system;

/// UTF-8 request-body ceiling enforced before recording ingest and advertised by
/// `/api/v1/system` so the relay can reject oversized queued batches before POSTing.
pub const HTTP_REQUEST_POLICY_MARKER: &str = request_security::POLICY_MARKER;

pub(super) const RECORDING_INGEST_MAX_BYTES: usize = 16 * 1024 * 1024;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/system/health", get(system::health))
        .route("/system/diagnostics", get(system::diagnostics))
        .route("/system/shutdown", post(system::shutdown))
        .route("/api/v1/system", get(system::info))
        .route("/api/v1/cockpit/stats", get(cockpit::stats))
        .route(
            "/api/v1/feedback/invitation",
            get(feedback::invitation).post(feedback::respond),
        )
        .route("/api/v1/audit/storage", get(audit::storage))
        .route("/api/v1/audit/retention", put(audit::set_retention))
        .route("/api/v1/audit/cleanup", post(audit::cleanup))
        .route(
            "/api/v1/settings/telemetry",
            get(settings::telemetry).put(settings::update_telemetry),
        )
        .route("/api/v1/sessions", get(sessions::list))
        .route("/api/v1/sessions/{session_id}", get(sessions::get))
        .route(
            "/api/v1/sessions/{session_id}/preview",
            get(previews::preview),
        )
        .route(
            "/api/v1/sessions/{session_id}/cancel",
            post(sessions::cancel),
        )
        .route(
            "/api/v1/sessions/{session_id}/screenshots",
            get(screenshots::list),
        )
        .route(
            "/api/v1/sessions/{session_id}/screenshots/{screenshot_id}",
            get(screenshots::get),
        )
        .route(
            "/api/v1/sessions/{session_id}/recording",
            get(replay::recording),
        )
        .route(
            "/api/v1/sessions/{session_id}/recording/events",
            get(replay::download_events),
        )
        .route(
            "/api/v1/sessions/{session_id}/recording/live",
            get(live::live),
        )
        .route(
            "/api/v1/recordings/events",
            post(recordings::append_document_events)
                .layer(DefaultBodyLimit::max(RECORDING_INGEST_MAX_BYTES)),
        )
        .route("/api/v1/connections", get(connections::list))
        .route(
            "/api/v1/connections/{harness}",
            put(connections::connect).delete(connections::disconnect),
        )
        .route("/api/v1/skills", get(skills::list).post(skills::create))
        .route(
            "/api/v1/skills/{name}",
            get(skills::get).put(skills::update).delete(skills::delete),
        )
        .route("/api/v1/skills/{name}/runs", get(skills::list_runs))
        .nest_service(
            "/mcp",
            Router::new()
                .fallback_service(streamable_http_service(state))
                .layer(middleware::from_fn(mcp_request_hygiene)),
        )
        .fallback(route_fallback)
        .layer(middleware::from_fn(options_preflight))
}

pub(super) fn error(
    request_id: &RequestId,
    status: StatusCode,
    code: &str,
    message: &str,
) -> CanonicalError {
    CanonicalError::new(status, code, message, Some(request_id))
}

pub(super) fn internal(request_id: &RequestId, source: AppError) -> CanonicalError {
    tracing::error!(request_id = %request_id.0, error = %source, "canonical route failed");
    error(
        request_id,
        StatusCode::INTERNAL_SERVER_ERROR,
        "internal_error",
        "internal server error",
    )
}

/// Rejects browser-page requests to the loopback MCP endpoint. Browser fetches
/// carry `origin` or `sec-fetch-site`; native MCP clients do not.
async fn mcp_request_hygiene(req: Request, next: Next) -> Response {
    // The nested /mcp service shadows the router's `/{*path}` preflight route,
    // so answer OPTIONS here to keep loopback preflight behavior consistent.
    if *req.method() == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    let headers = req.headers();
    if headers.contains_key(header::ORIGIN) || headers.contains_key("sec-fetch-site") {
        return AppError::forbidden("unsupported request").into_response();
    }
    let needs_json = match *req.method() {
        Method::POST | Method::PUT | Method::PATCH => true,
        // rmcp's DELETE /mcp session teardown carries no body and no
        // content-type, so exempt only that case.
        Method::DELETE => headers.contains_key(header::CONTENT_TYPE),
        _ => false,
    };
    if needs_json {
        let is_json = headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.to_ascii_lowercase().contains("application/json"));
        if !is_json {
            return AppError::unsupported_media_type("unsupported content type").into_response();
        }
    }
    next.run(req).await
}

async fn options_preflight(req: Request, next: Next) -> Response {
    if *req.method() == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    next.run(req).await
}

pub async fn request_context(mut req: Request, next: Next) -> Response {
    let request_id = RequestId(Ulid::new().to_string());
    req.extensions_mut().insert(request_id.clone());
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let trust = request_security::authorize_request(&req);
    let cors_origin = trust.as_ref().ok().and_then(|trust| trust.cors_origin);
    let rejected = trust.is_err();
    let is_mcp = path == "/mcp" || path.starts_with("/mcp/");
    let span = info_span!("http_request", request_id = %request_id.0, %method, %path);
    async move {
        let start = Instant::now();
        let mut response = if rejected && is_mcp {
            AppError::forbidden("unsupported request").into_response()
        } else if rejected {
            CanonicalError::new(
                StatusCode::FORBIDDEN,
                "forbidden",
                "request source is not trusted",
                Some(&request_id),
            )
            .into_response()
        } else {
            next.run(req).await
        };
        // One structured line per failed request; sub-400 traffic stays
        // unlogged on purpose (claw-app polls several endpoints).
        let status = response.status().as_u16();
        if status >= 400 {
            let duration_ms = start.elapsed().as_millis() as u64;
            if status >= 500 {
                tracing::error!(%method, %path, status, duration_ms, "request failed");
            } else {
                tracing::warn!(%method, %path, status, duration_ms, "request failed");
            }
        }
        let headers = response.headers_mut();
        headers.append(header::VARY, HeaderValue::from_static("Origin"));
        if let Some(origin) = cors_origin {
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                HeaderValue::from_static(origin),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static(request_security::ALLOW_METHODS),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static(request_security::ALLOW_HEADERS),
            );
        }
        if let Ok(value) = HeaderValue::from_str(&request_id.0) {
            headers.insert("x-request-id", value);
        }
        response
    }
    .instrument(span)
    .await
}

async fn route_fallback(request: Request) -> StatusCode {
    if *request.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

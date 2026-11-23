use super::{error, internal};
use crate::{
    AppState,
    error::{AppError, CanonicalError, RequestId},
};
use axum::{Extension, Json, extract::State, http::StatusCode};
use claw_api::models::{ReroutePreferencesUpdate, RerouteState, RerouteTargetUpdate};

pub(super) async fn state(State(app_state): State<AppState>) -> Json<RerouteState> {
    Json(app_state.reroute.get_state().await)
}

pub(super) async fn set_target(
    Extension(request_id): Extension<RequestId>,
    State(app_state): State<AppState>,
    Json(body): Json<RerouteTargetUpdate>,
) -> Result<Json<RerouteState>, CanonicalError> {
    let next = app_state
        .reroute
        .set_target_device(body.target_device_id)
        .await
        .map_err(|source| map_error(&request_id, source))?;
    Ok(Json(next))
}

pub(super) async fn set_preferences(
    Extension(request_id): Extension<RequestId>,
    State(app_state): State<AppState>,
    Json(body): Json<ReroutePreferencesUpdate>,
) -> Result<Json<RerouteState>, CanonicalError> {
    let next = app_state
        .reroute
        .set_preferences(body.allow_incoming_reroute)
        .await
        .map_err(|source| map_error(&request_id, source))?;
    Ok(Json(next))
}

fn map_error(request_id: &RequestId, source: AppError) -> CanonicalError {
    match source.status() {
        StatusCode::UNAUTHORIZED => error(
            request_id,
            StatusCode::UNAUTHORIZED,
            "account_login_required",
            &source.to_string(),
        ),
        StatusCode::FORBIDDEN => error(
            request_id,
            StatusCode::FORBIDDEN,
            "pro_subscription_required",
            &source.to_string(),
        ),
        _ => internal(request_id, source),
    }
}

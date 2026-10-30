use axum::{
    extract::Request,
    http::{HeaderMap, Method, header, uri::Authority},
};

pub(super) const POLICY_MARKER: &str = "rebrowser-http-origin-policy=1;";
pub(super) const EXTENSION_ORIGIN: &str = "chrome-extension://naenhmeajakeeifaphccfdccdpnhkdmj";
pub(super) const ALLOW_METHODS: &str = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
pub(super) const ALLOW_HEADERS: &str = "accept,content-type,authorization,mcp-session-id,mcp-protocol-version,last-event-id,x-recording-batch-id,x-recording-tab-id,x-recording-document-id,x-recording-has-gap";

pub(super) struct RequestTrust {
    pub cors_origin: Option<&'static str>,
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<Option<&'a str>, ()> {
    let mut values = headers.get_all(name).iter();
    let value = values.next();
    if values.next().is_some() {
        return Err(());
    }
    value
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()
}

fn loopback_authority(value: &str) -> bool {
    if value.trim() != value || value.contains('@') || value.ends_with(':') {
        return false;
    }
    let Ok(authority) = value.parse::<Authority>() else {
        return false;
    };
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']');
    if !matches!(
        host.to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1"
    ) {
        return false;
    }
    // Authority::port() returns None for out-of-range text too, so inspect the
    // original suffix instead of confusing an invalid port with no port.
    let suffix = if value.starts_with('[') {
        let Some(end) = value.find(']') else {
            return false;
        };
        &value[end + 1..]
    } else {
        &value[value.find(':').unwrap_or(value.len())..]
    };
    suffix.is_empty()
        || suffix.strip_prefix(':').is_some_and(|port| {
            !port.is_empty()
                && port.bytes().all(|byte| byte.is_ascii_digit())
                && port.parse::<u16>().is_ok_and(|port| port > 0)
        })
}

pub(super) fn authorize_request(request: &Request) -> Result<RequestTrust, ()> {
    let headers = request.headers();
    let host = single_header(headers, header::HOST.as_str())?
        .or_else(|| request.uri().authority().map(Authority::as_str))
        .ok_or(())?;
    if !loopback_authority(host)
        || request
            .uri()
            .authority()
            .is_some_and(|value| !loopback_authority(value.as_str()))
    {
        return Err(());
    }
    let origin = single_header(headers, header::ORIGIN.as_str())?;
    let fetch_site = single_header(headers, "sec-fetch-site")?;
    if fetch_site
        .is_some_and(|site| !matches!(site, "none" | "same-origin" | "same-site" | "cross-site"))
    {
        return Err(());
    }
    let path = request.uri().path();
    let is_mcp = path == "/mcp" || path.starts_with("/mcp/");
    // MCP is a native-client transport. Browser UI uses the protected REST API.
    if is_mcp && (origin.is_some() || fetch_site.is_some()) {
        return Err(());
    }
    let cors_origin = match origin {
        Some(EXTENSION_ORIGIN) => Some(EXTENSION_ORIGIN),
        Some("null")
            if path == "/api/v1/recordings/events"
                && matches!(*request.method(), Method::POST | Method::OPTIONS)
                && fetch_site == Some("none") =>
        {
            Some("null")
        }
        Some(_) => return Err(()),
        None => {
            if fetch_site.is_some_and(|site| site != "none") {
                return Err(());
            }
            None
        }
    };
    if *request.method() == Method::OPTIONS && cors_origin.is_some() {
        let method = single_header(headers, "access-control-request-method")?.ok_or(())?;
        if !ALLOW_METHODS.split(',').any(|allowed| allowed == method) {
            return Err(());
        }
        if let Some(requested) = single_header(headers, "access-control-request-headers")? {
            if requested.split(',').any(|name| {
                let name = name.trim().to_ascii_lowercase();
                name.is_empty() || !ALLOW_HEADERS.split(',').any(|allowed| allowed == name)
            }) {
                return Err(());
            }
        }
    }
    Ok(RequestTrust { cors_origin })
}

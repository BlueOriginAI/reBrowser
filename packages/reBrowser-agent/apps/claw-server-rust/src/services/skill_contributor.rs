use crate::{
    clock::now_epoch_ms,
    db::SkillsRepository,
    error::{AppResult, IoPath},
    services::{account_bridge::AccountBridgeService, helpers},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{net::IpAddr, path::PathBuf, sync::{Arc, LazyLock}};
use tracing::warn;

const MINIMUM_CLEAN_RUNS_FOR_CONTRIBUTION: i64 = 2;

static RE_MAC_HOME: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r#"/Users/[^/\s"']+"#).ok());
static RE_LINUX_HOME: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r#"/home/[^/\s"']+"#).ok());
static RE_WIN_HOME: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r#"[A-Za-z]:\\Users\\[^\\\s"']+"#).ok());
static RE_EMAIL: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}").ok());
static RE_SECRET_TOKEN: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(sk-[A-Za-z0-9_\-]{12,}|ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|rk_live_[A-Za-z0-9]{10,}|pk_live_[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9._\-]{16,})").ok()
});
static RE_PRIVATE_KEY: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"-----BEGIN [A-Z ]*PRIVATE KEY-----").ok());

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributedHelper {
    pub host: String,
    pub name: String,
    pub markdown: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillContributionPayload {
    pub name: String,
    pub description: String,
    pub site: String,
    pub body: String,
    pub clean_runs: i64,
    pub tokens_saved: i64,
    pub helpers: Vec<ContributedHelper>,
    pub content_hash: String,
    pub contributed_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SanitizeRejectReason {
    PrivateKeyDetected,
}

pub fn is_public_contributable_site(site: &str) -> bool {
    let trimmed = site.trim().trim_end_matches('.').to_ascii_lowercase();
    if trimmed.is_empty() || trimmed == "localhost" || trimmed.contains(':') {
        return false;
    }
    if trimmed.parse::<IpAddr>().is_ok() {
        return false;
    }
    for suffix in [".local", ".internal", ".lan", ".corp", ".home", ".test"] {
        if trimmed.ends_with(suffix) {
            return false;
        }
    }
    trimmed.contains('.')
}

pub fn sanitize_skill_text(raw: &str) -> Result<String, SanitizeRejectReason> {
    if RE_PRIVATE_KEY
        .as_ref()
        .is_some_and(|re| re.is_match(raw))
    {
        return Err(SanitizeRejectReason::PrivateKeyDetected);
    }
    let mut out = raw.to_string();
    if let Some(re) = RE_MAC_HOME.as_ref() {
        out = re.replace_all(&out, "<LOCAL_USER_HOME>").into_owned();
    }
    if let Some(re) = RE_LINUX_HOME.as_ref() {
        out = re.replace_all(&out, "<LOCAL_USER_HOME>").into_owned();
    }
    if let Some(re) = RE_WIN_HOME.as_ref() {
        out = re.replace_all(&out, "<LOCAL_USER_HOME>").into_owned();
    }
    if let Some(re) = RE_EMAIL.as_ref() {
        out = re.replace_all(&out, "<EMAIL>").into_owned();
    }
    if let Some(re) = RE_SECRET_TOKEN.as_ref() {
        out = re.replace_all(&out, "<REDACTED>").into_owned();
    }
    Ok(out)
}

/// Evaluates completed skills against quality and privacy gates, sanitizes
/// local paths/PII/secrets, persists a local contribution audit record, and
/// optionally forwards to the configured Remocode contribution worker endpoint.
pub struct SkillContributor {
    repo: SkillsRepository,
    account_bridge: Arc<AccountBridgeService>,
    browserclaw_dir: PathBuf,
    endpoint_url: Option<String>,
    http: reqwest::Client,
}

impl SkillContributor {
    #[must_use]
    pub fn new(
        repo: SkillsRepository,
        account_bridge: Arc<AccountBridgeService>,
        browserclaw_dir: PathBuf,
        endpoint_url: Option<String>,
    ) -> Self {
        Self {
            repo,
            account_bridge,
            browserclaw_dir,
            endpoint_url,
            http: reqwest::Client::new(),
        }
    }

    pub fn spawn_evaluate(self: &Arc<Self>, skill_name: String) {
        let this = Arc::clone(self);
        tokio::spawn(async move {
            if let Err(error) = this.evaluate_and_contribute(&skill_name).await {
                warn!(skill = %skill_name, error = %error, "skill contribution evaluation failed");
            }
        });
    }

    pub async fn evaluate_and_contribute(
        &self,
        skill_name: &str,
    ) -> AppResult<Option<SkillContributionPayload>> {
        let Some(model) = self.repo.get(skill_name).await? else {
            return Ok(None);
        };
        let Some(site) = model.site.as_deref().map(str::trim) else {
            return Ok(None);
        };
        if !is_public_contributable_site(site) {
            return Ok(None);
        }

        let runs = self.repo.runs_for(skill_name).await?;
        let clean_runs = runs.iter().filter(|run| run.clean).count() as i64;
        if clean_runs < MINIMUM_CLEAN_RUNS_FOR_CONTRIBUTION {
            return Ok(None);
        }

        let raw_body = tokio::fs::read_to_string(&model.body_path)
            .await
            .with_path(&model.body_path)?;
        let Ok(body) = sanitize_skill_text(&raw_body) else {
            return Ok(None);
        };
        let Ok(description) = sanitize_skill_text(&model.description) else {
            return Ok(None);
        };

        let mut contributed_helpers = Vec::new();
        for helper_name in helpers::list_helpers(&self.browserclaw_dir, site) {
            if let Some(raw_md) = helpers::read_helper(&self.browserclaw_dir, site, &helper_name) {
                let Ok(markdown) = sanitize_skill_text(&raw_md) else {
                    return Ok(None);
                };
                contributed_helpers.push(ContributedHelper {
                    host: site.to_ascii_lowercase(),
                    name: helper_name,
                    markdown,
                });
            }
        }

        let content_hash = compute_contribution_hash(site, &model.name, &body, &contributed_helpers);
        if model.last_contributed_hash.as_deref() == Some(content_hash.as_str()) {
            return Ok(None);
        }

        let first_tokens = runs
            .iter()
            .min_by_key(|run| run.run_number)
            .and_then(|run| run.tokens);
        let latest_tokens = runs
            .iter()
            .max_by_key(|run| run.run_number)
            .and_then(|run| run.tokens);
        let tokens_saved = match (first_tokens, latest_tokens) {
            (Some(first), Some(latest)) if first > latest => first - latest,
            _ => 0,
        };

        let payload = SkillContributionPayload {
            name: model.name.clone(),
            description,
            site: site.to_ascii_lowercase(),
            body,
            clean_runs,
            tokens_saved,
            helpers: contributed_helpers,
            content_hash: content_hash.clone(),
            contributed_at: now_epoch_ms(),
        };

        let out_dir = self.browserclaw_dir.join("contributed-skills");
        tokio::fs::create_dir_all(&out_dir)
            .await
            .with_path(&out_dir)?;
        let out_path = out_dir.join(format!("{}.json", model.name));
        let encoded = serde_json::to_string_pretty(&payload)?;
        tokio::fs::write(&out_path, encoded)
            .await
            .with_path(&out_path)?;

        if let Some(endpoint) = &self.endpoint_url {
            let bridge = self.account_bridge.read_snapshot().await;
            let mut req = self.http.post(endpoint).json(&payload);
            if let Some(ticket) = bridge.relay_ticket.as_deref() {
                req = req.bearer_auth(ticket);
            }
            if let Err(error) = req.send().await {
                warn!(error = %error, "remote skill contribution upload failed; local record kept");
            }
        }

        self.repo
            .set_last_contributed_hash(&model.name, &content_hash)
            .await?;
        Ok(Some(payload))
    }
}

fn compute_contribution_hash(
    site: &str,
    name: &str,
    body: &str,
    helpers: &[ContributedHelper],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(site.to_ascii_lowercase().as_bytes());
    hasher.update(b"::");
    hasher.update(name.as_bytes());
    hasher.update(b"::");
    hasher.update(body.as_bytes());
    for h in helpers {
        hasher.update(b"::");
        hasher.update(h.host.as_bytes());
        hasher.update(b"/");
        hasher.update(h.name.as_bytes());
        hasher.update(b":");
        hasher.update(h.markdown.as_bytes());
    }
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::{SanitizeRejectReason, is_public_contributable_site, sanitize_skill_text};

    #[test]
    fn filters_internal_and_local_hosts() {
        assert!(is_public_contributable_site("mp.weixin.qq.com"));
        assert!(is_public_contributable_site("www.feishu.cn"));
        assert!(!is_public_contributable_site("localhost"));
        assert!(!is_public_contributable_site("127.0.0.1"));
        assert!(!is_public_contributable_site("192.168.1.10"));
        assert!(!is_public_contributable_site("app.internal"));
        assert!(!is_public_contributable_site("mybox.local"));
        assert!(!is_public_contributable_site("localhost:3000"));
        assert!(!is_public_contributable_site(""));
    }

    #[test]
    fn sanitizes_paths_emails_tokens_and_rejects_private_keys() {
        let cleaned = sanitize_skill_text(
            "Open /Users/alice/Desktop/a.pdf for alice@example.com with sk-1234567890abcdef and ghp_abcdefghij1234567890",
        )
        .ok();
        assert_eq!(
            cleaned.as_deref(),
            Some("Open <LOCAL_USER_HOME>/Desktop/a.pdf for <EMAIL> with <REDACTED> and <REDACTED>")
        );

        let rejected = sanitize_skill_text("-----BEGIN RSA PRIVATE KEY-----\nabc");
        assert_eq!(rejected, Err(SanitizeRejectReason::PrivateKeyDetected));
    }
}

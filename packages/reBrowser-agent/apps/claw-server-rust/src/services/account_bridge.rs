use crate::{
    clock::now_epoch_ms,
    error::{AppResult, IoPath},
};
use serde::{Deserialize, Deserializer, Serialize};
use std::path::{Path, PathBuf};
use tokio::sync::RwLock;

const BRIDGE_FILENAME: &str = "account-bridge.json";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountBridgeSnapshot {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub signed_in: bool,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default = "default_entitlement")]
    pub entitlement: String,
    #[serde(default, deserialize_with = "deserialize_optional_epoch_ms")]
    pub vip_expires_at: Option<i64>,
    #[serde(default)]
    pub installation_id: String,
    #[serde(default)]
    pub device_name: String,
    #[serde(default)]
    pub os: String,
    #[serde(default)]
    pub relay_url: Option<String>,
    #[serde(default)]
    pub relay_ticket: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_epoch_ms")]
    pub relay_ticket_expires_at: Option<i64>,
}

fn deserialize_optional_epoch_ms<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(None);
    };
    match value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Number(num) => {
            if let Some(i) = num.as_i64() {
                return Ok(Some(i));
            }
            if let Some(u) = num.as_u64() {
                return i64::try_from(u)
                    .map(Some)
                    .map_err(|_| serde::de::Error::custom("epoch ms exceeds i64::MAX"));
            }
            if let Some(f) = num.as_f64() {
                if f.is_finite() && f >= 0.0 && f <= (i64::MAX as f64) {
                    #[allow(clippy::cast_possible_truncation)]
                    return Ok(Some(f.round() as i64));
                }
                return Err(serde::de::Error::custom("out-of-range float epoch ms"));
            }
            Err(serde::de::Error::custom("invalid numeric epoch ms"))
        }
        other => Err(serde::de::Error::custom(format!(
            "expected number or null for epoch ms, got {other}"
        ))),
    }
}

fn default_version() -> u32 {
    1
}

fn default_entitlement() -> String {
    "signedOut".to_string()
}

impl AccountBridgeSnapshot {
    #[must_use]
    pub fn is_pro(&self) -> bool {
        self.is_pro_at(now_epoch_ms())
    }

    #[must_use]
    pub fn is_pro_at(&self, now_ms: i64) -> bool {
        if !self.signed_in || self.entitlement != "active" {
            return false;
        }
        match self.vip_expires_at {
            Some(expires) => expires > now_ms,
            None => true,
        }
    }
}

/// Reads the sanitized account & subscription bridge written by Chromium's
/// native RemocodeAccountService/RemocodeSyncService (`account-bridge.json`).
/// Never reads or stores raw OAuth access or refresh tokens.
pub struct AccountBridgeService {
    search_paths: Vec<PathBuf>,
    override_snapshot: RwLock<Option<AccountBridgeSnapshot>>,
}

impl AccountBridgeService {
    #[must_use]
    pub fn new(browserclaw_dir: &Path, home_dir: &Path) -> Self {
        let mut search_paths = vec![browserclaw_dir.join(BRIDGE_FILENAME)];
        #[cfg(target_os = "macos")]
        {
            search_paths.push(
                home_dir
                    .join("Library/Application Support/RemocodeBrowserNeo/.browseros")
                    .join(BRIDGE_FILENAME),
            );
            search_paths.push(
                home_dir
                    .join("Library/Application Support/RemocodeBrowser/.browseros")
                    .join(BRIDGE_FILENAME),
            );
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = home_dir;
        }
        Self {
            search_paths,
            override_snapshot: RwLock::new(None),
        }
    }

    pub async fn set_override(&self, snapshot: Option<AccountBridgeSnapshot>) {
        *self.override_snapshot.write().await = snapshot;
    }

    pub async fn write_primary_snapshot(&self, snapshot: &AccountBridgeSnapshot) -> AppResult<()> {
        let Some(path) = self.search_paths.first() else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await.with_path(parent)?;
        }
        let body = serde_json::to_string_pretty(snapshot)?;
        tokio::fs::write(path, body).await.with_path(path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).await;
        }
        *self.override_snapshot.write().await = Some(snapshot.clone());
        Ok(())
    }

    pub async fn read_snapshot(&self) -> AccountBridgeSnapshot {
        if let Some(snapshot) = self.override_snapshot.read().await.clone() {
            return snapshot;
        }
        for path in &self.search_paths {
            let Ok(raw) = tokio::fs::read_to_string(path).await else {
                continue;
            };
            if let Ok(parsed) = serde_json::from_str::<AccountBridgeSnapshot>(&raw) {
                return parsed;
            }
        }
        AccountBridgeSnapshot::default()
    }
}

#[cfg(test)]
mod tests {
    use super::{AccountBridgeService, AccountBridgeSnapshot};
    use tempfile::tempdir;

    #[tokio::test]
    async fn reads_and_writes_bridge_snapshot_and_checks_pro_expiry() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let service = AccountBridgeService::new(dir.path(), dir.path());
        assert!(!service.read_snapshot().await.signed_in);

        let active = AccountBridgeSnapshot {
            version: 1,
            signed_in: true,
            email: "dev@example.com".to_string(),
            display_name: "Dev".to_string(),
            entitlement: "active".to_string(),
            vip_expires_at: Some(2_000_000),
            installation_id: "inst-1".to_string(),
            device_name: "MacBook".to_string(),
            os: "macos".to_string(),
            relay_url: Some("wss://relay.remocode.cc/v1/tunnel".to_string()),
            relay_ticket: Some("ticket-123".to_string()),
            relay_ticket_expires_at: Some(2_000_000),
        };
        service.write_primary_snapshot(&active).await?;
        let loaded = service.read_snapshot().await;
        assert_eq!(loaded.email, "dev@example.com");
        assert!(loaded.is_pro_at(1_000_000));
        assert!(!loaded.is_pro_at(2_000_001));
        Ok(())
    }

    #[test]
    fn deserializes_chromium_scientific_float_timestamps() -> anyhow::Result<()> {
        let raw = r#"{"deviceName":"Mac15,13","displayName":"天易 罗","email":"futurebaidu@gmail.com","entitlement":"active","installationId":"4340fea1-4724-4aea-9091-77249213a2cd","os":"macos","signedIn":true,"version":1,"vipExpiresAt":1.796115137e+12}"#;
        let parsed: AccountBridgeSnapshot = serde_json::from_str(raw)?;
        assert!(parsed.signed_in);
        assert_eq!(parsed.entitlement, "active");
        assert_eq!(parsed.vip_expires_at, Some(1_796_115_137_000));
        assert!(parsed.is_pro_at(1_796_000_000_000));
        Ok(())
    }
}

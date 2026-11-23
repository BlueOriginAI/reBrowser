use crate::models;
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct LocalizedText {
    #[serde(rename = "zh")]
    pub zh: String,
    #[serde(rename = "en")]
    pub en: String,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillCatalogHelper {
    #[serde(rename = "host")]
    pub host: String,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "markdown")]
    pub markdown: String,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillCatalogCreation {
    #[serde(rename = "description")]
    pub description: String,
    #[serde(rename = "site", skip_serializing_if = "Option::is_none")]
    pub site: Option<String>,
    #[serde(rename = "steps", default)]
    pub steps: Vec<String>,
    #[serde(rename = "learnedNotes", default)]
    pub learned_notes: Vec<String>,
    #[serde(rename = "body")]
    pub body: String,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillCatalogItem {
    #[serde(rename = "id")]
    pub id: String,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "title")]
    pub title: LocalizedText,
    #[serde(rename = "description")]
    pub description: LocalizedText,
    #[serde(rename = "site")]
    pub site: String,
    #[serde(rename = "category")]
    pub category: String,
    #[serde(rename = "proOnly")]
    pub pro_only: bool,
    #[serde(rename = "avgTokensSaved")]
    pub avg_tokens_saved: i64,
    #[serde(rename = "verifiedCleanRuns")]
    pub verified_clean_runs: i64,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "installed")]
    pub installed: bool,
    #[serde(rename = "updateAvailable")]
    pub update_available: bool,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillCatalogList {
    #[serde(rename = "version")]
    pub version: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(rename = "items")]
    pub items: Vec<SkillCatalogItem>,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillCatalogInstallResponse {
    #[serde(rename = "installed")]
    pub installed: bool,
    #[serde(rename = "skill")]
    pub skill: models::Skill,
    #[serde(rename = "helpersInstalled")]
    pub helpers_installed: usize,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReroutePeerDevice {
    #[serde(rename = "installationId")]
    pub installation_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    #[serde(rename = "os")]
    pub os: String,
    #[serde(rename = "appVersion")]
    pub app_version: String,
    #[serde(rename = "online")]
    pub online: bool,
    #[serde(rename = "allowIncoming")]
    pub allow_incoming: bool,
    #[serde(rename = "rttMs", skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<i64>,
    #[serde(rename = "isSelf")]
    pub is_self: bool,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct RerouteState {
    #[serde(rename = "signedIn")]
    pub signed_in: bool,
    #[serde(rename = "email")]
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "entitlement")]
    pub entitlement: String,
    #[serde(rename = "vipExpiresAt", skip_serializing_if = "Option::is_none")]
    pub vip_expires_at: Option<i64>,
    #[serde(rename = "isPro")]
    pub is_pro: bool,
    #[serde(rename = "selfInstallationId")]
    pub self_installation_id: String,
    #[serde(rename = "selfDeviceName")]
    pub self_device_name: String,
    #[serde(rename = "allowIncomingReroute")]
    pub allow_incoming_reroute: bool,
    #[serde(rename = "targetDeviceId", skip_serializing_if = "Option::is_none")]
    pub target_device_id: Option<String>,
    #[serde(rename = "targetDeviceName", skip_serializing_if = "Option::is_none")]
    pub target_device_name: Option<String>,
    #[serde(rename = "relayConnected")]
    pub relay_connected: bool,
    #[serde(rename = "devices")]
    pub devices: Vec<ReroutePeerDevice>,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct RerouteTargetUpdate {
    #[serde(rename = "targetDeviceId")]
    pub target_device_id: Option<String>,
}

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReroutePreferencesUpdate {
    #[serde(rename = "allowIncomingReroute")]
    pub allow_incoming_reroute: bool,
}

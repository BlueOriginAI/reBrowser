diff --git a/chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc b/chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc
--- a/chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc
+++ b/chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc
@@ -14,6 +14,7 @@
 #include "base/strings/escape.h"
 #include "base/strings/string_number_conversions.h"
 #include "base/strings/utf_string_conversions.h"
+#include "base/version_info/version_info.h"
 #include "build/branding_buildflags.h"
 #include "build/build_config.h"
 #include "build/buildflag.h"
@@ -345,6 +346,12 @@
   std::u16string browser_version = VersionUI::GetAnnotatedVersionStringForUi();
 
   html_source->AddString("aboutBrowserVersion", browser_version);
+  html_source->AddLocalizedString("browserOSFeedback",
+                                  IDS_SETTINGS_BROWSEROS_FEEDBACK);
+  html_source->AddString(
+      "aboutBrowserOSVersion",
+      base::UTF8ToUTF16(
+          std::string(version_info::GetBrowserOSVersionNumber())));
   html_source->AddString(
       "aboutProductCopyright",
       base::i18n::MessageFormatter::FormatWithNumberedArgs(
@@ -1136,6 +1143,8 @@
       {"importCommit", IDS_SETTINGS_IMPORT_COMMIT},
       {"noProfileFound", IDS_SETTINGS_IMPORT_NO_PROFILE_FOUND},
       {"importSuccess", IDS_SETTINGS_IMPORT_SUCCESS},
+      {"importDialogExtensions", IDS_SETTINGS_IMPORT_EXTENSIONS_CHECKBOX},
+      {"importDialogCookies", IDS_SETTINGS_IMPORT_COOKIES_CHECKBOX},
   };
   html_source->AddLocalizedStrings(kLocalizedStrings);
 }
@@ -2237,7 +2246,91 @@
 void AddPeopleStrings(content::WebUIDataSource* html_source, Profile* profile) {
   static constexpr webui::LocalizedString kLocalizedStrings[] = {
       // Top level people strings:
-      {"peoplePageTitle", IDS_SETTINGS_PEOPLE},
+      {"peoplePageTitle", IDS_SETTINGS_REMOCODE_PEOPLE},
+#if !BUILDFLAG(IS_CHROMEOS)
+      {"remocodeLocalProfileTitle",
+       IDS_SETTINGS_REMOCODE_LOCAL_PROFILE_TITLE},
+      {"remocodeAccountTitle",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_TITLE},
+      {"remocodeAccountDescription",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_DESCRIPTION},
+      {"remocodeAccountLoading",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_LOADING},
+      {"remocodeAccountSignedOut",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_SIGNED_OUT},
+      {"remocodeAccountAuthorizing",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_AUTHORIZING},
+      {"remocodeAccountSignedIn",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_SIGNED_IN},
+      {"remocodeAccountReauthRequired",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_REAUTH_REQUIRED},
+      {"remocodeAccountError",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_ERROR},
+      {"remocodeAccountLogin",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_LOGIN},
+      {"remocodeAccountCancel",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_CANCEL},
+      {"remocodeAccountLogout",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT},
+      {"remocodeAccountManage",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_MANAGE},
+      {"remocodeAccountReauth",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_REAUTH},
+      {"remocodeAccountRetry",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_RETRY},
+      {"remocodeAccountSyncUnavailable",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_SYNC_UNAVAILABLE},
+      {"remocodeAccountErrorDetail",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_ERROR_DETAIL},
+      {"remocodeAccountPortInUse",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_PORT_IN_USE},
+      {"remocodeAccountStorageUnavailable",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_STORAGE_UNAVAILABLE},
+      {"remocodeAccountNetworkError",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_NETWORK_ERROR},
+      {"remocodeAccountProviderError",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_PROVIDER_ERROR},
+      {"remocodeAccountSessionExpired",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_SESSION_EXPIRED},
+      {"remocodeAccountLogoutUnconfirmed",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT_UNCONFIRMED},
+      {"remocodeAccountTimeout",
+       IDS_SETTINGS_REMOCODE_ACCOUNT_TIMEOUT},
+#endif
+      {"remocodeSyncTitle", IDS_SETTINGS_REMOCODE_SYNC_TITLE},
+      {"remocodeLocalProfiles", IDS_SETTINGS_REMOCODE_LOCAL_PROFILES},
+      {"remocodeSyncDescription", IDS_SETTINGS_REMOCODE_SYNC_DESCRIPTION},
+      {"remocodeSyncSignedOut", IDS_SETTINGS_REMOCODE_SYNC_SIGNED_OUT},
+      {"remocodeSyncLogin", IDS_SETTINGS_REMOCODE_SYNC_LOGIN},
+      {"remocodeSyncLoading", IDS_SETTINGS_REMOCODE_SYNC_LOADING},
+      {"remocodeSyncFree", IDS_SETTINGS_REMOCODE_SYNC_FREE},
+      {"remocodeSyncActive", IDS_SETTINGS_REMOCODE_SYNC_ACTIVE},
+      {"remocodeSyncUnavailable", IDS_SETTINGS_REMOCODE_SYNC_UNAVAILABLE},
+      {"remocodeSyncError", IDS_SETTINGS_REMOCODE_SYNC_ERROR},
+      {"remocodeSyncPurchaseUnavailable", IDS_SETTINGS_REMOCODE_SYNC_PURCHASE_UNAVAILABLE},
+      {"remocodeSyncAgentHistory", IDS_SETTINGS_REMOCODE_SYNC_AGENT_HISTORY},
+      {"remocodeSyncHistory", IDS_SETTINGS_REMOCODE_SYNC_HISTORY},
+      {"remocodeSyncBookmarks", IDS_SETTINGS_REMOCODE_SYNC_BOOKMARKS},
+      {"remocodeSyncDeveloping", IDS_SETTINGS_REMOCODE_SYNC_DEVELOPING},
+      {"remocodeSyncScope", IDS_SETTINGS_REMOCODE_SYNC_SCOPE},
+      {"remocodeSyncPaused", IDS_SETTINGS_REMOCODE_SYNC_PAUSED},
+      {"remocodeSyncPending", IDS_SETTINGS_REMOCODE_SYNC_PENDING},
+      {"remocodeSyncFailed", IDS_SETTINGS_REMOCODE_SYNC_FAILED},
+      {"remocodeSyncConflict", IDS_SETTINGS_REMOCODE_SYNC_CONFLICT},
+      {"remocodeSyncSuccess", IDS_SETTINGS_REMOCODE_SYNC_SUCCESS},
+      {"remocodeSyncNever", IDS_SETTINGS_REMOCODE_SYNC_NEVER},
+      {"remocodeSyncPurchase", IDS_SETTINGS_REMOCODE_SYNC_PURCHASE},
+      {"remocodeSyncManage", IDS_SETTINGS_REMOCODE_SYNC_MANAGE},
+      {"remocodeSyncRetry", IDS_SETTINGS_REMOCODE_SYNC_RETRY},
+      {"remocodeSyncDelete", IDS_SETTINGS_REMOCODE_SYNC_DELETE},
+      {"remocodeSyncDeleteConfirm", IDS_SETTINGS_REMOCODE_SYNC_DELETE_CONFIRM},
+      {"remocodeSyncCancel", IDS_SETTINGS_REMOCODE_SYNC_CANCEL},
+      {"remocodeSyncConfirmDelete", IDS_SETTINGS_REMOCODE_SYNC_CONFIRM_DELETE},
+      {"remocodeSyncDeleteFailed", IDS_SETTINGS_REMOCODE_SYNC_DELETE_FAILED},
+      {"remocodeSyncDeletePending", IDS_SETTINGS_REMOCODE_SYNC_DELETE_PENDING},
+      {"remocodeSyncReauthRequired", IDS_SETTINGS_REMOCODE_SYNC_REAUTH_REQUIRED},
+      {"remocodeSyncEnableConfirm", IDS_SETTINGS_REMOCODE_SYNC_ENABLE_CONFIRM},
+      {"remocodeSyncConfirmEnable", IDS_SETTINGS_REMOCODE_SYNC_CONFIRM_ENABLE},
       {"syncSettingsSavedToast", IDS_SETTINGS_SYNC_SETTINGS_SAVED_TOAST_LABEL},
       {"manageGoogleAccount", IDS_SETTINGS_MANAGE_GOOGLE_ACCOUNT},
       {"syncAndNonPersonalizedServices",
@@ -2295,6 +2388,48 @@
        IDS_SETTINGS_SYNC_DISCONNECT_DELETE_PROFILE_WARNING_WITHOUT_COUNTS},
   };
   html_source->AddLocalizedStrings(kLocalizedStrings);
+#if !BUILDFLAG(IS_CHROMEOS)
+  // Product-owned account overview labels; no Chromium resource IDs change.
+  const bool chinese =
+      g_browser_process->GetApplicationLocale().starts_with("zh");
+  static constexpr struct {
+    const char* name;
+    const char* english;
+    const char* chinese;
+  } kRemocodeOverviewStrings[] = {
+      {"remocodeOverviewAddProfile", "Add Profile", "添加 Profile"},
+      {"remocodeOverviewHeading", "Account", "账户"},
+      {"remocodeOverviewRefresh", "Refresh account", "刷新账户信息"},
+      {"remocodeOverviewSubscription", "Current subscription", "当前订阅"},
+      {"remocodeOverviewSubscribed", "Subscribed", "已订阅"},
+      {"remocodeOverviewFreePlan", "Free plan", "免费版"},
+      {"remocodeOverviewExpires", "Valid until", "有效期至"},
+      {"remocodeOverviewActive", "Your subscription is active", "订阅已生效"},
+      {"remocodeOverviewUpgradeHint", "Unlock cloud sync across your devices.", "升级以解锁跨设备云同步。"},
+      {"remocodeOverviewRefreshSubscription", "Refresh subscription", "刷新订阅"},
+      {"remocodeOverviewManageSubscription", "Manage subscription", "管理订阅"},
+      {"remocodeOverviewUpgrade", "Get reBrowser Pro", "升级 Pro"},
+      {"remocodeOverviewCloudSync", "Cloud sync", "云同步"},
+      {"remocodeOverviewCloudDescription", "Keep bookmarks and browsing history in sync across your devices.", "在多台设备间同步书签和浏览历史。"},
+      {"remocodeOverviewEnabled", "Enabled", "已开启"},
+      {"remocodeOverviewNotEnabled", "Not enabled", "未开启"},
+      {"remocodeOverviewProOnly", "Pro feature", "Pro 专享"},
+      {"remocodeOverviewBasic", "Browser and Agent tools", "浏览器与 Agent 工具"},
+      {"remocodeOverviewBasicDescription", "Browse the web, connect agents through MCP, and work locally.", "网页浏览、MCP 连接与本地浏览能力，始终可用。"},
+      {"remocodeOverviewFree", "Free to use", "免费可用"},
+      {"remocodeOverviewMore", "More from Remocode", "更多作品"},
+      {"remocodeOverviewTagline", "Made for your AI workflow.", "为你的 AI 工作流而作。"},
+      {"remocodeOverviewIdeDescription", "The native desktop IDE for agents", "Agent 原生桌面 IDE"},
+      {"remocodeOverviewBarDescription", "Your local Codex account and model gateway", "本地 Codex 账户与模型网关"},
+      {"remocodeOverviewUnavailable", "Temporarily unavailable", "暂不可用"},
+      {"remocodeOverviewSignInHint", "Sign in to see your subscription.", "登录后查看订阅与同步能力。"},
+      {"remocodeOverviewRequestFailed", "Could not refresh. Please try again.", "刷新失败，请重试。"},
+  };
+  for (const auto& text : kRemocodeOverviewStrings) {
+    html_source->AddString(text.name, chinese ? text.chinese : text.english);
+  }
+#endif
+
 
 #if BUILDFLAG(IS_CHROMEOS)
   html_source->AddLocalizedString("peopleSignInPrompt",

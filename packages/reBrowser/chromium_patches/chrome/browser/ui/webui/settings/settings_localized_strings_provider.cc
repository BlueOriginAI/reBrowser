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

diff --git a/chrome/browser/ui/webui/settings/settings_ui.cc b/chrome/browser/ui/webui/settings/settings_ui.cc
--- a/chrome/browser/ui/webui/settings/settings_ui.cc
+++ b/chrome/browser/ui/webui/settings/settings_ui.cc
@@ -66,6 +66,9 @@
 #include "chrome/browser/ui/webui/settings/accessibility_main_handler.h"
 #include "chrome/browser/ui/webui/settings/appearance_handler.h"
 #include "chrome/browser/ui/webui/settings/browser_lifetime_handler.h"
+#include "chrome/browser/ui/webui/settings/browseros_metrics_handler.h"
+#include "chrome/browser/ui/webui/settings/remocode_account_handler.h"
+#include "chrome/browser/ui/webui/settings/remocode_sync_handler.h"
 #include "chrome/browser/ui/webui/settings/downloads_handler.h"
 #include "chrome/browser/ui/webui/settings/font_handler.h"
 #include "chrome/browser/ui/webui/settings/glic_handler.h"
@@ -227,6 +230,8 @@
   registry->RegisterBooleanPref(prefs::kImportDialogHistory, true);
   registry->RegisterBooleanPref(prefs::kImportDialogSavedPasswords, true);
   registry->RegisterBooleanPref(prefs::kImportDialogSearchEngine, true);
+  registry->RegisterBooleanPref(prefs::kImportDialogExtensions, true);
+  registry->RegisterBooleanPref(prefs::kImportDialogCookies, true);
 }
 
 SettingsUI::SettingsUI(content::WebUI* web_ui)
@@ -291,6 +296,9 @@
 #if BUILDFLAG(IS_WIN) || BUILDFLAG(IS_MAC)
   AddSettingsPageUIHandler(std::make_unique<PasskeysHandler>());
 #endif
+  AddSettingsPageUIHandler(std::make_unique<BrowserOSMetricsHandler>());
+  AddSettingsPageUIHandler(std::make_unique<RemocodeAccountHandler>());
+  AddSettingsPageUIHandler(std::make_unique<RemocodeSyncHandler>());
 
 #if BUILDFLAG(IS_CHROMEOS)
   InitBrowserSettingsWebUIHandlers();

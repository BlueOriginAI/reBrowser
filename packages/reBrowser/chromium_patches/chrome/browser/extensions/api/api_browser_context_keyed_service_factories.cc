diff --git a/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc b/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
--- a/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
+++ b/chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc
@@ -5,5 +5,6 @@
 #include "chrome/browser/extensions/api/bookmarks/bookmarks_api.h"
 #include "chrome/browser/extensions/api/bookmarks/bookmarks_api_watcher.h"
+#include "chrome/browser/extensions/api/browser_os/browser_os_change_detector.h"
 #include "chrome/browser/extensions/api/cookies/cookies_api.h"
 #include "chrome/browser/extensions/api/developer_private/developer_private_api.h"
 #include "chrome/browser/extensions/api/font_settings/font_settings_api.h"
@@ -84,6 +85,7 @@ void EnsureApiBrowserContextKeyedServiceFactoriesBuilt() {
   // APIs supported on Win/Mac/Linux plus desktop Android go here.
   extensions::BookmarksAPI::GetFactoryInstance();
   extensions::BookmarksApiWatcher::EnsureFactoryBuilt();
+  extensions::api::BrowserOSChangeDetector::GetFactoryInstance();
   extensions::CommandService::GetFactoryInstance();
   extensions::CookiesAPI::GetFactoryInstance();
   extensions::DeveloperPrivateAPI::GetFactoryInstance();

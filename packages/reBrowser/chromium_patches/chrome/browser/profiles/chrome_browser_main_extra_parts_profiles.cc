diff --git a/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc b/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
--- a/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
+++ b/chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc
@@ -3,6 +3,9 @@
 // found in the LICENSE file.
 
 #include "chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.h"
+
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "chrome/browser/browseros/sync/remocode_sync_service_factory.h"
 
 #include <memory>
 #include <utility>
@@ -683,6 +686,8 @@
 // static
 void ChromeBrowserMainExtraPartsProfiles::
     EnsureBrowserContextKeyedServiceFactoriesBuilt() {
+  remocode::AccountServiceFactory::GetInstance();
+  browseros::sync::RemocodeSyncServiceFactory::GetInstance();
   // ---------------------------------------------------------------------------
   // Redirect to those lists for factories that are part of those modules.
   // Module specific registration functions:

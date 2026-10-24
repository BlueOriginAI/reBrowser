diff --git a/chrome/common/chrome_paths_mac.mm b/chrome/common/chrome_paths_mac.mm
--- a/chrome/common/chrome_paths_mac.mm
+++ b/chrome/common/chrome_paths_mac.mm
@@ -18,6 +18,7 @@
 #include "base/strings/sys_string_conversions.h"
 #include "build/branding_buildflags.h"
 #include "build/build_config.h"
+#include "chrome/browser/browseros/buildflags.h"
 #include "chrome/common/chrome_constants.h"
 #include "chrome/common/chrome_paths_internal.h"
 
@@ -108,6 +109,22 @@
   base::FilePath cache_dir;
   if (!base::PathService::Get(base::DIR_CACHE, &cache_dir))
     return;
+
+#if BUILDFLAG(BROWSEROS_PRODUCT_BROWSERCLAW)
+  // Keep the existing profile and Safe Storage identities; only rebrand caches.
+  if (IsUsingDefaultDataDirectory().value_or(false)) {
+    base::FilePath default_data_dir;
+    if (GetDefaultUserDataDirectory(&default_data_dir)) {
+      base::FilePath product_cache_dir = cache_dir.Append("reBrowser");
+      if (profile_dir == default_data_dir ||
+          default_data_dir.AppendRelativePath(profile_dir, &product_cache_dir)) {
+        *result = product_cache_dir;
+        return;
+      }
+    }
+  }
+#endif
+
   if (!app_data_dir.AppendRelativePath(profile_dir, &cache_dir))
     return;
 

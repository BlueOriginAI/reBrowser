diff --git a/chrome/browser/extensions/api/browser_os/browser_os_change_detector.h b/chrome/browser/extensions/api/browser_os/browser_os_change_detector.h
new file mode 100644
index 0000000000000..39ed2d54a2fa5
--- /dev/null
+++ b/chrome/browser/extensions/api/browser_os/browser_os_change_detector.h
@@ -0,0 +1,48 @@
+// Copyright 2024 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_EXTENSIONS_API_BROWSER_OS_BROWSER_OS_CHANGE_DETECTOR_H_
+#define CHROME_BROWSER_EXTENSIONS_API_BROWSER_OS_BROWSER_OS_CHANGE_DETECTOR_H_
+
+#include "base/memory/raw_ptr.h"
+#include "components/prefs/pref_change_registrar.h"
+#include "extensions/browser/browser_context_keyed_api_factory.h"
+
+class Profile;
+
+namespace content {
+class BrowserContext;
+}  // namespace content
+
+namespace extensions::api {
+
+// Emits profile-scoped BrowserOS preference changes to extensions that hold the
+// existing browserOS permission.
+class BrowserOSChangeDetector : public BrowserContextKeyedAPI {
+ public:
+  static BrowserOSChangeDetector* Get(content::BrowserContext* context);
+  static BrowserContextKeyedAPIFactory<BrowserOSChangeDetector>*
+  GetFactoryInstance();
+  static const char* service_name() { return "BrowserOSChangeDetector"; }
+
+  BrowserOSChangeDetector(const BrowserOSChangeDetector&) = delete;
+  BrowserOSChangeDetector& operator=(const BrowserOSChangeDetector&) = delete;
+
+  explicit BrowserOSChangeDetector(content::BrowserContext* context);
+  ~BrowserOSChangeDetector() override;
+
+ private:
+  friend class BrowserContextKeyedAPIFactory<BrowserOSChangeDetector>;
+
+  static const bool kServiceIsCreatedWithBrowserContext = true;
+
+  void OnUILanguageChanged();
+
+  const raw_ptr<Profile> profile_;
+  PrefChangeRegistrar pref_change_registrar_;
+};
+
+}  // namespace extensions::api
+
+#endif  // CHROME_BROWSER_EXTENSIONS_API_BROWSER_OS_BROWSER_OS_CHANGE_DETECTOR_H_

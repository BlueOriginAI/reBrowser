diff --git a/chrome/browser/extensions/api/browser_os/browser_os_change_detector.cc b/chrome/browser/extensions/api/browser_os/browser_os_change_detector.cc
new file mode 100644
index 0000000000000..1429028f1893c
--- /dev/null
+++ b/chrome/browser/extensions/api/browser_os/browser_os_change_detector.cc
@@ -0,0 +1,64 @@
+// Copyright 2024 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include <memory>
+
+#include "chrome/browser/extensions/api/browser_os/browser_os_change_detector.h"
+
+#include "base/functional/bind.h"
+#include "base/lazy_instance.h"
+#include "base/values.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/common/extensions/api/browser_os.h"
+#include "extensions/browser/event_router.h"
+
+namespace extensions::api {
+
+namespace {
+
+base::LazyInstance<BrowserContextKeyedAPIFactory<BrowserOSChangeDetector>>::
+    DestructorAtExit g_browser_os_change_detector_factory =
+        LAZY_INSTANCE_INITIALIZER;
+
+}  // namespace
+
+BrowserOSChangeDetector::BrowserOSChangeDetector(
+    content::BrowserContext* context)
+    : profile_(Profile::FromBrowserContext(context)) {
+  pref_change_registrar_.Init(profile_->GetPrefs());
+  pref_change_registrar_.Add(
+      browseros::prefs::kUILanguage,
+      base::BindRepeating(&BrowserOSChangeDetector::OnUILanguageChanged,
+                          base::Unretained(this)));
+}
+
+BrowserOSChangeDetector::~BrowserOSChangeDetector() = default;
+
+// static
+BrowserOSChangeDetector* BrowserOSChangeDetector::Get(
+    content::BrowserContext* context) {
+  return BrowserContextKeyedAPIFactory<BrowserOSChangeDetector>::Get(context);
+}
+
+// static
+BrowserContextKeyedAPIFactory<BrowserOSChangeDetector>*
+BrowserOSChangeDetector::GetFactoryInstance() {
+  return g_browser_os_change_detector_factory.Pointer();
+}
+
+void BrowserOSChangeDetector::OnUILanguageChanged() {
+  EventRouter* event_router = EventRouter::Get(profile_);
+  if (!event_router) {
+    return;
+  }
+
+  base::ListValue args;
+  args.Append(profile_->GetPrefs()->GetString(browseros::prefs::kUILanguage));
+  event_router->BroadcastEvent(std::make_unique<Event>(
+      events::BROWSER_OS_ON_UI_LANGUAGE_CHANGED,
+      browser_os::OnUILanguageChanged::kEventName, std::move(args), profile_));
+}
+
+}  // namespace extensions::api

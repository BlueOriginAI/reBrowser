diff --git a/chrome/browser/ui/webui/settings/remocode_sync_handler.h b/chrome/browser/ui/webui/settings/remocode_sync_handler.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/ui/webui/settings/remocode_sync_handler.h
@@ -0,0 +1,26 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_UI_WEBUI_SETTINGS_REMOCODE_SYNC_HANDLER_H_
+#define CHROME_BROWSER_UI_WEBUI_SETTINGS_REMOCODE_SYNC_HANDLER_H_
+#include "base/callback_list.h"
+#include "chrome/browser/ui/webui/settings/settings_page_ui_handler.h"
+namespace browseros::sync { class RemocodeSyncService; }
+namespace settings {
+class RemocodeSyncHandler : public SettingsPageUIHandler {
+ public:
+  RemocodeSyncHandler();
+  ~RemocodeSyncHandler() override;
+  void RegisterMessages() override;
+ private:
+  enum class Command {
+    kGetState, kRefresh, kSetEnabled, kPrepareDelete, kDelete, kPurchase, kManage
+  };
+  void Handle(Command command, const base::ListValue& args);
+  browseros::sync::RemocodeSyncService* Service();
+  void Changed();
+  void OnJavascriptAllowed() override;
+  void OnJavascriptDisallowed() override;
+  base::CallbackListSubscription subscription_;
+};
+}  // namespace settings
+#endif

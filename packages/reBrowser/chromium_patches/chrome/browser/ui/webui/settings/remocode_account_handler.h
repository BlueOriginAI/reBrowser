diff --git a/chrome/browser/ui/webui/settings/remocode_account_handler.h b/chrome/browser/ui/webui/settings/remocode_account_handler.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/ui/webui/settings/remocode_account_handler.h
@@ -0,0 +1,27 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_UI_WEBUI_SETTINGS_REMOCODE_ACCOUNT_HANDLER_H_
+#define CHROME_BROWSER_UI_WEBUI_SETTINGS_REMOCODE_ACCOUNT_HANDLER_H_
+#include "base/callback_list.h"
+#include "base/values.h"
+#include "chrome/browser/ui/webui/settings/settings_page_ui_handler.h"
+namespace remocode { class AccountService; }
+namespace settings {
+class RemocodeAccountHandler : public SettingsPageUIHandler {
+ public:
+  RemocodeAccountHandler();
+  ~RemocodeAccountHandler() override;
+  void RegisterMessages() override;
+ private:
+  enum class Command { kLogin, kCancel, kLogout, kManage, kRetry };
+  remocode::AccountService* GetService();
+  base::DictValue GetState();
+  void HandleGetState(const base::ListValue& args);
+  void HandleCommand(Command command, const base::ListValue& args);
+  void OnStateChanged();
+  void OnJavascriptAllowed() override;
+  void OnJavascriptDisallowed() override;
+  base::CallbackListSubscription subscription_;
+};
+}  // namespace settings
+#endif

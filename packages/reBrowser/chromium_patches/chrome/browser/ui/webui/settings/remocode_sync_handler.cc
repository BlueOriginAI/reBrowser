diff --git a/chrome/browser/ui/webui/settings/remocode_sync_handler.cc b/chrome/browser/ui/webui/settings/remocode_sync_handler.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/ui/webui/settings/remocode_sync_handler.cc
@@ -0,0 +1,82 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/ui/webui/settings/remocode_sync_handler.h"
+#include "base/functional/bind.h"
+#include "chrome/browser/browseros/sync/remocode_sync_service.h"
+#include "chrome/browser/browseros/sync/remocode_sync_service_factory.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/navigator/browser_navigator.h"
+#include "chrome/browser/ui/navigator/browser_navigator_params.h"
+#include "content/public/browser/web_ui.h"
+#include "ui/base/page_transition_types.h"
+#include "ui/base/window_open_disposition.h"
+namespace settings {
+RemocodeSyncHandler::RemocodeSyncHandler() = default;
+RemocodeSyncHandler::~RemocodeSyncHandler() = default;
+void RemocodeSyncHandler::RegisterMessages() {
+  const std::pair<const char*, Command> commands[] = {
+      {"remocodeSyncGetState", Command::kGetState},
+      {"remocodeSyncRefresh", Command::kRefresh},
+      {"remocodeSyncRefreshIfStale", Command::kRefreshIfStale},
+      {"remocodeSyncSetEnabled", Command::kSetEnabled},
+      {"remocodeSyncPrepareDelete", Command::kPrepareDelete},
+      {"remocodeSyncDelete", Command::kDelete},
+      {"remocodeSyncPurchase", Command::kPurchase},
+      {"remocodeSyncManage", Command::kManage}};
+  for (const auto& [name, command] : commands) web_ui()->RegisterMessageCallback(name,
+      base::BindRepeating(&RemocodeSyncHandler::Handle, base::Unretained(this), command));
+}
+browseros::sync::RemocodeSyncService* RemocodeSyncHandler::Service() {
+  return browseros::sync::RemocodeSyncServiceFactory::GetForProfile(Profile::FromWebUI(web_ui()));
+}
+void RemocodeSyncHandler::Handle(Command command, const base::ListValue& args) {
+  if (args.empty() || !args[0].is_string()) return;
+  AllowJavascript();
+  auto* service = Service();
+  if (!service) { RejectJavascriptCallback(args[0], base::Value("profileUnavailable")); return; }
+  switch (command) {
+    case Command::kGetState:
+      if (args.size() != 1) break;
+      ResolveJavascriptCallback(args[0], service->GetState()); return;
+    case Command::kRefresh:
+    case Command::kRefreshIfStale:
+      if (args.size() != 1) break;
+      service->RefreshStatus(command == Command::kRefresh);
+      ResolveJavascriptCallback(args[0], service->GetState()); return;
+    case Command::kSetEnabled:
+      if (args.size() != 2 || !args[1].is_dict()) break;
+      ResolveJavascriptCallback(args[0], base::Value(service->SetEnabled(args[1].GetDict()))); return;
+    case Command::kPrepareDelete:
+      if (args.size() != 1) break;
+      ResolveJavascriptCallback(args[0], base::Value(service->PrepareCloudDeletion())); return;
+    case Command::kDelete:
+      if (args.size() != 2 || !args[1].is_string()) break;
+      ResolveJavascriptCallback(args[0], base::Value(service->DeleteCloud(args[1].GetString()))); return;
+    case Command::kPurchase:
+    case Command::kManage: {
+      // No WebUI URL, token, checkout ID or return URL is accepted. Opening the
+      // official account page never grants consent or supplies the OAuth bearer.
+      if (args.size() != 1) break;
+      const auto state = service->GetState();
+      const bool available = state.FindBool(command == Command::kPurchase ?
+          "purchaseAvailable" : "managementAvailable").value_or(false);
+      if (available) {
+        NavigateParams params(Profile::FromWebUI(web_ui()),
+            GURL("https://remocode.cc/me?product=rebrowser"), ui::PAGE_TRANSITION_LINK);
+        params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
+        Navigate(&params);
+      }
+      ResolveJavascriptCallback(args[0], base::Value(available)); return;
+    }
+  }
+  RejectJavascriptCallback(args[0], base::Value("invalidArguments"));
+}
+void RemocodeSyncHandler::Changed() {
+  if (IsJavascriptAllowed() && Service()) FireWebUIListener("remocode-sync-changed", Service()->GetState());
+}
+void RemocodeSyncHandler::OnJavascriptAllowed() {
+  if (auto* service = Service()) subscription_ = service->Observe(base::BindRepeating(
+      &RemocodeSyncHandler::Changed, base::Unretained(this)));
+}
+void RemocodeSyncHandler::OnJavascriptDisallowed() { subscription_ = {}; }
+}  // namespace settings

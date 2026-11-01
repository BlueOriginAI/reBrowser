diff --git a/chrome/browser/ui/webui/settings/remocode_account_handler.cc b/chrome/browser/ui/webui/settings/remocode_account_handler.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/ui/webui/settings/remocode_account_handler.cc
@@ -0,0 +1,124 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/ui/webui/settings/remocode_account_handler.h"
+#include "base/functional/bind.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/profiles/profiles_state.h"
+#include "chrome/browser/ui/profiles/profile_picker.h"
+#include "chrome/browser/ui/navigator/browser_navigator.h"
+#include "chrome/browser/ui/navigator/browser_navigator_params.h"
+#include "content/public/browser/web_ui.h"
+#include "ui/base/page_transition_types.h"
+#include "ui/base/window_open_disposition.h"
+#include "ui/base/webui/web_ui_util.h"
+
+namespace settings {
+namespace {
+bool CanAddProfile(Profile* profile) {
+  return profile && profile->IsRegularProfile() &&
+         !profile->IsOffTheRecord() && !profile->IsGuestSession() &&
+         profiles::IsProfileCreationAllowed();
+}
+void OpenAccountURL(Profile* profile, const GURL& url) {
+  NavigateParams params(profile, url, ui::PAGE_TRANSITION_LINK);
+  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
+  Navigate(&params);
+}
+}  // namespace
+RemocodeAccountHandler::RemocodeAccountHandler() = default;
+RemocodeAccountHandler::~RemocodeAccountHandler() = default;
+void RemocodeAccountHandler::RegisterMessages() {
+  web_ui()->RegisterMessageCallback("remocodeAccountGetState",
+      base::BindRepeating(&RemocodeAccountHandler::HandleGetState,
+                          base::Unretained(this)));
+  web_ui()->RegisterMessageCallback("remocodeAccountAddProfile",
+      base::BindRepeating(&RemocodeAccountHandler::HandleAddProfile,
+                          base::Unretained(this)));
+  const std::pair<const char*, Command> commands[] = {
+      {"remocodeAccountLogin", Command::kLogin},
+      {"remocodeAccountCancel", Command::kCancel},
+      {"remocodeAccountLogout", Command::kLogout},
+      {"remocodeAccountManage", Command::kManage},
+      {"remocodeAccountRetry", Command::kRetry}};
+  for (const auto& [name, command] : commands) {
+    web_ui()->RegisterMessageCallback(name,
+        base::BindRepeating(&RemocodeAccountHandler::HandleCommand,
+                            base::Unretained(this), command));
+  }
+}
+remocode::AccountService* RemocodeAccountHandler::GetService() {
+  return remocode::AccountServiceFactory::GetForProfile(
+      Profile::FromWebUI(web_ui()));
+}
+base::DictValue RemocodeAccountHandler::GetState() {
+  if (auto* service = GetService()) {
+    auto state = service->GetState();
+    state.Set("canAddProfile", CanAddProfile(Profile::FromWebUI(web_ui())));
+    if (state.FindString("state") && *state.FindString("state") == "signedIn" &&
+        !service->GetAvatarImage().isNull()) {
+      state.Set("avatarDataUrl", webui::GetBitmapDataUrl(
+          *service->GetAvatarImage().bitmap()));
+    }
+    return state;
+  }
+  base::DictValue result;
+  result.Set("canAddProfile", CanAddProfile(Profile::FromWebUI(web_ui())));
+  result.Set("state", "error");
+  result.Set("message", "profileUnavailable");
+  result.Set("busy", false);
+  result.Set("displayName", "");
+  result.Set("email", "");
+  return result;
+}
+void RemocodeAccountHandler::HandleGetState(const base::ListValue& args) {
+  if (args.size() != 1 || !args[0].is_string()) return;
+  AllowJavascript();
+  ResolveJavascriptCallback(args[0], GetState());
+}
+void RemocodeAccountHandler::HandleAddProfile(const base::ListValue& args) {
+  // No caller-supplied profile path or URL. Match the native profile menu's
+  // policy and open its existing creation flow without copying account data.
+  if (!args.empty() || !CanAddProfile(Profile::FromWebUI(web_ui()))) return;
+  ProfilePicker::Show(ProfilePicker::Params::FromEntryPoint(
+      ProfilePicker::EntryPoint::kProfileMenuAddNewProfile));
+}
+void RemocodeAccountHandler::HandleCommand(
+    Command command, const base::ListValue& args) {
+  AllowJavascript();
+  if (!args.empty()) { OnStateChanged(); return; }
+  auto* service = GetService();
+  if (!service) { OnStateChanged(); return; }
+  switch (command) {
+    case Command::kLogin:
+      // The only URL opened for login is constructed by the native service.
+      // Its weak callback bounds this raw Profile to the service lifetime.
+      service->Login(base::BindOnce(&OpenAccountURL,
+                                    Profile::FromWebUI(web_ui())));
+      break;
+    case Command::kCancel: service->Cancel(); break;
+    case Command::kLogout: service->Logout(); break;
+    case Command::kRetry: service->Retry(); break;
+    case Command::kManage:
+      OpenAccountURL(Profile::FromWebUI(web_ui()), GURL("https://remocode.cc/me"));
+      break;
+  }
+  // Acknowledge even no-op commands, so UI pending state is never stuck.
+  OnStateChanged();
+}
+void RemocodeAccountHandler::OnStateChanged() {
+  if (IsJavascriptAllowed()) {
+    FireWebUIListener("remocode-account-changed", GetState());
+  }
+}
+void RemocodeAccountHandler::OnJavascriptAllowed() {
+  if (auto* service = GetService()) {
+    subscription_ = service->Observe(base::BindRepeating(
+        &RemocodeAccountHandler::OnStateChanged, base::Unretained(this)));
+  }
+}
+void RemocodeAccountHandler::OnJavascriptDisallowed() {
+  subscription_ = {};
+}
+}  // namespace settings

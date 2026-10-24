diff --git a/chrome/browser/browseros/account/remocode_oauth.h b/chrome/browser/browseros/account/remocode_oauth.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_oauth.h
@@ -0,0 +1,33 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_OAUTH_H_
+#define CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_OAUTH_H_
+
+#include <optional>
+#include <string>
+#include <string_view>
+#include "url/gurl.h"
+
+namespace remocode {
+inline constexpr char kCallbackUrl[] =
+    "http://127.0.0.1:48123/remocode/callback";
+inline constexpr char kBrokerUrl[] = "https://remocode.cc/account/api/desktop";
+inline constexpr char kRefreshPref[] = "remocode.account.encrypted_refresh";
+
+std::string RandomOAuthSecret();
+std::string PKCEChallenge(std::string_view verifier);
+bool IsValidPKCEVerifier(std::string_view verifier);
+GURL AuthorizationURL(std::string_view state, std::string_view verifier);
+bool ValidateAuthorizationURL(const GURL& url, std::string_view state,
+                              std::string_view verifier);
+struct OAuthCallback {
+  std::string code;
+  bool denied = false;
+};
+// Only a matching state and an authorization code are accepted here. Tokens
+// and account claims from the redirect are never trusted.
+std::optional<OAuthCallback> ValidateCallback(
+    std::string_view method, std::string_view host, std::string_view path,
+    std::string_view expected_state);
+}  // namespace remocode
+#endif

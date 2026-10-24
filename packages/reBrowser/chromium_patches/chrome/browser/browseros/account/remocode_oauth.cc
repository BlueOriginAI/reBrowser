diff --git a/chrome/browser/browseros/account/remocode_oauth.cc b/chrome/browser/browseros/account/remocode_oauth.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_oauth.cc
@@ -0,0 +1,103 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_oauth.h"
+
+#include <map>
+#include <set>
+#include <utility>
+#include "base/base64url.h"
+#include "base/rand_util.h"
+#include "crypto/sha2.h"
+#include "net/base/url_util.h"
+
+namespace remocode {
+namespace {
+std::string Base64URL(std::string_view value) {
+  std::string result;
+  base::Base64UrlEncode(value, base::Base64UrlEncodePolicy::OMIT_PADDING,
+                        &result);
+  return result;
+}
+}  // namespace
+std::string RandomOAuthSecret() {
+  return Base64URL(base::RandBytesAsString(32));
+}
+std::string PKCEChallenge(std::string_view verifier) {
+  return Base64URL(crypto::SHA256HashString(verifier));
+}
+bool IsValidPKCEVerifier(std::string_view verifier) {
+  return verifier.size() >= 43 && verifier.size() <= 128 &&
+      verifier.find_first_not_of(
+          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") ==
+          std::string_view::npos;
+}
+GURL AuthorizationURL(std::string_view state, std::string_view verifier) {
+  GURL url("https://clerk.remocode.cc/oauth/authorize");
+  for (const auto& [key, value] : {
+           std::pair<std::string, std::string>{"client_id", "JKlymHmgY2g0XAsD"},
+           {"redirect_uri", kCallbackUrl},
+           {"resource", "https://remocode.cc/account/api/desktop"},
+           {"scope", "email profile offline_access"},
+           {"response_type", "code"},
+           {"code_challenge_method", "S256"},
+           {"code_challenge", PKCEChallenge(verifier)},
+           {"state", std::string(state)}}) {
+    url = net::AppendQueryParameter(url, key, value);
+  }
+  return url;
+}
+bool ValidateAuthorizationURL(const GURL& url, std::string_view state,
+                              std::string_view verifier) {
+  if (!url.is_valid() || !url.SchemeIs("https") ||
+      url.host() != "clerk.remocode.cc" || url.EffectiveIntPort() != 443 ||
+      url.path() != "/oauth/authorize" || url.has_username() ||
+      url.has_password() || url.has_ref()) return false;
+  std::map<std::string, std::string> parameters;
+  for (net::QueryIterator it(url); !it.IsAtEnd(); it.Advance()) {
+    if (!parameters.emplace(std::string(it.GetKey()),
+                            it.GetUnescapedValue()).second) return false;
+  }
+  const GURL expected = AuthorizationURL(state, verifier);
+  for (net::QueryIterator it(expected); !it.IsAtEnd(); it.Advance()) {
+    auto found = parameters.find(std::string(it.GetKey()));
+    if (found == parameters.end() || found->second != it.GetUnescapedValue())
+      return false;
+    parameters.erase(found);
+  }
+  // The broker may request consent explicitly. Reject other extra/encoded
+  // parameter aliases, which providers could interpret as duplicate keys.
+  return parameters.empty() ||
+      (parameters.size() == 1 && parameters.begin()->first == "prompt" &&
+       parameters.begin()->second == "consent");
+}
+std::optional<OAuthCallback> ValidateCallback(
+    std::string_view method, std::string_view host, std::string_view path,
+    std::string_view expected_state) {
+  if (method != "GET" || host != "127.0.0.1:48123" ||
+      expected_state.empty() || path.size() > 8192 ||
+      !path.starts_with("/remocode/callback?")) {
+    return std::nullopt;
+  }
+  GURL url(std::string("http://127.0.0.1:48123") + std::string(path));
+  if (!url.is_valid() || url.has_ref() ||
+      url.path() != "/remocode/callback") {
+    return std::nullopt;
+  }
+  std::set<std::string> keys;
+  std::string state, code, error;
+  for (net::QueryIterator it(url); !it.IsAtEnd(); it.Advance()) {
+    const std::string key(it.GetKey());
+    if (!keys.insert(key).second) {
+      return std::nullopt;
+    }
+    if (key == "state") state = it.GetUnescapedValue();
+    if (key == "code") code = it.GetUnescapedValue();
+    if (key == "error") error = it.GetUnescapedValue();
+  }
+  if (state != expected_state || (code.empty() == error.empty()) ||
+      code.size() > 4096) {
+    return std::nullopt;
+  }
+  return OAuthCallback{std::move(code), !error.empty()};
+}
+}  // namespace remocode

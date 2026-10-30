diff --git a/chrome/browser/browseros/account/remocode_oauth_unittest.cc b/chrome/browser/browseros/account/remocode_oauth_unittest.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_oauth_unittest.cc
@@ -0,0 +1,103 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_oauth.h"
+#include "net/base/url_util.h"
+#include "testing/gtest/include/gtest/gtest.h"
+
+namespace remocode {
+TEST(RemocodeOAuthTest, RFC7636S256Vector) {
+  EXPECT_EQ("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
+      PKCEChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
+}
+TEST(RemocodeOAuthTest, AuthorizationContract) {
+  const GURL url = AuthorizationURL("state", "verifier");
+  EXPECT_EQ("https", url.scheme());
+  EXPECT_EQ("clerk.remocode.cc", url.host());
+  EXPECT_EQ("/oauth/authorize", url.path());
+  for (const auto& [key, expected] : {
+      std::pair<std::string, std::string>{"client_id", "JKlymHmgY2g0XAsD"},
+      {"resource", kBrokerUrl}, {"redirect_uri", kCallbackUrl},
+      {"scope", "email profile offline_access"}, {"response_type", "code"},
+      {"code_challenge_method", "S256"}, {"state", "state"},
+      {"code_challenge", PKCEChallenge("verifier")}}) {
+    std::string value;
+    EXPECT_TRUE(net::GetValueForKeyInQuery(url, key, &value));
+    EXPECT_EQ(expected, value);
+  }
+  EXPECT_FALSE(url.spec().contains("verifier="));
+}
+TEST(RemocodeOAuthTest, BrokerAuthorizationURLCannotChangeTransaction) {
+  const GURL good = AuthorizationURL("s", "v");
+  EXPECT_TRUE(ValidateAuthorizationURL(good, "s", "v"));
+  EXPECT_TRUE(ValidateAuthorizationURL(
+      net::AppendQueryParameter(good, "prompt", "consent"), "s", "v"));
+  EXPECT_FALSE(ValidateAuthorizationURL(good, "wrong", "v"));
+  EXPECT_FALSE(ValidateAuthorizationURL(good, "s", "wrong"));
+  EXPECT_FALSE(ValidateAuthorizationURL(
+      net::AppendQueryParameter(good, "state", "s"), "s", "v"));
+  EXPECT_FALSE(ValidateAuthorizationURL(
+      net::AppendQueryParameter(good, "redirect_uri", "https://evil.test"), "s", "v"));
+  EXPECT_FALSE(ValidateAuthorizationURL(
+      net::AppendQueryParameter(good, "response_mode", "web_message"), "s", "v"));
+  for (const auto* bad : {"http://clerk.remocode.cc/oauth/authorize",
+      "https://clerk.remocode.cc.evil.test/oauth/authorize",
+      "https://clerk.remocode.cc:444/oauth/authorize",
+      "https://attacker@clerk.remocode.cc/oauth/authorize",
+      "https://clerk.remocode.cc/other"}) {
+    EXPECT_FALSE(ValidateAuthorizationURL(GURL(bad), "s", "v"));
+  }
+}
+TEST(RemocodeOAuthTest, BrokerVerifierHasStrictLengthAndAlphabet) {
+  EXPECT_TRUE(IsValidPKCEVerifier(std::string(43, 'a')));
+  EXPECT_TRUE(IsValidPKCEVerifier(std::string(128, '_')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(42, 'a')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(129, 'a')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(43, '+')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(43, '=')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(43, '.')));
+  EXPECT_FALSE(IsValidPKCEVerifier(std::string(43, '\n')));
+}
+TEST(RemocodeOAuthTest, RandomSecretsAreURLSafeAndIndependent) {
+  const auto first = RandomOAuthSecret();
+  const auto second = RandomOAuthSecret();
+  EXPECT_EQ(first.size(), 43u);
+  EXPECT_NE(first, second);
+  EXPECT_EQ(first.find_first_not_of(
+      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"),
+      std::string::npos);
+}
+TEST(RemocodeOAuthTest, ExactHostPathAndMethod) {
+  constexpr char path[] = "/remocode/callback?state=s&code=c";
+  auto result = ValidateCallback("GET", "127.0.0.1:48123", path, "s");
+  ASSERT_TRUE(result);
+  EXPECT_EQ("c", result->code);
+  EXPECT_FALSE(result->denied);
+  EXPECT_FALSE(ValidateCallback("POST", "127.0.0.1:48123", path, "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "localhost:48123", path, "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48124", path, "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "evil.test", path, "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123,evil.test", path, "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123", path, "wrong"));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123", path, ""));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123",
+      "/remocode/callback/extra?state=s&code=c", "s"));
+  EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123",
+      "http://127.0.0.1:48123/remocode/callback?state=s&code=c", "s"));
+}
+TEST(RemocodeOAuthTest, RejectsReplayAmbiguityAndCredentialsInRedirect) {
+  for (const auto* path : {
+      "/remocode/callback?state=s&state=s&code=c",
+      "/remocode/callback?state=s&code=c&code=d",
+      "/remocode/callback?state=s&code=c&error=denied",
+      "/remocode/callback?state=s&accessToken=fake&refreshToken=fake",
+      "/remocode/callback?state=s&code=",
+      "/remocode/callback?state=s&code=c#fragment",
+      "/remocode/callback?code=c"}) {
+    EXPECT_FALSE(ValidateCallback("GET", "127.0.0.1:48123", path, "s")) << path;
+  }
+  const auto denied = ValidateCallback("GET", "127.0.0.1:48123",
+      "/remocode/callback?state=s&error=access_denied", "s");
+  ASSERT_TRUE(denied);
+  EXPECT_TRUE(denied->denied);
+}
+}  // namespace remocode

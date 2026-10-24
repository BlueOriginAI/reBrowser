diff --git a/chrome/browser/browseros/sync/sensitive_sync_path.h b/chrome/browser/browseros/sync/sensitive_sync_path.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/sensitive_sync_path.h
@@ -0,0 +1,79 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_SENSITIVE_SYNC_PATH_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_SENSITIVE_SYNC_PATH_H_
+
+#include <string>
+#include <string_view>
+
+namespace browseros::sync::internal {
+inline constexpr int kSyncUrlPathPolicyVersion = 2;
+
+inline int PathHexDigit(char c) {
+  if (c >= '0' && c <= '9') return c - '0';
+  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
+  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
+  return -1;
+}
+
+inline bool ValidPathUtf8(std::string_view text) {
+  for (size_t i = 0; i < text.size();) {
+    const auto c = static_cast<unsigned char>(text[i]);
+    if (c < 0x80) { ++i; continue; }
+    const size_t extra = c >= 0xc2 && c <= 0xdf ? 1 :
+        c >= 0xe0 && c <= 0xef ? 2 : c >= 0xf0 && c <= 0xf4 ? 3 : 0;
+    if (!extra || i + extra >= text.size()) return false;
+    const auto next = static_cast<unsigned char>(text[i + 1]);
+    if ((c == 0xe0 && next < 0xa0) || (c == 0xed && next >= 0xa0) ||
+        (c == 0xf0 && next < 0x90) || (c == 0xf4 && next > 0x8f)) return false;
+    for (size_t j = 1; j <= extra; ++j) {
+      const auto part = static_cast<unsigned char>(text[i + j]);
+      if (part < 0x80 || part > 0xbf) return false;
+    }
+    i += extra + 1;
+  }
+  return true;
+}
+
+inline bool IsSensitiveOrAmbiguousSyncPath(std::string_view encoded) {
+  std::string decoded;
+  decoded.reserve(encoded.size());
+  for (size_t i = 0; i < encoded.size(); ++i) {
+    char value = encoded[i];
+    if (value == '\\' || value == '?' || value == '#') return true;
+    if (value == '%') {
+      if (i + 2 >= encoded.size()) return true;
+      const int high = PathHexDigit(encoded[i + 1]);
+      const int low = PathHexDigit(encoded[i + 2]);
+      if (high < 0 || low < 0) return true;
+      value = static_cast<char>((high << 4) | low);
+      if (value == '/' || value == '\\' || value == '?' || value == '#') return true;
+      i += 2;
+    }
+    const auto byte = static_cast<unsigned char>(value);
+    if (byte < 0x20 || byte == 0x7f) return true;
+    decoded.push_back(value >= 'A' && value <= 'Z' ? value - 'A' + 'a' : value);
+  }
+  if (!ValidPathUtf8(decoded)) return true;
+  for (size_t i = 0; i + 2 < decoded.size(); ++i) {
+    if (decoded[i] == '%' && PathHexDigit(decoded[i + 1]) >= 0 &&
+        PathHexDigit(decoded[i + 2]) >= 0) return true;
+  }
+  std::string_view path(decoded);
+  while (!path.empty()) {
+    const auto slash = path.find('/');
+    auto route = path.substr(0, slash);
+    route = route.substr(0, route.find(';'));
+    for (const auto prefix : {"oauth", "callback", "authorize", "reset-password"}) {
+      if (route.starts_with(prefix)) return true;
+    }
+    for (const auto exact : {"auth", "sso", "saml", "authorization", "magic-link", "verify-email"}) {
+      if (route == exact) return true;
+    }
+    if (slash == std::string_view::npos) break;
+    path.remove_prefix(slash + 1);
+  }
+  return false;
+}
+}  // namespace browseros::sync::internal
+#endif  // CHROME_BROWSER_BROWSEROS_SYNC_SENSITIVE_SYNC_PATH_H_

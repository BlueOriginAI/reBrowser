diff --git a/chrome/browser/browseros/sync/adapters/sync_adapter_util.cc b/chrome/browser/browseros/sync/adapters/sync_adapter_util.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/adapters/sync_adapter_util.cc
@@ -0,0 +1,204 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+#include "chrome/browser/browseros/sync/adapters/sync_adapter_util.h"
+
+#include <cmath>
+#include <set>
+
+#include "base/strings/string_util.h"
+#include "base/strings/utf_string_conversions.h"
+#include "base/time/time.h"
+#include "base/uuid.h"
+#include "net/base/ip_address.h"
+#include "net/base/url_util.h"
+
+namespace browseros::sync::internal {
+
+std::optional<base::ListValue> NormalizeBatch(const base::ListValue& entries,
+                                            bool bookmark) {
+  if (entries.size() > kMaxBatchSize) {
+    return std::nullopt;
+  }
+  base::ListValue result;
+  std::set<std::string> ids;
+  for (const auto& value : entries) {
+    auto entry = NormalizeEntry(value, bookmark);
+    if (!entry || !ids.insert(*entry->FindString("id")).second) {
+      return std::nullopt;
+    }
+    result.Append(std::move(*entry));
+  }
+  return result;
+}
+
+std::optional<GURL> SanitizeURL(const GURL& url) {
+  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() ||
+      url.has_username() || url.has_password() || url.spec().size() > 4096 ||
+      net::IsLocalhost(url) || net::IsHostnameNonUnique(url.HostNoBracketsPiece())) {
+    return std::nullopt;
+  }
+  net::IPAddress address;
+  if (address.AssignFromIPLiteral(url.HostNoBrackets()) &&
+      !address.IsPubliclyRoutable()) {
+    return std::nullopt;
+  }
+  const std::string host = base::ToLowerASCII(url.host());
+  for (std::string_view suffix : {".local", ".localhost", ".internal", ".lan",
+                                  ".home", ".corp", ".onion", ".invalid",
+                                  ".test"}) {
+    if (base::EndsWith(host, suffix)) {
+      return std::nullopt;
+    }
+  }
+  // Encoded path segments can conceal credential-bearing routes. Reject rather
+  // than decode and risk exporting an unrecognized authorization path.
+  const std::string route = base::ToLowerASCII(url.path());
+  if (route.find('%') != std::string::npos) {
+    return std::nullopt;
+  }
+  for (std::string_view token : {"auth", "login", "signin", "sign-in", "logout",
+                                 "password", "passwd", "token", "session",
+                                 "account", "callback", "reset", "verify",
+                                 "payment", "checkout", "credential", "secret"}) {
+    if (route.find(token) != std::string::npos ||
+        host.find(token) != std::string::npos) {
+      return std::nullopt;
+    }
+  }
+  const std::string query = base::ToLowerASCII(url.query());
+  const std::string fragment = base::ToLowerASCII(url.ref());
+  if (query.find('%') != std::string::npos) {
+    return std::nullopt;
+  }
+  for (std::string_view token : {"token", "auth", "password", "session", "code=",
+                                 "key=", "secret", "credential"}) {
+    if (query.find(token) != std::string::npos ||
+        fragment.find(token) != std::string::npos) {
+      return std::nullopt;
+    }
+  }
+  GURL::Replacements replacements;
+  replacements.ClearQuery();
+  replacements.ClearRef();
+  return url.ReplaceComponents(replacements);
+}
+
+std::string SafeTitle(std::u16string_view title, size_t max_bytes) {
+  std::u16string bounded(title.substr(0, max_bytes));
+  // Do not split a UTF-16 surrogate pair at the limit.
+  if (!bounded.empty() && bounded.back() >= 0xd800 && bounded.back() <= 0xdbff) {
+    bounded.pop_back();
+  }
+  for (char16_t& c : bounded) {
+    if (c < 0x20 || c == 0x7f) {
+      c = u' ';
+    }
+  }
+  std::string result;
+  base::TruncateUTF8ToByteSize(base::UTF16ToUTF8(bounded), max_bytes, &result);
+  return result;
+}
+
+bool IsRootId(std::string_view id) {
+  return id == "root:toolbar" || id == "root:other" || id == "root:mobile";
+}
+
+bool IsEventId(std::string_view id) {
+  const base::Uuid uuid = base::Uuid::ParseLowercase(id);
+  return uuid.is_valid() && uuid.AsLowercaseString() == id;
+}
+
+std::optional<base::DictValue> NormalizeEntry(const base::Value& value,
+                                           bool bookmark) {
+  if (!value.is_dict()) {
+    return std::nullopt;
+  }
+  const auto& entry = value.GetDict();
+  const std::string* id = entry.FindString("id");
+  const auto deleted = entry.FindBool("deleted");
+  if (!id || !IsEventId(*id) || !deleted.has_value()) {
+    return std::nullopt;
+  }
+  const std::set<std::string_view> common = {"id", "deleted", "revision"};
+  const std::set<std::string_view> fields = bookmark
+      ? std::set<std::string_view>{"parentId", "afterId", "title", "url"}
+      : std::set<std::string_view>{"url", "title", "visitedAt"};
+  for (const auto item : entry) {
+    if (!common.contains(item.first) &&
+        (*deleted || !fields.contains(item.first))) {
+      return std::nullopt;
+    }
+  }
+  base::DictValue result;
+  result.Set("id", *id);
+  result.Set("deleted", *deleted);
+  if (const base::Value* revision = entry.Find("revision")) {
+    if (!revision->is_int() && !revision->is_double()) {
+      return std::nullopt;
+    }
+    const double number = revision->GetDouble();
+    if (!std::isfinite(number) || number < 0 ||
+        number > 9007199254740991.0 || std::floor(number) != number) {
+      return std::nullopt;
+    }
+    result.Set("revision", number);
+  }
+  if (*deleted) {
+    return result;
+  }
+  const std::string* title = entry.FindString("title");
+  const base::Value* url = entry.Find("url");
+  const size_t title_limit = bookmark ? kBookmarkTitleBytes : kHistoryTitleBytes;
+  if (!title || !url || !base::IsStringUTF8(*title) ||
+      title->size() > title_limit) {
+    return std::nullopt;
+  }
+  result.Set("title", *title);
+  if (bookmark && url->is_none()) {
+    result.Set("url", base::Value());
+  } else {
+    if (!url->is_string()) {
+      return std::nullopt;
+    }
+    auto safe = SanitizeURL(GURL(url->GetString()));
+    if (!safe || safe->spec() != url->GetString()) {
+      return std::nullopt;
+    }
+    result.Set("url", safe->spec());
+  }
+  if (bookmark) {
+    const std::string* parent = entry.FindString("parentId");
+    const base::Value* after = entry.Find("afterId");
+    if (!parent || (!IsRootId(*parent) && !IsEventId(*parent)) || *parent == *id ||
+        !after || (!after->is_none() && !after->is_string())) {
+      return std::nullopt;
+    }
+    std::string predecessor = after->is_none() ? "" : after->GetString();
+    if ((!predecessor.empty() && !IsEventId(predecessor)) || predecessor == *id) {
+      return std::nullopt;
+    }
+    result.Set("parentId", *parent);
+    result.Set("afterId", predecessor);
+  } else {
+    const base::Value* time = entry.Find("visitedAt");
+    if (!time || (!time->is_int() && !time->is_double())) {
+      return std::nullopt;
+    }
+    const double ms = time->GetDouble();
+    if (!std::isfinite(ms) || ms <= 0 || std::floor(ms) != ms ||
+        ms > (base::Time::Now() + base::Minutes(5)).InMillisecondsFSinceUnixEpoch()) {
+      return std::nullopt;
+    }
+    result.Set("visitedAt", ms);
+  }
+  return result;
+}
+
+base::DictValue Content(const base::DictValue& entry) {
+  auto content = entry.Clone();
+  content.Remove("revision");
+  return content;
+}
+
+}  // namespace browseros::sync::internal

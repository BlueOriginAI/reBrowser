diff --git a/chrome/browser/browseros/sync/sync_protocol.cc b/chrome/browser/browseros/sync/sync_protocol.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/sync_protocol.cc
@@ -0,0 +1,181 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/sync_protocol.h"
+#include "chrome/browser/browseros/sync/sensitive_sync_path.h"
+#include <cmath>
+#include <map>
+#include <set>
+#include "base/uuid.h"
+#include "base/strings/utf_string_conversions.h"
+#include "base/strings/string_util.h"
+#include "net/base/ip_address.h"
+#include "net/base/url_util.h"
+#include "url/gurl.h"
+namespace browseros::sync {
+namespace {
+bool UUID(const std::string* id) {
+  return id && base::Uuid::ParseLowercase(*id).is_valid();
+}
+bool Parent(const std::string* id) {
+  return UUID(id) || (id && (*id == "root:toolbar" || *id == "root:other" ||
+                            *id == "root:mobile"));
+}
+std::optional<std::string> SafeURL(const std::string& raw, bool inbound) {
+  if (raw.size() > 4096) return std::nullopt;
+  GURL url(raw);
+  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() || !url.has_host() ||
+      net::IsLocalhost(url) || url.host().find('.') == std::string::npos)
+    return std::nullopt;
+  net::IPAddress ip;
+  if (ip.AssignFromIPLiteral(url.HostNoBrackets()) && !ip.IsPubliclyRoutable())
+    return std::nullopt;
+  const std::string_view host = url.host();
+  for (const auto* suffix : {".local", ".internal", ".lan", ".localhost", ".home"}) {
+    if (host.ends_with(suffix)) return std::nullopt;
+  }
+  if (internal::IsSensitiveOrAmbiguousSyncPath(url.path())) return std::nullopt;
+  GURL::Replacements clear;
+  clear.ClearUsername(); clear.ClearPassword(); clear.ClearQuery(); clear.ClearRef();
+  const std::string clean = url.ReplaceComponents(clear).spec();
+  if (inbound && clean != raw) return std::nullopt;
+  return clean;
+}
+}  // namespace
+std::optional<double> WireNumber(const base::DictValue& data, std::string_view key) {
+  const auto* value = data.Find(key);
+  if (!value || (!value->is_int() && !value->is_double())) return std::nullopt;
+  double n = value->is_int() ? value->GetInt() : value->GetDouble();
+  if (!std::isfinite(n) || n < 0 || n > 9007199254740991.0 || std::floor(n) != n)
+    return std::nullopt;
+  return n;
+}
+std::optional<base::DictValue> NormalizeEntry(std::string_view stream,
+                                             const base::DictValue& entry,
+                                             bool inbound) {
+  if (stream != "bookmarks" && stream != "history" && stream != "agent_history")
+    return std::nullopt;
+  const auto* id = entry.FindString("id");
+  if (!UUID(id)) return std::nullopt;
+  auto revision = WireNumber(entry, "revision");
+  if (inbound && !revision) return std::nullopt;
+  base::DictValue out;
+  out.Set("id", *id);
+  out.Set("revision", revision.value_or(0));
+  const auto deleted = entry.FindBool("deleted");
+  if (inbound && !deleted) return std::nullopt;
+  out.Set("deleted", deleted.value_or(false));
+  if (deleted.value_or(false)) return out;
+  const auto* title = entry.FindString("title");
+  if (!title || !base::IsStringUTF8(*title)) return std::nullopt;
+  const size_t title_limit = stream == "bookmarks" ? 2048 : 1024;
+  if (inbound) {
+    if (title->size() > title_limit) return std::nullopt;
+    out.Set("title", *title);
+  } else {
+    std::string bounded;
+    base::TruncateUTF8ToByteSize(*title, title_limit, &bounded);
+    out.Set("title", std::move(bounded));
+  }
+  const auto* url_value = entry.Find("url");
+  if (!url_value) return std::nullopt;
+  if (stream == "bookmarks" && url_value->is_none()) {
+    out.Set("url", base::Value());
+  } else {
+    if (!url_value->is_string()) return std::nullopt;
+    auto clean = SafeURL(url_value->GetString(), inbound);
+    if (!clean) return std::nullopt;
+    out.Set("url", *clean);
+  }
+  if (stream == "bookmarks") {
+    const auto* parent = entry.FindString("parentId");
+    if (!Parent(parent) || *parent == *id) return std::nullopt;
+    out.Set("parentId", *parent);
+    const auto* after = entry.Find("afterId");
+    if (!after || (!after->is_none() && !after->is_string())) return std::nullopt;
+    const std::string after_id = after->is_string() ? after->GetString() : "";
+    if ((!after_id.empty() && !UUID(&after_id)) || after_id == *id)
+      return std::nullopt;
+    out.Set("afterId", after_id.empty() ? base::Value() : base::Value(after_id));
+  } else {
+    auto time = WireNumber(entry, "visitedAt");
+    if (!time || *time == 0) return std::nullopt;
+    out.Set("visitedAt", *time);
+    if (stream == "agent_history") {
+      const auto* agent = entry.FindString("agentId");
+      const auto* session = entry.FindString("sessionId");
+      if (!UUID(agent) || !UUID(session)) return std::nullopt;
+      out.Set("agentId", *agent); out.Set("sessionId", *session);
+    }
+  }
+  return out;
+}
+std::optional<base::ListValue> OrderBookmarkOperations(
+    const base::ListValue& operations, const base::DictValue& known, size_t limit) {
+  std::map<std::string, const base::DictValue*> candidates;
+  for (const auto& value : operations) {
+    if (!value.is_dict()) return std::nullopt;
+    const auto* id = value.GetDict().FindString("id");
+    const auto* kind = value.GetDict().FindString("kind");
+    if (!id || !kind || (*kind != "put" && *kind != "delete") ||
+        !candidates.emplace(*id, &value.GetDict()).second) return std::nullopt;
+  }
+  base::ListValue result;
+  std::set<std::string> selected;
+  auto satisfied = [&](const std::string& id) {
+    if (id.empty() || id == "root:toolbar" || id == "root:other" || id == "root:mobile")
+      return true;
+    auto candidate = candidates.find(id);
+    if (candidate != candidates.end()) return selected.contains(id) &&
+        *candidate->second->FindString("kind") == "put";
+    const auto* entry = known.FindDict(id);
+    return entry && !entry->FindBool("deleted").value_or(false);
+  };
+  while (selected.size() < candidates.size() && result.size() < limit) {
+    bool progress = false;
+    for (const auto& [id, op] : candidates) {
+      if (selected.contains(id)) continue;
+      bool ready = true;
+      if (*op->FindString("kind") == "put") {
+        const auto* parent = op->FindString("parentId");
+        const auto* after = op->Find("afterId");
+        if (!parent || !after || (!after->is_none() && !after->is_string())) return std::nullopt;
+        ready = satisfied(*parent) && satisfied(after->is_string() ? after->GetString() : "");
+      } else {
+        for (auto [child_id, child_value] : known) {
+          if (!child_value.is_dict()) return std::nullopt;
+          const auto& child = child_value.GetDict();
+          const auto* parent = child.FindString("parentId");
+          if (!parent || *parent != id || child.FindBool("deleted").value_or(false)) continue;
+          auto child_op = candidates.find(std::string(child_id));
+          if (child_op == candidates.end() || !selected.contains(std::string(child_id))) { ready = false; break; }
+          if (*child_op->second->FindString("kind") == "put") {
+            const auto* new_parent = child_op->second->FindString("parentId");
+            if (!new_parent || *new_parent == id) { ready = false; break; }
+          }
+        }
+      }
+      if (!ready) continue;
+      selected.insert(id); result.Append(op->Clone()); progress = true;
+      if (result.size() == limit) break;
+    }
+    // A partial dependency-closed batch is fine. No progress at all is a
+    // malformed/cyclic reference or unsafe nonempty-folder deletion.
+    if (!progress) {
+      if (result.empty()) return std::nullopt;
+      return result;
+    }
+  }
+  return result;
+}
+bool SamePayload(const base::DictValue& a, const base::DictValue& b) {
+  auto left = a.Clone(); auto right = b.Clone();
+  left.Remove("revision"); right.Remove("revision");
+  return left == right;
+}
+bool PreserveLocalChange(const base::DictValue* local,
+                         const base::DictValue* known,
+                         const base::DictValue& remote) {
+  return local && known && !SamePayload(*local, remote) &&
+         SamePayload(*known, remote);
+}
+}  // namespace browseros::sync

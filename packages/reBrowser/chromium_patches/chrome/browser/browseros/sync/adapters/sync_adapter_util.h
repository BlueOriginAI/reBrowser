diff --git a/chrome/browser/browseros/sync/adapters/sync_adapter_util.h b/chrome/browser/browseros/sync/adapters/sync_adapter_util.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/adapters/sync_adapter_util.h
@@ -0,0 +1,34 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_SYNC_ADAPTER_UTIL_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_SYNC_ADAPTER_UTIL_H_
+
+#include <optional>
+#include <string>
+#include <string_view>
+
+#include "base/values.h"
+#include "url/gurl.h"
+
+namespace browseros::sync::internal {
+inline constexpr size_t kBookmarkTitleBytes = 2048;
+inline constexpr size_t kHistoryTitleBytes = 1024;
+inline constexpr size_t kMaxBatchSize = 10000;
+
+// No resolver/network access. Rejects non-public literals, non-unique names,
+// internal suffixes and authorization/payment paths; strips query/fragment.
+// This deliberately does not change the original BookmarkModel/History record.
+std::optional<GURL> SanitizeURL(const GURL& url);
+std::string SafeTitle(std::u16string_view title,
+                      size_t max_bytes = kHistoryTitleBytes);
+bool IsRootId(std::string_view id);
+bool IsEventId(std::string_view id);
+// Strict allowlist; normalizes first-sibling null to "" and removes revision
+// for content comparisons. The returned dictionary never carries private fields.
+std::optional<base::DictValue> NormalizeEntry(const base::Value& value,
+                                               bool bookmark);
+base::DictValue Content(const base::DictValue& entry);
+}  // namespace browseros::sync::internal
+
+#endif  // CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_SYNC_ADAPTER_UTIL_H_

diff --git a/chrome/browser/browseros/sync/sync_protocol.h b/chrome/browser/browseros/sync/sync_protocol.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/sync_protocol.h
@@ -0,0 +1,26 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_SYNC_PROTOCOL_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_SYNC_PROTOCOL_H_
+#include <optional>
+#include <string>
+#include <string_view>
+#include "base/values.h"
+namespace browseros::sync {
+// Wire whitelist. Local URLs are sanitized without mutating local records;
+// inbound URLs must already be canonical. Nullopt rejects the entire entry.
+std::optional<base::DictValue> NormalizeEntry(std::string_view stream,
+                                             const base::DictValue& entry,
+                                             bool inbound);
+std::optional<double> WireNumber(const base::DictValue& data, std::string_view key);
+// Select a dependency-closed batch; never upload children before their parent
+// or predecessor, or delete a folder before explicitly handled descendants.
+std::optional<base::ListValue> OrderBookmarkOperations(
+    const base::ListValue& operations, const base::DictValue& known, size_t limit);
+bool SamePayload(const base::DictValue& a, const base::DictValue& b);
+// A remote record equal to the baseline must not undo a local pending edit.
+bool PreserveLocalChange(const base::DictValue* local,
+                         const base::DictValue* known,
+                         const base::DictValue& remote);
+}  // namespace browseros::sync
+#endif

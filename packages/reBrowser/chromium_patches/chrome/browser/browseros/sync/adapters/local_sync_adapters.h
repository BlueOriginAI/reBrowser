diff --git a/chrome/browser/browseros/sync/adapters/local_sync_adapters.h b/chrome/browser/browseros/sync/adapters/local_sync_adapters.h
new file mode 100644
index 0000000000000000000000000000000000000000..78318a0b836163de6990109df0c24b3206156d08
--- /dev/null
+++ b/chrome/browser/browseros/sync/adapters/local_sync_adapters.h
@@ -0,0 +1,66 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_LOCAL_SYNC_ADAPTERS_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_LOCAL_SYNC_ADAPTERS_H_
+
+#include <memory>
+#include <string>
+
+#include "base/functional/callback.h"
+#include "base/time/time.h"
+#include "base/values.h"
+
+class Profile;
+namespace user_prefs {
+class PrefRegistrySyncable;
+}
+
+namespace browseros::sync {
+
+// UI-sequence only. This class has no network, entitlement or account logic.
+// The caller must authorize the category before Read/Apply and must destroy or
+// Shutdown the adapter before Profile shutdown. OTR profiles are never used.
+class LocalSyncAdapters {
+ public:
+  enum class Stream { kBookmarks, kHistory };
+  struct Result {
+    bool available = false;
+    bool success = false;
+    // Stable, non-sensitive error codes; never contains URLs or page titles.
+    std::string error;
+    base::ListValue entries;
+  };
+  using Callback = base::OnceCallback<void(Result)>;
+
+  explicit LocalSyncAdapters(Profile* profile);
+  ~LocalSyncAdapters();
+  LocalSyncAdapters(const LocalSyncAdapters&) = delete;
+  LocalSyncAdapters& operator=(const LocalSyncAdapters&) = delete;
+
+  // These are LOCAL, non-syncable metadata prefs, not enable/entitlement prefs.
+  static void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);
+  bool IsAvailable(Stream stream) const;
+  // All completions are asynchronous. Shutdown cancels outstanding completions;
+  // an already running history backend task may finish its authorized writes.
+  void ReadBookmarks(Callback callback);
+  void ApplyBookmarks(base::ListValue entries, Callback callback);
+  // `since` must be the persisted user-enable time, NOT a last-read cursor and
+  // NOT Time(). Moving it forwards starts a new consent window. Reads include
+  // only SOURCE_BROWSED, main-frame, non-redirect events after that time.
+  void ReadHistory(base::Time since, Callback callback);
+  void ApplyHistory(base::ListValue entries, Callback callback);
+  void SetOnChanged(base::RepeatingCallback<void(Stream)> callback);
+  // Fails closed while a history task is in flight; never deletes user data.
+  bool ResetSyncState();
+  void Shutdown();
+
+ private:
+  class Impl;
+  std::unique_ptr<Impl> impl_;
+};
+
+}  // namespace browseros::sync
+
+#endif  // CHROME_BROWSER_BROWSEROS_SYNC_ADAPTERS_LOCAL_SYNC_ADAPTERS_H_

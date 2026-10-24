diff --git a/chrome/common/chrome_paths_test_main.cc b/chrome/common/chrome_paths_test_main.cc
new file mode 100644
--- /dev/null
+++ b/chrome/common/chrome_paths_test_main.cc
@@ -0,0 +1,24 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "base/base_paths.h"
+#include "base/files/scoped_temp_dir.h"
+#include "base/test/scoped_path_override.h"
+#include "base/test/test_suite.h"
+#include "chrome/common/chrome_paths.h"
+
+int main(int argc, char** argv) {
+  base::TestSuite test_suite(argc, argv);
+  base::ScopedTempDir temp_dir;
+  if (!temp_dir.CreateUniqueTempDir())
+    return 1;
+
+  // Exercise real path resolution without creating or reading daily profiles.
+  base::ScopedPathOverride app_data(
+      base::DIR_APP_DATA, temp_dir.GetPath().Append("Application Support"));
+  base::ScopedPathOverride cache(base::DIR_CACHE,
+                                 temp_dir.GetPath().Append("Caches"));
+  chrome::RegisterPathProvider();
+  return test_suite.Run();
+}

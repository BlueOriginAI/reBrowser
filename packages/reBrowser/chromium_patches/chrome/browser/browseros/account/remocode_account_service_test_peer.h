diff --git a/chrome/browser/browseros/account/remocode_account_service_test_peer.h b/chrome/browser/browseros/account/remocode_account_service_test_peer.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service_test_peer.h
@@ -0,0 +1,36 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_TEST_PEER_H_
+#define CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_TEST_PEER_H_
+#include <string>
+#include "base/check.h"
+#include "base/time/time.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+namespace remocode {
+// Compiled only by GN testonly targets. This substitutes AUTHENTICATION, not
+// entitlement, sync status, registration, consent, models or server responses.
+// Tests must obtain every sync entitlement through the real AccountService
+// request/parser path. No test command-line flag is added to the application.
+class AccountServiceTestPeer {
+ public:
+  static void SignIn(AccountService& service, std::string token,
+                     std::string installation) {
+    CHECK(!service.initializing_);
+    service.StopOperations();
+    service.access_token_ = std::move(token);
+    service.refresh_token_.clear();
+    service.installation_id_ = std::move(installation);
+    service.expiration_ = base::Time::Now() + base::Days(1);
+    service.state_ = "signedIn";
+    service.message_.clear();
+    service.Notify();
+  }
+  static void SignOut(AccountService& service) {
+    service.StopOperations();
+    service.ClearCredentials();
+    service.state_ = "signedOut";
+    service.Notify();
+  }
+};
+}  // namespace remocode
+#endif

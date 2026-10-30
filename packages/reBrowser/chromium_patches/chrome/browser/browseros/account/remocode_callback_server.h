diff --git a/chrome/browser/browseros/account/remocode_callback_server.h b/chrome/browser/browseros/account/remocode_callback_server.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_callback_server.h
@@ -0,0 +1,29 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_CALLBACK_SERVER_H_
+#define CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_CALLBACK_SERVER_H_
+#include <memory>
+#include <string>
+#include "base/functional/callback.h"
+#include "chrome/browser/browseros/account/remocode_oauth.h"
+#include "net/server/http_server.h"
+namespace remocode {
+// SequenceBound on BrowserThread::IO. No wildcard address, credential API,
+// filesystem responses or arbitrary web page can set account state.
+class CallbackServer : public net::HttpServer::Delegate {
+ public:
+  CallbackServer(std::string state, base::OnceCallback<void(bool)> ready,
+                 base::OnceCallback<void(OAuthCallback)> callback);
+  ~CallbackServer() override;
+  void OnConnect(int id) override;
+  void OnHttpRequest(int id, const net::HttpServerRequestInfo& info) override;
+  void OnWebSocketRequest(int id, const net::HttpServerRequestInfo&) override;
+  void OnWebSocketMessage(int id, std::string) override;
+  void OnClose(int id) override;
+ private:
+  std::string state_;
+  base::OnceCallback<void(OAuthCallback)> callback_;
+  std::unique_ptr<net::HttpServer> server_;
+};
+}  // namespace remocode
+#endif

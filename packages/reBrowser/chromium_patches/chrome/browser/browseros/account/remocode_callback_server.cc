diff --git a/chrome/browser/browseros/account/remocode_callback_server.cc b/chrome/browser/browseros/account/remocode_callback_server.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_callback_server.cc
@@ -0,0 +1,73 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_callback_server.h"
+#include "net/base/ip_address.h"
+#include "net/base/ip_endpoint.h"
+#include "net/base/net_errors.h"
+#include "net/log/net_log_source.h"
+#include "net/server/http_server_request_info.h"
+#include "net/server/http_server_response_info.h"
+#include "net/socket/tcp_server_socket.h"
+#include "net/traffic_annotation/network_traffic_annotation.h"
+namespace remocode {
+namespace {
+constexpr auto kCallbackTraffic = net::DefineNetworkTrafficAnnotation(
+    "remocode_oauth_loopback", R"(
+      semantics {
+        sender: "Remocode desktop account"
+        description: "Responds locally to the user's OAuth browser redirect."
+        trigger: "User selects Sign in to Remocode in Settings."
+        data: "A fixed confirmation page, never tokens or the code."
+        destination: LOCAL
+      }
+      policy {
+        cookies_allowed: NO
+        setting: "Only runs during explicit account authorization."
+        policy_exception_justification: "User-initiated account authorization."
+      })");
+}
+CallbackServer::CallbackServer(
+    std::string state, base::OnceCallback<void(bool)> ready,
+    base::OnceCallback<void(OAuthCallback)> callback)
+    : state_(std::move(state)), callback_(std::move(callback)) {
+  auto socket = std::make_unique<net::TCPServerSocket>(nullptr, net::NetLogSource());
+  const int result = socket->Listen(
+      net::IPEndPoint(net::IPAddress::IPv4Localhost(), 48123), 4, std::nullopt);
+  if (result == net::OK) {
+    server_ = std::make_unique<net::HttpServer>(std::move(socket), this);
+  }
+  std::move(ready).Run(result == net::OK);
+}
+CallbackServer::~CallbackServer() = default;
+void CallbackServer::OnConnect(int id) {
+  server_->SetReceiveBufferSize(id, 16384);
+}
+void CallbackServer::OnHttpRequest(
+    int id, const net::HttpServerRequestInfo& info) {
+  auto result = ValidateCallback(info.method, info.GetHeaderValue("host"),
+                                 info.path, state_);
+  const bool accepted = callback_ && result && info.peer.address().IsLoopback();
+  net::HttpServerResponseInfo response(accepted ? net::HTTP_OK
+                                               : net::HTTP_BAD_REQUEST);
+  response.AddHeader("Cache-Control", "no-store");
+  response.AddHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
+  response.AddHeader("Referrer-Policy", "no-referrer");
+  response.AddHeader("X-Content-Type-Options", "nosniff");
+  response.SetBody(accepted ? "Authorization received. You may close this tab."
+                            : "Invalid or expired authorization callback.",
+                   "text/plain; charset=utf-8");
+  server_->SendResponse(id, response, kCallbackTraffic);
+  if (accepted) {
+    // Consume on IO before posting to UI. Never destroy HttpServer in delegate.
+    state_.clear();
+    std::move(callback_).Run(std::move(*result));
+  }
+}
+void CallbackServer::OnWebSocketRequest(int id, const net::HttpServerRequestInfo&) {
+  server_->Close(id);
+}
+void CallbackServer::OnWebSocketMessage(int id, std::string) {
+  server_->Close(id);
+}
+void CallbackServer::OnClose(int) {}
+}  // namespace remocode

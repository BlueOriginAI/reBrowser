diff --git a/chrome/browser/browseros/account/remocode_account_service.h b/chrome/browser/browseros/account/remocode_account_service.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service.h
@@ -0,0 +1,110 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_H_
+#define CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_H_
+#include <memory>
+#include <deque>
+#include <optional>
+#include <string>
+#include "base/callback_list.h"
+#include "base/memory/raw_ptr.h"
+#include "base/memory/weak_ptr.h"
+#include "base/threading/sequence_bound.h"
+#include "base/time/time.h"
+#include "base/timer/timer.h"
+#include "base/values.h"
+#include "chrome/browser/browseros/account/remocode_callback_server.h"
+#include "components/keyed_service/core/keyed_service.h"
+#include "components/os_crypt/async/common/encryptor.h"
+#include "services/network/public/cpp/shared_url_loader_factory.h"
+
+class Profile;
+namespace os_crypt_async { class OSCryptAsync; }
+namespace network { class SimpleURLLoader; }
+namespace browseros::sync { class RemocodeSyncService; }
+namespace remocode {
+// UI-sequence, one instance per regular profile, never shared with OTR.
+// Only GetState() may cross the WebUI boundary; it contains no credentials.
+class AccountService : public KeyedService {
+ public:
+  AccountService(Profile* profile,
+                 scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
+                 os_crypt_async::OSCryptAsync* os_crypt);
+  ~AccountService() override;
+  void Shutdown() override;
+  base::DictValue GetState() const;
+  base::CallbackListSubscription Observe(base::RepeatingClosure observer);
+  void Login(base::OnceCallback<void(const GURL&)> open_authorization);
+  void Cancel();
+  void Logout();
+  void Retry();
+
+ private:
+  friend class AccountServiceTest;
+  // Defined only in a GN testonly header. No runtime test switches or endpoint
+  // overrides are compiled into the shipping account implementation.
+  friend class AccountServiceTestPeer;
+  // Native-only capability: WebUI cannot choose URL, origin or bearer.
+  friend class browseros::sync::RemocodeSyncService;
+  enum class SyncEndpoint { kStatus, kEnrollment, kPull, kPush, kDelete };
+  using SyncCallback = base::OnceCallback<void(int, base::DictValue)>;
+  struct SyncRequest {
+    SyncEndpoint endpoint;
+    base::DictValue body;
+    SyncCallback callback;
+  };
+  void AuthenticatedSyncRequest(SyncEndpoint endpoint, base::DictValue body,
+                                SyncCallback callback);
+  void StartNextSyncRequest();
+  void CancelSyncRequests();
+  void OnSyncResponse(uint64_t generation, std::optional<std::string> body);
+  std::deque<SyncRequest> sync_requests_;
+  std::unique_ptr<network::SimpleURLLoader> sync_loader_;
+  enum class Request { kStart, kExchange, kRefresh, kMe, kLogout };
+  void OnEncryptor(scoped_refptr<os_crypt_async::Encryptor> encryptor);
+  void OnListenerReady(uint64_t generation,
+                       base::OnceCallback<void(const GURL&)> open, bool ready);
+  void OnCallback(uint64_t generation, OAuthCallback callback);
+  void OnTimeout();
+  void Refresh();
+  void Send(Request kind, base::DictValue body = base::DictValue(),
+            std::string bearer = std::string());
+  void OnResponse(uint64_t generation, Request kind,
+                  std::optional<std::string> body);
+  bool AcceptTokens(const base::DictValue& data, bool is_refresh);
+  bool AcceptAccount(const base::DictValue& data);
+  bool SaveRefresh();
+  void ClearCredentials();
+  void StopOperations();
+  void Fail(std::string message, bool reauth = false);
+  void Notify();
+
+  const raw_ptr<Profile> profile_;
+  const scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
+  scoped_refptr<os_crypt_async::Encryptor> encryptor_;
+  base::RepeatingClosureList observers_;
+  std::unique_ptr<network::SimpleURLLoader> loader_;
+  std::optional<Request> request_kind_;
+  base::SequenceBound<CallbackServer> callback_server_;
+  base::OneShotTimer authorization_timer_;
+  base::OneShotTimer refresh_timer_;
+  uint64_t generation_ = 0;
+  bool initializing_ = true;
+  bool shutdown_ = false;
+  bool logout_pending_ = false;
+  std::string state_ = "signedOut";
+  std::string message_;
+  std::string oauth_state_;
+  std::string verifier_;
+  std::string flow_id_;
+  base::OnceCallback<void(const GURL&)> open_authorization_;
+  std::string access_token_;  // Never persisted or sent to WebUI.
+  std::string refresh_token_; // Persisted only through OSCryptAsync.
+  std::string installation_id_;
+  std::string display_name_;
+  std::string email_;
+  base::Time expiration_;
+  base::WeakPtrFactory<AccountService> weak_factory_{this};
+};
+}  // namespace remocode
+#endif

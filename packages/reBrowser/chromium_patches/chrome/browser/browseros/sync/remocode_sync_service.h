diff --git a/chrome/browser/browseros/sync/remocode_sync_service.h b/chrome/browser/browseros/sync/remocode_sync_service.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_service.h
@@ -0,0 +1,114 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_REMOCODE_SYNC_SERVICE_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_REMOCODE_SYNC_SERVICE_H_
+#include <memory>
+#include <string>
+#include "base/callback_list.h"
+#include "base/memory/raw_ptr.h"
+#include "base/memory/weak_ptr.h"
+#include "base/timer/timer.h"
+#include "base/values.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/sync/adapters/local_sync_adapters.h"
+#include "components/keyed_service/core/keyed_service.h"
+class Profile;
+namespace user_prefs { class PrefRegistrySyncable; }
+namespace browseros::sync {
+inline constexpr char kSyncStatePref[] = "remocode.sync.local_state";
+class RemocodeSyncService : public KeyedService {
+ public:
+  RemocodeSyncService(Profile* profile, remocode::AccountService* account);
+  ~RemocodeSyncService() override;
+  static void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);
+  void Shutdown() override;
+  base::DictValue GetState() const;
+  base::CallbackListSubscription Observe(base::RepeatingClosure observer);
+  void Refresh();
+  // Subscription UI reads must not start or queue a data synchronization cycle.
+  void RefreshStatus(bool force);
+  // Enabled is only category consent, never an entitlement or provider selector.
+  bool SetEnabled(const base::DictValue& enabled);
+  std::string PrepareCloudDeletion();
+  bool DeleteCloud(const std::string& confirmation_nonce);
+ private:
+  friend class RemocodeSyncServiceTest;
+  using Endpoint = remocode::AccountService::SyncEndpoint;
+  using Stream = LocalSyncAdapters::Stream;
+  using Result = LocalSyncAdapters::Result;
+  void OnAccountChanged();
+  void Invalidate();
+  void ResetEntitlement();
+  void OnEntitlementExpired();
+  void CompleteDeletion();
+  bool AcceptDeletionStatus(const base::DictValue& data);
+  void RecordError(const base::DictValue& data);
+  void Save();
+  void Notify();
+  void Fail(std::string operation = "failed");
+  bool SignedIn() const;
+  bool EnsureOwner();
+  bool AnyEnabled() const;
+  bool CanSync() const;
+  void Request(Endpoint endpoint, base::DictValue body,
+               base::OnceCallback<void(int, base::DictValue)> callback);
+  void OnStatus(int status, base::DictValue data);
+  void OnStatusOnly(int status, base::DictValue data);
+  bool AcceptStatus(const base::DictValue& data);
+  void Enroll();
+  void OnEnrollment(int status, base::DictValue data);
+  base::DictValue RegistrationBody() const;
+  void StartCycle();
+  void NextStream();
+  void ReadLocal();
+  void OnLocalRead(Result result);
+  void Pull();
+  void OnPull(int status, base::DictValue data);
+  void OnApplied(base::DictValue page, Result result);
+  void Push();
+  void SendPending();
+  void OnPush(int status, base::DictValue data);
+  void OnLocalChanged(Stream stream);
+  void FinishCycle();
+  base::DictValue& Known();
+  const raw_ptr<Profile> profile_;
+  const raw_ptr<remocode::AccountService> account_;
+  std::unique_ptr<LocalSyncAdapters> adapters_;
+  base::CallbackListSubscription account_subscription_;
+  base::RepeatingClosureList observers_;
+  base::DictValue local_state_;
+  base::DictValue registration_;
+  base::DictValue local_entries_;
+  base::DictValue remote_entries_;
+  double pull_revision_ = -1;
+  base::OneShotTimer timer_;
+  // Independent of refresh/debounce: a request in flight cannot extend VIP.
+  base::OneShotTimer entitlement_timer_;
+  base::Time vip_expires_at_;
+  base::TimeTicks last_status_request_;
+  bool purchase_available_ = false;
+  bool management_available_ = false;
+  std::string deletion_status_ = "none";
+  std::string error_code_;
+  bool shutdown_ = false;
+  bool busy_ = false;
+  bool rerun_ = false;
+  bool conflict_ = false;
+  bool confirming_push_ = false;
+  int stream_index_ = -1;
+  int pull_restarts_ = 0;
+  int push_restarts_ = 0;
+  int pull_pages_ = 0;
+  std::string stream_;
+  std::string cursor_;
+  std::string entitlement_ = "loading";
+  std::string operation_ = "paused";
+  std::string deletion_nonce_;
+  base::Time deletion_expires_;
+  // Operation callbacks are invalidated on consent changes; lifetime observers
+  // must survive that invalidation so re-login and re-enable remain functional.
+  base::WeakPtrFactory<RemocodeSyncService> weak_factory_{this};
+  base::WeakPtrFactory<RemocodeSyncService> operation_factory_{this};
+};
+}  // namespace browseros::sync
+#endif

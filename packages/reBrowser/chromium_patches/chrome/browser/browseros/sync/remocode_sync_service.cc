diff --git a/chrome/browser/browseros/sync/remocode_sync_service.cc b/chrome/browser/browseros/sync/remocode_sync_service.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_service.cc
@@ -0,0 +1,712 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/remocode_sync_service.h"
+#include <array>
+#include "base/check.h"
+#include "base/functional/bind.h"
+#include "base/task/single_thread_task_runner.h"
+#include "base/uuid.h"
+#include "chrome/browser/browseros/sync/sync_protocol.h"
+#include "chrome/browser/profiles/profile.h"
+#include "components/pref_registry/pref_registry_syncable.h"
+#include "components/prefs/pref_service.h"
+namespace browseros::sync {
+namespace {
+constexpr std::array<const char*, 3> kStreams = {"bookmarks", "history", "agent_history"};
+base::DictValue Disabled() {
+  base::DictValue enabled;
+  for (const auto* stream : kStreams) enabled.Set(stream, false);
+  return enabled;
+}
+bool Enabled(const base::DictValue& state, const std::string& stream) {
+  auto* enabled = state.FindDict("enabled");
+  return enabled && enabled->FindBool(stream).value_or(false);
+}
+bool ValidRegistration(const base::DictValue& value) {
+  for (const auto* key : {"spaceId", "enrollmentId"}) {
+    auto* s = value.FindString(key);
+    if (!s || s->empty() || s->size() > 128) return false;
+  }
+  for (const auto* key : {"generation", "revision", "deviceSequence"}) {
+    if (!WireNumber(value, key)) return false;
+  }
+  return *WireNumber(value, "generation") > 0;
+}
+}  // namespace
+RemocodeSyncService::RemocodeSyncService(Profile* profile,
+                                       remocode::AccountService* account)
+    : profile_(profile), account_(account),
+      adapters_(std::make_unique<LocalSyncAdapters>(profile)),
+      local_state_(profile->GetPrefs()->GetDict(kSyncStatePref).Clone()) {
+  CHECK(!profile_->IsOffTheRecord());
+  if (!local_state_.FindDict("enabled")) local_state_.Set("enabled", Disabled());
+  if (const auto* deletion = local_state_.FindString("deletionStatus"); deletion &&
+      (*deletion == "pending" || *deletion == "completed" || *deletion == "failed")) {
+    deletion_status_ = *deletion;
+    if (*deletion == "pending") operation_ = "deletePending";
+    if (*deletion == "failed") operation_ = "deleteFailed";
+  }
+  adapters_->SetOnChanged(base::BindRepeating(&RemocodeSyncService::OnLocalChanged,
+                                            weak_factory_.GetWeakPtr()));
+  if (account_) account_subscription_ = account_->Observe(base::BindRepeating(
+      &RemocodeSyncService::OnAccountChanged, weak_factory_.GetWeakPtr()));
+  // Eager factories may be constructed before AccountService finishes restore.
+  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
+      base::BindOnce(&RemocodeSyncService::OnAccountChanged, weak_factory_.GetWeakPtr()));
+}
+RemocodeSyncService::~RemocodeSyncService() = default;
+void RemocodeSyncService::RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
+  registry->RegisterDictionaryPref(kSyncStatePref);
+  LocalSyncAdapters::RegisterProfilePrefs(registry);
+}
+void RemocodeSyncService::Shutdown() {
+  shutdown_ = true;
+  Invalidate();
+  ResetEntitlement();
+  account_subscription_ = {};
+  weak_factory_.InvalidateWeakPtrs();
+  adapters_->Shutdown();
+}
+void RemocodeSyncService::Invalidate() {
+  operation_factory_.InvalidateWeakPtrs();
+  timer_.Stop();
+  if (account_) account_->CancelSyncRequests();
+  busy_ = false;
+  rerun_ = false;
+  cursor_.clear();
+  local_entries_.clear();
+  remote_entries_.clear(); pull_revision_ = -1;
+  deletion_nonce_.clear();
+}
+void RemocodeSyncService::ResetEntitlement() {
+  last_status_request_ = base::TimeTicks();
+  entitlement_timer_.Stop();
+  vip_expires_at_ = base::Time();
+  purchase_available_ = false;
+  management_available_ = false;
+  error_code_.clear();
+}
+void RemocodeSyncService::OnEntitlementExpired() {
+  // Cancel callbacks as well as the timer: a late pull/push must not resume this
+  // generation after expiry. The server independently gates every request.
+  Invalidate();
+  entitlement_ = "free";
+  operation_ = deletion_status_ == "pending" ? "deletePending" : "paused";
+  Notify();
+  if (deletion_status_ == "pending")
+    timer_.Start(FROM_HERE, base::Seconds(30), this, &RemocodeSyncService::Refresh);
+}
+void RemocodeSyncService::Save() {
+  profile_->GetPrefs()->SetDict(kSyncStatePref, local_state_.Clone());
+  profile_->GetPrefs()->CommitPendingWrite();
+}
+void RemocodeSyncService::Notify() { observers_.Notify(); }
+base::CallbackListSubscription RemocodeSyncService::Observe(base::RepeatingClosure observer) {
+  return observers_.Add(std::move(observer));
+}
+bool RemocodeSyncService::SignedIn() const {
+  if (!account_) return false;
+  const auto state = account_->GetState();
+  const auto* status = state.FindString("state");
+  return status && *status == "signedIn";
+}
+bool RemocodeSyncService::AnyEnabled() const {
+  for (const auto* stream : kStreams) if (Enabled(local_state_, stream)) return true;
+  return false;
+}
+bool RemocodeSyncService::CanSync() const {
+  return !shutdown_ && SignedIn() && entitlement_ == "active" && AnyEnabled() &&
+      deletion_status_ != "pending" &&
+      (vip_expires_at_.is_null() || vip_expires_at_ > base::Time::Now()) &&
+      ValidRegistration(registration_);
+}
+base::DictValue RemocodeSyncService::GetState() const {
+  base::DictValue out;
+  out.Set("entitlement", entitlement_);
+  out.Set("operation", operation_);
+  out.Set("busy", busy_);
+  out.Set("signedIn", SignedIn());
+  out.Set("purchaseAvailable", SignedIn() && purchase_available_);
+  out.Set("managementAvailable", SignedIn() && management_available_);
+  out.Set("vipExpiresAt", vip_expires_at_.is_null() ? base::Value() :
+      base::Value(vip_expires_at_.InMillisecondsFSinceUnixEpoch()));
+  out.Set("deletionPending", deletion_status_ == "pending");
+  out.Set("deletionStatus", deletion_status_);
+  out.Set("errorCode", error_code_);
+  out.Set("needsReauth", operation_ == "reauthRequired");
+  out.Set("canDelete", SignedIn() && (entitlement_ == "active" || entitlement_ == "free") &&
+      !busy_ && deletion_status_ != "pending");
+  out.Set("enabled", local_state_.FindDict("enabled") ?
+      local_state_.FindDict("enabled")->Clone() : Disabled());
+  base::DictValue available;
+  available.Set("bookmarks", adapters_->IsAvailable(Stream::kBookmarks));
+  available.Set("history", adapters_->IsAvailable(Stream::kHistory));
+  // No authenticated, profile-bound native IPC exists for Rust metadata yet.
+  // A global recording index is not a profile adapter.
+  available.Set("agent_history", false);
+  out.Set("available", std::move(available));
+  out.Set("lastSuccess", local_state_.FindDouble("lastSuccess").value_or(0));
+  return out;
+}
+void RemocodeSyncService::OnAccountChanged() {
+  if (shutdown_) return;
+  const auto state = account_ ? account_->GetState() : base::DictValue();
+  if (!SignedIn()) {
+    const bool restoring = account_ && account_->state_ == "signedOut" &&
+        (account_->initializing_ || account_->request_kind_ == remocode::AccountService::Request::kRefresh ||
+         account_->request_kind_ == remocode::AccountService::Request::kMe);
+    if (restoring) return;
+    Invalidate();
+    ResetEntitlement();
+    const auto* account_status = state.FindString("state");
+    entitlement_ = account_status && *account_status == "authorizing" ? "loading" :
+        account_status && (*account_status == "error" || *account_status == "reauthRequired")
+        ? "error" : "signedOut";
+    operation_ = deletion_status_ == "pending" ? "deletePending" : "paused";
+    Notify();
+    return;
+  }
+  // Identity changes must cancel the previous generation even while busy.
+  const auto* owner = local_state_.FindString("owner");
+  if (!owner || *owner != account_->installation_id_) {
+    Invalidate();
+    ResetEntitlement();
+    entitlement_ = "loading";
+    registration_.clear();
+  }
+  if (!busy_) Refresh();
+}
+bool RemocodeSyncService::EnsureOwner() {
+  if (!SignedIn() || account_->installation_id_.empty()) return false;
+  const auto* owner = local_state_.FindString("owner");
+  if (owner && *owner == account_->installation_id_) return true;
+  Invalidate();
+  ResetEntitlement();
+  // Never reuse an old account's adapter metadata while a DB task is finishing.
+  if (!adapters_->ResetSyncState()) { entitlement_ = "error"; Fail(); return false; }
+  local_state_.clear();
+  local_state_.Set("owner", account_->installation_id_);
+  local_state_.Set("enabled", Disabled());
+  deletion_status_ = "none";
+  operation_ = "paused";
+  registration_.clear();
+  Save();
+  return true;
+}
+void RemocodeSyncService::Refresh() {
+  if (shutdown_) return;
+  if (busy_) { rerun_ = true; return; }
+  if (!SignedIn()) { entitlement_ = "signedOut"; Notify(); return; }
+  if (!EnsureOwner()) return;
+  timer_.Stop();
+  last_status_request_ = base::TimeTicks::Now();
+  busy_ = true;
+  entitlement_ = "loading";
+  error_code_.clear();
+  Notify();
+  Request(Endpoint::kStatus, base::DictValue(), base::BindOnce(
+      &RemocodeSyncService::OnStatus, operation_factory_.GetWeakPtr()));
+}
+void RemocodeSyncService::RefreshStatus(bool force) {
+  if (shutdown_ || busy_) return;
+  if (!SignedIn()) { entitlement_ = "signedOut"; Notify(); return; }
+  if (!EnsureOwner()) return;
+  const auto now = base::TimeTicks::Now();
+  if (!force && !last_status_request_.is_null() &&
+      now - last_status_request_ < base::Seconds(30)) return;
+  last_status_request_ = now;
+  busy_ = true;
+  // Keep the current entitlement visible while checking it. Neither the
+  // background timer nor a pending background rerun is changed by a UI read.
+  Notify();
+  Request(Endpoint::kStatus, base::DictValue(), base::BindOnce(
+      &RemocodeSyncService::OnStatusOnly, operation_factory_.GetWeakPtr()));
+}
+void RemocodeSyncService::OnStatusOnly(int status, base::DictValue data) {
+  if (status != 200) {
+    purchase_available_ = management_available_ = false;
+    RecordError(data);
+    entitlement_ = status == 404 || status == 501 || status == 503 ? "unavailable" : "error";
+    Fail(); return;
+  }
+  if (!AcceptStatus(data)) { Fail(); return; }
+  RecordError(data);
+  busy_ = false;
+  const bool background_due = rerun_;
+  rerun_ = false;
+  if (deletion_status_ == "pending") operation_ = "deletePending";
+  else if (!CanSync()) operation_ = "paused";
+  Notify();
+  // A real local edit or an elapsed background timer can still request work.
+  // Status reads alone never start an immediate bookmark/history scan.
+  if ((background_due || !timer_.IsRunning()) &&
+      (CanSync() || deletion_status_ == "pending")) {
+    timer_.Start(FROM_HERE, background_due ? base::Seconds(1) : base::Seconds(30),
+                 this, &RemocodeSyncService::Refresh);
+  }
+}
+void RemocodeSyncService::Request(Endpoint endpoint, base::DictValue body,
+    base::OnceCallback<void(int, base::DictValue)> callback) {
+  account_->AuthenticatedSyncRequest(endpoint, std::move(body), std::move(callback));
+}
+void RemocodeSyncService::RecordError(const base::DictValue& data) {
+  error_code_.clear();
+  // Worker failures are {error:{code,message}}, not {error:"CODE"}.
+  const auto* error = data.FindDict("error");
+  const auto* code = error ? error->FindString("code") : nullptr;
+  if (code && !code->empty() && code->size() <= 128 &&
+      code->find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") ==
+          std::string::npos) error_code_ = *code;
+}
+void RemocodeSyncService::CompleteDeletion() {
+  // Only native metadata is cleared, never local bookmarks/history.
+  local_state_.Remove("streams");
+  local_state_.Remove("pending");
+  registration_.clear();
+  local_state_.Set("enabled", Disabled());
+  local_state_.Set("lastSuccess", 0.0);
+  local_state_.Set("enrollmentDirty", false);
+  operation_ = "paused";
+}
+bool RemocodeSyncService::AcceptDeletionStatus(const base::DictValue& data) {
+  const auto* pending_value = data.Find("deletionPending");
+  const auto* status_value = data.Find("deletionStatus");
+  const auto pending = data.FindBool("deletionPending");
+  const auto* status = data.FindString("deletionStatus");
+  if ((pending_value && !pending) || (status_value && !status) ||
+      (status && *status != "none" && *status != "pending" &&
+       *status != "completed" && *status != "failed") ||
+      (pending && status && *pending != (*status == "pending"))) return false;
+  if (pending.value_or(false) || (status && *status == "pending")) {
+    deletion_status_ = "pending";
+    local_state_.Set("enabled", Disabled());
+    local_state_.Remove("pending");
+    local_state_.Set("enrollmentDirty", false);
+    operation_ = "deletePending";
+  } else if (status && *status == "completed") {
+    if (deletion_status_ != "completed") CompleteDeletion();
+    deletion_status_ = "completed";
+  } else if (status && *status == "failed") {
+    deletion_status_ = "failed";
+    operation_ = "deleteFailed";
+  } else if (deletion_status_ != "pending") {
+    deletion_status_ = "none";
+  }
+  // Missing old-server fields (even deletionPending:false alone) cannot prove
+  // physical deletion. Keep a durable pending state until an explicit terminal.
+  local_state_.Set("deletionStatus", deletion_status_);
+  return true;
+}
+bool RemocodeSyncService::AcceptStatus(const base::DictValue& data) {
+  purchase_available_ = false;
+  management_available_ = false;
+  if (!data.FindBool("serviceAvailable").value_or(false)) {
+    entitlement_ = "unavailable"; return false;
+  }
+  for (const auto* key : {"purchaseAvailable", "managementAvailable"}) {
+    if (data.Find(key) && !data.FindBool(key)) { entitlement_ = "error"; return false; }
+  }
+  const auto* vip = data.FindString("vip");
+  const auto* enabled = data.FindDict("enabled");
+  if (!vip || (*vip != "active" && *vip != "inactive") || !enabled) {
+    entitlement_ = "error"; return false;
+  }
+  for (const auto* stream : kStreams) if (!enabled->FindBool(stream)) {
+    entitlement_ = "error"; return false;
+  }
+  base::Time expires_at;
+  if (*vip == "active") {
+    auto expires = WireNumber(data, "vipExpiresAt");
+    const auto* expiry = data.Find("vipExpiresAt");
+    if (!expiry || (!expiry->is_none() && (!expires ||
+        *expires <= base::Time::Now().InMillisecondsFSinceUnixEpoch()))) {
+      entitlement_ = "error"; return false;
+    }
+    if (expires) expires_at = base::Time::FromMillisecondsSinceUnixEpoch(*expires);
+  }
+  const auto* registration = data.Find("registration");
+  if (!registration || (!registration->is_none() && !registration->is_dict()) ||
+      (registration->is_dict() && !ValidRegistration(registration->GetDict()))) {
+    entitlement_ = "error"; return false;
+  }
+  const bool was_completed = deletion_status_ == "completed";
+  if (!AcceptDeletionStatus(data)) { entitlement_ = "error"; return false; }
+  const bool just_completed = !was_completed && deletion_status_ == "completed";
+  entitlement_ = *vip == "active" ? "active" : "free";
+  purchase_available_ = data.FindBool("purchaseAvailable").value_or(false);
+  management_available_ = data.FindBool("managementAvailable").value_or(false);
+  vip_expires_at_ = expires_at;
+  entitlement_timer_.Stop();
+  if (!vip_expires_at_.is_null())
+    entitlement_timer_.Start(FROM_HERE, vip_expires_at_ - base::Time::Now(), this,
+                             &RemocodeSyncService::OnEntitlementExpired);
+  if (deletion_status_ == "pending" || deletion_status_ == "failed" || just_completed) {
+    Save();
+    return true;
+  }
+  registration_ = registration->is_dict() ? registration->GetDict().Clone() : base::DictValue();
+  // A replacement space is not permission to replay historical data.
+  if (!registration_.empty()) {
+    const auto& space = *registration_.FindString("spaceId");
+    const auto* previous_space = local_state_.FindString("spaceId");
+    if (previous_space && *previous_space != space) {
+      if (!adapters_->ResetSyncState()) { entitlement_ = "error"; return false; }
+      local_state_.Remove("streams"); local_state_.Remove("pending");
+      local_state_.Set("enabled", Disabled());
+      local_state_.Set("enrollmentDirty", true);
+    }
+    local_state_.Set("spaceId", space);
+  }
+  // Server consent can revoke but never opt this profile in. Payment only
+  // unlocks the controls; only explicit local consent can issue enrollment.
+  if (!local_state_.FindBool("enrollmentDirty").value_or(false)) {
+    auto effective = local_state_.FindDict("enabled")->Clone();
+    bool server_needs_disable = false;
+    for (const auto* stream : kStreams) {
+      const bool local_on = effective.FindBool(stream).value_or(false);
+      const bool server_on = enabled->FindBool(stream).value_or(false);
+      effective.Set(stream, local_on && server_on);
+      server_needs_disable |= !local_on && server_on;
+    }
+    if (effective != *local_state_.FindDict("enabled")) local_state_.Remove("pending");
+    local_state_.Set("enabled", std::move(effective));
+    if (server_needs_disable) local_state_.Set("enrollmentDirty", true);
+  }
+  Save();
+  return true;
+}
+void RemocodeSyncService::OnStatus(int status, base::DictValue data) {
+  if (status != 200) {
+    purchase_available_ = management_available_ = false;
+    RecordError(data);
+    entitlement_ = status == 404 || status == 501 || status == 503 ? "unavailable" : "error";
+    Fail(); return;
+  }
+  if (!AcceptStatus(data)) { Fail(); return; }
+  RecordError(data);
+  if (deletion_status_ == "pending") {
+    busy_ = false; operation_ = "deletePending"; Notify();
+    timer_.Start(FROM_HERE, base::Seconds(30), this, &RemocodeSyncService::Refresh);
+    return;
+  }
+  if (deletion_status_ == "failed") { Fail("deleteFailed"); return; }
+  // A free account can refresh, but must not poll or enroll indefinitely.
+  if (entitlement_ != "active") {
+    busy_ = false; operation_ = "paused"; rerun_ = false; Notify(); return;
+  }
+  if (local_state_.FindBool("enrollmentDirty").value_or(false)) { Enroll(); return; }
+  if (!CanSync()) { busy_ = false; operation_ = "paused"; rerun_ = false; Notify(); return; }
+  if (auto* pending = local_state_.FindDict("pending")) {
+    const auto* pending_stream = pending->FindString("stream");
+    if (!pending_stream || (*pending_stream != "bookmarks" && *pending_stream != "history") ||
+        !pending->FindList("operations") || !pending->FindString("batchId") ||
+        !WireNumber(*pending, "deviceSequence") || !WireNumber(*pending, "baseRevision") ||
+        pending->FindString("enrollmentId") == nullptr ||
+        *pending->FindString("enrollmentId") != *registration_.FindString("enrollmentId") ||
+        WireNumber(*pending, "generation") != WireNumber(registration_, "generation")) {
+      local_state_.Remove("pending"); Save();
+    } else { stream_ = *pending->FindString("stream"); SendPending(); return; }
+  }
+  StartCycle();
+}
+bool RemocodeSyncService::SetEnabled(const base::DictValue& enabled) {
+  if (shutdown_ || enabled.size() != 3 || deletion_status_ == "pending") return false;
+  auto current = local_state_.FindDict("enabled")->Clone();
+  for (const auto* stream : kStreams) {
+    auto next = enabled.FindBool(stream);
+    if (!next) return false;
+    bool old = current.FindBool(stream).value_or(false);
+    bool available = std::string(stream) == "bookmarks" ? adapters_->IsAvailable(Stream::kBookmarks) :
+        std::string(stream) == "history" && adapters_->IsAvailable(Stream::kHistory);
+    if (*next && !old && (busy_ || entitlement_ != "active" || !SignedIn() || !available ||
+        (!vip_expires_at_.is_null() && vip_expires_at_ <= base::Time::Now()))) return false;
+  }
+  Invalidate();
+  for (const auto* stream : kStreams) {
+    if (enabled.FindBool(stream).value_or(false) && !current.FindBool(stream).value_or(false))
+      local_state_.Set(std::string(stream) + "Since",
+          static_cast<double>(base::Time::Now().InMillisecondsSinceUnixEpoch()));
+  }
+  local_state_.Set("enabled", enabled.Clone());
+  local_state_.Set("enrollmentDirty", true);
+  local_state_.Remove("pending");
+  Save(); operation_ = "paused";
+  Refresh(); Notify(); return true;
+}
+void RemocodeSyncService::Enroll() {
+  base::DictValue body;
+  body.Set("enabled", local_state_.FindDict("enabled")->Clone());
+  Request(Endpoint::kEnrollment, std::move(body), base::BindOnce(
+      &RemocodeSyncService::OnEnrollment, operation_factory_.GetWeakPtr()));
+}
+void RemocodeSyncService::OnEnrollment(int status, base::DictValue data) {
+  if (status != 200) RecordError(data);
+  if (status == 401 || status == 403) entitlement_ = "error";
+  if (status != 200 || !AcceptStatus(data) ||
+      !data.FindDict("enabled") || *data.FindDict("enabled") != *local_state_.FindDict("enabled")) {
+    if (status == 404 || status == 501 || status == 503) entitlement_ = "unavailable";
+    Fail(); return;
+  }
+  if (deletion_status_ == "pending") { Fail(); return; }
+  local_state_.Set("enrollmentDirty", false);
+  Save();
+  if (CanSync()) StartCycle();
+  else { busy_ = false; operation_ = "paused"; Notify(); }
+}
+base::DictValue RemocodeSyncService::RegistrationBody() const {
+  base::DictValue out;
+  for (const auto* key : {"spaceId", "enrollmentId"}) out.Set(key, *registration_.FindString(key));
+  out.Set("generation", *WireNumber(registration_, "generation"));
+  return out;
+}
+void RemocodeSyncService::StartCycle() {
+  stream_index_ = -1;
+  conflict_ = false;
+  operation_ = "pending";
+  Notify(); NextStream();
+}
+void RemocodeSyncService::NextStream() {
+  if (!CanSync()) { Fail(); return; }
+  while (++stream_index_ < static_cast<int>(kStreams.size())) {
+    stream_ = kStreams[stream_index_];
+    if (!Enabled(local_state_, stream_)) continue;
+    if (stream_ == "agent_history" || !adapters_->IsAvailable(
+        stream_ == "bookmarks" ? Stream::kBookmarks : Stream::kHistory)) { Fail(); return; }
+    cursor_.clear(); pull_restarts_ = 0; push_restarts_ = 0;
+    pull_pages_ = 0; confirming_push_ = false;
+    ReadLocal(); return;
+  }
+  FinishCycle();
+}
+base::DictValue& RemocodeSyncService::Known() {
+  auto* streams = local_state_.EnsureDict("streams");
+  return *streams->EnsureDict(stream_);
+}
+void RemocodeSyncService::ReadLocal() {
+  auto callback = base::BindOnce(&RemocodeSyncService::OnLocalRead, operation_factory_.GetWeakPtr());
+  if (stream_ == "bookmarks") adapters_->ReadBookmarks(std::move(callback));
+  else {
+    auto since = WireNumber(local_state_, "historySince");
+    if (!since || *since <= 0) { Fail(); return; }
+    adapters_->ReadHistory(base::Time::FromMillisecondsSinceUnixEpoch(*since), std::move(callback));
+  }
+}
+void RemocodeSyncService::OnLocalRead(Result result) {
+  if (!CanSync() || !result.available || !result.success) { Fail(); return; }
+  local_entries_.clear();
+  remote_entries_.clear(); pull_revision_ = -1; cursor_.clear(); pull_pages_ = 0;
+  for (const auto& value : result.entries) {
+    if (!value.is_dict()) { Fail(); return; }
+    auto entry = NormalizeEntry(stream_, value.GetDict(), false);
+    if (!entry) continue;
+    local_entries_.Set(*entry->FindString("id"), std::move(*entry));
+  }
+  Pull();
+}
+void RemocodeSyncService::Pull() {
+  if (!CanSync()) { Fail(); return; }
+  auto body = RegistrationBody(); body.Set("stream", stream_);
+  body.Set("cursor", cursor_.empty() ? base::Value() : base::Value(cursor_));
+  Request(Endpoint::kPull, std::move(body), base::BindOnce(
+      &RemocodeSyncService::OnPull, operation_factory_.GetWeakPtr()));
+}
+void RemocodeSyncService::OnPull(int status, base::DictValue data) {
+  if (status != 200) RecordError(data);
+  if (status == 401 || status == 403) entitlement_ = "error";
+  if (status == 409 && ++pull_restarts_ <= 2) {
+    cursor_.clear(); remote_entries_.clear(); pull_revision_ = -1; conflict_ = false;
+    Pull(); return;
+  }
+  if (++pull_pages_ > 1000) { Fail(); return; }
+  const auto* entries = data.FindList("entries");
+  const auto* next = data.Find("nextCursor");
+  auto revision = WireNumber(data, "revision");
+  auto sequence = WireNumber(data, "deviceSequence");
+  if (!CanSync() || status != 200 || !entries || entries->size() > 200 || !revision ||
+      !sequence || !next || (!next->is_none() && !next->is_string())) { Fail(); return; }
+  if (pull_revision_ >= 0 && pull_revision_ != *revision) { Fail(); return; }
+  pull_revision_ = *revision;
+  for (const auto& value : *entries) {
+    if (!value.is_dict()) { Fail(); return; }
+    auto entry = NormalizeEntry(stream_, value.GetDict(), true);
+    if (!entry || WireNumber(*entry, "revision").value_or(0) > *revision) { Fail(); return; }
+    const auto& id = *entry->FindString("id");
+    const auto* dirty = local_entries_.FindDict(id);
+    const auto* known = Known().FindDict(id);
+    if (remote_entries_.contains(id) || (known && WireNumber(*entry, "revision") < WireNumber(*known, "revision"))) {
+      Fail(); return;
+    }
+    if (dirty && !SamePayload(*dirty, *entry) &&
+        (!known || !SamePayload(*known, *entry))) {
+      conflict_ = true;
+      continue;
+    }
+    remote_entries_.Set(id, std::move(*entry));
+  }
+  registration_.Set("revision", *revision);
+  registration_.Set("deviceSequence", *sequence);
+  const auto next_cursor = next->is_string() ? next->GetString() : "";
+  if (!next_cursor.empty() && next_cursor == cursor_) { Fail(); return; }
+  cursor_ = next_cursor;
+  if (cursor_.size() > 4096) { Fail(); return; }
+  if (!cursor_.empty()) { Pull(); return; }
+  base::ListValue apply;
+  for (auto [id, value] : remote_entries_) {
+    if (PreserveLocalChange(local_entries_.FindDict(id), Known().FindDict(id),
+                            value.GetDict())) continue;
+    apply.Append(value.Clone());
+  }
+  auto callback = base::BindOnce(&RemocodeSyncService::OnApplied,
+                                operation_factory_.GetWeakPtr(), std::move(remote_entries_));
+  remote_entries_ = base::DictValue(); pull_revision_ = -1;
+  if (stream_ == "bookmarks") adapters_->ApplyBookmarks(std::move(apply), std::move(callback));
+  else adapters_->ApplyHistory(std::move(apply), std::move(callback));
+}
+void RemocodeSyncService::OnApplied(base::DictValue page, Result result) {
+  if (!CanSync() || !result.available || !result.success) {
+    Fail(result.error.find("conflict") != std::string::npos ||
+         result.error == "bookmark_unresolved_parent_order_or_nonempty_folder" ? "conflict" : "failed"); return;
+  }
+  for (auto [id, entry] : page) Known().Set(id, entry.Clone());
+  Save();
+  if (!cursor_.empty()) { Pull(); return; }
+  if (conflict_) { Fail("conflict"); return; }
+  if (confirming_push_) { confirming_push_ = false; ReadLocal(); return; }
+  Push();
+}
+void RemocodeSyncService::Push() {
+  if (!CanSync()) { Fail(); return; }
+  base::ListValue operations;
+  for (auto [id, value] : local_entries_) {
+    const auto& entry = value.GetDict();
+    auto* known = Known().FindDict(id);
+    if (known && SamePayload(entry, *known)) continue;
+    bool deleted = entry.FindBool("deleted").value_or(false);
+    if (deleted && !known && WireNumber(entry, "revision").value_or(0) == 0) continue;
+    auto op = entry.Clone(); op.Remove("revision"); op.Remove("deleted");
+    op.Set("opId", base::Uuid::GenerateRandomV4().AsLowercaseString());
+    op.Set("kind", deleted ? "delete" : "put");
+    op.Set("expectedRevision", known ? WireNumber(*known, "revision").value_or(0) :
+                                       WireNumber(entry, "revision").value_or(0));
+    operations.Append(std::move(op));
+  }
+  if (operations.empty()) { NextStream(); return; }
+  if (stream_ == "bookmarks") {
+    auto ordered = OrderBookmarkOperations(operations, Known(), 100);
+    if (!ordered || ordered->empty()) { Fail("conflict"); return; }
+    operations = std::move(*ordered);
+  } else {
+    while (operations.size() > 100) operations.erase(operations.end() - 1);
+  }
+  auto batch = RegistrationBody();
+  batch.Set("protocolVersion", 1); batch.Set("stream", stream_);
+  batch.Set("batchId", base::Uuid::GenerateRandomV4().AsLowercaseString());
+  batch.Set("deviceSequence", *WireNumber(registration_, "deviceSequence") + 1);
+  batch.Set("baseRevision", *WireNumber(registration_, "revision"));
+  batch.Set("operations", std::move(operations));
+  local_state_.Set("pending", std::move(batch));
+  Save();
+  SendPending();
+}
+void RemocodeSyncService::SendPending() {
+  if (!CanSync()) { Fail(); return; }
+  busy_ = true; operation_ = "pending"; Notify();
+  Request(Endpoint::kPush, local_state_.FindDict("pending")->Clone(), base::BindOnce(
+      &RemocodeSyncService::OnPush, operation_factory_.GetWeakPtr()));
+}
+void RemocodeSyncService::OnPush(int status, base::DictValue data) {
+  auto* pending = local_state_.FindDict("pending");
+  if (!CanSync() || !pending) { Fail(); return; }
+  if (status != 200) RecordError(data);
+  if (status == 401 || status == 403) entitlement_ = "error";
+  if (status == 409) {
+    if (++push_restarts_ > 2) { Fail("conflict"); return; }
+    local_state_.Remove("pending"); Save();
+    cursor_.clear(); confirming_push_ = false;
+    ReadLocal(); return;
+  }
+  if (status != 200 || !WireNumber(data, "revision") || !data.FindString("batchId") ||
+      *data.FindString("batchId") != *pending->FindString("batchId")) { Fail(); return; }
+  const double revision = *WireNumber(data, "revision");
+  for (const auto& value : *pending->FindList("operations")) {
+    auto entry = value.GetDict().Clone();
+    entry.Set("deleted", *entry.FindString("kind") == "delete");
+    entry.Set("revision", revision);
+    entry.Remove("kind"); entry.Remove("opId"); entry.Remove("expectedRevision");
+    Known().Set(*entry.FindString("id"), std::move(entry));
+  }
+  registration_.Set("revision", revision);
+  registration_.Set("deviceSequence", *WireNumber(*pending, "deviceSequence"));
+  local_state_.Remove("pending"); Save();
+  cursor_.clear(); remote_entries_.clear(); pull_revision_ = -1; confirming_push_ = true;
+  Pull();
+}
+void RemocodeSyncService::OnLocalChanged(Stream stream) {
+  if (shutdown_) return;
+  Notify();
+  if (!Enabled(local_state_, stream == Stream::kBookmarks ? "bookmarks" : "history") ||
+      entitlement_ != "active" || deletion_status_ == "pending") return;
+  if (busy_) { rerun_ = true; return; }
+  timer_.Start(FROM_HERE, base::Seconds(1), this, &RemocodeSyncService::Refresh);
+}
+void RemocodeSyncService::FinishCycle() {
+  busy_ = false; operation_ = "success"; error_code_.clear();
+  local_state_.Set("lastSuccess", base::Time::Now().InMillisecondsFSinceUnixEpoch()); Save(); Notify();
+  bool immediate = rerun_; rerun_ = false;
+  timer_.Start(FROM_HERE, immediate ? base::Seconds(1) : base::Seconds(30),
+               this, &RemocodeSyncService::Refresh);
+}
+void RemocodeSyncService::Fail(std::string operation) {
+  busy_ = false;
+  if (error_code_ == "RECENT_AUTHENTICATION_REQUIRED") operation = "reauthRequired";
+  operation_ = deletion_status_ == "pending" ? "deletePending" : std::move(operation);
+  Notify();
+  if (deletion_status_ == "pending" && SignedIn())
+    timer_.Start(FROM_HERE, base::Seconds(30), this, &RemocodeSyncService::Refresh);
+}
+std::string RemocodeSyncService::PrepareCloudDeletion() {
+  if (!SignedIn() || busy_ || deletion_status_ == "pending" ||
+      (entitlement_ != "active" && entitlement_ != "free")) return "";
+  deletion_nonce_ = base::Uuid::GenerateRandomV4().AsLowercaseString();
+  deletion_expires_ = base::Time::Now() + base::Minutes(2);
+  return deletion_nonce_;
+}
+bool RemocodeSyncService::DeleteCloud(const std::string& nonce) {
+  if (nonce.empty() || nonce != deletion_nonce_ || base::Time::Now() > deletion_expires_ ||
+      !SignedIn() || busy_ || deletion_status_ == "pending") return false;
+  Invalidate();
+  local_state_.Set("enabled", Disabled());
+  local_state_.Set("enrollmentDirty", true);
+  local_state_.Remove("pending"); Save();
+  busy_ = true; operation_ = "pending"; Notify();
+  base::DictValue body; body.Set("confirmation", "DELETE");
+  Request(Endpoint::kDelete, std::move(body), base::BindOnce(
+      [](base::WeakPtr<RemocodeSyncService> self, int status, base::DictValue data) {
+        if (!self) return;
+        if (status != 200 && status != 202) {
+          self->RecordError(data); self->Fail("deleteFailed"); return;
+        }
+        // Compatibility: a legacy 202 pending is safe to recognize. A legacy
+        // deleted:true is also explicit completion; missing fields are not.
+        if (!data.contains("deletionStatus")) {
+          const auto* legacy = data.FindString("status");
+          if (status == 202 && legacy && *legacy == "pending") {
+            data.Set("deletionStatus", "pending"); data.Set("deletionPending", true);
+          } else if (status == 200 && (data.FindBool("deleted").value_or(false) ||
+                     (legacy && *legacy == "deleted"))) {
+            data.Set("deletionStatus", "completed"); data.Set("deletionPending", false);
+          }
+        }
+        const auto* deletion = data.FindString("deletionStatus");
+        if (!deletion || (*deletion != "pending" && *deletion != "completed" &&
+                          *deletion != "failed") || !self->AcceptDeletionStatus(data)) {
+          self->Fail("deleteFailed"); return;
+        }
+        self->RecordError(data);
+        self->Save(); self->busy_ = false; self->Notify();
+        if (self->deletion_status_ == "pending")
+          self->timer_.Start(FROM_HERE, base::Seconds(30), self.get(), &RemocodeSyncService::Refresh);
+      }, operation_factory_.GetWeakPtr()));
+  return true;
+}
+}  // namespace browseros::sync

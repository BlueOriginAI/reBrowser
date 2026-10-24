diff --git a/chrome/browser/browseros/sync/remocode_sync_service_unittest.cc b/chrome/browser/browseros/sync/remocode_sync_service_unittest.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_service_unittest.cc
@@ -0,0 +1,260 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/remocode_sync_service.h"
+#include "base/functional/bind.h"
+#include "base/json/json_writer.h"
+#include "chrome/browser/bookmarks/bookmark_model_factory.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "chrome/browser/browseros/account/remocode_account_service_test_peer.h"
+#include "chrome/browser/browseros/sync/remocode_sync_service_factory.h"
+#include "chrome/browser/browseros/sync/sync_protocol.h"
+#include "chrome/browser/history/history_service_factory.h"
+#include "chrome/test/base/testing_profile.h"
+#include "components/bookmarks/browser/bookmark_model.h"
+#include "components/bookmarks/test/test_bookmark_client.h"
+#include "components/history/core/browser/history_service.h"
+#include "components/history/core/test/history_service_test_util.h"
+#include "components/os_crypt/async/browser/test_utils.h"
+#include "content/public/test/browser_task_environment.h"
+#include "net/http/http_status_code.h"
+#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
+#include "services/network/test/test_url_loader_factory.h"
+#include "testing/gtest/include/gtest/gtest.h"
+namespace browseros::sync {
+namespace {
+constexpr char kStatusURL[] = "https://remocode.cc/account/api/desktop/sync/status";
+}
+class RemocodeSyncServiceTest : public testing::Test {
+ protected:
+  void SetUp() override {
+    RemocodeSyncServiceFactory::GetInstance();
+    remocode::AccountServiceFactory::GetInstance();
+    TestingProfile::Builder builder;
+    builder.AddTestingFactory(BookmarkModelFactory::GetInstance(),
+        base::BindRepeating([](content::BrowserContext*) -> std::unique_ptr<KeyedService> {
+          return bookmarks::TestBookmarkClient::CreateModel();
+        }));
+    builder.AddTestingFactory(HistoryServiceFactory::GetInstance(),
+        base::BindRepeating([](content::BrowserContext* context) -> std::unique_ptr<KeyedService> {
+          return history::CreateHistoryService(context->GetPath(), true);
+        }));
+    profile_ = builder.Build();
+    crypto_ = os_crypt_async::GetTestOSCryptAsyncForTesting(true);
+    account_ = std::make_unique<remocode::AccountService>(profile_.get(),
+        network_.GetSafeWeakWrapper(), crypto_.get());
+    service_ = std::make_unique<RemocodeSyncService>(profile_.get(), account_.get());
+    task_environment_.RunUntilIdle();
+  }
+  void TearDown() override {
+    service_->Shutdown(); service_.reset();
+    account_->Shutdown(); account_.reset();
+    profile_.reset(); task_environment_.RunUntilIdle();
+  }
+  base::DictValue Status(bool active = false) {
+    base::DictValue data;
+    data.Set("serviceAvailable", true); data.Set("vip", active ? "active" : "inactive");
+    data.Set("vipExpiresAt", active ? base::Value(static_cast<double>(base::Time::Now().InMillisecondsSinceUnixEpoch()) + 60000) : base::Value());
+    data.Set("purchaseAvailable", false);
+    data.Set("managementAvailable", false);
+    base::DictValue enabled;
+    enabled.Set("bookmarks", false); enabled.Set("history", false); enabled.Set("agent_history", false);
+    data.Set("enabled", std::move(enabled)); data.Set("registration", base::Value());
+    return data;
+  }
+  bool Accept(const base::DictValue& status) { return service_->AcceptStatus(status); }
+  std::string Entitlement() { return *service_->GetState().FindString("entitlement"); }
+  std::string Operation() { return *service_->GetState().FindString("operation"); }
+  void SignIn(std::string installation = "synthetic-installation-a") {
+    remocode::AccountServiceTestPeer::SignIn(*account_, "synthetic-test-access", installation);
+    task_environment_.RunUntilIdle();
+  }
+  void Reply(base::DictValue data, net::HttpStatusCode status = net::HTTP_OK,
+             const char* endpoint = kStatusURL) {
+    ASSERT_TRUE(network_.SimulateResponseForPendingRequest(endpoint, *base::WriteJson(data), status));
+    task_environment_.RunUntilIdle();
+  }
+  bool Polling() { return service_->timer_.IsRunning(); }
+  bool DeadlineRunning() { return service_->entitlement_timer_.IsRunning(); }
+  bool HasWireConsentTime() { return WireNumber(service_->local_state_, "historySince").has_value(); }
+  std::string ConsentTimeState() { return base::WriteJson(service_->local_state_).value_or("invalid test state"); }
+  base::WeakPtr<RemocodeSyncService> OperationGeneration() {
+    return service_->operation_factory_.GetWeakPtr();
+  }
+  content::BrowserTaskEnvironment task_environment_{
+      base::test::TaskEnvironment::TimeSource::MOCK_TIME};
+  network::TestURLLoaderFactory network_;
+  std::unique_ptr<os_crypt_async::OSCryptAsync> crypto_;
+  std::unique_ptr<TestingProfile> profile_;
+  std::unique_ptr<remocode::AccountService> account_;
+  std::unique_ptr<RemocodeSyncService> service_;
+};
+TEST_F(RemocodeSyncServiceTest, DefaultsOffAndAgentIsNotAGlobalRecordingAdapter) {
+  const auto state = service_->GetState();
+  for (const auto* stream : {"bookmarks", "history", "agent_history"})
+    EXPECT_FALSE(state.FindDict("enabled")->FindBool(stream).value());
+  EXPECT_FALSE(state.FindDict("available")->FindBool("agent_history").value());
+  EXPECT_FALSE(state.contains("accessToken")); EXPECT_FALSE(state.contains("refreshToken"));
+  EXPECT_FALSE(state.FindBool("purchaseAvailable").value());
+  EXPECT_FALSE(state.FindBool("managementAvailable").value());
+}
+TEST_F(RemocodeSyncServiceTest, FreeErrorAndUnavailableAreDistinct) {
+  auto data = Status();
+  ASSERT_TRUE(Accept(data)); EXPECT_EQ(Entitlement(), "free");
+  data.Remove("vip");
+  EXPECT_FALSE(Accept(data)); EXPECT_EQ(Entitlement(), "error");
+  data.Set("serviceAvailable", false);
+  EXPECT_FALSE(Accept(data)); EXPECT_EQ(Entitlement(), "unavailable");
+}
+TEST_F(RemocodeSyncServiceTest, ExpiredVipAndMalformedStatusNeverUnlock) {
+  auto data = Status(); data.Set("vip", "active"); data.Set("vipExpiresAt", 1);
+  EXPECT_FALSE(Accept(data)); EXPECT_EQ(Entitlement(), "error");
+  data.Set("vipExpiresAt", static_cast<double>(base::Time::Now().InMillisecondsSinceUnixEpoch()) + 60000);
+  ASSERT_TRUE(Accept(data)); EXPECT_EQ(Entitlement(), "active");
+  data.FindDict("enabled")->Remove("history");
+  EXPECT_FALSE(Accept(data)); EXPECT_EQ(Entitlement(), "error");
+}
+TEST_F(RemocodeSyncServiceTest, WebMessagesCannotSelectProviderOrGrantVip) {
+  auto enabled = service_->GetState().FindDict("enabled")->Clone();
+  enabled.Set("agent_history", true);
+  EXPECT_FALSE(service_->SetEnabled(enabled));
+  enabled.Set("vip", true);
+  EXPECT_FALSE(service_->SetEnabled(enabled));
+  EXPECT_TRUE(service_->PrepareCloudDeletion().empty());
+  EXPECT_FALSE(service_->DeleteCloud("DELETE"));
+}
+TEST_F(RemocodeSyncServiceTest, IncognitoServiceIsNeverRedirectedToRegularProfile) {
+  EXPECT_EQ(nullptr, RemocodeSyncServiceFactory::GetForProfile(
+      profile_->GetPrimaryOTRProfile(/*create_if_needed=*/true)));
+}
+TEST_F(RemocodeSyncServiceTest, CapabilitiesRequireStrictServerBooleansAndDefaultFalse) {
+  SignIn();
+  auto data = Status();
+  data.Set("purchaseAvailable", true); data.Set("managementAvailable", true);
+  Reply(data.Clone());
+  EXPECT_TRUE(service_->GetState().FindBool("purchaseAvailable").value());
+  EXPECT_TRUE(service_->GetState().FindBool("managementAvailable").value());
+  data.Set("purchaseAvailable", "true");
+  EXPECT_FALSE(Accept(data));
+  EXPECT_FALSE(service_->GetState().FindBool("purchaseAvailable").value());
+  EXPECT_FALSE(service_->GetState().FindBool("managementAvailable").value());
+  data.Remove("purchaseAvailable"); data.Remove("managementAvailable");
+  EXPECT_TRUE(Accept(data));
+  EXPECT_FALSE(service_->GetState().FindBool("purchaseAvailable").value());
+  EXPECT_FALSE(service_->GetState().FindBool("managementAvailable").value());
+}
+TEST_F(RemocodeSyncServiceTest, FreeRefreshAndPurchaseNeverCreateConsentOrPoll) {
+  SignIn();
+  auto free = Status(); free.Set("purchaseAvailable", true);
+  Reply(std::move(free));
+  EXPECT_EQ(Entitlement(), "free"); EXPECT_FALSE(Polling());
+  const auto count = network_.total_requests();
+  task_environment_.FastForwardBy(base::Minutes(2));
+  EXPECT_EQ(count, network_.total_requests());
+  service_->Refresh();
+  auto active = Status(true);
+  // Even stale server consent cannot opt in this local profile.
+  active.FindDict("enabled")->Set("bookmarks", true);
+  Reply(std::move(active));
+  EXPECT_FALSE(service_->GetState().FindDict("enabled")->FindBool("bookmarks").value());
+  EXPECT_FALSE(service_->GetState().FindDict("enabled")->FindBool("history").value());
+}
+TEST_F(RemocodeSyncServiceTest, VipDeadlineCancelsAnInFlightStatusGeneration) {
+  SignIn();
+  auto status = Status(true);
+  status.Set("vipExpiresAt", static_cast<double>(base::Time::Now().InMillisecondsSinceUnixEpoch()) + 10000);
+  Reply(std::move(status));
+  ASSERT_TRUE(DeadlineRunning());
+  service_->Refresh();
+  auto generation = OperationGeneration();
+  ASSERT_TRUE(generation);
+  task_environment_.FastForwardBy(base::Seconds(10));
+  EXPECT_FALSE(generation);
+  EXPECT_EQ(Entitlement(), "free"); EXPECT_EQ(Operation(), "paused");
+  EXPECT_FALSE(service_->GetState().FindBool("busy").value());
+  EXPECT_FALSE(Polling());
+}
+TEST_F(RemocodeSyncServiceTest, AccountSwitchWhileBusyCancelsOldGenerationAndCapabilities) {
+  SignIn();
+  auto status = Status(true); status.Set("managementAvailable", true);
+  Reply(std::move(status));
+  service_->Refresh();
+  auto generation = OperationGeneration();
+  SignIn("synthetic-installation-b");
+  EXPECT_FALSE(generation);
+  EXPECT_FALSE(service_->GetState().FindBool("managementAvailable").value());
+  Reply(Status());
+  EXPECT_EQ(Entitlement(), "free");
+  EXPECT_FALSE(service_->GetState().FindDict("enabled")->FindBool("bookmarks").value());
+}
+TEST_F(RemocodeSyncServiceTest, PendingDeletionSurvivesLegacyAndNoneUntilExplicitCompletion) {
+  SignIn();
+  auto status = Status();
+  status.Set("deletionPending", true); status.Set("deletionStatus", "pending");
+  Reply(status.Clone());
+  EXPECT_EQ(Operation(), "deletePending"); EXPECT_TRUE(Polling());
+  status.Remove("deletionStatus"); status.Set("deletionPending", false);
+  service_->Refresh(); Reply(status.Clone());
+  EXPECT_EQ(Operation(), "deletePending");
+  status.Set("deletionStatus", "none");
+  service_->Refresh(); Reply(status.Clone());
+  EXPECT_EQ(Operation(), "deletePending");
+  EXPECT_FALSE(service_->GetState().FindBool("canDelete").value());
+  status.Set("deletionStatus", "completed");
+  service_->Refresh(); Reply(status.Clone());
+  EXPECT_EQ(Operation(), "paused");
+  EXPECT_EQ(*service_->GetState().FindString("deletionStatus"), "completed");
+  EXPECT_FALSE(Polling());
+}
+TEST_F(RemocodeSyncServiceTest, ContradictoryDeletionAndWrongTypesAreRejected) {
+  auto status = Status();
+  status.Set("deletionPending", true); status.Set("deletionStatus", "completed");
+  EXPECT_FALSE(Accept(status));
+  status.Set("deletionPending", "false"); status.Set("deletionStatus", "none");
+  EXPECT_FALSE(Accept(status));
+  status.Set("deletionPending", false); status.Set("deletionStatus", "not-a-status");
+  EXPECT_FALSE(Accept(status));
+}
+TEST_F(RemocodeSyncServiceTest, PendingDeletionErrorsRetainStateAndExposeRealCode) {
+  SignIn();
+  auto status = Status(); status.Set("deletionPending", true);
+  Reply(std::move(status));
+  base::DictValue error; base::DictValue detail;
+  detail.Set("code", "CLOUD_STORAGE_UNAVAILABLE"); detail.Set("message", "synthetic failure");
+  error.Set("error", std::move(detail));
+  service_->Refresh(); Reply(std::move(error), net::HTTP_SERVICE_UNAVAILABLE);
+  EXPECT_EQ(Operation(), "deletePending"); EXPECT_TRUE(Polling());
+  EXPECT_EQ(*service_->GetState().FindString("errorCode"), "CLOUD_STORAGE_UNAVAILABLE");
+}
+TEST_F(RemocodeSyncServiceTest, DeleteParsesWorkerNestedRecentAuthenticationError) {
+  SignIn(); Reply(Status());
+  const auto nonce = service_->PrepareCloudDeletion();
+  ASSERT_FALSE(nonce.empty());
+  ASSERT_TRUE(service_->DeleteCloud(nonce));
+  base::DictValue error; base::DictValue detail;
+  detail.Set("code", "RECENT_AUTHENTICATION_REQUIRED"); detail.Set("message", "Sign in again");
+  error.Set("error", std::move(detail));
+  Reply(std::move(error), net::HTTP_FORBIDDEN,
+        "https://remocode.cc/account/api/desktop/sync/delete");
+  EXPECT_EQ(Operation(), "reauthRequired");
+  EXPECT_TRUE(service_->GetState().FindBool("needsReauth").value());
+  EXPECT_EQ(*service_->GetState().FindString("errorCode"), "RECENT_AUTHENTICATION_REQUIRED");
+}
+TEST_F(RemocodeSyncServiceTest, HistoryConsentTimeUsesIntegerWireMilliseconds) {
+  SignIn(); Reply(Status(true));
+  // Exercise a fractional millisecond clock; WireNumber must still accept the
+  // persisted floor used by ReadLocal(), not silently fail every history cycle.
+  task_environment_.AdvanceClock(base::Microseconds(123));
+  auto enabled = service_->GetState().FindDict("enabled")->Clone();
+  enabled.Set("history", true);
+  ASSERT_TRUE(service_->SetEnabled(enabled));
+  EXPECT_TRUE(HasWireConsentTime()) << ConsentTimeState();
+}
+TEST_F(RemocodeSyncServiceTest, PendingDeletionFailureIsAnExplicitTerminalState) {
+  SignIn();
+  auto status = Status(); status.Set("deletionStatus", "pending");
+  Reply(status.Clone());
+  status.Set("deletionStatus", "failed"); status.Set("deletionPending", false);
+  service_->Refresh(); Reply(std::move(status));
+  EXPECT_EQ(Operation(), "deleteFailed"); EXPECT_FALSE(Polling());
+}
+}  // namespace browseros::sync

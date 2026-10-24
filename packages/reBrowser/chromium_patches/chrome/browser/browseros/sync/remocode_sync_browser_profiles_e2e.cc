diff --git a/chrome/browser/browseros/sync/remocode_sync_browser_profiles_e2e.cc b/chrome/browser/browseros/sync/remocode_sync_browser_profiles_e2e.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_browser_profiles_e2e.cc
@@ -0,0 +1,324 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+// Dedicated testonly executable. Requires a fresh local Worker fixture on
+// 127.0.0.1:8792; never contacts production, never uses a user's profile/tokens.
+// Client authentication is injected; entitlements are synthetic server fixtures.
+// VIP, registration, CAS, deletion and category checks all pass through native
+// AccountService and real HTTP, never direct client-side VIP assignment.
+// This is not a Stripe checkout or real OAuth E2E.
+#include "chrome/browser/browseros/sync/remocode_sync_service.h"
+
+#include <memory>
+#include <optional>
+#include <string>
+#include <utility>
+#include "base/check.h"
+#include "base/command_line.h"
+#include "base/functional/bind.h"
+#include "base/json/json_reader.h"
+#include "base/json/json_writer.h"
+#include "base/run_loop.h"
+#include "base/task/cancelable_task_tracker.h"
+#include "base/test/scoped_run_loop_timeout.h"
+#include "base/test/test_future.h"
+#include "chrome/browser/bookmarks/bookmark_model_factory.h"
+#include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/account/remocode_account_service_test_peer.h"
+#include "chrome/browser/history/history_service_factory.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/profiles/profile_manager.h"
+#include "chrome/browser/profiles/profile_test_util.h"
+#include "chrome/browser/ui/browser.h"
+#include "chrome/test/base/in_process_browser_test.h"
+#include "components/bookmarks/browser/bookmark_model.h"
+#include "components/bookmarks/common/bookmark_metrics.h"
+#include "components/bookmarks/test/bookmark_test_helpers.h"
+#include "components/history/core/browser/history_service.h"
+#include "components/history/core/browser/history_types.h"
+#include "components/history/core/test/history_service_test_util.h"
+#include "components/os_crypt/async/browser/test_utils.h"
+#include "content/public/browser/storage_partition.h"
+#include "content/public/test/browser_test.h"
+#include "mojo/public/cpp/bindings/receiver_set.h"
+#include "net/base/net_errors.h"
+#include "net/traffic_annotation/network_traffic_annotation_test_helper.h"
+#include "services/network/public/cpp/cross_thread_pending_shared_url_loader_factory.h"
+#include "services/network/public/cpp/resource_request.h"
+#include "services/network/public/cpp/simple_url_loader.h"
+#include "testing/gtest/include/gtest/gtest.h"
+#include "url/gurl.h"
+
+namespace browseros::sync {
+namespace {
+constexpr char kOrigin[] = "http://127.0.0.1:8792";
+constexpr char kPrefix[] = "/account/api/desktop/sync/";
+
+// This entire transport lives only in the test executable. It permits exactly
+// the five native production sync routes and rewrites only their origin to the
+// fixed loopback fixture. It cannot be configured by WebUI, flags or env vars.
+class FixtureTransport final : public network::SharedURLLoaderFactory {
+ public:
+  explicit FixtureTransport(scoped_refptr<network::SharedURLLoaderFactory> network)
+      : network_(std::move(network)) {}
+  void CreateLoaderAndStart(mojo::PendingReceiver<network::mojom::URLLoader> loader,
+      int32_t id, uint32_t options, const network::ResourceRequest& request,
+      mojo::PendingRemote<network::mojom::URLLoaderClient> client,
+      const net::MutableNetworkTrafficAnnotationTag& annotation) override {
+    CHECK_EQ(request.url.DeprecatedGetOriginAsURL(), GURL("https://remocode.cc"));
+    const auto& path = request.url.path();
+    bool allowed = false;
+    for (const char* endpoint : {"status", "enrollment", "pull", "push", "delete"})
+      allowed |= path == std::string(kPrefix) + endpoint;
+    CHECK(allowed);
+    CHECK(!request.url.has_query());
+    CHECK_EQ(request.credentials_mode, network::mojom::CredentialsMode::kOmit);
+    CHECK_EQ(request.redirect_mode, network::mojom::RedirectMode::kError);
+    const auto bearer = request.headers.GetHeader("Authorization");
+    CHECK(bearer && (*bearer == "Bearer fixture-device-a" ||
+                    *bearer == "Bearer fixture-device-b" ||
+                    *bearer == "Bearer fixture-device-free"));
+    ++requests_;
+    network::ResourceRequest local(request);
+    local.url = GURL(std::string(kOrigin) + std::string(path));
+    network_->CreateLoaderAndStart(std::move(loader), id, options, local,
+                                   std::move(client), annotation);
+  }
+  void Clone(mojo::PendingReceiver<network::mojom::URLLoaderFactory> receiver) override {
+    receivers_.Add(this, std::move(receiver));
+  }
+  std::unique_ptr<network::PendingSharedURLLoaderFactory> Clone() override {
+    return std::make_unique<network::CrossThreadPendingSharedURLLoaderFactory>(
+        base::WrapRefCounted(this));
+  }
+  size_t requests() const { return requests_; }
+  network::SharedURLLoaderFactory* network() { return network_.get(); }
+ private:
+  ~FixtureTransport() override = default;
+  size_t requests_ = 0;
+  scoped_refptr<network::SharedURLLoaderFactory> network_;
+  mojo::ReceiverSet<network::mojom::URLLoaderFactory> receivers_;
+};
+
+struct NativeProfile {
+  raw_ptr<Profile> profile = nullptr;
+  raw_ptr<bookmarks::BookmarkModel> bookmarks = nullptr;
+  raw_ptr<history::HistoryService> history = nullptr;
+  scoped_refptr<FixtureTransport> transport;
+  std::unique_ptr<os_crypt_async::OSCryptAsync> crypto;
+  std::unique_ptr<remocode::AccountService> account;
+  std::unique_ptr<RemocodeSyncService> sync;
+  ~NativeProfile() {
+    if (sync) sync->Shutdown();
+    sync.reset();
+    if (account) account->Shutdown();
+    account.reset();
+  }
+};
+
+base::DictValue Enabled(bool bookmarks, bool history) {
+  base::DictValue value;
+  value.Set("bookmarks", bookmarks); value.Set("history", history);
+  value.Set("agent_history", false);
+  return value;
+}
+}  // namespace
+
+class RemocodeSyncBrowserProfilesE2ETest : public InProcessBrowserTest {
+ protected:
+  void SetUpCommandLine(base::CommandLine* command_line) override {
+    InProcessBrowserTest::SetUpCommandLine(command_line);
+    command_line->AppendSwitch("disable-browseros-server");
+    command_line->AppendSwitch("disable-browseros-server-updater");
+    command_line->AppendSwitch("disable-browseros-extensions");
+    command_line->AppendSwitchASCII("remote-debugging-port", "0");
+  }
+  void SetUpOnMainThread() override {
+    InProcessBrowserTest::SetUpOnMainThread();
+    a_ = CreateNativeProfile(browser()->profile());
+    auto* manager = g_browser_process->profile_manager();
+    Profile& second = profiles::testing::CreateProfileSync(manager,
+        manager->user_data_dir().AppendASCII("NativeSyncProfileB"));
+    CreateBrowser(&second);
+    b_ = CreateNativeProfile(&second);
+    ASSERT_NE(a_->profile, b_->profile);
+    ASSERT_TRUE(a_->profile->IsRegularProfile());
+    ASSERT_TRUE(b_->profile->IsRegularProfile());
+    ASSERT_NE(a_->profile->GetPath(), b_->profile->GetPath());
+    info_ = FixtureRequest("/__fixture/info");
+    ASSERT_TRUE(info_.FindDict("profiles")) << "Start a fresh sync-local-worker fixture first";
+    Control("active");
+  }
+  void TearDownOnMainThread() override {
+    b_.reset(); a_.reset();
+    InProcessBrowserTest::TearDownOnMainThread();
+  }
+  std::unique_ptr<NativeProfile> CreateNativeProfile(Profile* profile) {
+    auto result = std::make_unique<NativeProfile>();
+    result->profile = profile;
+    result->bookmarks = BookmarkModelFactory::GetForBrowserContext(profile);
+    CHECK(result->bookmarks);
+    bookmarks::test::WaitForBookmarkModelToLoad(result->bookmarks);
+    result->history = HistoryServiceFactory::GetForProfile(profile, ServiceAccessType::EXPLICIT_ACCESS);
+    CHECK(result->history);
+    history::BlockUntilHistoryProcessesPendingRequests(result->history);
+    result->transport = base::MakeRefCounted<FixtureTransport>(
+        profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess());
+    result->crypto = os_crypt_async::GetTestOSCryptAsyncForTesting(true);
+    result->account = std::make_unique<remocode::AccountService>(profile,
+        result->transport, result->crypto.get());
+    result->sync = std::make_unique<RemocodeSyncService>(profile, result->account.get());
+    base::RunLoop().RunUntilIdle();
+    return result;
+  }
+  base::DictValue FixtureRequest(std::string path, std::optional<base::DictValue> body = std::nullopt) {
+    CHECK(path == "/__fixture/info" || path == "/__fixture/control");
+    auto request = std::make_unique<network::ResourceRequest>();
+    request->url = GURL(std::string(kOrigin) + path);
+    request->method = body ? "POST" : "GET";
+    request->credentials_mode = network::mojom::CredentialsMode::kOmit;
+    request->redirect_mode = network::mojom::RedirectMode::kError;
+    request->headers.SetHeader("x-local-fixture", "synthetic-e2e");
+    auto loader = network::SimpleURLLoader::Create(std::move(request), TRAFFIC_ANNOTATION_FOR_TESTS);
+    loader->SetTimeoutDuration(base::Seconds(10));
+    if (body) loader->AttachStringForUpload(*base::WriteJson(*body), "application/json");
+    base::test::TestFuture<std::optional<std::string>> future;
+    loader->DownloadToString(a_->transport->network(), future.GetCallback(), 64 * 1024);
+    auto response = future.Take();
+    EXPECT_EQ(loader->NetError(), net::OK);
+    if (!response) { ADD_FAILURE() << "Local fixture unavailable"; return {}; }
+    auto parsed = base::JSONReader::ReadDict(*response, base::JSON_PARSE_RFC);
+    EXPECT_TRUE(parsed);
+    return parsed ? std::move(*parsed) : base::DictValue();
+  }
+  void Control(const std::string& entitlement) {
+    base::DictValue body; body.Set("entitlement", entitlement);
+    FixtureRequest("/__fixture/control", std::move(body));
+  }
+  void Authenticate(NativeProfile& target, const char* key) {
+    const auto* identity = info_.FindDict("profiles")->FindDict(key);
+    ASSERT_TRUE(identity);
+    const auto* token = identity->FindString("token");
+    const auto* installation = identity->FindString("installationId");
+    ASSERT_TRUE(token); ASSERT_TRUE(installation);
+    remocode::AccountServiceTestPeer::SignIn(*target.account, *token, *installation);
+    Wait(target);
+  }
+  void Wait(NativeProfile& target) {
+    if (!target.sync->GetState().FindBool("busy").value_or(false)) return;
+    base::test::ScopedRunLoopTimeout timeout(FROM_HERE, base::Seconds(20));
+    base::RunLoop loop;
+    auto subscription = target.sync->Observe(base::BindRepeating(
+        [](RemocodeSyncService* service, base::RunLoop* loop) {
+          if (!service->GetState().FindBool("busy").value_or(false)) loop->Quit();
+        }, target.sync.get(), &loop));
+    loop.Run();
+    ASSERT_FALSE(target.sync->GetState().FindBool("busy").value());
+  }
+  void Refresh(NativeProfile& target) { target.sync->Refresh(); Wait(target); }
+  void ExpectSuccess(NativeProfile& target) {
+    const auto state = target.sync->GetState();
+    EXPECT_EQ(*state.FindString("operation"), "success") << *base::WriteJson(state);
+  }
+  history::QueryURLAndVisitsResult Visits(NativeProfile& target, const GURL& url) {
+    base::test::TestFuture<history::QueryURLAndVisitsResult> future;
+    target.history->QueryURLAndVisits(url, history::VisitQuery404sPolicy::kInclude404s,
+        future.GetCallback(), &tracker_);
+    return future.Take();
+  }
+  const bookmarks::BookmarkNode* Find(NativeProfile& target, const base::Uuid& uuid) {
+    return target.bookmarks->GetNodeByUuid(uuid,
+        bookmarks::BookmarkModel::NodeTypeForUuidLookup::kLocalOrSyncableNodes);
+  }
+  std::unique_ptr<NativeProfile> a_;
+  std::unique_ptr<NativeProfile> b_;
+  base::DictValue info_;
+  base::CancelableTaskTracker tracker_;
+};
+
+IN_PROC_BROWSER_TEST_F(RemocodeSyncBrowserProfilesE2ETest, NativeModelsThroughLocalWorker) {
+  Authenticate(*a_, "a"); Authenticate(*b_, "b");
+  for (auto* target : {a_.get(), b_.get()}) {
+    const auto state = target->sync->GetState();
+    ASSERT_EQ(*state.FindString("entitlement"), "active") << *base::WriteJson(state);
+    EXPECT_EQ(*state.FindDict("enabled"), Enabled(false, false));
+    EXPECT_FALSE(state.FindDict("available")->FindBool("agent_history").value());
+    EXPECT_FALSE(state.contains("accessToken"));
+    EXPECT_FALSE(state.contains("refreshToken"));
+  }
+  // Existing bookmarks may be shared with explicit consent. History before the
+  // enable timestamp is never backfilled, even though it exists in the real DB.
+  const auto* original = a_->bookmarks->AddURL(a_->bookmarks->bookmark_bar_node(),
+      0, u"Native fixture bookmark", GURL("https://example.com/native-bookmark?q=private#fragment"));
+  const base::Uuid bookmark_id = original->uuid();
+  const GURL old_history("https://example.com/native-before-consent");
+  a_->history->AddPage(old_history, base::Time::Now() - base::Days(1), history::SOURCE_BROWSED);
+  history::BlockUntilHistoryProcessesPendingRequests(a_->history);
+  ASSERT_TRUE(a_->sync->SetEnabled(Enabled(true, true))); Wait(*a_); ExpectSuccess(*a_);
+  ASSERT_TRUE(b_->sync->SetEnabled(Enabled(true, true))); Wait(*b_); ExpectSuccess(*b_);
+  const auto* imported = Find(*b_, bookmark_id);
+  ASSERT_TRUE(imported);
+  EXPECT_EQ(imported->url(), GURL("https://example.com/native-bookmark"));
+  EXPECT_EQ(original->url().query(), "q=private");
+  EXPECT_EQ(original->url().ref(), "fragment");
+  EXPECT_TRUE(Visits(*b_, old_history).visits.empty());
+
+  const GURL history_url("https://example.com/native-after-consent");
+  a_->history->AddPage(GURL(history_url.spec() + "?q=private#fragment"),
+                       base::Time::Now(), history::SOURCE_BROWSED);
+  history::BlockUntilHistoryProcessesPendingRequests(a_->history);
+  Refresh(*a_); ExpectSuccess(*a_);
+  Refresh(*b_); ExpectSuccess(*b_);
+  auto imported_visits = Visits(*b_, history_url);
+  ASSERT_EQ(imported_visits.visits.size(), 1u);
+  EXPECT_FALSE(imported_visits.visits.front().originator_cache_guid.empty());
+  Refresh(*b_); ExpectSuccess(*b_);
+  EXPECT_EQ(Visits(*b_, history_url).visits.size(), 1u);
+
+  a_->bookmarks->SetTitle(Find(*a_, bookmark_id), u"Updated through native service",
+                         bookmarks::metrics::BookmarkEditSource::kOther);
+  Refresh(*a_); ExpectSuccess(*a_); Refresh(*b_); ExpectSuccess(*b_);
+  ASSERT_TRUE(Find(*b_, bookmark_id));
+  EXPECT_EQ(Find(*b_, bookmark_id)->GetTitle(), u"Updated through native service");
+  const auto* unrelated = b_->bookmarks->AddURL(b_->bookmarks->other_node(), 0,
+      u"Keep unrelated local bookmark", GURL("https://example.com/keep-local"));
+  const auto unrelated_id = unrelated->uuid();
+  a_->bookmarks->Remove(Find(*a_, bookmark_id),
+      bookmarks::metrics::BookmarkEditSource::kOther, FROM_HERE);
+  Refresh(*a_); ExpectSuccess(*a_); Refresh(*b_); ExpectSuccess(*b_);
+  EXPECT_FALSE(Find(*b_, bookmark_id)); EXPECT_TRUE(Find(*b_, unrelated_id));
+
+  // Switching accounts resets consent and mappings but preserves local data.
+  Authenticate(*b_, "free");
+  EXPECT_EQ(*b_->sync->GetState().FindString("entitlement"), "free");
+  EXPECT_EQ(*b_->sync->GetState().FindDict("enabled"), Enabled(false, false));
+  EXPECT_TRUE(Find(*b_, unrelated_id));
+  EXPECT_EQ(Visits(*b_, history_url).visits.size(), 1u);
+  EXPECT_FALSE(b_->sync->SetEnabled(Enabled(true, true)));
+
+  // The entitlement is changed only in the Worker fixture's DB, not in native
+  // fields or prefs. Every refresh below goes through the production parser.
+  Control("expired"); Refresh(*a_);
+  EXPECT_EQ(*a_->sync->GetState().FindString("entitlement"), "free");
+  const size_t count = a_->transport->requests();
+  a_->bookmarks->AddURL(a_->bookmarks->other_node(), 0, u"Not exported while expired",
+                        GURL("https://example.com/native-expired"));
+  base::RunLoop().RunUntilIdle();
+  EXPECT_EQ(count, a_->transport->requests());
+  Control("revoked"); Refresh(*a_);
+  EXPECT_EQ(*a_->sync->GetState().FindString("entitlement"), "free");
+  Control("active"); Refresh(*a_);
+  EXPECT_EQ(*a_->sync->GetState().FindString("entitlement"), "active");
+
+  const auto nonce = a_->sync->PrepareCloudDeletion();
+  ASSERT_FALSE(nonce.empty());
+  ASSERT_TRUE(a_->sync->DeleteCloud(nonce)); Wait(*a_);
+  EXPECT_EQ(*a_->sync->GetState().FindString("operation"), "deletePending");
+  Refresh(*a_);
+  EXPECT_TRUE(a_->sync->GetState().FindBool("deletionPending").value());
+  EXPECT_EQ(*a_->sync->GetState().FindString("operation"), "deletePending");
+  // Grace/late-write GC is checked by Worker tests; missing fields cannot claim
+  // completion. Local models remain intact after the cloud delete request.
+  EXPECT_TRUE(Find(*b_, unrelated_id));
+  EXPECT_EQ(Visits(*b_, history_url).visits.size(), 1u);
+}
+}  // namespace browseros::sync

diff --git a/chrome/browser/browseros/sync/adapters/local_sync_adapters_unittest.cc b/chrome/browser/browseros/sync/adapters/local_sync_adapters_unittest.cc
new file mode 100644
index 0000000000000000000000000000000000000000..58acdb84c47041e0bcd2dc0c65b9314a633939c3
--- /dev/null
+++ b/chrome/browser/browseros/sync/adapters/local_sync_adapters_unittest.cc
@@ -0,0 +1,420 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+// All inputs are synthetic and stored in TestingProfile's disposable directory.
+// No real browsing profile, navigation, network, account or entitlement is used.
+#include "chrome/browser/browseros/sync/adapters/local_sync_adapters.h"
+
+#include <memory>
+#include <string>
+#include <utility>
+
+#include "base/functional/bind.h"
+#include "base/memory/raw_ptr.h"
+#include "base/task/cancelable_task_tracker.h"
+#include "base/test/test_future.h"
+#include "base/time/time.h"
+#include "base/uuid.h"
+#include "chrome/browser/bookmarks/bookmark_model_factory.h"
+#include "chrome/browser/browseros/sync/adapters/sync_adapter_util.h"
+#include "chrome/browser/history/history_service_factory.h"
+#include "chrome/test/base/testing_profile.h"
+#include "components/bookmarks/browser/bookmark_model.h"
+#include "components/bookmarks/common/bookmark_metrics.h"
+#include "components/bookmarks/test/test_bookmark_client.h"
+#include "components/history/core/browser/history_service.h"
+#include "components/history/core/browser/history_types.h"
+#include "components/history/core/test/history_service_test_util.h"
+#include "components/prefs/pref_service.h"
+#include "components/sync_preferences/testing_pref_service_syncable.h"
+#include "content/public/test/browser_task_environment.h"
+#include "testing/gtest/include/gtest/gtest.h"
+
+namespace browseros::sync {
+namespace {
+using Result = LocalSyncAdapters::Result;
+using Stream = LocalSyncAdapters::Stream;
+
+std::string Uuid() { return base::Uuid::GenerateRandomV4().AsLowercaseString(); }
+
+base::DictValue Bookmark(std::string id, std::string parent = "root:toolbar",
+                         std::string after = "", bool folder = false) {
+  base::DictValue entry;
+  entry.Set("id", std::move(id));
+  entry.Set("deleted", false);
+  entry.Set("revision", 1);
+  entry.Set("parentId", std::move(parent));
+  entry.Set("afterId", after.empty() ? base::Value() : base::Value(after));
+  entry.Set("title", "Synthetic bookmark");
+  entry.Set("url", folder ? base::Value() : base::Value("https://example.com/page"));
+  return entry;
+}
+
+base::DictValue History(std::string id, base::Time at) {
+  base::DictValue entry;
+  entry.Set("id", std::move(id));
+  entry.Set("deleted", false);
+  entry.Set("revision", 1);
+  entry.Set("url", "https://example.com/page");
+  entry.Set("title", "Synthetic remote visit");
+  entry.Set("visitedAt", static_cast<double>(at.InMillisecondsSinceUnixEpoch()));
+  return entry;
+}
+
+base::DictValue Deleted(std::string id, int revision = 2) {
+  base::DictValue entry;
+  entry.Set("id", std::move(id));
+  entry.Set("deleted", true);
+  entry.Set("revision", revision);
+  return entry;
+}
+
+base::ListValue Batch(base::DictValue entry) {
+  base::ListValue entries;
+  entries.Append(std::move(entry));
+  return entries;
+}
+
+TEST(SyncAdapterURLTest, RejectsPrivateInternalAndAuthorizationURLs) {
+  for (const char* input : {
+           "chrome://history/", "file:///tmp/private", "javascript:alert(1)",
+           "data:text/plain,secret", "https://user:pass@example.com/page",
+           "http://127.0.0.1/", "http://127.1/", "http://[::1]/",
+           "http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/",
+           "http://169.254.169.254/", "http://[fc00::1]/", "http://[fe80::1]/",
+           "http://intranet/", "https://host.local/", "https://host.internal/",
+           "https://localhost/", "https://example.com/oauth/callback",
+           "https://example.com/reset-password", "https://example.com/%61uth",
+           "https://example.com/page?access_token=synthetic",
+           "https://example.com/page?code=synthetic", "https://login.example.com/"}) {
+    EXPECT_FALSE(internal::SanitizeURL(GURL(input))) << input;
+  }
+}
+
+TEST(SyncAdapterURLTest, RemovesOnlyExportedQueryAndFragment) {
+  const GURL original("https://example.com/page?q=synthetic#private");
+  auto sanitized = internal::SanitizeURL(original);
+  ASSERT_TRUE(sanitized);
+  EXPECT_EQ("https://example.com/page", sanitized->spec());
+  EXPECT_EQ("q=synthetic", original.query());
+  EXPECT_EQ("private", original.ref());
+  EXPECT_EQ(std::string(1024, 'a'), internal::SafeTitle(std::u16string(1100, u'a')));
+  EXPECT_EQ("a b", internal::SafeTitle(u"a\nb"));
+}
+
+TEST(SyncAdapterValidationTest, RejectsPrivateExtraFieldsAndInvalidIds) {
+  auto entry = Bookmark(Uuid());
+  entry.Set("cookies", "must never cross this boundary");
+  EXPECT_FALSE(internal::NormalizeEntry(base::Value(entry.Clone()), true));
+  entry.Remove("cookies");
+  entry.Set("id", "root:toolbar");
+  EXPECT_FALSE(internal::NormalizeEntry(base::Value(entry.Clone()), true));
+  entry.Set("id", Uuid());
+  entry.Set("revision", -1);
+  EXPECT_FALSE(internal::NormalizeEntry(base::Value(entry.Clone()), true));
+  entry.Set("revision", 1);
+  entry.Set("url", "https://example.com/page?q=not-canonical");
+  EXPECT_FALSE(internal::NormalizeEntry(base::Value(entry.Clone()), true));
+  entry.Set("url", "https://example.com/page");
+  entry.Set("title", std::string(1025, 'a'));
+  EXPECT_FALSE(internal::NormalizeEntry(base::Value(entry.Clone()), true));
+}
+
+class LocalSyncAdaptersTest : public testing::Test {
+ protected:
+  void SetUp() override {
+    TestingProfile::Builder builder;
+    builder.AddTestingFactory(BookmarkModelFactory::GetInstance(),
+        base::BindRepeating([](content::BrowserContext*) -> std::unique_ptr<KeyedService> {
+          return bookmarks::TestBookmarkClient::CreateModel();
+        }));
+    builder.AddTestingFactory(HistoryServiceFactory::GetInstance(),
+        base::BindRepeating([](content::BrowserContext* context)
+                               -> std::unique_ptr<KeyedService> {
+          return history::CreateHistoryService(context->GetPath(), true);
+        }));
+    profile_ = builder.Build();
+    if (!profile_->GetPrefs()->FindPreference("browseros.sync.local.bookmarks")) {
+      LocalSyncAdapters::RegisterProfilePrefs(profile_->GetTestingPrefService()->registry());
+    }
+    model_ = BookmarkModelFactory::GetForBrowserContext(profile_.get());
+    history_ = HistoryServiceFactory::GetForProfile(
+        profile_.get(), ServiceAccessType::EXPLICIT_ACCESS);
+    adapters_ = std::make_unique<LocalSyncAdapters>(profile_.get());
+    ASSERT_TRUE(adapters_->IsAvailable(Stream::kBookmarks));
+    ASSERT_TRUE(adapters_->IsAvailable(Stream::kHistory));
+  }
+
+  void TearDown() override {
+    adapters_->Shutdown();
+    adapters_.reset();
+    model_ = nullptr;
+    history_ = nullptr;
+    profile_.reset();
+    environment_.RunUntilIdle();
+  }
+
+  Result ReadBookmarks() {
+    base::test::TestFuture<Result> future;
+    adapters_->ReadBookmarks(future.GetCallback());
+    return future.Take();
+  }
+  Result ApplyBookmarks(base::ListValue entries) {
+    base::test::TestFuture<Result> future;
+    adapters_->ApplyBookmarks(std::move(entries), future.GetCallback());
+    return future.Take();
+  }
+  Result ReadHistory(base::Time since) {
+    base::test::TestFuture<Result> future;
+    adapters_->ReadHistory(since, future.GetCallback());
+    return future.Take();
+  }
+  Result ApplyHistory(base::ListValue entries) {
+    base::test::TestFuture<Result> future;
+    adapters_->ApplyHistory(std::move(entries), future.GetCallback());
+    return future.Take();
+  }
+  history::QueryURLAndVisitsResult Visits() {
+    base::test::TestFuture<history::QueryURLAndVisitsResult> future;
+    history_->QueryURLAndVisits(GURL("https://example.com/page"),
+        history::VisitQuery404sPolicy::kInclude404s, future.GetCallback(), &tracker_);
+    return future.Take();
+  }
+  const bookmarks::BookmarkNode* Find(const std::string& id) {
+    return model_->GetNodeByUuid(base::Uuid::ParseLowercase(id),
+        bookmarks::BookmarkModel::NodeTypeForUuidLookup::kLocalOrSyncableNodes);
+  }
+
+  content::BrowserTaskEnvironment environment_;
+  std::unique_ptr<TestingProfile> profile_;
+  raw_ptr<bookmarks::BookmarkModel> model_ = nullptr;
+  raw_ptr<history::HistoryService> history_ = nullptr;
+  std::unique_ptr<LocalSyncAdapters> adapters_;
+  base::CancelableTaskTracker tracker_;
+  const base::Time time_ = base::Time::Now() - base::Days(2);
+};
+
+TEST_F(LocalSyncAdaptersTest, RejectsOTRBeforeFactoryRedirection) {
+  LocalSyncAdapters otr(profile_->GetPrimaryOTRProfile(true));
+  EXPECT_FALSE(otr.IsAvailable(Stream::kBookmarks));
+  EXPECT_FALSE(otr.IsAvailable(Stream::kHistory));
+  base::test::TestFuture<Result> future;
+  otr.ReadBookmarks(future.GetCallback());
+  EXPECT_FALSE(future.Get().available);
+  EXPECT_FALSE(future.Get().success);
+}
+
+TEST_F(LocalSyncAdaptersTest, ReadsRealModelUUIDsSafeAnchorsAndRoots) {
+  const auto* first = model_->AddURL(model_->bookmark_bar_node(), 0, u"First",
+      GURL("https://example.com/first?q=synthetic#fragment"));
+  model_->AddURL(model_->bookmark_bar_node(), 1, u"Private",
+                GURL("http://192.168.1.1/"));
+  const auto* last = model_->AddFolder(model_->bookmark_bar_node(), 2, u"Folder");
+  auto result = ReadBookmarks();
+  ASSERT_TRUE(result.success);
+  ASSERT_EQ(2u, result.entries.size());
+  EXPECT_EQ(first->uuid().AsLowercaseString(), *result.entries[0].GetDict().FindString("id"));
+  EXPECT_EQ("root:toolbar", *result.entries[0].GetDict().FindString("parentId"));
+  EXPECT_TRUE(result.entries[0].GetDict().Find("afterId")->is_none());
+  EXPECT_EQ("https://example.com/first", *result.entries[0].GetDict().FindString("url"));
+  EXPECT_EQ(first->uuid().AsLowercaseString(), *result.entries[1].GetDict().FindString("afterId"));
+  EXPECT_EQ(last->uuid().AsLowercaseString(), *result.entries[1].GetDict().FindString("id"));
+  EXPECT_TRUE(result.entries[1].GetDict().Find("url")->is_none());
+  EXPECT_EQ("q=synthetic", first->url().query());
+  EXPECT_EQ(result.entries, ReadBookmarks().entries);
+}
+
+TEST_F(LocalSyncAdaptersTest, FirstMergeDoesNotDeleteAbsentLocalNodesOrEchoRemote) {
+  const auto* local = model_->AddURL(model_->other_node(), 0, u"Keep local",
+                                   GURL("https://example.com/local"));
+  const auto local_id = local->uuid().AsLowercaseString();
+  const auto remote_id = Uuid();
+  int changes = 0;
+  environment_.RunUntilIdle();
+  adapters_->SetOnChanged(base::BindRepeating([](int* n, Stream) { ++*n; }, &changes));
+  EXPECT_TRUE(ApplyBookmarks(Batch(Bookmark(remote_id))).success);
+  EXPECT_NE(nullptr, Find(local_id));
+  EXPECT_NE(nullptr, Find(remote_id));
+  auto read = ReadBookmarks();
+  ASSERT_EQ(1u, read.entries.size());
+  EXPECT_EQ(local_id, *read.entries[0].GetDict().FindString("id"));
+  EXPECT_EQ(0, changes);
+}
+
+TEST_F(LocalSyncAdaptersTest, RemoteOrderResolvesOutOfOrderParentsAndSiblings) {
+  const auto folder = Uuid();
+  const auto first = Uuid();
+  const auto second = Uuid();
+  base::ListValue batch;
+  batch.Append(Bookmark(second, folder, first));
+  batch.Append(Bookmark(first, folder));
+  batch.Append(Bookmark(folder, "root:mobile", "", true));
+  ASSERT_TRUE(ApplyBookmarks(std::move(batch)).success);
+  ASSERT_NE(nullptr, Find(folder));
+  ASSERT_EQ(2u, Find(folder)->children().size());
+  EXPECT_EQ(first, Find(folder)->children()[0]->uuid().AsLowercaseString());
+  EXPECT_EQ(second, Find(folder)->children()[1]->uuid().AsLowercaseString());
+  EXPECT_TRUE(ReadBookmarks().entries.empty());
+}
+
+TEST_F(LocalSyncAdaptersTest, MatchingAckDoesNotRewriteOriginalLocalURL) {
+  const auto* local = model_->AddURL(model_->bookmark_bar_node(), 0, u"Local",
+      GURL("https://example.com/page?q=synthetic#fragment"));
+  auto read = ReadBookmarks();
+  ASSERT_EQ(1u, read.entries.size());
+  read.entries[0].GetDict().Set("revision", 5);
+  EXPECT_TRUE(ApplyBookmarks(std::move(read.entries)).success);
+  EXPECT_EQ("q=synthetic", local->url().query());
+  EXPECT_EQ("fragment", local->url().ref());
+  EXPECT_TRUE(ReadBookmarks().entries.empty());
+}
+
+TEST_F(LocalSyncAdaptersTest, PreservesLocalEditDuringRemotePullAndCarriesRevision) {
+  const auto id = Uuid();
+  auto remote = Bookmark(id);
+  ASSERT_TRUE(ApplyBookmarks(Batch(remote.Clone())).success);
+  model_->SetTitle(Find(id), u"Local conflict",
+                  bookmarks::metrics::BookmarkEditSource::kOther);
+  remote.Set("title", "Conflicting remote");
+  remote.Set("revision", 8);
+  EXPECT_FALSE(ApplyBookmarks(Batch(std::move(remote))).success);
+  EXPECT_EQ(u"Local conflict", Find(id)->GetTitle());
+  auto read = ReadBookmarks();
+  ASSERT_EQ(1u, read.entries.size());
+  EXPECT_EQ(8, *read.entries[0].GetDict().FindDouble("revision"));
+}
+
+TEST_F(LocalSyncAdaptersTest, LocalRemovalIsExplicitTombstoneUntilAck) {
+  const auto id = Uuid();
+  ASSERT_TRUE(ApplyBookmarks(Batch(Bookmark(id))).success);
+  model_->Remove(Find(id), bookmarks::metrics::BookmarkEditSource::kOther, FROM_HERE);
+  auto result = ReadBookmarks();
+  ASSERT_EQ(1u, result.entries.size());
+  EXPECT_TRUE(*result.entries[0].GetDict().FindBool("deleted"));
+  EXPECT_EQ(1, *result.entries[0].GetDict().FindDouble("revision"));
+  EXPECT_TRUE(ApplyBookmarks(Batch(Deleted(id))).success);
+  EXPECT_TRUE(ReadBookmarks().entries.empty());
+}
+
+TEST_F(LocalSyncAdaptersTest, ExplicitFolderDeleteCannotRemoveUnrelatedLocalChild) {
+  const auto folder = Uuid();
+  ASSERT_TRUE(ApplyBookmarks(Batch(Bookmark(folder, "root:other", "", true))).success);
+  const auto* local = model_->AddURL(Find(folder), 0, u"Keep local child",
+                                   GURL("https://example.com/local"));
+  const auto local_id = local->uuid().AsLowercaseString();
+  EXPECT_FALSE(ApplyBookmarks(Batch(Deleted(folder))).success);
+  EXPECT_NE(nullptr, Find(folder));
+  EXPECT_NE(nullptr, Find(local_id));
+}
+
+TEST_F(LocalSyncAdaptersTest, ExplicitSubtreeDeleteDoesNotInventSiblingConflicts) {
+  const auto folder = Uuid();
+  const auto first = Uuid();
+  const auto second = Uuid();
+  base::ListValue batch;
+  batch.Append(Bookmark(folder, "root:other", "", true));
+  batch.Append(Bookmark(first, folder));
+  batch.Append(Bookmark(second, folder, first));
+  ASSERT_TRUE(ApplyBookmarks(std::move(batch)).success);
+  base::ListValue deletions;
+  deletions.Append(Deleted(folder));
+  deletions.Append(Deleted(first));
+  deletions.Append(Deleted(second));
+  ASSERT_TRUE(ApplyBookmarks(std::move(deletions)).success);
+  EXPECT_EQ(nullptr, Find(folder));
+  EXPECT_EQ(nullptr, Find(first));
+  EXPECT_EQ(nullptr, Find(second));
+}
+
+TEST_F(LocalSyncAdaptersTest, MalformedBatchIsRejectedBeforeAnyMutation) {
+  const auto id = Uuid();
+  base::ListValue batch;
+  batch.Append(Bookmark(id));
+  auto unsafe = Bookmark(Uuid());
+  unsafe.Set("url", "http://10.1.2.3/");
+  batch.Append(std::move(unsafe));
+  EXPECT_FALSE(ApplyBookmarks(std::move(batch)).success);
+  EXPECT_EQ(nullptr, Find(id));
+  EXPECT_FALSE(ApplyBookmarks(Batch(Deleted("root:toolbar"))).success);
+}
+
+TEST_F(LocalSyncAdaptersTest, HistoryOnlyNewOrdinaryEventsWithStablePerVisitUUIDs) {
+  const auto enable = time_ + base::Hours(1);
+  history_->AddPage(GURL("https://example.com/page"), time_, history::SOURCE_BROWSED);
+  history_->AddPage(GURL("https://example.com/page"), time_ + base::Hours(2), history::SOURCE_BROWSED);
+  history_->AddPage(GURL("https://example.com/page"), time_ + base::Hours(3), history::SOURCE_BROWSED);
+  history_->AddPage(GURL("https://example.com/imported"), time_ + base::Hours(4), history::SOURCE_EXTENSION);
+  history_->AddPage(GURL("http://192.168.1.1/"), time_ + base::Hours(4), history::SOURCE_BROWSED);
+  auto result = ReadHistory(enable);
+  ASSERT_TRUE(result.success);
+  ASSERT_EQ(2u, result.entries.size());
+  const auto first = *result.entries[0].GetDict().FindString("id");
+  const auto second = *result.entries[1].GetDict().FindString("id");
+  EXPECT_NE(first, second);
+  EXPECT_TRUE(internal::IsEventId(first));
+  EXPECT_EQ(result.entries, ReadHistory(enable).entries);
+  auto ack = result.entries.Clone();
+  for (auto& entry : ack) {
+    entry.GetDict().Set("revision", 4);
+  }
+  EXPECT_TRUE(ApplyHistory(std::move(ack)).success);
+  EXPECT_TRUE(ReadHistory(enable).entries.empty());
+  EXPECT_FALSE(ReadHistory(base::Time()).success);
+}
+
+TEST_F(LocalSyncAdaptersTest, HistoryRemoteImportIsIdempotentAndNeverEchoed) {
+  const auto id = Uuid();
+  const auto at = time_ + base::Hours(2);
+  auto entry = History(id, at);
+  ASSERT_TRUE(ApplyHistory(Batch(entry.Clone())).success);
+  ASSERT_TRUE(ApplyHistory(Batch(entry.Clone())).success);
+  auto visits = Visits();
+  ASSERT_TRUE(visits.success);
+  ASSERT_EQ(1u, visits.visits.size());
+  EXPECT_EQ(1, visits.visits[0].originator_visit_id);
+  EXPECT_FALSE(visits.visits[0].originator_cache_guid.empty());
+  EXPECT_TRUE(ReadHistory(time_).entries.empty());
+}
+
+TEST_F(LocalSyncAdaptersTest, HistoryTombstoneDeletesOnlyMappedEventAtSharedURL) {
+  const auto id = Uuid();
+  history_->AddPage(GURL("https://example.com/page"), time_, history::SOURCE_BROWSED);
+  history_->SetPageTitle(GURL("https://example.com/page"), u"Original local title");
+  ASSERT_TRUE(ApplyHistory(Batch(History(id, time_ + base::Hours(2)))).success);
+  auto visits = Visits();
+  ASSERT_EQ(2u, visits.visits.size());
+  EXPECT_EQ(u"Original local title", visits.row.title());
+  ASSERT_TRUE(ApplyHistory(Batch(Deleted(id))).success);
+  visits = Visits();
+  ASSERT_EQ(1u, visits.visits.size());
+  EXPECT_TRUE(visits.visits[0].originator_cache_guid.empty());
+  EXPECT_TRUE(ApplyHistory(Batch(Deleted(Uuid()))).success);
+  EXPECT_EQ(1u, Visits().visits.size());
+}
+
+TEST_F(LocalSyncAdaptersTest, ResetIsMetadataOnlyAndFailsClosedWhileHistoryBusy) {
+  const auto bookmark_id = Uuid();
+  ASSERT_TRUE(ApplyBookmarks(Batch(Bookmark(bookmark_id))).success);
+  ASSERT_TRUE(ApplyHistory(Batch(History(Uuid(), time_))).success);
+  base::test::TestFuture<Result> pending;
+  adapters_->ReadHistory(time_, pending.GetCallback());
+  EXPECT_FALSE(adapters_->ResetSyncState());
+  EXPECT_TRUE(pending.Get().success);
+  EXPECT_TRUE(adapters_->ResetSyncState());
+  EXPECT_NE(nullptr, Find(bookmark_id));
+  EXPECT_EQ(1u, Visits().visits.size());
+  EXPECT_EQ(1u, ReadBookmarks().entries.size());
+}
+
+TEST_F(LocalSyncAdaptersTest, ShutdownCancelsPostedCallbacksAndReportsUnavailable) {
+  bool called = false;
+  adapters_->ReadBookmarks(base::BindOnce([](bool* output, Result) { *output = true; }, &called));
+  adapters_->Shutdown();
+  environment_.RunUntilIdle();
+  EXPECT_FALSE(called);
+  EXPECT_FALSE(adapters_->IsAvailable(Stream::kBookmarks));
+  EXPECT_FALSE(adapters_->IsAvailable(Stream::kHistory));
+}
+
+}  // namespace
+}  // namespace browseros::sync

diff --git a/chrome/browser/browseros/sync/sync_protocol_unittest.cc b/chrome/browser/browseros/sync/sync_protocol_unittest.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/sync_protocol_unittest.cc
@@ -0,0 +1,210 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/sync_protocol.h"
+#include "chrome/browser/browseros/sync/adapters/sync_adapter_util.h"
+#include "base/uuid.h"
+#include "testing/gtest/include/gtest/gtest.h"
+namespace browseros::sync {
+namespace {
+base::DictValue Entry() {
+  base::DictValue value;
+  value.Set("id", "e141a7e7-08cb-4357-bbae-34a8094ae734");
+  value.Set("deleted", false); value.Set("revision", 1);
+  value.Set("title", "test"); value.Set("visitedAt", 1760000000000.0);
+  value.Set("url", "https://example.com/path?q=secret#token");
+  value.Set("prompt", "never leave the device");
+  return value;
+}
+TEST(RemocodeSyncProtocol, AdapterAcceptsLargeSnapshotAndRejectsLateMalformedEntry) {
+  base::ListValue snapshot;
+  for (int i = 0; i < 19166; ++i) {
+    base::DictValue tombstone;
+    tombstone.Set("id", base::Uuid::GenerateRandomV4().AsLowercaseString());
+    tombstone.Set("revision", 63); tombstone.Set("deleted", true);
+    snapshot.Append(std::move(tombstone));
+  }
+  auto normalized = internal::NormalizeBatch(snapshot, true);
+  ASSERT_TRUE(normalized); EXPECT_EQ(normalized->size(), 19166u);
+  snapshot.back().GetDict().Set("id", "invalid-late-id");
+  EXPECT_FALSE(internal::NormalizeBatch(snapshot, true));
+  EXPECT_FALSE(internal::NormalizeBatch(snapshot, false));
+}
+TEST(RemocodeSyncProtocol, AdapterRejectsSnapshotBeyondProtocolChunkBudget) {
+  base::ListValue snapshot;
+  for (size_t i = 0; i <= internal::kMaxBatchSize; ++i) snapshot.Append(base::Value());
+  EXPECT_FALSE(internal::NormalizeBatch(snapshot, true));
+  EXPECT_FALSE(internal::NormalizeBatch(snapshot, false));
+}
+TEST(RemocodeSyncProtocol, WhitelistAndSanitizeWithoutMutatingLocal) {
+  auto local = Entry();
+  auto out = NormalizeEntry("history", local, false);
+  ASSERT_TRUE(out);
+  EXPECT_EQ(*out->FindString("url"), "https://example.com/path");
+  EXPECT_FALSE(out->contains("prompt"));
+  EXPECT_EQ(*local.FindString("url"), "https://example.com/path?q=secret#token");
+  EXPECT_FALSE(NormalizeEntry("history", local, true));
+}
+TEST(RemocodeSyncProtocol, RejectsInternalAndPrivateNavigation) {
+  for (const auto* url : {"chrome://settings/", "file:///tmp/a", "javascript:1",
+                           "http://localhost/a", "http://192.168.1.2/a"}) {
+    auto value = Entry(); value.Set("url", url);
+    EXPECT_FALSE(NormalizeEntry("history", value, false));
+  }
+}
+TEST(RemocodeSyncProtocol, RejectsEncodedAndAmbiguousAuthenticationPaths) {
+  for (const auto* path : {"/%6Fauth/%63allback/CODE", "/%72eset-password/TOKEN",
+      "/%256Fauth/callback/CODE", "/o%61uth%2Fcallback/CODE",
+      "/safe%5Ccallback/CODE", "/auth%3Bsession=CODE", "/safe/%C0%AFoauth"}) {
+    auto value = Entry(); value.Set("url", std::string("https://example.com") + path);
+    value.Set("parentId", "root:toolbar"); value.Set("afterId", base::Value());
+    EXPECT_FALSE(NormalizeEntry("history", value, false)) << path;
+    EXPECT_FALSE(NormalizeEntry("bookmarks", value, false)) << path;
+  }
+  for (const auto* path : {"/%E4%B8%AD%E6%96%87", "/reports/annual%20report.pdf", "/discount/50%25"}) {
+    auto value = Entry(); value.Set("url", std::string("https://example.com") + path);
+    EXPECT_TRUE(NormalizeEntry("history", value, false)) << path;
+  }
+}
+TEST(RemocodeSyncProtocol, TombstoneIsExplicitAndMinimal) {
+  auto value = Entry(); value.Set("deleted", true);
+  auto out = NormalizeEntry("history", value, true);
+  ASSERT_TRUE(out); EXPECT_EQ(out->size(), 3u);
+  EXPECT_FALSE(out->contains("url"));
+}
+TEST(RemocodeSyncProtocol, RejectsFractionalOrNegativeRevision) {
+  auto value = Entry(); value.Set("revision", -1);
+  EXPECT_FALSE(NormalizeEntry("history", value, true));
+  value.Set("revision", 1.5);
+  EXPECT_FALSE(NormalizeEntry("history", value, true));
+}
+TEST(RemocodeSyncProtocol, BatchesRespectParentAndPredecessorDependencies) {
+  base::ListValue ops;
+  base::DictValue child; child.Set("id", "a"); child.Set("kind", "put");
+  child.Set("parentId", "z"); child.Set("afterId", base::Value()); ops.Append(std::move(child));
+  base::DictValue folder; folder.Set("id", "z"); folder.Set("kind", "put");
+  folder.Set("parentId", "root:toolbar"); folder.Set("afterId", base::Value()); ops.Append(std::move(folder));
+  auto first = OrderBookmarkOperations(ops, base::DictValue(), 1);
+  ASSERT_TRUE(first); ASSERT_EQ(first->size(), 1u);
+  EXPECT_EQ(*(*first)[0].GetDict().FindString("id"), "z");
+  auto all = OrderBookmarkOperations(ops, base::DictValue(), 100);
+  ASSERT_TRUE(all); ASSERT_EQ(all->size(), 2u);
+  EXPECT_EQ(*(*all)[1].GetDict().FindString("id"), "a");
+}
+TEST(RemocodeSyncProtocol, LocalEditsAndDeletesSurviveUnchangedRemoteBaseline) {
+  auto known = Entry();
+  auto local = known.Clone(); local.Set("title", "local edit");
+  EXPECT_TRUE(PreserveLocalChange(&local, &known, known));
+  local.Set("deleted", true);
+  EXPECT_TRUE(PreserveLocalChange(&local, &known, known));
+  auto remote = known.Clone(); remote.Set("title", "remote edit");
+  EXPECT_FALSE(PreserveLocalChange(&local, &known, remote));
+  EXPECT_FALSE(PreserveLocalChange(&known, &known, known));
+  EXPECT_FALSE(PreserveLocalChange(nullptr, &known, known));
+  EXPECT_FALSE(PreserveLocalChange(&local, nullptr, known));
+}
+TEST(RemocodeSyncProtocol, ThreeWayMergeAppliesRemoteEditsAndDeletesWithoutUndo) {
+  const auto baseline = Entry();
+  auto remote = baseline.Clone(); remote.Set("title", "remote edit");
+  EXPECT_FALSE(HasMergeConflict(&baseline, &baseline, remote));
+  auto local = baseline.Clone(); local.Set("title", "offline edit");
+  EXPECT_FALSE(HasMergeConflict(&local, &baseline, baseline));
+  EXPECT_TRUE(PreserveLocalChange(&local, &baseline, baseline));
+  EXPECT_TRUE(HasMergeConflict(&local, &baseline, remote));
+  remote.Set("deleted", true);
+  EXPECT_FALSE(HasMergeConflict(&baseline, &baseline, remote));
+  EXPECT_TRUE(HasMergeConflict(&local, &baseline, remote));
+  EXPECT_FALSE(HasMergeConflict(nullptr, &baseline, remote));
+  EXPECT_TRUE(HasMergeConflict(&local, nullptr, remote));
+}
+TEST(RemocodeSyncProtocol, TitlesUsePerStreamUTF8ByteBudgetsWithoutInboundTruncation) {
+  auto history = Entry(); history.Set("url", "https://example.com/path");
+  std::string chinese;
+  for (int i = 0; i < 342; ++i) chinese += "\xE4\xB8\xAD";
+  history.Set("title", chinese);
+  EXPECT_FALSE(NormalizeEntry("history", history, true));
+  auto bounded = NormalizeEntry("history", history, false);
+  ASSERT_TRUE(bounded);
+  EXPECT_EQ(bounded->FindString("title")->size(), 1023u);
+  history.Set("title", std::string(1023, 'a') + "\xF0\x9F\x98\x80");
+  bounded = NormalizeEntry("history", history, false);
+  ASSERT_TRUE(bounded);
+  EXPECT_EQ(*bounded->FindString("title"), std::string(1023, 'a'));
+  auto bookmark = history.Clone();
+  bookmark.Set("parentId", "root:toolbar"); bookmark.Set("afterId", base::Value());
+  bookmark.Set("title", std::string(2048, 'a'));
+  EXPECT_TRUE(NormalizeEntry("bookmarks", bookmark, true));
+  bookmark.Set("title", std::string(2049, 'a'));
+  EXPECT_FALSE(NormalizeEntry("bookmarks", bookmark, true));
+  bounded = NormalizeEntry("bookmarks", bookmark, false);
+  ASSERT_TRUE(bounded); EXPECT_EQ(bounded->FindString("title")->size(), 2048u);
+}
+TEST(RemocodeSyncProtocol, CannotDeleteFolderWithUnrelatedLiveRemoteChild) {
+  base::DictValue known;
+  base::DictValue child; child.Set("id", "child"); child.Set("parentId", "folder");
+  child.Set("deleted", false); known.Set("child", std::move(child));
+  base::ListValue ops;
+  base::DictValue folder; folder.Set("id", "folder"); folder.Set("kind", "delete"); ops.Append(std::move(folder));
+  EXPECT_FALSE(OrderBookmarkOperations(ops, known, 100));
+}
+}  // namespace
+TEST(RemocodeSyncProtocol, FullSnapshotRejectsMissingParentsAndOrderingCycles) {
+  base::DictValue all;
+  auto folder = Entry(); folder.Set("id", "folder"); folder.Set("url", base::Value());
+  folder.Set("parentId", "root:toolbar"); folder.Set("afterId", base::Value());
+  all.Set("folder", folder.Clone());
+  auto child = folder.Clone(); child.Set("id", "child"); child.Set("parentId", "folder");
+  all.Set("child", child.Clone()); EXPECT_TRUE(ValidateBookmarkSnapshot(all));
+  all.FindDict("folder")->Set("deleted", true); EXPECT_FALSE(ValidateBookmarkSnapshot(all));
+  all.FindDict("folder")->Set("deleted", false);
+  all.FindDict("folder")->Set("parentId", "child"); EXPECT_FALSE(ValidateBookmarkSnapshot(all));
+  all.FindDict("folder")->Set("parentId", "root:toolbar");
+  all.FindDict("child")->Set("parentId", "root:toolbar");
+  all.FindDict("folder")->Set("afterId", "child");
+  all.FindDict("child")->Set("afterId", "folder"); EXPECT_FALSE(ValidateBookmarkSnapshot(all));
+}
+namespace {
+base::DictValue UploadScope() {
+  base::DictValue s; s.Set("spaceId", "10000000-0000-4000-8000-000000000001");
+  s.Set("enrollmentId", "20000000-0000-4000-8000-000000000001"); s.Set("generation", 1); return s;
+}
+base::DictValue UploadPending() {
+  auto s = UploadScope(); s.Set("protocolVersion", 2); s.Set("stream", "bookmarks");
+  s.Set("uploadId", "30000000-0000-4000-8000-000000000001");
+  s.Set("stage", "begin"); s.Set("baseRevision", 62); s.Set("deviceSequence", 63);
+  s.Set("createdAt", 1793630000123.0); s.Set("nextChunk", 0);
+  auto entry = Entry(); entry.Set("url", "https://example.com/path"); entry.Set("parentId", "root:toolbar"); entry.Set("afterId", base::Value()); entry.Remove("visitedAt"); entry.Remove("prompt");
+  base::ListValue rows; rows.Append(std::move(entry)); base::ListValue chunks; chunks.Append(std::move(rows)); s.Set("chunks", std::move(chunks)); return s;
+}
+}
+TEST(RemocodeSyncProtocol, UploadBeginRejectsFractionalTimestampWithoutCrashing) {
+  auto pending = UploadPending(); pending.Set("createdAt", 1793630000123.456);
+  EXPECT_FALSE(SnapshotUploadRequest(UploadScope(), pending));
+  EXPECT_TRUE(RepairPreviewUploadTimestamp(pending, 1793630002000.0));
+  auto request = SnapshotUploadRequest(UploadScope(), pending); ASSERT_TRUE(request);
+  EXPECT_EQ(WireNumber(*request, "createdAt"), 1793630002000.0);
+  EXPECT_EQ(pending.FindList("chunks")->size(), 1u);
+}
+TEST(RemocodeSyncProtocol, UploadRequestsKeepCredentialsOutAndRejectMissingState) {
+  auto pending = UploadPending(); auto request = SnapshotUploadRequest(UploadScope(), pending); ASSERT_TRUE(request);
+  EXPECT_FALSE(request->contains("chunks")); EXPECT_FALSE(request->contains("syncSession"));
+  pending.Remove("deviceSequence"); EXPECT_FALSE(SnapshotUploadRequest(UploadScope(), pending));
+  pending = UploadPending(); pending.Set("stage", "unknown"); EXPECT_FALSE(SnapshotUploadRequest(UploadScope(), pending));
+}
+TEST(RemocodeSyncProtocol, UploadChunkBoundsCannotIndexEmptyOrMissingRows) {
+  auto pending = UploadPending(); pending.Set("stage", "chunk");
+  auto request = SnapshotUploadRequest(UploadScope(), pending); ASSERT_TRUE(request);
+  EXPECT_EQ(*request->FindString("lowerBound"), ""); EXPECT_EQ(*request->FindString("upperBound"), "~");
+  pending.Set("nextChunk", 1); EXPECT_FALSE(SnapshotUploadRequest(UploadScope(), pending));
+  pending.Set("nextChunk", 0); pending.FindList("chunks")->front() = base::Value(base::ListValue());
+  EXPECT_FALSE(SnapshotUploadRequest(UploadScope(), pending));
+}
+TEST(RemocodeSyncProtocol, UploadScopeNeverCrossesEnrollmentOrAccountSpace) {
+  auto pending = UploadPending(); auto registration = UploadScope(); registration.Set("generation", 2);
+  EXPECT_FALSE(SnapshotUploadRequest(registration, pending));
+  registration = UploadScope(); registration.Set("spaceId", "40000000-0000-4000-8000-000000000001");
+  EXPECT_FALSE(SnapshotUploadRequest(registration, pending));
+  pending.Set("stage", "commit"); EXPECT_TRUE(SnapshotUploadRequest(UploadScope(), pending));
+  pending.Set("stage", "chunk"); pending.Set("createdAt", 1793630000123.456);
+  EXPECT_FALSE(RepairPreviewUploadTimestamp(pending, 1793630002000.0));
+}
+}  // namespace browseros::sync

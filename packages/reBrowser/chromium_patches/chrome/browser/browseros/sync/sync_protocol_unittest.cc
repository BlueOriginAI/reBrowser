diff --git a/chrome/browser/browseros/sync/sync_protocol_unittest.cc b/chrome/browser/browseros/sync/sync_protocol_unittest.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/sync_protocol_unittest.cc
@@ -0,0 +1,114 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/sync_protocol.h"
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
+}  // namespace browseros::sync

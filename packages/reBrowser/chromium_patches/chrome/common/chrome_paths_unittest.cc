diff --git a/chrome/common/chrome_paths_unittest.cc b/chrome/common/chrome_paths_unittest.cc
--- a/chrome/common/chrome_paths_unittest.cc
+++ b/chrome/common/chrome_paths_unittest.cc
@@ -13,6 +13,10 @@
 #include "chrome/common/chrome_constants.h"
 #include "chrome/common/chrome_paths_internal.h"
 #include "testing/gtest/include/gtest/gtest.h"
+
+#if BUILDFLAG(IS_MAC)
+#include "chrome/browser/browseros/buildflags.h"
+#endif
 
 namespace chrome {
 
@@ -67,6 +71,104 @@
 #endif
 }
 
+#if BUILDFLAG(IS_MAC)
+class ChromeCachePathsTest : public testing::Test {
+ protected:
+  void SetUp() override {
+    ASSERT_TRUE(base::PathService::Get(base::DIR_APP_DATA, &app_data_dir_));
+    ASSERT_TRUE(base::PathService::Get(base::DIR_CACHE, &cache_dir_));
+    ASSERT_TRUE(GetDefaultUserDataDirectory(&default_data_dir_));
+    SetUsingDefaultUserDataDirectoryForTesting(true);
+  }
+
+  void TearDown() override {
+    SetUsingDefaultUserDataDirectoryForTesting(std::nullopt);
+  }
+
+  base::FilePath DefaultCacheRoot() const {
+#if BUILDFLAG(BROWSEROS_PRODUCT_BROWSERCLAW)
+    return cache_dir_.Append("reBrowser");
+#else
+    return OriginalCachePath(default_data_dir_);
+#endif
+  }
+
+  base::FilePath OriginalCachePath(const base::FilePath& profile) const {
+    base::FilePath result = cache_dir_;
+    if (!app_data_dir_.AppendRelativePath(profile, &result))
+      return profile;
+    return result;
+  }
+
+  base::FilePath app_data_dir_;
+  base::FilePath cache_dir_;
+  base::FilePath default_data_dir_;
+};
+
+TEST_F(ChromeCachePathsTest, DefaultRoot) {
+  base::FilePath result;
+  GetUserCacheDirectory(default_data_dir_, &result);
+  EXPECT_EQ(DefaultCacheRoot(), result);
+}
+
+TEST_F(ChromeCachePathsTest, ProfileSuffixes) {
+  for (const char* suffix : {"Default", "Profile 2", "Profile 2/Nested"}) {
+    SCOPED_TRACE(suffix);
+    base::FilePath result;
+    GetUserCacheDirectory(default_data_dir_.Append(suffix), &result);
+    EXPECT_EQ(DefaultCacheRoot().Append(suffix), result);
+  }
+}
+
+TEST_F(ChromeCachePathsTest, SimilarPrefix) {
+  const base::FilePath profile =
+      base::FilePath(default_data_dir_.value() + "Backup").Append("Default");
+  base::FilePath result;
+  GetUserCacheDirectory(profile, &result);
+  EXPECT_EQ(OriginalCachePath(profile), result);
+}
+
+TEST_F(ChromeCachePathsTest, OtherApplicationSupportRoot) {
+  const base::FilePath profile = app_data_dir_.Append("OtherRoot/Default");
+  base::FilePath result;
+  GetUserCacheDirectory(profile, &result);
+  EXPECT_EQ(OriginalCachePath(profile), result);
+}
+
+TEST_F(ChromeCachePathsTest, CustomDataDirectoryWithinDefaultRoot) {
+  SetUsingDefaultUserDataDirectoryForTesting(false);
+  const base::FilePath profile = default_data_dir_.Append("CustomRoot/Default");
+  base::FilePath result;
+  GetUserCacheDirectory(profile, &result);
+  EXPECT_EQ(OriginalCachePath(profile), result);
+}
+
+TEST_F(ChromeCachePathsTest, NonDefaultDataDirectory) {
+  SetUsingDefaultUserDataDirectoryForTesting(false);
+  base::FilePath result;
+  GetUserCacheDirectory(default_data_dir_, &result);
+  EXPECT_EQ(OriginalCachePath(default_data_dir_), result);
+  GetUserCacheDirectory(default_data_dir_.Append("Default"), &result);
+  EXPECT_EQ(OriginalCachePath(default_data_dir_.Append("Default")), result);
+}
+
+TEST_F(ChromeCachePathsTest, ExternalCustomDataDirectory) {
+  SetUsingDefaultUserDataDirectoryForTesting(false);
+  const base::FilePath profile("/some/other/path/Default");
+  base::FilePath result;
+  GetUserCacheDirectory(profile, &result);
+  EXPECT_EQ(profile, result);
+}
+
+TEST_F(ChromeCachePathsTest, DefaultUserDataDirectoryUnchanged) {
+  base::FilePath result;
+  GetUserCacheDirectory(default_data_dir_.Append("Default"), &result);
+  base::FilePath data_dir_after;
+  ASSERT_TRUE(GetDefaultUserDataDirectory(&data_dir_after));
+  EXPECT_EQ(default_data_dir_, data_dir_after);
+}
+#endif  // BUILDFLAG(IS_MAC)
+
 // Chrome OS doesn't use any of the desktop linux configuration.
 #if BUILDFLAG(IS_LINUX)
 TEST(ChromePaths, DefaultUserDataDir) {

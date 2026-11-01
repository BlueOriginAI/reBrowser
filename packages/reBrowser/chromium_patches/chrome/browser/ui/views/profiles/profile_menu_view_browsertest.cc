diff --git a/chrome/browser/ui/views/profiles/profile_menu_view_browsertest.cc b/chrome/browser/ui/views/profiles/profile_menu_view_browsertest.cc
--- a/chrome/browser/ui/views/profiles/profile_menu_view_browsertest.cc
+++ b/chrome/browser/ui/views/profiles/profile_menu_view_browsertest.cc
@@ -31,6 +31,8 @@
 #include "build/build_config.h"
 #include "chrome/browser/bookmarks/bookmark_model_factory.h"
 #include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
 #include "chrome/browser/enterprise/browser_management/management_service_factory.h"
 #include "chrome/browser/enterprise/util/managed_browser_utils.h"
 #include "chrome/browser/extensions/extension_browsertest.h"
@@ -91,6 +93,7 @@
 #include "chrome/common/chrome_switches.h"
 #include "chrome/common/pref_names.h"
 #include "chrome/common/webui_url_constants.h"
+#include "chrome/grit/generated_resources.h"
 #include "chrome/test/base/in_process_browser_test.h"
 #include "chrome/test/base/ui_test_utils.h"
 #include "chrome/test/user_education/interactive_feature_promo_test.h"
@@ -136,9 +139,12 @@
 #include "services/network/test/test_url_loader_factory.h"
 #include "testing/gmock/include/gmock/gmock.h"
 #include "testing/gtest/include/gtest/gtest.h"
+#include "ui/base/l10n/l10n_util.h"
 #include "ui/events/event_utils.h"
 #include "ui/views/accessibility/view_accessibility.h"
 #include "ui/views/controls/button/label_button.h"
+#include "ui/views/controls/button/md_text_button.h"
+#include "ui/views/controls/label.h"
 #include "ui/views/controls/webview/webview.h"
 #include "ui/views/test/widget_activation_waiter.h"
 #include "ui/views/test/widget_test.h"
@@ -318,6 +324,158 @@
       syncer::kReplaceSyncPromosWithSignInPromos};
 };
 
+// Exercise native account snapshots without a second identity implementation or
+// network/OAuth traffic. Actions/observation still use the profile's real service.
+class ProfileMenuViewRemocodeTest : public ProfileMenuViewBrowserTest {
+ protected:
+  ProfileMenuView* menu() {
+    return static_cast<ProfileMenuView*>(profile_menu_view());
+  }
+
+  void SetAccountState(const char* state,
+                       bool busy = false,
+                       const char* message = "") {
+    base::DictValue snapshot;
+    snapshot.Set("state", state);
+    snapshot.Set("busy", busy);
+    snapshot.Set("message", message);
+    snapshot.Set("displayName", "Remocode Test");
+    snapshot.Set("email", "remocode@example.test");
+    menu()->UpdateRemocodeAccountIdentity(snapshot);
+  }
+
+  void LogoutFromMenu() {
+    menu()->OnRemocodeAccountAction(ProfileMenuView::RemocodeAction::kLogout);
+  }
+
+  base::WeakPtr<ProfileMenuView> MenuWeakPtr() {
+    return menu()->remocode_weak_factory_.GetWeakPtr();
+  }
+
+  size_t CountLabel(views::View* root, std::u16string_view text) {
+    size_t count = 0;
+    if (auto* label = views::AsViewClass<views::Label>(root)) {
+      count += label->GetText() == text;
+    }
+    for (views::View* child : root->children()) {
+      count += CountLabel(child, text);
+    }
+    return count;
+  }
+
+  size_t CountLabel(int message_id) {
+    return CountLabel(menu(), l10n_util::GetStringUTF16(message_id));
+  }
+};
+
+IN_PROC_BROWSER_TEST_F(ProfileMenuViewRemocodeTest,
+                       RepeatedSnapshotsReplaceOnlyIdentity) {
+  ASSERT_NO_FATAL_FAILURE(OpenProfileMenu());
+  SetAccountState("signedOut");
+  const size_t top_level_children = menu()->children().size();
+  for (int i = 0; i < 5; ++i) {
+    SetAccountState("signedIn");
+    ASSERT_TRUE(menu()->GetIdentityButtonForTesting());
+    EXPECT_EQ(menu()->GetIdentityButtonForTesting()->GetText(),
+              l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT));
+    EXPECT_EQ(CountLabel(menu(), u"Remocode Test"), 1u);
+    EXPECT_EQ(CountLabel(menu(), u"remocode@example.test"), 1u);
+    EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_MANAGE), 1u);
+    SetAccountState("signedOut");
+    EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_MANAGE), 0u);
+    EXPECT_EQ(menu()->children().size(), top_level_children);
+    EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_SYNC_TITLE), 1u);
+    EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_LOCAL_PROFILES), 1u);
+    EXPECT_EQ(CountLabel(IDS_SETTINGS_MANAGE_GOOGLE_ACCOUNT), 0u);
+  }
+}
+
+IN_PROC_BROWSER_TEST_F(ProfileMenuViewRemocodeTest,
+                       LoadingClearsOldButtonAndAuthorizationCanCancel) {
+  ASSERT_NO_FATAL_FAILURE(OpenProfileMenu());
+  SetAccountState("signedOut");
+  ASSERT_TRUE(menu()->GetIdentityButtonForTesting());
+  SetAccountState("signedOut", true);
+  EXPECT_EQ(menu()->GetIdentityButtonForTesting(), nullptr);
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_LOADING), 1u);
+  SetAccountState("authorizing", true);
+  ASSERT_TRUE(menu()->GetIdentityButtonForTesting());
+  EXPECT_EQ(menu()->GetIdentityButtonForTesting()->GetText(),
+            l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_CANCEL));
+  SetAccountState("error", false, "storageUnavailable");
+  ASSERT_TRUE(menu()->GetIdentityButtonForTesting());
+  EXPECT_EQ(menu()->GetIdentityButtonForTesting()->GetText(),
+            l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_RETRY));
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_STORAGE_UNAVAILABLE), 1u);
+  SetAccountState("error", false, "timeout");
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_TIMEOUT), 1u);
+  SetAccountState("reauthRequired");
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_SESSION_EXPIRED), 1u);
+  SetAccountState("signedOut", false, "logoutFailed");
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT_UNCONFIRMED), 1u);
+}
+
+IN_PROC_BROWSER_TEST_F(ProfileMenuViewRemocodeTest,
+                       NativeServiceNotificationReplacesIdentity) {
+  auto* service = remocode::AccountServiceFactory::GetForProfile(
+      browser()->profile());
+  ASSERT_TRUE(service);
+  ASSERT_TRUE(base::test::RunUntil([&] {
+    return !service->GetState().FindBool("busy").value_or(true);
+  }));
+  ASSERT_NO_FATAL_FAILURE(OpenProfileMenu());
+  SetAccountState("signedIn");
+  service->Logout();
+  ASSERT_TRUE(base::test::RunUntil([&] {
+    auto* button = menu()->GetIdentityButtonForTesting();
+    return button && button->GetText() ==
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_LOGIN);
+  }));
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_SYNC_TITLE), 1u);
+  EXPECT_EQ(CountLabel(IDS_SETTINGS_REMOCODE_ACCOUNT_MANAGE), 0u);
+}
+
+IN_PROC_BROWSER_TEST_F(ProfileMenuViewRemocodeTest,
+                       ManageAccountOpensRemocodePeopleSettings) {
+  ASSERT_NO_FATAL_FAILURE(OpenProfileMenu());
+  SetAccountState("signedIn");
+
+  menu()->OnRemocodeAccountAction(ProfileMenuView::RemocodeAction::kManage);
+
+  ASSERT_TRUE(base::test::RunUntil([&] {
+    const GURL& url = browser()
+                          ->tab_strip_model()
+                          ->GetActiveWebContents()
+                          ->GetVisibleURL();
+    return url == chrome::GetSettingsUrl(chrome::kPeopleSubPage);
+  }));
+}
+
+IN_PROC_BROWSER_TEST_F(ProfileMenuViewRemocodeTest,
+                       LogoutClosesPopupBeforeNotifyingObservers) {
+  auto* service = remocode::AccountServiceFactory::GetForProfile(
+      browser()->profile());
+  ASSERT_TRUE(service);
+  ASSERT_TRUE(base::test::RunUntil([&] {
+    return !service->GetState().FindBool("busy").value_or(true);
+  }));
+  ASSERT_NO_FATAL_FAILURE(OpenProfileMenu());
+  SetAccountState("signedIn");
+  auto widget = menu()->GetWidget()->GetWeakPtr();
+  auto weak_menu = MenuWeakPtr();
+  bool notified = false;
+  auto subscription = service->Observe(base::BindLambdaForTesting([&] {
+    notified = true;
+    EXPECT_TRUE(!widget || widget->IsClosed());
+    EXPECT_FALSE(weak_menu);
+  }));
+  LogoutFromMenu();
+  EXPECT_TRUE(notified);
+  base::RunLoop().RunUntilIdle();
+  service->Logout();  // No stale menu observer may run after destruction.
+  base::RunLoop().RunUntilIdle();
+}
+
 IN_PROC_BROWSER_TEST_F(ProfileMenuViewBrowserTest,
                        ProfileMenuDoesNotOutliveBrowser) {
   // Observer that asserts the profile menu widget does not outlive the host

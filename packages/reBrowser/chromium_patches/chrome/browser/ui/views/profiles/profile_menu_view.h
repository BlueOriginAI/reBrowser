diff --git a/chrome/browser/ui/views/profiles/profile_menu_view.h b/chrome/browser/ui/views/profiles/profile_menu_view.h
--- a/chrome/browser/ui/views/profiles/profile_menu_view.h
+++ b/chrome/browser/ui/views/profiles/profile_menu_view.h
@@ -11,7 +11,10 @@
 #include <string>
 #include <vector>
 
+#include "base/callback_list.h"
 #include "base/functional/callback_forward.h"
+#include "base/memory/weak_ptr.h"
+#include "base/values.h"
 #include "build/build_config.h"
 #include "chrome/browser/password_manager/web_app_profile_switcher.h"
 #include "chrome/browser/profiles/avatar_menu.h"
@@ -64,6 +67,7 @@
   }
 
  private:
+  friend class ProfileMenuViewRemocodeTest;
   friend class ProfileMenuViewExtensionsTest;
   friend class ProfileMenuViewSigninPendingTest;
   friend class ProfileMenuViewSignoutTest;
@@ -114,7 +118,10 @@
   bool skip_window_active_check_for_testing_ = false;
 
   // Helper methods for building the menu.
-  void SetMenuTitleForAccessibility();
+  enum class RemocodeAction { kLogin, kCancel, kLogout, kManage, kRetry };
+  void OnRemocodeAccountAction(RemocodeAction action);
+  void OnRemocodeAccountChanged();
+  void UpdateRemocodeAccountIdentity(const base::DictValue& state);
   void BuildGuestIdentity();
   void MaybeBuildBatchUploadButton();
   void BuildAutofillSettingsButton();
@@ -129,8 +136,6 @@
 #endif  // BUILDFLAG(ENABLE_DICE_SUPPORT)
   void MaybeBuildSignoutButton();
   void BuildFeatureButtons();
-  IdentitySectionParams GetIdentitySectionParams(
-      const ProfileAttributesEntry& entry);
   void BuildIdentityWithCallToAction();
 
   // Gets the profiles to be displayed in the "Other profiles" section. Does not
@@ -153,6 +158,9 @@
   // A profile switcher object needed if the user triggers opening other
   // profile in a web app.
   std::optional<WebAppProfileSwitcher> app_profile_switcher_;
+
+  base::CallbackListSubscription remocode_account_subscription_;
+  base::WeakPtrFactory<ProfileMenuView> remocode_weak_factory_{this};
 };
 
 #endif  // CHROME_BROWSER_UI_VIEWS_PROFILES_PROFILE_MENU_VIEW_H_

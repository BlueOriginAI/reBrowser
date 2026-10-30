diff --git a/chrome/browser/ui/views/profiles/avatar_toolbar_button.cc b/chrome/browser/ui/views/profiles/avatar_toolbar_button.cc
--- a/chrome/browser/ui/views/profiles/avatar_toolbar_button.cc
+++ b/chrome/browser/ui/views/profiles/avatar_toolbar_button.cc
@@ -4,6 +4,7 @@
 
 #include "chrome/browser/ui/views/profiles/avatar_toolbar_button.h"
 
+#include <utility>
 #include <vector>
 
 #include "base/auto_reset.h"
@@ -20,6 +21,8 @@
 #include "base/time/time.h"
 #include "chrome/app/chrome_command_ids.h"
 #include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
 #include "chrome/browser/profiles/avatar_menu.h"
 #include "chrome/browser/profiles/profile.h"
 #include "chrome/browser/profiles/profile_attributes_entry.h"
@@ -51,6 +54,8 @@
 #include "chrome/browser/user_education/user_education_service_factory.h"
 #include "chrome/browser/webauthn/passkey_unlock_manager.h"
 #include "chrome/browser/webauthn/passkey_unlock_manager_factory.h"
+#include "chrome/grit/generated_resources.h"
+#include "ui/strings/grit/ui_strings.h"
 #include "components/feature_engagement/public/feature_constants.h"
 #include "components/feature_engagement/public/tracker.h"
 #include "components/password_manager/content/common/web_ui_constants.h"
@@ -60,6 +65,7 @@
 #include "components/signin/public/identity_manager/tribool.h"
 #include "components/sync/base/features.h"
 #include "components/user_education/common/user_education_class_properties.h"
+#include "components/vector_icons/vector_icons.h"
 #include "content/public/common/url_utils.h"
 #include "google_apis/gaia/gaia_id.h"
 #include "third_party/skia/include/core/SkColor.h"
@@ -101,6 +107,13 @@
       state_manager_(*this, browser_view->browser()),
       slide_animation_(this) {
   state_manager_.InitializeStates();
+  if (UsesRemocodeAccount()) {
+    if (auto* service = remocode::AccountServiceFactory::GetForProfile(
+            state_manager_.browser()->profile())) {
+      remocode_account_subscription_ = service->Observe(base::BindRepeating(
+          &AvatarToolbarButton::UpdateText, weak_ptr_factory_.GetWeakPtr()));
+    }
+  }
 #if BUILDFLAG(IS_CHROMEOS)
   // On CrOS this button should only show as badging for Incognito, Guest and
   // captivie portal signin. It's only enabled for non captive portal Incognito
@@ -155,9 +168,15 @@
   const ui::ColorProvider* const color_provider = GetColorProvider();
   CHECK(color_provider);
   StateProvider* state_provider = state_manager_.GetActiveStateProvider();
-  auto [icon, icon_type] = state_provider->GetAvatarIcon(
-      icon_size, GetForegroundColor(ButtonState::STATE_NORMAL),
-      *color_provider);
+  auto [icon, icon_type] = UsesRemocodeAccount()
+      ? std::make_pair(ui::ImageModel::FromVectorIcon(
+                           vector_icons::kAccountCircleIcon,
+                           GetForegroundColor(ButtonState::STATE_NORMAL),
+                           icon_size),
+                       AvatarIconType::kPlaceholder)
+      : state_provider->GetAvatarIcon(
+            icon_size, GetForegroundColor(ButtonState::STATE_NORMAL),
+            *color_provider);
 
   SetImageModel(ButtonState::STATE_NORMAL, icon);
   SetImageModel(ButtonState::STATE_DISABLED,
@@ -296,9 +315,18 @@
   const auto* const color_provider = GetColorProvider();
   CHECK(color_provider);
 
-  AnimateTextChange(state_provider, color_provider);
-
-  SetTooltipText(state_provider->GetAvatarTooltipText());
+  if (UsesRemocodeAccount()) {
+    // Google sync/error/promo chips must not present themselves as the primary
+    // Remocode account. Guest and Incognito retain their existing appearances.
+    slide_animation_.Reset();
+    SetHighlight(std::u16string(), std::nullopt);
+  } else {
+    AnimateTextChange(state_provider, color_provider);
+  }
+
+  SetTooltipText(UsesRemocodeAccount()
+                     ? GetRemocodeAccountLabel()
+                     : state_provider->GetAvatarTooltipText());
   UpdateAccessibilityLabel();
   // Update the layout insets after `SetHighlight()` since
   // text might be updated by setting the highlight.
@@ -336,7 +364,52 @@
   GetViewAccessibility().AnnounceAlert(std::move(text));
 }
 
+bool AvatarToolbarButton::UsesRemocodeAccount() const {
+  const Browser* host = state_manager_.browser();
+  return host && !host->profile()->IsOffTheRecord() &&
+         !host->profile()->IsGuestSession();
+}
+
+std::u16string AvatarToolbarButton::GetRemocodeAccountLabel() const {
+  std::u16string label =
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_TITLE);
+  auto* service = remocode::AccountServiceFactory::GetForProfile(
+      state_manager_.browser()->profile());
+  if (!service) {
+    return label;
+  }
+  const base::DictValue snapshot = service->GetState();
+  const std::string* state = snapshot.FindString("state");
+  int status_id = IDS_SETTINGS_REMOCODE_ACCOUNT_SIGNED_OUT;
+  if (state && *state == "signedIn") {
+    for (const char* key : {"displayName", "email"}) {
+      const std::string* value = snapshot.FindString(key);
+      if (value && !value->empty()) {
+        label = l10n_util::GetStringFUTF16(
+            IDS_CONCAT_TWO_STRINGS_WITH_COMMA, label, base::UTF8ToUTF16(*value));
+      }
+    }
+    return label;
+  }
+  if (state && *state == "authorizing") {
+    status_id = IDS_SETTINGS_REMOCODE_ACCOUNT_AUTHORIZING;
+  } else if (snapshot.FindBool("busy").value_or(false)) {
+    status_id = IDS_SETTINGS_REMOCODE_ACCOUNT_LOADING;
+  } else if (state && *state == "reauthRequired") {
+    status_id = IDS_SETTINGS_REMOCODE_ACCOUNT_REAUTH_REQUIRED;
+  } else if (state && *state == "error") {
+    status_id = IDS_SETTINGS_REMOCODE_ACCOUNT_ERROR;
+  }
+  return l10n_util::GetStringFUTF16(IDS_CONCAT_TWO_STRINGS_WITH_COMMA, label,
+                                   l10n_util::GetStringUTF16(status_id));
+}
+
 void AvatarToolbarButton::UpdateAccessibilityLabel() {
+  if (UsesRemocodeAccount()) {
+    GetViewAccessibility().SetName(GetRemocodeAccountLabel());
+    GetViewAccessibility().SetDescription(std::u16string());
+    return;
+  }
   auto [name, description] = state_manager_.GetAccessibilityLabels(GetText());
 
   GetViewAccessibility().SetName(name);
@@ -503,6 +576,15 @@
 }
 
 void AvatarToolbarButton::ButtonPressed(bool is_source_accelerator) {
+  if (UsesRemocodeAccount()) {
+    state_manager_.NotifyButtonPressed();
+    if (auto* coordinator = state_manager_.browser()
+                                ->GetFeatures()
+                                .profile_menu_coordinator()) {
+      coordinator->Show(is_source_accelerator);
+    }
+    return;
+  }
   state_manager_.HandleButtonPressed(is_source_accelerator);
 }
 

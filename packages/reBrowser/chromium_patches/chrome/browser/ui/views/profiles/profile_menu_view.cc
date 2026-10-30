diff --git a/chrome/browser/ui/views/profiles/profile_menu_view.cc b/chrome/browser/ui/views/profiles/profile_menu_view.cc
--- a/chrome/browser/ui/views/profiles/profile_menu_view.cc
+++ b/chrome/browser/ui/views/profiles/profile_menu_view.cc
@@ -17,11 +17,14 @@
 #include "base/metrics/user_metrics.h"
 #include "base/notreached.h"
 #include "base/strings/utf_string_conversions.h"
+#include "base/task/bind_post_task.h"
 #include "build/branding_buildflags.h"
 #include "build/build_config.h"
 #include "chrome/app/chrome_command_ids.h"
 #include "chrome/app/vector_icons/vector_icons.h"
 #include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
 #include "chrome/browser/enterprise/browser_management/browser_management_service.h"
 #include "chrome/browser/enterprise/browser_management/management_service_factory.h"
 #include "chrome/browser/enterprise/util/managed_browser_utils.h"
@@ -130,38 +133,15 @@
 
 namespace {
 
-std::u16string GetSyncErrorButtonText(
-    Profile* profile,
-    syncer::SyncService::UserActionableError error) {
-  if (error == syncer::SyncService::UserActionableError::kUnrecoverableError &&
-      !ChromeSigninClientFactory::GetForProfile(profile)
-           ->IsClearPrimaryAccountAllowed()) {
-    // Only shown for "Sync-the-feature".
-    return l10n_util::GetStringUTF16(
-        IDS_SYNC_ERROR_USER_MENU_SIGNOUT_BUTTON_MAYBE_TITLE_CASE);
-  }
-
-  if (error == syncer::SyncService::UserActionableError::kSignInNeedsUpdate &&
-      IdentityManagerFactory::GetForProfile(profile)->HasPrimaryAccount(
-          signin::ConsentLevel::kSync)) {
-    // Only shown for "Sync-the-feature".
-    return l10n_util::GetStringUTF16(IDS_SYNC_RELOGIN_BUTTON_MAYBE_TITLE_CASE);
-  }
-
-  return l10n_util::GetStringUTF16(
-      GetSyncErrorButtonStringId(error, /*support_title_case=*/true));
-}
-
-std::u16string GetProfileIdentifier(const ProfileAttributesEntry& entry) {
-  switch (entry.GetNameForm()) {
-    case NameForm::kGaiaName:
-    case NameForm::kLocalName:
-      return entry.GetName();
-    case NameForm::kGaiaAndLocalName:
-      return l10n_util::GetStringFUTF16(
-          IDS_PROFILE_MENU_PROFILE_IDENTIFIER_WITH_SEPARATOR,
-          entry.GetGAIANameToDisplay(), entry.GetLocalProfileName());
-  }
+// The authorization URL is supplied only by AccountService. The callback can
+// outlive the popup, but never retains the popup (or a raw Browser/Profile).
+void OpenRemocodeURL(base::WeakPtr<Browser> browser, const GURL& url) {
+  if (!browser) {
+    return;
+  }
+  NavigateParams params(browser.get(), url, ui::PAGE_TRANSITION_LINK);
+  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
+  Navigate(&params);
 }
 
 }  // namespace
@@ -191,6 +171,8 @@
 ProfileMenuView::~ProfileMenuView() = default;
 
 void ProfileMenuView::OnClose() {
+  remocode_account_subscription_ = {};
+  remocode_weak_factory_.InvalidateWeakPtrs();
   bool is_browser_window_active =
       skip_window_active_check_for_testing_ ||
       (browser().GetWindow() && browser().GetWindow()->IsActive());
@@ -212,7 +194,15 @@
   }
 
   CHECK(!profile().IsOffTheRecord());
-  SetMenuTitleForAccessibility();
+  if (auto* service =
+          remocode::AccountServiceFactory::GetForProfile(&profile())) {
+    // Posting avoids deleting the clicked identity button inside a synchronous
+    // service notification. Only the identity container is ever rebuilt.
+    remocode_account_subscription_ = service->Observe(
+        base::BindPostTaskToCurrentDefault(base::BindRepeating(
+            &ProfileMenuView::OnRemocodeAccountChanged,
+            remocode_weak_factory_.GetWeakPtr())));
+  }
   BuildIdentityWithCallToAction();
 
   const bool is_web_app = web_app::AppBrowserController::IsWebApp(&browser());
@@ -231,10 +221,8 @@
   std::vector<ProfileAttributesEntry*> available_profiles;
   GetProfilesForOtherProfilesSection(available_profiles);
 
-  if (!available_profiles.empty()) {
-    SetProfileManagementHeading(
-        l10n_util::GetStringUTF16(IDS_PROFILE_MENU_PROFILES_LIST_TITLE));
-  }
+  SetProfileManagementHeading(
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_LOCAL_PROFILES));
   BuildOtherProfilesSection(available_profiles);
   base::UmaHistogramBoolean("ProfileChooser.HasProfilesShown",
                             !available_profiles.empty());
@@ -301,7 +289,7 @@
 }
 
 void ProfileMenuView::OnSyncSettingsButtonClicked() {
-  OnActionableItemClicked(ActionableItem::kSyncSettingsButton);
+  MarkActionableItemClicked();
   if (!perform_menu_actions()) {
     return;
   }
@@ -591,48 +579,6 @@
       ->OpenBatchUpload(&browser(), batch_upload_entry_point);
 }
 
-void ProfileMenuView::SetMenuTitleForAccessibility() {
-  const signin::IdentityManager* identity_manager =
-      IdentityManagerFactory::GetForProfile(&profile());
-  CoreAccountInfo core_account_info =
-      identity_manager->GetPrimaryAccountInfo(signin::ConsentLevel::kSignin);
-  AccountInfo account_info =
-      identity_manager->FindExtendedAccountInfo(core_account_info);
-
-  switch (signin_util::GetSignedInState(identity_manager)) {
-    case signin_util::SignedInState::kSignedOut:
-    case signin_util::SignedInState::kWebOnlySignedIn: {
-      std::string profile_user_display_name, profile_user_email;
-#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN) || BUILDFLAG(IS_LINUX)
-      profile_user_display_name = profile().GetPrefs()->GetString(
-          enterprise_signin::prefs::kProfileUserDisplayName);
-      profile_user_email = profile().GetPrefs()->GetString(
-          enterprise_signin::prefs::kProfileUserEmail);
-#endif
-      menu_title_ =
-          profile_user_display_name.empty()
-              ? l10n_util::GetStringUTF16(IDS_PROFILES_LOCAL_PROFILE_STATE)
-              : base::UTF8ToUTF16(profile_user_display_name);
-      menu_subtitle_ = base::UTF8ToUTF16(profile_user_email);  // Often empty.
-    } break;
-    case signin_util::SignedInState::kSyncPaused:
-    case signin_util::SignedInState::kSignInPending:
-      menu_title_ = base::UTF8ToUTF16(account_info.GetFullName().value_or(""));
-      menu_subtitle_ =
-          l10n_util::GetStringUTF16(IDS_PROFILES_LOCAL_PROFILE_STATE);
-      break;
-    case signin_util::SignedInState::kSyncing:
-    case signin_util::SignedInState::kSignedIn:
-      menu_title_ = base::UTF8ToUTF16(account_info.GetFullName().value_or(""));
-      menu_subtitle_ = base::UTF8ToUTF16(account_info.GetEmail());
-      break;
-  }
-
-  if (GetWidget()) {
-    GetWidget()->UpdateAccessibleNameForRootView();
-  }
-}
-
 void ProfileMenuView::BuildGuestIdentity() {
   menu_title_ = l10n_util::GetStringUTF16(IDS_GUEST_PROFILE_NAME);
   menu_subtitle_ = std::u16string();
@@ -648,313 +594,156 @@
   }
 }
 
-ProfileMenuViewBase::IdentitySectionParams
-ProfileMenuView::GetIdentitySectionParams(const ProfileAttributesEntry& entry) {
-  const signin::IdentityManager* identity_manager =
-      IdentityManagerFactory::GetForProfile(&profile());
-  const CoreAccountInfo primary_account_info =
-      identity_manager->GetPrimaryAccountInfo(signin::ConsentLevel::kSignin);
-  const AccountInfo primary_extended_account_info =
-      identity_manager->FindExtendedAccountInfo(primary_account_info);
-  CoreAccountInfo account_info_for_signin_action = primary_account_info;
-
-  const bool is_dasherless_profile = entry.IsDasherlessManagement();
-
+void ProfileMenuView::BuildIdentityWithCallToAction() {
+  if (auto* service =
+          remocode::AccountServiceFactory::GetForProfile(&profile())) {
+    UpdateRemocodeAccountIdentity(service->GetState());
+  } else {
+    UpdateRemocodeAccountIdentity(base::DictValue());
+  }
+}
+
+void ProfileMenuView::OnRemocodeAccountChanged() {
+  if (!GetWidget() || GetWidget()->IsClosed()) {
+    return;
+  }
+  BuildIdentityWithCallToAction();
+  SizeToContents();
+}
+
+void ProfileMenuView::UpdateRemocodeAccountIdentity(
+    const base::DictValue& state) {
   IdentitySectionParams params;
-  params.title = GetProfileIdentifier(entry);
-  profiles::PlaceholderAvatarIconParams icon_params = {.has_padding = true,
-                                                       .has_background = false};
-  params.profile_image = ui::ImageModel::FromImage(
-      primary_extended_account_info.GetAvatarImage().value_or(
-          entry.GetAvatarIcon(kIdentityInfoImageSize,
-                              /*use_high_res_file=*/true, icon_params)));
-
-  ui::ImageModel* custom_management_image = nullptr;
-  if (enterprise_util::CanShowEnterpriseBadgingForMenu(&profile())) {
-    if (profile().IsChild()) {
-      params.header_string = l10n_util::GetStringUTF16(IDS_MANAGED_BY_PARENT);
-    } else {
-      params.header_string =
-          l10n_util::GetStringUTF16(IDS_PROFILE_MENU_PROFILE_MANAGED_HEADER);
-      custom_management_image =
-          policy::ManagementServiceFactory::GetForProfile(&profile())
-              ->GetManagementIconForProfile();
-    }
-
-    params.header_action =
-        base::BindRepeating(&ProfileMenuView::OnProfileManagementButtonClicked,
-                            base::Unretained(this));
-    if (custom_management_image) {
-      params.header_image = *custom_management_image;
-    } else {
-      params.header_image = ui::ImageModel::FromVectorIcon(
-          GetManagedUiIcon(&profile()), ui::kColorIcon);
-    }
-  }
-
-  // Clarify Dasherless profile with subtitle while not adding the button.
-  if (is_dasherless_profile) {
+  params.title =
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_TITLE);
+  // AccountService currently provides no image URL. Never reuse a Google image
+  // or a local profile avatar as the Remocode account's identity.
+  params.profile_image = ui::ImageModel::FromVectorIcon(
+      vector_icons::kAccountCircleIcon, ui::kColorIcon, kIdentityInfoImageSize);
+  params.subtitle =
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_SIGNED_OUT);
+  params.button_text =
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_LOGIN);
+  RemocodeAction action = RemocodeAction::kLogin;
+  const std::string* account_state = state.FindString("state");
+  const std::string* message = state.FindString("message");
+  if (account_state && *account_state == "authorizing") {
     params.subtitle =
-        l10n_util::GetStringUTF16(IDS_PROFILES_DASHER_FEATURE_DISABLED_TITLE);
-    return params;
-  }
-
-  if (web_app::AppBrowserController::IsWebApp(&browser())) {
-    if (!primary_account_info.email.empty()) {
-      params.subtitle = base::UTF8ToUTF16(primary_account_info.email);
-    }
-    return params;
-  }
-
-  syncer::SyncService* service = SyncServiceFactory::GetForProfile(&profile());
-  syncer::SyncService::UserActionableError error =
-      syncer::SyncService::UserActionableError::kNone;
-  if (service) {
-    error = service->GetUserActionableError();
-    // Avoid reacting to
-    // syncer::SyncService::UserActionableError::kSignInNeedsUpdate in case of
-    // no sync consent, as kSignInPending is handled differently below.
-    if (error != syncer::SyncService::UserActionableError::kNone &&
-        (error !=
-             syncer::SyncService::UserActionableError::kSignInNeedsUpdate ||
-         identity_manager->HasPrimaryAccount(signin::ConsentLevel::kSync))) {
-      params.subtitle =
-          GetAvatarSyncErrorDescription(error, primary_account_info.email);
-      params.button_text = GetSyncErrorButtonText(&profile(), error);
-      params.button_action =
-          base::BindRepeating(&ProfileMenuView::OnSyncErrorButtonClicked,
-                              base::Unretained(this), error);
-      params.has_dotted_ring = true;
-      return params;
-    }
-  }
-
-  // If there are no sync user actionable errors, we can display passkey unlock
-  // card if needed:
-  if (error == syncer::SyncService::UserActionableError::kNone &&
-      webauthn::PasskeyUnlockManager::IsPasskeyUnlockErrorUiEnabled()) {
-    webauthn::PasskeyUnlockManager* passkey_unlock_manager =
-        webauthn::PasskeyUnlockManagerFactory::GetForProfile(&profile());
-    if (passkey_unlock_manager->ShouldDisplayErrorUi()) {
-      params.subtitle =
-          passkey_unlock_manager->GetPasskeyErrorProfileMenuDetails();
-      params.button_text =
-          passkey_unlock_manager->GetPasskeyErrorProfileMenuButtonLabel();
-      params.button_action =
-          base::BindRepeating(&ProfileMenuView::OnPasskeyUnlockButtonClicked,
-                              base::Unretained(this));
-      params.has_dotted_ring = true;
-      return params;
-    }
-  }
-
-  ActionableItem button_type = ActionableItem::kSigninAccountButton;
-  signin_metrics::AccessPoint access_point =
-      from_avatar_promo_ ? signin::kHistoryOptinAvatarPromoAccessPoint
-                         : signin_metrics::AccessPoint::kAvatarBubbleSignIn;
-  switch (signin_util::GetSignedInState(identity_manager)) {
-    case signin_util::SignedInState::kSignedOut:
-    case signin_util::SignedInState::kWebOnlySignedIn: {
-      AccountInfo account_info_for_promos =
-          signin_ui_util::GetSingleAccountForPromos(identity_manager);
-      if (!CanOfferSignin(&profile(), account_info_for_promos.gaia,
-                          account_info_for_promos.email,
-                          /*allow_account_from_other_profile=*/true)
-               .IsOk()) {
-        break;
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_AUTHORIZING);
+    params.button_text =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_CANCEL);
+    action = RemocodeAction::kCancel;
+  } else if (state.FindBool("busy").value_or(false)) {
+    // Includes keychain initialization and restoring a persisted session.
+    params.subtitle =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_LOADING);
+    params.button_text.clear();
+  } else if (account_state && *account_state == "signedIn") {
+    const std::string* name = state.FindString("displayName");
+    const std::string* email = state.FindString("email");
+    if (name && !name->empty()) {
+      params.title = base::UTF8ToUTF16(*name);
+    } else if (email && !email->empty()) {
+      params.title = base::UTF8ToUTF16(*email);
+    }
+    if (email) {
+      params.email_subtitle = base::UTF8ToUTF16(*email);
+    }
+    params.subtitle =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_SIGNED_IN);
+    params.header_string =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_MANAGE);
+    params.header_image = ui::ImageModel::FromVectorIcon(
+        vector_icons::kAccountCircleIcon, ui::kColorIcon);
+    params.header_action = base::BindRepeating(
+        &ProfileMenuView::OnRemocodeAccountAction,
+        remocode_weak_factory_.GetWeakPtr(), RemocodeAction::kManage);
+    params.button_text =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT);
+    action = RemocodeAction::kLogout;
+  } else if (account_state && *account_state == "reauthRequired") {
+    params.subtitle =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_SESSION_EXPIRED);
+    params.button_text =
+        l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_REAUTH_REQUIRED);
+  } else if (!account_state || *account_state == "error") {
+    int message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_ERROR_DETAIL;
+    if (message) {
+      if (*message == "storageUnavailable") {
+        message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_STORAGE_UNAVAILABLE;
+        params.button_text =
+            l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_ACCOUNT_RETRY);
+        action = RemocodeAction::kRetry;
+      } else if (*message == "portInUse") {
+        message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_PORT_IN_USE;
+      } else if (*message == "networkError") {
+        message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_NETWORK_ERROR;
+      } else if (*message == "providerError") {
+        message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_PROVIDER_ERROR;
+      } else if (*message == "timeout") {
+        message_id = IDS_SETTINGS_REMOCODE_ACCOUNT_TIMEOUT;
       }
-
-      access_point =
-          signin_metrics::AccessPoint::kAvatarBubbleSignInWithSyncPromo;
-      if (from_avatar_promo_) {
-        CHECK(promo_info_.type.has_value());
-        CHECK_EQ(promo_info_.type.value(),
-                 signin::ProfileMenuAvatarButtonPromoInfo::Type::kSigninPromo);
-        access_point = access_point =
-            signin_metrics::AccessPoint::kAvatarPillExpandPromo;
-      }
-      signin_metrics::LogSignInOffered(
-          access_point,
-          account_info_for_promos.IsEmpty()
-              ? signin_metrics::PromoAction::
-                    PROMO_ACTION_NEW_ACCOUNT_NO_EXISTING_ACCOUNT
-              : signin_metrics::PromoAction::PROMO_ACTION_WITH_DEFAULT);
-
-      if (account_info_for_promos.IsEmpty()) {
-        // Non-personalized signin button.
-        button_type = ActionableItem::kSigninButton;
-        params.subtitle = l10n_util::GetStringUTF16(
-            syncer::IsReplaceSyncPromosWithSignInPromosEnabled()
-                ? IDS_PROFILE_MENU_SIGNIN_PROMO_DESCRIPTION_WITH_BOOKMARKS
-                : IDS_PROFILE_MENU_SIGNIN_PROMO_DESCRIPTION);
-        params.button_text =
-            l10n_util::GetStringUTF16(IDS_PROFILE_MENU_SIGNIN_PROMO_BUTTON);
-        break;
-      }
-      // "Continue as" signin button.
-      account_info_for_signin_action = account_info_for_promos;
-      params.subtitle = l10n_util::GetStringFUTF16(
-          syncer::IsReplaceSyncPromosWithSignInPromosEnabled()
-              ? IDS_SETTINGS_PEOPLE_ACCOUNT_AWARE_SIGNIN_ACCOUNT_ROW_SUBTITLE_WITH_EMAIL_WITH_BOOKMARKS
-              : IDS_SETTINGS_PEOPLE_ACCOUNT_AWARE_SIGNIN_ACCOUNT_ROW_SUBTITLE_WITH_EMAIL,
-          base::UTF8ToUTF16(account_info_for_promos.email));
-      params.button_text = l10n_util::GetStringFUTF16(
-          IDS_PROFILES_DICE_WEB_ONLY_SIGNIN_BUTTON,
-          base::UTF8ToUTF16(account_info_for_promos.GetGivenName().value_or(
-              account_info_for_promos.GetEmail())));
-      gfx::Image account_image;
-      if (!account_info_for_promos.GetAvatarImage().has_value()) {
-        // No account image, use a placeholder.
-        ProfileAttributesEntry* profile_attributes =
-            g_browser_process->profile_manager()
-                ->GetProfileAttributesStorage()
-                .GetProfileAttributesWithPath(profile().GetPath());
-        account_image = profile_attributes->GetAvatarIcon(
-            /*size_for_placeholder_avatar=*/kIdentityImageSizeForButton,
-            /*use_high_res_file=*/true,
-            GetPlaceholderAvatarIconParamsVisibleAgainstColor(
-                BrowserWindow::FromBrowser(&browser())
-                    ->GetColorProvider()
-                    ->GetColor(ui::kColorButtonBackgroundProminent)));
-      } else {
-        account_image = account_info_for_promos.account_image;
-      }
-      params.button_image =
-          ui::ImageModel::FromImage(profiles::GetSizedAvatarIcon(
-              account_image,
-              /*width=*/kIdentityImageSizeForButton,
-              /*height=*/kIdentityImageSizeForButton, profiles::SHAPE_CIRCLE));
-      break;
-    }
-    case signin_util::SignedInState::kSignedIn:
-      if (promo_info_.type.has_value()) {
-        switch (promo_info_.type.value()) {
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::
-              kHistorySyncPromo:
-            params.subtitle = l10n_util::GetStringFUTF16(
-                IDS_PROFILE_MENU_SYNC_PROMO_SYNC_HISTORY_DESCRIPTION,
-                base::UTF8ToUTF16(primary_account_info.email));
-            params.button_text = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_SYNC_PROMO_BUTTON_LABEL);
-            button_type = ActionableItem::kHistorySyncButton;
-            signin_metrics::LogHistorySyncOptInOffered(access_point);
-            break;
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::
-              kBatchUploadPromo:
-            params.email_subtitle =
-                base::UTF8ToUTF16(primary_account_info.email);
-            params.subtitle = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_PROMO_DESCRIPTION_WITH_BATCH_UPLOAD);
-            params.button_text = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_PROMO_BUTTON_WITH_BATCH_UPLOAD);
-            params.button_action = base::BindRepeating(
-                &ProfileMenuView::OnBatchUploadButtonClicked,
-                base::Unretained(this),
-                ActionableItem::kBatchUploadAsPrimaryButton);
-            break;
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::
-              kBatchUploadBookmarksPromo:
-            params.email_subtitle =
-                base::UTF8ToUTF16(primary_account_info.email);
-            params.subtitle = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_PROMO_DESCRIPTION_WITH_BATCH_UPLOAD_BOOKMARK_CLEANUP);
-            params.button_text = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_PROMO_BUTTON_WITH_BATCH_UPLOAD);
-            params.button_action = base::BindRepeating(
-                &ProfileMenuView::OnBatchUploadButtonClicked,
-                base::Unretained(this),
-                ActionableItem::kBatchUploadWithBookmarksAsPrimaryButton);
-            break;
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::
-              kBatchUploadWindows10DepreciationPromo:
-            params.email_subtitle =
-                base::UTF8ToUTF16(primary_account_info.email);
-            // Note: Sync promo does not explicitly mention "sync" but invites
-            // the user to back-up their data. It is fine to be used here.
-            params.subtitle = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_DESCRIPTION_WITH_SYNC_PROMO);
-            params.button_text = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_BUTTON_LABEL_WITH_SYNC_PROMO);
-            params.button_action = base::BindRepeating(
-                &ProfileMenuView::OnBatchUploadButtonClicked,
-                base::Unretained(this),
-                ActionableItem::
-                    kBatchUploadWindows10DepreciationAsPrimaryButton);
-            break;
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::kSyncPromo:
-            CHECK(switches::IsAvatarSyncPromoFeatureEnabled());
-            params.subtitle = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_DESCRIPTION_WITH_SYNC_PROMO);
-            params.button_text = l10n_util::GetStringUTF16(
-                IDS_PROFILE_MENU_BUTTON_LABEL_WITH_SYNC_PROMO);
-            break;
-          case signin::ProfileMenuAvatarButtonPromoInfo::Type::kSigninPromo:
-            NOTREACHED() << "This promo type is not possible when signed in.";
-        }
-      } else {
-        if (syncer::IsReplaceSyncPromosWithSignInPromosEnabled()) {
-          // No button.
-          params.email_subtitle = base::UTF8ToUTF16(primary_account_info.email);
-        } else {
-          params.subtitle =
-              l10n_util::GetStringUTF16(IDS_PROFILES_DICE_SYNC_PROMO);
-          params.button_text =
-              l10n_util::GetStringUTF16(IDS_PROFILES_DICE_SIGNIN_BUTTON);
-          signin_metrics::LogSyncOptInOffered(access_point);
-        }
-      }
-      break;
-    case signin_util::SignedInState::kSyncing:
-      // No button.
-      params.email_subtitle = base::UTF8ToUTF16(primary_account_info.email);
-      break;
-    case signin_util::SignedInState::kSignInPending:
-    // Only reachable when the sync service is not available, so it is treated
-    // as `kSignInPending`.
-    case signin_util::SignedInState::kSyncPaused:
-      button_type = ActionableItem::kSigninReauthButton;
-      params.subtitle = l10n_util::GetStringFUTF16(
-          IDS_SETTINGS_PENDING_STATE_DESCRIPTION,
-          base::UTF8ToUTF16(primary_account_info.email));
-      params.button_text = l10n_util::GetStringUTF16(GetSyncErrorButtonStringId(
-          syncer::SyncService::UserActionableError::kSignInNeedsUpdate,
-          /*support_title_case=*/true));
-      params.has_dotted_ring = true;
-      signin_metrics::LogSigninPendingOffered(access_point);
-      break;
-  }
-
-  // Sets the default action if needed - if a button text was explicitly set and
-  // no prior action was set.
-  if (!params.button_text.empty() && params.button_action.is_null()) {
+    }
+    params.subtitle = l10n_util::GetStringUTF16(message_id);
+    // A missing keyed service is unavailable, not a usable sign-in action.
+    if (!account_state) {
+      params.button_text.clear();
+    }
+  } else if (message && *message == "logoutFailed") {
+    params.subtitle = l10n_util::GetStringUTF16(
+        IDS_SETTINGS_REMOCODE_ACCOUNT_LOGOUT_UNCONFIRMED);
+  }
+  if (!params.button_text.empty()) {
     params.button_action = base::BindRepeating(
-        &ProfileMenuView::OnSigninButtonClicked, base::Unretained(this),
-        account_info_for_signin_action, button_type, access_point);
-  }
-
-  // TODO(crbug.com/522296672): Specify the right way to obtain this information
-  // as `GetAiSubscriptionTier` only works for certain groups of users.
-  subscription_eligibility::SubscriptionEligibilityService*
-      subscription_service = subscription_eligibility::
-          SubscriptionEligibilityServiceFactory::GetForProfile(&profile());
-  if (subscription_service) {
-    params.ai_subscription_tier = subscription_service->GetAiSubscriptionTier();
-  }
-
-  return params;
-}
-
-void ProfileMenuView::BuildIdentityWithCallToAction() {
-  ProfileAttributesEntry* entry =
-      g_browser_process->profile_manager()
-          ->GetProfileAttributesStorage()
-          .GetProfileAttributesWithPath(profile().GetPath());
-  if (!entry) {
-    // May happen if the profile is being deleted. https://crbug.com/40667165
-    return;
-  }
-
-  SetProfileIdentityWithCallToAction(GetIdentitySectionParams(*entry));
+        &ProfileMenuView::OnRemocodeAccountAction,
+        remocode_weak_factory_.GetWeakPtr(), action);
+  }
+  menu_title_ = params.title;
+  menu_subtitle_ = params.email_subtitle.empty() ? params.subtitle
+                                               : params.email_subtitle;
+  SetProfileIdentityWithCallToAction(std::move(params));
+  if (GetWidget()) {
+    GetWidget()->UpdateAccessibleNameForRootView();
+  }
+}
+
+void ProfileMenuView::OnRemocodeAccountAction(RemocodeAction action) {
+  // Native account actions do not record Google sign-in/supervision metrics.
+  MarkActionableItemClicked();
+  if (!perform_menu_actions()) {
+    return;
+  }
+  // Close normally before Login() can notify or asynchronously open a tab.
+  // Capture only a weak browser, never `this` in the authorization callback.
+  base::WeakPtr<Browser> host = browser().AsWeakPtr();
+  remocode_account_subscription_ = {};
+  remocode_weak_factory_.InvalidateWeakPtrs();
+  GetWidget()->CloseWithReason(views::Widget::ClosedReason::kUnspecified);
+  if (!host) {
+    return;
+  }
+  auto* service =
+      remocode::AccountServiceFactory::GetForProfile(host->profile());
+  if (!service) {
+    return;
+  }
+  switch (action) {
+    case RemocodeAction::kLogin:
+      service->Login(base::BindOnce(&OpenRemocodeURL, host));
+      break;
+    case RemocodeAction::kCancel:
+      service->Cancel();
+      break;
+    case RemocodeAction::kLogout:
+      service->Logout();
+      break;
+    case RemocodeAction::kManage:
+      OpenRemocodeURL(host, GURL("https://remocode.cc/me"));
+      break;
+    case RemocodeAction::kRetry:
+      service->Retry();
+      break;
+  }
 }
 
 void ProfileMenuView::MaybeBuildBatchUploadButton() {
@@ -1217,26 +1006,11 @@
 
 void ProfileMenuView::BuildFeatureButtons() {
   CHECK(!profile().IsGuestSession());
-#if BUILDFLAG(ENABLE_DICE_SUPPORT)
-  MaybeBuildCrossDeviceSigninButton();
-#endif  // BUILDFLAG(ENABLE_DICE_SUPPORT)
-  signin::IdentityManager* identity_manager =
-      IdentityManagerFactory::GetForProfile(&profile());
-  // May add the button asynchronously, order is not be guaranteed.
-  MaybeBuildBatchUploadButton();
-  BuildAutofillSettingsButton();
-  MaybeBuildManageGoogleAccountButton();
-  BuildCustomizeProfileButton();
-  (syncer::IsReplaceSyncPromosWithSignInPromosEnabled() &&
-   (!identity_manager ||
-    !identity_manager->HasPrimaryAccount(signin::ConsentLevel::kSync)))
-      ? MaybeBuildChromeAccountSettingsButton()
-      : MaybeBuildChromeAccountSettingsButtonWithSync();
-  if (syncer::IsReplaceSyncPromosWithSignInPromosEnabled()) {
-    MaybeBuildGoogleServicesSettingsButton();
-  }
-  MaybeBuildCloseBrowsersButton();
-  MaybeBuildSignoutButton();
+  AddFeatureButton(
+      l10n_util::GetStringUTF16(IDS_SETTINGS_REMOCODE_SYNC_TITLE),
+      base::BindRepeating(&ProfileMenuView::OnSyncSettingsButtonClicked,
+                          remocode_weak_factory_.GetWeakPtr()),
+      vector_icons::kSyncIcon);
 }
 
 #if BUILDFLAG(ENABLE_DICE_SUPPORT)
@@ -1349,6 +1123,11 @@
   CHECK(!profile().IsGuestSession());
 
   AddProfileManagementFeaturesSeparator();
+  AddProfileManagementFeatureButton(
+      kEditIcon,
+      l10n_util::GetStringUTF16(IDS_PROFILE_MENU_CUSTOMIZE_PROFILE_BUTTON),
+      base::BindRepeating(&ProfileMenuView::OnEditProfileButtonClicked,
+                          base::Unretained(this)));
 
   if (profiles::IsProfileCreationAllowed()) {
     AddProfileManagementFeatureButton(

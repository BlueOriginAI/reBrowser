diff --git a/chrome/browser/ui/views/profiles/avatar_toolbar_button.h b/chrome/browser/ui/views/profiles/avatar_toolbar_button.h
--- a/chrome/browser/ui/views/profiles/avatar_toolbar_button.h
+++ b/chrome/browser/ui/views/profiles/avatar_toolbar_button.h
@@ -120,6 +120,8 @@
   void AnimateTextChange(StateProvider* state_provider,
                          const ui::ColorProvider* color_provider);
   void UpdateAccessibilityLabel();
+  bool UsesRemocodeAccount() const;
+  std::u16string GetRemocodeAccountLabel() const;
   void AnnounceInternal(std::u16string text);
 
   // views::View:
@@ -142,6 +144,8 @@
   // Subscription for ink drop highlight changes (forced-colors mode).
   base::CallbackListSubscription ink_drop_highlight_subscription_;
 
+  base::CallbackListSubscription remocode_account_subscription_;
+
   gfx::SlideAnimation slide_animation_;
 
   base::OnceCallback<void(std::u16string)> announce_callback_for_testing_;

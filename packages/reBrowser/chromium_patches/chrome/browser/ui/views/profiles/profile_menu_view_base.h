diff --git a/chrome/browser/ui/views/profiles/profile_menu_view_base.h b/chrome/browser/ui/views/profiles/profile_menu_view_base.h
--- a/chrome/browser/ui/views/profiles/profile_menu_view_base.h
+++ b/chrome/browser/ui/views/profiles/profile_menu_view_base.h
@@ -201,6 +201,10 @@
   // TODO(crbug.com/433727015): Ensure all actionable item clicks are recorded.
   void OnActionableItemClicked(ActionableItem item);
 
+  // Marks native account interactions without consulting Google identity for
+  // sign-in or supervision metrics. Keeps dismissals distinct from actions.
+  void MarkActionableItemClicked() { actionable_item_clicked_ = true; }
+
   Profile& profile() const { return *profile_; }
 
   // Return maximal height for the view after which it becomes scrollable.

diff --git a/chrome/browser/ui/views/profiles/profile_menu_view_base.cc b/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
--- a/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
+++ b/chrome/browser/ui/views/profiles/profile_menu_view_base.cc
@@ -498,6 +498,10 @@
   // Note: If a button is present, a subtitle must also be present. The layout
   // does not support a button without subtitle.
 
+  // Identity can be replaced while the menu is open (e.g. native account
+  // initialization finishes). Clear this before destroying its owner, including
+  // transitions to a state with no CTA.
+  identity_button_ = nullptr;
   identity_info_container_->RemoveAllChildViews();
   // Vertical BoxLayout.
   auto box_layout =

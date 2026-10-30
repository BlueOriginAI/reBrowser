diff --git a/chrome/browser/ui/views/tabs/common/tab_view.cc b/chrome/browser/ui/views/tabs/common/tab_view.cc
index 44fda8dfac..ab1301e65d 100644
--- a/chrome/browser/ui/views/tabs/common/tab_view.cc
+++ b/chrome/browser/ui/views/tabs/common/tab_view.cc
@@ -60,9 +60,11 @@
 #include "ui/base/models/list_selection_model.h"
 #include "ui/base/theme_provider.h"
 #include "ui/base/ui_base_features.h"
+#include "ui/color/color_provider.h"
 #include "ui/compositor/layer.h"
 #include "ui/events/keycodes/keyboard_codes.h"
 #include "ui/events/types/event_type.h"
+#include "ui/gfx/color_utils.h"
 #include "ui/gfx/geometry/insets.h"
 #include "ui/gfx/geometry/rect.h"
 #include "ui/gfx/geometry/rounded_corners_f.h"
@@ -89,6 +91,24 @@ constexpr int kHorizontalInset = 8;
 constexpr int kDefaultPadding = 4;
 constexpr int kFocusRingInset = 0.0f;
 
+struct ActiveTabColors {
+  SkColor background;
+  SkColor foreground;
+};
+
+ActiveTabColors GetActiveTabColors(const ui::ColorProvider* color_provider) {
+  // Follow the actual tab-strip surface, including custom browser themes.
+  const bool dark_background =
+      color_provider && color_utils::IsDark(color_provider->GetColor(
+                            kColorTabBackgroundInactiveFrameActive));
+  // Remocode's dark and light terracotta accents, with readable warm ink.
+  return dark_background
+             ? ActiveTabColors{SkColorSetRGB(0xD9, 0x77, 0x57),
+                               SkColorSetRGB(0x21, 0x1A, 0x17)}
+             : ActiveTabColors{SkColorSetRGB(0xC9, 0x60, 0x3F),
+                               SkColorSetRGB(0x18, 0x12, 0x0F)};
+}
+
 class TabHighlightPathGenerator : public views::HighlightPathGenerator {
  public:
   explicit TabHighlightPathGenerator(TabView* tab_view) : tab_view_(tab_view) {}
@@ -278,8 +298,10 @@ bool TabView::IsHoverAnimationActive() const {
 }
 
 std::optional<SkColor> TabView::GetBackgroundColor() {
-  if (active_ || IsHoverAnimationActive() ||
-      should_fill_background_tab_color_) {
+  if (active_) {
+    return GetActiveTabColors(GetColorProvider()).background;
+  }
+  if (IsHoverAnimationActive() || should_fill_background_tab_color_) {
     return tab_style_->GetCurrentTabBackgroundColor(
         GetSelectionState(), IsHoverAnimationActive(), GetHoverAnimationValue(),
         IsFrameActive(), GetColorProvider());
@@ -523,7 +545,11 @@ void TabView::OnPaint(gfx::Canvas* canvas) {
     return;
   }
 
-  if (active_tab_fill_id_.has_value() || inactive_tab_fill_id_.has_value()) {
+  if (active_) {
+    PaintTabBackgroundFill(canvas, GetSelectionState(),
+                           /*hovered=*/false, std::nullopt);
+  } else if (active_tab_fill_id_.has_value() ||
+             inactive_tab_fill_id_.has_value()) {
     PaintTabBackgroundWithImages(canvas, active_tab_fill_id_,
                                  inactive_tab_fill_id_);
   } else {
@@ -582,9 +608,11 @@ void TabView::PaintTabBackgroundFill(
                                     hovered)) {
     cc::PaintFlags flags;
     flags.setAntiAlias(true);
-    flags.setColor(tab_style_->GetCurrentTabBackgroundColor(
-        GetSelectionState(), IsHoverAnimationActive(), GetHoverAnimationValue(),
-        IsFrameActive(), GetColorProvider()));
+    flags.setColor(active_ ? GetActiveTabColors(GetColorProvider()).background
+                           : tab_style_->GetCurrentTabBackgroundColor(
+                                 GetSelectionState(), IsHoverAnimationActive(),
+                                 GetHoverAnimationValue(), IsFrameActive(),
+                                 GetColorProvider()));
     canvas->DrawRect(GetContentsBounds(), flags);
   }
 
@@ -1099,6 +1127,11 @@ void TabView::UpdateColors() {
   TabStyle::TabColors colors = tab_style_->CalculateTargetColors(
       GetSelectionState(), IsApparentlyActive(), hovered_, IsFrameActive(),
       GetColorProvider());
+  if (active_) {
+    const ActiveTabColors active_colors = GetActiveTabColors(GetColorProvider());
+    colors.background_color = active_colors.background;
+    colors.foreground_color = active_colors.foreground;
+  }
   title_->SetEnabledColor(colors.foreground_color);
   close_button_->SetColors(colors);
   alert_indicator_->OnParentTabButtonColorChanged();

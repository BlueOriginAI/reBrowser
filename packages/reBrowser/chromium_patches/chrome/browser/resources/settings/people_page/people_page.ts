diff --git a/chrome/browser/resources/settings/people_page/people_page.ts b/chrome/browser/resources/settings/people_page/people_page.ts
--- a/chrome/browser/resources/settings/people_page/people_page.ts
+++ b/chrome/browser/resources/settings/people_page/people_page.ts
@@ -18,6 +18,7 @@
 import '../controls/settings_toggle_button.js';
 // <if expr="not is_chromeos">
 import './sync_account_control.js';
+import './remocode_account_card.js';
 // </if>
 import '../icons.html.js';
 import '../settings_page/settings_section.js';
@@ -76,6 +77,10 @@
 
   static get template() {
     return getTemplate();
+  }
+
+  private getRemocodeServicesText_(key: string): string {
+    return loadTimeData.getString(key).replaceAll('Google', 'Remocode');
   }
 
   static get properties() {

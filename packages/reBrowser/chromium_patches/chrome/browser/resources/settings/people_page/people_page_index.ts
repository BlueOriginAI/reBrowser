diff --git a/chrome/browser/resources/settings/people_page/people_page_index.ts b/chrome/browser/resources/settings/people_page/people_page_index.ts
--- a/chrome/browser/resources/settings/people_page/people_page_index.ts
+++ b/chrome/browser/resources/settings/people_page/people_page_index.ts
@@ -5,6 +5,7 @@
 import 'chrome://resources/cr_elements/cr_view_manager/cr_view_manager.js';
 import '/shared/settings/prefs/prefs.js';
 import './people_page.js';
+import './remocode_sync_page.js';
 import '../settings_shared.css.js';
 
 import type {CrViewManagerElement} from 'chrome://resources/cr_elements/cr_view_manager/cr_view_manager.js';
@@ -13,7 +14,7 @@
 
 import {loadTimeData} from '../i18n_setup.js';
 import {routes} from '../route.js';
-import {RouteObserverMixin} from '../router.js';
+import {RouteObserverMixin, Router} from '../router.js';
 import type {Route, SettingsRoutes} from '../router.js';
 import type {SettingsPlugin} from '../settings_main/settings_plugin.js';
 import {SearchableViewContainerMixin} from '../settings_page/searchable_view_container_mixin.js';
@@ -83,8 +84,9 @@
           this.$.viewManager.switchView('sync', 'no-animation', 'no-animation');
           break;
         case routes.SYNC_ADVANCED:
-          this.$.viewManager.switchView(
-              'syncControls', 'no-animation', 'no-animation');
+          // Legacy advanced-sync URLs must never mount Google's sync controls.
+          this.$.viewManager.switchView('sync', 'no-animation', 'no-animation');
+          Router.getInstance().navigateTo(routes.SYNC);
           break;
         case routes.ACCOUNT:
           assert(this.replaceSyncPromosWithSignInPromos_);

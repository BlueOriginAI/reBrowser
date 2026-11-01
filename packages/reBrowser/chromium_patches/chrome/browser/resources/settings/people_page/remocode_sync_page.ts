diff --git a/chrome/browser/resources/settings/people_page/remocode_sync_page.ts b/chrome/browser/resources/settings/people_page/remocode_sync_page.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_sync_page.ts
@@ -0,0 +1,50 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+import '../settings_shared.css.js';
+import './remocode_account_card.js';
+import {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';
+import type {Route} from '../router.js';
+import {RouteObserverMixin} from '../router.js';
+import {getTemplate} from './remocode_sync_page.html.js';
+
+export class SettingsRemocodeSyncPageElement extends
+    RouteObserverMixin(PolymerElement) {
+  static get is() { return 'settings-remocode-sync-page'; }
+  static get template() { return getTemplate(); }
+
+  private active_: boolean = false;
+  private readonly onActivate_ = () => {
+    if (this.active_ && document.visibilityState === 'visible') this.refresh_();
+  };
+
+  override connectedCallback() {
+    super.connectedCallback();
+    window.addEventListener('focus', this.onActivate_);
+    document.addEventListener('visibilitychange', this.onActivate_);
+  }
+
+  override currentRouteChanged(route: Route) {
+    this.active_ = route.path === '/syncSetup';
+    // Refresh completed web purchases when returning to the retained page.
+    if (this.active_) this.refresh_();
+  }
+
+  private refresh_() {
+    const card = this.shadowRoot?.querySelector('settings-remocode-account-card');
+    if (card) void card.refreshSubscription();
+  }
+
+  override disconnectedCallback() {
+    window.removeEventListener('focus', this.onActivate_);
+    document.removeEventListener('visibilitychange', this.onActivate_);
+    this.active_ = false;
+    super.disconnectedCallback();
+  }
+}
+
+declare global {
+  interface HTMLElementTagNameMap {
+    'settings-remocode-sync-page': SettingsRemocodeSyncPageElement;
+  }
+}
+customElements.define(SettingsRemocodeSyncPageElement.is, SettingsRemocodeSyncPageElement);

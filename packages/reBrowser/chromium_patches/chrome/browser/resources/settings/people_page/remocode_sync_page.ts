diff --git a/chrome/browser/resources/settings/people_page/remocode_sync_page.ts b/chrome/browser/resources/settings/people_page/remocode_sync_page.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_sync_page.ts
@@ -0,0 +1,192 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+import 'chrome://resources/cr_elements/cr_button/cr_button.js';
+import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
+import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';
+import '../settings_shared.css.js';
+import {I18nMixin} from 'chrome://resources/cr_elements/i18n_mixin.js';
+import {WebUiListenerMixin} from 'chrome://resources/cr_elements/web_ui_listener_mixin.js';
+import type {CrDialogElement} from 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';
+import type {CrToggleElement} from 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
+import {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';
+import type {Route} from '../router.js';
+import {RouteObserverMixin} from '../router.js';
+import {RemocodeAccountBrowserProxyImpl} from './remocode_account_browser_proxy.js';
+import {RemocodeSyncBrowserProxyImpl} from './remocode_sync_browser_proxy.js';
+import type {RemocodeSyncState, SyncEnabled, SyncStream} from './remocode_sync_browser_proxy.js';
+import {getTemplate} from './remocode_sync_page.html.js';
+export interface SettingsRemocodeSyncPageElement {
+  $: {enableDialog: CrDialogElement, deleteDialog: CrDialogElement};
+}
+export class SettingsRemocodeSyncPageElement extends
+    I18nMixin(RouteObserverMixin(WebUiListenerMixin(PolymerElement))) {
+  static get is() { return 'settings-remocode-sync-page'; }
+  static get template() { return getTemplate(); }
+  static get properties() {
+    return {
+      state_: {type: Object, value: () => ({
+        entitlement: 'loading', operation: 'paused', busy: false,
+        signedIn: false, purchaseAvailable: false, managementAvailable: false,
+        vipExpiresAt: null, deletionPending: false, deletionStatus: 'none', errorCode: '',
+        canDelete: false, needsReauth: false,
+        enabled: {bookmarks: false, history: false, agent_history: false},
+        available: {bookmarks: false, history: false, agent_history: false},
+        lastSuccess: 0,
+      })},
+      commandError_: {type: Boolean, value: false},
+    };
+  }
+  declare private state_: RemocodeSyncState;
+  declare private commandError_: boolean;
+  private proxy_ = RemocodeSyncBrowserProxyImpl.getInstance();
+  private pendingEnabled_: SyncEnabled|null = null;
+  private deleteNonce_: string = '';
+  private connectedGeneration_: number = 0;
+  private stateRevision_: number = 0;
+  private active_: boolean = false;
+  private readonly onActivate_ = () => {
+    if (this.active_ && document.visibilityState === 'visible') void this.onRetry_();
+  };
+  override connectedCallback() {
+    super.connectedCallback();
+    const generation = ++this.connectedGeneration_;
+    window.addEventListener('focus', this.onActivate_);
+    document.addEventListener('visibilitychange', this.onActivate_);
+    this.addWebUiListener('remocode-sync-changed', (state: RemocodeSyncState) => {
+      ++this.stateRevision_;
+      this.state_ = state;
+      if (!state.signedIn || state.entitlement !== 'active' || state.deletionPending) {
+        this.pendingEnabled_ = null;
+        if (this.$.enableDialog.open) this.$.enableDialog.cancel();
+      }
+      if (!state.signedIn || state.deletionPending) {
+        this.deleteNonce_ = '';
+        if (this.$.deleteDialog.open) this.$.deleteDialog.cancel();
+      }
+    });
+    const revision = this.stateRevision_;
+    void this.proxy_.getState().then(state => {
+      if (this.isConnected && generation === this.connectedGeneration_ &&
+          revision === this.stateRevision_) this.state_ = state;
+    }).catch(() => this.onError_());
+  }
+  override currentRouteChanged(route: Route) {
+    this.active_ = route.path === '/syncSetup';
+    // Re-entering Settings must check a completed web purchase even when this
+    // Polymer element was retained. Free users never run an entitlement poll.
+    if (this.active_) void this.onRetry_();
+  }
+  override disconnectedCallback() {
+    ++this.connectedGeneration_;
+    window.removeEventListener('focus', this.onActivate_);
+    document.removeEventListener('visibilitychange', this.onActivate_);
+    this.active_ = false;
+    this.pendingEnabled_ = null;
+    this.deleteNonce_ = '';
+    super.disconnectedCallback();
+  }
+  private onError_() { if (this.isConnected) this.commandError_ = true; }
+  private entitlementLabel_(state: RemocodeSyncState): string {
+    const keys = {loading: 'remocodeSyncLoading', signedOut: 'remocodeSyncSignedOut',
+      free: 'remocodeSyncFree', active: 'remocodeSyncActive',
+      error: 'remocodeSyncError', unavailable: 'remocodeSyncUnavailable'};
+    return this.i18n(keys[state.entitlement] || 'remocodeSyncError');
+  }
+  private operationLabel_(state: RemocodeSyncState): string {
+    const keys = {paused: 'remocodeSyncPaused', pending: 'remocodeSyncPending',
+      failed: 'remocodeSyncFailed', conflict: 'remocodeSyncConflict',
+      success: 'remocodeSyncSuccess', deleteFailed: 'remocodeSyncDeleteFailed',
+      deletePending: 'remocodeSyncDeletePending', reauthRequired: 'remocodeSyncReauthRequired'};
+    return this.i18n(keys[state.operation] || 'remocodeSyncFailed');
+  }
+  private lastSuccessLabel_(state: RemocodeSyncState): string {
+    return state.lastSuccess > 0 ? new Date(state.lastSuccess).toLocaleString() : this.i18n('remocodeSyncNever');
+  }
+  private purchaseUnavailable_(state: RemocodeSyncState): boolean {
+    return !state.purchaseAvailable && !state.managementAvailable;
+  }
+  private toggleDisabled_(state: RemocodeSyncState, available: boolean, enabled: boolean): boolean {
+    return state.deletionPending || (!enabled &&
+        (state.busy || !state.signedIn || state.entitlement !== 'active' || !available));
+  }
+  private async onToggle_(event: Event) {
+    const toggle = event.target as CrToggleElement;
+    const stream = toggle.dataset['stream'] as SyncStream;
+    const next = {...this.state_.enabled, [stream]: toggle.checked};
+    toggle.checked = this.state_.enabled[stream];
+    this.commandError_ = false;
+    if (next[stream]) {
+      this.pendingEnabled_ = next;
+      this.$.enableDialog.showModal();
+    } else {
+      await this.setEnabled_(next);
+    }
+  }
+  private async setEnabled_(enabled: SyncEnabled) {
+    try {
+      if (!await this.proxy_.setEnabled(enabled)) this.onError_();
+      await this.readCurrentState_();
+    } catch { this.onError_(); }
+  }
+  private onEnableCancel_() { this.pendingEnabled_ = null; this.$.enableDialog.cancel(); }
+  private async onEnableConfirm_() {
+    const enabled = this.pendingEnabled_;
+    this.pendingEnabled_ = null;
+    this.$.enableDialog.close();
+    if (enabled) await this.setEnabled_(enabled);
+  }
+  private async readCurrentState_() {
+    const generation = this.connectedGeneration_;
+    const revision = this.stateRevision_;
+    const state = await this.proxy_.getState();
+    if (this.isConnected && generation === this.connectedGeneration_ &&
+        revision === this.stateRevision_) this.state_ = state;
+  }
+  private onLogin_() { RemocodeAccountBrowserProxyImpl.getInstance().login(); }
+  private async onPurchase_() {
+    try { if (!await this.proxy_.purchase()) this.onError_(); }
+    catch { this.onError_(); }
+  }
+  private async onManage_() {
+    try { if (!await this.proxy_.manage()) this.onError_(); }
+    catch { this.onError_(); }
+  }
+  private async onRetry_() {
+    this.commandError_ = false;
+    const generation = this.connectedGeneration_;
+    const revision = this.stateRevision_;
+    try {
+      const state = await this.proxy_.refresh();
+      if (this.isConnected && generation === this.connectedGeneration_ &&
+          revision === this.stateRevision_) this.state_ = state;
+    } catch { this.onError_(); }
+  }
+  private async onDelete_() {
+    this.commandError_ = false;
+    const generation = this.connectedGeneration_;
+    try {
+      const nonce = await this.proxy_.prepareDelete();
+      if (!this.isConnected || generation !== this.connectedGeneration_ ||
+          !this.state_.canDelete) return;
+      this.deleteNonce_ = nonce;
+      if (!this.deleteNonce_) { this.onError_(); return; }
+      this.$.deleteDialog.showModal();
+    } catch { this.onError_(); }
+  }
+  private onDeleteCancel_() { this.deleteNonce_ = ''; this.$.deleteDialog.cancel(); }
+  private async onDeleteConfirm_() {
+    const nonce = this.deleteNonce_;
+    this.deleteNonce_ = '';
+    this.$.deleteDialog.close();
+    try {
+      if (!nonce || !await this.proxy_.deleteCloud(nonce)) this.onError_();
+      await this.readCurrentState_();
+    } catch { this.onError_(); }
+  }
+}
+declare global {
+  interface HTMLElementTagNameMap {
+    'settings-remocode-sync-page': SettingsRemocodeSyncPageElement;
+  }
+}
+customElements.define(SettingsRemocodeSyncPageElement.is, SettingsRemocodeSyncPageElement);

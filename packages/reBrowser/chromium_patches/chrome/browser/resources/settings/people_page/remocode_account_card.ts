diff --git a/chrome/browser/resources/settings/people_page/remocode_account_card.ts b/chrome/browser/resources/settings/people_page/remocode_account_card.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_account_card.ts
@@ -0,0 +1,596 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+import 'chrome://resources/cr_elements/cr_button/cr_button.js';
+import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
+import 'chrome://resources/cr_elements/cr_link_row/cr_link_row.js';
+import 'chrome://resources/cr_elements/cr_shared_style.css.js';
+import '../settings_shared.css.js';
+
+import {WebUiListenerMixin} from 'chrome://resources/cr_elements/web_ui_listener_mixin.js';
+import type {CrToggleElement} from 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
+import {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';
+
+import {loadTimeData} from '../i18n_setup.js';
+import type {RemocodeSyncState, SyncEnabled, SyncStream} from './remocode_sync_browser_proxy.js';
+import {RemocodeSyncBrowserProxyImpl} from './remocode_sync_browser_proxy.js';
+
+import type {RemocodeAccountState, RemocodeAccountStatus} from './remocode_account_browser_proxy.js';
+import {RemocodeAccountBrowserProxyImpl} from './remocode_account_browser_proxy.js';
+import {getTemplate} from './remocode_account_card.html.js';
+
+const STATUS_STRINGS: Record<RemocodeAccountStatus, string> = {
+  signedOut: 'remocodeAccountSignedOut',
+  authorizing: 'remocodeAccountAuthorizing',
+  signedIn: 'remocodeAccountSignedIn',
+  reauthRequired: 'remocodeAccountReauthRequired',
+  error: 'remocodeAccountError',
+};
+
+const MESSAGE_STRINGS = new Map<string, string>([
+  ['portInUse', 'remocodeAccountPortInUse'],
+  ['storageUnavailable', 'remocodeAccountStorageUnavailable'],
+  ['networkError', 'remocodeAccountNetworkError'],
+  ['providerError', 'remocodeAccountProviderError'],
+  ['sessionExpired', 'remocodeAccountSessionExpired'],
+  ['logoutPending', 'remocodeAccountLogoutUnconfirmed'],
+  ['logoutFailed', 'remocodeAccountLogoutUnconfirmed'],
+  ['timeout', 'remocodeAccountTimeout'],
+]);
+
+function signedOutState(): RemocodeAccountState {
+  return {
+    state: 'signedOut',
+    displayName: '',
+    email: '',
+    message: '',
+    busy: false,
+  };
+}
+
+export function emptySubscriptionState(): RemocodeSyncState {
+  return {
+    entitlement: 'loading', operation: 'paused', busy: false,
+    signedIn: false, purchaseAvailable: false, managementAvailable: false,
+    vipExpiresAt: null, deletionPending: false, deletionStatus: 'none',
+    errorCode: '', canDelete: false, needsReauth: false,
+    enabled: {bookmarks: false, history: false, agent_history: false},
+    available: {bookmarks: false, history: false, agent_history: false},
+    lastSuccess: 0,
+  };
+}
+
+export function hasActiveSubscription(
+    account: RemocodeAccountState, subscription: RemocodeSyncState,
+    now: number = Date.now()): boolean {
+  return account.state === 'signedIn' && subscription.signedIn &&
+      subscription.entitlement === 'active' &&
+      (subscription.vipExpiresAt === null ||
+       (Number.isFinite(subscription.vipExpiresAt) &&
+        subscription.vipExpiresAt > now));
+}
+
+export class SettingsRemocodeAccountCardElement extends
+    WebUiListenerMixin(PolymerElement) {
+  static get is() {
+    return 'settings-remocode-account-card';
+  }
+
+  static get template() {
+    return getTemplate();
+  }
+
+  static get properties() {
+    return {
+      subscription_: {type: Object, value: emptySubscriptionState},
+      subscriptionActionPending_: {type: Boolean, value: false},
+      cloudTogglePending_: {type: Boolean, value: false},
+      commandError_: {type: Boolean, value: false},
+      avatarFailed_: {type: Boolean, value: false},
+      account_: {
+        type: Object,
+        value: signedOutState,
+      },
+      loading_: {
+        type: Boolean,
+        value: true,
+      },
+      actionPending_: {
+        type: Boolean,
+        value: false,
+      },
+    };
+  }
+
+  declare private subscription_: RemocodeSyncState;
+  declare private subscriptionActionPending_: boolean;
+  declare private cloudTogglePending_: boolean;
+  declare private commandError_: boolean;
+  declare private avatarFailed_: boolean;
+  declare private account_: RemocodeAccountState;
+  declare private loading_: boolean;
+  declare private actionPending_: boolean;
+
+  private proxy_ = RemocodeAccountBrowserProxyImpl.getInstance();
+  private syncProxy_ = RemocodeSyncBrowserProxyImpl.getInstance();
+  private subscriptionVersion_: number = 0;
+  private subscriptionRequest_: number = 0;
+  private stateVersion_: number = 0;
+  private connectionVersion_: number = 0;
+  private actionTimer_: number|undefined;
+  private lastAutomaticRefresh_: number = 0;
+
+  override connectedCallback() {
+    super.connectedCallback();
+    ++this.connectionVersion_;
+    this.cloudTogglePending_ = false;
+    this.addWebUiListener(
+        'remocode-account-changed', (account: RemocodeAccountState) => {
+          ++this.stateVersion_;
+          this.updateState_(account);
+        });
+    this.addWebUiListener('remocode-sync-changed', (state: RemocodeSyncState) => {
+      ++this.subscriptionVersion_;
+      this.updateSubscription_(state);
+    });
+    this.refreshState_();
+  }
+
+  override disconnectedCallback() {
+    super.disconnectedCallback();
+    ++this.connectionVersion_;
+    ++this.subscriptionRequest_;
+    this.clearActionTimer_();
+  }
+
+  private refreshState_() {
+    const stateVersion = this.stateVersion_;
+    const connectionVersion = this.connectionVersion_;
+    this.loading_ = true;
+    this.proxy_.getState().then(account => {
+      // A listener update is newer than an in-flight initial snapshot.
+      if (this.isConnected &&
+          connectionVersion === this.connectionVersion_ &&
+          stateVersion === this.stateVersion_) {
+        this.updateState_(account);
+      }
+    }).catch(() => {
+      if (this.isConnected &&
+          connectionVersion === this.connectionVersion_ &&
+          stateVersion === this.stateVersion_) {
+        this.updateState_({...signedOutState(), state: 'error'});
+      }
+    });
+  }
+
+  private updateState_(account: RemocodeAccountState) {
+    this.clearActionTimer_();
+    this.loading_ = false;
+    this.actionPending_ = false;
+    // Do not copy arbitrary native fields (especially credentials) into Polymer.
+    if (!account ||
+        !Object.prototype.hasOwnProperty.call(STATUS_STRINGS, account.state)) {
+      this.account_ = {...signedOutState(), state: 'error'};
+      ++this.subscriptionRequest_;
+      this.subscription_ = emptySubscriptionState();
+      return;
+    }
+    const identityChanged = this.account_.state !== account.state ||
+        this.account_.email !== account.email;
+    const avatarDataUrl = typeof account.avatarDataUrl === 'string' &&
+            account.avatarDataUrl.startsWith('data:image/png;base64,') ?
+        account.avatarDataUrl : '';
+    if (avatarDataUrl !== this.account_.avatarDataUrl) this.avatarFailed_ = false;
+    this.account_ = {
+      avatarDataUrl: account.state === 'signedIn' ? avatarDataUrl : '',
+      state: account.state,
+      displayName: typeof account.displayName === 'string' ?
+          account.displayName : '',
+      email: typeof account.email === 'string' ? account.email : '',
+      message: typeof account.message === 'string' ? account.message : '',
+      busy: account.busy === true,
+      canAddProfile: account.canAddProfile === true,
+      providerRevoked: typeof account.providerRevoked === 'boolean' ?
+          account.providerRevoked : undefined,
+    };
+    if (identityChanged || account.state !== 'signedIn') {
+      ++this.subscriptionRequest_;
+      this.subscription_ = emptySubscriptionState();
+      this.commandError_ = false;
+      this.subscriptionActionPending_ = false;
+      this.cloudTogglePending_ = false;
+      if (account.state === 'signedIn') void this.readSubscription_();
+    }
+  }
+
+  private updateSubscription_(state: RemocodeSyncState) {
+    if (this.account_.state !== 'signedIn' || !state?.signedIn) {
+      this.subscription_ = emptySubscriptionState();
+      return;
+    }
+    const known = ['loading', 'signedOut', 'free', 'active', 'error', 'unavailable'];
+    if (!known.includes(state.entitlement)) {
+      this.subscription_ = {...emptySubscriptionState(), entitlement: 'error'};
+      return;
+    }
+    this.subscription_ = state;
+  }
+
+  private async readSubscription_(refresh: boolean = false, automatic: boolean = false) {
+    const request = ++this.subscriptionRequest_;
+    const revision = this.subscriptionVersion_;
+    const connection = this.connectionVersion_;
+    try {
+      const state = await (automatic ? this.syncProxy_.refreshIfStale() :
+          refresh ? this.syncProxy_.refresh() : this.syncProxy_.getState());
+      if (this.isConnected && request === this.subscriptionRequest_ &&
+          connection === this.connectionVersion_ &&
+          revision === this.subscriptionVersion_) {
+        this.updateSubscription_(state);
+      }
+    } catch {
+      if (this.isConnected && request === this.subscriptionRequest_ &&
+          connection === this.connectionVersion_ &&
+          revision === this.subscriptionVersion_) {
+        this.subscription_ = {...emptySubscriptionState(), entitlement: 'error'};
+        this.commandError_ = true;
+      }
+    }
+  }
+
+  private isSignedIn_(state: RemocodeAccountStatus): boolean {
+    return state === 'signedIn';
+  }
+
+  private cloudEnabled_(account: RemocodeAccountState, state: RemocodeSyncState): boolean {
+    return this.isPro_(account, state) &&
+        ((state.available.bookmarks && state.enabled.bookmarks) ||
+         (state.available.history && state.enabled.history));
+  }
+
+  private isPro_(account: RemocodeAccountState, state: RemocodeSyncState): boolean {
+    return hasActiveSubscription(account, state);
+  }
+
+  private hasAvatar_(account: RemocodeAccountState, failed: boolean): boolean {
+    return account.state === 'signedIn' && !!account.avatarDataUrl && !failed;
+  }
+
+  private initials_(account: RemocodeAccountState): string {
+    if (account.state !== 'signedIn') return 'R';
+    const name = (account.displayName || account.email.split('@')[0] || 'R').trim();
+    const words = name.split(/\s+/);
+    return (words.length > 1 ?
+        words.slice(0, 2).map(word => Array.from(word)[0]).join('') :
+        Array.from(name).slice(0, 2).join('')).toLocaleUpperCase();
+  }
+
+  private onAvatarError_() { this.avatarFailed_ = true; }
+
+  private subscriptionLabel_(account: RemocodeAccountState,
+                             state: RemocodeSyncState): string {
+    if (account.state !== 'signedIn') return this.text_('SignInHint');
+    if (this.isPro_(account, state)) return this.text_('Subscribed');
+    if (state.entitlement === 'free' || state.entitlement === 'active') {
+      return this.text_('FreePlan');
+    }
+    if (state.entitlement === 'loading') {
+      return loadTimeData.getString('remocodeAccountLoading');
+    }
+    return this.text_('Unavailable');
+  }
+
+  private subscriptionDescription_(account: RemocodeAccountState,
+                                   state: RemocodeSyncState): string {
+    if (account.state !== 'signedIn') return this.text_('SignInHint');
+    if (this.isPro_(account, state)) {
+      return state.vipExpiresAt === null ? this.text_('Active') :
+          `${this.text_('Expires')} ${new Date(state.vipExpiresAt).toLocaleDateString(
+              document.documentElement.lang || navigator.language)}`;
+    }
+    if (state.entitlement === 'free' || state.entitlement === 'active') {
+      return this.text_('UpgradeHint');
+    }
+    return state.entitlement === 'loading' ?
+        loadTimeData.getString('remocodeAccountLoading') : this.text_('RequestFailed');
+  }
+
+  private cloudStatus_(account: RemocodeAccountState,
+                       state: RemocodeSyncState): string {
+    if (account.state !== 'signedIn') return this.text_('SignInHint');
+    if (state.entitlement === 'error' || state.entitlement === 'unavailable') {
+      return this.text_('Unavailable');
+    }
+    if (state.entitlement === 'loading') {
+      return loadTimeData.getString('remocodeAccountLoading');
+    }
+    if (!this.isPro_(account, state)) return this.text_('ProOnly');
+    if (!state.available.bookmarks && !state.available.history) {
+      return this.text_('Unavailable');
+    }
+    return this.text_(this.cloudEnabled_(account, state) ?
+        'Enabled' : 'NotEnabled');
+  }
+
+  private text_(suffix: string): string {
+    return loadTimeData.getString(`remocodeOverview${suffix}`);
+  }
+
+  private subscriptionDisabled_(account: RemocodeAccountState,
+                                state: RemocodeSyncState, pending: boolean): boolean {
+    return account.state !== 'signedIn' || state.busy || pending;
+  }
+
+  private onRefreshAccount_() {
+    if (this.account_.state === 'signedIn' || this.account_.state === 'error' ||
+        this.account_.state === 'reauthRequired') {
+      this.runAction_(() => this.proxy_.retry());
+    } else {
+      this.refreshState_();
+    }
+    if (this.account_.state === 'signedIn') void this.onRefreshSubscription_();
+  }
+
+  private async onRefreshSubscription_() {
+    if (this.subscriptionDisabled_(this.account_, this.subscription_,
+                                   this.subscriptionActionPending_)) return;
+    this.commandError_ = false;
+    await this.readSubscription_(true);
+  }
+
+  private async onSubscriptionAction_() {
+    if (this.subscriptionDisabled_(this.account_, this.subscription_,
+                                   this.subscriptionActionPending_)) return;
+    this.subscriptionActionPending_ = true;
+    this.commandError_ = false;
+    const connection = this.connectionVersion_;
+    const email = this.account_.email;
+    try {
+      const available = this.shouldManageSubscription_(this.subscription_) ?
+          await this.syncProxy_.manage() : this.subscription_.purchaseAvailable ?
+          await this.syncProxy_.purchase() : false;
+      if (this.isConnected && connection === this.connectionVersion_ &&
+          email === this.account_.email && this.account_.state === 'signedIn' &&
+          !available) this.commandError_ = true;
+    } catch {
+      if (this.isConnected && connection === this.connectionVersion_ &&
+          email === this.account_.email && this.account_.state === 'signedIn') {
+        this.commandError_ = true;
+      }
+    } finally {
+      if (connection === this.connectionVersion_ && email === this.account_.email) {
+        this.subscriptionActionPending_ = false;
+      }
+    }
+  }
+
+  private showSubscriptionAction_(account: RemocodeAccountState,
+                                  state: RemocodeSyncState): boolean {
+    return account.state === 'signedIn' &&
+        (state.managementAvailable || state.purchaseAvailable);
+  }
+
+  private subscriptionActionLabel_(state: RemocodeSyncState): string {
+    return this.text_(this.shouldManageSubscription_(state) ? 'ManageSubscription' : 'Upgrade');
+  }
+
+  private shouldManageSubscription_(state: RemocodeSyncState): boolean {
+    return state.managementAvailable &&
+        (hasActiveSubscription(this.account_, state) || !state.purchaseAvailable);
+  }
+
+  private onAddProfile_() {
+    if (!this.loading_ && this.account_.canAddProfile === true) {
+      this.proxy_.addProfile();
+    }
+  }
+
+  refreshSubscription(): Promise<void> {
+    const now = Date.now();
+    if (now - this.lastAutomaticRefresh_ < 1000) return Promise.resolve();
+    this.lastAutomaticRefresh_ = now;
+    return this.readSubscription_(false, true);
+  }
+
+  private cloudSelected_(state: RemocodeSyncState): boolean {
+    return state.enabled.bookmarks || state.enabled.history;
+  }
+
+  private cloudToggleDisabled_(account: RemocodeAccountState,
+                               state: RemocodeSyncState, pending: boolean): boolean {
+    return pending || account.state !== 'signedIn' || !state.signedIn ||
+        state.deletionPending || (!this.cloudSelected_(state) &&
+        (state.busy || !this.isPro_(account, state) ||
+         (!state.available.bookmarks && !state.available.history)));
+  }
+
+  private async onCloudToggle_(event: Event) {
+    const toggle = event.target as CrToggleElement;
+    const enabled = toggle.checked;
+    toggle.checked = this.cloudSelected_(this.subscription_);
+    if (this.cloudToggleDisabled_(this.account_, this.subscription_,
+                                  this.cloudTogglePending_)) return;
+    const next = {
+      ...this.subscription_.enabled,
+      bookmarks: enabled && this.subscription_.available.bookmarks,
+      history: enabled && this.subscription_.available.history,
+    };
+    await this.setSyncEnabled_(next);
+  }
+
+  private syncCategoryDisabled_(account: RemocodeAccountState,
+                                state: RemocodeSyncState, available: boolean,
+                                enabled: boolean, pending: boolean): boolean {
+    return pending || account.state !== 'signedIn' || !state.signedIn ||
+        state.deletionPending || (!enabled &&
+        (state.busy || !this.isPro_(account, state) || !available));
+  }
+
+  private async onSyncCategoryToggle_(event: Event) {
+    const toggle = event.target as CrToggleElement;
+    const stream = toggle.dataset['stream'] as SyncStream;
+    if (!['bookmarks', 'history', 'agent_history'].includes(stream)) return;
+    const enabled = toggle.checked;
+    toggle.checked = this.subscription_.enabled[stream];
+    if (this.syncCategoryDisabled_(this.account_, this.subscription_,
+        this.subscription_.available[stream], this.subscription_.enabled[stream],
+        this.cloudTogglePending_)) return;
+    await this.setSyncEnabled_({...this.subscription_.enabled, [stream]: enabled});
+  }
+
+  private async setSyncEnabled_(enabled: SyncEnabled) {
+    const connection = this.connectionVersion_;
+    const email = this.account_.email;
+    this.cloudTogglePending_ = true;
+    this.commandError_ = false;
+    try {
+      const accepted = await this.syncProxy_.setEnabled(enabled);
+      if (this.isConnected && connection === this.connectionVersion_ &&
+          email === this.account_.email) {
+        if (!accepted) this.commandError_ = true;
+        await this.readSubscription_();
+      }
+    } catch {
+      if (this.isConnected && connection === this.connectionVersion_ &&
+          email === this.account_.email) this.commandError_ = true;
+    } finally {
+      if (connection === this.connectionVersion_ && email === this.account_.email) {
+        this.cloudTogglePending_ = false;
+      }
+    }
+  }
+
+  private getEntryLabel_(account: RemocodeAccountState, loading: boolean): string {
+    if (loading) {
+      return loadTimeData.getString('remocodeAccountLoading');
+    }
+    if (account.state === 'signedIn') {
+      return account.displayName || account.email;
+    }
+    if (account.state === 'authorizing') {
+      return loadTimeData.getString('remocodeAccountCancel');
+    }
+    if (account.state === 'reauthRequired') {
+      return loadTimeData.getString('remocodeAccountReauth');
+    }
+    return loadTimeData.getString('remocodeAccountLogin');
+  }
+
+  private getEntrySublabel_(account: RemocodeAccountState): string {
+    if (account.state === 'signedIn') {
+      return account.email;
+    }
+    if (account.state === 'authorizing') {
+      return loadTimeData.getString('remocodeAccountAuthorizing');
+    }
+    return this.getMessage_(account);
+  }
+
+  private isEntryDisabled_(loading: boolean, pending: boolean,
+                           account: RemocodeAccountState): boolean {
+    return loading || pending ||
+        (account.busy && account.state !== 'authorizing');
+  }
+
+  private onAccountEntryClick_() {
+    if (this.account_.state === 'signedIn') {
+      this.onManageClick_();
+    } else if (this.account_.state === 'authorizing') {
+      this.onCancelClick_();
+    } else {
+      this.onLoginClick_();
+    }
+  }
+
+  private onEntryLogoutClick_(event: Event) {
+    event.stopPropagation();
+    this.onLogoutClick_();
+  }
+
+  private getMessage_(account: RemocodeAccountState): string {
+    if (account.state === 'signedOut' && account.providerRevoked === false) {
+      return loadTimeData.getString('remocodeAccountLogoutUnconfirmed');
+    }
+    const key = MESSAGE_STRINGS.get(account.message);
+    if (key) {
+      return loadTimeData.getString(key);
+    }
+    // Never render an unknown provider message, URL, or server response.
+    return account.message || account.state === 'error' ?
+        loadTimeData.getString('remocodeAccountErrorDetail') : '';
+  }
+
+  private hasAccount_(state: RemocodeAccountStatus): boolean {
+    return state === 'signedIn' || state === 'reauthRequired';
+  }
+
+  private canSignOut_(state: RemocodeAccountStatus): boolean {
+    // An error may leave encrypted local credentials that can still be cleared.
+    return this.hasAccount_(state) || state === 'error';
+  }
+
+  private isCancelDisabled_(loading: boolean, pending: boolean): boolean {
+    // Authorization is busy by definition, but must remain cancellable.
+    return loading || pending;
+  }
+
+  private clearActionTimer_() {
+    if (this.actionTimer_ !== undefined) {
+      window.clearTimeout(this.actionTimer_);
+      this.actionTimer_ = undefined;
+    }
+  }
+
+  private runAction_(action: () => void, allowBusy: boolean = false) {
+    if (this.loading_ || this.actionPending_ ||
+        (!allowBusy && this.account_.busy &&
+         this.account_.state !== 'authorizing')) {
+      return;
+    }
+    this.actionPending_ = true;
+    // Recover from a missing event without assuming login/logout succeeded.
+    this.actionTimer_ = window.setTimeout(() => this.refreshState_(), 30000);
+    try {
+      action();
+    } catch {
+      this.updateState_({...signedOutState(), state: 'error'});
+    }
+  }
+
+  private onLoginClick_() {
+    if (this.account_.state === 'signedOut' ||
+        this.account_.state === 'reauthRequired' ||
+        this.account_.state === 'error') {
+      this.runAction_(() => this.proxy_.login());
+    }
+  }
+
+  private onCancelClick_() {
+    if (this.account_.state === 'authorizing') {
+      this.runAction_(() => this.proxy_.cancel());
+    }
+  }
+
+  private onLogoutClick_() {
+    if (this.canSignOut_(this.account_.state)) {
+      this.runAction_(() => this.proxy_.logout(), true);
+    }
+  }
+
+  private onManageClick_() {
+    if (this.account_.state === 'signedIn') {
+      this.runAction_(() => this.proxy_.manage());
+    }
+  }
+
+}
+
+customElements.define(
+    SettingsRemocodeAccountCardElement.is, SettingsRemocodeAccountCardElement);
+
+declare global {
+  interface HTMLElementTagNameMap {
+    'settings-remocode-account-card': SettingsRemocodeAccountCardElement;
+  }
+}

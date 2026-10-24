diff --git a/chrome/browser/resources/settings/people_page/remocode_account_card.ts b/chrome/browser/resources/settings/people_page/remocode_account_card.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_account_card.ts
@@ -0,0 +1,272 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+import 'chrome://resources/cr_elements/cr_button/cr_button.js';
+import 'chrome://resources/cr_elements/cr_link_row/cr_link_row.js';
+import 'chrome://resources/cr_elements/cr_shared_style.css.js';
+import '../settings_shared.css.js';
+
+import {WebUiListenerMixin} from 'chrome://resources/cr_elements/web_ui_listener_mixin.js';
+import {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';
+
+import {loadTimeData} from '../i18n_setup.js';
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
+  declare private account_: RemocodeAccountState;
+  declare private loading_: boolean;
+  declare private actionPending_: boolean;
+
+  private proxy_ = RemocodeAccountBrowserProxyImpl.getInstance();
+  private stateVersion_: number = 0;
+  private connectionVersion_: number = 0;
+  private actionTimer_: number|undefined;
+
+  override connectedCallback() {
+    super.connectedCallback();
+    ++this.connectionVersion_;
+    this.addWebUiListener(
+        'remocode-account-changed', (account: RemocodeAccountState) => {
+          ++this.stateVersion_;
+          this.updateState_(account);
+        });
+    this.refreshState_();
+  }
+
+  override disconnectedCallback() {
+    super.disconnectedCallback();
+    ++this.connectionVersion_;
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
+      return;
+    }
+    this.account_ = {
+      state: account.state,
+      displayName: typeof account.displayName === 'string' ?
+          account.displayName : '',
+      email: typeof account.email === 'string' ? account.email : '',
+      message: typeof account.message === 'string' ? account.message : '',
+      busy: account.busy === true,
+      providerRevoked: typeof account.providerRevoked === 'boolean' ?
+          account.providerRevoked : undefined,
+    };
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

diff --git a/chrome/browser/resources/settings/people_page/remocode_account_browser_proxy.ts b/chrome/browser/resources/settings/people_page/remocode_account_browser_proxy.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_account_browser_proxy.ts
@@ -0,0 +1,75 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+import {sendWithPromise} from 'chrome://resources/js/cr.js';
+
+export type RemocodeAccountStatus =
+    'signedOut'|'authorizing'|'signedIn'|'reauthRequired'|'error';
+
+// This snapshot contains presentation data only. Credentials stay in native code.
+export interface RemocodeAccountState {
+  state: RemocodeAccountStatus;
+  displayName: string;
+  email: string;
+  // Encoded from a verified, decoded native bitmap; never a remote URL.
+  avatarDataUrl?: string;
+  // A stable error/status code, never a raw provider response.
+  message: string;
+  busy: boolean;
+  // Native local-profile policy; independent of cloud sign-in.
+  canAddProfile?: boolean;
+  // Optional for compatibility; logoutPending/logoutFailed also signal this.
+  providerRevoked?: boolean;
+}
+
+export interface RemocodeAccountBrowserProxy {
+  getState(): Promise<RemocodeAccountState>;
+  login(): void;
+  cancel(): void;
+  logout(): void;
+  manage(): void;
+  retry(): void;
+  addProfile(): void;
+}
+
+export class RemocodeAccountBrowserProxyImpl implements
+    RemocodeAccountBrowserProxy {
+  getState(): Promise<RemocodeAccountState> {
+    return sendWithPromise('remocodeAccountGetState');
+  }
+
+  login(): void {
+    chrome.send('remocodeAccountLogin');
+  }
+
+  cancel(): void {
+    chrome.send('remocodeAccountCancel');
+  }
+
+  logout(): void {
+    chrome.send('remocodeAccountLogout');
+  }
+
+  manage(): void {
+    chrome.send('remocodeAccountManage');
+  }
+
+  retry(): void {
+    chrome.send('remocodeAccountRetry');
+  }
+
+  addProfile(): void {
+    chrome.send('remocodeAccountAddProfile');
+  }
+
+  static getInstance(): RemocodeAccountBrowserProxy {
+    return instance || (instance = new RemocodeAccountBrowserProxyImpl());
+  }
+
+  static setInstance(obj: RemocodeAccountBrowserProxy): void {
+    instance = obj;
+  }
+}
+
+let instance: RemocodeAccountBrowserProxy|null = null;

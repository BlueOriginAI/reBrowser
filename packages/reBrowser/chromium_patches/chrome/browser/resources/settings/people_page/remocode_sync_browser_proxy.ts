diff --git a/chrome/browser/resources/settings/people_page/remocode_sync_browser_proxy.ts b/chrome/browser/resources/settings/people_page/remocode_sync_browser_proxy.ts
new file mode 100644
--- /dev/null
+++ b/chrome/browser/resources/settings/people_page/remocode_sync_browser_proxy.ts
@@ -0,0 +1,47 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+import {sendWithPromise} from 'chrome://resources/js/cr.js';
+export type SyncStream = 'bookmarks'|'history'|'agent_history';
+export type SyncEnabled = Record<SyncStream, boolean>;
+export interface RemocodeSyncState {
+  entitlement: 'loading'|'signedOut'|'free'|'active'|'error'|'unavailable';
+  operation: 'paused'|'pending'|'failed'|'conflict'|'success'|'deleteFailed'|'deletePending'|'reauthRequired';
+  busy: boolean;
+  signedIn: boolean;
+  purchaseAvailable: boolean;
+  managementAvailable: boolean;
+  vipExpiresAt: number|null;
+  deletionPending: boolean;
+  deletionStatus: 'none'|'pending'|'completed'|'failed';
+  errorCode: string;
+  canDelete: boolean;
+  needsReauth: boolean;
+  enabled: SyncEnabled;
+  available: SyncEnabled;
+  lastSuccess: number;
+}
+export interface RemocodeSyncBrowserProxy {
+  getState(): Promise<RemocodeSyncState>;
+  refresh(): Promise<RemocodeSyncState>;
+  refreshIfStale(): Promise<RemocodeSyncState>;
+  purchase(): Promise<boolean>;
+  manage(): Promise<boolean>;
+  setEnabled(enabled: SyncEnabled): Promise<boolean>;
+  prepareDelete(): Promise<string>;
+  deleteCloud(nonce: string): Promise<boolean>;
+}
+export class RemocodeSyncBrowserProxyImpl implements RemocodeSyncBrowserProxy {
+  getState(): Promise<RemocodeSyncState> { return sendWithPromise('remocodeSyncGetState'); }
+  refresh(): Promise<RemocodeSyncState> { return sendWithPromise('remocodeSyncRefresh'); }
+  refreshIfStale(): Promise<RemocodeSyncState> { return sendWithPromise('remocodeSyncRefreshIfStale'); }
+  purchase(): Promise<boolean> { return sendWithPromise('remocodeSyncPurchase'); }
+  manage(): Promise<boolean> { return sendWithPromise('remocodeSyncManage'); }
+  setEnabled(enabled: SyncEnabled): Promise<boolean> { return sendWithPromise('remocodeSyncSetEnabled', enabled); }
+  prepareDelete(): Promise<string> { return sendWithPromise('remocodeSyncPrepareDelete'); }
+  deleteCloud(nonce: string): Promise<boolean> { return sendWithPromise('remocodeSyncDelete', nonce); }
+  static getInstance(): RemocodeSyncBrowserProxy {
+    return instance || (instance = new RemocodeSyncBrowserProxyImpl());
+  }
+  static setInstance(proxy: RemocodeSyncBrowserProxy): void { instance = proxy; }
+}
+let instance: RemocodeSyncBrowserProxy|null = null;

diff --git a/chrome/browser/browseros/sync/patch_contract_test.py b/chrome/browser/browseros/sync/patch_contract_test.py
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/patch_contract_test.py
@@ -0,0 +1,135 @@
+#!/usr/bin/env python3
+# Copyright 2026 The Chromium Authors
+# Use of this source code is governed by a BSD-style license.
+"""Static packaging/security regressions; not a replacement for native tests.
+
+Run against materialized Chromium sources, or --patch-root <chromium_patches>.
+No compiler, browser, network, credentials, or real browsing data is used.
+"""
+import argparse
+from pathlib import Path
+import re
+import unittest
+
+parser = argparse.ArgumentParser()
+parser.add_argument('--patch-root', type=Path)
+parser.add_argument('--source-root', type=Path)
+options, extra = parser.parse_known_args()
+ROOT = options.patch_root or options.source_root
+if ROOT is None:
+    ROOT = Path(__file__).resolve().parents[4]
+
+def source(path):
+    text = (ROOT / path).read_text()
+    if not options.patch_root:
+        return text
+    if 'new file mode' in text:
+        return ''.join(line[1:] + '\n' for line in text.splitlines()
+                       if line.startswith('+') and not line.startswith('+++'))
+    # For tracked route files these checks intentionally inspect the added side.
+    return '\n'.join(line[1:] for line in text.splitlines()
+                     if line.startswith('+') and not line.startswith('+++'))
+
+ACCOUNT = 'chrome/browser/browseros/account/remocode_account_service.'
+SYNC = 'chrome/browser/browseros/sync/'
+UI = 'chrome/browser/resources/settings/people_page/'
+
+class SyncPatchContractTest(unittest.TestCase):
+    def test_fixed_origin_and_five_native_endpoints(self):
+        text = source(ACCOUNT + 'cc').split('void AccountService::StartNextSyncRequest()')[1]
+        self.assertIn('https://remocode.cc/account/api/desktop/sync', text)
+        self.assertEqual(set(re.findall(r'path = "(/[a-z]+)"', text)),
+                         {'/status', '/enrollment', '/pull', '/push', '/delete'})
+        self.assertIn('CredentialsMode::kOmit', text)
+        self.assertIn('RedirectMode::kError', text)
+        self.assertIn('SetHeader("Origin", "https://remocode.cc")', text)
+    def test_transport_is_private_and_not_a_url_proxy(self):
+        text = source(ACCOUNT + 'h')
+        self.assertLess(text.index('private:'), text.index('AuthenticatedSyncRequest'))
+        self.assertIn('friend class browseros::sync::RemocodeSyncService', text)
+        self.assertNotIn('GURL', text.split('void AuthenticatedSyncRequest')[1].split(';')[0])
+    def test_refresh_reuses_account_flight(self):
+        text = source(ACCOUNT + 'cc').split('void AccountService::StartNextSyncRequest()')[1]
+        self.assertEqual(text.count('Refresh();'), 1)
+        self.assertIn('|| loader_', text)
+        self.assertNotIn('Request::kRefresh', text)
+    def test_logout_cancels_transport_callbacks(self):
+        text = source(ACCOUNT + 'cc')
+        stop = text.split('void AccountService::StopOperations()')[1].split('void AccountService::ClearCredentials')[0]
+        self.assertIn('++generation_', stop)
+        self.assertIn('CancelSyncRequests()', stop)
+        self.assertIn('generation != generation_', text.split('void AccountService::OnSyncResponse')[1])
+    def test_ui_contains_no_bearer_or_entitlement_override(self):
+        text = source(UI + 'remocode_sync_page.ts') + source(UI + 'remocode_sync_browser_proxy.ts')
+        for secret in ['accessToken', 'refreshToken', 'Authorization', 'providerUrl', 'isPaid']:
+            self.assertNotIn(secret, text)
+        self.assertIn("entitlement !== 'active'", text)
+    def test_all_categories_default_off_and_agent_unavailable(self):
+        service = source(SYNC + 'remocode_sync_service.cc')
+        self.assertIn('enabled.Set(stream, false)', service)
+        self.assertIn('available.Set("agent_history", false)', service)
+        page = source(UI + 'remocode_sync_page.ts')
+        self.assertIn('enabled: {bookmarks: false, history: false, agent_history: false}', page)
+    def test_distinct_entitlement_and_operation_states(self):
+        text = source(UI + 'remocode_sync_page.ts')
+        for state in ['loading:', 'signedOut:', 'free:', 'active:', 'error:', 'unavailable:',
+                      'paused:', 'pending:', 'failed:', 'conflict:', 'deletePending:']:
+            self.assertIn(state, text)
+    def test_strict_dto_and_url_whitelist(self):
+        text = source(SYNC + 'sync_protocol.cc')
+        self.assertIn('SchemeIsHTTPOrHTTPS', text)
+        for clear in ['ClearUsername', 'ClearPassword', 'ClearQuery', 'ClearRef']:
+            self.assertIn(clear, text)
+        self.assertIn('inbound && clean != raw', text)
+        fields = set(re.findall(r'out.Set\("([a-zA-Z]+)"', text))
+        self.assertEqual(fields, {'id', 'revision', 'deleted', 'title', 'url', 'parentId',
+                                 'afterId', 'visitedAt', 'agentId', 'sessionId'})
+    def test_history_uses_enable_floor(self):
+        text = source(SYNC + 'remocode_sync_service.cc')
+        self.assertIn('WireNumber(local_state_, "historySince")', text)
+        self.assertIn('ReadHistory(base::Time::FromMillisecondsSinceUnixEpoch(*since)', text)
+        self.assertNotIn('ReadHistory(base::Time()', text)
+    def test_durable_batch_saved_before_send(self):
+        text = source(SYNC + 'remocode_sync_service.cc').split('void RemocodeSyncService::Push()')[1]
+        self.assertLess(text.index('local_state_.Set("pending"'), text.index('SendPending();'))
+        self.assertIn('Save();', text.split('local_state_.Set("pending"')[1].split('SendPending();')[0])
+        self.assertIn('local_state_.FindDict("pending")->Clone()', text)
+    def test_409_pulls_instead_of_blindly_overwriting(self):
+        text = source(SYNC + 'remocode_sync_service.cc')
+        push = text.split('void RemocodeSyncService::OnPush')[1].split('void RemocodeSyncService::OnLocalChanged')[0]
+        self.assertIn('status == 409', push)
+        self.assertIn('ReadLocal(); return;', push)
+        self.assertIn('dirty && !SamePayload(*dirty, *entry)', text)
+    def test_pagination_applies_only_complete_snapshot(self):
+        text = source(SYNC + 'remocode_sync_service.cc').split('void RemocodeSyncService::OnPull')[1].split('void RemocodeSyncService::OnApplied')[0]
+        self.assertLess(text.index('if (!cursor_.empty()) { Pull(); return; }'), text.index('adapters_->ApplyBookmarks'))
+        self.assertIn('pull_revision_ != *revision', text)
+    def test_account_owner_and_callback_epochs(self):
+        text = source(SYNC + 'remocode_sync_service.cc')
+        self.assertIn('if (!EnsureOwner()) return', text)
+        self.assertIn('if (!adapters_->ResetSyncState())', text)
+        invalidation = text.split('void RemocodeSyncService::Invalidate()')[1].split('void RemocodeSyncService::Save()')[0]
+        self.assertIn('operation_factory_.InvalidateWeakPtrs()', invalidation)
+        self.assertNotIn('weak_factory_.InvalidateWeakPtrs()', invalidation)
+    def test_cloud_delete_requires_nonce_and_202_is_pending(self):
+        text = source(SYNC + 'remocode_sync_service.cc')
+        self.assertIn('nonce != deletion_nonce_', text)
+        self.assertIn('base::Time::Now() > deletion_expires_', text)
+        self.assertIn('status == 202', text)
+        self.assertIn('operation_ = "deletePending"', text)
+        self.assertIn('RECENT_AUTHENTICATION_REQUIRED', text)
+    def test_legacy_google_sync_views_are_replaced(self):
+        html = source(UI + 'people_page_index.html')
+        self.assertIn('settings-remocode-sync-page', html)
+        self.assertNotIn('<settings-sync-page', html)
+        self.assertNotIn('<settings-sync-controls-page', html)
+        self.assertIn('Router.getInstance().navigateTo(routes.SYNC)', source(UI + 'people_page_index.ts'))
+    def test_bookmark_batches_are_dependency_closed(self):
+        text = source(SYNC + 'remocode_sync_service.cc')
+        self.assertIn('OrderBookmarkOperations(operations, Known(), 100)', text)
+        protocol = source(SYNC + 'sync_protocol.cc')
+        self.assertIn('satisfied(*parent)', protocol)
+        self.assertIn('known.FindDict(id)', protocol)
+
+if __name__ == '__main__':
+    unittest.main(argv=['patch_contract_test'] + extra)

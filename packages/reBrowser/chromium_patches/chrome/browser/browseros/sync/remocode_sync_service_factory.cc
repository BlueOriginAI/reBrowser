diff --git a/chrome/browser/browseros/sync/remocode_sync_service_factory.cc b/chrome/browser/browseros/sync/remocode_sync_service_factory.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_service_factory.cc
@@ -0,0 +1,37 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/sync/remocode_sync_service_factory.h"
+#include "chrome/browser/browseros/sync/remocode_sync_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "chrome/browser/bookmarks/bookmark_model_factory.h"
+#include "chrome/browser/history/history_service_factory.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/profiles/profile_selections.h"
+namespace browseros::sync {
+RemocodeSyncServiceFactory* RemocodeSyncServiceFactory::GetInstance() {
+  static base::NoDestructor<RemocodeSyncServiceFactory> instance;
+  return instance.get();
+}
+RemocodeSyncService* RemocodeSyncServiceFactory::GetForProfile(Profile* profile) {
+  if (profile->IsOffTheRecord()) return nullptr;
+  return static_cast<RemocodeSyncService*>(GetInstance()->GetServiceForBrowserContext(profile, true));
+}
+RemocodeSyncServiceFactory::RemocodeSyncServiceFactory()
+    : ProfileKeyedServiceFactory("RemocodeSync", ProfileSelections::BuildForRegularProfile()) {
+  DependsOn(remocode::AccountServiceFactory::GetInstance());
+  DependsOn(BookmarkModelFactory::GetInstance());
+  DependsOn(HistoryServiceFactory::GetInstance());
+}
+RemocodeSyncServiceFactory::~RemocodeSyncServiceFactory() = default;
+std::unique_ptr<KeyedService> RemocodeSyncServiceFactory::BuildServiceInstanceForBrowserContext(
+    content::BrowserContext* context) const {
+  auto* profile = Profile::FromBrowserContext(context);
+  return std::make_unique<RemocodeSyncService>(profile,
+      remocode::AccountServiceFactory::GetForProfile(profile));
+}
+void RemocodeSyncServiceFactory::RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
+  RemocodeSyncService::RegisterProfilePrefs(registry);
+}
+bool RemocodeSyncServiceFactory::ServiceIsCreatedWithBrowserContext() const { return true; }
+bool RemocodeSyncServiceFactory::ServiceIsNULLWhileTesting() const { return true; }
+}  // namespace browseros::sync

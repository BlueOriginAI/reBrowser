diff --git a/chrome/browser/browseros/account/remocode_account_service_factory.cc b/chrome/browser/browseros/account/remocode_account_service_factory.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service_factory.cc
@@ -0,0 +1,43 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/profiles/profile_selections.h"
+#include "components/pref_registry/pref_registry_syncable.h"
+#include "content/public/browser/storage_partition.h"
+
+namespace remocode {
+AccountServiceFactory* AccountServiceFactory::GetInstance() {
+  static base::NoDestructor<AccountServiceFactory> instance;
+  return instance.get();
+}
+AccountService* AccountServiceFactory::GetForProfile(Profile* profile) {
+  // Explicit defense in depth: never redirect OTR to the original profile.
+  if (profile->IsOffTheRecord()) return nullptr;
+  return static_cast<AccountService*>(
+      GetInstance()->GetServiceForBrowserContext(profile, true));
+}
+AccountServiceFactory::AccountServiceFactory()
+    : ProfileKeyedServiceFactory("RemocodeAccount",
+                                  ProfileSelections::BuildForRegularProfile()) {}
+AccountServiceFactory::~AccountServiceFactory() = default;
+std::unique_ptr<KeyedService>
+AccountServiceFactory::BuildServiceInstanceForBrowserContext(
+    content::BrowserContext* context) const {
+  auto* profile = Profile::FromBrowserContext(context);
+  return std::make_unique<AccountService>(profile,
+      profile->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess(),
+      g_browser_process->os_crypt_async());
+}
+void AccountServiceFactory::RegisterProfilePrefs(
+    user_prefs::PrefRegistrySyncable* registry) {
+  // Deliberately not SYNCABLE_PREF: credentials belong to this installation.
+  registry->RegisterStringPref(kRefreshPref, "");
+}
+bool AccountServiceFactory::ServiceIsCreatedWithBrowserContext() const {
+  return true;
+}
+bool AccountServiceFactory::ServiceIsNULLWhileTesting() const { return true; }
+}  // namespace remocode

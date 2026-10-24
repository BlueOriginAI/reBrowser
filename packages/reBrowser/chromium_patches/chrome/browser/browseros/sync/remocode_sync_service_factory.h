diff --git a/chrome/browser/browseros/sync/remocode_sync_service_factory.h b/chrome/browser/browseros/sync/remocode_sync_service_factory.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/remocode_sync_service_factory.h
@@ -0,0 +1,24 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_SYNC_REMOCODE_SYNC_SERVICE_FACTORY_H_
+#define CHROME_BROWSER_BROWSEROS_SYNC_REMOCODE_SYNC_SERVICE_FACTORY_H_
+#include "base/no_destructor.h"
+#include "chrome/browser/profiles/profile_keyed_service_factory.h"
+class Profile;
+namespace browseros::sync {
+class RemocodeSyncService;
+class RemocodeSyncServiceFactory : public ProfileKeyedServiceFactory {
+ public:
+  static RemocodeSyncServiceFactory* GetInstance();
+  static RemocodeSyncService* GetForProfile(Profile* profile);
+ private:
+  friend base::NoDestructor<RemocodeSyncServiceFactory>;
+  RemocodeSyncServiceFactory();
+  ~RemocodeSyncServiceFactory() override;
+  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(content::BrowserContext* context) const override;
+  void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) override;
+  bool ServiceIsCreatedWithBrowserContext() const override;
+  bool ServiceIsNULLWhileTesting() const override;
+};
+}  // namespace browseros::sync
+#endif

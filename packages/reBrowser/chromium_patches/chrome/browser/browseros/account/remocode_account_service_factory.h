diff --git a/chrome/browser/browseros/account/remocode_account_service_factory.h b/chrome/browser/browseros/account/remocode_account_service_factory.h
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service_factory.h
@@ -0,0 +1,25 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#ifndef CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_FACTORY_H_
+#define CHROME_BROWSER_BROWSEROS_ACCOUNT_REMOCODE_ACCOUNT_SERVICE_FACTORY_H_
+#include "base/no_destructor.h"
+#include "chrome/browser/profiles/profile_keyed_service_factory.h"
+class Profile;
+namespace remocode {
+class AccountService;
+class AccountServiceFactory : public ProfileKeyedServiceFactory {
+ public:
+  static AccountServiceFactory* GetInstance();
+  static AccountService* GetForProfile(Profile* profile);
+ private:
+  friend class base::NoDestructor<AccountServiceFactory>;
+  AccountServiceFactory();
+  ~AccountServiceFactory() override;
+  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
+      content::BrowserContext* context) const override;
+  void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) override;
+  bool ServiceIsCreatedWithBrowserContext() const override;
+  bool ServiceIsNULLWhileTesting() const override;
+};
+}  // namespace remocode
+#endif

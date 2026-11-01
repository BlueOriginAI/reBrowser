diff --git a/chrome/browser/browseros/account/remocode_account_service_unittest.cc b/chrome/browser/browseros/account/remocode_account_service_unittest.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service_unittest.cc
@@ -0,0 +1,489 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+#include "chrome/browser/browseros/account/remocode_account_service_factory.h"
+#include "base/base64.h"
+#include "base/check.h"
+#include "base/functional/bind.h"
+#include "base/json/json_reader.h"
+#include "base/json/json_writer.h"
+#include "chrome/test/base/testing_profile.h"
+#include "chrome/common/pref_names.h"
+#include "components/os_crypt/async/browser/test_utils.h"
+#include "components/prefs/pref_service.h"
+#include "content/public/test/browser_task_environment.h"
+#include "services/network/public/cpp/weak_wrapper_shared_url_loader_factory.h"
+#include "services/network/test/test_url_loader_factory.h"
+#include "services/network/test/test_utils.h"
+#include "testing/gtest/include/gtest/gtest.h"
+#include "third_party/skia/include/core/SkBitmap.h"
+
+namespace remocode {
+namespace {
+constexpr char kServerVerifier[] = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
+constexpr char kTokens[] = R"({"accessToken":"test-access-secret",
+  "refreshToken":"rotated-refresh-secret","expiresIn":3600,
+  "account":{"displayName":"Test User","email":"test@example.invalid"},
+  "installationId":"installation-1"})";
+constexpr char kMe[] = R"({"account":{"displayName":"Verified User",
+  "email":"verified@example.invalid"},"installationId":"installation-1"})";
+}
+class AccountServiceTest : public testing::Test {
+ protected:
+  void SetUp() override {
+    AccountServiceFactory::GetInstance();
+    profile_ = TestingProfile::Builder().Build();
+    crypto_ = os_crypt_async::GetTestOSCryptAsyncForTesting(true);
+    crypto_->GetInstance(base::BindOnce(
+        [](scoped_refptr<os_crypt_async::Encryptor>* out,
+           scoped_refptr<os_crypt_async::Encryptor> value) {
+          *out = std::move(value);
+        }, &encryptor_));
+    ASSERT_TRUE(encryptor_);
+  }
+  void TearDown() override {
+    if (service_) service_->Shutdown();
+    service_.reset();
+    task_environment_.RunUntilIdle();
+  }
+  void Seed() {
+    base::DictValue envelope;
+    envelope.Set("profile", profile_->GetPath().AsUTF8Unsafe());
+    envelope.Set("refreshToken", "original-refresh-secret");
+    envelope.Set("installationId", "installation-1");
+    std::string encrypted;
+    ASSERT_TRUE(encryptor_->EncryptString(*base::WriteJson(envelope), &encrypted));
+    profile_->GetPrefs()->SetString(kRefreshPref, base::Base64Encode(encrypted));
+  }
+  void Start() {
+    service_ = std::make_unique<AccountService>(profile_.get(),
+        network_.GetSafeWeakWrapper(), crypto_.get());
+    task_environment_.RunUntilIdle();
+  }
+  void Reply(const char* path, const char* body,
+             net::HttpStatusCode status = net::HTTP_OK) {
+    ASSERT_TRUE(network_.SimulateResponseForPendingRequest(
+        std::string(kBrokerUrl) + path, body, status));
+    task_environment_.RunUntilIdle();
+  }
+  std::string State() { return *service_->GetState().FindString("state"); }
+  void SignIn() {
+    Seed();
+    Start();
+    Reply("/refresh", kTokens);
+    Reply("/me", kMe);
+    ASSERT_EQ(State(), "signedIn");
+  }
+  void SignInWithAvatar(const std::string& url) {
+    Seed();
+    Start();
+    Reply("/refresh", kTokens);
+    base::DictValue account;
+    account.Set("displayName", "Verified User");
+    account.Set("email", "verified@example.invalid");
+    account.Set("imageUrl", url);
+    base::DictValue response;
+    response.Set("account", std::move(account));
+    response.Set("installationId", "installation-1");
+    const std::string json = *base::WriteJson(response);
+    Reply("/me", json.c_str());
+    ASSERT_EQ(State(), "signedIn");
+  }
+  bool AcceptAccount(const base::DictValue& response) {
+    return service_->AcceptAccount(response);
+  }
+  uint64_t AvatarGeneration() { return service_->avatar_generation_; }
+  void DeliverAvatar(uint64_t generation) {
+    SkBitmap bitmap;
+    bitmap.allocN32Pixels(8, 8);
+    bitmap.eraseColor(SK_ColorRED);
+    service_->OnAvatarDecoded(generation, bitmap);
+  }
+  // Deterministic socket-ready seam: network/crypto/state behavior is real,
+  // but unit tests never contend with another process for production port 48123.
+  void BeginAuthorization() {
+    Start();
+    service_->StopOperations();
+    service_->state_ = "authorizing";
+    service_->oauth_state_ = "test-state";
+    service_->verifier_ = "test-verifier";
+    started_generation_ = service_->generation_;
+    service_->OnListenerReady(started_generation_, base::BindOnce(
+        [](GURL* opened, const GURL& url) { *opened = url; }, &opened_url_), true);
+    task_environment_.RunUntilIdle();
+  }
+  std::string FlowResponse() {
+    base::DictValue response;
+    response.Set("flowId", "test-flow");
+    response.Set("verifier", kServerVerifier);
+    response.Set("authorizationUrl",
+        AuthorizationURL("test-state", kServerVerifier).spec());
+    return *base::WriteJson(response);
+  }
+  base::DictValue PendingBody(size_t index = 0) {
+    auto* request = network_.GetPendingRequest(index);
+    CHECK(request);
+    return base::JSONReader::ReadDict(network::GetUploadData(request->request),
+                                      base::JSON_PARSE_RFC).value();
+  }
+  void DeliverCode() {
+    service_->OnCallback(started_generation_, OAuthCallback{"test-code", false});
+    task_environment_.RunUntilIdle();
+  }
+  void Timeout() { service_->OnTimeout(); }
+  void SyncStatus(base::OnceCallback<void(int, base::DictValue)> callback) {
+    service_->AuthenticatedSyncRequest(AccountService::SyncEndpoint::kStatus,
+                                      base::DictValue(), std::move(callback));
+  }
+  void ExpireAccess() { service_->expiration_ = base::Time::Now(); }
+  uint64_t started_generation_ = 0;
+  GURL opened_url_;
+  content::BrowserTaskEnvironment task_environment_{
+      base::test::TaskEnvironment::TimeSource::MOCK_TIME};
+  network::TestURLLoaderFactory network_;
+  std::unique_ptr<os_crypt_async::OSCryptAsync> crypto_;
+  scoped_refptr<os_crypt_async::Encryptor> encryptor_;
+  std::unique_ptr<TestingProfile> profile_;
+  std::unique_ptr<AccountService> service_;
+};
+TEST_F(AccountServiceTest, AvatarFetchOmitsCredentialsAndLogoutDropsLateImage) {
+  SignInWithAvatar("https://img.clerk.com/account-avatar.png");
+  const auto* pending = network_.GetPendingRequest(0);
+  ASSERT_TRUE(pending);
+  EXPECT_EQ(pending->request.url, GURL("https://img.clerk.com/account-avatar.png"));
+  EXPECT_EQ(pending->request.credentials_mode,
+            network::mojom::CredentialsMode::kOmit);
+  EXPECT_EQ(pending->request.redirect_mode, network::mojom::RedirectMode::kError);
+  EXPECT_FALSE(pending->request.headers.HasHeader("Authorization"));
+  EXPECT_TRUE(pending->request.referrer.empty());
+  const uint64_t generation = AvatarGeneration();
+  DeliverAvatar(generation);
+  EXPECT_FALSE(service_->GetAvatarImage().isNull());
+  service_->Logout();
+  EXPECT_TRUE(service_->GetAvatarImage().isNull());
+  DeliverAvatar(generation);
+  EXPECT_TRUE(service_->GetAvatarImage().isNull());
+}
+TEST_F(AccountServiceTest, UntrustedAvatarNeverFetchesOrBreaksSignIn) {
+  for (const char* url : {"http://img.clerk.com/avatar.png",
+                         "https://img.clerk.com.evil.example/avatar.png",
+                         "https://127.0.0.1/avatar.png",
+                         "https://user:pass@img.clerk.com/avatar.png",
+                         "https://img.clerk.com:444/avatar.png",
+                         "data:image/png;base64,AA=="}) {
+    SignInWithAvatar(url);
+    EXPECT_EQ(network_.NumPending(), 0);
+    EXPECT_TRUE(service_->GetAvatarImage().isNull());
+    service_->Shutdown();
+    service_.reset();
+  }
+}
+TEST_F(AccountServiceTest, NewAvatarRejectsPreviousAccountsDecode) {
+  SignInWithAvatar("https://img.clerk.com/first-avatar.png");
+  const uint64_t old_generation = AvatarGeneration();
+  base::DictValue account;
+  account.Set("displayName", "Verified User");
+  account.Set("email", "verified@example.invalid");
+  account.Set("imageUrl", "https://img.clerk.com/new-avatar.png");
+  base::DictValue response;
+  response.Set("account", std::move(account));
+  response.Set("installationId", "installation-1");
+  ASSERT_TRUE(AcceptAccount(response));
+  DeliverAvatar(old_generation);
+  EXPECT_TRUE(service_->GetAvatarImage().isNull());
+  DeliverAvatar(AvatarGeneration());
+  EXPECT_FALSE(service_->GetAvatarImage().isNull());
+}
+TEST_F(AccountServiceTest, StartMustSucceedBeforeOpeningProviderOrExchangingCode) {
+  BeginAuthorization();
+  EXPECT_EQ(State(), "authorizing");
+  EXPECT_TRUE(opened_url_.is_empty());
+  EXPECT_TRUE(network_.IsPending(std::string(kBrokerUrl) + "/start"));
+  EXPECT_EQ(*PendingBody().FindString("state"), "test-state");
+  EXPECT_EQ(*PendingBody().FindString("challenge"), PKCEChallenge("test-verifier"));
+  EXPECT_FALSE(PendingBody().Find("verifier"));
+  const std::string response = FlowResponse();
+  Reply("/start", response.c_str());
+  EXPECT_EQ(opened_url_, AuthorizationURL("test-state", kServerVerifier));
+  DeliverCode();
+  DeliverCode();  // Replay cannot create a second broker exchange.
+  EXPECT_EQ(network_.total_requests(), 2u);
+  EXPECT_TRUE(network_.IsPending(std::string(kBrokerUrl) + "/exchange"));
+  EXPECT_EQ(*PendingBody().FindString("flowId"), "test-flow");
+  EXPECT_EQ(*PendingBody().FindString("verifier"), kServerVerifier);
+  EXPECT_EQ(*PendingBody().FindString("code"), "test-code");
+  Reply("/exchange", kTokens);
+  Reply("/me", kMe);
+  EXPECT_EQ(State(), "signedIn");
+}
+TEST_F(AccountServiceTest, UntrustedBrokerAuthorizationURLIsNeverOpened) {
+  BeginAuthorization();
+  auto response = base::JSONReader::ReadDict(FlowResponse(), base::JSON_PARSE_RFC);
+  response->Set("authorizationUrl", "https://evil.test/oauth/authorize");
+  Reply("/start", base::WriteJson(*response)->c_str());
+  EXPECT_EQ(State(), "error");
+  EXPECT_TRUE(opened_url_.is_empty());
+  DeliverCode();
+  EXPECT_EQ(network_.total_requests(), 1u);
+}
+TEST_F(AccountServiceTest, BrokerVerifierMustBeValidAndMatchURLChallenge) {
+  BeginAuthorization();
+  auto response = base::JSONReader::ReadDict(FlowResponse(), base::JSON_PARSE_RFC);
+  response->Set("verifier", "too-short");
+  Reply("/start", base::WriteJson(*response)->c_str());
+  EXPECT_EQ(State(), "error");
+  EXPECT_TRUE(opened_url_.is_empty());
+  BeginAuthorization();
+  response = base::JSONReader::ReadDict(FlowResponse(), base::JSON_PARSE_RFC);
+  response->Set("verifier", std::string(43, 'x'));
+  Reply("/start", base::WriteJson(*response)->c_str());
+  EXPECT_EQ(State(), "error");
+  EXPECT_TRUE(opened_url_.is_empty());
+}
+TEST_F(AccountServiceTest, CancelStartDoesNotReportUnissuedGrantRevocationFailure) {
+  BeginAuthorization();
+  service_->Cancel();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_TRUE(service_->GetState().FindString("message")->empty());
+  EXPECT_FALSE(service_->GetState().FindBool("busy").value());
+}
+TEST_F(AccountServiceTest, CancelInvalidatesFlowAndLateCode) {
+  BeginAuthorization();
+  const std::string response = FlowResponse();
+  Reply("/start", response.c_str());
+  service_->Cancel();
+  DeliverCode();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_EQ(network_.total_requests(), 1u);
+  EXPECT_TRUE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+}
+TEST_F(AccountServiceTest, TimeoutInvalidatesFlowAndLateCode) {
+  BeginAuthorization();
+  const std::string response = FlowResponse();
+  Reply("/start", response.c_str());
+  Timeout();
+  DeliverCode();
+  EXPECT_EQ(State(), "error");
+  EXPECT_EQ(*service_->GetState().FindString("message"), "timeout");
+  EXPECT_EQ(network_.total_requests(), 1u);
+}
+TEST_F(AccountServiceTest, CancelDuringMeClearsNewCredentialBeforeRestart) {
+  BeginAuthorization();
+  const std::string response = FlowResponse();
+  Reply("/start", response.c_str());
+  DeliverCode();
+  Reply("/exchange", kTokens);
+  EXPECT_FALSE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+  service_->Cancel();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_TRUE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+  task_environment_.RunUntilIdle();
+  Reply("/logout", "{}", net::HTTP_ACCEPTED);
+  service_->Shutdown();
+  service_.reset();
+  Start();
+  EXPECT_EQ(State(), "signedOut");
+}
+TEST_F(AccountServiceTest, KnownDefaultProfileNameMigratesWithoutChangingDefaultFlag) {
+  profile_->GetPrefs()->SetBoolean(prefs::kProfileUsingDefaultName, true);
+  profile_->GetPrefs()->SetString(prefs::kProfileName, "Your RemocodeBrowser neo");
+  Start();
+  EXPECT_EQ(profile_->GetPrefs()->GetString(prefs::kProfileName), "Your reBrowser");
+  EXPECT_TRUE(profile_->GetPrefs()->GetBoolean(prefs::kProfileUsingDefaultName));
+}
+TEST_F(AccountServiceTest, CustomizedLegacyLookingProfileNameIsNeverOverwritten) {
+  profile_->GetPrefs()->SetBoolean(prefs::kProfileUsingDefaultName, false);
+  profile_->GetPrefs()->SetString(prefs::kProfileName, "Your RemocodeBrowser neo");
+  Start();
+  EXPECT_EQ(profile_->GetPrefs()->GetString(prefs::kProfileName), "Your RemocodeBrowser neo");
+}
+TEST_F(AccountServiceTest, UnrecognizedDefaultProfileNameIsPreserved) {
+  profile_->GetPrefs()->SetBoolean(prefs::kProfileUsingDefaultName, true);
+  profile_->GetPrefs()->SetString(prefs::kProfileName, "Profile 2");
+  Start();
+  EXPECT_EQ(profile_->GetPrefs()->GetString(prefs::kProfileName), "Profile 2");
+}
+TEST_F(AccountServiceTest, EmptyProfileHasNoNetworkOrCredentialsInWebUI) {
+  Start();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_EQ(network_.total_requests(), 0u);
+  const auto state = service_->GetState();
+  EXPECT_FALSE(state.Find("accessToken"));
+  EXPECT_FALSE(state.Find("refreshToken"));
+  EXPECT_FALSE(state.FindBool("busy").value());
+}
+TEST_F(AccountServiceTest, RestoreIsSingleFlightAndUsesBrokerWithoutCookies) {
+  Seed();
+  Start();
+  service_->Retry();
+  service_->Retry();
+  task_environment_.RunUntilIdle();
+  ASSERT_EQ(network_.total_requests(), 1u);
+  const auto* pending = network_.GetPendingRequest(0);
+  ASSERT_TRUE(pending);
+  EXPECT_EQ(pending->request.url, GURL(std::string(kBrokerUrl) + "/refresh"));
+  EXPECT_EQ(pending->request.credentials_mode, network::mojom::CredentialsMode::kOmit);
+  EXPECT_EQ(pending->request.redirect_mode, network::mojom::RedirectMode::kError);
+  EXPECT_EQ(pending->request.headers.GetHeader("Origin"), "https://remocode.cc");
+  Reply("/refresh", kTokens);
+  EXPECT_NE(State(), "signedIn");
+  Reply("/me", kMe);
+  EXPECT_EQ(State(), "signedIn");
+  EXPECT_EQ(*service_->GetState().FindString("displayName"), "Verified User");
+}
+TEST_F(AccountServiceTest, RotationIsEncryptedAndRestoresAfterRestart) {
+  SignIn();
+  const std::string stored = profile_->GetPrefs()->GetString(kRefreshPref);
+  EXPECT_FALSE(stored.contains("refresh-secret"));
+  std::string ciphertext, plaintext;
+  ASSERT_TRUE(base::Base64Decode(stored, &ciphertext));
+  ASSERT_TRUE(encryptor_->DecryptString(ciphertext, &plaintext));
+  EXPECT_TRUE(plaintext.contains("rotated-refresh-secret"));
+  EXPECT_FALSE(plaintext.contains("test-access-secret"));
+  EXPECT_FALSE(base::WriteJson(service_->GetState())->contains("secret"));
+  service_->Shutdown();
+  service_.reset();
+  Start();
+  EXPECT_TRUE(service_->GetState().FindBool("busy").value());
+  Reply("/refresh", kTokens);
+  Reply("/me", kMe);
+  EXPECT_EQ(State(), "signedIn");
+}
+TEST_F(AccountServiceTest, UnauthorizedRefreshClearsDiskAndRequiresReauth) {
+  Seed();
+  Start();
+  Reply("/refresh", "{}", net::HTTP_UNAUTHORIZED);
+  EXPECT_EQ(State(), "reauthRequired");
+  EXPECT_TRUE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+}
+TEST_F(AccountServiceTest, NetworkFailureIsRetryableButDoesNotClaimSignedIn) {
+  Seed();
+  Start();
+  Reply("/refresh", "{}", net::HTTP_SERVICE_UNAVAILABLE);
+  EXPECT_EQ(State(), "error");
+  EXPECT_FALSE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+  service_->Retry();
+  task_environment_.RunUntilIdle();
+  Reply("/refresh", kTokens);
+  Reply("/me", kMe);
+  EXPECT_EQ(State(), "signedIn");
+}
+TEST_F(AccountServiceTest, LogoutInvalidatesInFlightRestoreAndRestart) {
+  Seed();
+  Start();
+  service_->Logout();
+  task_environment_.RunUntilIdle();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_TRUE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+  task_environment_.FastForwardBy(base::Minutes(10));
+  EXPECT_EQ(State(), "signedOut");
+  service_->Shutdown();
+  service_.reset();
+  Start();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_FALSE(service_->GetState().FindBool("busy").value());
+}
+TEST_F(AccountServiceTest, Logout202IsLocallyCompleteButNotCloudConfirmed) {
+  SignIn();
+  service_->Logout();
+  task_environment_.RunUntilIdle();
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_TRUE(profile_->GetPrefs()->GetString(kRefreshPref).empty());
+  Reply("/logout", "{}", net::HTTP_ACCEPTED);
+  EXPECT_EQ(*service_->GetState().FindString("message"), "logoutPending");
+  EXPECT_EQ(State(), "signedOut");
+}
+TEST_F(AccountServiceTest, RepeatedLogoutPreservesPendingRevocation) {
+  SignIn();
+  service_->Logout();
+  task_environment_.RunUntilIdle();
+  const auto requests = network_.total_requests();
+  service_->Logout();
+  task_environment_.RunUntilIdle();
+  EXPECT_EQ(network_.total_requests(), requests);
+  EXPECT_TRUE(service_->GetState().FindBool("busy").value());
+  Reply("/logout", "{}", net::HTTP_ACCEPTED);
+  EXPECT_EQ(*service_->GetState().FindString("message"), "logoutPending");
+}
+TEST_F(AccountServiceTest, DifferentProfileCannotRestoreCopiedEncryptedBlob) {
+  Seed();
+  const std::string stored = profile_->GetPrefs()->GetString(kRefreshPref);
+  auto other = TestingProfile::Builder().SetPath(
+      profile_->GetPath().AppendASCII("OtherProfile")).Build();
+  other->GetPrefs()->SetString(kRefreshPref, stored);
+  AccountService other_service(other.get(), network_.GetSafeWeakWrapper(), crypto_.get());
+  task_environment_.RunUntilIdle();
+  EXPECT_EQ(*other_service.GetState().FindString("state"), "reauthRequired");
+  EXPECT_EQ(network_.total_requests(), 0u);
+  EXPECT_EQ(profile_->GetPrefs()->GetString(kRefreshPref), stored);
+  other_service.Shutdown();
+}
+TEST_F(AccountServiceTest, OTRNeverRedirectsToOriginalProfileService) {
+  EXPECT_EQ(nullptr, AccountServiceFactory::GetForProfile(
+      profile_->GetPrimaryOTRProfile(/*create_if_needed=*/true)));
+}
+TEST_F(AccountServiceTest, MeCannotReplaceInstallationIdentity) {
+  Seed();
+  Start();
+  Reply("/refresh", kTokens);
+  Reply("/me", R"({"account":{"displayName":"Other","email":"other@example.invalid"},
+      "installationId":"different-installation"})");
+  EXPECT_EQ(State(), "error");
+  EXPECT_TRUE(service_->GetState().FindString("email")->empty());
+}
+TEST_F(AccountServiceTest, SyncCapabilityPinsOriginPathAndOmitsCookies) {
+  SignIn();
+  int result = -1;
+  SyncStatus(base::BindOnce([](int* out, int status, base::DictValue data) {
+    *out = status;
+  }, &result));
+  const auto* pending = network_.GetPendingRequest(0);
+  ASSERT_TRUE(pending);
+  EXPECT_EQ(pending->request.url, GURL("https://remocode.cc/account/api/desktop/sync/status"));
+  EXPECT_EQ(pending->request.method, "GET");
+  EXPECT_EQ(pending->request.credentials_mode, network::mojom::CredentialsMode::kOmit);
+  EXPECT_EQ(pending->request.redirect_mode, network::mojom::RedirectMode::kError);
+  EXPECT_EQ(pending->request.headers.GetHeader("Origin"), "https://remocode.cc");
+  EXPECT_EQ(pending->request.headers.GetHeader("Authorization"), "Bearer test-access-secret");
+  EXPECT_FALSE(base::WriteJson(service_->GetState())->contains("test-access-secret"));
+  Reply("/sync/status", "{}", net::HTTP_SERVICE_UNAVAILABLE);
+  EXPECT_EQ(result, 503);
+}
+TEST_F(AccountServiceTest, SyncWaitersShareTheAccountRefreshFlight) {
+  SignIn();
+  ExpireAccess();
+  int completed = 0;
+  auto callback = [&completed]() {
+    return base::BindOnce([](int* count, int status, base::DictValue data) { ++*count; }, &completed);
+  };
+  const auto requests = network_.total_requests();
+  SyncStatus(callback());
+  SyncStatus(callback());
+  EXPECT_EQ(network_.total_requests(), requests + 1);
+  EXPECT_TRUE(network_.IsPending(std::string(kBrokerUrl) + "/refresh"));
+  Reply("/refresh", kTokens);
+  Reply("/me", kMe);
+  Reply("/sync/status", "{}");
+  Reply("/sync/status", "{}");
+  EXPECT_EQ(completed, 2);
+}
+TEST_F(AccountServiceTest, LogoutInvalidatesPendingSyncCallbacks) {
+  SignIn();
+  bool completed = false;
+  SyncStatus(base::BindOnce([](bool* done, int status, base::DictValue data) { *done = true; }, &completed));
+  service_->Logout();
+  task_environment_.RunUntilIdle();
+  EXPECT_FALSE(completed);
+  EXPECT_EQ(State(), "signedOut");
+  EXPECT_FALSE(base::WriteJson(service_->GetState())->contains("test-access-secret"));
+}
+TEST_F(AccountServiceTest, Sync401DoesNotIndependentlyRotateOrReplay) {
+  SignIn();
+  int result = -1;
+  SyncStatus(base::BindOnce([](int* out, int status, base::DictValue data) { *out = status; }, &result));
+  const auto requests = network_.total_requests();
+  Reply("/sync/status", "{}", net::HTTP_UNAUTHORIZED);
+  EXPECT_EQ(result, 401);
+  EXPECT_EQ(network_.total_requests(), requests);
+}
+}  // namespace remocode

diff --git a/chrome/browser/browseros/account/remocode_account_service.cc b/chrome/browser/browseros/account/remocode_account_service.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/account/remocode_account_service.cc
@@ -0,0 +1,581 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license.
+#include "chrome/browser/browseros/account/remocode_account_service.h"
+
+#include <algorithm>
+#include "base/base64.h"
+#include "base/containers/span.h"
+#include "base/check.h"
+#include "base/functional/bind.h"
+#include "base/json/json_reader.h"
+#include "base/json/json_writer.h"
+#include "base/task/bind_post_task.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/profiles/profile_attributes_entry.h"
+#include "chrome/browser/profiles/profile_attributes_storage.h"
+#include "chrome/browser/profiles/profile_manager.h"
+#include "chrome/browser/browser_process.h"
+#include "chrome/common/pref_names.h"
+#include "components/os_crypt/async/browser/os_crypt_async.h"
+#include "components/prefs/pref_service.h"
+#include "content/public/browser/browser_task_traits.h"
+#include "content/public/browser/browser_thread.h"
+#include "net/base/load_flags.h"
+#include "net/base/net_errors.h"
+#include "net/http/http_response_headers.h"
+#include "net/traffic_annotation/network_traffic_annotation.h"
+#include "services/data_decoder/public/cpp/decode_image.h"
+#include "services/network/public/cpp/resource_request.h"
+#include "services/network/public/cpp/simple_url_loader.h"
+#include "services/network/public/mojom/fetch_api.mojom.h"
+#include "services/network/public/mojom/url_response_head.mojom.h"
+#include "third_party/skia/include/core/SkBitmap.h"
+#include "ui/gfx/geometry/size.h"
+
+namespace remocode {
+namespace {
+constexpr auto kAccountTraffic = net::DefineNetworkTrafficAnnotation(
+    "remocode_desktop_account", R"(
+      semantics {
+        sender: "Remocode desktop account"
+        description: "Exchanges a user-approved OAuth code with the Remocode "
+                     "desktop broker, rotates credentials, reads account data "
+                     "and revokes the current desktop installation."
+        trigger: "Explicit login, account restore, credential refresh or logout."
+        data: "OAuth state and PKCE challenge; flow ID, code and verifier; "
+              "or refresh/access credential. "
+              "Never browsing history, bookmarks or Google credentials."
+        destination: WEBSITE
+        destination_other: "https://remocode.cc/account/api/desktop"
+      }
+      policy {
+        cookies_allowed: NO
+        setting: "Remocode account in Settings. Signing out clears local credentials."
+        policy_exception_justification: "Optional user-initiated account service."
+      })");
+
+constexpr auto kAvatarTraffic = net::DefineNetworkTrafficAnnotation(
+    "remocode_account_avatar", R"traffic(
+      semantics {
+        sender: "Remocode account avatar"
+        description: "Downloads the signed-in Remocode account's avatar for the "
+                     "toolbar and account menu."
+        trigger: "A verified account response supplies a new avatar URL."
+        data: "The avatar URL only. No credentials, cookies or browsing data."
+        destination: WEBSITE
+        destination_other: "Clerk avatar CDN (img.clerk.com or images.clerk.dev)"
+      }
+      policy {
+        cookies_allowed: NO
+        setting: "Signing out clears the image and stops pending downloads."
+        policy_exception_justification: "Avatar for the user-initiated account."
+      })traffic");
+
+bool IsTrustedAvatarURL(const GURL& url) {
+  return url.is_valid() && url.SchemeIs("https") && !url.has_username() &&
+         !url.has_password() && !url.has_port() &&
+         (url.host() == "img.clerk.com" || url.host() == "images.clerk.dev");
+}
+
+bool ValidString(const std::string* value, size_t maximum) {
+  return value && !value->empty() && value->size() <= maximum;
+}
+}  // namespace
+
+AccountService::AccountService(
+    Profile* profile,
+    scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
+    os_crypt_async::OSCryptAsync* os_crypt)
+    : profile_(profile), url_loader_factory_(std::move(url_loader_factory)) {
+  CHECK(!profile_->IsOffTheRecord());
+  CHECK(os_crypt);
+  // Migrate only known generated names, never a user-customized profile name.
+  auto* pref_service = profile_->GetPrefs();
+  const std::string& name = pref_service->GetString(prefs::kProfileName);
+  if (pref_service->GetBoolean(prefs::kProfileUsingDefaultName) &&
+      (name == "Your RemocodeBrowser neo" || name == "Your RemocodeBrowser")) {
+    pref_service->SetString(prefs::kProfileName, "Your reBrowser");
+  }
+  // Eager keyed services can run before ProfileImpl installs its pref observers.
+  // Keep the separate profile-picker cache consistent, including an earlier
+  // interrupted upgrade that migrated only the profile preference.
+  if (pref_service->GetBoolean(prefs::kProfileUsingDefaultName) &&
+      pref_service->GetString(prefs::kProfileName) == "Your reBrowser" &&
+      g_browser_process && g_browser_process->profile_manager()) {
+    auto* entry = g_browser_process->profile_manager()->GetProfileAttributesStorage()
+                      .GetProfileAttributesWithPath(profile_->GetPath());
+    if (entry && entry->IsUsingDefaultName() &&
+        (entry->GetLocalProfileName() == u"Your RemocodeBrowser neo" ||
+         entry->GetLocalProfileName() == u"Your RemocodeBrowser")) {
+      entry->SetLocalProfileName(u"Your reBrowser", true);
+    }
+  }
+  os_crypt->GetInstance(base::BindOnce(&AccountService::OnEncryptor,
+                                      weak_factory_.GetWeakPtr()));
+}
+AccountService::~AccountService() = default;
+void AccountService::Shutdown() {
+  shutdown_ = true;
+  StopOperations();
+  weak_factory_.InvalidateWeakPtrs();
+  access_token_.clear();
+  refresh_token_.clear();
+}
+base::DictValue AccountService::GetState() const {
+  base::DictValue result;
+  result.Set("state", state_);
+  result.Set("busy", initializing_ || !!loader_);
+  result.Set("message", message_);
+  result.Set("displayName", display_name_);
+  result.Set("email", email_);
+  return result;
+}
+base::CallbackListSubscription AccountService::Observe(
+    base::RepeatingClosure observer) {
+  return observers_.Add(std::move(observer));
+}
+void AccountService::Notify() {
+  observers_.Notify();
+  StartNextSyncRequest();
+}
+void AccountService::OnEncryptor(
+    scoped_refptr<os_crypt_async::Encryptor> encryptor) {
+  encryptor_ = std::move(encryptor);
+  initializing_ = false;
+  const std::string stored = profile_->GetPrefs()->GetString(kRefreshPref);
+  if (stored.empty()) {
+    Notify();
+    return;
+  }
+  std::string ciphertext, plaintext;
+  if (!encryptor_ || !encryptor_->IsDecryptionAvailable() ||
+      !base::Base64Decode(stored, &ciphertext) ||
+      !encryptor_->DecryptString(ciphertext, &plaintext)) {
+    // Preserve ciphertext on transient keychain failures; never fall back to
+    // plaintext or an unauthenticated cached account display.
+    Fail("storageUnavailable");
+    return;
+  }
+  auto data = base::JSONReader::ReadDict(plaintext, base::JSON_PARSE_RFC);
+  if (!data ||
+      data->FindString("profile") == nullptr ||
+      *data->FindString("profile") != profile_->GetPath().AsUTF8Unsafe() ||
+      !ValidString(data->FindString("refreshToken"), 16384) ||
+      !ValidString(data->FindString("installationId"), 256)) {
+    Fail("sessionExpired", true);
+    return;
+  }
+  refresh_token_ = *data->FindString("refreshToken");
+  installation_id_ = *data->FindString("installationId");
+  Refresh();
+}
+void AccountService::StopOperations() {
+  ++generation_;
+  ClearAvatar();
+  CancelSyncRequests();
+  loader_.reset();
+  request_kind_.reset();
+  logout_pending_ = false;
+  callback_server_.Reset();
+  authorization_timer_.Stop();
+  refresh_timer_.Stop();
+  oauth_state_.clear();
+  verifier_.clear();
+  flow_id_.clear();
+  open_authorization_.Reset();
+}
+void AccountService::ClearCredentials() {
+  access_token_.clear();
+  refresh_token_.clear();
+  installation_id_.clear();
+  display_name_.clear();
+  email_.clear();
+  expiration_ = base::Time();
+  profile_->GetPrefs()->ClearPref(kRefreshPref);
+  profile_->GetPrefs()->CommitPendingWrite();
+}
+void AccountService::Fail(std::string message, bool reauth) {
+  StopOperations();
+  access_token_.clear();
+  display_name_.clear();
+  email_.clear();
+  if (reauth) ClearCredentials();
+  state_ = reauth ? "reauthRequired" : "error";
+  message_ = std::move(message);
+  Notify();
+}
+void AccountService::Login(
+    base::OnceCallback<void(const GURL&)> open_authorization) {
+  if (shutdown_ || initializing_ || loader_ || state_ == "authorizing") return;
+  if (!encryptor_ || !encryptor_->IsEncryptionAvailable()) {
+    Fail("storageUnavailable");
+    return;
+  }
+  // Reauthentication is a new transaction. A previous refresh can never win.
+  StopOperations();
+  oauth_state_ = RandomOAuthSecret();
+  verifier_ = RandomOAuthSecret();
+  state_ = "authorizing";
+  message_.clear();
+  const uint64_t generation = generation_;
+  callback_server_ = base::SequenceBound<CallbackServer>(
+      content::GetIOThreadTaskRunner({}), oauth_state_,
+      base::BindPostTaskToCurrentDefault(base::BindOnce(
+          &AccountService::OnListenerReady, weak_factory_.GetWeakPtr(),
+          generation, std::move(open_authorization))),
+      base::BindPostTaskToCurrentDefault(base::BindOnce(
+          &AccountService::OnCallback, weak_factory_.GetWeakPtr(), generation)));
+  authorization_timer_.Start(FROM_HERE, base::Minutes(5), this,
+                              &AccountService::OnTimeout);
+  Notify();
+}
+void AccountService::OnListenerReady(
+    uint64_t generation, base::OnceCallback<void(const GURL&)> open, bool ready) {
+  if (generation != generation_ || shutdown_) return;
+  if (!ready) {
+    Fail("portInUse");
+    return;
+  }
+  // Register a server-timestamped, one-use flow before visiting the provider.
+  // This prevents pre-logout-all codes being exchanged after its cutoff.
+  open_authorization_ = std::move(open);
+  base::DictValue body;
+  body.Set("challenge", PKCEChallenge(verifier_));
+  body.Set("state", oauth_state_);
+  Send(Request::kStart, std::move(body));
+}
+void AccountService::OnCallback(uint64_t generation, OAuthCallback callback) {
+  if (generation != generation_ || shutdown_ || state_ != "authorizing" ||
+      flow_id_.empty() || loader_) return;
+  // The IO server has already consumed the state. Stop accepting requests.
+  callback_server_.Reset();
+  oauth_state_.clear();
+  if (callback.denied) {
+    Cancel();
+    return;
+  }
+  base::DictValue body;
+  body.Set("flowId", std::move(flow_id_));
+  body.Set("code", std::move(callback.code));
+  body.Set("verifier", std::move(verifier_));
+  body.Set("name", "reBrowser");
+  Send(Request::kExchange, std::move(body));
+}
+void AccountService::OnTimeout() { Fail("timeout"); }
+void AccountService::Cancel() {
+  if (shutdown_ || state_ != "authorizing") return;
+  // Cancellation also discards any credentials returned just before cancel
+  // (for example while /me is in flight). Restart must not revive this flow.
+  Logout();
+}
+void AccountService::Retry() {
+  if (shutdown_ || initializing_ || loader_ || state_ == "authorizing") return;
+  if (!refresh_token_.empty()) {
+    Refresh();
+  } else if (!profile_->GetPrefs()->GetString(kRefreshPref).empty()) {
+    // Retry an unavailable keychain without deleting the recoverable blob.
+    OnEncryptor(encryptor_);
+  }
+}
+void AccountService::Refresh() {
+  // All callers use the same single-flight request slot.
+  if (shutdown_ || loader_ || refresh_token_.empty()) return;
+  refresh_timer_.Stop();
+  base::DictValue body;
+  body.Set("refreshToken", refresh_token_);
+  Send(Request::kRefresh, std::move(body));
+}
+bool AccountService::SaveRefresh() {
+  if (!encryptor_ || !encryptor_->IsEncryptionAvailable()) return false;
+  base::DictValue envelope;
+  envelope.Set("profile", profile_->GetPath().AsUTF8Unsafe());
+  envelope.Set("installationId", installation_id_);
+  envelope.Set("refreshToken", refresh_token_);
+  auto plaintext = base::WriteJson(envelope);
+  std::string ciphertext;
+  if (!plaintext || !encryptor_->EncryptString(*plaintext, &ciphertext)) return false;
+  profile_->GetPrefs()->SetString(kRefreshPref, base::Base64Encode(ciphertext));
+  // Write rotation before exposing a signed-in state. Only ciphertext is on disk.
+  profile_->GetPrefs()->CommitPendingWrite();
+  return true;
+}
+bool AccountService::AcceptAccount(const base::DictValue& data) {
+  const base::DictValue* account = data.FindDict("account");
+  const std::string* installation = data.FindString("installationId");
+  if (!account || !ValidString(installation, 256) ||
+      *installation != installation_id_ ||
+      !account->FindString("displayName") ||
+      account->FindString("displayName")->size() > 1024 ||
+      !ValidString(account->FindString("email"), 1024)) return false;
+  display_name_ = *account->FindString("displayName");
+  email_ = *account->FindString("email");
+  if (display_name_.empty()) display_name_ = email_;
+  const std::string* image_url = account->FindString("imageUrl");
+  GURL avatar_url;
+  if (ValidString(image_url, 8192) && IsTrustedAvatarURL(GURL(*image_url))) {
+    avatar_url = GURL(*image_url);
+  }
+  if (avatar_url != avatar_url_) {
+    ClearAvatar();
+    avatar_url_ = avatar_url;
+  }
+  return true;
+}
+void AccountService::ClearAvatar() {
+  ++avatar_generation_;
+  avatar_loader_.reset();
+  avatar_url_ = GURL();
+  avatar_image_ = gfx::ImageSkia();
+}
+void AccountService::FetchAvatar() {
+  if (shutdown_ || state_ != "signedIn" || !avatar_url_.is_valid() ||
+      avatar_loader_ || !avatar_image_.isNull()) return;
+  auto request = std::make_unique<network::ResourceRequest>();
+  request->url = avatar_url_;
+  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
+  request->redirect_mode = network::mojom::RedirectMode::kError;
+  request->load_flags = net::LOAD_DISABLE_CACHE;
+  avatar_loader_ = network::SimpleURLLoader::Create(std::move(request), kAvatarTraffic);
+  avatar_loader_->SetTimeoutDuration(base::Seconds(15));
+  avatar_loader_->DownloadToString(url_loader_factory_.get(),
+      base::BindOnce(&AccountService::OnAvatarFetched,
+                     weak_factory_.GetWeakPtr(), avatar_generation_), 2 * 1024 * 1024);
+}
+void AccountService::OnAvatarFetched(uint64_t generation,
+                                     std::optional<std::string> body) {
+  if (shutdown_ || generation != avatar_generation_ || !avatar_loader_) return;
+  const bool success = avatar_loader_->NetError() == net::OK &&
+      avatar_loader_->ResponseInfo() && avatar_loader_->ResponseInfo()->headers &&
+      avatar_loader_->ResponseInfo()->headers->response_code() == 200;
+  avatar_loader_.reset();
+  if (!success || !body || body->empty()) return;
+  data_decoder::DecodeImageIsolated(base::as_byte_span(*body),
+      data_decoder::mojom::ImageCodec::kDefault, true, 1024 * 1024,
+      gfx::Size(256, 256), base::BindOnce(&AccountService::OnAvatarDecoded,
+          weak_factory_.GetWeakPtr(), generation));
+}
+void AccountService::OnAvatarDecoded(uint64_t generation, const SkBitmap& bitmap) {
+  if (shutdown_ || generation != avatar_generation_ || state_ != "signedIn" ||
+      bitmap.drawsNothing()) return;
+  avatar_image_ = gfx::ImageSkia::CreateFrom1xBitmap(bitmap);
+  Notify();
+}
+bool AccountService::AcceptTokens(const base::DictValue& data, bool is_refresh) {
+  const std::string* access = data.FindString("accessToken");
+  const std::string* refresh = data.FindString("refreshToken");
+  const std::string* installation = data.FindString("installationId");
+  const auto expires = data.FindInt("expiresIn");
+  if (!ValidString(access, 16384) || !ValidString(refresh, 16384) ||
+      access->find_first_of("\r\n") != std::string::npos ||
+      refresh->find_first_of("\r\n") != std::string::npos ||
+      !ValidString(installation, 256) || !expires || *expires <= 0 ||
+      *expires > 31 * 24 * 3600 ||
+      (is_refresh && *installation != installation_id_)) return false;
+  installation_id_ = *installation;
+  access_token_ = *access;
+  refresh_token_ = *refresh;
+  expiration_ = base::Time::Now() + base::Seconds(*expires);
+  return AcceptAccount(data);
+}
+void AccountService::Send(Request kind, base::DictValue body, std::string bearer) {
+  CHECK(!loader_);
+  request_kind_ = kind;
+  logout_pending_ = kind == Request::kLogout;
+  const char* path = kind == Request::kStart ? "/start" :
+      kind == Request::kExchange ? "/exchange" :
+      kind == Request::kRefresh ? "/refresh" :
+      kind == Request::kMe ? "/me" : "/logout";
+  auto request = std::make_unique<network::ResourceRequest>();
+  request->url = GURL(std::string(kBrokerUrl) + path);
+  request->method = kind == Request::kMe ? "GET" : "POST";
+  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
+  request->redirect_mode = network::mojom::RedirectMode::kError;
+  request->load_flags = net::LOAD_DISABLE_CACHE;
+  request->headers.SetHeader("Origin", "https://remocode.cc");
+  request->headers.SetHeader("Accept", "application/json");
+  if (!bearer.empty()) request->headers.SetHeader("Authorization", "Bearer " + bearer);
+  loader_ = network::SimpleURLLoader::Create(std::move(request), kAccountTraffic);
+  loader_->SetTimeoutDuration(base::Seconds(30));
+  loader_->SetAllowHttpErrorResults(true);
+  if (kind != Request::kMe) {
+    auto json = base::WriteJson(body);
+    CHECK(json);
+    loader_->AttachStringForUpload(*json, "application/json");
+  }
+  // No automatic retries: a rotating refresh or authorization code is one-use.
+  loader_->DownloadToString(url_loader_factory_.get(),
+      base::BindOnce(&AccountService::OnResponse, weak_factory_.GetWeakPtr(),
+                     generation_, kind), 64 * 1024);
+  Notify();
+}
+void AccountService::OnResponse(uint64_t generation, Request kind,
+                                std::optional<std::string> body) {
+  if (generation != generation_ || shutdown_) return;
+  const int error = loader_->NetError();
+  const int status = loader_->ResponseInfo() && loader_->ResponseInfo()->headers
+      ? loader_->ResponseInfo()->headers->response_code() : 0;
+  loader_.reset();
+  request_kind_.reset();
+  logout_pending_ = false;
+  if (kind == Request::kLogout) {
+    message_ = error == net::OK && status == 200 ? "" :
+               error == net::OK && status == 202 ? "logoutPending" : "logoutFailed";
+    Notify();
+    return;
+  }
+  if (status == 401 || status == 403) {
+    Fail("sessionExpired", true);
+    return;
+  }
+  if (error != net::OK || status != 200 || !body) {
+    Fail(status >= 400 ? "providerError" : "networkError");
+    return;
+  }
+  auto data = base::JSONReader::ReadDict(*body, base::JSON_PARSE_RFC);
+  if (!data) { Fail("providerError"); return; }
+  if (kind == Request::kStart) {
+    const auto* flow_id = data->FindString("flowId");
+    const auto* authorization_url = data->FindString("authorizationUrl");
+    const auto* server_verifier = data->FindString("verifier");
+    if (!ValidString(flow_id, 256) || !ValidString(authorization_url, 8192) ||
+        !server_verifier || !IsValidPKCEVerifier(*server_verifier) ||
+        !ValidateAuthorizationURL(GURL(*authorization_url), oauth_state_, *server_verifier) ||
+        !open_authorization_) {
+      Fail("providerError");
+      return;
+    }
+    // The broker contributes unpredictable PKCE material tied to flow start.
+    // A new flow cannot be paired with an older code by reusing a challenge.
+    verifier_ = *server_verifier;
+    flow_id_ = *flow_id;
+    std::move(open_authorization_).Run(GURL(*authorization_url));
+    Notify();
+    return;
+  }
+  if (kind == Request::kMe) {
+    if (!AcceptAccount(*data)) { Fail("providerError"); return; }
+    state_ = "signedIn";
+    message_.clear();
+    FetchAvatar();
+    const auto remaining = expiration_ - base::Time::Now();
+    if (remaining <= base::Seconds(0)) { Refresh(); return; }
+    refresh_timer_.Start(FROM_HERE,
+        remaining - std::min(base::Seconds(60), remaining / 10), this,
+        &AccountService::Refresh);
+    Notify();
+    return;
+  }
+  if (!AcceptTokens(*data, kind == Request::kRefresh)) {
+    Fail("providerError");
+    return;
+  }
+  if (!SaveRefresh()) { Fail("storageUnavailable"); return; }
+  authorization_timer_.Stop();
+  verifier_.clear();
+  Send(Request::kMe, base::DictValue(), access_token_);
+}
+void AccountService::Logout() {
+  if (shutdown_ || logout_pending_) return;
+  const bool had_credentials = !refresh_token_.empty() ||
+      !profile_->GetPrefs()->GetString(kRefreshPref).empty() ||
+      request_kind_ == Request::kExchange;
+  std::string access = access_token_;
+  base::DictValue body;
+  body.Set("refreshToken", refresh_token_);
+  // Invalidate every pending callback before touching credentials, even if a
+  // refresh has already rotated remotely. Local logout always wins.
+  StopOperations();
+  ClearCredentials();
+  state_ = "signedOut";
+  message_ = had_credentials ? "logoutFailed" : "";
+  if (!access.empty()) {
+    Send(Request::kLogout, std::move(body), std::move(access));
+  } else {
+    Notify();
+  }
+}
+// Not a general authenticated fetch API. Only the native sync service can call.
+void AccountService::CancelSyncRequests() {
+  sync_loader_.reset();
+  sync_requests_.clear();
+}
+void AccountService::AuthenticatedSyncRequest(
+    SyncEndpoint endpoint, base::DictValue body, SyncCallback callback) {
+  if (shutdown_ || state_ != "signedIn" || sync_requests_.size() >= 16) {
+    std::move(callback).Run(0, base::DictValue());
+    return;
+  }
+  sync_requests_.push_back({endpoint, std::move(body), std::move(callback)});
+  StartNextSyncRequest();
+}
+void AccountService::StartNextSyncRequest() {
+  if (shutdown_ || sync_loader_ || sync_requests_.empty() || loader_ ||
+      state_ != "signedIn" || access_token_.empty()) return;
+  if (expiration_ <= base::Time::Now() + base::Seconds(15)) {
+    // Exactly the account service's existing single-flight rotation slot.
+    Refresh();
+    return;
+  }
+  const auto& pending = sync_requests_.front();
+  const char* path = nullptr;
+  switch (pending.endpoint) {
+    case SyncEndpoint::kStatus: path = "/status"; break;
+    case SyncEndpoint::kEnrollment: path = "/enrollment"; break;
+    case SyncEndpoint::kPull: path = "/pull"; break;
+    case SyncEndpoint::kPush: path = "/push"; break;
+    case SyncEndpoint::kDelete: path = "/delete"; break;
+  }
+  auto request = std::make_unique<network::ResourceRequest>();
+  request->url = GURL(std::string("https://remocode.cc/account/api/desktop/sync") + path);
+  request->method = pending.endpoint == SyncEndpoint::kStatus ? "GET" : "POST";
+  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
+  request->redirect_mode = network::mojom::RedirectMode::kError;
+  request->load_flags = net::LOAD_DISABLE_CACHE;
+  request->headers.SetHeader("Origin", "https://remocode.cc");
+  request->headers.SetHeader("Authorization", "Bearer " + access_token_);
+  request->headers.SetHeader("Accept", "application/json");
+  constexpr auto traffic = net::DefineNetworkTrafficAnnotation(
+      "remocode_private_sync", R"(
+        semantics {
+          sender: "reBrowser optional sync"
+          description: "Checks VIP sync availability and exchanges only user-enabled metadata."
+          trigger: "User enables a category in Remocode Sync settings."
+          data: "Bookmark UUID, parent/order, title, sanitized URL; navigation UUID, "
+                "sanitized URL, title, timestamp and anonymous session association. "
+                "Bearer remains native. No cookies, prompts, recordings or page content."
+          destination: WEBSITE
+          destination_other: "https://remocode.cc/account/api/desktop/sync"
+        }
+        policy {
+          cookies_allowed: NO
+          setting: "All categories default off. Disabled categories do not sync."
+          policy_exception_justification: "Optional user service."
+        })");
+  sync_loader_ = network::SimpleURLLoader::Create(std::move(request), traffic);
+  sync_loader_->SetAllowHttpErrorResults(true);
+  sync_loader_->SetTimeoutDuration(base::Seconds(30));
+  if (pending.endpoint != SyncEndpoint::kStatus) {
+    sync_loader_->AttachStringForUpload(*base::WriteJson(pending.body), "application/json");
+  }
+  // Never retry mutations or rotate independently on 401.
+  sync_loader_->DownloadToString(url_loader_factory_.get(),
+      base::BindOnce(&AccountService::OnSyncResponse, weak_factory_.GetWeakPtr(),
+                     generation_), 1024 * 1024);
+}
+void AccountService::OnSyncResponse(uint64_t generation,
+                                  std::optional<std::string> body) {
+  if (shutdown_ || generation != generation_ || sync_requests_.empty()) return;
+  int status = sync_loader_->NetError() == net::OK &&
+      sync_loader_->ResponseInfo() && sync_loader_->ResponseInfo()->headers
+      ? sync_loader_->ResponseInfo()->headers->response_code() : 0;
+  auto parsed = body ? base::JSONReader::ReadDict(*body, base::JSON_PARSE_RFC)
+                     : std::nullopt;
+  if (!parsed && status >= 200 && status < 300) status = 0;
+  sync_loader_.reset();
+  auto callback = std::move(sync_requests_.front().callback);
+  sync_requests_.pop_front();
+  auto weak = weak_factory_.GetWeakPtr();
+  std::move(callback).Run(status, parsed ? std::move(*parsed) : base::DictValue());
+  if (weak) StartNextSyncRequest();
+}
+}  // namespace remocode

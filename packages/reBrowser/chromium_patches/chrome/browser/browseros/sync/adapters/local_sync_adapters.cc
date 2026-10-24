diff --git a/chrome/browser/browseros/sync/adapters/local_sync_adapters.cc b/chrome/browser/browseros/sync/adapters/local_sync_adapters.cc
new file mode 100644
--- /dev/null
+++ b/chrome/browser/browseros/sync/adapters/local_sync_adapters.cc
@@ -0,0 +1,1024 @@
+// Copyright 2026 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+#include "chrome/browser/browseros/sync/adapters/local_sync_adapters.h"
+
+#include <algorithm>
+#include <map>
+#include <optional>
+#include <set>
+#include <utility>
+#include <vector>
+
+#include "base/auto_reset.h"
+#include "base/functional/bind.h"
+#include "base/location.h"
+#include "base/memory/raw_ptr.h"
+#include "base/memory/weak_ptr.h"
+#include "base/strings/string_number_conversions.h"
+#include "base/strings/utf_string_conversions.h"
+#include "base/task/single_thread_task_runner.h"
+#include "base/task/cancelable_task_tracker.h"
+#include "base/uuid.h"
+#include "chrome/browser/bookmarks/bookmark_model_factory.h"
+#include "chrome/browser/browseros/sync/adapters/sync_adapter_util.h"
+#include "chrome/browser/history/history_service_factory.h"
+#include "chrome/browser/profiles/profile.h"
+#include "components/bookmarks/browser/bookmark_model.h"
+#include "components/bookmarks/browser/bookmark_model_observer.h"
+#include "components/bookmarks/browser/bookmark_node.h"
+#include "components/bookmarks/common/bookmark_metrics.h"
+#include "components/history/core/browser/history_backend.h"
+#include "components/history/core/browser/history_database.h"
+#include "components/history/core/browser/history_db_task.h"
+#include "components/history/core/browser/history_service.h"
+#include "components/history/core/browser/history_service_observer.h"
+#include "components/history/core/browser/history_types.h"
+#include "components/prefs/pref_service.h"
+#include "components/pref_registry/pref_registry_syncable.h"
+#include "ui/base/page_transition_types.h"
+
+namespace browseros::sync {
+namespace {
+using Result = LocalSyncAdapters::Result;
+using Callback = LocalSyncAdapters::Callback;
+using Stream = LocalSyncAdapters::Stream;
+using Node = bookmarks::BookmarkNode;
+using internal::Content;
+
+constexpr char kBookmarks[] = "browseros.sync.local.bookmarks";
+constexpr char kHistory[] = "browseros.sync.local.history";
+constexpr char kHistoryFloor[] = "browseros.sync.local.history_floor";
+constexpr char kHistoryScope[] = "browseros.sync.local.history_scope";
+
+Result Error(bool available, std::string error) {
+  Result result;
+  result.available = available;
+  result.error = std::move(error);
+  return result;
+}
+
+Result Success() {
+  Result result;
+  result.available = true;
+  result.success = true;
+  return result;
+}
+
+void ExportEntry(base::DictValue& entry) {
+  if (const auto* after = entry.FindString("afterId"); after && after->empty()) {
+    entry.Set("afterId", base::Value());
+  }
+}
+
+void CopyRevision(const base::DictValue& from, base::DictValue& to) {
+  if (const base::Value* revision = from.Find("revision")) {
+    to.Set("revision", revision->Clone());
+  }
+}
+
+bool IsStale(const base::DictValue& entry, const base::DictValue* metadata) {
+  const auto incoming = entry.FindDouble("revision");
+  const auto known = metadata ? metadata->FindDouble("revision") : std::nullopt;
+  return incoming && known && *incoming < *known;
+}
+
+bool IsDirty(const base::DictValue& content, const base::DictValue* metadata) {
+  const auto* baseline = metadata ? metadata->FindDict("baseline") : nullptr;
+  return !baseline || *baseline != content;
+}
+
+base::DictValue Tombstone(std::string_view id, const base::DictValue& metadata) {
+  base::DictValue entry;
+  entry.Set("id", id);
+  entry.Set("deleted", true);
+  CopyRevision(metadata, entry);
+  return entry;
+}
+
+std::optional<base::ListValue> NormalizeBatch(const base::ListValue& entries,
+                                            bool bookmark) {
+  if (entries.size() > internal::kMaxBatchSize) {
+    return std::nullopt;
+  }
+  base::ListValue result;
+  std::set<std::string> ids;
+  for (const auto& value : entries) {
+    auto entry = internal::NormalizeEntry(value, bookmark);
+    if (!entry || !ids.insert(*entry->FindString("id")).second) {
+      return std::nullopt;
+    }
+    result.Append(std::move(*entry));
+  }
+  return result;
+}
+
+// This task is scheduled ONLY through the profile's HistoryService. It calls
+// supported HistoryBackend/HistoryDatabase APIs; it never opens a History file
+// or SQL connection and never accesses Profile/PrefService off the UI sequence.
+class HistoryTask final : public history::HistoryDBTask {
+ public:
+  using Done = base::OnceCallback<void(Result, base::DictValue)>;
+  HistoryTask(base::Time since, base::DictValue metadata, Done done)
+      : since_(since), metadata_(std::move(metadata)), done_(std::move(done)) {}
+  HistoryTask(base::ListValue incoming,
+              base::DictValue metadata,
+              std::string scope,
+              Done done)
+      : applying_(true),
+        incoming_(std::move(incoming)),
+        metadata_(std::move(metadata)),
+        scope_(std::move(scope)),
+        done_(std::move(done)) {}
+
+  bool RunOnDBThread(history::HistoryBackend* backend,
+                     history::HistoryDatabase* db) override {
+    if (!backend || !db) {
+      result_ = Error(false, "history_database_unavailable");
+      return true;
+    }
+    result_ = Success();
+    if (applying_) {
+      Apply(backend);
+    } else {
+      Read(backend, db);
+    }
+    return true;
+  }
+
+  void DoneRunOnMainThread() override {
+    std::move(done_).Run(std::move(result_), std::move(updates_));
+  }
+
+ private:
+  void Fail(std::string_view error) {
+    result_.success = false;
+    if (result_.error.empty()) {
+      result_.error = error;
+    }
+  }
+
+  void Read(history::HistoryBackend* backend, history::HistoryDatabase* db) {
+    history::VisitVector visits;
+    // Unlike QueryHistory's default URL deduplication this preserves EACH
+    // individual visit. No title/referrer/annotation/session fields are copied.
+    if (!db->GetAllVisitsInRange(since_, base::Time(), std::nullopt, 0, &visits)) {
+      result_ = Error(true, "history_query_failed");
+      return;
+    }
+    std::map<std::string, std::string> events;
+    for (const auto item : metadata_) {
+      const auto& record = item.second.GetDict();
+      const auto* local = record.FindString("visit");
+      const auto* time = record.FindString("time");
+      if (local && time) {
+        events.emplace(*local + "/" + *time, item.first);
+      }
+    }
+    for (const auto& visit : visits) {
+      if (!visit.originator_cache_guid.empty() ||
+          !ui::PageTransitionIsMainFrame(visit.transition) ||
+          ui::PageTransitionIsRedirect(visit.transition) || visit.app_id) {
+        continue;
+      }
+      history::VisitSource source;
+      if (!backend->GetVisitSource(visit.visit_id, &source)) {
+        result_ = Error(true, "history_source_query_failed");
+        return;
+      }
+      if (source != history::SOURCE_BROWSED) {
+        continue;
+      }
+      history::URLRow url;
+      if (!backend->GetURLByID(visit.url_id, &url)) {
+        result_ = Error(true, "history_url_query_failed");
+        return;
+      }
+      auto safe = internal::SanitizeURL(url.url());
+      if (!safe || url.hidden()) {
+        continue;
+      }
+      const std::string local = base::NumberToString(visit.visit_id);
+      const std::string time = base::NumberToString(visit.visit_time.ToInternalValue());
+      auto found = events.find(local + "/" + time);
+      const std::string id = found == events.end()
+          ? base::Uuid::GenerateRandomV4().AsLowercaseString() : found->second;
+      const auto* old = metadata_.FindDict(id);
+      // Do not resurrect a locally deleted event if it was concurrently read.
+      if (old && old->FindBool("tombstone").value_or(false)) {
+        continue;
+      }
+      base::DictValue entry;
+      entry.Set("id", id);
+      entry.Set("deleted", false);
+      entry.Set("url", safe->spec());
+      entry.Set("title", internal::SafeTitle(url.title()));
+      entry.Set("visitedAt", static_cast<double>(
+          visit.visit_time.InMillisecondsSinceUnixEpoch()));
+      if (IsDirty(entry, old)) {
+        if (old) {
+          CopyRevision(*old, entry);
+        }
+        result_.entries.Append(entry.Clone());
+      }
+      auto record = old ? old->Clone() : base::DictValue();
+      record.Set("visit", local);
+      record.Set("time", time);
+      record.Set("local", true);
+      record.Set("entry", Content(entry));
+      updates_.Set(id, std::move(record));
+    }
+    for (const auto item : metadata_) {
+      const auto& record = item.second.GetDict();
+      if (record.FindBool("tombstone").value_or(false)) {
+        result_.entries.Append(Tombstone(item.first, record));
+      }
+    }
+  }
+
+  bool Matches(history::HistoryBackend* backend,
+               const history::VisitRow& visit,
+               const base::DictValue& entry) {
+    history::URLRow row;
+    const auto* url = entry.FindString("url");
+    const auto ms = entry.FindDouble("visitedAt");
+    if (!url || !ms || !backend->GetURLByID(visit.url_id, &row)) {
+      return false;
+    }
+    auto safe = internal::SanitizeURL(row.url());
+    return safe && safe->spec() == *url &&
+        static_cast<double>(visit.visit_time.InMillisecondsSinceUnixEpoch()) == *ms;
+  }
+
+  void Apply(history::HistoryBackend* backend) {
+    for (const auto& value : incoming_) {
+      const auto& entry = value.GetDict();
+      const auto& id = *entry.FindString("id");
+      const bool deleted = *entry.FindBool("deleted");
+      const auto* old = metadata_.FindDict(id);
+      if (IsStale(entry, old)) {
+        continue;
+      }
+      auto record = old ? old->Clone() : base::DictValue();
+      const std::string originator = "rebrowser:" + scope_ + ":" + id;
+      history::VisitRow existing;
+      bool found = false;
+      const bool already_removed = deleted &&
+          record.FindBool("tombstone").value_or(false);
+      if (const auto* local = record.FindString("visit"); local && !already_removed) {
+        int64_t visit_id = 0;
+        if (!base::StringToInt64(*local, &visit_id) || visit_id <= 0) {
+          Fail("history_invalid_mapping");
+          continue;
+        }
+        found = backend->GetVisitByID(visit_id, &existing);
+        if (found) {
+          const auto* time = record.FindString("time");
+          history::VisitSource source;
+          const bool local_source = existing.originator_cache_guid.empty() &&
+              backend->GetVisitSource(visit_id, &source) && source == history::SOURCE_BROWSED;
+          const bool source_matches = record.FindBool("local").value_or(false)
+              ? local_source : existing.originator_cache_guid == originator &&
+                               existing.originator_visit_id == 1;
+          if (!time || *time != base::NumberToString(existing.visit_time.ToInternalValue()) ||
+              !source_matches) {
+            Fail("history_mapping_conflict");
+            continue;
+          }
+        }
+      }
+      if (!found && !already_removed) {
+        found = backend->GetForeignVisit(originator, 1, &existing);
+      }
+      const auto* previous = record.FindDict("entry");
+      const auto* baseline = record.FindDict("baseline");
+      // Remote events are immutable. Preserve divergent local content, and
+      // acknowledge only the revision so a caller can surface a CAS conflict.
+      if (old && !deleted &&
+          (record.FindBool("tombstone").value_or(false) ||
+           (previous && *previous != Content(entry)))) {
+        CopyRevision(entry, record);
+        updates_.Set(id, std::move(record));
+        Fail("history_local_conflict");
+        continue;
+      }
+      if (found && deleted) {
+        // Never delete by URL or timestamp range: validate the exact event
+        // mapping, including content, before removing this one VisitRow.
+        if ((!previous && existing.originator_cache_guid != originator) ||
+            (previous && !Matches(backend, existing, *previous)) ||
+            (previous && baseline && *previous != *baseline)) {
+          Fail("history_delete_conflict");
+          continue;
+        }
+        history::VisitRow remaining;
+        if (!backend->RemoveVisits({existing}, history::DeletionInfo::Reason::kOther) ||
+            backend->GetVisitByID(existing.visit_id, &remaining)) {
+          Fail("history_remove_failed");
+          continue;
+        }
+      } else if (found) {
+        if (!Matches(backend, existing, entry)) {
+          Fail("history_event_conflict");
+          continue;
+        }
+      } else if (!deleted) {
+        if (old && record.FindBool("local").value_or(false)) {
+          Fail("history_local_visit_missing");
+          continue;
+        }
+        if (old && record.FindBool("tombstone").value_or(false)) {
+          Fail("history_local_conflict");
+          continue;
+        }
+        history::VisitRow visit;
+        visit.visit_time = base::Time::FromMillisecondsSinceUnixEpoch(
+            *entry.FindDouble("visitedAt"));
+        visit.originator_cache_guid = originator;
+        visit.originator_visit_id = 1;
+        visit.is_known_to_sync = true;
+        visit.transition = ui::PageTransitionFromInt(
+            ui::PAGE_TRANSITION_LINK | ui::PAGE_TRANSITION_CHAIN_START |
+            ui::PAGE_TRANSITION_CHAIN_END);
+        visit.consider_for_ntp_most_visited = false;
+        const GURL url(*entry.FindString("url"));
+        history::URLRow local_url;
+        // AddSyncedVisit must not replace the title of unrelated local visits
+        // which happen to share this URL (URLRow titles are shared by visits).
+        const std::u16string title = backend->GetURL(url, &local_url)
+            ? local_url.title() : base::UTF8ToUTF16(*entry.FindString("title"));
+        existing.visit_id = backend->AddSyncedVisit(
+            url, title, false, visit, std::nullopt, std::nullopt);
+        if (existing.visit_id == history::kInvalidVisitID ||
+            !backend->GetVisitByID(existing.visit_id, &existing) ||
+            !Matches(backend, existing, entry)) {
+          Fail("history_add_failed");
+          continue;
+        }
+        record.Set("local", false);
+      }
+      CopyRevision(entry, record);
+      record.Set("entry", Content(entry));
+      record.Set("baseline", Content(entry));
+      record.Set("tombstone", false);
+      if (!deleted) {
+        record.Set("visit", base::NumberToString(existing.visit_id));
+        record.Set("time", base::NumberToString(existing.visit_time.ToInternalValue()));
+        record.Set("local", existing.originator_cache_guid.empty());
+      } else {
+        record.Remove("visit");
+        record.Remove("time");
+      }
+      updates_.Set(id, std::move(record));
+    }
+  }
+
+  bool applying_ = false;
+  base::Time since_;
+  base::ListValue incoming_;
+  base::DictValue metadata_;
+  std::string scope_;
+  Done done_;
+  Result result_;
+  base::DictValue updates_;
+};
+}  // namespace
+
+class LocalSyncAdapters::Impl final : public bookmarks::BookmarkModelObserver,
+                                     public history::HistoryServiceObserver {
+ public:
+  explicit Impl(Profile* profile) {
+    // Check BEFORE invoking factories, which may redirect OTR to the original
+    // profile. Guest/system profiles also have no authorized ordinary data.
+    if (!profile || profile->IsOffTheRecord() || !profile->IsRegularProfile()) {
+      return;
+    }
+    prefs_ = profile->GetPrefs();
+    if (!prefs_->FindPreference(kBookmarks) || !prefs_->FindPreference(kHistory) ||
+        !prefs_->FindPreference(kHistoryFloor) || !prefs_->FindPreference(kHistoryScope)) {
+      prefs_ = nullptr;
+      return;
+    }
+    model_ = BookmarkModelFactory::GetForBrowserContext(profile);
+    history_ = HistoryServiceFactory::GetForProfile(
+        profile, ServiceAccessType::EXPLICIT_ACCESS);
+    if (model_) {
+      model_->AddObserver(this);
+    }
+    if (history_) {
+      history_->AddObserver(this);
+    }
+  }
+  ~Impl() override { Shutdown(); }
+
+  bool IsAvailable(Stream stream) const {
+    if (shutdown_ || !prefs_) {
+      return false;
+    }
+    return stream == Stream::kBookmarks ? model_ && model_->loaded()
+                                       : history_ && history_->backend_loaded();
+  }
+
+  const Node* Root(std::string_view id) const {
+    if (id == "root:toolbar") {
+      return model_->bookmark_bar_node();
+    }
+    if (id == "root:other") {
+      return model_->other_node();
+    }
+    if (id == "root:mobile") {
+      return model_->mobile_node();
+    }
+    return nullptr;
+  }
+
+  std::string Id(const Node* node) const {
+    for (std::string_view id : {"root:toolbar", "root:other", "root:mobile"}) {
+      if (node == Root(id)) {
+        return std::string(id);
+      }
+    }
+    return node->uuid().AsLowercaseString();
+  }
+
+  bool IsLocal(const Node* node) const {
+    for (; node; node = node->parent()) {
+      if (node == Root("root:toolbar") || node == Root("root:other") ||
+          node == Root("root:mobile")) {
+        return true;
+      }
+    }
+    return false;
+  }
+
+  const Node* Find(std::string_view id) const {
+    if (internal::IsRootId(id)) {
+      return Root(id);
+    }
+    const auto* node = model_->GetNodeByUuid(base::Uuid::ParseLowercase(id),
+        bookmarks::BookmarkModel::NodeTypeForUuidLookup::kLocalOrSyncableNodes);
+    return node && IsLocal(node) ? node : nullptr;
+  }
+
+  std::optional<base::DictValue> Snapshot(const Node* node) const {
+    if (!node || node->is_permanent_node() || !IsLocal(node)) {
+      return std::nullopt;
+    }
+    std::optional<GURL> safe;
+    if (node->is_url()) {
+      safe = internal::SanitizeURL(node->url());
+      if (!safe) {
+        return std::nullopt;
+      }
+    }
+    std::string after;
+    for (const auto& sibling : node->parent()->children()) {
+      if (sibling.get() == node) {
+        break;
+      }
+      if (sibling->is_folder() || internal::SanitizeURL(sibling->url())) {
+        after = Id(sibling.get());
+      }
+    }
+    base::DictValue entry;
+    entry.Set("id", Id(node));
+    entry.Set("deleted", false);
+    entry.Set("parentId", Id(node->parent()));
+    entry.Set("afterId", after);
+    entry.Set("title", internal::SafeTitle(node->GetTitle(), internal::kBookmarkTitleBytes));
+    entry.Set("url", safe ? base::Value(safe->spec()) : base::Value());
+    return entry;
+  }
+
+  void Collect(const Node* parent, base::DictValue& metadata, Result& result) {
+    for (const auto& child : parent->children()) {
+      if (auto entry = Snapshot(child.get())) {
+        const auto id = Id(child.get());
+        const auto* old = metadata.FindDict(id);
+        if (IsDirty(*entry, old)) {
+          if (old) {
+            CopyRevision(*old, *entry);
+          }
+          ExportEntry(*entry);
+          result.entries.Append(std::move(*entry));
+          if (!old) {
+            metadata.Set(id, base::DictValue());
+          }
+        }
+      }
+      if (child->is_folder()) {
+        Collect(child.get(), metadata, result);
+      }
+    }
+  }
+
+  void ReadBookmarks(Callback callback) {
+    if (!IsAvailable(Stream::kBookmarks)) {
+      Complete(std::move(callback), Error(false, "bookmarks_unavailable"));
+      return;
+    }
+    auto metadata = prefs_->GetDict(kBookmarks).Clone();
+    Result result = Success();
+    for (std::string_view id : {"root:toolbar", "root:other", "root:mobile"}) {
+      Collect(Root(id), metadata, result);
+    }
+    for (const auto item : metadata) {
+      if (item.second.GetDict().FindBool("tombstone").value_or(false)) {
+        result.entries.Append(Tombstone(item.first, item.second.GetDict()));
+      }
+    }
+    prefs_->SetDict(kBookmarks, std::move(metadata));
+    Complete(std::move(callback), std::move(result));
+  }
+
+  void ApplyBookmarks(base::ListValue values, Callback callback) {
+    if (!IsAvailable(Stream::kBookmarks)) {
+      Complete(std::move(callback), Error(false, "bookmarks_unavailable"));
+      return;
+    }
+    auto entries = NormalizeBatch(values, true);
+    if (!entries) {
+      Complete(std::move(callback), Error(true, "invalid_bookmark_batch"));
+      return;
+    }
+    Result result = Success();
+    auto metadata = prefs_->GetDict(kBookmarks).Clone();
+    // Freeze conflict checks before any of this batch's moves/removals change
+    // sibling anchors. Otherwise deleting A would falsely make B(afterId=A)
+    // appear locally edited when B is explicitly tombstoned in the same batch.
+    std::map<std::string, base::DictValue> before_batch;
+    for (const auto& value : *entries) {
+      const auto& id = *value.GetDict().FindString("id");
+      if (auto snapshot = Snapshot(Find(id))) {
+        before_batch.emplace(id, std::move(*snapshot));
+      }
+    }
+    // Model notifications are synchronous; suppress only our own mutations.
+    base::AutoReset<bool> suppress(&applying_bookmarks_, true);
+    std::vector<const base::DictValue*> pending;
+    for (const auto& value : *entries) {
+      pending.push_back(&value.GetDict());
+    }
+    // Resolve parents and afterId dependencies regardless of wire order. A
+    // folder tombstone waits until its explicitly tombstoned children are gone.
+    while (!pending.empty()) {
+      bool progress = false;
+      for (auto it = pending.begin(); it != pending.end();) {
+        const auto& entry = **it;
+        const std::string& id = *entry.FindString("id");
+        const bool deleted = *entry.FindBool("deleted");
+        const Node* node = Find(id);
+        const auto* old = metadata.FindDict(id);
+        if (IsStale(entry, old)) {
+          it = pending.erase(it);
+          progress = true;
+          continue;
+        }
+        auto record = old ? old->Clone() : base::DictValue();
+        const auto before = before_batch.find(id);
+        const base::DictValue* current = before == before_batch.end()
+            ? nullptr : &before->second;
+        const bool local_tombstone = record.FindBool("tombstone").value_or(false);
+        const auto* baseline = record.FindDict("baseline");
+        bool conflict = false;
+        if (deleted) {
+          // Unknown IDs and already-removed nodes are harmless acknowledgments.
+          // Never remove a matching-UUID local node which we have not synced.
+          if (node && (!old || !current || !baseline || *current != *baseline)) {
+            conflict = true;
+          } else if (node && !node->children().empty()) {
+            ++it;
+            continue;
+          } else if (node) {
+            model_->Remove(node, bookmarks::metrics::BookmarkEditSource::kOther,
+                           FROM_HERE);
+          }
+        } else if (local_tombstone) {
+          conflict = true;
+        } else if (node && (!current ||
+                   (IsDirty(*current, old) && *current != Content(entry)))) {
+          conflict = true;
+        } else {
+          const Node* parent = Find(*entry.FindString("parentId"));
+          const std::string& after = *entry.FindString("afterId");
+          const Node* previous = after.empty() ? nullptr : Find(after);
+          if (!parent || !parent->is_folder() ||
+              (!after.empty() && (!previous || previous->parent() != parent))) {
+            ++it;
+            continue;
+          }
+          bool cycle = false;
+          for (const Node* ancestor = parent; ancestor; ancestor = ancestor->parent()) {
+            if (ancestor == node && node) {
+              cycle = true;
+              break;
+            }
+          }
+          if (cycle || (node && node->is_folder() != entry.Find("url")->is_none())) {
+            conflict = true;
+          } else {
+            const size_t index = previous
+                ? parent->GetIndexOf(previous).value() + 1 : 0;
+            const std::u16string title = base::UTF8ToUTF16(*entry.FindString("title"));
+            if (!node) {
+              const base::Uuid uuid = base::Uuid::ParseLowercase(id);
+              if (entry.Find("url")->is_none()) {
+                node = model_->AddFolder(parent, index, title, nullptr,
+                                         std::nullopt, uuid);
+              } else {
+                node = model_->AddURL(parent, index, title,
+                    GURL(*entry.FindString("url")), nullptr, std::nullopt, uuid);
+              }
+            } else {
+              const auto live = Snapshot(node);
+              if (live && (live->FindString("parentId") != nullptr) &&
+                  (*live->FindString("parentId") != *entry.FindString("parentId") ||
+                   *live->FindString("afterId") != after)) {
+                model_->Move(node, parent, index);
+              }
+              if (internal::SafeTitle(node->GetTitle(), internal::kBookmarkTitleBytes) != *entry.FindString("title")) {
+                model_->SetTitle(node, title,
+                    bookmarks::metrics::BookmarkEditSource::kOther);
+              }
+              if (node->is_url() &&
+                  internal::SanitizeURL(node->url())->spec() != *entry.FindString("url")) {
+                model_->SetURL(node, GURL(*entry.FindString("url")),
+                    bookmarks::metrics::BookmarkEditSource::kOther);
+              }
+            }
+          }
+        }
+        CopyRevision(entry, record);
+        if (conflict) {
+          result.success = false;
+          result.error = "bookmark_local_conflict";
+          // Keep local content/tombstones. Record the server revision, but
+          // never silently replace a locally dirty bookmark with remote data.
+        } else {
+          record.Set("baseline", Content(entry));
+          record.Set("tombstone", false);
+        }
+        metadata.Set(id, std::move(record));
+        it = pending.erase(it);
+        progress = true;
+      }
+      if (!progress) {
+        result.success = false;
+        result.error = "bookmark_unresolved_parent_order_or_nonempty_folder";
+        break;
+      }
+    }
+    prefs_->SetDict(kBookmarks, std::move(metadata));
+    Complete(std::move(callback), std::move(result));
+  }
+
+  void ReadHistory(base::Time since, Callback callback) {
+    if (!IsAvailable(Stream::kHistory)) {
+      Complete(std::move(callback), Error(false, "history_unavailable"));
+      return;
+    }
+    if (history_busy_) {
+      Complete(std::move(callback), Error(true, "history_busy"));
+      return;
+    }
+    if (since.is_null() || since > base::Time::Now()) {
+      Complete(std::move(callback), Error(true, "history_enable_time_required"));
+      return;
+    }
+    const base::Time floor = std::max(since, prefs_->GetTime(kHistoryFloor));
+    prefs_->SetTime(kHistoryFloor, floor);
+    history_busy_ = true;
+    auto snapshot = prefs_->GetDict(kHistory).Clone();
+    history_->ScheduleDBTask(FROM_HERE, std::make_unique<HistoryTask>(
+        floor, snapshot.Clone(), base::BindOnce(&Impl::HistoryDone,
+            weak_factory_.GetWeakPtr(), std::move(callback),
+            std::move(snapshot))), &tracker_);
+  }
+
+  void ApplyHistory(base::ListValue values, Callback callback) {
+    if (!IsAvailable(Stream::kHistory)) {
+      Complete(std::move(callback), Error(false, "history_unavailable"));
+      return;
+    }
+    if (history_busy_) {
+      Complete(std::move(callback), Error(true, "history_busy"));
+      return;
+    }
+    auto entries = NormalizeBatch(values, false);
+    if (!entries) {
+      Complete(std::move(callback), Error(true, "invalid_history_batch"));
+      return;
+    }
+    auto scope = prefs_->GetString(kHistoryScope);
+    if (scope.empty()) {
+      scope = base::Uuid::GenerateRandomV4().AsLowercaseString();
+      prefs_->SetString(kHistoryScope, scope);
+    }
+    auto snapshot = prefs_->GetDict(kHistory).Clone();
+    for (const auto& value : *entries) {
+      const auto& entry = value.GetDict();
+      if (entry.FindBool("deleted").value_or(false)) {
+        if (const auto* old = snapshot.FindDict(*entry.FindString("id"))) {
+          if (const auto* visit = old->FindString("visit")) {
+            remote_removals_.insert(*visit);
+          }
+        }
+      }
+    }
+    history_busy_ = true;
+    history_->ScheduleDBTask(FROM_HERE, std::make_unique<HistoryTask>(
+        std::move(*entries), snapshot.Clone(), std::move(scope),
+        base::BindOnce(&Impl::HistoryDone, weak_factory_.GetWeakPtr(),
+            std::move(callback), std::move(snapshot))), &tracker_);
+  }
+
+  void HistoryDone(Callback callback,
+                   base::DictValue snapshot,
+                   Result result,
+                   base::DictValue updates) {
+    auto current = prefs_->GetDict(kHistory).Clone();
+    for (auto item : updates) {
+      auto record = item.second.GetDict().Clone();
+      const auto* before = snapshot.FindDict(item.first);
+      const auto* now = current.FindDict(item.first);
+      // A deletion on the UI sequence while the backend task was running must
+      // not be overwritten by its stale read/acknowledgment.
+      if (now && (!before || *before != *now)) {
+        auto preserved = now->Clone();
+        CopyRevision(record, preserved);
+        if (const auto* baseline = record.FindDict("baseline")) {
+          preserved.Set("baseline", baseline->Clone());
+        }
+        record = std::move(preserved);
+      }
+      if (const auto* visit = record.FindString("visit"); visit &&
+          !remote_removals_.contains(*visit) &&
+          (deleted_all_during_task_ || deleted_during_task_.contains(*visit))) {
+        record.Set("tombstone", true);
+      }
+      current.Set(item.first, std::move(record));
+    }
+    // Filter stale read output if the user deleted an event during the query.
+    for (auto& value : result.entries) {
+      auto& entry = value.GetDict();
+      if (const auto* now = current.FindDict(*entry.FindString("id"));
+          now && now->FindBool("tombstone").value_or(false)) {
+        entry = Tombstone(*entry.FindString("id"), *now);
+      }
+    }
+    prefs_->SetDict(kHistory, std::move(current));
+    history_busy_ = false;
+    remote_removals_.clear();
+    deleted_during_task_.clear();
+    deleted_all_during_task_ = false;
+    std::move(callback).Run(std::move(result));
+  }
+
+  void SetOnChanged(base::RepeatingCallback<void(Stream)> callback) {
+    on_changed_ = std::move(callback);
+  }
+
+  bool ResetSyncState() {
+    if (shutdown_ || !prefs_ || history_busy_) {
+      return false;
+    }
+    prefs_->ClearPref(kBookmarks);
+    prefs_->ClearPref(kHistory);
+    prefs_->ClearPref(kHistoryFloor);
+    // Retain old foreign visits as ordinary local history. A fresh scope stops
+    // a new account's same UUID from identifying/deleting the previous one's.
+    prefs_->SetString(kHistoryScope, base::Uuid::GenerateRandomV4().AsLowercaseString());
+    return true;
+  }
+
+  void Shutdown() {
+    if (shutdown_) {
+      return;
+    }
+    shutdown_ = true;
+    weak_factory_.InvalidateWeakPtrs();
+    tracker_.TryCancelAll();
+    if (model_) {
+      model_->RemoveObserver(this);
+      model_ = nullptr;
+    }
+    if (history_) {
+      history_->RemoveObserver(this);
+      history_ = nullptr;
+    }
+    on_changed_.Reset();
+    prefs_ = nullptr;
+  }
+
+ private:
+  void Complete(Callback callback, Result result) {
+    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
+        base::BindOnce(&Impl::Reply, weak_factory_.GetWeakPtr(),
+                       std::move(callback), std::move(result)));
+  }
+  void Reply(Callback callback, Result result) {
+    std::move(callback).Run(std::move(result));
+  }
+
+  void Notify(Stream stream) {
+    if (shutdown_ || on_changed_.is_null()) {
+      return;
+    }
+    bool& pending = stream == Stream::kBookmarks ? bookmark_notification_pending_
+                                               : history_notification_pending_;
+    if (pending) {
+      return;
+    }
+    pending = true;
+    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE,
+        base::BindOnce(&Impl::Dispatch, weak_factory_.GetWeakPtr(), stream));
+  }
+
+  void Dispatch(Stream stream) {
+    (stream == Stream::kBookmarks ? bookmark_notification_pending_
+                                 : history_notification_pending_) = false;
+    if (!on_changed_.is_null()) {
+      on_changed_.Run(stream);
+    }
+  }
+
+  void RememberRemoval(const Node* node, base::DictValue& metadata) {
+    if (auto* old = metadata.FindDict(Id(node))) {
+      old->Set("tombstone", true);
+    }
+    for (const auto& child : node->children()) {
+      RememberRemoval(child.get(), metadata);
+    }
+  }
+
+  void BookmarkModelLoaded(bool) override { Notify(Stream::kBookmarks); }
+  void BookmarkModelBeingDeleted() override {
+    model_->RemoveObserver(this);
+    model_ = nullptr;
+  }
+  void OnWillMoveBookmarkNode(const Node* old_parent, size_t old_index,
+                               const Node* new_parent, size_t) override {
+    if (!applying_bookmarks_ && IsLocal(old_parent) && !IsLocal(new_parent)) {
+      auto metadata = prefs_->GetDict(kBookmarks).Clone();
+      RememberRemoval(old_parent->children()[old_index].get(), metadata);
+      prefs_->SetDict(kBookmarks, std::move(metadata));
+      Notify(Stream::kBookmarks);
+    }
+  }
+  void BookmarkNodeMoved(const Node* old_parent, size_t,
+                         const Node* new_parent, size_t) override {
+    if (!applying_bookmarks_ && (IsLocal(old_parent) || IsLocal(new_parent))) {
+      Notify(Stream::kBookmarks);
+    }
+  }
+  void BookmarkNodeAdded(const Node* parent, size_t index, bool) override {
+    if (!applying_bookmarks_ && IsLocal(parent)) {
+      auto metadata = prefs_->GetDict(kBookmarks).Clone();
+      if (auto* record = metadata.FindDict(Id(parent->children()[index].get()));
+          record && record->FindBool("tombstone").value_or(false)) {
+        // Undo/restore is a NEW local intent. An in-flight acknowledgment of
+        // the old deletion must not remove the restored node or clear its dirt.
+        record->Set("tombstone", false);
+        record->Remove("baseline");
+        prefs_->SetDict(kBookmarks, std::move(metadata));
+      }
+      Notify(Stream::kBookmarks);
+    }
+  }
+  void OnWillRemoveBookmarks(const Node* parent, size_t, const Node* node,
+                             const base::Location&) override {
+    if (!applying_bookmarks_ && IsLocal(parent)) {
+      auto metadata = prefs_->GetDict(kBookmarks).Clone();
+      RememberRemoval(node, metadata);
+      prefs_->SetDict(kBookmarks, std::move(metadata));
+      Notify(Stream::kBookmarks);
+    }
+  }
+  void BookmarkNodeRemoved(const Node*, size_t, const Node*,
+                           const std::set<GURL>&, const base::Location&) override {}
+  void BookmarkNodeChanged(const Node* node) override {
+    if (!applying_bookmarks_ && IsLocal(node)) {
+      Notify(Stream::kBookmarks);
+    }
+  }
+  void BookmarkNodeFaviconChanged(const Node*) override {}
+  void BookmarkNodeChildrenReordered(const Node* node) override {
+    BookmarkNodeChanged(node);
+  }
+  void OnWillRemoveAllUserBookmarks(const base::Location&) override {
+    if (applying_bookmarks_) {
+      return;
+    }
+    auto metadata = prefs_->GetDict(kBookmarks).Clone();
+    for (std::string_view id : {"root:toolbar", "root:other", "root:mobile"}) {
+      RememberRemoval(Root(id), metadata);
+    }
+    prefs_->SetDict(kBookmarks, std::move(metadata));
+    Notify(Stream::kBookmarks);
+  }
+  void BookmarkAllUserNodesRemoved(const std::set<GURL>&,
+                                   const base::Location&) override {}
+
+  void OnURLVisited(history::HistoryService*,
+                     const history::VisitedURLInfo& info) override {
+    const base::Time floor = prefs_->GetTime(kHistoryFloor);
+    if (!floor.is_null() && info.visit_row.visit_time >= floor &&
+        info.visit_row.originator_cache_guid.empty() &&
+        internal::SanitizeURL(info.url_row.url())) {
+      Notify(Stream::kHistory);
+    }
+  }
+  void OnHistoryServiceLoaded(history::HistoryService*) override {
+    Notify(Stream::kHistory);
+  }
+  void HistoryServiceBeingDeleted(history::HistoryService*) override {
+    history_->RemoveObserver(this);
+    history_ = nullptr;
+  }
+  void OnHistoryDeletions(history::HistoryService*,
+                           const history::DeletionInfo& info) override {
+    if (info.is_from_expiration() ||
+        info.deletion_reason() == history::DeletionInfo::Reason::kDeleteAllForeignVisits) {
+      return;
+    }
+    if (history_busy_) {
+      if (info.IsAllHistory()) {
+        deleted_all_during_task_ = true;
+      } else {
+        for (const auto id : info.deleted_visit_ids()) {
+          const std::string visit = base::NumberToString(id);
+          if (!remote_removals_.contains(visit)) {
+            deleted_during_task_.insert(visit);
+          }
+        }
+      }
+    }
+    auto metadata = prefs_->GetDict(kHistory).Clone();
+    bool changed = false;
+    for (auto item : metadata) {
+      auto& record = item.second.GetDict();
+      const auto* visit = record.FindString("visit");
+      int64_t visit_id = 0;
+      if (!visit || remote_removals_.contains(*visit) ||
+          !base::StringToInt64(*visit, &visit_id)) {
+        continue;
+      }
+      if (info.IsAllHistory() || info.deleted_visit_ids().contains(visit_id)) {
+        record.Set("tombstone", true);
+        changed = true;
+      }
+    }
+    if (changed) {
+      prefs_->SetDict(kHistory, std::move(metadata));
+      Notify(Stream::kHistory);
+    }
+  }
+
+  raw_ptr<PrefService> prefs_ = nullptr;
+  raw_ptr<bookmarks::BookmarkModel> model_ = nullptr;
+  raw_ptr<history::HistoryService> history_ = nullptr;
+  bool shutdown_ = false;
+  bool applying_bookmarks_ = false;
+  bool history_busy_ = false;
+  bool bookmark_notification_pending_ = false;
+  bool history_notification_pending_ = false;
+  std::set<std::string> remote_removals_;
+  std::set<std::string> deleted_during_task_;
+  bool deleted_all_during_task_ = false;
+  base::RepeatingCallback<void(Stream)> on_changed_;
+  base::CancelableTaskTracker tracker_;
+  base::WeakPtrFactory<Impl> weak_factory_{this};
+};
+
+LocalSyncAdapters::LocalSyncAdapters(Profile* profile)
+    : impl_(std::make_unique<Impl>(profile)) {}
+LocalSyncAdapters::~LocalSyncAdapters() = default;
+
+void LocalSyncAdapters::RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
+  registry->RegisterDictionaryPref(kBookmarks);
+  registry->RegisterDictionaryPref(kHistory);
+  registry->RegisterTimePref(kHistoryFloor, base::Time());
+  registry->RegisterStringPref(kHistoryScope, "");
+}
+bool LocalSyncAdapters::IsAvailable(Stream stream) const {
+  return impl_->IsAvailable(stream);
+}
+void LocalSyncAdapters::ReadBookmarks(Callback callback) {
+  impl_->ReadBookmarks(std::move(callback));
+}
+void LocalSyncAdapters::ApplyBookmarks(base::ListValue entries, Callback callback) {
+  impl_->ApplyBookmarks(std::move(entries), std::move(callback));
+}
+void LocalSyncAdapters::ReadHistory(base::Time since, Callback callback) {
+  impl_->ReadHistory(since, std::move(callback));
+}
+void LocalSyncAdapters::ApplyHistory(base::ListValue entries, Callback callback) {
+  impl_->ApplyHistory(std::move(entries), std::move(callback));
+}
+void LocalSyncAdapters::SetOnChanged(base::RepeatingCallback<void(Stream)> callback) {
+  impl_->SetOnChanged(std::move(callback));
+}
+bool LocalSyncAdapters::ResetSyncState() { return impl_->ResetSyncState(); }
+void LocalSyncAdapters::Shutdown() { impl_->Shutdown(); }
+
+}  // namespace browseros::sync

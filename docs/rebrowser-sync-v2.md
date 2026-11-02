# Native sync protocol 2

The native browser owns reconciliation. It compares its accepted baseline, local adapter changes and a complete remote snapshot before constructing the next version. Concurrent edits and structural conflicts preserve all inputs locally and pause the affected stream. Settings show conflict summaries; no original bookmark/history data is silently discarded. Permanent tombstones prevent an old offline device from reviving a deleted identifier.

The transport uses the existing fixed authenticated Remocode origin. Native `/session` authorization yields a short-lived handle kept only in native memory. WebUI receives entitlement, consent, progress and conflict summaries, never credentials or handles.

Uploads have three explicit `/push` actions: `begin`, immutable `chunk`, and conditional `commit`. The browser persists its snapshot, base version, upload identity, stage and next chunk before sending. A chunk contains at most 200 records and fits below 256 KiB. Complete adjacent identifier intervals cover every baseline record, including tombstones. A version becomes visible only after its complete manifest passes validation and the atomic base-version condition succeeds. A lost commit response can be retried using the same upload identity. A different remote base requires refetching and merging locally.

Downloads pin an immutable version and transfer one body chunk per page. The browser applies only complete downloads. Partial downloads persist their scoped cursor and received records; resuming rechecks them against current local edits. Expired pins restart the download. Failed uploads keep their pending state. Network/server failures back off from 30 seconds to five minutes. Active native leases let ordinary cycles check versions without repeating account status lookup every 30 seconds.

Local adapters validate the complete snapshot before mutating the model or history database. Their bound matches the wire budget of 512 chunks × 200 entries (102,400), rather than the legacy 10,000-entry batch bound. A malformed late entry still rejects the whole batch. Upload creation timestamps are integer milliseconds; request construction rejects incomplete or out-of-range persisted state without unchecked optional or list access. An unpublished first-preview upload with a fractional timestamp can retain its content and identity while repairing that timestamp before begin.

A local edit against a remote deletion is a conflict, not a new put using the deleted ID. To preserve that content deliberately, save a new local copy, remove the conflicting original and retry. Folder/predecessor conflicts require editing or moving local bookmarks. All conflict originals remain in native profile metadata; settings display a bounded summary.

Cloud deletion, sign-out and switching accounts reset synchronization metadata/consent while retaining device bookmarks/history and tabs. The browser requires an explicit upgrade for unsupported server protocols and never silently switches to an old body transport.

Maintain both the materialized Chromium sources and their patch payloads. Build incrementally using `docs/chromium-build-retention.md`; do not clean or recreate the retained Chromium output. Production rollout, installation over an existing profile and releases are separate reviewed operations.

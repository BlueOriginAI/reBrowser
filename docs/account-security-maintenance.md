# Account and sync security maintenance

This source tree versions the native account/sync overlay from the installed 0.1.2 runtime, its WebUI/profile integration and its security tests. The old external source repository was removed during maintenance; the 0.1.2 bundled source archive was recovered into an independent Git repository before applying the fixes. The recovery commit records the original snapshot identity.

Backend 0.0.63 applies a single loopback Host/Origin/Fetch-Metadata boundary to REST and MCP. Unknown browser sources, forged authorities and untrusted preflights are rejected before handlers; browser CORS is limited to the signed cockpit extension. The opaque native recorder exception is restricted to its ingestion endpoint. Native MCP clients keep their originless JSON transport contract. Build and packaging gates require both instance ownership and HTTP-origin policy capability markers.

Sync path policy v2 rejects encoded authentication routes, nested escapes, encoded separators and invalid UTF-8 while preserving ordinary international and escaped-space paths. Native C++ and SaaS Worker use the same 27-case fixture. The production C++ helper can be tested independently of Chromium with `python3 packages/reBrowser/security/check_sync_url_policy.py`; the full native protocol/auth tests still require the Chromium build tree.

The user deferred the Chromium rebuild because that tree is gone and local free space is insufficient. The local 0.1.3 maintenance installation replaces only the Rust backend. **The installed native URL filter remains the previous build; the SaaS Worker fix is source-only until deployment.** Native, Worker and installed-backend validation are recorded separately. A local app with `RemocodeNativeSecurityBuildPending=true` is rejected by ordinary formal package gates; only an explicit local-maintenance packaging option may produce its installer.

No GitHub push, public release, R2 upload or production Worker deployment is authorized for this maintenance run. Local source commits and signed installation do not imply public security-release approval.

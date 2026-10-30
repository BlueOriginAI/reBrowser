# reBrowser 0.1.2

The macOS MCP backend is now 0.0.62. It rejects temporary and alternate browser profiles before opening shared state or rewriting client configuration. The default profile retains authority over the user's global MCP endpoint even while a headless test browser chooses another available port.

The protection is compiled into the backend. This release does not depend on a compatibility launcher or a sibling `reBrowser-server-core` binary. The source resource validator, compiled component validator, macOS DMG packager and macOS server OTA packager reject backends without the `rebrowser-mcp-instance-policy=1;` capability marker. Release packaging also rejects the former compatibility-launcher layout.

The arm64 maintenance installer retains the currently installed Chromium and account/sync runtime and replaces its MCP backend with the newly compiled native backend. Chromium itself is not rebuilt for this maintenance package. `SOURCE.json` records the native baseline, backend source commit, policy version, component hashes, signing and notarization results. Future releases must pass the same gates.

Acceptance requires the packaged app to be installed and restarted using the normal profile. Before temporary browser startup, while it runs and after it exits, one initialized primary MCP session must remain usable, all seven managed client endpoints must stay on 9010, and the global discovery/manifest files must be unchanged. Both a full app replacement and a normal quit/relaunch must retain the native policy; rebuilding or copying a signed app alone does not establish this.

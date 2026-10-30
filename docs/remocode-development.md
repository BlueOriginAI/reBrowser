# reBrowser development

## Repository

Fork: `BlueOriginAI/reBrowser`.
Upstream: `browseros-ai/BrowserOS`.
Local workspace: `/Users/ai/Documents/VibeApp/reBrowser`.

The `origin` remote is our fork; `upstream` is the source project. Work on local feature branches and send changes to our fork. Do not publish to upstream unless contributing an explicitly scoped change.

## Product mapping

| Build key | Display name | macOS bundle | macOS profile directory |
| --- | --- | --- | --- |
| `browseros` | reBrowser | `com.remocode.RemocodeBrowser` | RemocodeBrowser |
| `browserclaw` | reBrowser | `com.remocode.RemocodeBrowserNeo` | RemocodeBrowserNeo |

The keys are intentionally retained because the build system, API namespaces, server paths, and Chromium patch payloads use them. User-facing names change without a wholesale rename of those contracts.

## Start with the Agent interface

The main implementation lives in `packages/reBrowser-agent`:

- `apps/app`: assistant, settings, new tab.
- `apps/claw-app`: agent cockpit and replay UI.
- `apps/server`: TypeScript backend.
- `apps/claw-server-rust`: local MCP/backend for the neo variant.
- `apps/app-onboard` and `apps/claw-onboard`: onboarding.

Read the root `CONTRIBUTING.md` and the relevant app's contributing instructions. The monorepo pins Bun 1.4.2; keep that pin instead of rewriting the lockfile for an older installed Bun.

```sh
cd packages/reBrowser-agent
bun install --frozen-lockfile
```

Do not launch the existing upstream watch scripts blindly: they currently resolve installed BrowserOS applications and manage ports/profiles. Adapt their app path to our development build first. No existing browser sessions need to be closed for source work.

## Browser build

```sh
cd packages/reBrowser
uv sync
uv run browseros build --preset debug --product browseros --chromium-src /path/to/chromium/src
```

The full Chromium source and build require roughly 100GB free disk according to upstream. The agent build was compiled from our fork and installed locally on 2026-10-03. This is a local development build, not a published installer.

macOS branding has a separate bundle and profile name, and the upstream signing team is cleared from branding templates. Configure our signing identity only when preparing our own installer.

## Verification and release boundary

Product descriptors can be checked without downloading Chromium:

```sh
cd packages/reBrowser
PYTHONPATH=. python3 -m unittest bos_build.products.products_test bos_build.products.doctor_test bos_build.steps.patches.product_user_data_dir_test
```

Before distributing a build, finish the icon set, Windows/Linux profile and installation identities, update/release endpoints, extension signing identities, and cloud/analytics integration review. The extension manifests no longer point at the upstream automatic update feed. Other upstream service URLs remain and are not represented as Remocode-operated services.

Preserve license notices and provide corresponding source as required by AGPL-3.0. There is no separate closed-source license for this fork.

## macOS MCP instance ownership

Only the default `~/Library/Application Support/RemocodeBrowserNeo/.browseros/config.json` may start the global Claw sidecar. `apps/claw-server-rust/src/managed_instance.rs` resolves the actual config path and rejects temporary or alternate profiles before loading configuration, opening the shared database, publishing `~/.browserclaw/runtime.json`, or synchronizing client MCP settings. This also applies when the primary browser is closed. Normal Chromium browsing in an alternate profile remains available; that profile does not start the global agent backend. Other platforms retain their existing behavior.

The external proxy port may still advance when occupied. That port selection must never give an alternate profile authority to rewrite the user's MCP configuration. Do not use a headless reBrowser process as a replacement for the user's existing browser session. A temporary `about:blank` instance is appropriate only for an explicitly authorized startup-isolation acceptance check.

For local installations whose backend is newer than this checkout, `src/managed_launcher.rs` uses the same policy and executes a preserved sibling `reBrowser-server-core` only for the authorized profile. Compile this dependency-free launcher with `rustc --edition 2024 -O`, sign it with the app's existing identity and entitlements, and re-sign/verify the enclosing app after installing it. Keep the original server, main executable and resource signature for rollback. A future complete server build enforces the policy directly in `main.rs`; the compatibility launcher is then unnecessary. Replacing the installed application from an older release can overwrite the local guard, so include this source fix in the next release.

Focused policy verification, from `packages/reBrowser-agent`:

```sh
rustc --edition 2024 --test apps/claw-server-rust/src/managed_launcher.rs -o /tmp/rebrowser-instance-policy-tests
/tmp/rebrowser-instance-policy-tests
```

Acceptance must compare all managed MCP entries plus discovery/manifest hashes before temporary startup, while it runs, and after it exits. Keep one primary MCP session across all stages, call `tools/list` and the read-only `tabs` tool, and confirm the original primary browser/server PIDs remain unchanged. The guard must be observed rejecting the actual temporary sidecar; a passing health check alone is insufficient.

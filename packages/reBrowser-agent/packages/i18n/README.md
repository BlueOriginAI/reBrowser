# Product localization

The default preference is `system`, not English. Supported presentation locales are `en` and `zh-CN`.

## Boundaries

- A native build stores `browseros.ui_language` in the current Chromium Profile. Extensions use the existing `chrome.browserOS.getPref/setPref` API and `onUILanguageChanged` event. The onboarding WebUI uses its native state bridge to the same preference.
- The effective system language comes from the browser UI language (`chrome.i18n.getUILanguage()` or the native WebUI state), not a website's Accept-Language setting. Chinese variants resolve to Simplified Chinese; unsupported languages fall back to English.
- Older native builds can use extension-local storage as a compatibility fallback. That fallback does **not** synchronize with `chrome://` onboarding. Plain web previews use their own origin's storage and navigator language.
- User content, protocol values, code, original errors, and diagnostic exports are not translated.

## Integration

Create one runtime per entrypoint module with `createLocaleRuntime(catalogs, store)`. Await `runtime.ready` before mounting the visible app and pass it to `LocaleProvider`. Use `useLocale()` in components; its `t` function changes identity with the active locale so derived labels and validation schemas can update. Do not remount the application when the locale changes.

Keep catalogs in the owning app. Keys are flat, including keys containing dots. Use `{{name}}` interpolation and i18next plural suffixes rather than concatenating translated sentence fragments. Keep common validation and accessibility text in the catalog as well as visible labels. `catalogIssues` verifies matching keys and interpolation parameters across both locales.

Format dates and quantities with an explicit effective locale; do not change the time zone or persisted scheduling values. The legacy app continues to use its existing Day.js formatting with an instance-specific locale.

`LocaleStore.write` must reject when a write cannot be confirmed. Stores must notify other subscribers and unsubscribe native listeners when no longer used. `LocaleRuntime.dispose()` releases its store subscription, which is useful in tests and short-lived previews.

## Checks

```sh
bun run test
bun run typecheck
```

The workspace test runner includes this package. CI maps localization changes to both products, both onboarding apps, and diagnostics.

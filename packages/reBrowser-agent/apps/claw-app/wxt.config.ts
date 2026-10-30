import { REPORTER_EXTENSION_ID } from '@browseros/diagnostics/contract'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

// `entrypoints/newtab/` is WXT's conventional new-tab entrypoint. WXT
// auto-wires manifest.chrome_url_overrides.newtab to point at the
// generated newtab.html, so no hand-rolled override needed.
//
// `browserOS` is BrowserOS Chromium's permission gate for the
// new-tab override and the cockpit-adjacent surfaces.
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extensionName__',
    default_locale: 'en',
    icons: {
      16: 'branding/remocode-browser-v2/icon-16.png',
      32: 'branding/remocode-browser-v2/icon-32.png',
      48: 'branding/remocode-browser-v2/icon-48.png',
      128: 'branding/remocode-browser-v2/icon-128.png',
    },
    externally_connectable: { ids: [REPORTER_EXTENSION_ID] },
    description: '__MSG_extensionDescription__',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9Q8PqQILeuKDdES8Q7CFcfbA7NEShizI9JG5XxHTLX7BB8suYnxhCicgTuRdoK7Bwy5KgfYDPuHYSHYqA0UsHLm2Nkj1BitKOMoG/VXGlfKVy3OutbqsI87Un8i4HddlnCOVlPuPER28u7dgRcH3ujGmgt00OAxEiQMVjwcTHwxDh1rfWeXfje/mvbf0uXgD6mKofQp8zxhwtPaRmi5qF+YBYW6Bqf8rbicQcE9rphntXtufJ5HcWGzUHB1IyF+xn8oWyntB7C2RoXFYP+pMLUckbpt4T7pahbZesljAQh811pZUU8wyNM9qwNhp01Ox6Egmxr74uNi6HjFlJTTSfwIDAQAB',
    // Keep shared permissions in sync with apps/app/wxt.config.ts; additions
    // re-prompt or disable existing installs on update.
    permissions: [
      'system.cpu',
      'system.memory',
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      'alarms',
      'webNavigation',
      'downloads',
      'notifications',
    ],
    // Recording is universal; the local server owns tab attribution.
    host_permissions: ['http://127.0.0.1/*', '<all_urls>'],
    action: {
      default_icon: {
        16: 'branding/remocode-browser-v2/icon-16.png',
        32: 'branding/remocode-browser-v2/icon-32.png',
        48: 'branding/remocode-browser-v2/icon-48.png',
        128: 'branding/remocode-browser-v2/icon-128.png',
      },
      default_title: 'reBrowser',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
})

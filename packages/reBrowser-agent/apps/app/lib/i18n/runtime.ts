import { createLocaleRuntime } from '@browseros/i18n/core'
import { createExtensionLocaleStore } from '@browseros/i18n/store'
import { catalogs } from './catalogs'

export const localeRuntime = createLocaleRuntime(
  catalogs,
  createExtensionLocaleStore(),
)

if (import.meta.hot) import.meta.hot.dispose(() => localeRuntime.dispose())

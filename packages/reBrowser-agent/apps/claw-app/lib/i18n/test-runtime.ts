import { createLocaleRuntime } from '@browseros/i18n/core'
import { catalogs } from './catalogs'

export const englishTestRuntime = createLocaleRuntime(catalogs, {
  read: async () => ({ preference: 'en', systemLocale: 'en' }),
  write: async () => {},
  subscribe: () => () => {},
})
export const chineseTestRuntime = createLocaleRuntime(catalogs, {
  read: async () => ({ preference: 'zh-CN', systemLocale: 'zh-CN' }),
  write: async () => {},
  subscribe: () => () => {},
})
await Promise.all([englishTestRuntime.ready, chineseTestRuntime.ready])

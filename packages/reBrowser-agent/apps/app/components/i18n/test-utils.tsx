import { createLocaleRuntime, type Locale } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { catalogs } from '@/lib/i18n/catalogs'

const english = createLocaleRuntime(catalogs)
const chinese = createLocaleRuntime(catalogs)
await Promise.all([english.ready, chinese.ready])
await english.setPreference('en')
await chinese.setPreference('zh-CN')

export function renderWithLocale(node: ReactNode, locale: Locale = 'en') {
  return renderToStaticMarkup(
    <LocaleProvider runtime={locale === 'en' ? english : chinese}>
      {node}
    </LocaleProvider>,
  )
}

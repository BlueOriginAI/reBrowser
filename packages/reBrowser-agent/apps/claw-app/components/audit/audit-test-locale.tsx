import { createLocaleRuntime, type Locale } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import type { ReactNode } from 'react'
import { auditChinese, auditEnglish } from '@/lib/i18n/audit-supplemental'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'

const catalogs = {
  en: { ...en, ...auditEnglish },
  'zh-CN': { ...zhCN, ...auditChinese },
}
const english = createLocaleRuntime(catalogs)
const chinese = createLocaleRuntime(catalogs)
await Promise.all([english.setPreference('en'), chinese.setPreference('zh-CN')])

export function AuditTestLocaleProvider({
  children,
  locale = 'en',
}: {
  children: ReactNode
  locale?: Locale
}) {
  return (
    <LocaleProvider runtime={locale === 'en' ? english : chinese}>
      {children}
    </LocaleProvider>
  )
}

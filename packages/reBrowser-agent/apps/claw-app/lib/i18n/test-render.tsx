import { LocaleProvider } from '@browseros/i18n/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { chineseTestRuntime, englishTestRuntime } from './test-runtime'

export function renderToStaticMarkup(
  children: ReactNode,
  locale: 'en' | 'zh-CN' = 'en',
) {
  return render(
    <LocaleProvider
      runtime={locale === 'zh-CN' ? chineseTestRuntime : englishTestRuntime}
    >
      {children}
    </LocaleProvider>,
  )
}

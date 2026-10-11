import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { onboardingCatalogs } from './i18n'

const runtimes = Object.fromEntries(
  await Promise.all(
    (['en', 'zh-CN'] as const).map(async (locale) => {
      const runtime = createLocaleRuntime(onboardingCatalogs, {
        read: async () => ({ preference: locale, systemLocale: locale }),
        write: async () => {},
        subscribe: () => () => {},
      })
      await runtime.ready
      return [locale, runtime] as const
    }),
  ),
)

export function renderToStaticMarkup(
  children: ReactNode,
  locale: 'en' | 'zh-CN' = 'en',
) {
  const runtime = runtimes[locale]
  if (!runtime) throw new Error('Missing test locale')
  return render(<LocaleProvider runtime={runtime}>{children}</LocaleProvider>)
}

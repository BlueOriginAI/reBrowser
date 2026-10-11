import { LocaleProvider } from '@browseros/i18n/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/styles/global.css'
import { LocalizedToaster } from '@/components/i18n/LocalizedToaster'
import { ThemeProvider } from '@/components/theme-provider.tsx'
import { AnalyticsProvider } from '@/lib/analytics/AnalyticsProvider.tsx'
import { localeRuntime } from '@/lib/i18n/runtime'
import { QueryProvider } from '@/lib/query/QueryProvider'
import { sentryRootErrorHandler } from '@/lib/sentry/sentryRootErrorHandler.ts'
import { App } from './App'

const $root = document.getElementById('root')

async function mount() {
  await localeRuntime.ready
  document.documentElement.lang = localeRuntime.getSnapshot().locale

  if ($root) {
    ReactDOM.createRoot($root, sentryRootErrorHandler).render(
      <React.StrictMode>
        <LocaleProvider runtime={localeRuntime}>
          <QueryProvider>
            <AnalyticsProvider>
              <ThemeProvider>
                <App />
                <LocalizedToaster />
              </ThemeProvider>
            </AnalyticsProvider>
          </QueryProvider>
        </LocaleProvider>
      </React.StrictMode>,
    )
  }
}

void mount()

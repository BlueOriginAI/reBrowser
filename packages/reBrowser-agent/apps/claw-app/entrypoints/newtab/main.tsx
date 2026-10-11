/**
 * Self-hosted variable + static fonts. Importing these here ships the
 * font files inside the extension bundle so the cockpit does not depend
 * on Google's CDN (chrome-extension:// + googleapis.com pairing would
 * either need broad host_permissions or a noticeable FOUC on cold
 * loads). Variable Schibsted Grotesk + JetBrains Mono carry the full
 * weight range in a single file. Schibsted's italic face is imported for
 * the cockpit hero, while Newsreader italic remains for editorial accents.
 */
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource/newsreader/400-italic.css'
import '@fontsource/newsreader/500-italic.css'
import '@fontsource-variable/jetbrains-mono'

import { LocaleProvider } from '@browseros/i18n/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LocalizedToaster } from '@/components/localized/LocalizedToaster'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { localeRuntime } from '@/lib/i18n/runtime'
import { queryClient } from '@/modules/api/queryClient'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

await localeRuntime.ready
document.documentElement.lang = localeRuntime.getSnapshot().locale

createRoot(root).render(
  <StrictMode>
    <LocaleProvider runtime={localeRuntime}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delay={0}>
          <ThemeProvider>
            <App />
            <LocalizedToaster />
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </LocaleProvider>
  </StrictMode>,
)

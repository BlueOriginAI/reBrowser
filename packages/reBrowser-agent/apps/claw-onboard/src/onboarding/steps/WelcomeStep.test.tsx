import { describe, expect, it } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { onboardingCatalogs } from '@/i18n'
import { renderToStaticMarkup } from '../../test-locale'
import { WelcomeStep } from './WelcomeStep'

function renderWelcome() {
  const runtime = createLocaleRuntime(onboardingCatalogs, {
    read: async () => ({ preference: 'en', systemLocale: 'en-US' }),
    write: async () => undefined,
    subscribe: () => () => undefined,
  })
  return renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>
      <WelcomeStep onPrimary={() => undefined} onSkip={() => undefined} />
    </LocaleProvider>,
  )
}

describe('WelcomeStep', () => {
  it('renders the setup CTA with an explicit English locale runtime', () => {
    const html = renderWelcome()
    expect(html).toContain('Your second browser')
    expect(html).toContain('Set it up')
    expect(html).toContain('Already set up? Reconnect.')
  })
})

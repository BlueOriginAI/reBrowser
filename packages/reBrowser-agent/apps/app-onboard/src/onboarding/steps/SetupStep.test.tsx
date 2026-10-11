import { describe, expect, it } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { onboardingCatalogs } from '@/i18n'
import { renderToStaticMarkup } from '../../test-locale'
import { SetupStep } from './SetupStep'

function renderSetup(failed: boolean) {
  const runtime = createLocaleRuntime(onboardingCatalogs, {
    read: async () => ({ preference: 'en', systemLocale: 'en-US' }),
    write: async () => undefined,
    subscribe: () => () => undefined,
  })
  return renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>
      <SetupStep failed={failed} onRetry={() => {}} />
    </LocaleProvider>,
  )
}

describe('SetupStep', () => {
  it('announces preparation with an indeterminate themed indicator', () => {
    const html = renderSetup(false)
    expect(html).toContain('Finishing setup')
    expect(html).toContain(
      'Preparing BrowserOS. This should only take a moment.',
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('motion-safe:animate-spin')
    expect(html).toContain('text-accent')
    expect(html).not.toContain('aria-valuenow')
    expect(html).not.toContain('Retry')
  })

  it('announces a recoverable failure with one primary Retry action', () => {
    const html = renderSetup(true)
    expect(html).toContain('Setup didn’t finish')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Retry')
    expect(html).toContain('bg-primary')
    expect(html).not.toContain('animate-spin')
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})

import { describe, expect, it } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { MemoryRouter } from 'react-router'
import { onboardingCatalogs } from '@/i18n'
import { renderToStaticMarkup } from '../test-locale'
import { createBrowserOSOnboardingBridge } from './browseros-onboarding-bridge'
import { importPhaseFor, OnboardingV2 } from './OnboardingV2'

function renderApp(): string {
  const runtime = createLocaleRuntime(onboardingCatalogs, {
    read: async () => ({ preference: 'en', systemLocale: 'en-US' }),
    write: async () => undefined,
    subscribe: () => () => undefined,
  })
  return renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>
      <MemoryRouter>
        <OnboardingV2
          bridge={createBrowserOSOnboardingBridge({ chrome: null })}
        />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

describe('OnboardingV2 shell', () => {
  it('lands on step 0 with the welcome heading and primary CTA', () => {
    const html = renderApp()
    expect(html).toContain('Your second browser. For your')
    expect(html).toContain('agents.')
    expect(html).toContain('Set it up')
  })

  // The screen must not read as a Chrome replacement: reBrowser is a
  // secondary browser whose user is an agent, not the person installing it.
  it('states the secondary-browser position rather than reselling the product', () => {
    const html = renderApp()
    expect(html).toContain('Not a Chrome replacement.')
    expect(html).not.toContain('Let your AI')
    expect(html).not.toContain('actually')
  })

  it('renders the visual rail with the v2 quote and three feature blocks', () => {
    const html = renderApp()
    expect(html).toContain('reBrowser')
    expect(html).toContain('Not yours.')
    expect(html).toContain('Signed in as you.')
    expect(html).toContain('Watch every step.')
    expect(html).toContain('Everything stays local.')
  })

  it('renders a full-page main landmark without the fake macOS window chrome', () => {
    const html = renderApp()
    expect(html).toContain('<main')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('Welcome to reBrowser')
    expect(html).not.toContain('#FF5F57')
  })

  it('renders three step dots', () => {
    const html = renderApp()
    const matches = html.match(/data-step-dot="true"/g) ?? []
    expect(html).toContain('aria-label="Onboarding progress"')
    expect(matches.length).toBe(3)
  })

  it('does not treat failed or completed Chromium states as import success', () => {
    expect(importPhaseFor('failed')).toBe('failed')
    expect(importPhaseFor('completed')).toBe('picker')
    expect(importPhaseFor('idle')).toBe('picker')
  })
})

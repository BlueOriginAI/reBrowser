import { describe, expect, it, mock } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import * as _rerouteHooks from '@/modules/api/reroute.hooks'

const testLocaleRuntime = createLocaleRuntime({ en, 'zh-CN': zhCN })

let rerouteStateOverride: _rerouteHooks.RerouteState = {
  signedIn: true,
  email: 'user@example.com',
  displayName: 'AI',
  entitlement: 'free',
  isPro: false,
  selfInstallationId: 'inst-laptop',
  selfDeviceName: 'MacBook Pro',
  allowIncomingReroute: true,
  relayConnected: true,
  devices: [
    {
      installationId: 'inst-laptop',
      deviceName: 'MacBook Pro',
      os: 'macos',
      appVersion: '0.1.5',
      online: true,
      allowIncoming: true,
      isSelf: true,
    },
    {
      installationId: 'inst-home',
      deviceName: 'Home Mac Studio',
      os: 'macos',
      appVersion: '0.1.5',
      online: true,
      allowIncoming: true,
      rttMs: 14,
      isSelf: false,
    },
  ],
}

mock.module('@/modules/api/reroute.hooks', () => ({
  ..._rerouteHooks,
  useRerouteState: Object.assign(
    () => ({ data: rerouteStateOverride, isLoading: false, isError: false }),
    { getKey: () => ['api', 'reroute', 'state'] },
  ),
  useSetRerouteTarget: () => ({
    mutateAsync: async () => rerouteStateOverride,
  }),
  useSetReroutePreferences: () => ({
    mutateAsync: async () => rerouteStateOverride,
  }),
}))

const { RerouteDeviceBar } = await import('./RerouteDeviceBar')

function renderBar(): string {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <LocaleProvider runtime={testLocaleRuntime}>
      <QueryClientProvider client={client}>
        <RerouteDeviceBar />
      </QueryClientProvider>
    </LocaleProvider>,
  )
}

describe('RerouteDeviceBar', () => {
  it('renders online peer devices and Pro upgrade hint for free accounts', () => {
    const html = renderBar()
    expect(html).toContain('Cross-Device Execution (reBrowser Reroute)')
    expect(html).toContain('Home Mac Studio')
    expect(html).toContain('14ms')
    expect(html).toContain('Upgrade to reBrowser Pro')
  })

  it('hides Pro hint once subscribed as Pro', () => {
    rerouteStateOverride = {
      ...rerouteStateOverride,
      entitlement: 'active',
      isPro: true,
    }
    const html = renderBar()
    expect(html).toContain('Home Mac Studio')
    expect(html).not.toContain('Upgrade to reBrowser Pro')
  })
})

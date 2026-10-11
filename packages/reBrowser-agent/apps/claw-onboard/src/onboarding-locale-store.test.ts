import { expect, test } from 'bun:test'
import type { BrowserOSOnboardingState } from './onboarding/browseros-onboarding-api'
import type { BrowserOSOnboardingBridge } from './onboarding/browseros-onboarding-bridge'
import { createOnboardingLocaleStore } from './onboarding-locale-store'

function fixture() {
  const subscribers = new Set<(state: BrowserOSOnboardingState) => void>()
  const sent: string[] = []
  const bridge: BrowserOSOnboardingBridge = {
    isMock: false,
    complete() {},
    pageReady() {},
    refreshSources() {},
    retrySetup() {},
    startImport() {},
    setUILanguagePreference: (preference) => {
      sent.push(preference)
    },
    registerReceiver: () => () => {},
    subscribe: (listener) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
  }
  const publish = (fields: Partial<BrowserOSOnboardingState>) => {
    for (const listener of subscribers)
      listener({ apiVersion: 1, status: 'ready', sources: [], ...fields })
  }
  return { bridge, sent, subscribers, publish }
}

test('native locale updates are shared and writes wait for explicit confirmation', async () => {
  const { bridge, publish, sent, subscribers } = fixture()
  const store = createOnboardingLocaleStore(bridge)
  const received: string[] = []
  const unsubscribe = store.subscribe((state) =>
    received.push(state.preference),
  )
  publish({ uiLanguagePreference: 'system', systemUiLanguage: 'zh-CN' })
  expect(await store.read()).toEqual({
    preference: 'system',
    systemLocale: 'zh-CN',
  })
  let saved = false
  const pending = store.write('en').then(() => {
    saved = true
  })
  expect(sent).toEqual(['en'])
  publish({ status: 'importing' })
  await Promise.resolve()
  expect(saved).toBe(false)
  publish({ uiLanguagePreference: 'en', systemUiLanguage: 'zh-CN' })
  await pending
  expect(saved).toBe(true)
  expect(received.at(-1)).toBe('en')
  unsubscribe()
  expect(subscribers.size).toBe(0)
})

test('old v1 hosts open immediately but do not claim they saved an unsupported preference', async () => {
  const { bridge, publish, sent } = fixture()
  const store = createOnboardingLocaleStore(bridge)
  const unsubscribe = store.subscribe(() => {})
  publish({ status: 'ready' })
  expect((await store.read()).preference).toBe('system')
  await expect(store.write('zh-CN')).rejects.toThrow('cannot save')
  expect(sent).toEqual([])
  unsubscribe()
})

test('disposing a store releases its native listener and rejects pending writes', async () => {
  const { bridge, publish, subscribers } = fixture()
  const store = createOnboardingLocaleStore(bridge)
  const unsubscribe = store.subscribe(() => {})
  publish({ uiLanguagePreference: 'system', systemUiLanguage: 'en' })
  const pending = store.write('zh-CN')
  unsubscribe()
  await expect(pending).rejects.toThrow('disposed')
  expect(subscribers.size).toBe(0)
})

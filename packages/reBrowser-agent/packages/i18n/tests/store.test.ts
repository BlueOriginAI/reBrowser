import { afterEach, expect, test } from 'bun:test'
import { browserUILanguage } from '../src/core'
import { createExtensionLocaleStore, UI_LANGUAGE_PREF } from '../src/store'

const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)

afterEach(() => {
  if (originalChrome)
    Object.defineProperty(globalThis, 'chrome', originalChrome)
  else Reflect.deleteProperty(globalThis, 'chrome')
  if (originalStorage)
    Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

function installHost(value: unknown) {
  Object.defineProperty(globalThis, 'chrome', { value, configurable: true })
}

test('uses browser UI language rather than a web page language', () => {
  installHost({ i18n: { getUILanguage: () => 'zh-HK' } })
  expect(browserUILanguage()).toBe('zh-HK')
})

test('native preference is authoritative and changes cross stores', async () => {
  let preference = 'system'
  const nativeListeners = new Set<(preference: string) => void>()
  installHost({
    i18n: { getUILanguage: () => 'zh-CN' },
    browserOS: {
      getPref: (key: string, done: (value: { value: string }) => void) => {
        expect(key).toBe(UI_LANGUAGE_PREF)
        done({ value: preference })
      },
      setPref: (
        key: string,
        value: string,
        _page: string,
        done: (success: boolean) => void,
      ) => {
        expect(key).toBe(UI_LANGUAGE_PREF)
        preference = value
        for (const listener of nativeListeners) listener(value)
        done(true)
      },
      onUILanguageChanged: {
        addListener: (listener: (preference: string) => void) =>
          nativeListeners.add(listener),
        removeListener: (listener: (preference: string) => void) =>
          nativeListeners.delete(listener),
      },
    },
  })
  const first = createExtensionLocaleStore()
  const second = createExtensionLocaleStore()
  const changes: string[] = []
  const unsubscribe = second.subscribe((state) =>
    changes.push(state.preference),
  )
  expect((await first.read()).preference).toBe('system')
  await first.write('en')
  expect((await second.read()).preference).toBe('en')
  expect(changes).toEqual(['en'])
  unsubscribe()
  expect(nativeListeners.size).toBe(0)
})

test('older native builds fall back to extension storage without writing other native prefs', async () => {
  const values: Record<string, unknown> = {}
  const runtime: { lastError?: { message: string } } = {}
  installHost({
    runtime,
    i18n: { getUILanguage: () => 'en' },
    browserOS: {
      getPref: (_key: string, done: (value: unknown) => void) => {
        runtime.lastError = {
          message: `Preference not found: ${UI_LANGUAGE_PREF}`,
        }
        done(undefined)
        delete runtime.lastError
      },
    },
    storage: {
      local: {
        get: (key: string, done: (value: unknown) => void) =>
          done({ [key]: values[key] }),
        set: (next: Record<string, unknown>, done: () => void) => {
          Object.assign(values, next)
          done()
        },
      },
    },
  })
  const store = createExtensionLocaleStore()
  await store.write('zh-CN')
  expect((await store.read()).preference).toBe('zh-CN')
})

test('native errors are not converted into successful fallback writes', async () => {
  let writes = 0
  const runtime: { lastError?: { message: string } } = {}
  installHost({
    runtime,
    browserOS: {
      getPref: (_key: string, done: (value: unknown) => void) => {
        runtime.lastError = { message: 'Access denied' }
        done(undefined)
        delete runtime.lastError
      },
    },
    storage: {
      local: {
        get: (_key: string, done: (value: unknown) => void) => done({}),
        set: (_next: unknown, done: () => void) => {
          writes += 1
          done()
        },
      },
    },
  })
  await expect(createExtensionLocaleStore().write('zh-CN')).rejects.toThrow(
    'Access denied',
  )
  expect(writes).toBe(0)
})

test('blocked preview storage does not claim a successful save', async () => {
  installHost(undefined)
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('Storage blocked')
    },
  })
  const store = createExtensionLocaleStore()
  expect((await store.read()).preference).toBe('system')
  await expect(store.write('zh-CN')).rejects.toThrow('Storage blocked')
})

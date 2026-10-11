import { describe, expect, test } from 'bun:test'
import {
  catalogIssues,
  createLocaleRuntime,
  type LocaleState,
  type LocaleStore,
  normalizePreference,
  resolveLocale,
} from '../src/core'
import { formatDate, formatNumber, formatRelativeTime } from '../src/format'

const catalogs = {
  en: {
    greeting: 'Hello {{name}}',
    items_one: '{{count}} item',
    items_other: '{{count}} items',
  },
  'zh-CN': {
    greeting: '你好，{{name}}',
    items_one: '{{count}} 项',
    items_other: '{{count}} 项',
  },
}

function mockStore(initial: LocaleState) {
  let state = initial
  const listeners = new Set<(state: LocaleState) => void>()
  const publish = (next: LocaleState) => {
    state = next
    for (const listener of listeners) listener(next)
  }
  const store: LocaleStore = {
    read: async () => state,
    write: async (preference) => publish({ ...state, preference }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return { store, publish, listeners }
}

describe('locale resolution', () => {
  test('defaults to system and maps Chinese variants without changing time zone', () => {
    for (const invalid of [undefined, null, '', 'fr', {}, 1]) {
      expect(normalizePreference(invalid)).toBe('system')
    }
    for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK', 'ZH_cn']) {
      expect(resolveLocale('system', language)).toBe('zh-CN')
    }
    for (const language of ['en-GB', 'de', 'fr-FR', '', 'zhuang']) {
      expect(resolveLocale('system', language)).toBe('en')
    }
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
    expect(resolveLocale('zh-CN', 'en')).toBe('zh-CN')
  })

  test('catalog validation catches missing and mismatched parameters', () => {
    expect(catalogIssues(catalogs)).toEqual([])
    expect(
      catalogIssues({
        en: { a: 'Hi {{name}}', b: 'Save' },
        'zh-CN': { a: '你好 {{user}}' },
      }),
    ).toEqual([
      'Different interpolation parameters: a',
      'Missing translation: b',
    ])
  })
})

describe('locale runtime', () => {
  test('rapid changes are persisted in order and a new runtime restores the choice', async () => {
    const { store } = mockStore({ preference: 'system', systemLocale: 'zh-CN' })
    const first = createLocaleRuntime(catalogs, store)
    await first.ready
    await Promise.all([
      first.setPreference('en'),
      first.setPreference('zh-CN'),
      first.setPreference('en'),
    ])
    first.dispose()
    const restarted = createLocaleRuntime(catalogs, store)
    await restarted.ready
    expect(restarted.getSnapshot().preference).toBe('en')
    expect(restarted.getSnapshot().locale).toBe('en')
    restarted.dispose()
  })

  test('invalid preferences cannot be written', async () => {
    const { store } = mockStore({ preference: 'system', systemLocale: 'en' })
    const runtime = createLocaleRuntime(catalogs, store)
    await runtime.ready
    // @ts-expect-error Invalid values can arrive at a JS boundary.
    await expect(runtime.setPreference('fr')).rejects.toThrow(
      'Unsupported language',
    )
    expect((await store.read()).preference).toBe('system')
    runtime.dispose()
  })

  test('initializes from system, formats plurals and saves explicit preference', async () => {
    const { store, listeners } = mockStore({
      preference: 'system',
      systemLocale: 'zh-TW',
    })
    const runtime = createLocaleRuntime(catalogs, store)
    await runtime.ready
    expect(runtime.getSnapshot().locale).toBe('zh-CN')
    expect(runtime.t('greeting', { name: '用户' })).toBe('你好，用户')
    expect(runtime.t('items', { count: 2 })).toBe('2 项')
    await runtime.setPreference('en')
    expect(runtime.t('items', { count: 1 })).toBe('1 item')
    expect(runtime.t('items', { count: 2 })).toBe('2 items')
    expect((await store.read()).preference).toBe('en')
    runtime.dispose()
    expect(listeners.size).toBe(0)
  })

  test('two pages follow one store, explicit override and returning to system', async () => {
    const { store, publish } = mockStore({
      preference: 'system',
      systemLocale: 'en-US',
    })
    const first = createLocaleRuntime(catalogs, store)
    const second = createLocaleRuntime(catalogs, store)
    await Promise.all([first.ready, second.ready])
    await first.setPreference('zh-CN')
    expect(second.getSnapshot().locale).toBe('zh-CN')
    publish({ preference: 'zh-CN', systemLocale: 'fr-FR' })
    expect(second.getSnapshot().locale).toBe('zh-CN')
    await second.setPreference('system')
    expect(first.getSnapshot().locale).toBe('en')
    first.dispose()
    second.dispose()
  })

  test('a newer notification wins over a stale initial read', async () => {
    let finishRead!: (state: LocaleState) => void
    let notify!: (state: LocaleState) => void
    const runtime = createLocaleRuntime(catalogs, {
      read: () =>
        new Promise((resolve) => {
          finishRead = resolve
        }),
      write: async () => {},
      subscribe: (listener) => {
        notify = listener
        return () => {}
      },
    })
    notify({ preference: 'zh-CN', systemLocale: 'en' })
    finishRead({ preference: 'system', systemLocale: 'en' })
    await runtime.ready
    expect(runtime.getSnapshot().locale).toBe('zh-CN')
    runtime.dispose()
  })

  test('a failed write leaves the previous preference intact', async () => {
    const { store } = mockStore({ preference: 'en', systemLocale: 'zh-CN' })
    store.write = async () => {
      throw new Error('denied')
    }
    const runtime = createLocaleRuntime(catalogs, store)
    await runtime.ready
    await expect(runtime.setPreference('zh-CN')).rejects.toThrow('denied')
    expect(runtime.getSnapshot().preference).toBe('en')
    runtime.dispose()
  })

  test('read failure opens the app and missing Chinese keys fall back to English', async () => {
    const { store } = mockStore({ preference: 'zh-CN', systemLocale: 'en' })
    const runtime = createLocaleRuntime(
      { en: { title: 'Title' }, 'zh-CN': {} },
      store,
    )
    await runtime.ready
    expect(runtime.t('title')).toBe('Title')
    runtime.dispose()
    store.read = async () => {
      throw new Error('unavailable')
    }
    const unavailable = createLocaleRuntime(catalogs, store)
    await expect(unavailable.ready).resolves.toBeUndefined()
    unavailable.dispose()
  })
})

test('date, number and relative time use explicit locale', () => {
  const date = new Date('2026-10-08T12:00:00Z')
  const options = {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  } as const
  expect(formatDate(date, 'zh-CN', options)).toBe('2026年10月8日')
  expect(formatDate(date, 'en', options)).toBe('October 8, 2026')
  expect(formatRelativeTime(-1, 'day', 'zh-CN')).toBe('昨天')
  expect(formatRelativeTime(-1, 'day', 'en')).toBe('yesterday')
  expect(formatNumber(12345, 'zh-CN')).toBe('12,345')
  expect(formatDate('not a date', 'en')).toBe('—')
})

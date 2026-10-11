import { createInstance, type i18n } from 'i18next'

export type Locale = 'en' | 'zh-CN'
export type LocalePreference = Locale | 'system'
export type Catalog = Record<string, string>
export type Catalogs = Record<Locale, Catalog>
export type TranslationOptions = Record<string, unknown>

export interface LocaleState {
  preference: LocalePreference
  systemLocale: string
}

export interface LocaleStore {
  read(): Promise<LocaleState>
  write(preference: LocalePreference): Promise<void>
  subscribe(listener: (state: LocaleState) => void): () => void
}

export interface LocaleSnapshot extends LocaleState {
  locale: Locale
}

export interface LocaleRuntime {
  ready: Promise<void>
  instance: i18n
  t(key: string, options?: TranslationOptions): string
  getSnapshot(): LocaleSnapshot
  setPreference(preference: LocalePreference): Promise<void>
  subscribe(listener: () => void): () => void
  dispose(): void
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || value === 'en' || value === 'zh-CN'
}

export function normalizePreference(value: unknown): LocalePreference {
  return isLocalePreference(value) ? value : 'system'
}

export function resolveLocale(
  preference: LocalePreference,
  systemLocale: string,
): Locale {
  if (preference !== 'system') return preference
  return /^zh(?:[-_]|$)/i.test(systemLocale) ? 'zh-CN' : 'en'
}

export function browserUILanguage(): string {
  const host = globalThis as typeof globalThis & {
    chrome?: { i18n?: { getUILanguage?: () => string } }
  }
  try {
    const language = host.chrome?.i18n?.getUILanguage?.()
    if (language) return language
  } catch {
    // Plain web previews do not have the extension API.
  }
  return typeof navigator === 'undefined'
    ? 'en'
    : navigator.languages?.[0] || navigator.language || 'en'
}

function memoryStore(): LocaleStore {
  let state: LocaleState = {
    preference: 'system',
    systemLocale: browserUILanguage(),
  }
  const listeners = new Set<(state: LocaleState) => void>()
  return {
    read: async () => state,
    write: async (preference) => {
      state = { ...state, preference }
      for (const listener of listeners) listener(state)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function createLocaleRuntime(
  catalogs: Catalogs,
  store: LocaleStore = memoryStore(),
): LocaleRuntime {
  const instance = createInstance()
  let snapshot: LocaleSnapshot = {
    preference: 'system',
    systemLocale: browserUILanguage(),
    locale: resolveLocale('system', browserUILanguage()),
  }
  const initialized = instance.init({
    lng: snapshot.locale,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    load: 'currentOnly',
    resources: {
      en: { translation: catalogs.en },
      'zh-CN': { translation: catalogs['zh-CN'] },
    },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    initAsync: false,
  })
  const listeners = new Set<() => void>()
  let revision = 0
  let disposed = false
  const apply = (state: LocaleState) => {
    if (disposed) return
    const preference = normalizePreference(state.preference)
    const systemLocale = state.systemLocale || browserUILanguage()
    const locale = resolveLocale(preference, systemLocale)
    if (
      snapshot.preference === preference &&
      snapshot.systemLocale === systemLocale &&
      snapshot.locale === locale
    ) {
      return
    }
    snapshot = { preference, systemLocale, locale }
    // All resources are bundled: changing language never waits for the network.
    void instance.changeLanguage(locale)
    for (const listener of listeners) listener()
  }
  const unsubscribe = store.subscribe((state) => {
    revision += 1
    apply(state)
  })
  const initialRevision = revision
  const ready = Promise.all([initialized, store.read()])
    .then(([, state]) => {
      if (revision === initialRevision) apply(state)
    })
    .catch(() => {
      // An unavailable preference must not prevent the app from opening.
    })
  let pendingWrite = Promise.resolve()
  return {
    ready,
    instance,
    t: (key, options) => String(instance.t(key, options ?? {})),
    getSnapshot: () => snapshot,
    setPreference: (preference) => {
      if (disposed)
        return Promise.reject(new Error('Locale runtime is disposed'))
      if (!isLocalePreference(preference)) {
        return Promise.reject(new Error('Unsupported language preference'))
      }
      const write = pendingWrite
        .catch(() => {})
        .then(async () => {
          await ready
          if (disposed) throw new Error('Locale runtime is disposed')
          await store.write(preference)
          const beforeRead = revision
          const state = await store.read()
          if (revision === beforeRead) apply(state)
        })
      pendingWrite = write
      return write
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      unsubscribe()
      listeners.clear()
    },
  }
}

export function catalogIssues(catalogs: Catalogs): string[] {
  const issues: string[] = []
  const keys = new Set([
    ...Object.keys(catalogs.en),
    ...Object.keys(catalogs['zh-CN']),
  ])
  const parameters = (text: string) =>
    [...text.matchAll(/\{\{\s*([^},\s]+)(?:,[^}]*)?\s*\}\}/g)]
      .map((match) => match[1])
      .sort()
      .join(',')
  for (const key of keys) {
    const english = catalogs.en[key]
    const chinese = catalogs['zh-CN'][key]
    if (!english?.trim() || !chinese?.trim())
      issues.push(`Missing translation: ${key}`)
    else if (parameters(english) !== parameters(chinese)) {
      issues.push(`Different interpolation parameters: ${key}`)
    }
  }
  return issues
}

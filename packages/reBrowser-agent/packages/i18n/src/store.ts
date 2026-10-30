import {
  browserUILanguage,
  type LocalePreference,
  type LocaleState,
  type LocaleStore,
  normalizePreference,
} from './core'

export const UI_LANGUAGE_PREF = 'browseros.ui_language'
const FALLBACK_KEY = 'browseros:ui-language'

type Listener<T> = {
  addListener(listener: T): void
  removeListener(listener: T): void
}

interface BrowserHost {
  runtime?: { lastError?: { message?: string } }
  browserOS?: {
    getPref?(name: string, callback: (pref: { value: unknown }) => void): void
    setPref?(
      name: string,
      value: string,
      pageId: string,
      callback: (success: boolean) => void,
    ): void
    onUILanguageChanged?: Listener<(preference: string) => void>
  }
  storage?: {
    local?: {
      get(
        key: string,
        callback: (values: Record<string, unknown>) => void,
      ): void
      set(values: Record<string, unknown>, callback: () => void): void
    }
    onChanged?: Listener<
      (changes: Record<string, { newValue?: unknown }>, area: string) => void
    >
  }
}

function host(): BrowserHost | undefined {
  return (globalThis as typeof globalThis & { chrome?: BrowserHost }).chrome
}

function callNative<T>(
  invoke: (callback: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let completed = false
    const timer = setTimeout(() => {
      completed = true
      reject(new Error('Language preference request timed out'))
    }, 3000)
    try {
      invoke((value) => {
        if (completed) return
        completed = true
        clearTimeout(timer)
        const message = host()?.runtime?.lastError?.message
        if (message) reject(new Error(message))
        else resolve(value)
      })
    } catch (error) {
      completed = true
      clearTimeout(timer)
      reject(error)
    }
  })
}

/** Native Profile prefs are authoritative; fallback storage is for older builds/previews. */
export function createExtensionLocaleStore(): LocaleStore {
  const listeners = new Set<(state: LocaleState) => void>()
  let nativeAvailable: boolean | undefined
  let revision = 0
  const state = (preference: unknown): LocaleState => ({
    preference: normalizePreference(preference),
    systemLocale: browserUILanguage(),
  })
  const publish = (next: LocaleState) => {
    revision += 1
    for (const listener of listeners) listener(next)
  }
  const readFallback = async (): Promise<LocaleState> => {
    const storage = host()?.storage?.local
    if (storage) {
      const values = await callNative<Record<string, unknown>>((done) =>
        storage.get(FALLBACK_KEY, done),
      )
      return state(values[FALLBACK_KEY])
    }
    try {
      return state(globalThis.localStorage?.getItem(FALLBACK_KEY))
    } catch {
      return state('system')
    }
  }
  const read = async (): Promise<LocaleState> => {
    const api = host()?.browserOS
    if (api?.getPref) {
      try {
        const pref = await callNative<{ value: unknown }>((done) =>
          api.getPref?.(UI_LANGUAGE_PREF, done),
        )
        nativeAvailable = true
        return state(pref.value)
      } catch (error) {
        // Only the native API's explicit missing-pref response identifies an old build.
        // Timeouts and permission/service errors must never become a successful local save.
        const missingPref =
          error instanceof Error &&
          error.message === `Preference not found: ${UI_LANGUAGE_PREF}`
        if (nativeAvailable === true || !missingPref) throw error
        nativeAvailable = false
      }
    }
    return readFallback()
  }
  const onNative = (preference: string) => {
    nativeAvailable = true
    publish(state(preference))
  }
  const onStorage = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (
      nativeAvailable !== true &&
      area === 'local' &&
      FALLBACK_KEY in changes
    ) {
      publish(state(changes[FALLBACK_KEY]?.newValue))
    }
  }
  const onWebStorage = (event: StorageEvent) => {
    if (
      nativeAvailable !== true &&
      (event.key === FALLBACK_KEY || event.key === null)
    ) {
      publish(state(event.newValue))
    }
  }
  const refresh = () => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    )
      return
    const before = revision
    void read()
      .then((next) => {
        if (revision === before) publish(next)
      })
      .catch(() => {})
  }
  return {
    read,
    write: async (preference: LocalePreference) => {
      await read()
      const api = host()?.browserOS
      if (nativeAvailable) {
        if (!api?.setPref) throw new Error('Language preference is read-only')
        const success = await callNative<boolean>((done) =>
          api.setPref?.(UI_LANGUAGE_PREF, preference, '', done),
        )
        if (!success) throw new Error('Could not save language preference')
      } else {
        const storage = host()?.storage?.local
        if (storage) {
          await callNative<void>((done) =>
            storage.set({ [FALLBACK_KEY]: preference }, done),
          )
        } else {
          // A blocked storage write must surface instead of claiming persistence.
          if (typeof localStorage === 'undefined')
            throw new Error('Storage unavailable')
          localStorage.setItem(FALLBACK_KEY, preference)
        }
      }
      publish(state(preference))
    },
    subscribe: (listener) => {
      if (listeners.size === 0) {
        host()?.browserOS?.onUILanguageChanged?.addListener(onNative)
        host()?.storage?.onChanged?.addListener(onStorage)
        if (typeof window !== 'undefined') {
          window.addEventListener('storage', onWebStorage)
          window.addEventListener('focus', refresh)
          document.addEventListener('visibilitychange', refresh)
          window.addEventListener('languagechange', refresh)
        }
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size !== 0) return
        host()?.browserOS?.onUILanguageChanged?.removeListener(onNative)
        host()?.storage?.onChanged?.removeListener(onStorage)
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', onWebStorage)
          window.removeEventListener('focus', refresh)
          document.removeEventListener('visibilitychange', refresh)
          window.removeEventListener('languagechange', refresh)
        }
      }
    },
  }
}

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react'
import { I18nextProvider } from 'react-i18next'
import type { LocaleRuntime, TranslationOptions } from './core'

const LocaleContext = createContext<LocaleRuntime | null>(null)

export function LocaleProvider({
  runtime,
  children,
}: {
  runtime: LocaleRuntime
  children?: ReactNode
}) {
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  )
  useEffect(() => {
    document.documentElement.lang = snapshot.locale
  }, [snapshot.locale])
  return (
    <LocaleContext.Provider value={runtime}>
      <I18nextProvider i18n={runtime.instance}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const runtime = useContext(LocaleContext)
  if (!runtime) throw new Error('useLocale requires a LocaleProvider')
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  )
  const t = useCallback(
    (key: string, options?: TranslationOptions) =>
      String(runtime.instance.t(key, { ...options, lng: snapshot.locale })),
    [runtime, snapshot.locale],
  )
  return { ...snapshot, t, setPreference: runtime.setPreference }
}

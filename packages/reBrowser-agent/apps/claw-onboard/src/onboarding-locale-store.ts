import {
  browserUILanguage,
  isLocalePreference,
  type LocalePreference,
  type LocaleState,
  type LocaleStore,
} from '@browseros/i18n/core'
import { createExtensionLocaleStore } from '@browseros/i18n/store'
import type { BrowserOSOnboardingBridge } from './onboarding/browseros-onboarding-bridge'

export function createOnboardingLocaleStore(
  bridge: BrowserOSOnboardingBridge,
): LocaleStore {
  if (bridge.isMock) return createExtensionLocaleStore()
  let state: LocaleState = {
    preference: 'system',
    systemLocale: browserUILanguage(),
  }
  let supported = false
  let detach: (() => void) | undefined
  const listeners = new Set<(state: LocaleState) => void>()
  const pending = new Set<{
    preference: LocalePreference
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  return {
    read: async () => state,
    write: (preference) => {
      if (!supported)
        return Promise.reject(
          new Error('This browser version cannot save the onboarding language'),
        )
      return new Promise<void>((resolve, reject) => {
        const request = {
          preference,
          resolve,
          reject,
          timer: setTimeout(() => {
            pending.delete(request)
            reject(
              new Error('Language preference was not confirmed by the host'),
            )
          }, 5000),
        }
        pending.add(request)
        try {
          bridge.setUILanguagePreference(preference)
        } catch (error) {
          pending.delete(request)
          clearTimeout(request.timer)
          reject(error)
        }
      })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      if (!detach) {
        detach = bridge.subscribe((native) => {
          if (isLocalePreference(native.uiLanguagePreference)) {
            supported = true
            state = { ...state, preference: native.uiLanguagePreference }
          }
          if (native.systemUiLanguage)
            state = { ...state, systemLocale: native.systemUiLanguage }
          for (const changed of listeners) changed(state)
          // Only an explicit host acknowledgement can finish a pending write.
          for (const request of pending) {
            if (native.uiLanguagePreference !== request.preference) continue
            pending.delete(request)
            clearTimeout(request.timer)
            request.resolve()
          }
        })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size) return
        detach?.()
        detach = undefined
        for (const request of pending) {
          clearTimeout(request.timer)
          request.reject(new Error('Language store was disposed'))
        }
        pending.clear()
      }
    },
  }
}

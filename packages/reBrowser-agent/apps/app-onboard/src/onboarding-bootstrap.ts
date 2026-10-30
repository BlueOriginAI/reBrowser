import type { LocaleRuntime } from '@browseros/i18n/core'
import type { BrowserOSOnboardingBridge } from './onboarding/browseros-onboarding-bridge'

export async function prepareOnboardingLocale(
  bridge: BrowserOSOnboardingBridge,
  runtime: LocaleRuntime,
): Promise<void> {
  if (!bridge.isMock) {
    // Read the first native state before paint, including a saved language override.
    // Old/unresponsive hosts still open instead of leaving an empty WebUI forever.
    await new Promise<void>((resolve) => {
      let finished = false
      let detach = () => {}
      const finish = () => {
        if (finished) return
        finished = true
        queueMicrotask(() => {
          clearTimeout(timer)
          detach()
          resolve()
        })
      }
      const timer = setTimeout(finish, 1500)
      detach = bridge.registerReceiver(finish)
      try {
        bridge.pageReady()
      } catch {
        finish()
      }
    })
  }
  await runtime.ready
  document.documentElement.lang = runtime.getSnapshot().locale
  document.title = runtime.t('page.title')
}

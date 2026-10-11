import { createOnboardingLocaleRuntime, OnboardingLocaleProvider } from './i18n'
import { createBrowserOSOnboardingBridge } from './onboarding/browseros-onboarding-bridge'
import { Onboarding } from './onboarding/Onboarding'
import { prepareOnboardingLocale } from './onboarding-bootstrap'

const bridge = createBrowserOSOnboardingBridge()
const runtime = createOnboardingLocaleRuntime(bridge)

export const prepareApp = () => prepareOnboardingLocale(bridge, runtime)

if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())

export function App() {
  return (
    <OnboardingLocaleProvider runtime={runtime}>
      <Onboarding bridge={bridge} />
    </OnboardingLocaleProvider>
  )
}

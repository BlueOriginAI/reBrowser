import { Route, Routes } from 'react-router'
import { createOnboardingLocaleRuntime, OnboardingLocaleProvider } from '@/i18n'
import { createBrowserOSOnboardingBridge } from '@/onboarding/browseros-onboarding-bridge'
import { OnboardingV2 } from '@/onboarding/OnboardingV2'
import { prepareOnboardingLocale } from './onboarding-bootstrap'

const bridge = createBrowserOSOnboardingBridge()
const runtime = createOnboardingLocaleRuntime(bridge)

export const prepareApp = () => prepareOnboardingLocale(bridge, runtime)

if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())

export function App() {
  return (
    <OnboardingLocaleProvider runtime={runtime}>
      <Routes>
        <Route path="*" element={<OnboardingV2 bridge={bridge} />} />
      </Routes>
    </OnboardingLocaleProvider>
  )
}

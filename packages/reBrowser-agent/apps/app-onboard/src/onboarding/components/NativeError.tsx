import { useLocale } from '@browseros/i18n/react'
import type { BrowserOSOnboardingError } from '../browseros-onboarding-api'

const knownErrors = new Set([
  'import_failed',
  'import_in_progress',
  'user_interaction_required',
  'no_sources',
  'invalid_source',
  'no_supported_items',
  'setup_failed',
])

export function NativeError({ error }: { error?: BrowserOSOnboardingError }) {
  const { t } = useLocale()
  return (
    <div role="alert">
      <p>
        {t(
          error && knownErrors.has(error.code)
            ? `error.${error.code}`
            : 'error.generic',
        )}
      </p>
      {error?.message && (
        <details className="mt-2">
          <summary>{t('error.details')}</summary>
          <pre className="whitespace-pre-wrap break-words">{error.message}</pre>
        </details>
      )}
    </div>
  )
}

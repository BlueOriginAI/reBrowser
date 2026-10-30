import { useLocale } from '@browseros/i18n/react'
import type { TestResult } from '@/lib/llm-providers/testProvider'
import { providerEnglish } from './provider-supplemental'

export function ProviderMessage({
  message,
  params,
}: {
  message: string
  params?: Record<string, string | number>
}) {
  const { t } = useLocale()
  return <>{t(message, params)}</>
}

export function ProviderError({
  message,
  summary = 'Unknown error',
}: {
  message: string
  summary?: string
}) {
  const { t } = useLocale()
  const status = /^(?:Request failed with status|Server returned) (\d+)$/.exec(
    message,
  )
  const deviceStatus = /^Device code request failed: (\d+)$/.exec(message)
  const known = Object.hasOwn(providerEnglish, message)
  const translated = deviceStatus
    ? t('Device code request failed: {status}', { status: deviceStatus[1] })
    : status
      ? t('Server returned {status}', { status: status[1] })
      : t(known ? message : summary)
  return (
    <div role="alert" className="text-destructive text-sm">
      <p>{translated}</p>
      {!known && !status && !deviceStatus && message !== summary && (
        <details className="mt-1 text-xs">
          <summary>{t('Error details')}</summary>
          <p className="whitespace-pre-wrap break-words">{message}</p>
        </details>
      )}
    </div>
  )
}

export function ProviderTestFeedback({ result }: { result: TestResult }) {
  const { t } = useLocale()
  if (result.messageKey)
    return (
      <>
        <p>{t(result.messageKey, result.messageParams)}</p>
        {result.detail && (
          <details>
            <summary>{t('Error details')}</summary>
            <p className="whitespace-pre-wrap break-words">{result.detail}</p>
          </details>
        )}
      </>
    )
  if (!result.success)
    return (
      <ProviderError
        message={result.message}
        summary="Connection test failed"
      />
    )
  const preview = /^Connection successful\. Response: "([\s\S]*)"$/.exec(
    result.message,
  )
  if (preview)
    return <p>{t('Provider response: {response}', { response: preview[1] })}</p>
  if (Object.hasOwn(providerEnglish, result.message))
    return <p>{t(result.message)}</p>
  return (
    <>
      <p>{t('Connection test successful')}</p>
      {result.message && (
        <details>
          <summary>{t('Response details')}</summary>
          <p className="whitespace-pre-wrap break-words">{result.message}</p>
        </details>
      )}
    </>
  )
}

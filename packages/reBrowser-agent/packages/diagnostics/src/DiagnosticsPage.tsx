import { useCallback, useEffect, useState } from 'react'
import type { DiagnosticsResult } from './collector'
import { diagnosticSections, formatDiagnostics } from './contract'
import { requestDiagnostics } from './extension'
import { type DiagnosticsMessages, englishDiagnostics } from './messages'
import './styles.css'

/** The snapshot and clipboard stay canonical; only presentation is localized. */
export function DiagnosticsPage({
  messages = englishDiagnostics,
  locale = 'en',
}: {
  messages?: DiagnosticsMessages
  locale?: string
}) {
  const [result, setResult] = useState<DiagnosticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFallback, setCopyFallback] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    setCopyFallback(false)
    try {
      setResult(await requestDiagnostics())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    if (!result) return
    // Keep the clipboard write in the user's gesture; collection happens separately.
    try {
      void navigator.clipboard
        .writeText(formatDiagnostics(result.snapshot))
        .then(() => {
          setCopied(true)
          setCopyFallback(false)
        })
        .catch(() => setCopyFallback(true))
    } catch {
      setCopyFallback(true)
    }
  }
  const labelText = (label: string) =>
    messages.labels[label as keyof DiagnosticsMessages['labels']] ?? label

  return (
    <section
      className="browseros-diagnostics ph-no-capture"
      aria-labelledby="diagnostics-title"
    >
      <p className="diagnostics-breadcrumb">
        {messages.help} <span>/</span> {messages.title}
      </p>
      <div className="diagnostics-header">
        <div>
          <h1 id="diagnostics-title">{messages.title}</h1>
          <p>{messages.description}</p>
        </div>
        <div className="diagnostics-actions">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span>{' '}
            {loading ? messages.refreshing : messages.refresh}
          </button>
          <button
            type="button"
            className="diagnostics-copy"
            onClick={copy}
            disabled={!result || loading}
          >
            {copied ? messages.copied : messages.copy}
          </button>
        </div>
      </div>
      <p className="diagnostics-timestamp" role="status">
        {result
          ? `${result.cached ? messages.cached : messages.collected} · ${new Date(result.snapshot.collectedAt).toLocaleString(locale)}`
          : loading
            ? messages.collecting
            : messages.empty}
      </p>
      {error !== null && (
        <div role="alert">
          <p>
            {messages.error}
            {result ? ` ${messages.previous}` : ''}
          </p>
          {error && (
            <details>
              <summary>{messages.details}</summary>
              <pre>{error}</pre>
            </details>
          )}
        </div>
      )}
      {result &&
        diagnosticSections(result.snapshot).map((section) => (
          <section
            className="diagnostics-section"
            key={section.title}
            aria-label={labelText(section.title)}
          >
            <div className="diagnostics-section-heading">
              <h2>{labelText(section.title)}</h2>
              {section.title === 'Memory' && (
                <span>{messages.collectionTime}</span>
              )}
            </div>
            <dl>
              {section.rows.map(([label, value]) => (
                <div className="diagnostics-row" key={label}>
                  <dt>{labelText(label ?? '')}</dt>
                  <dd>
                    {value === null || value === 'Unavailable'
                      ? messages.unavailable
                      : value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      {result && <p className="diagnostics-note">{messages.privacy}</p>}
      {copyFallback && result && (
        <label className="diagnostics-fallback">
          {messages.clipboard}
          <textarea
            readOnly
            value={formatDiagnostics(result.snapshot)}
            onFocus={(event) => event.currentTarget.select()}
            rows={16}
          />
        </label>
      )}
    </section>
  )
}

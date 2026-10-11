import { useLocale } from '@browseros/i18n/react'
import {
  type ChatError as ChatErrorEnvelope,
  parseChatErrorEnvelope,
} from '@browseros/shared/schemas/chat-error'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface ChatErrorProps {
  error: Error
  onRetry?: () => void
  providerType?: string
}

interface ChatErrorView {
  title: string
  text: string
  url?: string
  linkLabel?: string
  details?: string
  canRetry: boolean
}

/**
 * Copy for codes the extension knows about. The server also sends a title and
 * message, used as-is for codes shipped after this build.
 */
type Translate = (key: string) => string

function getCodeCopy(
  t: Translate,
): Partial<
  Record<ChatErrorEnvelope['code'], { title: string; linkLabel: string }>
> {
  return {
    rate_limited: {
      title: t('chat.rateLimited'),
      linkLabel: t('chat.learnMore'),
    },
    auth_failed: {
      title: t('chat.authenticationFailed'),
      linkLabel: t('chat.openAiSettings'),
    },
    provider_config: {
      title: t('chat.providerNotConfigured'),
      linkLabel: t('chat.openAiSettings'),
    },
    connection_failed: {
      title: t('chat.connectionFailed'),
      linkLabel: t('chat.troubleshooting'),
    },
    context_length: {
      title: t('chat.conversationTooLong'),
      linkLabel: t('chat.learnMore'),
    },
    content_filter: {
      title: t('chat.contentRejected'),
      linkLabel: t('chat.learnMore'),
    },
    provider_unavailable: {
      title: t('chat.providerUnavailable'),
      linkLabel: t('chat.learnMore'),
    },
  }
}

const AI_SETTINGS_URL = '/app.html#/settings/ai'

function fromEnvelope(
  envelope: ChatErrorEnvelope,
  t: Translate,
): ChatErrorView {
  const known = getCodeCopy(t)[envelope.code]
  const url =
    envelope.docsUrl ??
    (envelope.code === 'auth_failed' || envelope.code === 'provider_config'
      ? AI_SETTINGS_URL
      : undefined)

  return {
    title: known?.title ?? envelope.title,
    text: envelope.message,
    url,
    linkLabel: known?.linkLabel,
    details: envelope.details,
    canRetry: envelope.retryable,
  }
}

/**
 * Fallback for bare strings: client-side fetch failures, an older agent server,
 * or an error raised outside the classifier.
 */
function fromMessage(message: string, t: Translate): ChatErrorView {
  // All chat requests go through the local BrowserOS agent server, so any
  // fetch failure is always a local connection issue.
  if (message.includes('Failed to fetch') || message.includes('fetch failed')) {
    return {
      title: t('chat.connectionFailed'),
      text: t('chat.connectionFailedText'),
      url: 'https://docs.browseros.com/troubleshooting/connection-issues',
      linkLabel: t('chat.troubleshooting'),
      canRetry: true,
    }
  }

  let text = message
  try {
    const parsed = JSON.parse(message)
    if (parsed?.error?.message) text = parsed.error.message
  } catch {}

  // Extract URL if present
  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  const url = urlMatch?.[0]
  if (url) {
    text = text.replace(url, '').replace(/\s+/g, ' ').trim()
  }

  return {
    title: t('chat.requestErrorTitle'),
    text: text || t('chat.unexpectedError'),
    url,
    canRetry: true,
  }
}

function buildView(message: string, t: Translate): ChatErrorView {
  const envelope = parseChatErrorEnvelope(message)
  return envelope ? fromEnvelope(envelope, t) : fromMessage(message, t)
}

/** Pretty-print JSON details; leave already-formatted or non-JSON text as-is. */
function formatErrorDetails(details: string): string {
  try {
    return JSON.stringify(JSON.parse(details), null, 2)
  } catch {
    return details
  }
}

export const ChatError: FC<ChatErrorProps> = ({ error, onRetry }) => {
  const { t } = useLocale()
  const [copiedDetails, setCopiedDetails] = useState(false)
  const view = buildView(error.message, t)

  const canRetry = !!onRetry && view.canRetry

  const detailsText = view.details ? formatErrorDetails(view.details) : ''

  // Copy targets the full string, not the DOM, so the whole error is copied even
  // though the block clips it to a scroll area on screen.
  const copyDetails = async () => {
    if (!detailsText) return
    try {
      await navigator.clipboard.writeText(detailsText)
      setCopiedDetails(true)
      window.setTimeout(() => setCopiedDetails(false), 1500)
    } catch {
      setCopiedDetails(false)
    }
  }

  return (
    <div className="mx-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium text-sm">{view.title}</span>
      </div>
      <p className="text-center text-destructive text-xs">{view.text}</p>
      {view.url && view.linkLabel && (
        <a
          href={view.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground text-xs underline hover:text-foreground"
        >
          {view.linkLabel}
        </a>
      )}
      {detailsText && detailsText !== view.text && (
        <div className="w-full">
          <div className="mb-1 flex items-center justify-between px-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {t('chat.fullError')}
            </span>
            <button
              type="button"
              onClick={copyDetails}
              className="text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              {copiedDetails ? t('chat.copied') : t('common.copy')}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted p-2 text-left text-[10px] text-muted-foreground">
            {detailsText}
          </pre>
        </div>
      )}
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('chat.tryAgain')}
        </Button>
      )}
    </div>
  )
}

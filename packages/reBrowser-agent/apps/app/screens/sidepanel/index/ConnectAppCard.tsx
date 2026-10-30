import { useLocale } from '@browseros/i18n/react'
import { Check, Plug } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiKeyDialog } from '@/components/mcp/ApiKeyDialog'
import { Button } from '@/components/ui/button'
import {
  BREADCRUMB_CONNECT_CLICKED_EVENT,
  BREADCRUMB_CONNECT_COMPLETED_EVENT,
  BREADCRUMB_CONNECT_MANUAL_EVENT,
  MANAGED_MCP_ADDED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { declinedAppsStorage } from '@/lib/declined-apps/storage'
import { useMcpServers } from '@/lib/mcp/mcpServerStorage'
import { track } from '@/lib/metrics/track'
import { sentry } from '@/lib/sentry/sentry'
import { useChatSessionContext } from '@/modules/chat/chat-session-context'
import { useAddManagedServer } from '@/modules/mcp/add-managed-server.hooks'
import { useSubmitApiKey } from '@/modules/mcp/submit-api-key.hooks'
import type { NudgeData } from './getMessageSegments'

type CardPhase = 'choosing' | 'oauth-pending' | 'resolved'

export interface ConnectAppCardProps {
  data: NudgeData
  isLastMessage: boolean
}

export const ConnectAppCard: FC<ConnectAppCardProps> = ({
  data,
  isLastMessage,
}) => {
  const { t } = useLocale()

  const [phase, setPhase] = useState<CardPhase>(
    isLastMessage ? 'choosing' : 'resolved',
  )
  const [connecting, setConnecting] = useState(false)
  const [apiKeyServer, setApiKeyServer] = useState<{
    name: string
    apiKeyUrl: string
  } | null>(null)
  const [resolvedKey, setResolvedKey] = useState('surfaces.suggested')

  const { sendMessage } = useChatSessionContext()
  const { addServer } = useMcpServers()
  const { trigger: addManagedServerMutation } = useAddManagedServer()
  const { trigger: submitApiKeyMutation, isMutating: isSubmittingApiKey } =
    useSubmitApiKey()

  const appName = (data.appName as string) ?? t('App')
  const reason = (data.reason as string) ?? ''

  useEffect(() => {
    if (!isLastMessage && phase !== 'resolved') {
      setPhase('resolved')
    }
  }, [isLastMessage, phase])

  const handleConnect = async () => {
    setConnecting(true)
    track(BREADCRUMB_CONNECT_CLICKED_EVENT, { app_name: appName })

    try {
      const response = await addManagedServerMutation({
        serverName: appName,
      })

      if (!response.oauthUrl && !response.apiKeyUrl) {
        toast.error(t('surfaces.failedConnect', { name: appName }))
        setConnecting(false)
        return
      }

      if (response.apiKeyUrl) {
        setApiKeyServer({ name: appName, apiKeyUrl: response.apiKeyUrl })
        setConnecting(false)
      } else if (response.oauthUrl) {
        addServer({
          id: Date.now().toString(),
          displayName: appName,
          type: 'managed',
          managedServerName: appName,
          managedServerDescription: '',
        })
        track(MANAGED_MCP_ADDED_EVENT, { server_name: appName })
        window.open(response.oauthUrl, '_blank')?.focus()
        setConnecting(false)
        setPhase('oauth-pending')
      }
    } catch (e) {
      toast.error(t('surfaces.failedConnect', { name: appName }))
      sentry.captureException(e)
      setConnecting(false)
    }
  }

  const handleSubmitApiKey = async (apiKey: string) => {
    if (!apiKeyServer) return
    try {
      await submitApiKeyMutation({
        serverName: apiKeyServer.name,
        apiKey,
        apiKeyUrl: apiKeyServer.apiKeyUrl,
      })
      addServer({
        id: Date.now().toString(),
        displayName: appName,
        type: 'managed',
        managedServerName: appName,
        managedServerDescription: '',
      })
      track(MANAGED_MCP_ADDED_EVENT, { server_name: appName })
      toast.success(t('surfaces.connectedSuccess', { name: apiKeyServer.name }))
      setApiKeyServer(null)
      setResolvedKey('surfaces.connected')
      setPhase('resolved')
      sendMessage({
        text: `I've connected ${appName}, continue with the task`,
      })
    } catch (e) {
      toast.error(
        t('surfaces.failedConnectDetails', {
          name: apiKeyServer.name,
          error: e instanceof Error ? e.message : t('Unknown error'),
        }),
      )
      sentry.captureException(e)
    }
  }

  const handleOAuthComplete = () => {
    track(BREADCRUMB_CONNECT_COMPLETED_EVENT, { app_name: appName })
    setResolvedKey('surfaces.connected')
    setPhase('resolved')
    sendMessage({
      text: `I've connected ${appName}, continue with the task`,
    })
  }

  const handleManual = async () => {
    track(BREADCRUMB_CONNECT_MANUAL_EVENT, { app_name: appName })
    const current = await declinedAppsStorage.getValue()
    if (!current.includes(appName)) {
      await declinedAppsStorage.setValue([...current, appName])
    }
    setResolvedKey('surfaces.continuingWithout')
    setPhase('resolved')
    sendMessage({
      text: `Continue without connecting ${appName}, do it manually with browser automation`,
    })
  }

  if (phase === 'resolved') {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Check className="h-3.5 w-3.5" />
          <span>{t(resolvedKey, { name: appName })}</span>
        </div>
      </div>
    )
  }

  if (phase === 'oauth-pending') {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Plug className="h-5 w-5 shrink-0 text-[var(--accent-orange)]" />
          <div>
            <p className="font-medium text-sm">
              {t('surfaces.authorizeNamed', { name: appName })}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('Complete the sign-in flow, then click the button below.')}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleOAuthComplete}>
            {t('surfaces.authorizedContinue', { name: appName })}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleManual}>
            {t('Skip, do it manually')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border/50 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Plug className="h-5 w-5 shrink-0 text-[var(--accent-orange)]" />
          <div>
            <p className="font-medium text-sm">
              {t('surfaces.connectForResults', { name: appName })}
            </p>
            {reason && (
              <p className="mt-1 text-muted-foreground text-xs">{reason}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting
              ? t('Connecting...')
              : t('surfaces.connectNamed', { name: appName })}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleManual}>
            {t('Do it manually')}
          </Button>
        </div>
      </div>

      <ApiKeyDialog
        open={!!apiKeyServer}
        onOpenChange={(open) => {
          if (!open) setApiKeyServer(null)
        }}
        serverName={apiKeyServer?.name ?? ''}
        onSubmit={handleSubmitApiKey}
        isSubmitting={isSubmittingApiKey}
      />
    </>
  )
}

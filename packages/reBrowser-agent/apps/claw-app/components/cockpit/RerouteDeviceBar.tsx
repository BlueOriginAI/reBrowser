import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Laptop, Monitor, Network } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  RerouteApiError,
  useRerouteState,
  useSetReroutePreferences,
  useSetRerouteTarget,
} from '@/modules/api/reroute.hooks'

function openAccountSettings() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: 'chrome://settings/people' })
  }
}

export function RerouteDeviceBar() {
  const { t } = useLocale()
  const reroute = useRerouteState({ refetchInterval: 5000 })
  const setTarget = useSetRerouteTarget()
  const setPrefs = useSetReroutePreferences()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)

  const state = reroute.data
  if (!state) {
    return null
  }

  const remotePeers = state.devices.filter((d) => !d.isSelf)
  const onlineCount = remotePeers.filter((d) => d.online).length

  const selectTarget = async (targetDeviceId: string | null) => {
    setNotice(null)
    try {
      await setTarget.mutateAsync({ targetDeviceId })
      await queryClient.invalidateQueries({
        queryKey: useRerouteState.getKey(),
      })
    } catch (error) {
      if (error instanceof RerouteApiError) {
        if (error.status === 401 || error.code === 'account_login_required') {
          setNotice(t('reroute.signInHint'))
          return
        }
        if (
          error.status === 403 ||
          error.code === 'pro_subscription_required'
        ) {
          setNotice(t('reroute.proHint'))
          return
        }
      }
      setNotice(error instanceof Error ? error.message : 'Failed to update')
    }
  }

  const toggleIncoming = async (checked: boolean) => {
    setNotice(null)
    await setPrefs.mutateAsync({
      allowIncomingReroute: checked,
    })
    await queryClient.invalidateQueries({ queryKey: useRerouteState.getKey() })
  }

  return (
    <section
      data-testid="reroute-device-bar"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Network className="size-4" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink text-sm">
              {t('reroute.title')}
            </h2>
            <span className="rounded bg-primary/12 px-1.5 py-0.5 font-bold text-[10px] text-primary">
              PRO
            </span>
          </div>
        </div>
        <span
          className={
            state.relayConnected
              ? 'inline-flex items-center gap-1.5 rounded-full bg-green-tint px-2.5 py-0.5 font-medium text-[11.5px] text-green'
              : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11.5px] text-ink-3'
          }
        >
          <span
            className={
              state.relayConnected
                ? 'size-1.5 rounded-full bg-green'
                : 'size-1.5 rounded-full bg-ink-4'
            }
          />
          {state.relayConnected
            ? t('reroute.onlineCount', { count: onlineCount })
            : t('reroute.offline')}
        </span>
      </div>

      {!state.signedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card-tint px-4 py-3">
          <p className="text-ink-2 text-xs">{t('reroute.signInHint')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={openAccountSettings}
            className="rounded-full"
          >
            {t('proHub.ctaSignIn')}
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={!state.targetDeviceId ? 'default' : 'outline'}
              onClick={() => selectTarget(null)}
              className="rounded-full px-3.5"
            >
              <Laptop className="size-3.5" />
              {t('reroute.localTarget')}
            </Button>

            {remotePeers.map((peer) => {
              const selected = state.targetDeviceId === peer.installationId
              return (
                <Button
                  key={peer.installationId}
                  size="sm"
                  variant={selected ? 'default' : 'outline'}
                  disabled={!peer.online}
                  onClick={() => selectTarget(peer.installationId)}
                  className="rounded-full px-3.5"
                >
                  <Monitor className="size-3.5" />
                  <span>{peer.deviceName || peer.installationId}</span>
                  {peer.rttMs !== undefined ? (
                    <span className="font-mono text-[11px] opacity-75">
                      {peer.rttMs}ms
                    </span>
                  ) : null}
                </Button>
              )
            })}
          </div>

          {!state.isPro && remotePeers.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-accent-tint px-3.5 py-2.5">
              <p className="text-ink text-xs">{t('reroute.proHint')}</p>
              <Button
                size="sm"
                onClick={openAccountSettings}
                className="h-7 rounded-full px-3 text-xs"
              >
                {t('proHub.ctaUpgrade')}
                <ArrowUpRight className="size-3" />
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
            <span className="text-ink-2 text-xs">
              {t('reroute.allowIncoming')}
            </span>
            <Switch
              checked={state.allowIncomingReroute}
              onCheckedChange={toggleIncoming}
            />
          </div>
        </div>
      )}

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-primary/25 bg-card-tint px-3.5 py-2.5 text-ink text-xs"
        >
          {notice}
        </div>
      ) : null}
    </section>
  )
}

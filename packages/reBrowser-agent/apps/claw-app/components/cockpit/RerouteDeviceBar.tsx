import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import { Laptop, Monitor, Wifi } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  RerouteApiError,
  useRerouteState,
  useSetReroutePreferences,
  useSetRerouteTarget,
} from '@/modules/api/reroute.hooks'

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

  const toggleIncoming = async () => {
    setNotice(null)
    await setPrefs.mutateAsync({
      allowIncomingReroute: !state.allowIncomingReroute,
    })
    await queryClient.invalidateQueries({ queryKey: useRerouteState.getKey() })
  }

  return (
    <section
      data-testid="reroute-device-bar"
      className="flex flex-col gap-3 rounded-9 border border-cyanotype-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-cyanotype-blue" />
          <h2 className="font-semibold text-cyanotype-ink text-sm">
            {t('reroute.title')}
          </h2>
        </div>
        <span className="text-[12px] text-cyanotype-muted">
          {state.relayConnected
            ? t('reroute.onlineCount', { count: onlineCount })
            : t('reroute.offline')}
        </span>
      </div>

      {!state.signedIn ? (
        <p className="text-cyanotype-muted text-xs">
          {t('reroute.signInHint')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={!state.targetDeviceId ? 'default' : 'outline'}
              onClick={() => selectTarget(null)}
              className="rounded-9"
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
                  className="rounded-9"
                >
                  <Monitor className="size-3.5" />
                  <span>{peer.deviceName || peer.installationId}</span>
                  {peer.rttMs !== undefined ? (
                    <span className="text-[11px] opacity-75">
                      {peer.rttMs}ms
                    </span>
                  ) : null}
                </Button>
              )
            })}
          </div>

          {!state.isPro && remotePeers.length > 0 ? (
            <p className="text-cyanotype-muted text-xs">
              {t('reroute.proHint')}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 pt-1 text-cyanotype-muted text-xs">
            <input
              type="checkbox"
              checked={state.allowIncomingReroute}
              onChange={toggleIncoming}
            />
            <span>{t('reroute.allowIncoming')}</span>
          </label>
        </div>
      )}

      {notice ? (
        <div
          role="status"
          className="rounded bg-card-tint px-3 py-2 text-cyanotype-ink text-xs"
        >
          {notice}
        </div>
      ) : null}
    </section>
  )
}

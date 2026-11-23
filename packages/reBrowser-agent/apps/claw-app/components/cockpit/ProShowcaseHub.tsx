import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  Crown,
  Download,
  FileDown,
  Globe,
  Laptop,
  Monitor,
  Network,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useRerouteState } from '@/modules/api/reroute.hooks'
import {
  CatalogInstallError,
  type SkillCatalogItem,
  useInstallCatalogSkill,
  useSkillCatalog,
  useSkills,
} from '@/modules/api/skills.hooks'
import { formatTokens } from '@/screens/skills/skills.helpers'

function openAccountSettings() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: 'chrome://settings/people' })
  }
}

/**
 * Home spotlight Bento showcase highlighting the two flagship reBrowser Pro
 * capabilities: Cross-Device Browser Reroute and Verified / Pro Skills packs.
 */
export function ProShowcaseHub() {
  const { locale, t } = useLocale()
  const reroute = useRerouteState({ refetchInterval: 5000 })
  const catalog = useSkillCatalog()
  const install = useInstallCatalogSkill()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const state = reroute.data
  const signedIn = state?.signedIn ?? false
  const isPro = state?.isPro ?? false
  const remotePeers = (state?.devices ?? []).filter((d) => !d.isSelf)
  const onlinePeers = remotePeers.filter((d) => d.online)
  const isZh = locale === 'zh-CN'

  const featuredSkills = useMemo(() => {
    const items = catalog.data?.items ?? []
    if (items.length === 0) return []
    return [...items]
      .sort((a, b) => Number(b.proOnly) - Number(a.proOnly))
      .slice(0, 3)
  }, [catalog.data])

  const handleInstall = async (item: SkillCatalogItem) => {
    setNotice(null)
    setPendingId(item.id)
    try {
      await install.mutateAsync({ id: item.id })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: useSkills.getKey() }),
        queryClient.invalidateQueries({ queryKey: useSkillCatalog.getKey() }),
      ])
    } catch (error) {
      if (error instanceof CatalogInstallError) {
        if (error.code === 'account_login_required' || error.status === 401) {
          setNotice(t('skills.catalog.loginPrompt'))
          return
        }
        if (
          error.code === 'pro_subscription_required' ||
          error.status === 403
        ) {
          setNotice(t('skills.catalog.proPrompt'))
          return
        }
      }
      setNotice(t('skills.catalog.installFailed'))
    } finally {
      setPendingId(null)
    }
  }

  const statusLabel = isPro
    ? t('proHub.statusActive')
    : signedIn
      ? t('proHub.statusFree')
      : t('proHub.statusSignedOut')

  const ctaLabel = isPro
    ? t('proHub.ctaManage')
    : signedIn
      ? t('proHub.ctaUpgrade')
      : t('proHub.ctaSignIn')

  return (
    <section
      data-testid="pro-showcase-hub"
      className="relative overflow-hidden rounded-2xl border border-border/90 bg-card shadow-card"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/10 via-primary/4 to-transparent" />

      <div className="relative flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 font-semibold text-[11px] text-primary tracking-wide">
              <Crown className="size-3.5" />
              {t('proHub.eyebrow')}
            </span>
            <span
              className={
                isPro
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-green-tint px-2.5 py-0.5 font-medium text-[11px] text-green'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 font-medium text-[11px] text-ink-2'
              }
            >
              {isPro ? (
                <span className="size-1.5 rounded-full bg-green" />
              ) : null}
              {statusLabel}
            </span>
          </div>

          <Button
            size="sm"
            variant={isPro ? 'outline' : 'default'}
            onClick={openAccountSettings}
            className="h-8 shrink-0 rounded-full px-3.5 font-medium text-xs"
          >
            {ctaLabel}
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>

        {notice ? (
          <div
            role="status"
            className="rounded-xl border border-primary/25 bg-accent-tint px-4 py-2.5 text-ink text-xs"
          >
            {notice}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {/* Pillar 1 (Top): Official & Pro Verified Skills */}
          <div
            data-testid="pro-pillar-skills"
            className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card-tint/55 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[15px] text-ink leading-tight">
                      {t('proHub.skillsTitle')}
                    </h3>
                    <span className="inline-flex items-center gap-0.5 rounded bg-green-tint px-1.5 py-0.5 font-semibold text-[10px] text-green">
                      <ShieldCheck className="size-3" />
                      Verified
                    </span>
                  </div>
                  <p className="mt-1 text-ink-2 text-xs leading-relaxed">
                    {t('proHub.skillsDesc')}
                  </p>
                </div>
              </div>

              <Link
                to="/skills"
                className="inline-flex shrink-0 items-center gap-1 pt-0.5 font-medium text-primary text-xs hover:underline"
              >
                {t('proHub.skillsBrowse')}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {featuredSkills.length > 0 ? (
                featuredSkills.map((item) => {
                  const title = isZh ? item.title.zh : item.title.en
                  const busy = pendingId === item.id
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/75 bg-card px-3.5 py-3 transition-colors hover:border-primary/35"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-[13px] text-ink">
                            {title}
                          </span>
                          {item.proOnly ? (
                            <span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 font-bold text-[10px] text-primary">
                              {t('skills.catalog.proBadge')}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="max-w-[200px] truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-ink-2">
                            {item.site}
                          </span>
                          <span className="font-medium text-ink-3">
                            {t('skills.catalog.tokensSaved', {
                              count: formatTokens(item.avgTokensSaved, locale),
                            })}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={
                          item.installed && !item.updateAvailable
                            ? 'outline'
                            : 'default'
                        }
                        disabled={
                          busy || (item.installed && !item.updateAvailable)
                        }
                        onClick={() => handleInstall(item)}
                        className="h-8 min-w-[80px] shrink-0 justify-center rounded-lg px-3 font-medium text-xs"
                      >
                        {item.installed && !item.updateAvailable ? (
                          <>
                            <Check className="size-3" />
                            {t('skills.catalog.installed')}
                          </>
                        ) : (
                          <>
                            <Download className="size-3" />
                            {item.updateAvailable
                              ? t('skills.catalog.update')
                              : t('skills.catalog.install')}
                          </>
                        )}
                      </Button>
                    </div>
                  )
                })
              ) : (
                <div className="space-y-2.5">
                  {(
                    [
                      {
                        key: 'proHub.fallbackSkill1',
                        site: 'creator.xiaohongshu.com',
                        pro: true,
                      },
                      {
                        key: 'proHub.fallbackSkill2',
                        site: 'mp.weixin.qq.com',
                        pro: false,
                      },
                      {
                        key: 'proHub.fallbackSkill3',
                        site: 'feishu.cn',
                        pro: false,
                      },
                    ] as const
                  ).map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/75 bg-card px-3.5 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold text-[13px] text-ink">
                          {t(entry.key)}
                        </span>
                        {entry.pro ? (
                          <span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 font-bold text-[10px] text-primary">
                            PRO
                          </span>
                        ) : null}
                      </div>
                      <span className="max-w-[200px] shrink-0 truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                        {entry.site}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pillar 2 (Bottom): Cross-Device Browser Reroute */}
          <div
            data-testid="pro-pillar-reroute"
            className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card-tint/55 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Network className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[15px] text-ink leading-tight">
                      {t('proHub.rerouteTitle')}
                    </h3>
                    <span className="rounded bg-primary/12 px-1.5 py-0.5 font-bold text-[10px] text-primary">
                      PRO
                    </span>
                  </div>
                  <p className="mt-1 text-ink-2 text-xs leading-relaxed">
                    {t('proHub.rerouteDesc')}
                  </p>
                </div>
              </div>

              <Link
                to="/mcp"
                className="inline-flex shrink-0 items-center gap-1 pt-0.5 font-medium text-primary text-xs hover:underline"
              >
                {t('proHub.rerouteManage')}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5 text-[13px] text-ink-2 leading-snug">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="size-3.5" />
                </span>
                <span>{t('proHub.reroutePoint1')}</span>
              </li>
              <li className="flex items-center gap-2.5 text-[13px] text-ink-2 leading-snug">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe className="size-3.5" />
                </span>
                <span>{t('proHub.reroutePoint2')}</span>
              </li>
              <li className="flex items-center gap-2.5 text-[13px] text-ink-2 leading-snug">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileDown className="size-3.5" />
                </span>
                <span>{t('proHub.reroutePoint3')}</span>
              </li>
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card-tint px-2.5 py-1 text-[11px] text-ink">
                  <Laptop className="size-3 text-primary" />
                  {state?.selfDeviceName || t('reroute.localTarget')}
                </span>
                {onlinePeers.slice(0, 2).map((peer) => (
                  <span
                    key={peer.installationId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-green-tint px-2.5 py-1 text-[11px] text-green"
                  >
                    <Monitor className="size-3" />
                    {peer.deviceName || peer.installationId}
                  </span>
                ))}
              </div>

              <span className="text-[11px] text-ink-3">
                {t('proHub.reroutePeers', { count: onlinePeers.length })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

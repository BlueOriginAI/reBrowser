import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Crown, Download, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  CatalogInstallError,
  type SkillCatalogItem,
  useInstallCatalogSkill,
  useSkillCatalog,
  useSkills,
} from '@/modules/api/skills.hooks'
import { formatTokens } from '@/screens/skills/skills.helpers'

export function VerifiedSkillsCatalog() {
  const { locale, t } = useLocale()
  const catalog = useSkillCatalog()
  const install = useInstallCatalogSkill()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const items = catalog.data?.items ?? []
  if (catalog.isLoading || catalog.isError || items.length === 0) {
    return null
  }

  const isZh = locale === 'zh-CN'

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

  return (
    <section className="flex flex-col gap-4 pt-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="size-4" />
          </div>
          <h2 className="font-bold text-ink text-lg tracking-tight">
            {t('skills.catalog.title')}
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-tint px-2 py-0.5 font-medium text-[11px] text-green">
            <ShieldCheck className="size-3" />
            Verified
          </span>
        </div>
        <p className="text-ink-2 text-sm">{t('skills.catalog.subtitle')}</p>
      </header>

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-primary/30 bg-card-tint px-4 py-3 text-ink text-sm"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => {
          const title = isZh ? item.title.zh : item.title.en
          const description = isZh ? item.description.zh : item.description.en
          const busy = pendingId === item.id

          return (
            <div
              key={item.id}
              data-testid={`catalog-skill-${item.id}`}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/40"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-base text-ink leading-snug">
                    {title}
                  </span>
                  {item.proOnly ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 font-bold text-[11px] text-primary">
                      <Crown className="size-3" />
                      {t('skills.catalog.proBadge')}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-ink-2 text-xs leading-relaxed">
                  {description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-border border-t pt-3.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                  <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-ink-2">
                    {item.site}
                  </span>
                  <span className="rounded-md bg-card-tint px-2 py-0.5 text-ink-2">
                    {t('skills.catalog.tokensSaved', {
                      count: formatTokens(item.avgTokensSaved, locale),
                    })}
                  </span>
                  <span className="px-1">
                    {t('skills.catalog.verifiedRuns', {
                      count: item.verifiedCleanRuns,
                    })}
                  </span>
                </div>

                <Button
                  size="sm"
                  variant={
                    item.installed && !item.updateAvailable
                      ? 'outline'
                      : 'default'
                  }
                  disabled={busy || (item.installed && !item.updateAvailable)}
                  onClick={() => handleInstall(item)}
                  className="shrink-0 rounded-full px-3.5"
                >
                  {item.installed && !item.updateAvailable ? (
                    <>
                      <Check className="size-3.5" />
                      {t('skills.catalog.installed')}
                    </>
                  ) : (
                    <>
                      <Download className="size-3.5" />
                      {item.updateAvailable
                        ? t('skills.catalog.update')
                        : t('skills.catalog.install')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Download, Sparkles } from 'lucide-react'
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
    <section className="flex flex-col gap-4 pt-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-bold text-ink text-lg">
            {t('skills.catalog.title')}
          </h2>
        </div>
        <p className="text-ink-2 text-sm">{t('skills.catalog.subtitle')}</p>
      </header>

      {notice ? (
        <div
          role="status"
          className="rounded-9 border border-primary/30 bg-card-tint px-4 py-3 text-ink text-sm"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const title = isZh ? item.title.zh : item.title.en
          const description = isZh ? item.description.zh : item.description.en
          const busy = pendingId === item.id

          return (
            <div
              key={item.id}
              data-testid={`catalog-skill-${item.id}`}
              className="flex flex-col justify-between gap-3 rounded-9 border border-ledger-border bg-card p-4"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink text-sm">
                    {title}
                  </span>
                  {item.proOnly ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-[11px] text-primary">
                      {t('skills.catalog.proBadge')}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-ink-2 text-xs">{description}</p>
              </div>

              <div className="flex items-center justify-between gap-2 border-ledger-divider border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {item.site}
                  </span>
                  <span>
                    {t('skills.catalog.tokensSaved', {
                      count: formatTokens(item.avgTokensSaved, locale),
                    })}
                  </span>
                  <span>
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
                  className="shrink-0 rounded-9"
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

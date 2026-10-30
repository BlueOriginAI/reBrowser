import { useLocale } from '@browseros/i18n/react'
import { Palette } from 'lucide-react'
import type { FC } from 'react'

export const CustomizationHeader: FC = () => {
  const { t } = useLocale()

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
          <Palette className="h-6 w-6 text-[var(--accent-orange)]" />
        </div>
        <div className="flex-1">
          <h2 className="mb-1 font-semibold text-xl">
            {t('settings.customization')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('settings.customizationDescription')}
          </p>
        </div>
      </div>
    </div>
  )
}

import { useLocale } from '@browseros/i18n/react'
import { Check, CreditCard, Lock } from 'lucide-react'

interface ImportedSummaryCardProps {
  importedItemCount: number
  itemSummary: string
  sourceName: string
}

/** Shows the completed Chromium import summary. */
export function ImportedSummaryCard({
  importedItemCount,
  itemSummary,
  sourceName,
}: ImportedSummaryCardProps) {
  const { t } = useLocale()
  return (
    <div className="mb-[18px] animate-fade-up rounded-xl border border-border-2 bg-card p-[18px]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-green-tint text-green">
          <Check className="size-4" />
        </span>
        <span className="font-bold text-[14px]">
          {t('summary.copied', {
            count: importedItemCount,
            source: sourceName,
          })}
        </span>
      </div>
      <SummaryRow
        icon={<Check className="size-3.5 text-green" />}
        text={itemSummary}
      />
      <SummaryRow
        icon={<Lock className="size-3.5 text-ink-3" />}
        text={t('summary.private')}
      />
      <SummaryRow
        icon={<CreditCard className="size-3.5 text-ink-3" />}
        text={t('summary.cardsSkipped')}
      />
    </div>
  )
}

interface SummaryRowProps {
  icon: React.ReactNode
  text: string
}

function SummaryRow({ icon, text }: SummaryRowProps) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-[12.5px] text-ink-2">
      {icon}
      {text}
    </div>
  )
}

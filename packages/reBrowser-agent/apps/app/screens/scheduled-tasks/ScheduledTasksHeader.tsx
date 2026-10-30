import { useLocale } from '@browseros/i18n/react'
import { CalendarClock, HelpCircle, Plus } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { scheduledTasksHelpUrl } from '@/lib/constants/productUrls'

export interface ScheduledTasksHeaderProps {
  onAddClick: () => void
}

export const ScheduledTasksHeader: FC<ScheduledTasksHeaderProps> = ({
  onAddClick,
}) => {
  const { t } = useLocale()

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
          <CalendarClock className="h-6 w-6 text-[var(--accent-orange)]" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-semibold text-xl">{t('tasks.title')}</h2>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={scheduledTasksHelpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('tasks.learnMore')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground text-sm">
            {t('tasks.description')}
          </p>
        </div>
        <Button
          onClick={onAddClick}
          className="border-[var(--accent-orange)] bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/20 hover:text-[var(--accent-orange)]"
          variant="outline"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t('tasks.new')}
        </Button>
      </div>
    </div>
  )
}

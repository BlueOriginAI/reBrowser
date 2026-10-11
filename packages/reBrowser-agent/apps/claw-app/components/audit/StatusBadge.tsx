import { useLocale } from '@browseros/i18n/react'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/modules/api/audit.hooks'

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

const STYLES: Record<TaskStatus, string> = {
  live: 'bg-cyanotype-live text-cyanotype-live-ink',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  cancelled: 'bg-bg-sunken text-ink-3',
}

const LABEL_KEYS: Record<
  TaskStatus,
  | 'audit.status.live'
  | 'audit.status.done'
  | 'audit.status.failed'
  | 'audit.status.stopped'
> = {
  live: 'audit.status.live',
  done: 'audit.status.done',
  failed: 'audit.status.failed',
  cancelled: 'audit.status.stopped',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useLocale()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-[3px] font-semibold text-[11px] leading-[14px]',
        STYLES[status],
        className,
      )}
    >
      {t(LABEL_KEYS[status])}
    </span>
  )
}

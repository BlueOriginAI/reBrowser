import { useLocale } from '@browseros/i18n/react'
import { XIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { DialogClose, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function LocalizedDialogContent({
  children,
  className,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogContent>) {
  const { t } = useLocale()
  return (
    <DialogContent
      {...props}
      className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto', className)}
      showCloseButton={false}
    >
      {children}
      {showCloseButton && (
        <DialogClose
          className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          aria-label={t('Close')}
        >
          <XIcon className="size-4" />
        </DialogClose>
      )}
    </DialogContent>
  )
}

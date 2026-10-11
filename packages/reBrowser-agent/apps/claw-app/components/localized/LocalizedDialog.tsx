import { useLocale } from '@browseros/i18n/react'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
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
          render={
            <Button
              variant="ghost"
              className="absolute top-4 right-4"
              size="icon-sm"
            />
          }
        >
          <X />
          <span className="sr-only">{t('common.close')}</span>
        </DialogClose>
      )}
    </DialogContent>
  )
}

export function LocalizedDialogFooter({
  children,
  showCloseButton = false,
  ...props
}: ComponentProps<typeof DialogFooter>) {
  const { t } = useLocale()
  return (
    <DialogFooter {...props} showCloseButton={false}>
      {children}
      {showCloseButton && (
        <DialogClose render={<Button variant="outline" />}>
          {t('common.close')}
        </DialogClose>
      )}
    </DialogFooter>
  )
}

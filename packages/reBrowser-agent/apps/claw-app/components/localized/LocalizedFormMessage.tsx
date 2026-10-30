import { useLocale } from '@browseros/i18n/react'
import type { ComponentProps } from 'react'
import { useFormField } from '@/components/ui/form'
import { cn } from '@/lib/utils'

export function LocalizedFormMessage({
  children,
  className,
  ...props
}: ComponentProps<'p'>) {
  const { t } = useLocale()
  const { error, formMessageId } = useFormField()
  const body = error ? t(String(error.message ?? '')) : children
  if (!body) return null
  return (
    <p
      id={formMessageId}
      data-slot="form-message"
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  )
}

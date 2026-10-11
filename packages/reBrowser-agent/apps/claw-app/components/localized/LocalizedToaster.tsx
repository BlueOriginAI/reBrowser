import { useLocale } from '@browseros/i18n/react'
import { Toaster } from '@/components/ui/sonner'

export function LocalizedToaster() {
  const { t } = useLocale()
  return <Toaster containerAriaLabel={t('Notifications')} />
}

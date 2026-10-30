import { useLocale } from '@browseros/i18n/react'
import { VenetianMask } from 'lucide-react'

/**
 * Shown while the assistant runs in an incognito window so the user knows the
 * chat is not saved to history (#1189).
 */
export const IncognitoNotice = () => {
  const { t } = useLocale()

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-muted-foreground text-xs">
      <VenetianMask className="h-4 w-4 shrink-0" />
      <span>{t('Incognito mode: this chat is not saved to history.')}</span>
    </div>
  )
}

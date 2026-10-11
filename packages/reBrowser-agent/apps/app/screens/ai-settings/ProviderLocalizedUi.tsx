import { useLocale } from '@browseros/i18n/react'

export { LocalizedDialogContent as ProviderDialogContent } from '@/components/i18n/LocalizedDialogContent'

import { useFormField } from '@/components/ui/form'
import { providerEnglish } from '@/lib/i18n/provider-supplemental'

// Store schema messages as keys so existing errors follow locale changes without revalidation.
export function ProviderFormMessage() {
  const { t } = useLocale()
  const { error, formMessageId } = useFormField()
  if (!error?.message) return null
  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className="text-destructive text-sm"
    >
      {t(
        Object.hasOwn(providerEnglish, String(error.message))
          ? String(error.message)
          : 'Invalid value',
      )}
    </p>
  )
}

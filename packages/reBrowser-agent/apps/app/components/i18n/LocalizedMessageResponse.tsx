import { useLocale } from '@browseros/i18n/react'
import type { ComponentProps } from 'react'
import { defaultTranslations } from 'streamdown'
import { MessageResponse } from '@/components/ai-elements/message'

export function LocalizedMessageResponse(
  props: ComponentProps<typeof MessageResponse>,
) {
  const { t } = useLocale()
  const translations = Object.fromEntries(
    Object.entries(defaultTranslations).map(([key, value]) => [key, t(value)]),
  )
  return (
    <MessageResponse
      {...props}
      translations={{ ...translations, ...props.translations }}
    />
  )
}

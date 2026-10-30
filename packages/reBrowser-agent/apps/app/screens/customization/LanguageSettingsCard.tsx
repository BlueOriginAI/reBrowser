import { isLocalePreference } from '@browseros/i18n/core'
import { useLocale } from '@browseros/i18n/react'
import { type FC, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const LanguageSettingsCard: FC = () => {
  const { preference, setPreference, t } = useLocale()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="mb-4 space-y-1">
        <h3 className="font-semibold text-lg">{t('settings.language')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.languageDescription')}
        </p>
      </div>
      <Label htmlFor="display-language" className="sr-only">
        {t('settings.languageSelect')}
      </Label>
      <Select
        value={preference}
        disabled={saving}
        onValueChange={(next) => {
          if (!isLocalePreference(next)) return
          setFailed(false)
          setSaving(true)
          void setPreference(next)
            .catch(() => setFailed(true))
            .finally(() => setSaving(false))
        }}
      >
        <SelectTrigger id="display-language" className="w-full sm:w-72">
          <SelectValue placeholder={t('settings.languageSelect')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('settings.followSystem')}</SelectItem>
          <SelectItem value="en">{t('settings.english')}</SelectItem>
          <SelectItem value="zh-CN">
            {t('settings.simplifiedChinese')}
          </SelectItem>
        </SelectContent>
      </Select>
      {failed && (
        <p role="alert" className="mt-2 text-destructive text-sm">
          {t('settings.languageSaveFailed')}
        </p>
      )}
    </section>
  )
}

import { isLocalePreference } from '@browseros/i18n/core'
import { useLocale } from '@browseros/i18n/react'
import { useId, useState } from 'react'

export function LanguageSelector() {
  const { preference, setPreference, t } = useLocale()
  const id = useId()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="mb-5 text-ink-2 text-xs">
      <div className="flex items-center gap-2">
        <label htmlFor={id}>{t('language.label')}</label>
        <select
          id={id}
          className="rounded border border-border-2 bg-card px-2 py-1"
          value={preference}
          disabled={saving}
          aria-busy={saving}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (!isLocalePreference(next)) return
            setFailed(false)
            setSaving(true)
            void setPreference(next)
              .catch(() => setFailed(true))
              .finally(() => setSaving(false))
          }}
        >
          <option value="system">{t('language.system')}</option>
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
        </select>
      </div>
      {failed && (
        <p role="alert" className="mt-2">
          {t('language.failed')}
        </p>
      )}
    </div>
  )
}

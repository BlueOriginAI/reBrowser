import { useLocale } from '@browseros/i18n/react'
import { Info, Lock } from 'lucide-react'

/** An inert illustration of the OS-owned prompt; credentials only go to macOS. */
export function MacKeychainPreview() {
  const { t } = useLocale()
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-3 text-ink-2 text-xs">
        {t('keychain.example')}
      </figcaption>
      <div className="keychain-preview" aria-hidden="true">
        <div className="keychain-preview-content">
          <div className="keychain-lock">
            <span />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0 font-bold text-[13px] leading-[17px]">
              {t('keychain.request', { product: 'reBrowser' })}
            </p>
            <p className="my-3 text-xs leading-[17px]">
              {t('keychain.passwordPrompt')}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span>{t('keychain.password')}</span>
              <span className="keychain-password">••••••••</span>
            </div>
          </div>
        </div>
        <div className="keychain-preview-actions">
          <span className="keychain-help">?</span>
          <span className="keychain-button">{t('keychain.always')}</span>
          <span className="flex-1" />
          <span className="keychain-button">{t('keychain.deny')}</span>
          <span className="keychain-allow">
            <span className="keychain-button">{t('keychain.allow')}</span>
          </span>
        </div>
      </div>
    </figure>
  )
}

export function MacKeychainPermissionNote() {
  const { t } = useLocale()
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] text-ink-2 leading-[19px]">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t('keychain.note')}
    </p>
  )
}

/** Native progress does not expose whether a Keychain prompt is currently open. */
export function MacKeychainReminder() {
  const { t } = useLocale()
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent-tint p-4 text-[13px] text-ink-2 leading-relaxed">
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
      <p>{t('keychain.reminder')}</p>
    </div>
  )
}

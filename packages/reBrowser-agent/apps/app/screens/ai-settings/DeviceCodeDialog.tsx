import { useLocale } from '@browseros/i18n/react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PendingDeviceCode } from '@/modules/llm-providers/oauth-provider-flow.hooks'
import { ProviderDialogContent } from './ProviderLocalizedUi'

export interface DeviceCodeDialogProps {
  deviceCode: PendingDeviceCode | null
  onClose: () => void
}

export const DeviceCodeDialog: FC<DeviceCodeDialogProps> = ({
  deviceCode,
  onClose,
}) => {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const handleCopy = async () => {
    if (!deviceCode) return
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(deviceCode.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <Dialog open={!!deviceCode} onOpenChange={(open) => !open && onClose()}>
      <ProviderDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Connect to {name}', { name: deviceCode?.providerName ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Paste this code on the {name} page that just opened in your browser.',
              { name: deviceCode?.providerName ?? '' },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex items-center gap-3 rounded-xl border-2 border-[var(--accent-orange)]/40 border-dashed bg-[var(--accent-orange)]/5 px-6 py-4">
            <code className="font-bold font-mono text-2xl text-foreground tracking-widest">
              {deviceCode?.userCode}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label={t(copied ? 'Copied' : 'Copy code')}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          {copyFailed && (
            <p role="alert" className="text-destructive text-sm">
              {t('Could not copy code. Select and copy it manually.')}
            </p>
          )}
          <p className="text-center text-muted-foreground text-xs">
            {t(
              'This dialog will close automatically once authentication completes.',
            )}
          </p>
          {deviceCode?.verificationUri && (
            <a
              href={deviceCode.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--accent-orange)] text-xs transition-colors hover:underline"
            >
              {t('Open verification page')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </ProviderDialogContent>
    </Dialog>
  )
}

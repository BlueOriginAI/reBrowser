import { useLocale } from '@browseros/i18n/react'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DisplayHeading, StepCopy } from '../components/DisplayHeading'

interface SetupStepProps {
  failed: boolean
  onRetry: () => void
}

/** Holds the browser-owned WebUI open while native prepares the product extension.
 * Native owns success navigation; this view only offers recovery after failure. */
export function SetupStep({ failed, onRetry }: SetupStepProps) {
  const { t } = useLocale()
  return (
    <div className="flex flex-1 items-center">
      <div className="w-full max-w-[560px]">
        <div role={failed ? 'alert' : 'status'} aria-atomic="true">
          {failed ? (
            <CircleAlert
              aria-hidden="true"
              className="mb-6 size-8 text-accent"
            />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="mb-6 size-8 text-accent motion-safe:animate-spin"
            />
          )}
          <DisplayHeading>
            {failed ? t('setup.failed') : t('setup.finishing')}
          </DisplayHeading>
          <StepCopy>
            {failed
              ? t('setup.tryAgain')
              : t('setup.preparing', { product: 'reBrowser' })}
          </StepCopy>
        </div>
        {failed && (
          <Button type="button" size="lg" onClick={onRetry}>
            {t('setup.retry')}
          </Button>
        )}
      </div>
    </div>
  )
}

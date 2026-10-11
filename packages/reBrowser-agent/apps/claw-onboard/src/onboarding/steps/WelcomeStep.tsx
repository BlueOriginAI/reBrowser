import { useLocale } from '@browseros/i18n/react'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface WelcomeStepProps {
  onPrimary: () => void
  onSkip: () => void
}

/** Renders the opening onboarding step and setup/reconnect choices. */
export function WelcomeStep({ onPrimary, onSkip }: WelcomeStepProps) {
  const { t } = useLocale()
  return (
    <StepWrap>
      <DisplayHeading>
        {t('claw.welcome.title.before')}
        <Em>{t('claw.welcome.title.emphasis')}</Em>
      </DisplayHeading>
      <StepCopy>{t('claw.welcome.copy')}</StepCopy>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onPrimary}>
          <Zap className="size-4" />
          {t('claw.welcome.start')}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          {t('claw.welcome.reconnect')}
        </Button>
      </div>
    </StepWrap>
  )
}

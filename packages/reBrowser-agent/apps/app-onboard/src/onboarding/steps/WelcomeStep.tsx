import { useLocale } from '@browseros/i18n/react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface WelcomeStepProps {
  onPrimary: () => void
  onSkip: () => void
}

/** Opening step: names the two things onboarding will do, then gets out of the way. */
export function WelcomeStep({ onPrimary, onSkip }: WelcomeStepProps) {
  const { t } = useLocale()
  return (
    <StepWrap>
      <DisplayHeading>
        {t('welcome.title.before')}
        <Em>reBrowser</Em>
      </DisplayHeading>
      <StepCopy>{t('welcome.copy')}</StepCopy>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onPrimary}>
          {t('welcome.start')}
          <ArrowRight className="size-4" />
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          {t('welcome.skip')}
        </Button>
      </div>
    </StepWrap>
  )
}

import { useLocale } from '@browseros/i18n/react'
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import { jtbdPopupStorage } from '@/lib/jtbd-popup/storage'
import { Chat } from './SurveyChat'
import { Header } from './SurveyHeader'
import { Welcome } from './SurveyWelcome'
import { useChat } from './survey-chat.hooks'

export interface SurveyPageProps {
  maxTurns?: number
  experimentId?: string
}

const ThankYouCard: FC<{ onReset: () => void }> = ({ onReset }) => {
  const { t } = useLocale()
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="mb-2 font-semibold text-lg">{t('Thank You!')}</h3>
      <p className="mx-auto mb-6 max-w-md text-muted-foreground text-sm">
        {t(
          'Your feedback helps us build better products. We appreciate you taking the time to share your experience.',
        )}
      </p>
      <Button onClick={onReset} variant="outline">
        <RotateCcw className="mr-2 h-4 w-4" />
        {t('Start Another Survey')}
      </Button>
    </div>
  )
}

const ErrorCard: FC<{ error: Error; onRetry: () => void }> = ({
  error,
  onRetry,
}) => {
  const { t } = useLocale()
  return (
    <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="mb-2 font-semibold text-destructive">
        {t('Something went wrong')}
      </h3>
      <p className="mb-4 text-muted-foreground text-sm">
        {/^Failed to start interview: /.test(error.message)
          ? t('surfaces.startSurveyFailed', {
              status: error.message.replace('Failed to start interview: ', ''),
            })
          : /^Failed to respond: /.test(error.message)
            ? t('surfaces.respondSurveyFailed', {
                status: error.message.replace('Failed to respond: ', ''),
              })
            : t(error.message)}
      </p>
      <Button onClick={onRetry} variant="outline">
        <RotateCcw className="mr-2 h-4 w-4" />
        {t('Try Again')}
      </Button>
    </div>
  )
}

export const SurveyPage: FC<SurveyPageProps> = ({ maxTurns, experimentId }) => {
  const chat = useChat({ maxTurns, experimentId })

  const handleStart = async () => {
    const current = await jtbdPopupStorage.getValue()
    await jtbdPopupStorage.setValue({ ...current, surveyTaken: true })
    chat.start()
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <Header />

      {chat.phase === 'idle' && (
        <Welcome onStart={handleStart} isLoading={chat.isStreaming} />
      )}

      {chat.phase === 'active' && (
        <Chat
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          onSendMessage={chat.respond}
          onStop={chat.stop}
        />
      )}

      {chat.phase === 'completed' && <ThankYouCard onReset={chat.reset} />}

      {chat.phase === 'error' && chat.error && (
        <ErrorCard error={chat.error} onRetry={chat.reset} />
      )}
    </div>
  )
}

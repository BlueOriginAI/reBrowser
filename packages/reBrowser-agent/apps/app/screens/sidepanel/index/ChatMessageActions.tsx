import { useLocale } from '@browseros/i18n/react'
import { CheckIcon, CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FC, useState } from 'react'
import { MessageAction, MessageActions } from '@/components/ai-elements/message'
import { LocalizedDialogContent as DialogContent } from '@/components/i18n/LocalizedDialogContent'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SIDEPANEL_MESSAGE_COPIED_EVENT } from '@/lib/constants/analyticsEvents'
import { track } from '@/lib/metrics/track'

export interface ChatMessageActionsProps {
  messageId: string
  messageText: string
  liked: boolean
  disliked: boolean
  onClickLike: () => void
  onClickDislike: (comment?: string) => void
}

export const ChatMessageActions: FC<ChatMessageActionsProps> = ({
  messageId,
  messageText,
  liked,
  disliked,
  onClickLike,
  onClickDislike,
}) => {
  const { t } = useLocale()

  const [dislikeDialogOpen, setDislikeDialogOpen] = useState(false)
  const [dislikeComment, setDislikeComment] = useState('')

  const feedbackSubmitted = liked || disliked

  const handleLike = () => {
    onClickLike()
  }

  const handleDislikeClick = () => {
    setDislikeDialogOpen(true)
  }

  const handleDislikeSubmit = () => {
    onClickDislike(dislikeComment.trim() || undefined)
    setDislikeDialogOpen(false)
    setDislikeComment('')
  }

  const handleDislikeCancel = () => {
    setDislikeDialogOpen(false)
    setDislikeComment('')
  }

  return (
    <MessageActions>
      <MessageAction
        onClick={() => {
          navigator.clipboard.writeText(messageText)
          track(SIDEPANEL_MESSAGE_COPIED_EVENT)
        }}
        label={t('Copy')}
        tooltip={t('Copy to clipboard')}
      >
        <CopyIcon className="size-3" />
      </MessageAction>
      <AnimatePresence mode="wait" initial={false}>
        {feedbackSubmitted ? (
          <motion.div
            key={`${messageId}-feedback-submitted`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1 text-muted-foreground text-xs"
          >
            <CheckIcon className="size-3" />
            <span>{t('Feedback submitted')}</span>
          </motion.div>
        ) : (
          <motion.div
            key={`${messageId}-feedback-actions`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1"
          >
            <MessageAction
              label={t('Like')}
              onClick={handleLike}
              tooltip={t('Like this response')}
            >
              <ThumbsUpIcon
                className="size-4"
                fill={liked ? 'currentColor' : 'none'}
              />
            </MessageAction>
            <MessageAction
              label={t('Dislike')}
              onClick={handleDislikeClick}
              tooltip={t('Dislike this response')}
            >
              <ThumbsDownIcon
                className="size-4"
                fill={disliked ? 'currentColor' : 'none'}
              />
            </MessageAction>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={dislikeDialogOpen} onOpenChange={setDislikeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('What went wrong?')}</DialogTitle>
            <DialogDescription>
              {t(
                'Help us improve by sharing what was wrong with this response.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t('Add a comment (optional)')}
            value={dislikeComment}
            onChange={(e) => setDislikeComment(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                handleDislikeSubmit()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleDislikeCancel}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleDislikeSubmit}>{t('Submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MessageActions>
  )
}

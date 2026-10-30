import { useLocale } from '@browseros/i18n/react'
import type { UIMessage } from 'ai'
import { Bot, Brain, ChevronDown } from 'lucide-react'
import { type FC, Fragment } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Reasoning, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { LocalizedMessageResponse as MessageResponse } from '@/components/i18n/LocalizedMessageResponse'
import { CollapsibleContent } from '@/components/ui/collapsible'
import type { ChatAction } from '@/lib/chat-actions/types'
import { ChatMessageActions } from './ChatMessageActions'
import { ConnectAppCard } from './ConnectAppCard'
import { getMessageSegments } from './getMessageSegments'
import { JtbdPopup } from './JtbdPopup'
import { ScheduleSuggestionCard } from './ScheduleSuggestionCard'
import { ToolBatch } from './ToolBatch'
import { UserActionMessage } from './UserActionMessage'

export interface ChatMessagesProps {
  messages: UIMessage[]
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  getActionForMessage?: (message: UIMessage) => ChatAction | undefined
  liked: Record<string, boolean>
  onClickLike: (messageId: string) => void
  disliked: Record<string, boolean>
  onClickDislike: (messageId: string, comment?: string) => void
  showJtbdPopup: boolean
  showDontShowAgain: boolean
  onTakeSurvey: (opts?: { dontShowAgain?: boolean }) => void
  onDismissJtbdPopup: (dontShowAgain: boolean) => void
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  status,
  getActionForMessage,
  liked,
  disliked,
  onClickLike,
  onClickDislike,
  showJtbdPopup,
  showDontShowAgain,
  onTakeSurvey,
  onDismissJtbdPopup,
}) => {
  const { t } = useLocale()
  const isStreaming = status === 'streaming' || status === 'submitted'

  return (
    <>
      <Conversation className="ph-mask">
        <ConversationContent>
          {messages.map((message, messageIndex) => {
            const action = getActionForMessage?.(message)
            const isLastMessage = messageIndex === messages.length - 1
            const segments = getMessageSegments(
              message,
              isLastMessage,
              isStreaming,
            )
            const toolBatches = segments.filter((s) => s.type === 'tool-batch')
            const lastToolBatchKey = toolBatches[toolBatches.length - 1]?.key

            const messageText = segments
              ?.filter((each) => each.type === 'text')
              ?.map((each) => each.text)
              ?.join('\n\n')

            const likeAction = () => onClickLike(message.id)
            const dislikeAction = (comment?: string) =>
              onClickDislike(message.id, comment)

            return (
              <Fragment key={message.id}>
                <Message from={message.role}>
                  <MessageContent>
                    {action ? (
                      <UserActionMessage action={action} />
                    ) : (
                      segments.map((segment) => {
                        switch (segment.type) {
                          case 'text':
                            return (
                              <MessageResponse key={segment.key}>
                                {segment.text}
                              </MessageResponse>
                            )
                          case 'reasoning':
                            return (
                              <Reasoning
                                key={segment.key}
                                className="w-full"
                                isStreaming={segment.isStreaming}
                              >
                                <ReasoningTrigger>
                                  <Brain className="size-4" />
                                  <span>
                                    {segment.isStreaming
                                      ? t('Thinking...')
                                      : t('Thought process')}
                                  </span>
                                  <ChevronDown className="size-4" />
                                </ReasoningTrigger>
                                <CollapsibleContent className="mt-4 text-sm">
                                  <MessageResponse>
                                    {segment.text}
                                  </MessageResponse>
                                </CollapsibleContent>
                              </Reasoning>
                            )
                          case 'tool-batch':
                            return (
                              <ToolBatch
                                key={segment.key}
                                tools={segment.tools}
                                isLastBatch={segment.key === lastToolBatchKey}
                                isLastMessage={isLastMessage}
                                isStreaming={isStreaming}
                              />
                            )
                          case 'nudge':
                            return segment.nudgeType ===
                              'schedule_suggestion' ? (
                              <ScheduleSuggestionCard
                                key={segment.key}
                                data={segment.data}
                                isLastMessage={isLastMessage}
                              />
                            ) : (
                              <ConnectAppCard
                                key={segment.key}
                                data={segment.data}
                                isLastMessage={isLastMessage}
                              />
                            )
                          default:
                            return null
                        }
                      })
                    )}
                  </MessageContent>
                </Message>
                {message.role === 'assistant' &&
                (!isLastMessage || !isStreaming) ? (
                  <ChatMessageActions
                    messageId={message.id}
                    messageText={messageText}
                    liked={liked[message.id] ?? false}
                    disliked={disliked[message.id] ?? false}
                    onClickLike={likeAction}
                    onClickDislike={dislikeAction}
                  />
                ) : null}
              </Fragment>
            )
          })}
          {showJtbdPopup && (
            <JtbdPopup
              onTakeSurvey={onTakeSurvey}
              onDismiss={onDismissJtbdPopup}
              showDontShowAgain={showDontShowAgain}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={t('Scroll to bottom')} />
      </Conversation>

      {isStreaming && (
        <div className="flex animate-fadeInUp gap-2 px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1 rounded-xl rounded-tl-none border border-border/50 bg-card px-3 py-2.5 shadow-sm">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-orange)]" />
          </div>
        </div>
      )}
      <div />
    </>
  )
}

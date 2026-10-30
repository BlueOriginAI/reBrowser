import { useLocale } from '@browseros/i18n/react'
import { Loader2, MessageSquare } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ConversationGroup } from './ConversationGroup'
import type { GroupedConversations } from './types'

export interface ConversationListProps {
  groupedConversations: GroupedConversations
  activeConversationId: string
  onDelete?: (id: string) => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  onLoadMore?: () => void
  isRefreshing?: boolean
  /**
   * Shown when this list has nothing in it. History can render two lists now,
   * so the wording has to say which store is empty.
   */
  emptyMessage?: string
}

export const ConversationList: FC<ConversationListProps> = ({
  groupedConversations,
  activeConversationId,
  onDelete,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  isRefreshing,
  emptyMessage,
}) => {
  const { t } = useLocale()
  const resolvedEmptyMessage = emptyMessage ?? t('history.empty')
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasNextPage || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          onLoadMore()
        }
      },
      { threshold: 0.1 },
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore])

  const hasConversations =
    groupedConversations.today.length > 0 ||
    groupedConversations.thisWeek.length > 0 ||
    groupedConversations.thisMonth.length > 0 ||
    groupedConversations.older.length > 0

  return (
    <div className="w-full p-3">
      {isRefreshing && (
        <div className="flex items-center justify-center gap-2 pb-3 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t('history.fetching')}</span>
        </div>
      )}
      {!hasConversations ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">
            {resolvedEmptyMessage}
          </p>
          <Link to="/" className="mt-2 text-primary text-sm hover:underline">
            {t('history.startNew')}
          </Link>
        </div>
      ) : (
        <>
          <ConversationGroup
            label={t('history.today')}
            conversations={groupedConversations.today}
            onDelete={onDelete}
            activeConversationId={activeConversationId}
          />
          <ConversationGroup
            label={t('history.thisWeek')}
            conversations={groupedConversations.thisWeek}
            onDelete={onDelete}
            activeConversationId={activeConversationId}
          />
          <ConversationGroup
            label={t('history.thisMonth')}
            conversations={groupedConversations.thisMonth}
            onDelete={onDelete}
            activeConversationId={activeConversationId}
          />
          <ConversationGroup
            label={t('history.older')}
            conversations={groupedConversations.older}
            onDelete={onDelete}
            activeConversationId={activeConversationId}
          />

          {hasNextPage && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4"
            >
              {isFetchingNextPage && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

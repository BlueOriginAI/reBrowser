import type { Locale } from '@browseros/i18n/core'
import {
  formatDate,
  formatNumber,
  formatRelativeTime,
} from '@browseros/i18n/format'
import type { TaskStatus, TaskSummary } from '@/modules/api/audit.hooks'

/**
 * LIVE runs always float to the top of the list regardless of
 * `startedAt`; within each status group we sort newest-first. This
 * is the input sort applied BEFORE tanstack-table's own sorting
 * state so operator-triggered column sorts still work naturally
 * (an operator sort override replaces this pre-sort at render).
 */
export function orderByLiveThenRecency(tasks: TaskSummary[]): TaskSummary[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1
    if (b.status === 'live' && a.status !== 'live') return 1
    return b.startedAt - a.startedAt
  })
}

/** Locale-aware day-band label used by the audit list. */
export function formatDayHeading(ts: number, locale: Locale = 'en'): string {
  return formatDate(ts, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Local calendar-day equality (year + month + date), timezone-aware. */
export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

const NINE_SECONDS = 9_000
const ONE_MINUTE = 60_000
const ONE_HOUR = 3_600_000
const ONE_DAY = 86_400_000

export function formatRelative(
  createdAt: number,
  now: number,
  locale: Locale = 'en',
): string {
  const delta = now - createdAt
  if (delta < NINE_SECONDS) return formatRelativeTime(0, 'second', locale)
  if (delta < ONE_MINUTE)
    return formatRelativeTime(-Math.floor(delta / 1000), 'second', locale)
  if (delta < ONE_HOUR)
    return formatRelativeTime(-Math.floor(delta / ONE_MINUTE), 'minute', locale)
  if (delta < ONE_DAY)
    return formatRelativeTime(-Math.floor(delta / ONE_HOUR), 'hour', locale)
  return formatRelativeTime(-Math.floor(delta / ONE_DAY), 'day', locale)
}

export function siteOf(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatDuration(ms: number, locale: Locale = 'en'): string {
  const v = ms < 0 ? 0 : ms
  if (v < 1000) return locale === 'zh-CN' ? `${v}毫秒` : `${v}ms`
  const seconds = Math.floor(v / 1000)
  if (seconds < 60) return locale === 'zh-CN' ? `${seconds}秒` : `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const remSec = seconds % 60
  if (mins < 60)
    return locale === 'zh-CN' ? `${mins}分${remSec}秒` : `${mins}m ${remSec}s`
  const hours = Math.floor(mins / 60)
  const remMin = mins % 60
  return locale === 'zh-CN' ? `${hours}小时${remMin}分` : `${hours}h ${remMin}m`
}

/** Compact token count for dense rows. */
export function formatTokensCompact(
  tokens: number,
  locale: Locale = 'en',
): string {
  return formatNumber(Math.max(0, tokens), locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  })
}

/** Grouped exact token count for the detail card. */
export function formatTokensFull(
  tokens: number,
  locale: Locale = 'en',
): string {
  return formatNumber(Math.max(0, tokens), locale, {
    maximumFractionDigits: 0,
  })
}

/**
 * Short trail of tool names with an ellipsis when the sequence is
 * longer than `cap`. Mirrors the abbreviated trail shown on each
 * task card / row.
 */
export function abbreviateSequence(seq: string[], cap = 5): string {
  if (seq.length <= cap) return seq.join(' → ')
  return `${seq.slice(0, cap).join(' → ')} → …`
}

export interface AgentChip {
  slug: string
  count: number
}

/**
 * Chips render the slug, not the session label. The label is whatever the client
 * typed, so two sessions announcing "Claude Code" and "claude-code" group into one
 * chip whose displayed name would otherwise depend on which arrived first. The slug
 * is also what the tab strip shows, so both surfaces name the agent identically.
 */
export function agentChipsFor(tasks: TaskSummary[]): AgentChip[] {
  const map = new Map<string, AgentChip>()
  for (const t of tasks) {
    const existing = map.get(t.slug)
    if (existing) {
      existing.count += 1
      continue
    }
    map.set(t.slug, { slug: t.slug, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export function statusOptions(
  tasks: TaskSummary[],
): { status: TaskStatus; count: number }[] {
  const counts: Record<TaskStatus, number> = {
    live: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const t of tasks) counts[t.status] += 1
  return (['live', 'done', 'failed', 'cancelled'] as TaskStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => ({ status: s, count: counts[s] }))
}

export function siteOptions(
  tasks: TaskSummary[],
): { site: string; count: number }[] {
  const map = new Map<string, number>()
  for (const t of tasks) {
    if (!t.site) continue
    map.set(t.site, (map.get(t.site) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count)
}

export function parseResultMeta(raw: string | null | undefined): {
  isError: boolean
  contentSummary: string
  structuredKeys: string[]
} | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as {
      isError?: boolean
      contentSummary?: string
      structuredKeys?: string[]
    }
    return {
      isError: Boolean(v.isError),
      contentSummary: v.contentSummary ?? 'unknown',
      structuredKeys: Array.isArray(v.structuredKeys) ? v.structuredKeys : [],
    }
  } catch {
    return null
  }
}

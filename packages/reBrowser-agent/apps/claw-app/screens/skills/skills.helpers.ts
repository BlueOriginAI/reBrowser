import type { Locale } from '@browseros/i18n/core'
import {
  formatNumber,
  formatRelativeTime as formatRelative,
} from '@browseros/i18n/format'

/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure formatters for the Tasks list and detail. No React, no side effects.
 */

/** Every skill is namespaced under this prefix so it never collides with a
 *  user's own agent skills and the whole set autocompletes on `/neo`. */
export const NEO_SKILL_PREFIX = 'neo-'

/**
 * The canonical, neo-namespaced name for a user-typed suffix. Mirrors the
 * server: a bare suffix is prefixed, and an over-typed `neo-` is not doubled.
 */
export function neoName(suffix: string): string {
  return `${NEO_SKILL_PREFIX}${suffix.replace(/^neo-/, '')}`
}

/** The command a user pastes into a coding agent to run a skill. */
export function skillCommand(name: string): string {
  return `/${name}`
}

/** Compact, locale-aware token count. */
export function formatTokens(tokens: number, locale: Locale = 'en'): string {
  if (locale === 'en')
    return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}k`
  return formatNumber(Math.max(0, tokens), locale, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  })
}

/**
 * Percent change from the first run's tokens to the latest run's, so a negative
 * value means the skill got cheaper. `null` when there is nothing to compare.
 */
export function tokenDeltaPercent(
  first: number | undefined,
  latest: number | undefined,
): number | null {
  if (first === undefined || latest === undefined || first === 0) {
    return null
  }
  return Math.round(((latest - first) / first) * 100)
}

/**
 * Split a rendered SKILL.md into its editable structured fields so the edit
 * form can pre-fill them. Reads the numbered `## Steps` and the bulleted
 * `## Learned from past runs` sections. The auto-generated first step that
 * records the run is dropped, since the server re-adds it on save.
 */
export function parseSkillBody(body: string): {
  steps: string[]
  learnedNotes: string[]
} {
  const steps: string[] = []
  const learnedNotes: string[] = []
  let section: 'steps' | 'learned' | null = null
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      const title = trimmed.slice(3).toLowerCase()
      section = title.startsWith('steps')
        ? 'steps'
        : title.startsWith('learned')
          ? 'learned'
          : null
      continue
    }
    if (section === 'steps') {
      const match = line.match(/^\s*\d+\.\s+(.*)$/)
      const step = match?.[1]?.trim()
      if (step && !step.includes('mark_skill_run')) {
        steps.push(step)
      }
    } else if (section === 'learned') {
      const match = line.match(/^\s*-\s+(.*)$/)
      const note = match?.[1]?.trim()
      if (note) {
        learnedNotes.push(note)
      }
    }
  }
  return { steps, learnedNotes }
}

/** A short "time ago" label from an epoch-ms timestamp. */
export function formatRelativeTime(
  epochMs: number,
  now: number = Date.now(),
  locale: Locale = 'en',
): string {
  const minutes = Math.floor(Math.max(0, now - epochMs) / 60_000)
  if (minutes < 1) return locale === 'en' ? 'just now' : '刚刚'
  if (minutes < 60)
    return locale === 'en'
      ? `${minutes}m ago`
      : formatRelative(-minutes, 'minute', locale)
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return locale === 'en'
      ? `${hours}h ago`
      : formatRelative(-hours, 'hour', locale)
  const days = Math.floor(hours / 24)
  return locale === 'en' ? `${days}d ago` : formatRelative(-days, 'day', locale)
}

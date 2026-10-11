import type { Locale } from './core'

export function formatDate(
  value: Date | number | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: Locale,
): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    value,
    unit,
  )
}

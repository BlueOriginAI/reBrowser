import type { CockpitStats, CockpitStatsWindow } from '@browseros/claw-api'
import type { Locale } from '@browseros/i18n/core'
import { useLocale } from '@browseros/i18n/react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type { CockpitStats, CockpitStatsWindow } from '@browseros/claw-api'

interface SavedStatsBandProps {
  stats: CockpitStats
}

const WINDOWS = [
  { key: 'allTime', tabLabel: 'All time', valueLabel: 'all time' },
  { key: 'last30Days', tabLabel: '30 days', valueLabel: 'last 30 days' },
  { key: 'last7Days', tabLabel: '7 days', valueLabel: 'last 7 days' },
] as const

type WindowKey = (typeof WINDOWS)[number]['key']

export function SavedStatsBand({ stats }: SavedStatsBandProps) {
  const { t } = useLocale()
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('allTime')

  if (!stats.hasMeasuredStats) return null

  return (
    <Tabs
      className="min-w-0 gap-4"
      data-saved-stats
      onValueChange={(value) => {
        if (isWindowKey(value)) setSelectedWindow(value)
      }}
      render={<section />}
      value={selectedWindow}
    >
      <header
        className="flex flex-wrap items-center gap-3"
        data-saved-stats-header
      >
        <h2 className="font-semibold text-[18px] text-cyanotype-ink leading-7">
          {t('Since you started')}
        </h2>
        <TabsList
          activateOnFocus
          aria-label={t('Saved stats window')}
          className="ml-auto h-9 rounded-[9px] bg-cyanotype-well p-1"
        >
          {WINDOWS.map(({ key, tabLabel }) => (
            <TabsTrigger
              className="h-7 flex-none rounded-md border-0 px-3 py-1 font-normal text-[12px] text-cyanotype-muted leading-4 shadow-none transition-[background-color,color,box-shadow] hover:text-cyanotype-ink data-active:bg-white data-active:font-semibold data-active:text-cyanotype-blue data-active:shadow-[0_1px_3px_rgba(12,39,66,0.12)] motion-reduce:transition-none"
              key={key}
              value={key}
            >
              {t(tabLabel)}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      {WINDOWS.map((windowDefinition) => (
        <TabsContent
          className="min-w-0 rounded-[9px] border border-cyanotype-border bg-card px-5 py-4"
          data-saved-stats-card
          key={windowDefinition.key}
          value={windowDefinition.key}
        >
          <SavedStatsPanel
            windowDefinition={windowDefinition}
            windowStats={stats[windowDefinition.key]}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

interface SavedStatsPanelProps {
  windowDefinition: (typeof WINDOWS)[number]
  windowStats: CockpitStatsWindow
}

function SavedStatsPanel({
  windowDefinition,
  windowStats,
}: SavedStatsPanelProps) {
  const { t, locale } = useLocale()
  const visibleSavings = Math.max(0, windowStats.rawTokenSavingsEstimate)
  const savingsRatio = boundedRatio(
    windowStats.rawTokenSavingsEstimate,
    windowStats.screenshotFirstTokenEstimate,
  )
  const usedRatio = boundedRatio(
    windowStats.browserClawTokenEstimate,
    windowStats.screenshotFirstTokenEstimate,
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="text-[11px] text-cyanotype-muted leading-4">
            {t('Tokens saved ·')} {t(windowDefinition.valueLabel)}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className="font-extrabold text-[26px] text-cyanotype-ink tabular-nums leading-none tracking-[-0.02em]"
              data-stat="tokens-saved"
            >
              {formatCompact(visibleSavings, locale)}
            </span>
            <span
              className="inline-flex items-baseline gap-1.5 rounded-full bg-green-tint px-2.5 py-1"
              data-savings-pill
            >
              <span
                className="font-bold text-[13px] text-green tabular-nums leading-4"
                data-stat="percentage"
              >
                {Math.round(savingsRatio * 100)}%
              </span>
              <span className="text-[12px] text-green leading-4">
                {t('fewer')}
              </span>
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] text-cyanotype-muted leading-4">
            {t('Human time saved')}
          </div>
          <div
            className="mt-1.5 font-extrabold text-[26px] text-cyanotype-ink tabular-nums leading-none tracking-[-0.02em]"
            data-stat="human-time"
          >
            {formatHumanTime(windowStats.humanTimeSavedMs, t)}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] text-cyanotype-muted leading-4">
            {t('Sessions · tool calls')}
          </div>
          <div
            className="mt-1.5 min-w-0 max-w-full break-all font-extrabold text-[26px] text-cyanotype-ink tabular-nums leading-none tracking-[-0.02em]"
            data-session-tool-metrics
          >
            <span data-stat="sessions">
              {formatWhole(windowStats.sessionCount, locale)}
            </span>{' '}
            ·{' '}
            <span data-stat="tool-calls">
              {formatWhole(windowStats.toolCallCount, locale)}
            </span>
          </div>
        </div>
      </div>

      {/* Both labels sit outside the bounded track so no ratio can clip them. */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] leading-4">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-cyanotype-soft">
            {t('used')}{' '}
            <span className="tabular-nums" data-stat="browserclaw-tokens">
              {formatCompact(windowStats.browserClawTokenEstimate, locale)}
            </span>
          </span>
          <span className="text-cyanotype-muted">
            {t('a screenshot-first agent would spend')}{' '}
            <span className="tabular-nums" data-stat="comparison-tokens">
              {formatCompact(windowStats.screenshotFirstTokenEstimate, locale)}
            </span>
          </span>
        </div>
        <div
          aria-hidden
          className="relative h-1.5 min-w-0 overflow-hidden rounded-full bg-cyanotype-well"
          data-budget-track
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-green transition-[width] duration-300 motion-reduce:transition-none"
            data-used-fill
            style={{ width: `${usedRatio * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function isWindowKey(value: unknown): value is WindowKey {
  return WINDOWS.some(({ key }) => key === value)
}

function boundedRatio(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, value / total))
}

function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(Math.max(0, value))
}

function formatWhole(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.max(0, value),
  )
}

function formatHumanTime(
  milliseconds: number,
  t: (key: string, values: Record<string, unknown>) => string,
): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours === 0
    ? t('{{minutes}}m', { minutes })
    : t('{{hours}}h {{minutes}}m', {
        hours,
        minutes: String(minutes).padStart(2, '0'),
      })
}

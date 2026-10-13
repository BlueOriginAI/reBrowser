/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLocale } from '@browseros/i18n/react'

export function VideoFeature() {
  const { t } = useLocale()
  const steps = [
    'Manage agents',
    'Hand off your first task',
    'Then come back here to watch it run.',
  ]

  return (
    <div className="flex h-full flex-col justify-center gap-6 rounded-3xl border border-border-2 bg-card p-8 shadow-sm">
      <p className="font-semibold text-2xl text-ink">reBrowser</p>
      <ol className="space-y-4 text-ink-2 text-sm">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 font-medium text-accent">
              {index + 1}
            </span>
            {t(step)}
          </li>
        ))}
      </ol>
    </div>
  )
}

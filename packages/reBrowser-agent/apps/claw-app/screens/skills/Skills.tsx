/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Skill } from '@browseros/claw-api'
import type { Locale } from '@browseros/i18n/core'
import { useLocale } from '@browseros/i18n/react'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { DeleteSkillDialog } from '@/components/skills/DeleteSkillDialog'
import { RunSkillButton } from '@/components/skills/RunSkillButton'
import { SkillFormDialog } from '@/components/skills/SkillFormDialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useSkillsScreenData } from './skills.data'
import { formatTokens, skillCommand } from './skills.helpers'

const CELL_PADDING = 'px-2 py-3 first:pl-4 last:pr-4'

/**
 * Tasks list. A task is a skill BrowserOS neo linked into the connected coding
 * agents; each row shows its run count and token savings. Row click opens
 * the SKILL.md and run history.
 */
export function Skills() {
  const { locale, t } = useLocale()
  const { skills, isLoading, isError } = useSkillsScreenData()
  const navigate = useNavigate()
  const location = useLocation()

  const openSkill = (name: string) =>
    navigate(`/skills/${encodeURIComponent(name)}`, {
      state: { from: location.pathname },
    })

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 pt-8 pb-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-extrabold text-3xl leading-tight tracking-tight md:text-4xl">
            {t('skills.title')}
          </h1>
          <p className="text-ink-2 text-sm">{t('skills.description')}</p>
        </div>
        <SkillFormDialog
          mode="create"
          trigger={
            <Button size="sm" className="rounded-9">
              <Plus />
              {t('skills.new')}
            </Button>
          }
        />
      </header>

      {isError ? (
        <SkillsNotice>{t('skills.loadError')}</SkillsNotice>
      ) : isLoading ? (
        <SkillsSkeleton />
      ) : skills.length === 0 ? (
        <SkillsEmpty t={t} />
      ) : (
        <LedgerCard>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-ledger-border border-b bg-ledger-head hover:bg-ledger-head">
                <TableHead
                  className={cn(
                    CELL_PADDING,
                    'h-auto font-medium text-[12px] text-ledger-head-ink',
                  )}
                >
                  {t('skills.column.task')}
                </TableHead>
                <TableHead
                  className={cn(
                    CELL_PADDING,
                    'h-auto w-24 text-right font-medium text-[12px] text-ledger-head-ink',
                  )}
                >
                  {t('skills.column.runs')}
                </TableHead>
                <TableHead
                  className={cn(
                    CELL_PADDING,
                    'h-auto w-40 text-right font-medium text-[12px] text-ledger-head-ink',
                  )}
                >
                  {t('skills.column.tokensSaved')}
                </TableHead>
                <TableHead
                  className={cn(
                    CELL_PADDING,
                    'h-auto w-44 font-medium text-[12px] text-ledger-head-ink',
                  )}
                >
                  <span className="sr-only">{t('skills.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  locale={locale}
                  t={t}
                  onOpen={() => openSkill(skill.name)}
                />
              ))}
            </TableBody>
          </Table>
        </LedgerCard>
      )}
    </div>
  )
}

type Translator = (key: string, options?: Record<string, unknown>) => string

function SkillRow({
  skill,
  locale,
  t,
  onOpen,
}: {
  skill: Skill
  locale: Locale
  t: Translator
  onOpen: () => void
}) {
  return (
    <TableRow
      data-testid={`skill-row-${skill.name}`}
      onClick={onOpen}
      className="cursor-pointer border-ledger-divider border-b hover:bg-card-tint"
    >
      <TableCell className={cn(CELL_PADDING, 'align-middle')}>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium font-mono text-[13px] text-primary">
            {skillCommand(skill.name)}
          </span>
          <span className="truncate text-[13px] text-ledger-ink-2">
            {skill.description}
          </span>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          CELL_PADDING,
          'text-right align-middle text-[13px] text-ink',
        )}
      >
        {skill.runCount}
      </TableCell>
      <TableCell className={cn(CELL_PADDING, 'text-right align-middle')}>
        {skill.tokenSavings && skill.tokenSavings.measuredRunCount > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[13px] text-ink">
              {formatTokens(Math.max(0, skill.tokenSavings.saved), locale)}
            </span>
            <span className="text-[11px] text-ink-3">{t('skills.saved')}</span>
          </div>
        ) : (
          <span className="text-[13px] text-ink-3">
            {t('skills.notMeasured')}
          </span>
        )}
      </TableCell>
      <TableCell
        className={cn(CELL_PADDING, 'align-middle')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-1.5">
          <RunSkillButton name={skill.name} />
          <DeleteSkillDialog
            name={skill.name}
            onDeleted={() => {}}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-9 text-red hover:text-red"
              >
                {t('common.delete')}
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

function LedgerCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-clip rounded-9 border border-ledger-border bg-card">
      {children}
    </div>
  )
}

function SkillsNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-9 border border-ledger-border bg-card px-6 py-10 text-center text-ink-2 text-sm">
      {children}
    </div>
  )
}

function SkillsEmpty({ t }: { t: Translator }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-9 border border-ledger-border border-dashed bg-card px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-base text-ink">
          {t('skills.emptyTitle')}
        </p>
        <p className="mx-auto max-w-md text-ink-2 text-sm">
          {t('skills.emptyDescription')}
        </p>
      </div>
      <SkillFormDialog
        mode="create"
        trigger={
          <Button size="sm" className="rounded-9">
            <Plus />
            New task
          </Button>
        }
      />
    </div>
  )
}

function SkillsSkeleton() {
  return (
    <LedgerCard>
      <div className="divide-y divide-ledger-divider">
        {['s1', 's2', 's3', 's4'].map((id) => (
          <div key={id} className="px-4 py-4">
            <div className="h-4 w-full animate-pulse rounded bg-card-tint" />
          </div>
        ))}
      </div>
    </LedgerCard>
  )
}

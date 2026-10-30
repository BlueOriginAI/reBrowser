/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLocale } from '@browseros/i18n/react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { skillCommand } from '@/screens/skills/skills.helpers'

interface RunSkillButtonProps {
  name: string
  size?: 'sm' | 'default'
}

/** Copies the `/name` command a user pastes into a coding agent to run a skill. */
export function RunSkillButton({ name, size = 'sm' }: RunSkillButtonProps) {
  const { t } = useLocale()
  const onRun = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      return
    }
    void navigator.clipboard.writeText(skillCommand(name)).then(() => {
      toast.success(
        t('skills.commandCopied', { command: skillCommand(name) }),
        {
          description: t('skills.commandCopiedDescription'),
        },
      )
    })
  }
  return (
    <Button size={size} variant="outline" className="rounded-9" onClick={onRun}>
      <Copy />
      {t('skills.run')}
    </Button>
  )
}

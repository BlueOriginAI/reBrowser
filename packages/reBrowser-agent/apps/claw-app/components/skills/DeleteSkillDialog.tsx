/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLocale } from '@browseros/i18n/react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useDeleteSkill, useSkills } from '@/modules/api/skills.hooks'

interface DeleteSkillDialogProps {
  name: string
  onDeleted: () => void
  trigger?: ReactElement
}

export function DeleteSkillDialog({
  name,
  onDeleted,
  trigger,
}: DeleteSkillDialogProps) {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const remove = useDeleteSkill()

  const onConfirm = () => {
    void toast.promise(
      remove.mutateAsync({ name }).then(() => {
        void queryClient.invalidateQueries({ queryKey: useSkills.getKey() })
        onDeleted()
      }),
      {
        loading: t('skills.deleting', { name }),
        success: t('skills.deleted', { name }),
        error: t('skills.deleteError'),
      },
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm" className="rounded-9 text-red">
              {t('common.delete')}
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('skills.deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('skills.deleteConfirmDescription', { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('skills.deleteTask')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

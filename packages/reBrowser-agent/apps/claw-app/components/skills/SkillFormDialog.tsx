/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLocale } from '@browseros/i18n/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactElement, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  LocalizedDialogContent as DialogContent,
  LocalizedDialogFooter as DialogFooter,
} from '@/components/localized/LocalizedDialog'
import { LocalizedFormMessage as FormMessage } from '@/components/localized/LocalizedFormMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateSkill,
  useSkill,
  useSkills,
  useUpdateSkill,
} from '@/modules/api/skills.hooks'
import { neoName, parseSkillBody } from '@/screens/skills/skills.helpers'

type Translator = (key: string, options?: Record<string, unknown>) => string

function createSchema(t: Translator) {
  return z.object({
    name: z.string().regex(/^[a-z0-9-]+$/, t('skillForm.invalidName')),
    description: z.string().min(1, t('skillForm.descriptionRequired')),
    site: z.string().optional(),
    steps: z.string().optional(),
    learnedNotes: z.string().optional(),
  })
}

function editSchema(t: Translator) {
  return z.object({
    description: z.string().min(1, t('skillForm.descriptionRequired')),
    site: z.string().optional(),
    steps: z.string().optional(),
    learnedNotes: z.string().optional(),
  })
}

type CreateFormValues = z.infer<ReturnType<typeof createSchema>>
type EditFormValues = z.infer<ReturnType<typeof editSchema>>

function toLines(value: string | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

interface CreateProps {
  mode: 'create'
  trigger: ReactElement
}

interface EditProps {
  mode: 'edit'
  name: string
  description: string
  site?: string
  body: string
  trigger: ReactElement
}

type SkillFormDialogProps = CreateProps | EditProps

export function SkillFormDialog(props: SkillFormDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={props.trigger} />
      <DialogContent className="max-w-lg">
        {props.mode === 'create' ? (
          <CreateForm onClose={() => setOpen(false)} />
        ) : (
          <EditForm {...props} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const create = useCreateSkill()
  const schema = createSchema((key) => key)
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      site: '',
      steps: '',
      learnedNotes: '',
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    const name = neoName(values.name)
    void toast.promise(
      create
        .mutateAsync({
          name,
          description: values.description,
          site: trimmedOrUndefined(values.site),
          steps: toLines(values.steps),
          learnedNotes: toLines(values.learnedNotes),
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: useSkills.getKey() })
          onClose()
        }),
      {
        loading: t('skillForm.savingTask'),
        success: t('skillForm.saved', { name }),
        error: t('skillForm.saveFailed'),
      },
    )
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('skillForm.newTitle')}</DialogTitle>
          <DialogDescription>{t('skillForm.newDescription')}</DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.name')}</FormLabel>
              <FormControl>
                <div className="flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="flex h-full select-none items-center bg-card-tint px-2.5 font-mono text-ink-2 text-sm">
                    neo-
                  </span>
                  <Input
                    aria-label={t('skillForm.name')}
                    placeholder={t('skillForm.namePlaceholder')}
                    className="h-full flex-1 rounded-none border-0 font-mono shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormDescription>
                {t('skillForm.nameHint', {
                  name: field.value ? neoName(field.value) : 'neo-<name>',
                })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.description')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('skillForm.descriptionPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="site"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.siteOptional')}</FormLabel>
              <FormControl>
                <Input placeholder="mail.google.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="steps"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.steps')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder={t('skillForm.oneStepPerLine')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="learnedNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.learnedNotesOptional')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder={t('skillForm.oneNotePerLine')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" type="button">
                {t('common.cancel')}
              </Button>
            }
          />
          <Button type="submit" disabled={create.isPending}>
            {t('skillForm.saveTask')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

function EditForm({
  name,
  description,
  site,
  body,
  onClose,
}: EditProps & { onClose: () => void }) {
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const update = useUpdateSkill()
  const parsed = parseSkillBody(body)
  const schema = editSchema((key) => key)
  const form = useForm<EditFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description,
      site: site ?? '',
      steps: parsed.steps.join('\n'),
      learnedNotes: parsed.learnedNotes.join('\n'),
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    void toast.promise(
      update
        .mutateAsync({
          name,
          body: {
            description: values.description,
            // An empty string clears the site; the field is always sent.
            site: values.site?.trim() ?? '',
            steps: toLines(values.steps),
            learnedNotes: toLines(values.learnedNotes),
          },
        })
        .then(() => {
          void queryClient.invalidateQueries({
            queryKey: useSkill.getKey({ name }),
          })
          void queryClient.invalidateQueries({ queryKey: useSkills.getKey() })
          onClose()
        }),
      {
        loading: t('skillForm.saving'),
        success: t('skillForm.saved', { name }),
        error: t('skillForm.saveFailed'),
      },
    )
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('skillForm.editTitle', { name })}</DialogTitle>
          <DialogDescription>
            {t('skillForm.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.description')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="site"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.site')}</FormLabel>
              <FormControl>
                <Input placeholder={t('skillForm.clearSite')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="steps"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.steps')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder={t('skillForm.oneStepPerLine')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="learnedNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('skillForm.learnedNotes')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder={t('skillForm.oneNotePerLine')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" type="button">
                {t('common.cancel')}
              </Button>
            }
          />
          <Button type="submit" disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

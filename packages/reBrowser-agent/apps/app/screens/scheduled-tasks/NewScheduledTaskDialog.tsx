import { useLocale } from '@browseros/i18n/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Loader2, Sparkles, Undo2 } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v3'
import { ChatProviderSelector } from '@/components/chat/ChatProviderSelector'
import type { Provider } from '@/components/chat/chatComponentTypes'
import { LocalizedDialogContent as DialogContent } from '@/components/i18n/LocalizedDialogContent'
import { LocalizedFormMessage as FormMessage } from '@/components/i18n/LocalizedFormMessage'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SCHEDULED_TASK_PROMPT_REFINED_EVENT } from '@/lib/constants/analyticsEvents'
import { resolveChatProvider } from '@/lib/llm-providers/provider-runtime'
import { ProviderIcon } from '@/lib/llm-providers/providerIcons'
import type { ProviderType } from '@/lib/llm-providers/types'
import { track } from '@/lib/metrics/track'
import { refinePrompt } from '@/lib/schedules/refine-prompt'
import { useAcpAgents } from '@/modules/agents/agents.hooks'
import { toProviderOption } from '@/modules/chat/chat-session-request'
import { buildSidepanelChatTargets } from '@/modules/chat/sidepanel-chat-targets'
import { useLlmProviders } from '@/modules/llm-providers/llm-providers.hooks'
import type { ScheduledJob } from './types'

type Translate = (key: string, options?: Record<string, unknown>) => string

type FormValues = {
  name: string
  query: string
  scheduleType: 'daily' | 'hourly' | 'minutes'
  scheduleTime?: string
  scheduleInterval?: number
  providerId?: string
  enabled: boolean
}

function createFormSchema(t: Translate) {
  return z
    .object({
      name: z
        .string()
        .min(1, t('tasks.nameRequired'))
        .max(100, t('tasks.nameTooLong')),
      query: z.string().min(1, t('tasks.promptRequired')),
      scheduleType: z.enum(['daily', 'hourly', 'minutes']),
      scheduleTime: z.string().optional(),
      scheduleInterval: z
        .number({ invalid_type_error: 'tasks.intervalInvalid' })
        .int('tasks.intervalInvalid')
        .min(1, 'tasks.intervalInvalid')
        .max(60, 'tasks.intervalInvalid')
        .optional(),
      providerId: z.string().optional(),
      enabled: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (data.scheduleType === 'daily' && !data.scheduleTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('tasks.timeRequired'),
          path: ['scheduleTime'],
        })
      }
      if (
        (data.scheduleType === 'hourly' || data.scheduleType === 'minutes') &&
        (!data.scheduleInterval || data.scheduleInterval < 1)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('tasks.intervalRequired'),
          path: ['scheduleInterval'],
        })
      }
    })
}

export interface NewScheduledTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues?: ScheduledJob | null
  onSave: (data: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt'>) => void
}

export const NewScheduledTaskDialog: FC<NewScheduledTaskDialogProps> = ({
  open,
  onOpenChange,
  initialValues,
  onSave,
}) => {
  const { t } = useLocale()
  const isEditing = !!initialValues
  const { providers, defaultProviderId } = useLlmProviders()
  const { agents } = useAcpAgents()
  // A scheduled job can target a coding agent as readily as an llm provider
  // now that both are rows of one table, so the picker offers both. While they
  // were separate tables the job's provider reference could only ever name an
  // llm one, which is why this dialog listed those alone.
  const chatTargets = buildSidepanelChatTargets({ providers, agents })

  const form = useForm<FormValues>({
    resolver: zodResolver(createFormSchema((key) => key)),
    defaultValues: {
      name: '',
      query: '',
      scheduleType: 'daily',
      scheduleTime: '09:00',
      scheduleInterval: 1,
      providerId: undefined,
      enabled: true,
    },
  })

  const scheduleType = form.watch('scheduleType')
  const selectedProviderId = form.watch('providerId')
  const queryValue = form.watch('query')
  const [isRefining, setIsRefining] = useState(false)
  const originalPromptRef = useRef<string | null>(null)
  const refineRequestIdRef = useRef(0)
  const isProgrammaticChange = useRef(false)

  useEffect(() => {
    if (open) {
      refineRequestIdRef.current++
      originalPromptRef.current = null
      setIsRefining(false)
      if (initialValues) {
        form.reset({
          name: initialValues.name,
          query: initialValues.query,
          scheduleType: initialValues.scheduleType,
          scheduleTime: initialValues.scheduleTime || '09:00',
          scheduleInterval: initialValues.scheduleInterval || 1,
          providerId: initialValues.providerId,
          enabled: initialValues.enabled,
        })
      } else {
        form.reset({
          name: '',
          query: '',
          scheduleType: 'daily',
          scheduleTime: '09:00',
          scheduleInterval: 1,
          providerId: undefined,
          enabled: true,
        })
      }
    }
  }, [open, initialValues, form])

  const resolvedProvider: Provider | null = (() => {
    const chosen = chatTargets.find(
      (target) => target.id === selectedProviderId,
    )
    if (chosen) return toProviderOption(chosen)

    const found = resolveChatProvider(providers, defaultProviderId)
    if (found) {
      return {
        kind: 'llm' as const,
        id: found.id,
        name: found.name,
        type: found.type,
      }
    }
    const fallback = resolveChatProvider(providers)
    if (fallback)
      return {
        kind: 'llm' as const,
        id: fallback.id,
        name: fallback.name,
        type: fallback.type,
      }
    return null
  })()

  const providerOptions: Provider[] = chatTargets.map(toProviderOption)

  // Replace textarea content via execCommand so the browser's native undo
  // stack (Cmd+Z / Ctrl+Z) records the change. Falls back to form.setValue
  // if the textarea element can't be found.
  const setQueryWithUndo = (value: string) => {
    const textarea = document.querySelector(
      'textarea[name="query"]',
    ) as HTMLTextAreaElement
    if (textarea) {
      isProgrammaticChange.current = true
      textarea.focus()
      textarea.select()
      document.execCommand('insertText', false, value)
      isProgrammaticChange.current = false
    } else {
      form.setValue('query', value)
    }
  }

  const handleRefinePrompt = async () => {
    const currentQuery = form.getValues('query').trim()
    const currentName = form.getValues('name').trim()
    if (!currentQuery) return

    const requestId = ++refineRequestIdRef.current
    setIsRefining(true)
    originalPromptRef.current = currentQuery

    try {
      const refined = await refinePrompt({
        prompt: currentQuery,
        name: currentName || t('tasks.untitled'),
        providerId: form.getValues('providerId'),
      })
      if (requestId !== refineRequestIdRef.current) return
      setQueryWithUndo(refined)
      track(SCHEDULED_TASK_PROMPT_REFINED_EVENT)
    } catch {
      if (requestId !== refineRequestIdRef.current) return
      toast.error(t('tasks.rewriteFailed'))
      originalPromptRef.current = null
    } finally {
      if (requestId === refineRequestIdRef.current) {
        setIsRefining(false)
      }
    }
  }

  const handleUndoRefine = () => {
    if (originalPromptRef.current !== null) {
      setQueryWithUndo(originalPromptRef.current)
      originalPromptRef.current = null
    }
  }

  const onSubmit = (values: FormValues) => {
    // Either kind, so an id that names an agent is stored as readily as one
    // that names a provider.
    const provider = chatTargets.find(
      (target) => target.id === values.providerId,
    )
    onSave({
      name: values.name.trim(),
      query: values.query.trim(),
      scheduleType: values.scheduleType,
      scheduleTime:
        values.scheduleType === 'daily' ? values.scheduleTime : undefined,
      scheduleInterval:
        values.scheduleType !== 'daily' ? values.scheduleInterval : undefined,
      providerId: provider?.id,
      enabled: values.enabled,
    })
    form.reset()
    originalPromptRef.current = null
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('tasks.editTitle') : t('tasks.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('tasks.editDescription')
              : t('tasks.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('tasks.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('tasks.namePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t('tasks.prompt')}</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto gap-1 px-2 py-1 text-muted-foreground text-xs"
                      disabled={!queryValue?.trim() || isRefining}
                      onClick={handleRefinePrompt}
                    >
                      {isRefining ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {isRefining
                        ? t('tasks.rewriting')
                        : t('tasks.rewriteWithAi')}
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder={t('tasks.promptPlaceholder')}
                      className="min-h-[100px] resize-none"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e)
                        if (
                          !isProgrammaticChange.current &&
                          originalPromptRef.current !== null
                        ) {
                          originalPromptRef.current = null
                        }
                      }}
                    />
                  </FormControl>
                  {!isRefining && originalPromptRef.current !== null ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                      onClick={handleUndoRefine}
                    >
                      <Undo2 className="h-3 w-3" />
                      {t('tasks.undoRewrite')}
                    </button>
                  ) : (
                    <FormDescription>
                      {t('tasks.promptDescription')}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {providers.length > 0 && resolvedProvider && (
              <FormItem>
                <FormLabel>{t('tasks.provider')}</FormLabel>
                <ChatProviderSelector
                  providers={providerOptions}
                  selectedProvider={resolvedProvider}
                  onSelectProvider={(provider) =>
                    form.setValue('providerId', provider.id)
                  }
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        <ProviderIcon
                          type={resolvedProvider.type as ProviderType}
                          size={16}
                        />
                      </span>
                      {resolvedProvider.name}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </ChatProviderSelector>
                <FormDescription>
                  {t('tasks.providerDescription')}
                </FormDescription>
              </FormItem>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="scheduleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tasks.schedule')}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('tasks.selectSchedule')}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">
                          {t('tasks.dailyAtTime')}
                        </SelectItem>
                        <SelectItem value="hourly">
                          {t('tasks.everyHours')}
                        </SelectItem>
                        <SelectItem value="minutes">
                          {t('tasks.everyMinutes')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {scheduleType === 'daily' ? (
                <FormField
                  control={form.control}
                  name="scheduleTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.time')}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="scheduleInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('tasks.interval', {
                          unit:
                            scheduleType === 'hourly'
                              ? t('tasks.hours')
                              : t('tasks.minutes'),
                        })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={scheduleType === 'hourly' ? 24 : 60}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    {t('tasks.enable')}
                  </FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit">
                {isEditing ? t('tasks.update') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

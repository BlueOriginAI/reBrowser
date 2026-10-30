import { useLocale } from '@browseros/i18n/react'
import { ChevronDown, Info, Loader2, RefreshCw } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ProviderError } from '@/lib/i18n/provider-feedback'
import { useProbeCustomAgent } from '@/modules/agents/acp-agent-probe.hooks'
import type { AcpAgent } from '@/modules/agents/acp-agent-types'
import {
  useCreateAcpAgent,
  useUpdateAcpAgent,
} from '@/modules/agents/agents.hooks'
import {
  buildCustomConfig,
  formatEnvLines,
  parseEnvLines,
} from './custom-agent-form.helpers'
import { PopularAcpAgentsDialog } from './PopularAcpAgentsDialog'
import { ProviderDialogContent } from './ProviderLocalizedUi'

const AGENT_DEFAULT = '__agent_default__'

export interface CustomCodingAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this agent instead of creating a new one. */
  agent?: AcpAgent | null
  /** Fires with the new agent's id after a custom agent is created (not on edit). */
  onSaved?: (agentId: string) => void
}

export const CustomCodingAgentDialog: FC<CustomCodingAgentDialogProps> = ({
  open,
  onOpenChange,
  agent,
  onSaved,
}) => {
  const { t } = useLocale()
  const createAgent = useCreateAcpAgent()
  const updateAgent = useUpdateAcpAgent()
  const probe = useProbeCustomAgent()
  const isEdit = Boolean(agent)

  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [envText, setEnvText] = useState('')
  const [fullAccessModesText, setFullAccessModesText] = useState('')
  const [reasoningEffortKey, setReasoningEffortKey] = useState('')
  const [systemPromptAppend, setSystemPromptAppend] = useState('')
  // Brand id (e.g. 'opencode') carried from the Popular-agents picker so the
  // saved agent shows that agent's logo. Stored in customConfig.icon.
  const [logoKey, setLogoKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [popularOpen, setPopularOpen] = useState(false)

  // Seed the form when the dialog opens. Matches the sibling coding-agent
  // dialog; the shadcn Dialog stays mounted, so state is reset here on open.
  useEffect(() => {
    if (!open) return
    const config = agent?.customConfig
    setName(agent?.name ?? '')
    setCommand(config?.command ?? '')
    setWorkingDirectory(agent?.workingDirectory ?? '')
    setEnvText(formatEnvLines(config?.env))
    setFullAccessModesText((config?.fullAccessModes ?? []).join(', '))
    setReasoningEffortKey(config?.reasoningEffortKey ?? '')
    setSystemPromptAppend(config?.systemPromptAppend ?? '')
    setLogoKey(config?.icon ?? '')
    setModelId(agent?.modelId ?? '')
    setReasoningEffort(agent?.reasoningEffort ?? '')
    setPopularOpen(false)
    createAgent.reset()
    updateAgent.reset()
    probe.reset()
  }, [open, agent, createAgent.reset, updateAgent.reset, probe.reset])

  const probeResult = probe.data
  const models = probeResult?.models ?? []
  const reasoningValues = probeResult?.reasoning?.values ?? []
  const probeError = probe.error?.message ?? probeResult?.error?.message
  const pending = createAgent.isPending || updateAgent.isPending
  const submitError = createAgent.error?.message ?? updateAgent.error?.message

  const handleTest = async () => {
    if (!command.trim()) return
    try {
      await probe.mutateAsync({
        command: command.trim(),
        env: parseEnvLines(envText),
        cwd: workingDirectory.trim() || undefined,
      })
    } catch {
      // Surfaced via probe.error below.
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !command.trim()) return
    const customConfig = buildCustomConfig({
      command,
      envText,
      fullAccessModesText,
      reasoningEffortKey,
      systemPromptAppend,
      icon: logoKey,
    })
    let createdId: string | undefined
    if (isEdit && agent) {
      await updateAgent.mutateAsync({
        agentId: agent.id,
        patch: {
          name: name.trim(),
          modelId: modelId || null,
          reasoningEffort: reasoningEffort || null,
          workingDirectory: workingDirectory.trim() || null,
          customConfig,
        },
      })
    } else {
      const created = await createAgent.mutateAsync({
        name: name.trim(),
        type: 'custom',
        modelId: modelId || undefined,
        reasoningEffort: reasoningEffort || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        customConfig,
      })
      createdId = created.id
    }
    onOpenChange(false)
    if (createdId) onSaved?.(createdId)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ProviderDialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t('Edit custom agent') : t('Add a custom ACP agent')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Connect any agent that speaks ACP over stdio. It can run commands and access files anywhere on your computer without approval.',
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="custom-agent-name">{t('Name')}</Label>
              <Input
                id="custom-agent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('My Agent')}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="custom-agent-command">{t('Command')}</Label>
                <button
                  type="button"
                  onClick={() => setPopularOpen(true)}
                  className="inline-flex items-center gap-1 font-medium text-[var(--accent-orange)] text-xs"
                >
                  <Info className="h-3.5 w-3.5" />
                  {t('Popular agents')}
                </button>
              </div>
              <Input
                id="custom-agent-command"
                className="font-mono text-sm"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npx -y @scope/my-agent-acp --stdio"
              />
              <p className="text-muted-foreground text-xs">
                {t(
                  'The full launch command, args included. The agent must speak ACP over stdio.',
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-agent-cwd">{t('Working directory')}</Label>
              <Input
                id="custom-agent-cwd"
                className="font-mono text-sm"
                value={workingDirectory}
                onChange={(event) => setWorkingDirectory(event.target.value)}
                placeholder={t('Defaults to your home directory')}
              />
            </div>

            <Button
              variant="outline"
              onClick={() => void handleTest()}
              disabled={!command.trim() || probe.isPending}
              className="border-[var(--accent-orange)] text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/10 hover:text-[var(--accent-orange)]"
            >
              {probe.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('Test connection')}
            </Button>

            {probeResult && !probeResult.error ? (
              <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="font-medium text-emerald-600 text-sm dark:text-emerald-400">
                  {t('Connected')}
                  {probeResult.agentInfo?.name
                    ? ` · ${probeResult.agentInfo.name}`
                    : ''}
                  {probeResult.agentInfo?.version
                    ? ` v${probeResult.agentInfo.version}`
                    : ''}
                </p>
                <div className="space-y-2">
                  <Label>{t('Model')}</Label>
                  <Select
                    value={modelId || AGENT_DEFAULT}
                    onValueChange={(value) =>
                      setModelId(value === AGENT_DEFAULT ? '' : value)
                    }
                  >
                    <SelectTrigger aria-label={t('Model')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AGENT_DEFAULT}>
                        {t('Agent default')}
                      </SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name ?? model.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {reasoningValues.length > 0 ? (
                  <div className="space-y-2">
                    <Label>{t('Reasoning effort')}</Label>
                    <Select
                      value={reasoningEffort || AGENT_DEFAULT}
                      onValueChange={(value) =>
                        setReasoningEffort(value === AGENT_DEFAULT ? '' : value)
                      }
                    >
                      <SelectTrigger aria-label={t('Reasoning effort')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AGENT_DEFAULT}>
                          {t('Agent default')}
                        </SelectItem>
                        {reasoningValues.map((effort) => (
                          <SelectItem key={t(effort)} value={t(effort)}>
                            {t(effort)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}

            {probeError ? (
              <ProviderError
                message={probeError}
                summary="Agent inspection failed"
              />
            ) : null}

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 font-medium text-muted-foreground text-sm">
                <ChevronDown className="h-4 w-4" />
                {t('Advanced')}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-env">
                    {t('Environment variables')}
                  </Label>
                  <Textarea
                    id="custom-agent-env"
                    className="font-mono text-xs"
                    rows={3}
                    value={envText}
                    onChange={(event) => setEnvText(event.target.value)}
                    placeholder={'KEY=value\nANOTHER=value'}
                  />
                  <p className="text-destructive text-xs">
                    {t(
                      'Stored locally in plaintext. Prefer your agent’s own login for secrets.',
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-modes">
                    {t('Full-access mode ids')}
                  </Label>
                  <Input
                    id="custom-agent-modes"
                    className="font-mono text-sm"
                    value={fullAccessModesText}
                    onChange={(event) =>
                      setFullAccessModesText(event.target.value)
                    }
                    placeholder="bypassPermissions"
                  />
                  <p className="text-muted-foreground text-xs">
                    {t(
                      'Comma-separated. Leave empty to use the agent’s default permission mode.',
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-reasoning-key">
                    {t('Reasoning effort key')}
                  </Label>
                  <Input
                    id="custom-agent-reasoning-key"
                    className="font-mono text-sm"
                    value={reasoningEffortKey}
                    onChange={(event) =>
                      setReasoningEffortKey(event.target.value)
                    }
                    placeholder="effort"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-prompt">
                    {t('System prompt (append)')}
                  </Label>
                  <Textarea
                    id="custom-agent-prompt"
                    rows={2}
                    value={systemPromptAppend}
                    onChange={(event) =>
                      setSystemPromptAppend(event.target.value)
                    }
                    placeholder={t('Optional extra instructions')}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {submitError ? (
              <ProviderError
                message={submitError}
                summary="Could not save agent"
              />
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!name.trim() || !command.trim() || pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? t('Save agent') : t('Create agent')}
            </Button>
          </DialogFooter>
        </ProviderDialogContent>
      </Dialog>

      <PopularAcpAgentsDialog
        open={popularOpen}
        onOpenChange={setPopularOpen}
        onSelect={(selectedCommand, agentId) => {
          setCommand(selectedCommand)
          setLogoKey(agentId)
          setPopularOpen(false)
        }}
      />
    </>
  )
}

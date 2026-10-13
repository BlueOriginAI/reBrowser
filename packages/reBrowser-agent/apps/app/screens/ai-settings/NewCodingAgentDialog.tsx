import { useLocale } from '@browseros/i18n/react'
import { Loader2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { adapterLabel } from '@/components/agents/AdapterIcon'
import { Button } from '@/components/ui/button'
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
import { ProviderError } from '@/lib/i18n/provider-feedback'
import { useAcpAgentProbe } from '@/modules/agents/acp-agent-probe.hooks'
import type { AcpAgentType } from '@/modules/agents/acp-agent-types'
import { useCreateAcpAgent } from '@/modules/agents/agents.hooks'
import { ProviderDialogContent } from './ProviderLocalizedUi'

const AGENT_DEFAULT = '__agent_default__'

export interface NewCodingAgentDialogProps {
  type: AcpAgentType | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fires with the new agent's id after it is successfully created. */
  onSaved?: (agentId: string) => void
}

export const NewCodingAgentDialog: FC<NewCodingAgentDialogProps> = ({
  type,
  open,
  onOpenChange,
  onSaved,
}) => {
  const { t } = useLocale()
  const createAgent = useCreateAcpAgent()
  const probe = useAcpAgentProbe(type ?? undefined, open)
  const [name, setName] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')

  useEffect(() => {
    if (!open || !type) return
    setName(adapterLabel(type))
    setModelId('')
    setReasoningEffort('')
    createAgent.reset()
  }, [open, type, createAgent.reset])

  const probeError =
    probe.error?.message ?? probe.data?.error?.message ?? undefined

  const handleCreate = async () => {
    if (!type || !name.trim()) return
    const created = await createAgent.mutateAsync({
      name: name.trim(),
      type,
      modelId: modelId || undefined,
      reasoningEffort: reasoningEffort || undefined,
    })
    onOpenChange(false)
    onSaved?.(created.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ProviderDialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('Set up {name}', {
              name: type ? adapterLabel(type) : t('agent'),
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'reBrowser uses your existing CLI login. This agent can run commands and access files anywhere on your computer without approval.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="coding-agent-name">{t('Name')}</Label>
            <Input
              id="coding-agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

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
                {(probe.data?.models ?? []).map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name ?? model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(probe.data?.reasoning?.values.length ?? 0) > 0 ? (
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
                  {(probe.data?.reasoning?.values ?? []).map((effort) => (
                    <SelectItem key={t(effort)} value={t(effort)}>
                      {t(effort)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {probe.isLoading ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('Inspecting installed agent…')}
            </p>
          ) : null}
          {probeError ? (
            <ProviderError
              message={probeError}
              summary="Agent inspection failed"
            />
          ) : null}
          {createAgent.error ? (
            <ProviderError
              message={createAgent.error.message}
              summary="Could not save agent"
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!type || !name.trim() || createAgent.isPending}
          >
            {createAgent.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t('Create agent')}
          </Button>
        </DialogFooter>
      </ProviderDialogContent>
    </Dialog>
  )
}

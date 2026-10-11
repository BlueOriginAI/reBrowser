import { useLocale } from '@browseros/i18n/react'
import { Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { BrowserClawPromoBanner } from '@/components/promo/BrowserClawPromoBanner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ProviderError,
  ProviderMessage,
  ProviderTestFeedback,
} from '@/lib/i18n/provider-feedback'
import { testProvider } from '@/lib/llm-providers/testProvider'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { track } from '@/lib/metrics/track'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'
import { useLlmProviders } from '@/modules/llm-providers/llm-providers.hooks'
import { AddProviderSection } from './AddProviderSection'
import { AddProviderDialogs, useAddProvider } from './add-provider.hooks'
import { ConfiguredTargetsList } from './ConfiguredTargetsList'
import { useCodingAgents } from './coding-agents.hooks'
import { useDefaultChatTarget } from './default-chat-target.hooks'
import { NewProviderDialog } from './NewProviderDialog'

/**
 * BrowserOS AI pane — manage LLM providers and the default model.
 */
export const BrowserOsAiPane: FC = () => {
  const { t } = useLocale()
  const {
    providers,
    storedDefaultTargetId,
    saveProvider,
    setDefaultProvider,
    deleteProvider,
    isUnavailable: providersUnavailable,
  } = useLlmProviders()
  const { baseUrl: agentServerUrl } = useAgentServerUrl()
  const coding = useCodingAgents()
  const defaultTarget = useDefaultChatTarget({
    providers,
    agents: coding.agents,
    defaultTargetId: storedDefaultTargetId,
    setDefaultProvider,
  })
  const { effectiveTarget } = defaultTarget
  const selectedProviderId =
    effectiveTarget?.kind === 'llm' ? effectiveTarget.id : null
  const selectedAgentId =
    effectiveTarget?.kind === 'acp' ? effectiveTarget.id : null

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] =
    useState<LlmProviderConfig | null>(null)
  const [providerToDelete, setProviderToDelete] =
    useState<LlmProviderConfig | null>(null)
  const [testingProviderId, setTestingProviderId] = useState<string | null>(
    null,
  )

  const addProvider = useAddProvider({ providers, saveProvider })
  const { oauthFlows } = addProvider

  const handleEditProvider = (provider: LlmProviderConfig) => {
    setEditingProvider(provider)
    setIsEditDialogOpen(true)
  }

  const handleDeleteProvider = (provider: LlmProviderConfig) => {
    setProviderToDelete(provider)
  }

  const confirmDeleteProvider = async () => {
    if (!providerToDelete) return

    try {
      // Clear OAuth tokens on server for OAuth-based providers.
      const oauthFlow = oauthFlows[providerToDelete.type]
      if (oauthFlow) {
        await oauthFlow.disconnect()
        track(oauthFlow.disconnectedEvent)
      }
      await deleteProvider(providerToDelete.id)
      setProviderToDelete(null)
    } catch (error) {
      toast.error(<ProviderMessage message="Failed to delete provider" />, {
        description: (
          <ProviderError
            message={error instanceof Error ? error.message : 'Unknown error'}
          />
        ),
      })
    }
  }

  const handleSaveProvider = async (provider: LlmProviderConfig) => {
    await saveProvider(provider)
  }

  const handleTestProvider = async (provider: LlmProviderConfig) => {
    if (!agentServerUrl) {
      toast.error(<ProviderMessage message="ai.testFailed" />, {
        description: (
          <div className="text-red-600 text-sm dark:text-red-400">
            <ProviderMessage message="ai.serverUrlUnavailable" />
          </div>
        ),
        duration: 3000,
      })
      return
    }

    setTestingProviderId(provider.id)

    try {
      const result = await testProvider(provider, agentServerUrl)

      if (result.success) {
        toast.success(<ProviderMessage message="ai.testSuccessful" />, {
          description: (
            <div className="text-green-600 text-sm dark:text-green-400">
              <ProviderTestFeedback result={result} />
            </div>
          ),
          duration: 3000,
        })
      } else {
        toast.error(<ProviderMessage message="ai.testFailed" />, {
          description: (
            <div className="text-red-600 text-sm dark:text-red-400">
              <ProviderTestFeedback result={result} />
            </div>
          ),
          duration: 3000,
        })
      }
    } catch (error) {
      toast.error(<ProviderMessage message="ai.testFailed" />, {
        description: (
          <div className="text-red-600 text-sm dark:text-red-400">
            <ProviderError
              message={error instanceof Error ? error.message : 'Unknown error'}
              summary="Connection test failed"
            />
          </div>
        ),
        duration: 3000,
      })
    }

    setTestingProviderId(null)
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <div>
        <h2 className="font-semibold text-xl">{t('ai.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('ai.description')}</p>
      </div>

      <BrowserClawPromoBanner />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-base">
            {t('ai.yourProviders')}{' '}
            <span className="font-normal text-muted-foreground">
              ({providers.length + coding.agents.length})
            </span>
          </h3>
          <Button onClick={() => addProvider.openProviderForm()}>
            <Plus className="size-4" />
            {t('common.add')}
          </Button>
        </div>

        {providersUnavailable ? (
          <Alert variant="destructive">
            <AlertDescription>{t('ai.providersUnavailable')}</AlertDescription>
          </Alert>
        ) : null}

        <ConfiguredTargetsList
          providers={providers}
          coding={coding}
          selectedProviderId={selectedProviderId}
          selectedAgentId={selectedAgentId}
          testingProviderId={testingProviderId}
          onSelectProvider={defaultTarget.selectProvider}
          onSelectAgent={defaultTarget.selectAgent}
          onTestProvider={handleTestProvider}
          onEditProvider={handleEditProvider}
          onDeleteProvider={handleDeleteProvider}
          onEditAgent={addProvider.openCustomAgentEditor}
        />
      </section>

      <AddProviderSection
        onCreateAgent={addProvider.onCreateAgent}
        onCreateCustomAgent={addProvider.onCreateCustomAgent}
        onUseTemplate={addProvider.onUseTemplate}
      />

      <AddProviderDialogs controller={addProvider} />

      <NewProviderDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        initialValues={editingProvider ?? undefined}
        onSave={handleSaveProvider}
      />

      <AlertDialog
        open={!!providerToDelete}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai.deleteProvider')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai.deleteProviderDescription', {
                name: providerToDelete?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProvider}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

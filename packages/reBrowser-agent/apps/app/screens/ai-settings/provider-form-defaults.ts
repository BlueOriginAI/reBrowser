import { getDefaultBaseUrlForProviders } from '../../lib/llm-providers/providerTemplates'
import type {
  LlmProviderConfig,
  ProviderType,
} from '../../lib/llm-providers/types'
import type { ProviderFormValues } from './provider-form-schema'

/** Window assumed for any model the bundled catalog cannot size. */
export const DEFAULT_CONTEXT_WINDOW = 128000

export function defaultReasoningEffort(type?: ProviderType) {
  return type === 'chatgpt-pro' ? 'medium' : 'high'
}

export function getProviderFormDefaults(
  initialValues: Partial<LlmProviderConfig> = {},
  baseUrlType: ProviderType = 'openai',
): ProviderFormValues {
  return {
    type: initialValues.type || 'openai',
    name: initialValues.name || '',
    baseUrl:
      initialValues.baseUrl || getDefaultBaseUrlForProviders(baseUrlType),
    modelId: initialValues.modelId || '',
    apiKey: initialValues.apiKey || '',
    headers: Object.entries(initialValues.headers ?? {}).map(
      ([name, value]) => ({
        name,
        value,
      }),
    ),
    supportsImages: initialValues.supportsImages ?? false,
    contextWindow: initialValues.contextWindow || DEFAULT_CONTEXT_WINDOW,
    temperature: initialValues.temperature ?? 0.2,
    resourceName: initialValues.resourceName || '',
    accessKeyId: initialValues.accessKeyId || '',
    secretAccessKey: initialValues.secretAccessKey || '',
    region: initialValues.region || '',
    sessionToken: initialValues.sessionToken || '',
    hasApiKey: initialValues.hasApiKey ?? false,
    hasAccessKeyId: initialValues.hasAccessKeyId ?? false,
    hasSecretAccessKey: initialValues.hasSecretAccessKey ?? false,
    originalType: initialValues.type,
    reasoningEffort:
      initialValues.reasoningEffort ||
      defaultReasoningEffort(initialValues.type),
    reasoningSummary: initialValues.reasoningSummary || 'auto',
  }
}

import { describe, expect, it } from 'bun:test'
import { getDefaultBaseUrlForProviders } from '../../lib/llm-providers/providerTemplates'
import {
  DEFAULT_CONTEXT_WINDOW,
  defaultReasoningEffort,
  getProviderFormDefaults,
} from './provider-form-defaults'

describe('provider form defaults', () => {
  it('initializes a new provider with the existing defaults', () => {
    expect(getProviderFormDefaults()).toMatchObject({
      type: 'openai',
      name: '',
      baseUrl: getDefaultBaseUrlForProviders('openai'),
      modelId: '',
      apiKey: '',
      headers: [],
      supportsImages: false,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      temperature: 0.2,
      originalType: undefined,
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
    })
  })

  it('preserves zero temperature and the existing zero-context fallback', () => {
    const defaults = getProviderFormDefaults({
      temperature: 0,
      contextWindow: 0,
      supportsImages: false,
    })
    expect(defaults.temperature).toBe(0)
    expect(defaults.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(defaults.supportsImages).toBe(false)
  })

  it('retains stored credential flags without inventing credentials', () => {
    expect(
      getProviderFormDefaults({
        type: 'bedrock',
        hasAccessKeyId: true,
        hasSecretAccessKey: true,
        region: 'us-east-1',
      }),
    ).toMatchObject({
      type: 'bedrock',
      originalType: 'bedrock',
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      hasAccessKeyId: true,
      hasSecretAccessKey: true,
      region: 'us-east-1',
    })
  })

  it('preserves custom values and converts header entries to form rows', () => {
    expect(
      getProviderFormDefaults({
        name: 'Custom provider',
        baseUrl: 'https://provider.example/v1',
        headers: { 'x-provider': 'custom' },
        contextWindow: 8192,
        temperature: 1,
        reasoningEffort: 'low',
      }),
    ).toMatchObject({
      name: 'Custom provider',
      baseUrl: 'https://provider.example/v1',
      headers: [{ name: 'x-provider', value: 'custom' }],
      contextWindow: 8192,
      temperature: 1,
      reasoningEffort: 'low',
    })
  })

  it('preserves initialization and edit-reset base URL fallback behavior', () => {
    const initialValues = { type: 'azure' as const }
    expect(getProviderFormDefaults(initialValues).baseUrl).toBe(
      getDefaultBaseUrlForProviders('openai'),
    )
    expect(getProviderFormDefaults(initialValues, 'azure').baseUrl).toBe(
      getDefaultBaseUrlForProviders('azure'),
    )
  })

  it('keeps the managed-provider default effort and an explicit override', () => {
    expect(defaultReasoningEffort('chatgpt-pro')).toBe('medium')
    expect(defaultReasoningEffort('openai')).toBe('high')
    expect(
      getProviderFormDefaults({ type: 'chatgpt-pro' }).reasoningEffort,
    ).toBe('medium')
    expect(
      getProviderFormDefaults({
        type: 'chatgpt-pro',
        reasoningEffort: 'high',
      }).reasoningEffort,
    ).toBe('high')
  })
})

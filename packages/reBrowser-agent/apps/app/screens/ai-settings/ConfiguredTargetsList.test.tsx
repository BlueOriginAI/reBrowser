import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { createElement, type FC, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { en } from '@/lib/i18n/en'
import {
  providerChinese,
  providerEnglish,
} from '@/lib/i18n/provider-supplemental'
import { zhCN } from '@/lib/i18n/zh-CN'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import type { AcpAgent } from '@/modules/agents/acp-agent-types'

mock.module('@/components/agents/AdapterIcon', () => ({
  AdapterIcon: () => createElement('span', { 'data-icon': 'adapter' }),
  adapterLabel: (type: string) => (type === 'codex' ? 'Codex' : 'Claude'),
}))
mock.module('@/components/agents/agent-brand-marks', () => ({
  BRAND_MARKS: {},
  agentBrandKey: () => undefined,
}))
mock.module('@/lib/llm-providers/providerIcons', () => ({
  ProviderIcon: () => createElement('span', { 'data-icon': 'provider' }),
}))

let ConfiguredTargetsList: FC<
  import('./ConfiguredTargetsList').ConfiguredTargetsListProps
>

beforeAll(async () => {
  ConfiguredTargetsList = (await import('./ConfiguredTargetsList'))
    .ConfiguredTargetsList
})

const anthropic = {
  id: 'anthropic-1',
  name: 'Anthropic',
  type: 'anthropic',
  modelId: 'claude-sonnet-4-6',
} as LlmProviderConfig

const custom = {
  id: 'p1',
  name: 'My OpenAI',
  type: 'openai',
  modelId: 'gpt-5.5',
  baseUrl: 'https://api.openai.com/v1',
} as LlmProviderConfig

const agent: AcpAgent = {
  id: 'a1',
  name: 'Review agent',
  type: 'codex',
  modelId: 'gpt-5.5',
  reasoningEffort: 'medium',
  createdAt: 1,
  updatedAt: 1,
}

const coding = {
  agents: [agent],
  pageError: null,
  dismissPageError: () => {},
  deletingAgentId: null,
  handleDelete: () => {},
} as unknown as import('./coding-agents.hooks').CodingAgentsController

function render(
  props: Partial<
    import('./ConfiguredTargetsList').ConfiguredTargetsListProps
  > = {},
) {
  return renderLocalized(
    createElement(ConfiguredTargetsList, {
      providers: [anthropic, custom],
      coding,
      selectedProviderId: 'anthropic-1',
      selectedAgentId: null,
      testingProviderId: null,
      onSelectProvider: () => {},
      onSelectAgent: () => {},
      onTestProvider: () => {},
      onEditProvider: () => {},
      onDeleteProvider: () => {},
      ...props,
    }),
  )
}

describe('ConfiguredTargetsList', () => {
  it('renders providers and agents in one list', () => {
    const html = render()
    expect(html).toContain('Anthropic')
    expect(html).toContain('My OpenAI')
    expect(html).toContain('Review agent')
  })

  it('keeps the brand icons for each kind of target', () => {
    const html = render()
    expect(html).toContain('data-icon="provider"')
    expect(html).toContain('data-icon="adapter"')
  })

  it('describes an agent by adapter, model and effort', () => {
    expect(render()).toContain('Codex · gpt-5.5 · medium')
  })

  it('describes a configured provider by model and base url', () => {
    expect(render()).toContain('gpt-5.5 · https://api.openai.com/v1')
  })

  // One radio group across providers and agents, so the browser enforces a
  // single default and arrow keys move between every target.
  it('puts every target in one radio group', () => {
    const html = render()
    const radios = html.match(/name="default-provider"/g) ?? []
    expect(radios).toHaveLength(3)
  })

  it('marks exactly one row as default', () => {
    const html = render()
    expect((html.match(/Default</g) ?? []).length).toBe(1)
    expect((html.match(/checked=""/g) ?? []).length).toBe(1)
  })

  it('moves the default marker when an agent is selected instead', () => {
    const html = render({ selectedProviderId: null, selectedAgentId: 'a1' })
    const defaultRow = html.slice(html.indexOf('Review agent'))
    expect(defaultRow).toContain('Default<')
  })

  it('offers an actions menu for every target', () => {
    const html = render()
    expect(html).toContain('aria-label="Actions for Anthropic"')
    expect(html).toContain('aria-label="Actions for My OpenAI"')
    expect(html).toContain('aria-label="Actions for Review agent"')
  })

  // Asserting utility classes rather than layout because the reserved width
  // only exists once CSS is applied, which static markup cannot show. The
  // guard is here because dropping these turns the row back into 220px of
  // reserved trailing slots with nothing left for the name on a narrow pane.
  it('does not reserve the trailing slots on a narrow pane', () => {
    const html = render()
    expect(html).toContain('hidden w-[72px] shrink-0 justify-start sm:flex')
    expect(html).toContain('flex shrink-0 justify-end sm:w-[116px]')
  })

  it('surfaces a list-level error when the agent controller reports one', () => {
    const html = render({
      coding: { ...coding, pageError: 'agent server unreachable' } as never,
    })
    expect(html).toContain('agent server unreachable')
  })
})

const runtime = createLocaleRuntime({
  en: { ...en, ...providerEnglish },
  'zh-CN': { ...zhCN, ...providerChinese },
})
await runtime.setPreference('en')
function renderLocalized(children: ReactNode) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { runtime, children }),
  )
}

it('translates configured descriptions without translating saved names or model IDs', async () => {
  await runtime.setPreference('zh-CN')
  const html = render({
    coding: { ...coding, agents: [{ ...agent, modelId: undefined }] },
  })
  expect(html).toContain('智能体默认模型')
  expect(html).toContain('My OpenAI')
  expect(html).toContain('Review agent')
  expect(html).toContain('gpt-5.5')
  expect(html).not.toContain('Agent default model')
  await runtime.setPreference('en')
})

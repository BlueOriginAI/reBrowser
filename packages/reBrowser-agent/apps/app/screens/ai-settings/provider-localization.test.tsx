import { describe, expect, it } from 'bun:test'
import {
  catalogIssues,
  createLocaleRuntime,
  type Locale,
} from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ProviderError,
  ProviderMessage,
  ProviderTestFeedback,
} from '@/lib/i18n/provider-feedback'
import {
  providerChinese,
  providerEnglish,
} from '@/lib/i18n/provider-supplemental'
import { getIncompleteCatalogHint } from './model-picker.helpers'
import { getProviderFormDefaults } from './provider-form-defaults'
import { providerFormSchema } from './provider-form-schema'

const catalogs = { en: providerEnglish, 'zh-CN': providerChinese }
async function render(children: ReactNode, locale: Locale) {
  const runtime = createLocaleRuntime(catalogs)
  await runtime.setPreference(locale)
  const html = renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>{children}</LocaleProvider>,
  )
  runtime.dispose()
  return html
}

describe('provider localization', () => {
  it('has complete paired catalogs and matching interpolation parameters', () => {
    expect(catalogIssues(catalogs)).toEqual([])
    for (const text of Object.values(providerChinese))
      expect(text).toMatch(/[㐀-鿿]/)
  })

  it('interpolates provider names and preserves protocol values', async () => {
    expect(
      await render(
        <ProviderMessage
          message="Connect to {name}"
          params={{ name: 'GitHub Copilot' }}
        />,
        'zh-CN',
      ),
    ).toBe('连接到 GitHub Copilot')
    expect(
      await render(
        <ProviderMessage
          message='Use "{model}"'
          params={{ model: 'custom/model:2026' }}
        />,
        'en',
      ),
    ).toBe('Use &quot;custom/model:2026&quot;')
  })

  it('keeps validation keys stable and translates all provider-specific errors', async () => {
    const runtime = createLocaleRuntime(catalogs)
    const invalid = [
      {
        ...getProviderFormDefaults(),
        name: '',
        modelId: '',
        baseUrl: 'invalid',
        contextWindow: 1.5,
        temperature: 3,
      },
      {
        ...getProviderFormDefaults(),
        name: 'a'.repeat(51),
        modelId: 'test',
        type: 'azure',
        resourceName: '',
        baseUrl: '',
        apiKey: '',
      },
      {
        ...getProviderFormDefaults(),
        name: 'bedrock',
        modelId: 'test',
        type: 'bedrock',
        accessKeyId: '',
        secretAccessKey: '',
        region: '',
      },
      {
        ...getProviderFormDefaults(),
        name: 'headers',
        modelId: 'test',
        headers: [
          { name: 'bad name', value: 'new\nline' },
          { name: 'DUP', value: '' },
          { name: 'dup', value: '' },
        ],
      },
      {
        ...getProviderFormDefaults(),
        name: 'numeric',
        modelId: 'test',
        contextWindow: Number.NaN,
        temperature: -1,
      },
      {
        ...getProviderFormDefaults(),
        name: 'large',
        modelId: 'test',
        contextWindow: 2000001,
      },
    ]
    for (const values of invalid) {
      const parsed = providerFormSchema.safeParse(values)
      expect(parsed.success).toBe(false)
      if (parsed.success) continue
      for (const issue of parsed.error.issues) {
        expect(providerEnglish[issue.message]).toBeDefined()
        await runtime.setPreference('zh-CN')
        expect(runtime.t(issue.message)).toMatch(/[㐀-鿿]/)
        await runtime.setPreference('en')
        expect(runtime.t(issue.message)).toBe(issue.message)
      }
    }
    runtime.dispose()
  })

  it('translates dynamic catalog hints without changing provider names', async () => {
    const runtime = createLocaleRuntime(catalogs)
    await runtime.setPreference('zh-CN')
    expect(
      getIncompleteCatalogHint('lmstudio', 2, 'LM Studio', runtime.t),
    ).toContain('LM Studio 仅列出常用模型')
    expect(
      getIncompleteCatalogHint('chatgpt-pro', 2, 'ChatGPT', runtime.t),
    ).toContain('ChatGPT 的官方列表')
    runtime.dispose()
  })

  it('translates known errors and keeps unknown server diagnostics as details', async () => {
    expect(
      await render(
        <ProviderError message="reBrowser agent server URL is not ready" />,
        'zh-CN',
      ),
    ).toContain('尚未就绪')
    expect(
      await render(<ProviderError message="Server returned 503" />, 'zh-CN'),
    ).toContain('状态码 503')
    const html = await render(
      <ProviderError
        message="[openai] upstream_reason: invalid_key"
        summary="Connection test failed"
      />,
      'zh-CN',
    )
    expect(html).toContain('连接测试失败')
    expect(html).toContain('错误详情')
    expect(html).toContain('[openai] upstream_reason: invalid_key')
  })

  it('localizes network and server test feedback while preserving responses', async () => {
    const result = {
      success: false,
      message: 'legacy',
      messageKey:
        'Could not reach the local reBrowser server at {url}. Make sure reBrowser is running and try again.',
      messageParams: { url: 'http://127.0.0.1:9200' },
      detail: 'ECONNREFUSED',
    }
    const html = await render(<ProviderTestFeedback result={result} />, 'zh-CN')
    expect(html).toContain('无法连接到 http://127.0.0.1:9200')
    expect(html).toContain('ECONNREFUSED')
    expect(
      await render(
        <ProviderTestFeedback
          result={{
            success: true,
            message: 'Connection successful. Response: "Hello"',
          }}
        />,
        'zh-CN',
      ),
    ).toContain('提供商响应：Hello')
  })
})

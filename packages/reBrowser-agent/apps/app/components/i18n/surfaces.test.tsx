import { describe, expect, it } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import {
  surfacesChinese,
  surfacesEnglish,
} from '@/lib/i18n/surfaces-supplemental'
import { attachmentErrorMessage } from '@/screens/agent-command/attachment-error-message'
import { Header as SurveyHeader } from '@/screens/jtbd-agent/SurveyHeader'
import { HubProvidersList } from '@/screens/llm-hub/HubProvidersList'
import { LlmHubHeader } from '@/screens/llm-hub/LlmHubHeader'
import { StarterPromptEditor } from '@/screens/sidepanel/index/StarterPromptEditor'
import { renderWithLocale } from './test-utils'

const parameters = (value: string) =>
  [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort()

describe('supplemental surfaces catalog', () => {
  it('has matching keys, actual Chinese values and identical parameters', () => {
    expect(Object.keys(surfacesChinese).sort()).toEqual(
      Object.keys(surfacesEnglish).sort(),
    )
    for (const [key, english] of Object.entries(surfacesEnglish)) {
      expect(surfacesChinese[key], key).toMatch(/[㐀-鿿！？]/)
      expect(parameters(surfacesChinese[key]), key).toEqual(parameters(english))
      expect(english, key).not.toBe(key.startsWith('surfaces.') ? key : '')
    }
  })

  it('uses count-aware English and Chinese without leaking interpolation tokens', async () => {
    const runtime = createLocaleRuntime({
      en: surfacesEnglish,
      'zh-CN': surfacesChinese,
    })
    await runtime.ready
    await runtime.setPreference('en')
    expect(runtime.t('surfaces.selectedTabs', { count: 1 })).toBe(
      '1 tab selected',
    )
    expect(runtime.t('surfaces.selectedTabs', { count: 2 })).toBe(
      '2 tabs selected',
    )
    await runtime.setPreference('zh-CN')
    expect(runtime.t('surfaces.selectedTabs', { count: 2 })).toBe(
      '已选择 2 个标签页',
    )
    expect(
      runtime.t('surfaces.removeProviderConfirm', { name: 'My provider' }),
    ).toContain('My provider')
    expect(
      runtime.t('surfaces.actionsCompleted', { completed: 2, total: 3 }),
    ).toBe('已完成 2/3 项操作')
    runtime.dispose()
  })

  it('localizes structured attachment failures without translating file names', async () => {
    const runtime = createLocaleRuntime({
      en: surfacesEnglish,
      'zh-CN': surfacesChinese,
    })
    await runtime.ready
    await runtime.setPreference('zh-CN')
    expect(
      attachmentErrorMessage(
        { code: 'unsupported_type', mediaType: 'application/pdf', message: '' },
        runtime.t,
      ),
    ).toBe('不支持的附件类型：application/pdf')
    expect(
      attachmentErrorMessage(
        {
          code: 'too_large',
          message: 'File "my-code.txt" is too large (max 1 MB).',
        },
        runtime.t,
      ),
    ).toBe('文件“my-code.txt”过大（最大 1 MB）。')
    expect(
      attachmentErrorMessage(
        {
          code: 'too_many',
          message: 'Only the first 2 of 4 files were attached (max 10).',
        },
        runtime.t,
      ),
    ).toContain('4 个文件中的前 2 个')
    expect(
      attachmentErrorMessage(
        { code: 'read_failed', message: 'native internal error' },
        runtime.t,
      ),
    ).toContain('无法读取附件')
    runtime.dispose()
  })
})

describe('translated business surfaces', () => {
  it('renders header, loading and empty states in Chinese and English', () => {
    const props = {
      providers: [],
      onEditProvider: () => {},
      onDeleteProvider: () => {},
      onAddProvider: () => {},
    }
    const chinese = renderWithLocale(
      <>
        <LlmHubHeader />
        <HubProvidersList {...props} />
        <SurveyHeader />
      </>,
      'zh-CN',
    )
    expect(chinese).toContain('大模型聊天与聚合中心')
    expect(chinese).toContain('尚未配置提供商。')
    expect(chinese).toContain('产品问卷')
    expect(
      renderWithLocale(<HubProvidersList {...props} isLoading />, 'zh-CN'),
    ).toContain('正在加载提供商')
    expect(renderWithLocale(<HubProvidersList {...props} />)).toContain(
      'No providers configured yet.',
    )
  })

  it('localizes provider actions but preserves custom names and URLs', () => {
    const html = renderWithLocale(
      <HubProvidersList
        providers={[
          { name: 'Do not translate me', url: 'https://example.com' },
        ]}
        onEditProvider={() => {}}
        onDeleteProvider={() => {}}
        onAddProvider={() => {}}
      />,
      'zh-CN',
    )
    expect(html).toContain('Do not translate me')
    expect(html).toContain('https://example.com')
    expect(html).toContain('移除 Do not translate me')
    expect(html).toContain('编辑')
  })

  it('preserves editable user labels and prompts while translating editor UI', () => {
    const prompts = [0, 1, 2].map((index) => ({
      display: `My shortcut ${index}`,
      prompt: 'Keep my code: const x = "hello"',
    }))
    const html = renderWithLocale(
      <StarterPromptEditor
        prompts={prompts}
        onSave={async () => {}}
        onCancel={() => {}}
      />,
      'zh-CN',
    )
    expect(html).toContain('My shortcut 0')
    expect(html).toContain('Keep my code:')
    expect(html).toContain('按钮标签')
    expect(html).toContain('保存提示词')
    expect(html).toContain('编辑提示词 1：My shortcut 0')
  })
})

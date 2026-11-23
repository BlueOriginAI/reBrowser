import { describe, expect, it, mock } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import * as _skillsHooks from '@/modules/api/skills.hooks'

const testLocaleRuntime = createLocaleRuntime({ en, 'zh-CN': zhCN })

mock.module('@/modules/api/skills.hooks', () => ({
  ..._skillsHooks,
  useSkillCatalog: () => ({
    isLoading: false,
    isError: false,
    data: {
      version: 1,
      updatedAt: 1,
      items: [
        {
          id: 'wechat-default-draft',
          name: 'neo-wechat-default-draft',
          title: {
            zh: '微信公众号自动排版存草稿',
            en: 'WeChat Official Account Draft Publisher',
          },
          description: {
            zh: '自动填草稿并上传封面',
            en: 'Fill WeChat drafts and upload cover art',
          },
          site: 'mp.weixin.qq.com',
          category: 'content',
          proOnly: false,
          avgTokensSaved: 42000,
          verifiedCleanRuns: 25,
          contentHash: 'sha256:abc',
          installed: false,
          updateAvailable: false,
        },
        {
          id: 'multiplatform-content-matrix',
          name: 'neo-multiplatform-content-matrix',
          title: {
            zh: '多平台内容矩阵同步分发',
            en: 'Multi-Platform Content Matrix Publisher',
          },
          description: {
            zh: '协同分发至多平台',
            en: 'Publish across platforms',
          },
          site: 'creator.xiaohongshu.com',
          category: 'growth',
          proOnly: true,
          avgTokensSaved: 76000,
          verifiedCleanRuns: 19,
          contentHash: 'sha256:def',
          installed: true,
          updateAvailable: false,
        },
      ],
    },
  }),
  useInstallCatalogSkill: () => ({
    mutateAsync: async () => ({ installed: true }),
    isPending: false,
  }),
}))

const { VerifiedSkillsCatalog } = await import('./VerifiedSkillsCatalog')

describe('VerifiedSkillsCatalog', () => {
  it('renders verified skills with token savings, site badges, and PRO tag', () => {
    const client = new QueryClient()
    const html = renderToStaticMarkup(
      <LocaleProvider runtime={testLocaleRuntime}>
        <QueryClientProvider client={client}>
          <VerifiedSkillsCatalog />
        </QueryClientProvider>
      </LocaleProvider>,
    )
    expect(html).toContain('Verified Skills Market')
    expect(html).toContain('mp.weixin.qq.com')
    expect(html).toContain('42.0k')
    expect(html).toContain('PRO')
    expect(html).toContain('Install')
    expect(html).toContain('Installed')
  })
})

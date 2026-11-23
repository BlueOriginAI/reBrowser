import { describe, expect, it, mock } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup } from '@/lib/i18n/test-render'
import * as _rerouteHooks from '@/modules/api/reroute.hooks'
import * as _skillsHooks from '@/modules/api/skills.hooks'

let rerouteState: _rerouteHooks.RerouteState = {
  signedIn: false,
  email: '',
  displayName: '',
  entitlement: 'signedOut',
  isPro: false,
  selfInstallationId: 'inst-local',
  selfDeviceName: 'MacBook Pro',
  allowIncomingReroute: true,
  relayConnected: false,
  devices: [],
}

mock.module('@/modules/api/reroute.hooks', () => ({
  ..._rerouteHooks,
  useRerouteState: Object.assign(
    () => ({ data: rerouteState, isLoading: false, isError: false }),
    { getKey: () => ['api', 'reroute', 'state'] },
  ),
}))

mock.module('@/modules/api/skills.hooks', () => ({
  ..._skillsHooks,
  useSkillCatalog: Object.assign(
    () => ({
      isLoading: false,
      isError: false,
      data: {
        version: 1,
        updatedAt: 1,
        items: [
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
            installed: false,
            updateAvailable: false,
          },
          {
            id: 'wechat-default-draft',
            name: 'neo-wechat-default-draft',
            title: {
              zh: '微信公众号自动排版存草稿',
              en: 'WeChat Official Account Draft Publisher',
            },
            description: {
              zh: '自动填草稿并上传封面',
              en: 'Fill WeChat drafts',
            },
            site: 'mp.weixin.qq.com',
            category: 'content',
            proOnly: false,
            avgTokensSaved: 42000,
            verifiedCleanRuns: 25,
            contentHash: 'sha256:abc',
            installed: true,
            updateAvailable: false,
          },
        ],
      },
    }),
    { getKey: () => ['api', 'skills', 'catalog'] },
  ),
  useInstallCatalogSkill: () => ({
    mutateAsync: async () => ({ installed: true }),
    isPending: false,
  }),
}))

const { ProShowcaseHub } = await import('./ProShowcaseHub')

function renderHub(locale: 'en' | 'zh-CN' = 'en'): string {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProShowcaseHub />
      </MemoryRouter>
    </QueryClientProvider>,
    locale,
  )
}

describe('ProShowcaseHub', () => {
  it('renders both Pro pillars with Skills stacked above Remote Control and sign-in CTA when signed out', () => {
    const html = renderHub('en')
    expect(html).toContain('Cross-Device Browser Reroute')
    expect(html).toContain('Verified &amp; Pro Skills Packs')
    expect(html).toContain('Multi-Platform Content Matrix Publisher')
    expect(html).toContain('Sign in to unlock')
    const skillsIdx = html.indexOf('data-testid="pro-pillar-skills"')
    const rerouteIdx = html.indexOf('data-testid="pro-pillar-reroute"')
    expect(skillsIdx).toBeGreaterThan(-1)
    expect(rerouteIdx).toBeGreaterThan(skillsIdx)
    expect(html.indexOf('Verified &amp; Pro Skills Packs')).toBeLessThan(
      html.indexOf('Cross-Device Browser Reroute'),
    )
  })

  it('shows Pro Active badge and online remote host without headline, subtitle, or email', () => {
    rerouteState = {
      ...rerouteState,
      signedIn: true,
      email: 'pro@example.com',
      entitlement: 'active',
      isPro: true,
      relayConnected: true,
      devices: [
        {
          installationId: 'inst-local',
          deviceName: 'MacBook Pro',
          os: 'macos',
          appVersion: '0.1.5',
          online: true,
          allowIncoming: true,
          isSelf: true,
        },
        {
          installationId: 'inst-home',
          deviceName: 'Home Studio',
          os: 'macos',
          appVersion: '0.1.5',
          online: true,
          allowIncoming: true,
          rttMs: 12,
          isSelf: false,
        },
      ],
    }

    const html = renderHub('zh-CN')
    expect(html).toContain('Pro 已激活')
    expect(html).toContain('Home Studio')
    expect(html).toContain('多平台内容矩阵同步分发')
    expect(html).not.toContain('pro@example.com')
    expect(html).not.toContain('跨设备路由与高阶商业技能已激活')
    expect(html).not.toContain('控制端零配置一键调度远端主力机浏览器')
  })
})

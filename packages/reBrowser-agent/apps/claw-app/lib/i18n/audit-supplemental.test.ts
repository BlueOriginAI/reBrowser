import { describe, expect, it } from 'bun:test'
import { catalogIssues, createLocaleRuntime } from '@browseros/i18n/core'
import { cleanupConfirmText } from '@/components/audit/manage-audit-files.helpers'
import { groupDispatchesByTab } from '@/screens/task-detail/task-detail.helpers'
import { auditChinese, auditEnglish } from './audit-supplemental'

const catalogs = { en: auditEnglish, 'zh-CN': auditChinese }

describe('audit supplemental catalogs', () => {
  it('has matching keys and interpolation placeholders with actual Chinese translations', () => {
    expect(catalogIssues(catalogs)).toEqual([])
    expect(Object.keys(auditChinese).sort()).toEqual(
      Object.keys(auditEnglish).sort(),
    )
    for (const [key, value] of Object.entries(auditChinese)) {
      expect(value).not.toBe(auditEnglish[key])
      expect(value).toMatch(/[㐀-鿿]/)
    }
  })

  it('localizes both cleanup warnings including custom retention days', async () => {
    const runtime = createLocaleRuntime(catalogs)
    await runtime.setPreference('zh-CN')
    expect(cleanupConfirmText({ mode: 'keepForever' }, runtime.t)).toContain(
      '保留策略设为“永不”',
    )
    expect(
      cleanupConfirmText({ mode: 'deleteAfterDays', days: 17 }, runtime.t),
    ).toContain('永久删除 17 天前')
    expect(
      runtime.t('Removed {{count}} sessions and reclaimed {{size}}.', {
        count: 2,
        size: '1.50 GB',
      }),
    ).toBe('已移除 2 个会话，释放了 1.50 GB 空间。')
    runtime.dispose()
  })

  it('localizes session and numbered tab labels while preserving page metadata', async () => {
    const runtime = createLocaleRuntime(catalogs)
    await runtime.setPreference('zh-CN')
    const groups = groupDispatchesByTab(
      [
        {
          dispatchId: 1,
          createdAt: 100,
          slug: 'raw-agent',
          label: 'Raw agent',
          sessionId: 'raw-session',
          toolName: 'read',
          pageId: 8,
          url: 'https://example.com/raw',
          title: 'Raw English title',
        },
      ],
      [],
      runtime.t,
    )
    expect(groups.map((group) => group.label)).toEqual(['会话', '标签页 1'])
    expect(groups[1]?.displayTitle).toBe('Raw English title')
    expect(groups[1]?.displayUrl).toBe('https://example.com/raw')
    runtime.dispose()
  })
})

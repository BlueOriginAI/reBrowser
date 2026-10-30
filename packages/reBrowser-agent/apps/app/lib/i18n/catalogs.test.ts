import { describe, expect, it } from 'bun:test'
import { catalogIssues, createLocaleRuntime } from '@browseros/i18n/core'
import { catalogs } from './catalogs'
import { en } from './en'
import { zhCN } from './zh-CN'

describe('app locale catalogs', () => {
  it('keeps validation bounds and provider diagnostics interpolated in both languages', async () => {
    const runtime = createLocaleRuntime(catalogs)
    await runtime.ready
    for (const locale of ['en', 'zh-CN'] as const) {
      await runtime.setPreference(locale)
      const bounds = runtime.t('mcp.portRange', { min: 9000, max: 9999 })
      expect(bounds).toContain('9000')
      expect(bounds).toContain('9999')
      expect(bounds).not.toContain('{{')
      expect(runtime.t('Server returned {status}', { status: 503 })).toContain(
        '503',
      )
    }
    runtime.dispose()
  })

  it('keeps English and Simplified Chinese catalogs aligned', () => {
    expect(catalogIssues({ en, 'zh-CN': zhCN })).toEqual([])
    expect(catalogIssues(catalogs)).toEqual([])
  })
})

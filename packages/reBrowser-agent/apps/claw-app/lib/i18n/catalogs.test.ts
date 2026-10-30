import { expect, test } from 'bun:test'
import { catalogIssues, createLocaleRuntime } from '@browseros/i18n/core'
import { catalogs } from './catalogs'

test('merged neo catalogs have matching keys and parameters', () => {
  expect(catalogIssues(catalogs)).toEqual([])
})

test('Chinese help, counts and accessibility labels resolve in the final bundle catalog', async () => {
  const runtime = createLocaleRuntime(catalogs)
  await runtime.ready
  await runtime.setPreference('zh-CN')
  expect(runtime.t('Docs')).toBe('文档')
  expect(runtime.t('Notifications')).toBe('通知')
  expect(runtime.t('{{count}} sessions', { count: 0 })).toBe('0 个会话')
  expect(runtime.t('{{count}}t', { count: 4 })).toBe('4 次调用')
  expect(runtime.t('common.close')).toBe('关闭')
  runtime.dispose()
})

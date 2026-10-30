import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createLocaleRuntime } from '../src/core'
import { LocaleProvider, useLocale } from '../src/react'

function Form() {
  const { t } = useLocale()
  return (
    <label>
      {t('name')}
      <input defaultValue="用户草稿 <script>" aria-label={t('name')} />
      <span>{t('greeting', { name: '<script>alert(1)</script>' })}</span>
    </label>
  )
}

test('React labels and accessibility text follow locale without translating user data', async () => {
  const runtime = createLocaleRuntime({
    en: { name: 'Name', greeting: 'Hello {{name}}' },
    'zh-CN': { name: '名称', greeting: '你好 {{name}}' },
  })
  await runtime.ready
  await runtime.setPreference('zh-CN')
  const chinese = renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>
      <Form />
    </LocaleProvider>,
  )
  expect(chinese).toContain('aria-label="名称"')
  expect(chinese).toContain('value="用户草稿 &lt;script&gt;"')
  expect(chinese).toContain('你好 &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(chinese).not.toContain('<script>')
  await runtime.setPreference('en')
  const english = renderToStaticMarkup(
    <LocaleProvider runtime={runtime}>
      <Form />
    </LocaleProvider>,
  )
  expect(english).toContain('aria-label="Name"')
  expect(english).toContain('value="用户草稿 &lt;script&gt;"')
  runtime.dispose()
})

test('missing provider is reported instead of silently masking missing integration', () => {
  expect(() => renderToStaticMarkup(<Form />)).toThrow(
    'useLocale requires a LocaleProvider',
  )
})

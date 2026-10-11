import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from '../test-locale'
import { ImportedSummaryCard } from './components/ImportedSummaryCard'
import { ImportItemChecklist } from './components/ImportItemChecklist'
import {
  MacKeychainPermissionNote,
  MacKeychainPreview,
  MacKeychainReminder,
} from './components/MacKeychainNotice'
import { NativeError } from './components/NativeError'
import { VisualRail } from './components/VisualRail'
import { SetupStep } from './steps/SetupStep'

const noop = () => {}

test('Chinese onboarding translates rails, import choices, summaries and setup states', () => {
  const html = renderToStaticMarkup(
    <>
      <VisualRail />
      <ImportItemChecklist
        items={['history', 'cookies', 'extensions']}
        checkedItems={['cookies']}
        onToggle={noop}
      />
      <ImportedSummaryCard
        importedItemCount={1}
        itemSummary="用户数据"
        sourceName="我的 Chrome"
      />
      <SetupStep failed onRetry={noop} />
    </>,
    'zh-CN',
  )
  for (const text of [
    '历史记录',
    '已登录会话',
    '已选择 1 个类别',
    '我的 Chrome',
    '设置未完成',
    '重试',
  ]) {
    expect(html).toContain(text)
  }
  for (const text of [
    'What to copy',
    'categories selected',
    'Payment cards were skipped',
    'Setup didn’t finish',
  ]) {
    expect(html).not.toContain(text)
  }
})

test('Chinese Keychain explanations remain inert illustrations, never password inputs', () => {
  const html = renderToStaticMarkup(
    <>
      <MacKeychainPreview />
      <MacKeychainPermissionNote />
      <MacKeychainReminder />
    </>,
    'zh-CN',
  )
  expect(html).toContain('macOS 对话框示例')
  expect(html).toContain('密码：')
  expect(html).toContain('始终允许')
  expect(html).not.toContain('<input')
  expect(html).not.toContain('Always Allow')
})

test('localized native errors retain technical details without interpreting their contents', () => {
  const html = renderToStaticMarkup(
    <NativeError
      error={{ code: 'invalid_source', message: '<script>raw error</script>' }}
    />,
    'zh-CN',
  )
  expect(html).toContain('此导入来源已不可用')
  expect(html).toContain('技术详情')
  expect(html).toContain('&lt;script&gt;raw error&lt;/script&gt;')
  expect(html).not.toContain('<script>')
})

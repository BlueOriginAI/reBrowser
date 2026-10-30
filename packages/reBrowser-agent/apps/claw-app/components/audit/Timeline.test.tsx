import { AuditTestLocaleProvider } from '@/components/audit/audit-test-locale'
/**
 * Static-markup pins for the Timeline component's expand-all,
 * collapse-all, and notable-action auto-expand behaviour.
 */

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolDispatchRow } from '@/modules/api/audit.hooks'
import { Timeline } from './Timeline'

function dispatch(overrides: Partial<ToolDispatchRow> = {}): ToolDispatchRow {
  return {
    dispatchId: 1,
    createdAt: 1_000_000,
    slug: 'a',
    label: 'A',
    sessionId: 'sess',
    toolName: 'snapshot',
    pageId: 1,
    argsJson: '{"page":1}',
    resultMeta: '{"isError":false}',
    durationMs: 5,
    ...overrides,
  }
}

const startedAt = 1_000_000

function render(
  dispatches: ToolDispatchRow[],
  extra: { showSessionEnd?: boolean; endEvent?: TimelineEndEvent } = {},
  locale: 'en' | 'zh-CN' = 'en',
): string {
  return renderToStaticMarkup(
    <AuditTestLocaleProvider locale={locale}>
      <Timeline
        dispatches={dispatches}
        startedAt={startedAt}
        endEvent={extra.endEvent ?? null}
        showSessionEnd={extra.showSessionEnd}
        onScreenshotClick={() => undefined}
      />
    </AuditTestLocaleProvider>,
  )
}

type TimelineEndEvent = {
  createdAt: number
  kind: 'closed' | 'errored' | 'cancelled'
  reason: string | null
} | null

const CLOSED_END: TimelineEndEvent = {
  createdAt: startedAt + 60_000,
  kind: 'closed',
  reason: null,
}

const CANCELLED_END: TimelineEndEvent = {
  createdAt: startedAt + 30_000,
  kind: 'cancelled',
  reason: 'operator requested stop',
}

describe('Timeline', () => {
  it('translates Chinese containers without altering raw arguments, results or errors', () => {
    const html = render(
      [
        dispatch({
          toolName: 'act',
          argsJson: '{"code":"doNotTranslate()"}',
          resultMeta: '{"isError":true,"message":"RAW_TOOL_ERROR"}',
          screenshotId: 10,
          url: 'https://example.com/raw',
        }),
      ],
      {
        endEvent: {
          createdAt: startedAt + 5,
          kind: 'errored',
          reason: 'RAW_REASON',
        },
      },
      'zh-CN',
    )
    for (const text of [
      '时间线',
      '全部展开',
      '全部收起',
      '1 个事件',
      '参数',
      '结果',
      '截图',
      '页面',
      '复制参数',
      '会话出错（RAW_REASON）',
      'doNotTranslate()',
      'RAW_TOOL_ERROR',
      'https://example.com/raw',
    ]) {
      expect(html).toContain(text)
    }
    expect(html).toContain('data-testid="timeline-block-copy-args"')
    expect(html).not.toContain('Copy args')
  })

  it('translates running, stopped and unknown-error states', () => {
    expect(render([], {}, 'zh-CN')).toContain('尚未收到会话关闭事件')
    expect(render([], { endEvent: CANCELLED_END }, 'zh-CN')).toContain(
      '会话已停止',
    )
    expect(
      render(
        [],
        { endEvent: { createdAt: startedAt, kind: 'errored', reason: null } },
        'zh-CN',
      ),
    ).toContain('会话出错（未知原因）')
  })

  it('renders Expand all + Collapse all buttons', () => {
    const html = render([
      dispatch({ dispatchId: 1 }),
      dispatch({ dispatchId: 2 }),
    ])
    expect(html).toContain('Expand all')
    expect(html).toContain('Collapse all')
  })

  it('disables Collapse all on first render when nothing is auto-expanded', () => {
    const html = render([dispatch({ dispatchId: 1, toolName: 'snapshot' })])
    // Collapse all should be disabled (no notable rows auto-expanded).
    expect(html).toMatch(
      /<button[^>]*data-disabled=""[^>]*timeline-collapse-all/,
    )
  })

  it('leaves Collapse all enabled when a notable row auto-expands', () => {
    const html = render([
      dispatch({ dispatchId: 1, toolName: 'snapshot' }),
      dispatch({ dispatchId: 2, toolName: 'act' }),
    ])
    expect(html).not.toMatch(
      /<button[^>]*data-disabled=""[^>]*timeline-collapse-all/,
    )
  })

  it('auto-expands notable rows so args + result blocks appear on initial render', () => {
    const html = render([
      dispatch({
        dispatchId: 7,
        toolName: 'act',
        argsJson: '{"kind":"click","ref":"btn-submit"}',
        resultMeta: '{"isError":false,"structuredKeys":["clicked"]}',
      }),
    ])
    // JSON in HTML markup is rendered with HTML-entity quotes; check
    // for the inner tokens that survive entity encoding instead.
    expect(html).toContain('btn-submit')
    expect(html).toContain('structuredKeys')
    expect(html).toContain('clicked')
  })

  it('disables both buttons when the dispatch list is empty', () => {
    const html = render([])
    expect(html).toMatch(/<button[^>]*data-disabled=""[^>]*timeline-expand-all/)
    expect(html).toMatch(
      /<button[^>]*data-disabled=""[^>]*timeline-collapse-all/,
    )
  })

  it('renders a copy button per block (args, result, page) on an expanded row', () => {
    const html = render([
      dispatch({
        dispatchId: 1,
        toolName: 'act',
        argsJson: '{"kind":"click"}',
        resultMeta: '{"isError":false}',
        url: 'https://example.com',
      }),
    ])
    expect(html).toContain('data-testid="timeline-block-copy-args"')
    expect(html).toContain('data-testid="timeline-block-copy-result"')
    expect(html).toContain('data-testid="timeline-block-copy-page"')
  })

  it('does not render a copy button on the screenshot block (image, not text)', () => {
    const html = render([
      dispatch({
        dispatchId: 2,
        toolName: 'screenshot',
        screenshotId: 9,
        argsJson: '{"page":1}',
        resultMeta: '{"isError":false}',
      }),
    ])
    expect(html).not.toContain('data-testid="timeline-block-copy-screenshot"')
  })

  it('renders a captured screenshot for an errored dispatch', () => {
    const html = render([
      dispatch({
        dispatchId: 3,
        toolName: 'act',
        screenshotId: 10,
        resultMeta: '{"isError":true}',
      }),
    ])
    expect(html).toContain('>screenshot<')
  })

  it('renders the SessionEndRow by default', () => {
    const html = render([dispatch({ dispatchId: 1 })], {
      endEvent: CLOSED_END,
    })
    // SessionEndRow markup includes the literal "session closed" (or
    // "session errored") tail; either is enough to pin the presence
    // of the row.
    expect(html).toContain('session closed')
  })

  it('renders an operator-stopped terminal row', () => {
    const html = render([dispatch()], { endEvent: CANCELLED_END })
    expect(html).toContain('session stopped')
  })

  it('hides the SessionEndRow when showSessionEnd is false (per-tab view)', () => {
    const html = render([dispatch({ dispatchId: 1 })], {
      endEvent: CLOSED_END,
      showSessionEnd: false,
    })
    expect(html).not.toContain('session closed')
    expect(html).not.toContain('session errored')
    expect(html).not.toContain('Still running')
    // The dispatch row itself is still there.
    expect(html).toContain('snapshot')
  })
})

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from '../../test-locale'
import { SetupStep } from './SetupStep'

describe('SetupStep', () => {
  it('announces preparation with an indeterminate themed indicator', () => {
    const html = renderToStaticMarkup(
      <SetupStep failed={false} onRetry={() => {}} />,
    )
    expect(html).toContain('Finishing setup')
    expect(html).toContain(
      'Preparing reBrowser. This should only take a moment.',
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('motion-safe:animate-spin')
    expect(html).toContain('text-accent')
    expect(html).not.toContain('aria-valuenow')
    expect(html).not.toContain('Retry')
  })

  it('announces a recoverable failure with one primary Retry action', () => {
    const html = renderToStaticMarkup(<SetupStep failed onRetry={() => {}} />)
    expect(html).toContain('Setup didn’t finish')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Retry')
    expect(html).toContain('bg-primary')
    expect(html).not.toContain('animate-spin')
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuditTestLocaleProvider } from '@/components/audit/audit-test-locale'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders cancelled sessions as stopped', () => {
    expect(
      renderToStaticMarkup(
        <AuditTestLocaleProvider>
          <StatusBadge status="cancelled" />
        </AuditTestLocaleProvider>,
      ),
    ).toContain('Stopped')
  })

  it('renders a static live badge with no animation', () => {
    const html = renderToStaticMarkup(
      <AuditTestLocaleProvider>
        <StatusBadge status="live" />
      </AuditTestLocaleProvider>,
    )
    expect(html).toContain('Live')
    expect(html).not.toContain('animate-pulse')
  })
})

import { describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { renderToStaticMarkup } from '@/lib/i18n/test-render'
import { AppSidebar } from './AppSidebar'

describe('AppSidebar', () => {
  it('places Audit in the bottom utility section after primary navigation', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppSidebar expanded />
            </MemoryRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>,
      'zh-CN',
    )

    const navStart = html.indexOf('<nav')
    const navEnd = html.indexOf('</nav>')
    const navHtml = html.slice(navStart, navEnd)
    const auditIndex = html.indexOf('data-testid="sidebar-audit-link"')

    expect(navHtml).toContain('控制台')
    expect(navHtml).toContain('MCP')
    expect(navHtml).toContain('任务')
    expect(navHtml).not.toContain('审计')
    expect(auditIndex).toBeGreaterThan(navEnd)
    expect(html).toContain('审计')
  })
})

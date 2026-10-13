import { afterEach, describe, expect, it, mock } from 'bun:test'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { renderToStaticMarkup } from '@/lib/i18n/test-render'
import { helpItems, openHelpTarget, SidebarHelp } from './SidebarHelp'

const originalChrome = globalThis.chrome

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: originalChrome,
  })
})

describe('SidebarHelp', () => {
  it('translates help labels while keeping their destinations unchanged', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <MemoryRouter>
          <SidebarHelp expanded />
        </MemoryRouter>
      </TooltipProvider>,
      'zh-CN',
    )
    expect(html).toContain('帮助')
    expect(html).toContain('文档')
    expect(html).toContain('重新查看引导')
    expect(html).toContain('诊断')
    expect(html).not.toContain('Revisit Onboarding')
  })

  it('renders the help label and both entries when expanded', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/diagnostics']}>
          <SidebarHelp expanded />
        </MemoryRouter>
      </TooltipProvider>,
    )
    expect(html).toContain('Help')
    expect(html).toContain('Docs')
    expect(html).toContain('Revisit Onboarding')
    expect(html).toContain('Diagnostics')
    expect(html).toContain('aria-current="page"')
  })

  it('pins Docs and onboarding to their exact targets', () => {
    expect(helpItems.map((item) => [item.name, item.url])).toEqual([
      [
        'Docs',
        'https://github.com/BlueOriginAI/reBrowser/blob/main/skills/rebrowser/SKILL.md',
      ],
      ['Revisit Onboarding', 'chrome://browseros-onboarding'],
      ['Diagnostics', '/diagnostics'],
    ])
  })

  it('opens a help target in a new tab via chrome.tabs.create', () => {
    const create = mock((_args: { url: string }) => Promise.resolve({}))
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: { tabs: { create } },
    })

    openHelpTarget('chrome://browseros-onboarding')

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      url: 'chrome://browseros-onboarding',
    })
  })
})

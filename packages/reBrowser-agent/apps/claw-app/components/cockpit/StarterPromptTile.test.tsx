/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider, useLocale } from '@browseros/i18n/react'
import { parseHTML } from 'linkedom'
import { act } from 'react'
import type { Root } from 'react-dom/client'
import { catalogs } from '@/lib/i18n/catalogs'
import { renderToStaticMarkup } from '@/lib/i18n/test-render'
import { STARTER_PROMPT } from '@/screens/cockpit/cockpit-onboarding.helpers'
import { StarterPromptTile } from './StarterPromptTile'

const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Event',
  'IS_REACT_ACT_ENVIRONMENT',
]
let originals: Map<string, PropertyDescriptor | undefined>
let root: Root
let container: HTMLElement
let runtime: ReturnType<typeof createLocaleRuntime>
const writeText = mock(async (_text: string) => {})

function LocalizedStarter() {
  const { t } = useLocale()
  return <StarterPromptTile prompt={t(STARTER_PROMPT)} variant="block" />
}

beforeEach(async () => {
  originals = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  )
  const dom = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window: dom.window,
    document: dom.document,
    navigator: { clipboard: { writeText } },
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    })
  }
  writeText.mockClear()
  let preference: 'en' | 'zh-CN' | 'system' = 'en'
  runtime = createLocaleRuntime(catalogs, {
    read: async () => ({ preference, systemLocale: 'en' }),
    write: async (next) => {
      preference = next
    },
    subscribe: () => () => {},
  })
  await runtime.ready
  const element = document.getElementById('root')
  if (!element) throw new Error('Missing test container')
  container = element
  const { createRoot } = await import('react-dom/client')
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  runtime.dispose()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('StarterPromptTile', () => {
  it('renders caller content verbatim rather than rewriting user text', () => {
    const html = renderToStaticMarkup(
      <StarterPromptTile prompt="Compare BrowserClaw with reBrowser." />,
    )
    expect(html).toContain('Compare BrowserClaw with reBrowser.')
  })

  it('copies the rendered localized starter payload after live language changes', async () => {
    await act(async () => {
      root.render(
        <LocaleProvider runtime={runtime}>
          <LocalizedStarter />
        </LocaleProvider>,
      )
    })
    for (const locale of ['en', 'zh-CN', 'en'] as const) {
      await act(async () => runtime.setPreference(locale))
      const prompt = runtime.t(STARTER_PROMPT)
      expect(prompt).toContain('reBrowser')
      expect(prompt).not.toMatch(/BrowserOS|BrowserClaw|RemocodeBrowser/)
      expect(
        prompt.startsWith(
          locale === 'en' ? 'Using reBrowser' : '使用 reBrowser',
        ),
      ).toBe(true)
      expect(container.textContent).toContain(prompt)
      const button = container.querySelector('button')
      if (!button) throw new Error('Missing copy button')
      await act(async () => {
        button.dispatchEvent(new window.Event('click', { bubbles: true }))
      })
      expect(writeText.mock.calls.at(-1)?.[0]).toBe(prompt)
    }
  })
})

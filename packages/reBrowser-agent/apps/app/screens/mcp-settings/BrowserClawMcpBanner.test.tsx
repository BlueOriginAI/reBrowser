import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BrowserClawMcpBanner } from './BrowserClawMcpBanner'

test('MCP settings do not advertise an upstream browser download', () => {
  expect(renderToStaticMarkup(<BrowserClawMcpBanner />)).toBe('')
})

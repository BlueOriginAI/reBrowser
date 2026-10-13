import { describe, expect, it } from 'bun:test'
import {
  MANUAL_SETUP_DOCS_URL,
  MANUAL_SETUP_STEPS,
  MCP_SERVER_NAME,
} from './install-guide.data'

describe('supported manual MCP setup', () => {
  it('uses the canonical server name and this repository’s skill instructions', () => {
    expect(MCP_SERVER_NAME).toBe('reBrowser')
    expect(MANUAL_SETUP_DOCS_URL).toBe(
      'https://github.com/BlueOriginAI/reBrowser/blob/main/skills/rebrowser/SKILL.md',
    )
    expect(MANUAL_SETUP_STEPS.map((step) => step.id)).toEqual([
      'add-mcp',
      'install-skill',
    ])
    expect(MANUAL_SETUP_STEPS[0]?.body).toContain('named reBrowser')
    expect(MANUAL_SETUP_STEPS[0]?.note).toContain('rather than assuming a port')
    expect(MANUAL_SETUP_STEPS[1]?.note).toContain('skills/rebrowser/SKILL.md')
  })

  it('does not recommend an upstream extension, screenshots or unverified Cowork support', () => {
    const text = JSON.stringify(MANUAL_SETUP_STEPS)
    expect(text).not.toMatch(/BrowserOS|BrowserClaw|\.mcpb|Cowork|r2\.dev/)
    expect(text).not.toMatch(/127\.0\.0\.1:\d+/)
  })
})

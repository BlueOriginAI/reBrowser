import { describe, expect, it } from 'bun:test'
import { resolveBrowserBinaryPath } from '../__helpers__/test-runtime'

describe('test browser binary resolution', () => {
  it('defaults to the installed reBrowser application', () => {
    expect(resolveBrowserBinaryPath({})).toBe(
      '/Applications/reBrowser.app/Contents/MacOS/reBrowser',
    )
  })

  it('preserves an explicit browser binary override', () => {
    expect(
      resolveBrowserBinaryPath({ BROWSEROS_BINARY: '/tmp/custom-browser' }),
    ).toBe('/tmp/custom-browser')
  })
})

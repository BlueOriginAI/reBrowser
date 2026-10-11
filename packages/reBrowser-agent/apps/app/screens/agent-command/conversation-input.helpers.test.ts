import { describe, expect, it } from 'bun:test'
import { shouldSubmitComposerKey } from './conversation-input.helpers'

describe('shouldSubmitComposerKey', () => {
  it('submits a plain Enter key', () => {
    expect(
      shouldSubmitComposerKey({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
      }),
    ).toBe(true)
  })

  it('keeps a newline for Shift+Enter and IME composition', () => {
    expect(
      shouldSubmitComposerKey({
        key: 'Enter',
        shiftKey: true,
        isComposing: false,
      }),
    ).toBe(false)
    expect(
      shouldSubmitComposerKey({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
      }),
    ).toBe(false)
  })
})

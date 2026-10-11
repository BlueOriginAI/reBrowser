import { expect, test } from 'bun:test'
import { createLocaleRuntime, type LocaleState } from '../src/core'

test('dispose rejects new and queued writes before they reach persistence', async () => {
  let completeRead!: (state: LocaleState) => void
  let writes = 0
  const runtime = createLocaleRuntime(
    { en: {}, 'zh-CN': {} },
    {
      read: () =>
        new Promise((resolve) => {
          completeRead = resolve
        }),
      write: async () => {
        writes += 1
      },
      subscribe: () => () => {},
    },
  )
  const queued = runtime.setPreference('zh-CN')
  runtime.dispose()
  completeRead({ preference: 'system', systemLocale: 'en' })
  await expect(queued).rejects.toThrow('disposed')
  await expect(runtime.setPreference('en')).rejects.toThrow('disposed')
  expect(writes).toBe(0)
})

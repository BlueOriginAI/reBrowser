import { afterEach, expect, test } from 'bun:test'
import { createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider } from '@browseros/i18n/react'
import { parseHTML } from 'linkedom'
import { act } from 'react'
import type { Root } from 'react-dom/client'
import { type UseFormReturn, useForm } from 'react-hook-form'
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form'
import { catalogs } from '@/lib/i18n/catalogs'
import { LocalizedFormMessage } from './LocalizedFormMessage'

const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Event',
  'IS_REACT_ACT_ENVIRONMENT',
] as const
const original = new Map(
  names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
)
let root: Root | undefined
let runtime: ReturnType<typeof createLocaleRuntime> | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  runtime?.dispose()
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

test('switching locale translates an existing error without replacing the input or losing its value', async () => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>')
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value:
        name === 'IS_REACT_ACT_ENVIRONMENT'
          ? true
          : dom.window[name as keyof typeof dom.window],
    })
  }
  const { createRoot } = await import('react-dom/client')
  const container = document.getElementById('root')
  if (!container) throw new Error('Missing test root')
  root = createRoot(container)
  runtime = createLocaleRuntime(catalogs)
  await runtime.ready
  await runtime.setPreference('en')
  let formApi: UseFormReturn<{ name: string }> | undefined
  function Harness() {
    const form = useForm({ defaultValues: { name: '' } })
    formApi = form
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <input {...field} />
              </FormControl>
              <LocalizedFormMessage />
            </FormItem>
          )}
        />
      </Form>
    )
  }
  const currentRuntime = runtime
  await act(async () => {
    root?.render(
      <LocaleProvider runtime={currentRuntime}>
        <Harness />
      </LocaleProvider>,
    )
  })
  await act(async () => {
    formApi?.setValue('name', '保留我的草稿')
    formApi?.setError('name', {
      type: 'manual',
      message: 'skillForm.descriptionRequired',
    })
  })
  const input = container.querySelector('input')
  expect(input?.value).toBe('保留我的草稿')
  expect(container.textContent).toContain(
    runtime.t('skillForm.descriptionRequired'),
  )
  await act(async () => {
    await currentRuntime.setPreference('zh-CN')
  })
  expect(container.querySelector('input')).toBe(input)
  expect(input?.value).toBe('保留我的草稿')
  expect(container.textContent).toContain(
    runtime.t('skillForm.descriptionRequired'),
  )
  expect(container.textContent).not.toContain('required')
})

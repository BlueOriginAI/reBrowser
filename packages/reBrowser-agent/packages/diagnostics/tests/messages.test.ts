import { expect, test } from 'bun:test'
import {
  DIAGNOSTICS_REQUEST,
  diagnosticSections,
  formatDiagnostics,
  parseDiagnostics,
  productName,
  REPORTER_VERSION_REQUEST,
} from '../src/contract'
import { diagnosticsMessages } from '../src/messages'
import fixture from './fixture.json'

test('diagnostics presentation has matching English and Chinese labels', () => {
  const english = diagnosticsMessages('en')
  const chinese = diagnosticsMessages('zh-CN')
  expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort())
  expect(Object.keys(chinese.labels).sort()).toEqual(
    Object.keys(english.labels).sort(),
  )
  expect(chinese.title).toBe('诊断')
  expect(chinese.labels['Operating system']).toBe('操作系统')
  expect(english.title).toBe('Diagnostics')
})

test('selecting translated presentation does not translate copied diagnostics', () => {
  const snapshot = parseDiagnostics(fixture)
  if (!snapshot) throw new Error('Invalid test fixture')
  const original = formatDiagnostics(snapshot)
  diagnosticsMessages('zh-CN')
  expect(formatDiagnostics(snapshot)).toBe(original)
  expect(original).toContain('Operating system:')
})

test('diagnostics branding leaves legacy wire products and keys unchanged', () => {
  expect(DIAGNOSTICS_REQUEST).toBe('browseros:diagnostics:get')
  expect(REPORTER_VERSION_REQUEST).toBe(
    'browseros:diagnostics:reporter-version',
  )
  for (const product of [
    'browseros',
    'browseros-neo',
    'browseros-feedback',
  ] as const) {
    const snapshot = parseDiagnostics({ ...fixture, product })
    if (!snapshot) throw new Error('Invalid test fixture')
    expect(snapshot.product).toBe(product)
    expect(snapshot.versions.browseros).toBe(fixture.versions.browseros)
    expect(productName(product)).toBe(
      product === 'browseros-feedback'
        ? 'reBrowser (Reporter fallback)'
        : 'reBrowser',
    )
    const text = formatDiagnostics(snapshot)
    expect(text).toContain(`reBrowser: ${fixture.versions.browseros}`)
    expect(text).not.toContain('BrowserOS')
    for (const locale of ['en', 'zh-CN'] as const) {
      const messages = diagnosticsMessages(locale)
      const label = diagnosticSections(snapshot)[0].rows[0][0]
      expect(label).toBe('reBrowser')
      expect(messages.labels.reBrowser).toBe('reBrowser')
      expect(messages.labels.BrowserOS).toBe('reBrowser')
    }
  }
})

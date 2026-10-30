import { expect, test } from 'bun:test'
import { formatDiagnostics, parseDiagnostics } from '../src/contract'
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

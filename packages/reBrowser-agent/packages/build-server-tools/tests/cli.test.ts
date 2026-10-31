import { describe, expect, it } from 'bun:test'

import { parseAssetBuildArgs, parseBuildArgs } from '../src'
import { testProduct } from './helpers'

describe('build CLI', () => {
  it('parses target and manifest defaults', () => {
    const args = parseBuildArgs(['--target=darwin-arm64'], testProduct())

    expect(args.targets.map((target) => target.id)).toEqual(['darwin-arm64'])
    expect(args.manifestPath).toBe(
      'scripts/build/config/test-server-resources.json',
    )
    expect(args.ci).toBe(false)
  })

  it('supports --ci builds', () => {
    const args = parseBuildArgs(['--ci'], testProduct())

    expect(args.ci).toBe(true)
  })

  it('rejects upload flags that no longer exist', () => {
    expect(() =>
      parseBuildArgs(['--target=darwin-arm64', '--upload'], testProduct()),
    ).toThrow('unknown option')
  })

  it('parses asset build args', () => {
    expect(parseAssetBuildArgs([])).toEqual({ ci: false })
    expect(parseAssetBuildArgs(['--ci'])).toEqual({ ci: true })
  })
})

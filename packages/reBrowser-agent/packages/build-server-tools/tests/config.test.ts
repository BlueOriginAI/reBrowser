import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadBuildConfig } from '../src'
import { testProduct } from './helpers'

const REQUIRED_INLINE_ENV = {
  TEST_CONFIG_URL: 'https://stub.test/config',
}

const TEST_ENV_KEYS = [
  ...Object.keys(REQUIRED_INLINE_ENV),
  'LOG_LEVEL',
  'NODE_ENV',
  'VITE_BROWSEROS_CLAW_API_URL',
] as const

describe('build config', () => {
  let tempRoot: string | null = null
  let originalEnv: Partial<Record<(typeof TEST_ENV_KEYS)[number], string>>

  beforeEach(() => {
    originalEnv = {}
    for (const key of TEST_ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(async () => {
    for (const key of TEST_ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('reads package version and inline env from the root production env file', async () => {
    const rootDir = await writeProdRoot({
      ...REQUIRED_INLINE_ENV,
      LOG_LEVEL: 'debug',
    })

    const config = loadBuildConfig(rootDir, testProduct())

    expect(config.version).toBe('0.0.0-test')
    expect(config.envVars).toMatchObject({
      TEST_CONFIG_URL: 'https://stub.test/config',
      LOG_LEVEL: 'debug',
    })
  })

  it('reads a product version from Cargo TOML', async () => {
    const rootDir = await writeProdRoot(REQUIRED_INLINE_ENV)
    const packageDir = join(rootDir, 'apps/test-server')
    await rm(join(packageDir, 'package.json'))
    await writeFile(
      join(packageDir, 'Cargo.toml'),
      '[package]\nname = "test-server"\nversion = "1.2.3"\n',
    )

    const config = loadBuildConfig(
      rootDir,
      testProduct({
        versionSource: {
          type: 'cargo-toml',
          path: 'apps/test-server/Cargo.toml',
        },
      }),
    )

    expect(config.version).toBe('1.2.3')
  })

  it('reports an invalid Cargo version with its manifest path', async () => {
    const rootDir = await writeProdRoot(REQUIRED_INLINE_ENV)
    const packageDir = join(rootDir, 'apps/test-server')
    await rm(join(packageDir, 'package.json'))
    await writeFile(
      join(packageDir, 'Cargo.toml'),
      '[package]\nname = "test"\n',
    )

    expect(() =>
      loadBuildConfig(
        rootDir,
        testProduct({
          versionSource: {
            type: 'cargo-toml',
            path: 'apps/test-server/Cargo.toml',
          },
        }),
      ),
    ).toThrow('apps/test-server/Cargo.toml')
  })

  it('applies product inline env overrides after file and process env', async () => {
    const rootDir = await writeProdRoot({
      ...REQUIRED_INLINE_ENV,
      LOG_LEVEL: 'debug',
    })
    process.env.LOG_LEVEL = 'warn'
    const product = testProduct({
      env: {
        ...testProduct().env,
        inlineEnvOverrides: {
          LOG_LEVEL: 'info',
        },
      },
    })

    const config = loadBuildConfig(rootDir, product)

    expect(config.envVars.LOG_LEVEL).toBe('info')
  })

  it('lets CI-specific overrides replace available production values', async () => {
    const rootDir = await writeProdRoot(REQUIRED_INLINE_ENV)
    const product = testProduct({
      env: {
        ...testProduct().env,
        ciInlineEnvOverrides: {
          TEST_CONFIG_URL: 'https://ci.invalid/config',
        },
      },
    })

    const config = loadBuildConfig(rootDir, product, { ci: true })

    expect(config.envVars.TEST_CONFIG_URL).toBe('https://ci.invalid/config')
  })

  it('does not require a production env file in CI mode', async () => {
    const rootDir = await writeProdRoot({}, { envFile: false })

    const config = loadBuildConfig(rootDir, testProduct(), { ci: true })

    expect(config.envVars).toEqual({
      LOG_LEVEL: 'info',
      TEST_CONFIG_URL: 'https://test.invalid/config',
    })
  })

  it('allows optional-env products to build local artifacts', async () => {
    const rootDir = await writeProdRoot({}, { envFile: false })
    const product = testProduct({
      env: {
        ...testProduct().env,
        requiredInlineEnvKeys: [],
        inlineEnvKeys: [],
      },
    })

    const config = loadBuildConfig(rootDir, product)

    expect(config.envVars).toEqual({})
  })

  it('demotes Bun auto-loaded development values during production config resolution', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'build-server-config-'))
    const packageDir = join(tempRoot, 'apps/test-server')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      '{"version":"0.0.0-test"}',
    )
    await writeFile(
      join(tempRoot, '.env.development'),
      formatEnv({ NODE_ENV: 'development' }),
    )
    await writeFile(
      join(tempRoot, '.env.production'),
      formatEnv({ ...REQUIRED_INLINE_ENV, NODE_ENV: 'production' }),
    )
    process.env.NODE_ENV = 'development'
    const product = testProduct({
      env: {
        ...testProduct().env,
        inlineEnvKeys: ['TEST_CONFIG_URL', 'NODE_ENV'],
      },
    })

    const config = loadBuildConfig(tempRoot, product)

    expect(config.envVars.NODE_ENV).toBe('production')
  })

  it('does not pass demoted wrong-source process env to subprocesses', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'build-server-config-'))
    const packageDir = join(tempRoot, 'apps/test-server')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      '{"version":"0.0.0-test"}',
    )
    await writeFile(
      join(tempRoot, '.env.development'),
      formatEnv({ VITE_BROWSEROS_CLAW_API_URL: 'http://127.0.0.1:9200' }),
    )
    await writeFile(
      join(tempRoot, '.env.production'),
      formatEnv(REQUIRED_INLINE_ENV),
    )
    process.env.VITE_BROWSEROS_CLAW_API_URL = 'http://127.0.0.1:9200'
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }
    try {
      const config = loadBuildConfig(tempRoot, testProduct())

      expect(config.processEnv.VITE_BROWSEROS_CLAW_API_URL).toBeUndefined()
      expect(warnings).toEqual([
        'env: ignoring 1 process values that match root .env.development (Bun auto-load): VITE_BROWSEROS_CLAW_API_URL',
      ])
    } finally {
      console.warn = originalWarn
    }
  })

  it('passes process env through in CI when there are no root files to demote', async () => {
    const rootDir = await writeProdRoot({}, { envFile: false })
    process.env.VITE_BROWSEROS_CLAW_API_URL = 'http://127.0.0.1:9200'

    const config = loadBuildConfig(rootDir, testProduct(), { ci: true })

    expect(config.processEnv.VITE_BROWSEROS_CLAW_API_URL).toBe(
      'http://127.0.0.1:9200',
    )
  })

  async function writeProdRoot(
    env: Record<string, string>,
    options: { envFile?: boolean } = {},
  ): Promise<string> {
    tempRoot = await mkdtemp(join(tmpdir(), 'build-server-config-'))
    const packageDir = join(tempRoot, 'apps/test-server')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      '{"version":"0.0.0-test"}',
    )
    if (options.envFile !== false) {
      await writeFile(join(tempRoot, '.env.production'), formatEnv(env))
    }
    return tempRoot
  }
})

function formatEnv(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
}

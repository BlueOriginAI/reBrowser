import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadBuildConfig } from '@browseros/build-server-tools'

import { clawOnboardBuildProduct } from './descriptor'

describe('claw onboard build descriptor', () => {
  let tempRoot: string | null = null

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('loads without a production env file and reads the app version', async () => {
    const rootDir = await writeOnboardPackageRoot()

    const config = loadBuildConfig(rootDir, clawOnboardBuildProduct)

    expect(config.version).toBe('0.0.0-test')
  })

  it('forces production NODE_ENV over ambient env', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      const rootDir = await writeOnboardPackageRoot()

      const config = loadBuildConfig(rootDir, clawOnboardBuildProduct)

      expect(config.envVars.NODE_ENV).toBe('production')
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }
  })

  it('builds the chromium dist of the claw-onboard app', () => {
    expect(clawOnboardBuildProduct.packageDir).toBe('apps/claw-onboard')
    expect(clawOnboardBuildProduct.buildCommand).toEqual([
      'bun',
      'run',
      'build:chromium',
    ])
    expect(clawOnboardBuildProduct.assetsDir).toBe(
      'apps/claw-onboard/dist/chromium',
    )
    expect(clawOnboardBuildProduct.archiveBaseName).toBe(
      'browseros-claw-onboard-resources',
    )
  })

  async function writeOnboardPackageRoot(): Promise<string> {
    tempRoot = await mkdtemp(join(tmpdir(), 'claw-onboard-build-descriptor-'))
    const packageDir = join(tempRoot, 'apps/claw-onboard')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      '{"version":"0.0.0-test"}',
    )
    return tempRoot
  }
})

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadBuildConfig } from '@browseros/build-server-tools'

import { appOnboardBuildProduct } from './descriptor'

describe('app onboard build descriptor', () => {
  let tempRoot: string | null = null

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('loads without a production env file and reads the app version', async () => {
    const rootDir = await writeOnboardPackageRoot()

    const config = loadBuildConfig(rootDir, appOnboardBuildProduct)

    expect(config.version).toBe('0.0.0-test')
  })

  it('forces production NODE_ENV over ambient env', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      const rootDir = await writeOnboardPackageRoot()

      const config = loadBuildConfig(rootDir, appOnboardBuildProduct)

      expect(config.envVars.NODE_ENV).toBe('production')
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }
  })

  it('builds the chromium dist of the app-onboard app', () => {
    expect(appOnboardBuildProduct.packageDir).toBe('apps/app-onboard')
    expect(appOnboardBuildProduct.buildCommand).toEqual([
      'bun',
      'run',
      'build:chromium',
    ])
    expect(appOnboardBuildProduct.assetsDir).toBe(
      'apps/app-onboard/dist/chromium',
    )
    expect(appOnboardBuildProduct.archiveBaseName).toBe(
      'browseros-app-onboard-resources',
    )
  })

  async function writeOnboardPackageRoot(): Promise<string> {
    tempRoot = await mkdtemp(join(tmpdir(), 'app-onboard-build-descriptor-'))
    const packageDir = join(tempRoot, 'apps/app-onboard')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      '{"version":"0.0.0-test"}',
    )
    return tempRoot
  }
})

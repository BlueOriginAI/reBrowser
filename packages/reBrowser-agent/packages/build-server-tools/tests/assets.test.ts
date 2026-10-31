import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AssetBuildProductDescriptor,
  archiveAssetArtifact,
  stageAssetArtifact,
} from '../src'

function testAssetProduct(
  overrides: Partial<AssetBuildProductDescriptor> = {},
): AssetBuildProductDescriptor {
  return {
    label: 'Test onboarding',
    packageDir: 'apps/test-onboard',
    buildCommand: ['bun', 'run', 'build:chromium'],
    assetsDir: 'apps/test-onboard/dist/chromium',
    distRoot: 'dist/prod/test-onboard',
    archiveBaseName: 'test-onboard-resources',
    env: {
      requiredInlineEnvKeys: [],
      inlineEnvKeys: [],
    },
    ...overrides,
  }
}

describe('asset artifact staging and archiving', () => {
  let tempDir: string | null = null

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  async function writeAssetSource(root: string): Promise<void> {
    const assetsDir = join(root, 'apps/test-onboard/dist/chromium')
    await mkdir(join(assetsDir, 'icon'), { recursive: true })
    await writeFile(join(assetsDir, 'index.html'), '<html></html>')
    await writeFile(join(assetsDir, 'app.js'), 'console.log(1)')
    await writeFile(join(assetsDir, 'icon/32.png'), 'png-bytes')
  }

  it('stages the built assets under resources with universal metadata', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-assets-'))
    await writeAssetSource(tempDir)
    const product = testAssetProduct({ distRoot: join(tempDir, 'dist') })

    const artifact = await stageAssetArtifact(product, '0.1.2-test', tempDir)

    expect(artifact.rootDir).toBe(join(tempDir, 'dist', 'universal'))
    expect(
      await readFile(join(artifact.resourcesDir, 'index.html'), 'utf8'),
    ).toBe('<html></html>')
    expect(
      await readFile(join(artifact.resourcesDir, 'icon/32.png'), 'utf8'),
    ).toBe('png-bytes')

    const metadata = JSON.parse(await readFile(artifact.metadataPath, 'utf8'))
    expect(metadata.version).toBe('0.1.2-test')
    expect(metadata.target).toBe('universal')
    const paths = metadata.files.map((entry: { path: string }) => entry.path)
    expect(paths).toContain('resources/index.html')
    expect(paths).toContain('resources/icon/32.png')
    for (const entry of metadata.files) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(entry.size).toBeGreaterThanOrEqual(0)
    }
  })

  it('resolves a relative distRoot against the source root, not the cwd', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-assets-'))
    await writeAssetSource(tempDir)
    const product = testAssetProduct()

    const artifact = await stageAssetArtifact(product, '0.0.0-test', tempDir)

    expect(artifact.rootDir).toBe(
      join(tempDir, 'dist/prod/test-onboard', 'universal'),
    )
    const zipPath = await archiveAssetArtifact(artifact, product)
    expect(zipPath).toBe(
      join(tempDir, 'dist/prod/test-onboard', 'test-onboard-resources.zip'),
    )
  })

  it('rejects a missing assets directory naming the expected path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-assets-'))
    const product = testAssetProduct({ distRoot: join(tempDir, 'dist') })

    await expect(
      stageAssetArtifact(product, '0.0.0-test', tempDir),
    ).rejects.toThrow('apps/test-onboard/dist/chromium')
  })

  it('rejects an empty assets directory', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-assets-'))
    await mkdir(join(tempDir, 'apps/test-onboard/dist/chromium'), {
      recursive: true,
    })
    const product = testAssetProduct({ distRoot: join(tempDir, 'dist') })

    await expect(
      stageAssetArtifact(product, '0.0.0-test', tempDir),
    ).rejects.toThrow('empty')
  })

  it('creates byte-identical archives for the same source and version', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-assets-'))
    await writeAssetSource(tempDir)
    const product = testAssetProduct({ distRoot: join(tempDir, 'dist') })

    const firstArtifact = await stageAssetArtifact(
      product,
      '0.0.0-test',
      tempDir,
    )
    const zipPath = await archiveAssetArtifact(firstArtifact, product)
    const firstZip = await readFile(zipPath)
    const firstMetadata = await readFile(firstArtifact.metadataPath)

    const secondArtifact = await stageAssetArtifact(
      product,
      '0.0.0-test',
      tempDir,
    )
    await archiveAssetArtifact(secondArtifact, product)

    expect(await readFile(zipPath)).toEqual(firstZip)
    expect(await readFile(secondArtifact.metadataPath)).toEqual(firstMetadata)
  })
})

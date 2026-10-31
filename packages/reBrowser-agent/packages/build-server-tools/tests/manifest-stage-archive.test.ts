import { afterEach, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  archiveArtifacts,
  getTargetRules,
  loadManifest,
  type ResourceRule,
  stageCompiledArtifact,
  stagedBinaryName,
} from '../src'
import { testProduct, testTarget } from './helpers'

describe('resource manifest and artifact staging', () => {
  let tempDir: string | null = null

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('parses local and URL resource rules and treats missing filters as all-target', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const manifestPath = join(tempDir, 'manifest.json')
    await writeFile(
      manifestPath,
      JSON.stringify({
        resources: [
          {
            name: 'Migrations',
            source: { type: 'local', path: 'apps/test/drizzle' },
            destination: 'resources/db/migrations',
            recursive: true,
          },
          {
            name: 'Linux tool',
            source: {
              type: 'url',
              url: 'https://example.test/tool-linux-x64',
            },
            destination: 'resources/bin/tool',
            os: ['linux'],
            arch: ['x64'],
            executable: true,
          },
        ],
      }),
    )

    const manifest = loadManifest(manifestPath)

    expect(getTargetRules(manifest, testTarget('darwin-arm64'))).toEqual([
      expect.objectContaining({ name: 'Migrations' }),
    ])
    expect(getTargetRules(manifest, testTarget('linux-x64'))).toHaveLength(2)
  })

  it('rejects incomplete and invalid manifest rules', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const missingDestinationPath = join(tempDir, 'missing-destination.json')
    const invalidOsPath = join(tempDir, 'invalid-os.json')
    await writeFile(
      missingDestinationPath,
      JSON.stringify({
        resources: [
          {
            name: 'Bad rule',
            source: { type: 'local', path: 'apps/test/drizzle' },
          },
        ],
      }),
    )
    await writeFile(
      invalidOsPath,
      JSON.stringify({
        resources: [
          {
            name: 'Bad OS',
            source: { type: 'url', url: 'https://example.test/tool' },
            destination: 'resources/bin/tool',
            os: ['plan9'],
          },
        ],
      }),
    )

    expect(() => loadManifest(missingDestinationPath)).toThrow(
      'missing source path or destination',
    )
    expect(() => loadManifest(invalidOsPath)).toThrow('invalid os value')
  })

  it('stages the product binary with executable mode for non-Windows targets', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const distRoot = join(tempDir, 'dist')
    const binaryPath = join(tempDir, 'compiled')
    const product = testProduct({
      distRoot,
      stagedBinaryBaseName: 'browseros-claw-server',
    })
    const target = testTarget('darwin-arm64')
    await writeFile(binaryPath, 'server')

    const artifact = await stageCompiledArtifact(
      product,
      binaryPath,
      target,
      '0.0.0-test',
    )

    const stagedPath = join(artifact.resourcesDir, 'bin/browseros-claw-server')
    expect(stagedBinaryName(product, target)).toBe('browseros-claw-server')
    expect(await readFile(stagedPath, 'utf8')).toBe('server')
    expect((await stat(stagedPath)).mode & 0o111).not.toBe(0)
  })

  it('adds .exe to staged Windows binaries', async () => {
    const product = testProduct({
      stagedBinaryBaseName: 'browseros-claw-server',
    })

    expect(stagedBinaryName(product, testTarget('windows-x64'))).toBe(
      'browseros-claw-server.exe',
    )
  })

  it('writes opt-in release identity into artifact metadata', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const binaryPath = join(tempDir, 'compiled')
    const product = testProduct({ distRoot: join(tempDir, 'dist') })
    const releaseSha = 'a'.repeat(40)
    await writeFile(binaryPath, 'server')

    const artifact = await stageCompiledArtifact(
      product,
      binaryPath,
      testTarget(),
      '1.2.3',
      [],
      tempDir,
      {
        component: 'browseros-claw-server-rust-resources',
        releaseSha,
      },
    )

    const metadata = JSON.parse(await readFile(artifact.metadataPath, 'utf8'))
    expect(metadata).toMatchObject({
      component: 'browseros-claw-server-rust-resources',
      version: '1.2.3',
      target: 'darwin-arm64',
      releaseSha,
    })
  })

  it('copies recursive local resources without allowing destination escape', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const sourceRoot = join(tempDir, 'source')
    const distRoot = join(tempDir, 'dist')
    const binaryPath = join(tempDir, 'compiled')
    const migrationsDir = join(sourceRoot, 'apps/test/drizzle')
    const product = testProduct({ distRoot })
    await mkdir(join(migrationsDir, 'meta'), { recursive: true })
    await writeFile(binaryPath, 'server')
    await writeFile(join(migrationsDir, '0000_init.sql'), 'CREATE TABLE x;')
    await writeFile(
      join(migrationsDir, 'meta', '_journal.json'),
      '{"entries":[]}',
    )

    const artifact = await stageCompiledArtifact(
      product,
      binaryPath,
      testTarget(),
      '0.0.0-test',
      [migrationRule],
      sourceRoot,
    )

    expect(
      await readFile(
        join(artifact.resourcesDir, 'db/migrations/0000_init.sql'),
        'utf8',
      ),
    ).toBe('CREATE TABLE x;')
    await expect(
      stageCompiledArtifact(
        product,
        binaryPath,
        testTarget(),
        '0.0.0-test',
        [{ ...migrationRule, destination: '../escape' }],
        sourceRoot,
      ),
    ).rejects.toThrow('outside artifact root')
  })

  it('downloads URL resources and extracts a zip member with executable mode', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const sourceRoot = join(tempDir, 'source')
    const binaryPath = join(tempDir, 'compiled')
    const zipRoot = join(tempDir, 'zip')
    await mkdir(join(zipRoot, 'bun-darwin-arm64'), { recursive: true })
    await writeFile(join(zipRoot, 'bun-darwin-arm64/bun'), 'bun-binary')
    execFileSync('zip', ['-q', '-r', join(tempDir, 'bun.zip'), '.'], {
      cwd: zipRoot,
    })
    const zipBytes = await readFile(join(tempDir, 'bun.zip'))

    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(zipBytes)
      },
    })
    try {
      const product = testProduct({ distRoot: join(tempDir, 'dist') })
      await writeFile(binaryPath, 'server')
      const rule: ResourceRule = {
        name: 'Bun',
        source: {
          type: 'url',
          url: `http://127.0.0.1:${server.port}/bun.zip`,
          member: 'bun-darwin-arm64/bun',
        },
        destination: 'resources/bin/third_party/bun',
        executable: true,
      }

      const artifact = await stageCompiledArtifact(
        product,
        binaryPath,
        testTarget('darwin-arm64'),
        '0.0.0-test',
        [rule],
        sourceRoot,
      )

      const staged = join(artifact.resourcesDir, 'bin/third_party/bun')
      expect(await readFile(staged, 'utf8')).toBe('bun-binary')
      expect((await stat(staged)).mode & 0o111).not.toBe(0)
    } finally {
      server.stop(true)
    }
  })

  it('can archive only files for workflow-compatible member lists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-server-tools-'))
    const binaryPath = join(tempDir, 'compiled')
    const product = testProduct({ distRoot: join(tempDir, 'dist') })
    await writeFile(binaryPath, 'server')
    const artifact = await stageCompiledArtifact(
      product,
      binaryPath,
      testTarget(),
      '0.0.0-test',
    )

    const [result] = await archiveArtifacts(
      [artifact],
      product.archiveBaseName,
      { filesOnly: true },
    )
    if (!result) throw new Error('Missing archive result')
    const members = execFileSync('unzip', ['-Z1', result.zipPath], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')

    expect(members).toEqual([
      'artifact-metadata.json',
      'resources/bin/test_server',
    ])
  })
})

const migrationRule: ResourceRule = {
  name: 'Drizzle migrations',
  source: {
    type: 'local',
    path: 'apps/test/drizzle',
  },
  destination: 'resources/db/migrations',
  recursive: true,
}

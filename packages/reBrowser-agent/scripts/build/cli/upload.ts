import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { log } from '../log'

const DEFAULT_REPO = 'BlueOriginAI/reBrowser'
const FEED_TAG = 'feed-cli'
const CLI_ARCHIVE_PATTERN =
  /^browseros-cli_(?<version>[^_]+)_(?<os>darwin|linux|windows)_(?<arch>amd64|arm64)\.(?<ext>tar\.gz|zip)$/

const INSTALLERS = [
  {
    filePath: join('apps', 'cli', 'scripts', 'install.sh'),
    objectName: 'install.sh',
  },
  {
    filePath: join('apps', 'cli', 'scripts', 'install.ps1'),
    objectName: 'install.ps1',
  },
] as const

export interface CliReleaseOptions {
  version: string
  binariesDir: string
}

export interface CliReleaseAsset {
  filename: string
  url: string
  archive_format: 'tar.gz' | 'zip'
  sha256: string
}

export interface CliReleaseManifest {
  version: string
  published_at: string
  tag: string
  assets: Record<string, CliReleaseAsset>
}

export interface CliArchiveMetadata {
  filename: string
  version: string
  os: string
  arch: string
  archive_format: 'tar.gz' | 'zip'
}

export function resolveCliRepo(): string {
  return process.env.GITHUB_REPOSITORY || DEFAULT_REPO
}

export function cliReleaseAssetUrl(
  repo: string,
  tag: string,
  filename: string,
): string {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`
}

function resolveRootDir(): string {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  process.chdir(rootDir)
  return rootDir
}

export async function runCliInstallerUpload(): Promise<void> {
  await uploadCliInstallers(resolveRootDir())
}

export async function runCliRelease(options: CliReleaseOptions): Promise<void> {
  await uploadCliRelease(resolveRootDir(), options)
}

function gh(args: string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function releaseAssetNames(tag: string, repo: string): string[] | null {
  try {
    const document = JSON.parse(
      gh(['release', 'view', tag, '--repo', repo, '--json', 'assets']),
    ) as { assets?: Array<{ name?: string }> }
    return (document.assets ?? [])
      .map((asset) => asset.name)
      .filter((name): name is string => Boolean(name))
  } catch {
    return null
  }
}

function ensureRelease(tag: string, repo: string, title: string): void {
  if (releaseAssetNames(tag, repo) !== null) {
    return
  }
  gh([
    'release',
    'create',
    tag,
    '--repo',
    repo,
    '--title',
    title,
    '--notes',
    'Managed by the reBrowser release pipeline.',
    '--latest=false',
  ])
}

function uploadAsset(
  tag: string,
  repo: string,
  path: string,
  clobber = true,
): void {
  const args = ['release', 'upload', tag, path, '--repo', repo]
  if (clobber) {
    args.push('--clobber')
  }
  gh(args)
}

async function uploadCliInstallers(rootDir: string): Promise<void> {
  const repo = resolveCliRepo()
  log.header('Uploading BrowserOS CLI installer scripts')
  ensureRelease(FEED_TAG, repo, 'CLI installers and update feed')

  for (const installer of INSTALLERS) {
    const absolutePath = join(rootDir, installer.filePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Installer script not found: ${installer.filePath}`)
    }
    log.step(`Uploading ${installer.filePath}`)
    uploadAsset(FEED_TAG, repo, absolutePath)
    log.success(`Uploaded ${FEED_TAG}/${installer.objectName}`)
    log.info(cliReleaseAssetUrl(repo, FEED_TAG, installer.objectName))
  }

  log.done('CLI installer upload completed')
}

export function parseCliChecksums(contents: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (!match) {
      throw new Error(`Invalid checksum line: ${rawLine}`)
    }
    entries.set(match[2], match[1].toLowerCase())
  }
  return entries
}

export function parseCliArchiveFilename(
  filename: string,
): CliArchiveMetadata | null {
  const match = filename.match(CLI_ARCHIVE_PATTERN)
  if (!match?.groups) {
    return null
  }
  const archive_format = match.groups.ext as 'tar.gz' | 'zip'
  return {
    filename,
    version: match.groups.version,
    os: match.groups.os,
    arch: match.groups.arch,
    archive_format,
  }
}

export function buildCliReleaseManifest(options: {
  version: string
  filenames: string[]
  checksumsContent: string
  published_at?: string
  repo?: string
}): CliReleaseManifest {
  const checksumByFilename = parseCliChecksums(options.checksumsContent)
  const assets: Record<string, CliReleaseAsset> = {}
  const filenames = [...options.filenames].sort()
  const repo = options.repo ?? resolveCliRepo()
  const tag = `cli/v${options.version}`

  for (const filename of filenames) {
    const archive = parseCliArchiveFilename(filename)
    if (archive === null) {
      throw new Error(`Unexpected CLI archive filename: ${filename}`)
    }
    if (archive.version !== options.version) {
      throw new Error(
        `Archive ${filename} does not match release version ${options.version}`,
      )
    }

    const checksum = checksumByFilename.get(filename)
    if (!checksum) {
      throw new Error(`Missing checksum for ${filename}`)
    }

    const assetKey = `${archive.os}/${archive.arch}`
    assets[assetKey] = {
      filename,
      url: cliReleaseAssetUrl(repo, tag, filename),
      archive_format: archive.archive_format,
      sha256: checksum,
    }
  }

  return {
    version: options.version,
    published_at: options.published_at ?? new Date().toISOString(),
    tag,
    assets,
  }
}

async function uploadCliRelease(
  rootDir: string,
  options: CliReleaseOptions,
): Promise<void> {
  const { version, binariesDir } = options
  const absoluteBinariesDir = resolve(rootDir, binariesDir)

  if (!existsSync(absoluteBinariesDir)) {
    throw new Error(`Binaries directory not found: ${binariesDir}`)
  }

  const files = readdirSync(absoluteBinariesDir).filter(
    (f) => f.endsWith('.tar.gz') || f.endsWith('.zip') || f === 'checksums.txt',
  )
  if (files.length === 0) {
    throw new Error(`No archives found in ${binariesDir}`)
  }
  const releaseArchives = files.filter((f) => f !== 'checksums.txt')

  const repo = resolveCliRepo()
  const tag = `cli/v${version}`

  log.header(`Uploading BrowserOS CLI v${version} release`)
  ensureRelease(tag, repo, `BrowserOS CLI v${version}`)

  for (const filename of files) {
    const filePath = join(absoluteBinariesDir, filename)
    log.step(`Uploading ${filename}`)
    uploadAsset(tag, repo, filePath)
    log.success(`Uploaded ${filename}`)
    log.info(cliReleaseAssetUrl(repo, tag, filename))
  }

  const checksumsPath = join(absoluteBinariesDir, 'checksums.txt')
  if (!existsSync(checksumsPath)) {
    throw new Error('checksums.txt is required to build CLI manifest')
  }
  const manifest = buildCliReleaseManifest({
    version,
    filenames: releaseArchives,
    checksumsContent: readFileSync(checksumsPath, 'utf-8'),
    repo,
  })
  const manifestPath = join(tmpdir(), `browseros-cli-manifest-${version}.json`)
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf-8',
  )

  log.step('Uploading manifest.json')
  uploadAsset(tag, repo, manifestPath)
  uploadAsset(FEED_TAG, repo, manifestPath)
  log.success(`Published ${FEED_TAG}/manifest.json`)

  const versionTxtPath = join(tmpdir(), 'browseros-cli-version.txt')
  await writeFile(versionTxtPath, version, 'utf-8')
  uploadAsset(FEED_TAG, repo, versionTxtPath)
  log.success(`Published ${FEED_TAG}/version.txt`)

  await uploadCliInstallers(rootDir)
  log.done('CLI binary upload completed')
}

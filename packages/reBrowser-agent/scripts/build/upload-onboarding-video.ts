#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { log } from './log'

const PACKAGE_DIR = join('packages', 'onboarding-video')
const OUT_DIR = join(PACKAGE_DIR, 'out')
const VERSIONED_TAG_PREFIX = 'onboarding/v'
const FEED_TAG = 'feed-onboarding'

const ONBOARDING_VIDEO_ASSETS = [
  {
    filename: 'first-run-demo.mp4',
    contentType: 'video/mp4',
    renderCommand: 'bun run --cwd packages/onboarding-video render',
  },
  {
    filename: 'first-run-demo-poster.png',
    contentType: 'image/png',
    renderCommand: 'bun run --cwd packages/onboarding-video render:poster',
  },
] as const

export interface OnboardingVideoUploadOptions {
  dryRun?: boolean
  force?: boolean
}

export interface OnboardingVideoAssetPlan {
  filename: string
  relativePath: string
  absolutePath: string
  contentType: string
  tag: string
  url: string
  feedUrl: string
  renderCommand: string
}

export interface OnboardingVideoUploadPlan {
  version: string
  tag: string
  assets: OnboardingVideoAssetPlan[]
}

function resolveRootDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

function resolveRepo(): string {
  return process.env.GITHUB_REPOSITORY || 'BlueOriginAI/reBrowser'
}

export function releaseAssetUrl(
  repo: string,
  tag: string,
  filename: string,
): string {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`
}

function readPackageVersion(rootDir: string): string {
  const packagePath = join(rootDir, PACKAGE_DIR, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
    version?: string
  }
  if (!pkg.version) {
    throw new Error(`${PACKAGE_DIR}/package.json is missing a version`)
  }
  return pkg.version
}

/** Builds the versioned and stable GitHub release URLs for one onboarding video. */
export function buildOnboardingVideoUploadPlan(
  rootDir: string,
): OnboardingVideoUploadPlan {
  const version = readPackageVersion(rootDir)
  const tag = `${VERSIONED_TAG_PREFIX}${version}`
  const repo = resolveRepo()
  const assets = ONBOARDING_VIDEO_ASSETS.map((asset) => {
    const relativePath = join(OUT_DIR, asset.filename)
    return {
      filename: asset.filename,
      relativePath,
      absolutePath: join(rootDir, relativePath),
      contentType: asset.contentType,
      tag,
      url: releaseAssetUrl(repo, tag, asset.filename),
      feedUrl: releaseAssetUrl(repo, FEED_TAG, asset.filename),
      renderCommand: asset.renderCommand,
    }
  })

  return { version, tag, assets }
}

export function validateOnboardingVideoInputs(
  plan: OnboardingVideoUploadPlan,
): void {
  const missingAssets = plan.assets.filter(
    (asset) => !existsSync(asset.absolutePath),
  )
  if (missingAssets.length === 0) {
    return
  }

  const renderCommands = [
    ...new Set(missingAssets.map((asset) => asset.renderCommand)),
  ]
  throw new Error(
    [
      'Missing onboarding video render output:',
      ...missingAssets.map((asset) => `- ${asset.relativePath}`),
      '',
      'Render the missing assets first:',
      ...renderCommands.map((command) => `  ${command}`),
    ].join('\n'),
  )
}

export function parseOnboardingVideoUploadArgs(
  argv: string[],
): OnboardingVideoUploadOptions {
  const options: OnboardingVideoUploadOptions = {}
  for (const arg of argv) {
    if (arg === '--') {
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
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
  clobber: boolean,
): void {
  const args = ['release', 'upload', tag, path, '--repo', repo]
  if (clobber) {
    args.push('--clobber')
  }
  gh(args)
}

function printPlan(plan: OnboardingVideoUploadPlan): void {
  for (const asset of plan.assets) {
    log.info(asset.tag)
    log.info(asset.url)
    log.info(asset.feedUrl)
  }
}

/** Uploads the onboarding video to its versioned release and the live feed. */
export async function runOnboardingVideoUpload(
  rootDir: string,
  options: OnboardingVideoUploadOptions = {},
): Promise<void> {
  const plan = buildOnboardingVideoUploadPlan(rootDir)
  validateOnboardingVideoInputs(plan)
  const repo = resolveRepo()

  log.header(`BrowserClaw onboarding video v${plan.version}`)
  printPlan(plan)

  if (options.dryRun) {
    log.done('Onboarding video upload dry run completed')
    return
  }

  if (!options.force) {
    const existing = releaseAssetNames(plan.tag, repo)
    if (existing !== null && existing.length > 0) {
      throw new Error(
        [
          `Release ${plan.tag} already has assets:`,
          ...existing.map((name) => `- ${name}`),
          '',
          'Please bump the package version in packages/onboarding-video/package.json, or rerun with --force to overwrite intentionally.',
        ].join('\n'),
      )
    }
  } else {
    log.warn('Skipping existing-asset guard because --force was supplied')
  }

  ensureRelease(plan.tag, repo, `Onboarding video v${plan.version}`)
  for (const asset of plan.assets) {
    log.step(`Uploading ${asset.relativePath}`)
    uploadAsset(plan.tag, repo, asset.absolutePath, options.force === true)
    log.success(`Uploaded ${asset.tag}/${asset.filename}`)
    log.info(asset.url)
  }

  ensureRelease(FEED_TAG, repo, 'Onboarding media feed')
  for (const asset of plan.assets) {
    uploadAsset(FEED_TAG, repo, asset.absolutePath, true)
    log.success(`Published ${FEED_TAG}/${asset.filename}`)
    log.info(asset.feedUrl)
  }

  log.done('Onboarding video upload completed')
}

async function main(): Promise<void> {
  const rootDir = resolveRootDir()
  const options = parseOnboardingVideoUploadArgs(process.argv.slice(2))
  await runOnboardingVideoUpload(rootDir, options)
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n✗ ${message}\n`)
    process.exit(1)
  })
}

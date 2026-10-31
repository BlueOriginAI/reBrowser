import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { archiveArtifacts } from './archive'
import { parseBuildArgs } from './cli'
import { compileProductBinaries } from './compile'
import { loadBuildConfig } from './config'
import { log } from './log'
import { getTargetRules, loadManifest } from './manifest'
import { stageTargetArtifact } from './stage'
import type {
  ArtifactMetadataIdentity,
  BuildProductDescriptor,
  ProductCompiler,
  ResourceBuildProductDescriptor,
  StagedArtifact,
  UploadResult,
} from './types'

function buildModeLabel(ci: boolean): string {
  return ci ? 'ci' : 'full'
}

function currentReleaseSha(rootDir: string): string {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim()
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      throw new Error(`git rev-parse HEAD returned ${sha}`)
    }
    return sha.toLowerCase()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not resolve artifact release SHA: ${message}`)
  }
}

function resolveReleaseContext(
  product: ResourceBuildProductDescriptor,
  rootDir: string,
): {
  releaseSha?: string
  artifactIdentity?: ArtifactMetadataIdentity
} {
  const releaseShaValue = process.env.RELEASE_SHA?.trim()
  const releaseSha = releaseShaValue ? releaseShaValue.toLowerCase() : undefined
  if (releaseSha && !/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error('RELEASE_SHA must be a full 40-character git SHA')
  }
  if (!product.includeArtifactIdentity) {
    return { releaseSha }
  }
  const checkoutReleaseSha = currentReleaseSha(rootDir)
  if (releaseSha && releaseSha !== checkoutReleaseSha) {
    throw new Error(
      `RELEASE_SHA ${releaseSha} does not match checkout HEAD ${checkoutReleaseSha}`,
    )
  }
  return {
    releaseSha,
    artifactIdentity: {
      component: product.archiveBaseName,
      releaseSha: checkoutReleaseSha,
    },
  }
}

export async function runCompiledResourceBuild<
  TProduct extends ResourceBuildProductDescriptor,
>(
  product: TProduct,
  compiler: ProductCompiler<TProduct>,
  argv: string[],
  options: { rootDir?: string } = {},
): Promise<void> {
  const rootDir = options.rootDir ?? resolve(import.meta.dir, '../../..')
  process.chdir(rootDir)

  const args = parseBuildArgs(argv, product)
  const manifestPath = resolve(rootDir, args.manifestPath)
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`)
  }
  const manifest = loadManifest(manifestPath)
  const buildConfig = loadBuildConfig(rootDir, product, { ci: args.ci })
  const { artifactIdentity } = resolveReleaseContext(product, rootDir)

  log.header(`Building ${product.label} artifacts v${buildConfig.version}`)
  log.info(`Targets: ${args.targets.map((target) => target.id).join(', ')}`)
  log.info(`Mode: ${buildModeLabel(args.ci)}`)

  const compiled = await compiler(
    product,
    args.targets,
    buildConfig.envVars,
    buildConfig.processEnv,
    buildConfig.version,
    args.ci ? { ci: true } : undefined,
  )

  const stagedArtifacts: StagedArtifact[] = []
  for (const binary of compiled) {
    const rules = getTargetRules(manifest, binary.target)
    log.step(`Staging ${binary.target.name} (${rules.length} resource rule(s))`)
    stagedArtifacts.push(
      await stageTargetArtifact(
        product,
        binary.binaryPath,
        binary.target,
        rules,
        rootDir,
        buildConfig.version,
        artifactIdentity,
      ),
    )
    log.success(`Staged ${binary.target.id}`)
  }

  const results: UploadResult[] = await archiveArtifacts(
    stagedArtifacts,
    product.archiveBaseName,
    { filesOnly: product.archiveFilesOnly },
  )

  log.done(`Production ${product.label} artifacts completed`)
  for (const result of results) {
    log.info(`${result.targetId}: ${result.zipPath}`)
  }
}

export async function runProdResourceBuild(
  product: BuildProductDescriptor,
  argv: string[],
  options: { rootDir?: string } = {},
): Promise<void> {
  return runCompiledResourceBuild(
    product,
    compileProductBinaries,
    argv,
    options,
  )
}

import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { zipDirectory } from './archive'
import { parseAssetBuildArgs } from './cli'
import { runCommand } from './command'
import { loadBuildConfig } from './config'
import { log } from './log'
import { writeArtifactMetadata } from './metadata'
import type { AssetBuildProductDescriptor, StagedAssetArtifact } from './types'

export const ASSET_TARGET_ID = 'universal'

export async function stageAssetArtifact(
  product: AssetBuildProductDescriptor,
  version: string,
  sourceRoot = process.cwd(),
): Promise<StagedAssetArtifact> {
  const assetsPath = isAbsolute(product.assetsDir)
    ? product.assetsDir
    : resolve(sourceRoot, product.assetsDir)
  if (!existsSync(assetsPath)) {
    throw new Error(`Built assets directory not found: ${product.assetsDir}`)
  }
  const entries = await readdir(assetsPath)
  if (entries.length === 0) {
    throw new Error(`Built assets directory is empty: ${product.assetsDir}`)
  }

  const distRoot = isAbsolute(product.distRoot)
    ? product.distRoot
    : resolve(sourceRoot, product.distRoot)
  const rootDir = join(distRoot, ASSET_TARGET_ID)
  const resourcesDir = join(rootDir, 'resources')
  await rm(rootDir, { recursive: true, force: true })
  await mkdir(rootDir, { recursive: true })
  await cp(assetsPath, resourcesDir, { recursive: true })
  const metadataPath = await writeArtifactMetadata(
    rootDir,
    ASSET_TARGET_ID,
    version,
  )

  return { rootDir, resourcesDir, metadataPath }
}

export async function archiveAssetArtifact(
  artifact: StagedAssetArtifact,
  product: AssetBuildProductDescriptor,
): Promise<string> {
  const zipPath = join(
    dirname(artifact.rootDir),
    `${product.archiveBaseName}.zip`,
  )
  await zipDirectory(artifact.rootDir, zipPath)
  return zipPath
}

export async function runProdAssetBuild(
  product: AssetBuildProductDescriptor,
  argv: string[],
  options: { rootDir?: string } = {},
): Promise<void> {
  const rootDir = options.rootDir ?? resolve(import.meta.dir, '../../..')
  process.chdir(rootDir)

  const args = parseAssetBuildArgs(argv, product)
  const buildConfig = loadBuildConfig(rootDir, product, { ci: args.ci })

  log.header(`Building ${product.label} artifacts v${buildConfig.version}`)
  log.info(`Mode: ${args.ci ? 'ci' : 'full'}`)

  const [command, ...commandArgs] = product.buildCommand
  if (!command) {
    throw new Error(`Missing build command for ${product.label}`)
  }
  log.step(`Running ${product.buildCommand.join(' ')}`)
  // Inline descriptor values must override ambient test/development values.
  await runCommand(
    command,
    commandArgs,
    { ...buildConfig.processEnv, ...buildConfig.envVars },
    join(rootDir, product.packageDir),
  )

  log.step('Staging assets')
  const artifact = await stageAssetArtifact(
    product,
    buildConfig.version,
    rootDir,
  )
  const builtZipPath = await archiveAssetArtifact(artifact, product)

  log.done(`Production ${product.label} artifacts completed`)
  log.info(`${ASSET_TARGET_ID}: ${builtZipPath}`)
}

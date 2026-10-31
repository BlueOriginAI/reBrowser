import { Command } from 'commander'

import { resolveTargets } from './targets'
import type {
  AssetBuildArgs,
  AssetBuildProductDescriptor,
  BuildArgs,
  ResourceBuildProductDescriptor,
} from './types'

export function parseBuildArgs(
  argv: string[],
  product: ResourceBuildProductDescriptor,
): BuildArgs {
  const program = new Command()
  program
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .exitOverride((error) => {
      throw new Error(error.message)
    })
    .option('--target <targets>', 'Build target ids or "all"', 'all')
    .option(
      '--manifest <path>',
      'Resource manifest path',
      product.defaultManifestPath,
    )
    .option(
      '--ci',
      'Build local release zip artifacts without requiring production env secrets',
    )
  program.parse(argv, { from: 'user' })
  const options = program.opts<{
    target: string
    manifest: string
    ci: boolean
  }>()

  return {
    targets: resolveTargets(options.target),
    manifestPath: options.manifest,
    ci: options.ci ?? false,
  }
}

export function parseAssetBuildArgs(
  argv: string[],
  _product?: AssetBuildProductDescriptor,
): AssetBuildArgs {
  const program = new Command()
  program
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .exitOverride((error) => {
      throw new Error(error.message)
    })
    .option(
      '--ci',
      'Build the local release zip artifact without requiring production env secrets',
    )
  program.parse(argv, { from: 'user' })
  const options = program.opts<{ ci?: boolean }>()

  return { ci: options.ci ?? false }
}

import type { BunPlugin } from 'bun'

export type TargetId =
  | 'linux-x64'
  | 'linux-arm64'
  | 'windows-x64'
  | 'darwin-arm64'
  | 'darwin-x64'

export type TargetOs = 'linux' | 'macos' | 'windows'
export type TargetArch = 'x64' | 'arm64'

export interface BuildTarget {
  id: TargetId
  name: string
  os: TargetOs
  arch: TargetArch
  bunTarget: string
}

export interface BuildArgs {
  targets: BuildTarget[]
  manifestPath: string
  ci: boolean
}

export interface BuildEnvSpec {
  requiredInlineEnvKeys: readonly string[]
  inlineEnvKeys: readonly string[]
  ciInlineEnvDefaults?: Record<string, string>
  ciInlineEnvOverrides?: Record<string, string>
  inlineEnvOverrides?: Record<string, string>
}

export interface BundleOptions {
  external?: readonly string[]
  plugins?: BunPlugin[]
}

export interface ProductBuildSpec {
  label: string
  packageDir: string
  env: BuildEnvSpec
  versionSource?: ProductVersionSource
}

export type ProductVersionSource =
  | { type: 'package-json'; path: string }
  | { type: 'cargo-toml'; path: string }

export interface ResourceBuildProductDescriptor extends ProductBuildSpec {
  distRoot: string
  stagedBinaryBaseName: string
  archiveBaseName: string
  defaultManifestPath: string
  includeArtifactIdentity?: boolean
  archiveFilesOnly?: boolean
  expectedArtifactFiles?: (target: BuildTarget) => readonly string[]
}

export interface BuildProductDescriptor extends ResourceBuildProductDescriptor {
  entrypoint: string
  rawBinaryBaseName: string
  bundle?: BundleOptions
}

export interface AssetBuildProductDescriptor extends ProductBuildSpec {
  buildCommand: readonly string[]
  assetsDir: string
  distRoot: string
  archiveBaseName: string
}

export interface AssetBuildArgs {
  ci: boolean
}

export interface StagedAssetArtifact {
  rootDir: string
  resourcesDir: string
  metadataPath: string
}

export interface BuildConfig {
  version: string
  envVars: Record<string, string>
  processEnv: NodeJS.ProcessEnv
}

export interface UrlResourceSource {
  type: 'url'
  url: string
  /** Zip member to extract when the URL points at an archive. */
  member?: string
}

export interface LocalResourceSource {
  type: 'local'
  path: string
}

export type ResourceSource = UrlResourceSource | LocalResourceSource

export interface ResourceRule {
  name: string
  source: ResourceSource
  destination: string
  executable?: boolean
  recursive?: boolean
  os?: TargetOs[]
  arch?: TargetArch[]
}

export interface ResourceManifest {
  resources: ResourceRule[]
}

export interface CompiledServerBinary {
  target: BuildTarget
  binaryPath: string
}

export type ProductCompiler<
  TProduct extends
    ResourceBuildProductDescriptor = ResourceBuildProductDescriptor,
> = (
  product: TProduct,
  targets: BuildTarget[],
  envVars: Record<string, string>,
  processEnv: NodeJS.ProcessEnv,
  version: string,
  options?: { ci?: boolean },
) => Promise<CompiledServerBinary[]>

export interface ArtifactMetadataIdentity {
  component: string
  releaseSha: string
}

export interface StagedArtifact {
  target: BuildTarget
  rootDir: string
  resourcesDir: string
  metadataPath: string
}

export interface UploadResult {
  targetId: TargetId
  zipPath: string
}

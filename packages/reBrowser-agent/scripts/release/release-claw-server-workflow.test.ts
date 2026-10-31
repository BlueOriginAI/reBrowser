import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/release-claw-server.yml'),
  'utf8',
)
const dollar = '$'

function section(start: string, end?: string): string {
  const startIndex = workflow.indexOf(start)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  const endIndex = end ? workflow.indexOf(end, startIndex + start.length) : -1
  if (end) expect(endIndex).toBeGreaterThan(startIndex)
  return workflow.slice(startIndex, endIndex === -1 ? undefined : endIndex)
}

describe('release-claw-server workflow', () => {
  it('exposes the reusable build/finalize interface and outputs', () => {
    const call = section('  workflow_call:', '\npermissions:')
    const publishOta = call.slice(
      call.indexOf('      publish_ota:'),
      call.indexOf('    outputs:'),
    )
    expect(call).toContain('mode:')
    expect(call).toContain('default: "build"')
    expect(call).toContain('defer_finalize:')
    expect(call).toContain('default: false')
    expect(call).toContain('publish_ota:')
    expect(publishOta).toContain('default: false')
    expect(call).toContain(`value: ${dollar}{{ jobs.prepare.outputs.version }}`)
    expect(call).toContain(`value: ${dollar}{{ jobs.prepare.outputs.tag }}`)
    expect(call).toContain(
      `value: ${dollar}{{ jobs.prepare.outputs.release_sha }}`,
    )
  })

  it('reserves only a draft before tests and builds', () => {
    const prepare = section('  prepare:', '  cargo-test:')
    expect(prepare).toContain('browseros release component resolve')
    expect(prepare).toContain('--component claw-server-rust')
    expect(prepare).not.toContain('prepare-claw-server-rust-release.sh')
    expect(prepare).toContain('--draft')
    expect(prepare).not.toContain('git tag -a')
    expect(prepare).not.toContain('--draft=false')
    expect(workflow.indexOf('  cargo-test:')).toBeGreaterThan(
      workflow.indexOf('  prepare:'),
    )
  })

  it('checks public allocations under the component lock before mutations', () => {
    const prepare = section('  prepare:', '  cargo-test:')
    expect(workflow).toContain('group: release-claw-server-rust')
    expect(prepare.indexOf('Setup uv')).toBeLessThan(
      prepare.indexOf('Resolve release'),
    )
    expect(prepare.indexOf('Resolve release')).toBeLessThan(
      prepare.indexOf('Reserve private draft'),
    )
  })

  it('tests and builds all five shipped targets', () => {
    expect(workflow).toContain('cargo test --workspace --locked')
    expect(workflow).toContain('cargo test --locked -p harness-integrations')
    const targets = {
      'darwin-arm64': 'aarch64-apple-darwin',
      'darwin-x64': 'x86_64-apple-darwin',
      'linux-arm64': 'aarch64-unknown-linux-gnu',
      'linux-x64': 'x86_64-unknown-linux-gnu',
      'windows-x64': 'x86_64-pc-windows-msvc',
    }
    for (const [target, rustTarget] of Object.entries(targets)) {
      expect(workflow).toContain(`target: ${target}`)
      expect(workflow).toContain(`rust_target: ${rustTarget}`)
    }
    expect(workflow).toContain('CLAW_POSTHOG_KEY is required')
    expect(workflow).toContain('Verify stamped binary version')
    expect(workflow).toContain(
      'browseros release component stamp --component claw-server-rust',
    )
  })

  it('attaches every versioned draft asset without an object store', () => {
    const publish = section('  publish-versioned:', '  finalize:')
    expect(publish).not.toContain('boto3')
    expect(publish).not.toContain('IfNoneMatch')
    expect(publish).toContain('Expected 5 BrowserClaw server resource zips')
    expect(publish).toContain(
      `gh release upload "$RELEASE_TAG" "${dollar}{assets[@]}" --clobber`,
    )
    expect(publish).toContain(`GH_REPO: ${dollar}{{ github.repository }}`)
    expect(publish).not.toContain('--verify-tag')
  })

  it('builds every target without recovering from an object store', () => {
    const build = section('  build:', '  publish-versioned:')
    expect(build).not.toContain('Recover existing immutable target')
    expect(build).not.toContain('boto3')
    expect(build).toContain('steps.package.outputs.zip_path')
    expect(build).not.toContain('steps.recover.outputs.zip_path')
  })

  it('publishes the live alias before publishing the draft', () => {
    const finalize = section('  finalize:', '  publish-ota:')
    expect(finalize).not.toContain('aws s3api')
    expect(finalize).not.toContain('boto3')
    expect(finalize).toContain('Expected 5 draft assets')
    expect(finalize).toContain('scripts/ci/component_manifest.py')
    expect(finalize).toContain('component-manifest.json')
    expect(finalize).toContain('gh release download "$RELEASE_TAG"')
    expect(finalize).toContain(
      `gh release upload "$ALIAS_TAG" "${dollar}{assets[@]}" --clobber`,
    )
    const verifyIndex = finalize.indexOf('Verify prepared release')
    const tagIndex = finalize.indexOf('git tag -a "$RELEASE_TAG"')
    const publishIndex = finalize.indexOf('--draft=false')
    const latestIndex = finalize.indexOf('Publish live component resources')
    expect(tagIndex).toBeGreaterThan(verifyIndex)
    expect(latestIndex).toBeGreaterThan(tagIndex)
    expect(publishIndex).toBeGreaterThan(latestIndex)
  })

  it('packages the canonical BrowserOS skill', () => {
    const build = section('  build:', '  publish-versioned:')
    expect(build).toContain(
      'source_skill = agent / "resources/skills/browserclaw/SKILL.md"',
    )
    expect(build).toContain('shutil.copy2(source_skill, staged_skill)')
    expect(build).toContain('"resources/skills/browserclaw/SKILL.md"')
  })

  it('gates OTA publication on successful finalization', () => {
    const ota = section('  publish-ota:', '  reflect-version:')
    expect(ota).toContain('- finalize')
    expect(ota).toContain("github.event_name != 'push'")
    expect(ota).toContain('inputs.publish_ota == true')
    expect(ota).toContain('pull-requests: write')
    expect(ota).toContain('uses: ./.github/workflows/publish-server-ota.yml')
    expect(ota).toContain('product: browserclaw')
    expect(ota).toContain(
      `version: ${dollar}{{ needs.prepare.outputs.version }}`,
    )
    expect(ota).toContain(
      `release_sha: ${dollar}{{ needs.prepare.outputs.release_sha }}`,
    )
    expect(ota).toContain('secrets: inherit')
  })

  it('publishes and persists standalone alpha releases by default', () => {
    const dispatch = section('  workflow_dispatch:', '  workflow_call:')
    const ota = section('  publish-ota:', '  reflect-version:')
    expect(dispatch).toContain('publish_ota:')
    expect(dispatch).toContain('default: true')
    expect(ota).toContain('updates/server/appcast-claw-server.alpha.xml')
    expect(ota).not.toContain('updates/server/appcast-server.alpha.xml')
  })

  it('reflects the version only after finalization', () => {
    const reflection = section('  reflect-version:')
    expect(reflection).toContain('- finalize')
    expect(reflection).toContain('apps/claw-server-rust/Cargo.toml')
    expect(reflection).toContain('Cargo.lock')
    expect(reflection).toContain('git config user.name "github-actions[bot]"')
    expect(reflection).toContain('gh pr create')
    expect(reflection).toContain('merge-release-pr.sh')
    expect(reflection).toContain('headRefOid')
    expect(reflection).not.toContain('--squash --auto')
  })
})

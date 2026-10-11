import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SERVER_BUNDLE_ENTRYPOINT } from './descriptor'

const nativeAddonGuardPath = join(
  process.cwd(),
  'apps/server/src/lib/native-addon-guard.ts',
)

describe('compiled server native addon policy', () => {
  let tempDir: string | null = null

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('bundles the compiled bootstrap entrypoint', () => {
    expect(SERVER_BUNDLE_ENTRYPOINT).toBe(
      'apps/server/src/compiled-bootstrap.ts',
    )
  })

  it('installs the native-addon guard idempotently', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'browseros-native-addon-policy-'))
    const sourcePath = join(tempDir, 'idempotent.ts')
    await writeFile(
      sourcePath,
      [
        `import { installNativeAddonGuard } from ${JSON.stringify(nativeAddonGuardPath)}`,
        'installNativeAddonGuard()',
        'const guarded = process.dlopen',
        'installNativeAddonGuard()',
        'console.log(String(process.dlopen === guarded))',
      ].join('\n'),
    )

    const result = await collectProcess(
      Bun.spawn(['bun', sourcePath], {
        stdout: 'pipe',
        stderr: 'pipe',
      }),
    )

    expect(result).toMatchObject({ exitCode: 0, stdout: 'true\n' })
  })

  it('prevents Bun from opening hidden temp native addons', async () => {
    if (process.platform !== 'darwin') return

    tempDir = await mkdtemp(join(tmpdir(), 'browseros-native-addon-policy-'))
    const sourcePath = join(tempDir, 'app.js')
    const addonPath = join(tempDir, 'addon.node')
    const binaryPath = join(tempDir, 'app')
    const runTmpDir = join(tempDir, 'tmp')

    await writeFile(addonPath, 'not a native addon')
    await writeFile(
      sourcePath,
      [
        `import { installNativeAddonGuard } from ${JSON.stringify(nativeAddonGuardPath)}`,
        'installNativeAddonGuard()',
        'try {',
        '  require("./addon.node")',
        '} catch (error) {',
        '  console.error(error?.message ?? String(error))',
        '  setInterval(() => {}, 1000)',
        '}',
      ].join('\n'),
    )

    const build = Bun.spawn(
      ['bun', 'build', '--compile', sourcePath, '--outfile', binaryPath],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const buildResult = await collectProcess(build)
    expect(buildResult).toMatchObject({ exitCode: 0 })

    await rm(sourcePath)
    await rm(addonPath)
    await mkdir(runTmpDir)

    const app = Bun.spawn([binaryPath], {
      env: {
        ...process.env,
        BUN_TMPDIR: runTmpDir,
        TMPDIR: runTmpDir,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const guardMessage =
      'BrowserOS server disables native addon loading in compiled production builds'
    let markReady!: () => void
    const ready = new Promise<void>((resolve) => {
      markReady = resolve
    })
    const appResultPromise = collectProcess(app, (stderr) => {
      if (stderr.includes(guardMessage)) markReady()
    })
    let timeout: ReturnType<typeof setTimeout> | undefined
    let openFiles: Awaited<ReturnType<typeof collectProcess>> | undefined
    try {
      await Promise.race([
        ready,
        app.exited.then((code) => {
          throw new Error(
            `Compiled policy process exited before readiness: ${code}`,
          )
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error('Compiled policy process did not report readiness'),
              ),
            10000,
          )
        }),
      ])
      openFiles = await collectProcess(
        Bun.spawn(['lsof', '-p', String(app.pid)], {
          stdout: 'pipe',
          stderr: 'pipe',
        }),
      )
    } finally {
      clearTimeout(timeout)
      app.kill()
      await appResultPromise
    }
    const appResult = await appResultPromise

    expect(appResult.stderr).toContain(guardMessage)
    expect(await listFiles(runTmpDir)).toEqual([])
    expect(openFiles?.stdout).not.toContain('.node')
  }, 15000)
})

interface CollectableProcess {
  stdout: ReadableStream
  stderr: ReadableStream
  exited: Promise<number>
}

async function collectProcess(
  process: CollectableProcess,
  onStderr?: (text: string) => void,
) {
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    onStderr
      ? readProcessStderr(process.stderr, onStderr)
      : new Response(process.stderr).text(),
    process.exited,
  ])

  return { stdout, stderr, exitCode }
}

async function readProcessStderr(
  stream: ReadableStream,
  onText: (text: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      onText(text)
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true })
  return entries.map(String).sort()
}

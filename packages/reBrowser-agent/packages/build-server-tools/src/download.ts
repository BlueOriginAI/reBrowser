import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const MAX_MEMBER_BYTES = 512 * 1024 * 1024

export interface DownloadUrlOptions {
  /** Zip member to extract when the URL points at an archive. */
  member?: string
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/** Download one public URL, optionally extracting a zip member. */
export async function downloadUrlToFile(
  url: string,
  destinationPath: string,
  options: DownloadUrlOptions = {},
): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true })
  if (!options.member) {
    await writeFile(destinationPath, await fetchBytes(url))
    return
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'resource-'))
  try {
    const archivePath = join(tempDir, 'archive.zip')
    await writeFile(archivePath, await fetchBytes(url))
    const bytes = execFileSync('unzip', ['-p', archivePath, options.member], {
      maxBuffer: MAX_MEMBER_BYTES,
    })
    await writeFile(destinationPath, bytes)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile, link } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { LocalProjectError } from '../local-projects/store.ts'
const unavailable = () => new LocalProjectError('storage_unavailable', 'Account service storage is unavailable.', 503)
export class PrivateFiles {
  readonly root: string
  private pending: Promise<void> = Promise.resolve()
  constructor(root: string) { this.root = resolve(root) }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.pending
    let release = () => {}
    this.pending = new Promise<void>(resolve => { release = resolve })
    await previous
    try { return await operation() } finally { release() }
  }
  private async folder(parts: string[]) {
    let path = this.root
    await mkdir(path, { recursive: true, mode: 0o700 })
    const root = await lstat(path)
    if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077)) throw unavailable()
    for (const part of parts) {
      if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw unavailable()
      path = join(path, part)
      await mkdir(path, { recursive: true, mode: 0o700 })
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw unavailable()
    }
    return path
  }
  private name(name: string) { if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..') throw unavailable(); return name }
  async read(parts: string[], name: string): Promise<unknown | undefined> {
    try {
      const file = join(await this.folder(parts), this.name(name)), info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024 || (info.mode & 0o077)) throw unavailable()
      return JSON.parse(await readFile(file, 'utf8')) as unknown
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
      throw unavailable()
    }
  }
  async write(parts: string[], name: string, value: unknown, exclusive = false) {
    const folder = await this.folder(parts), file = join(folder, this.name(name)), temp = join(folder, `${randomUUID()}.tmp`)
    const bytes = JSON.stringify(value)
    if (Buffer.byteLength(bytes) > 512 * 1024) throw unavailable()
    try {
      await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 })
      if (exclusive) await link(temp, file)
      else await rename(temp, file)
    } finally { await rm(temp, { force: true }) }
  }
  async list(parts: string[]) { return readdir(await this.folder(parts)) }
  async remove(parts: string[], name: string) { await rm(join(await this.folder(parts), this.name(name)), { force: true }) }
}

import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LocalProjectError, type LocalProjectStore } from './store.ts'
import { STATE_BYTE_LIMIT } from './draft-validation.ts'

const locks = new Map<string, Promise<void>>()
const unavailable = () => new LocalProjectError('storage_unavailable', 'Local editable storage is unavailable. Existing saved work was not replaced.', 503)

export class StateFiles {
  private originals: LocalProjectStore
  constructor(originals: LocalProjectStore) { this.originals = originals }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const root = this.originals.root, previous = locks.get(root) ?? Promise.resolve()
    let unlock = () => {}
    const next = new Promise<void>(resolve => { unlock = resolve })
    locks.set(root, next)
    await previous
    try { return await operation() }
    finally { unlock(); if (locks.get(root) === next) locks.delete(root) }
  }

  private async directory(parts: string[]) {
    await this.originals.ensureRoot()
    let folder = this.originals.root
    for (const part of ['.editing-v1', ...parts]) {
      if (!/^[a-zA-Z0-9._-]+$/.test(part) || part === '..' || part === '.') throw unavailable()
      folder = join(folder, part)
      await mkdir(folder, { recursive: true, mode: 0o700 })
      const info = await lstat(folder)
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw unavailable()
    }
    return folder
  }

  async read(parts: string[], filename: string): Promise<unknown | undefined> {
    try {
      const file = join(await this.directory(parts), filename)
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > STATE_BYTE_LIMIT) throw unavailable()
      return JSON.parse(await readFile(file, 'utf8')) as unknown
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
      throw unavailable()
    }
  }

  async write(parts: string[], filename: string, value: unknown, exclusive = false) {
    let temporary: string | undefined
    try {
      const folder = await this.directory(parts), file = join(folder, filename)
      const json = JSON.stringify(value)
      if (Buffer.byteLength(json) > STATE_BYTE_LIMIT) throw new LocalProjectError('state_too_large', 'Editable state exceeds the local safety limit.', 413)
      temporary = join(folder, `${randomUUID()}.tmp`)
      await writeFile(temporary, json, { flag: 'wx', mode: 0o600 })
      if (exclusive) { await link(temporary, file); await rm(temporary) }
      else await rename(temporary, file)
      temporary = undefined
    } catch (error) { if (error instanceof LocalProjectError) throw error; throw unavailable() }
    finally { if (temporary) await rm(temporary, { force: true }).catch(() => {}) }
  }

  async list(parts: string[]) {
    try { return await readdir(await this.directory(parts)) }
    catch { throw unavailable() }
  }

  async discardUncommitted(parts: string[], filename: string) {
    try { await rm(join(await this.directory(parts), filename), { force: true }) }
    catch { throw unavailable() }
  }
}

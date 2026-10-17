import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSourceBundle, verifySourceBundle } from './bundle.mjs'

const temporary = []
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'manga-source-bundle-test-'))
  temporary.push(directory)
  const root = join(directory, 'repo')
  await mkdir(root)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  const put = async (path, content = 'export const fixture = true\n') => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  await put('package.json', '{"type":"module"}\n')
  await put('package-lock.json', '{"lockfileVersion":3}\n')
  await put('src/main.ts')
  await put('.gitignore', 'node_modules/\ndist/\n.env\n')
  git('init', '-q')
  git('add', '.')
  const tree = git('write-tree')
  const revision = git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', tree, '-m', 'Synthetic test fixture')
  git('update-ref', 'HEAD', revision)
  return { root, output: join(directory, 'bundle'), directory, put, git, revision }
}

afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

describe('local source delivery', () => {
  it('captures current tracked and authorized untracked bytes without calling them a commit', async () => {
    const f = await fixture()
    await f.put('src/main.ts', 'export const changed = true\n')
    await f.put('src/features/local-projects/editor-history.ts')
    await f.put('scripts/local-runtime/preflight.mjs')
    const manifest = await createSourceBundle(f)
    expect(manifest.sourceBaseRevision).toBe(f.revision)
    expect(manifest.sourceState).toBe('dirty')
    expect(manifest.kind).toBe('working-tree-source-snapshot')
    expect(manifest.files.map(({ path }) => path)).toContain('src/features/local-projects/editor-history.ts')
    expect(manifest.files.find(({ path }) => path === 'src/main.ts').sha256).toBe(hash('export const changed = true\n'))
    expect(await readFile(join(f.output, 'source/src/main.ts'), 'utf8')).toBe('export const changed = true\n')
    expect(await verifySourceBundle(f.output)).toEqual(manifest)
    expect((await lstat(f.output)).mode & 0o777).toBe(0o700)
    expect((await lstat(join(f.output, 'source/src/main.ts'))).mode & 0o777).toBe(0o600)
    expect((await lstat(join(f.output, 'manifest.json'))).mode & 0o777).toBe(0o600)
  })

  it('is byte-reproducible for an unchanged working tree', async () => {
    const f = await fixture()
    await createSourceBundle(f)
    const output = join(f.directory, 'second')
    await createSourceBundle({ ...f, output })
    expect(await readFile(join(output, 'manifest.json'), 'utf8')).toBe(await readFile(join(f.output, 'manifest.json'), 'utf8'))
  })

  it('excludes private data, models, config, outputs, secrets and ignored files even if tracked', async () => {
    const f = await fixture()
    for (const path of ['data/account.json', 'models/weights.bin', 'dist/app.js', 'dist-server/start.js', '.env', '.npmrc', 'scripts/local-runtime/config.local.json', 'docs/private/accounts.json', 'src/secret.pem', 'test-results/log.json']) await f.put(path, 'do not deliver')
    f.git('add', '-f', '.')
    const manifest = await createSourceBundle(f)
    expect(manifest.files.map(({ path }) => path)).toEqual(['.gitignore', 'package-lock.json', 'package.json', 'src/main.ts'])
    expect(manifest.excludedCandidateCount).toBe(10)
    expect(await verifySourceBundle(f.output)).toEqual(manifest)
  })

  it('requires explicit authorization for untracked files outside approved stabilization paths', async () => {
    const f = await fixture()
    await f.put('scripts/unknown.mjs')
    await expect(createSourceBundle(f)).rejects.toThrow(/not authorized/)
    await expect(lstat(f.output)).rejects.toThrow()
  })

  it('excludes newly staged or untracked artwork and rejects modified baseline artwork', async () => {
    const f = await fixture()
    await f.put('public/content/new.webp', 'private user image fixture')
    f.git('add', 'public')
    await f.put('public/content/untracked.webp', 'private user image fixture')
    const manifest = await createSourceBundle(f)
    expect(manifest.files.some(({ path }) => path.startsWith('public/'))).toBe(false)
    await rm(f.output, { recursive: true })
    const tree = f.git('write-tree')
    const revision = f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', tree, '-p', f.revision, '-m', 'Synthetic baseline artwork fixture')
    f.git('update-ref', 'HEAD', revision)
    await f.put('public/content/new.webp', 'changed image fixture')
    await expect(createSourceBundle(f)).rejects.toThrow(/baseline artwork/)
  })

  it('rejects unknown non-private candidate paths rather than dropping source silently', async () => {
    const f = await fixture()
    await f.put('surprise/source.ts')
    f.git('add', '.')
    await expect(createSourceBundle(f)).rejects.toThrow(/source boundary/)
  })

  it('rejects a destination inside the source tree or an existing destination', async () => {
    const f = await fixture()
    await expect(createSourceBundle({ ...f, output: join(f.root, 'bundle') })).rejects.toThrow(/outside/)
    await mkdir(f.output)
    await expect(createSourceBundle(f)).rejects.toThrow(/exist/)
  })

  it('rejects symlink destination ancestors and source symlinks or hardlinks', async () => {
    const f = await fixture()
    await symlink(f.directory, join(f.directory, 'redirect'))
    await expect(createSourceBundle({ ...f, output: join(f.directory, 'redirect', 'bundle') })).rejects.toThrow(/symlink/)
    await rm(join(f.root, 'src/main.ts'))
    await symlink(join(f.root, 'package.json'), join(f.root, 'src/main.ts'))
    await expect(createSourceBundle(f)).rejects.toThrow(/regular.*single-link/)
    await rm(join(f.root, 'src/main.ts'))
    await link(join(f.root, 'package.json'), join(f.root, 'src/main.ts'))
    await expect(createSourceBundle(f)).rejects.toThrow(/regular.*single-link/)
  })

  it('fails closed on recognizable credential material without echoing its content', async () => {
    const f = await fixture()
    const credential = ['-----BEGIN ', 'PRIVATE KEY-----'].join('')
    await f.put('src/main.ts', credential)
    await expect(createSourceBundle(f)).rejects.toThrow('Credential-like content detected; no bundle created')
    await expect(lstat(f.output)).rejects.toThrow()
  })

  it.each(['changed', 'missing', 'extra', 'empty-directory', 'symlink', 'permissions'])('rejects %s snapshot content', async (change) => {
    const f = await fixture()
    await createSourceBundle(f)
    const file = join(f.output, 'source/src/main.ts')
    if (change === 'changed') await writeFile(file, 'changed')
    if (change === 'missing') await rm(file)
    if (change === 'extra') await writeFile(join(f.output, 'source/extra.txt'), 'unexpected', { mode: 0o600 })
    if (change === 'empty-directory') await mkdir(join(f.output, 'source/unexpected'), { mode: 0o700 })
    if (change === 'symlink') { await rm(file); await symlink(join(f.root, 'src/main.ts'), file) }
    if (change === 'permissions') await chmod(file, 0o644)
    await expect(verifySourceBundle(f.output)).rejects.toThrow()
  })

  it('rejects manifest traversal before reading outside the snapshot', async () => {
    const f = await fixture()
    const manifest = await createSourceBundle(f)
    manifest.files[0].path = '../../outside'
    await writeFile(join(f.output, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifySourceBundle(f.output)).rejects.toThrow(/manifest/)
  })
})

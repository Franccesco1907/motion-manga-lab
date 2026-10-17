import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT_FILES = new Set([
  '.gitignore', '.nvmrc', 'AGENTS.md', 'README.md', 'package.json', 'package-lock.json',
  'index.html', 'eslint.config.js', 'vite.config.ts', 'tsconfig.json',
  'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.server.json',
])
const AUTHORIZED_UNTRACKED = new Set([
  'LocalProjects.integration.test.tsx', 'PageEditor.css', 'PageThumbnail.test.tsx',
  'PageThumbnail.tsx', 'SelectionSurface.css', 'SelectionSurface.test.tsx',
  'editor-history.test.ts', 'editor-history.ts', 'editor-presets.test.ts',
  'editor-presets.ts', 'selection-geometry.test.ts', 'selection-geometry.ts',
].map((name) => `src/features/local-projects/${name}`))
const SOURCE_EXTENSION = /\.(?:[cm]?js|[cm]?ts|tsx|jsx|css|html|json|md|py|ya?ml|sh)$/
const EXCLUDED_PART = /^(?:\.git|node_modules|dist(?:-server|-ssr)?|\.codegraph|\.atl|\.idea|\.vscode|data|private|models?|weights|local-config|tmp|temp|logs|coverage|test-results|playwright-report|test-artifacts)$/i
const EXCLUDED_FILE = /(?:^\.(?:env(?:\..*)?|npmrc|yarnrc|netrc|pypirc)$|\.(?:local(?:\..*)?|pem|key|p12|pfx|sqlite(?:3)?|db|log|tsbuildinfo|bin|safetensors|pt|pth|ckpt|onnx)$|^(?:credentials|secrets?)(?:\.|$))/i
// This is a fail-closed check for recognizable credentials, not general-purpose DLP.
const CREDENTIAL_CONTENT = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b|https?:\/\/[^\s/@:]+:[^\s/@]+@/
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (message) => { throw new Error(message) }
const safePath = (path) => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path) && path.split('/').every((part) => part && part !== '.' && part !== '..')
const within = (root, path) => { const value = relative(root, path); return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value)) }

async function assertAncestors(path) {
  let current = resolve(path)
  while (true) {
    const info = await lstat(current)
    if (info.isSymbolicLink()) fail('Path contains a symlink')
    if (!info.isDirectory()) fail('Path ancestor is not a directory')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}

function classification(path, tracked) {
  if (!safePath(path)) fail('Unsafe source path')
  const parts = path.split('/')
  if (parts.some((part) => EXCLUDED_PART.test(part) || EXCLUDED_FILE.test(part))) return 'excluded'
  if (path.startsWith('public/content/')) return tracked ? 'source' : 'excluded'
  const allowed = ROOT_FILES.has(path) || /^(?:src|scripts|docs|\.github)\//.test(path) && SOURCE_EXTENSION.test(path)
  if (!allowed) fail('Candidate outside the explicit source boundary')
  if (!tracked && !AUTHORIZED_UNTRACKED.has(path) && !/^scripts\/(?:local-runtime|local-backup|browser-journey|local-delivery)\/.+\.(?:mjs|mts)$/.test(path) && !/^docs\/product\/(?:local-mvp-runbook|local-mvp-verification)\.md$/.test(path)) fail('Untracked source candidate is not authorized')
  return 'source'
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

async function inventory(root) {
  const tracked = new Set(git(root, ['ls-files', '--cached', '-z']).split('\0').filter(Boolean))
  const baseline = new Set(git(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'public/content']).split('\0').filter(Boolean))
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  const candidates = [...new Set([...tracked, ...untracked])].sort()
  const paths = []
  let excludedCandidateCount = 0
  for (const path of candidates) {
    if (classification(path, tracked.has(path)) === 'excluded' || path.startsWith('public/content/') && !baseline.has(path)) { excludedCandidateCount++; continue }
    try { await lstat(join(root, path)); paths.push(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  return {
    paths, excludedCandidateCount,
    sourceBaseRevision: git(root, ['rev-parse', '--verify', 'HEAD']).trim(),
    sourceState: status ? 'dirty' : 'clean',
    // Keep status paths and private filenames out of the delivered metadata.
    statusFingerprint: hash(status),
  }
}

async function readRegular(path, privateMode = false) {
  const before = await lstat(path)
  if (!before.isFile() || before.nlink !== 1) fail('Expected a regular, single-link file')
  if (privateMode && (before.mode & 0o777) !== 0o600) fail('Snapshot file permissions must be 0600')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (info.dev !== before.dev || info.ino !== before.ino || info.nlink !== 1) fail('Source file changed while reading')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (info.size !== after.size || info.mtimeMs !== after.mtimeMs || info.ctimeMs !== after.ctimeMs) fail('Source file changed while reading')
    return bytes
  } finally { await handle.close() }
}

async function readSource(root, path) {
  await assertAncestors(dirname(join(root, path)))
  const bytes = await readRegular(join(root, path))
  if (path.startsWith('public/content/')) {
    const baseline = execFileSync('git', ['-C', root, 'cat-file', 'blob', `HEAD:${path}`], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    if (hash(bytes) !== hash(baseline)) fail('Modified baseline artwork is not authorized for delivery')
  } else if (CREDENTIAL_CONTENT.test(bytes.toString('utf8'))) fail('Credential-like content detected; no bundle created')
  return bytes
}

export async function createSourceBundle({ root, output }) {
  if (!isAbsolute(root) || !isAbsolute(output)) fail('Source and output must be absolute paths')
  root = resolve(root)
  output = resolve(output)
  await assertAncestors(root)
  if (await realpath(root) !== git(root, ['rev-parse', '--show-toplevel']).trim()) fail('Source must be the repository root')
  if (within(root, output) || within(output, root)) fail('Output must be outside the source tree')
  await assertAncestors(dirname(output))
  try { await lstat(output); fail('Output destination already exists') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const initial = await inventory(root)
  for (const required of ['package.json', 'package-lock.json']) if (!initial.paths.includes(required)) fail('Required install source is missing')
  // Audit every candidate and credential signature before creating any output.
  for (const path of initial.paths) await readSource(root, path)
  await mkdir(output, { mode: 0o700 })
  try {
    await mkdir(join(output, 'source'), { mode: 0o700 })
    const files = []
    for (const path of initial.paths) {
      const bytes = await readSource(root, path)
      const target = join(output, 'source', path)
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
      files.push({ path, bytes: bytes.length, sha256: hash(bytes) })
    }
    const final = await inventory(root)
    if (JSON.stringify(initial) !== JSON.stringify(final)) fail('Repository changed during source snapshot')
    for (const file of files) if (hash(await readSource(root, file.path)) !== file.sha256) fail('Source changed during snapshot')
    const manifest = {
      schemaVersion: 1,
      kind: 'working-tree-source-snapshot',
      sourceBaseRevision: initial.sourceBaseRevision,
      sourceState: initial.sourceState,
      snapshotSha256: hash(JSON.stringify(files)),
      excludedCandidateCount: initial.excludedCandidateCount,
      files,
    }
    await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await verifySourceBundle(output)
    return manifest
  } catch (error) {
    await rm(output, { recursive: true, force: true })
    throw error
  }
}

async function walkSnapshot(directory, allowedDirectories, prefix = '') {
  if (prefix && !allowedDirectories.has(prefix)) fail('Unexpected snapshot directory')
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) fail('Snapshot directories must be real and private (0700)')
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (!safePath(path)) fail('Unsafe snapshot path')
    if (entry.isDirectory()) files.push(...await walkSnapshot(join(directory, entry.name), allowedDirectories, path))
    else if (entry.isFile()) { await readRegular(join(directory, entry.name), true); files.push(path) }
    else fail('Snapshot contains a non-regular entry')
  }
  return files.sort()
}

export async function verifySourceBundle(output) {
  if (!isAbsolute(output)) fail('Bundle path must be absolute')
  await assertAncestors(output)
  const rootInfo = await lstat(output)
  if ((rootInfo.mode & 0o777) !== 0o700) fail('Bundle permissions must be 0700')
  const entries = (await readdir(output)).sort()
  if (JSON.stringify(entries) !== JSON.stringify(['manifest.json', 'source'])) fail('Unexpected bundle entries')
  const manifest = JSON.parse((await readRegular(join(output, 'manifest.json'), true)).toString('utf8'))
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'working-tree-source-snapshot' || !/^[a-f0-9]{40,64}$/.test(manifest.sourceBaseRevision) || !['clean', 'dirty'].includes(manifest.sourceState) || !Array.isArray(manifest.files) || !Number.isSafeInteger(manifest.excludedCandidateCount) || manifest.excludedCandidateCount < 0) fail('Invalid source manifest')
  const paths = []
  for (const file of manifest.files) {
    if (!safePath(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || classification(file.path, true) !== 'source') fail('Invalid file manifest')
    paths.push(file.path)
  }
  if (!paths.includes('package.json') || !paths.includes('package-lock.json') || paths.some((path, index) => index > 0 && path <= paths[index - 1]) || hash(JSON.stringify(manifest.files)) !== manifest.snapshotSha256) fail('Invalid manifest identity')
  const directories = new Set()
  for (const path of paths) {
    const parts = path.split('/')
    for (let count = 1; count < parts.length; count++) directories.add(parts.slice(0, count).join('/'))
  }
  const actual = await walkSnapshot(join(output, 'source'), directories)
  if (JSON.stringify(paths) !== JSON.stringify(actual)) fail('Snapshot file inventory does not match manifest')
  for (const file of manifest.files) {
    const bytes = await readRegular(join(output, 'source', file.path), true)
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) fail('Snapshot checksum mismatch')
  }
  return manifest
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 2 || !['--output', '--verify'].includes(args[0])) fail('Usage: local:bundle -- --output /absolute/fresh/directory | --verify /absolute/bundle')
  const manifest = args[0] === '--verify'
    ? await verifySourceBundle(args[1])
    : await createSourceBundle({ root: fileURLToPath(new URL('../../', import.meta.url)), output: args[1] })
  console.log(JSON.stringify({ status: 'verified', kind: manifest.kind, sourceState: manifest.sourceState, sourceBaseRevision: manifest.sourceBaseRevision, snapshotSha256: manifest.snapshotSha256, fileCount: manifest.files.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Source delivery failed; no successful delivery claimed. Check source authorization, credentials, destination safety and snapshot integrity.'); process.exitCode = 1 })
}

import { backupStore, restoreStore } from './backup.mjs'

try {
  const [command, ...args] = process.argv.slice(2)
  if (command !== 'backup' && command !== 'restore') throw new Error('usage')
  const values = new Map()
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (!['--source', '--destination', '--server-stopped'].includes(key) || values.has(key)) throw new Error('usage')
    if (key === '--server-stopped') values.set(key, true)
    else {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error('usage')
      values.set(key, value)
    }
  }
  if (!values.has('--source') || !values.has('--destination') || !values.has('--server-stopped')) throw new Error('usage')
  const options = { source: values.get('--source'), destination: values.get('--destination'), serverStopped: true }
  await (command === 'backup' ? backupStore(options) : restoreStore(options))
  console.log(command === 'backup' ? 'Private account backup complete. Keep it outside served or shared directories.' : 'Private account restore complete. Point the stopped service at the fresh restored directory.')
} catch {
  // Never print filesystem errors, account paths, manifest contents or credentials.
  console.error('Backup/restore refused. Use backup|restore --source <absolute-directory> --destination <fresh-absolute-directory> --server-stopped. Verify the service and workers are stopped, inputs are private and unchanged, paths do not overlap, and no active or stale store lock exists. Existing destinations are never overwritten.')
  process.exitCode = 1
}

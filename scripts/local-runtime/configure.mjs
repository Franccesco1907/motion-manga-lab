import { loadLocalConfig, saveLocalConfig } from './config.mjs'
try {
  const args = process.argv.slice(2), settings = await loadLocalConfig(), config = { ...settings.config }
  if (!args.length || args.length % 2 !== 0) throw Error('Usage: npm run local:configure -- --data-root <absolute-private-directory> [--port 8080]. No account credentials are configured here.')
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1]
    if (seen.has(flag) || !['--data-root', '--port'].includes(flag)) throw Error('Only one --data-root and one --port are accepted; passwords are never arguments.')
    seen.add(flag)
    if (flag === '--data-root') config.dataRoot = value
    else config.port = /^\d+$/.test(value) ? Number(value) : NaN
  }
  const saved = await saveLocalConfig(config)
  console.log(`Saved local configuration: ${saved.path}\nPrivate data: ${saved.config.dataRoot}\nLocal URL: http://127.0.0.1:${saved.config.port}\nNo private store or account was created or migrated. Optional AI: off.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }

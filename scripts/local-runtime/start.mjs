import { startLocal } from './startup.mjs'
try {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 2 || args[0] !== '--username')) throw Error('Usage: npm run local:start [-- --username <name>]. Passwords are accepted only through hidden input or stdin.')
  process.exitCode = await startLocal({ username: args[1] })
} catch (error) { console.error(error.message); process.exitCode = 1 }

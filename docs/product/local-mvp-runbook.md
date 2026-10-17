# Run and preserve the local MVP

Use this checkout for the existing creator workspace, private account persistence and finite playback. Human acceptance belongs to the user; no recruitment or third-party-user test is required. This is not public deployment or a research result.

## Start here

**Source:** the repository checkout containing this implementation. Older planning-only revisions do not contain these commands. Replace `<repository-root>` with this checkout’s absolute path and every other quoted absolute-path placeholder with your intended private location before running a command.

Requirements: Node.js **22.12+**, npm **11+**, Linux with procfs, the existing `/snap/bin/ffmpeg` with VP9 encoding, and the locked dependencies. Chrome is needed only for the browser check. No new dependency, model environment, model weights or artwork is installed by these tools.

```sh
cd "<repository-root>"
npm ci
npm run build
npm run build:server
npm run local:configure -- --data-root "/absolute/private/account-store" --port 8080
npm run local:doctor
npm run local:start
```

Select the **existing dedicated account-store root** to retain its accounts, originals, drafts and previews. An absent root starts a new store; configuration does not migrate or merge data. Vite's `local-projects-v1` store is a different format/mode and is not imported automatically. Store paths must be outside the checkout and its served/build trees, without symlink ancestors; an existing store must be private (`0700`).

On a new store, startup asks for a lowercase account name and a hidden password. Existing accounts skip bootstrap; sign in with the existing account. Never put a password in shell arguments, configuration, documentation or history. Open the printed `http://127.0.0.1:<port>` URL.

Configuration lives at `$XDG_CONFIG_HOME/motion-manga-lab/local.json`, or `~/.config/motion-manga-lab/local.json` when unset; it stores only schema version, data root and port. Directories are `0700`, the file `0600`. With no configuration, defaults are port 8080 and `$XDG_DATA_HOME/motion-manga-lab/self-hosted-v1` (normally `~/.local/share/motion-manga-lab/self-hosted-v1`). Configure explicitly before using a nondefault existing store.

For later sessions:

```sh
cd "<repository-root>"
npm run local:doctor
npm run local:start
```

Stop with **Ctrl+C** and wait for the service to exit. Restart uses the same saved configuration. Rebuild after changing source; startup does not rebuild. This launcher forces loopback and keeps optional AI unavailable, even if model-related environment variables are inherited. Manual model operation is outside this happy path.

## Check the existing workspace

1. Open a saved page, select a part and adjust its movement. Selection and movement guides update immediately; they are not rendered animation. Exact fields remain in **Advanced**.
2. Choose **Preview changes**. It saves the draft, prepares the result and plays it once without another Play click. Compare **Before** and **After**: Before is the previous successful preview, or a clearly labeled original fallback. Each comparison click plays the chosen result once; reduced motion stays static.
3. Choose **Continue editing**. Use **Save draft** for edits that do not need rendering. Reopen the saved page after restarting the service to check saved settings and the last valid preview; opening it never starts playback.

Editing does not render on every change. Outdated previews are labeled; preparation, cancellation and failures preserve the last valid result. **Undo** restores edits, not server revisions. **Static** stops playback; **Loop preview (3 plays)** stays explicit and bounded. Inspect your artwork yourself: synthetic checks do not assess its quality, and human acceptance remains yours.

Do not reset, delete or replace the existing store for this check. The [existing UX description](../../README.md#local-authoring-and-reading) and [creator refinement notes](local-execution-status.md#creator-workspace-refinement) remain the behavior reference. Chapter ordering and private reviewed snapshots remain separate from page editing; no guest link or public publication is required for local acceptance.

## Back up and restore without overwriting originals

Stop the service and **all writers/workers** first. The explicit `--server-stopped` flag acknowledges this operator responsibility; it cannot prove an older unlocked service is stopped. Use fresh absolute destinations outside the checkout, under existing trusted private parents. Never use a served, public or shared directory.

```sh
npm run backup:local -- \
  --source "/absolute/private/account-store" \
  --destination "/absolute/private/fresh-backup" \
  --server-stopped

npm run restore:local -- \
  --source "/absolute/private/fresh-backup" \
  --destination "/absolute/private/fresh-restored-store" \
  --server-stopped
```

The backup contains `manifest.json` and `store/`: the **whole account store**, including immutable original bytes, account/password-hash/session records, drafts, masks, jobs/artifacts, chapters, snapshots and sharing state. Treat it as sensitive as the live store. Files are `0600`, directories `0700`; it is not encrypted. SHA-256, byte counts and an exhaustive inventory detect accidental corruption, not malicious tampering/authenticity.

Restore validates the manifest/inventory and copied output. It never merges with or overwrites an existing destination; the original store remains untouched. Symlinks, hardlinks, special files, overlapping paths and active or stale sibling locks are refused. There is no schema migration or cross-version compatibility promise; retain the matching source bundle with the backup.

To exercise the restored copy, keep the service stopped, then switch configuration:

```sh
npm run local:configure -- --data-root "/absolute/private/fresh-restored-store" --port 8080
npm run local:doctor
npm run local:start
```

Sign in and reopen a saved page/preview. Keep both the original store and backup until you have personally checked the restored copy. Restored sessions and sharing state are sensitive; restoration is not token revocation or publication authorization. Copying an active store manually is not the supported backup procedure.

## Deliver a verifiable source snapshot

Create the source-only bundle from the active checkout after source changes stop:

```sh
npm run local:bundle -- --output "/absolute/private/fresh-source-bundle"
npm run local:bundle -- --verify "/absolute/private/fresh-source-bundle"
```

The fresh destination's parent must already exist. `source/` contains permitted working-tree source, `package-lock.json` and unchanged baseline tracked runtime content; `manifest.json` records exact file hashes/bytes and base-revision/dirty-state metadata. `.git`, dependencies, build output, local configuration, private account data, new/unversioned artwork and model assets are not source-delivery inputs. Modified baseline artwork is refused rather than silently packaged. This is a **working-tree source snapshot, not a commit, Git release, signed artifact or automatic install/build proof**. Its hashes verify bytes and accidental corruption, not authorship.

Verify before installing: extra files such as `node_modules` or `dist` invalidate the exact bundle inventory. Keep the bundle unchanged and copy its source into a fresh build directory:

```sh
cp -R "/absolute/private/fresh-source-bundle/source" "/absolute/fresh-build-checkout"
cd "/absolute/fresh-build-checkout"
npm ci
npm run build
npm run build:server
```

Run `npm run local:doctor` there if checking runtime prerequisites. These commands, not an existing `node_modules` symlink, are the clean-source build procedure. Dependency installation can require registry access; models and private data are not needed to compile. Actual build results must be recorded separately, never inferred from a valid manifest. Git is needed to create a new bundle from the original working tree, not to build the delivered source.

## Repeat the permanent browser check

From the active checkout, with no concurrent build/test process:

```sh
npm run test:browser
```

This builds the client and standalone server, then uses existing sandbox-capable Chrome (`/opt/google/chrome/chrome`, or `CHROME_BIN`) without adding browser dependencies. It creates synthetic PNG input, a temporary private account store and temporary browser profiles on an isolated loopback port. It does not open or mutate the configured personal store.

The journey exercises upload, selection/motion edits without heavy requests, one-click preview preparation and real playback, Before/After comparison, undo, cancellation, failed-save retry and retention of the last valid preview after an invalid render. It captures desktop and 390-pixel layouts, including a full-size synthetic portrait with 14 parts, and asserts equal comparison framing. It stops the browser/service, reopens the saved draft and playable artifact through a fresh browser/profile and restarted service, then backs up the stopped synthetic store, restores into a fresh root and repeats sign-in/reopen/play with exact original/video hashes and draft/artifact parity. This is a **real process restart, not a machine reboot**. The runner prints a private JSON report path under `/tmp/motion-manga-browser-evidence-*/report.json`; fixture stores/profiles are removed during managed cleanup. Keep a report only as bounded engineering evidence, not a human acceptance or physical-device result. A command's presence is not a passing run.

Run the ordinary checks separately and serially:

```sh
npm test -- --maxWorkers=2
npm run typecheck -- --force
npm run lint
npm run build
npm run build:server
```

Two workers bound CPU contention while preserving the existing native encoder timeouts; no suite is skipped. The compiled-entry tests rebuild output, so they must not overlap browser verification. See [current stabilization evidence](local-mvp-verification.md) for recorded results. Historical one-off counts in [execution status](local-execution-status.md) are not results from this harness.

## Security caution for local uploads

The authorized dependency patch installs Sharp 0.35.5, brace-expansion 5.0.12, source-map-js 1.2.2 and undici 7.29.1; full and production-only npm audits both report zero vulnerabilities at this checkpoint. The supported ingestion path retains the [official Sharp SVG-decoder block](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) before untrusted metadata as defense in depth: SVG remains unsupported, while PNG/JPEG/WebP imports and immutable originals are preserved. These time-bounded audit results are not security certification. See [patch versions, audit receipts and historical findings](local-mvp-verification.md#svg-decoder-hardening-and-dependency-remediation). Use the new separately verified dependency-patched source snapshot/receipt, not the superseded original or workaround-only hardened snapshots. Broader security assurance remains separate work.

## If a check refuses to start

- **Missing/stale builds or encoder:** rebuild both outputs; check the required Node/npm, procfs, Sharp and existing FFmpeg/VP9 environment. `local:doctor` runs a bounded synthetic encode in private temporary storage and removes it; it does not change account data or configuration.
- **Occupied port:** do not stop an unknown process. Stop your own known service or configure another allowed port (1024–65535), then run doctor again. A healthy running service intentionally makes a second-start doctor check fail.
- **Store lock:** server/account writers and backup/restore share a sibling `<data-root>.lock`. There is no automatic stale-lock takeover. After a crash, verify every service/writer/worker is stopped before manually removing a confirmed stale lock. Never remove an active lock to bypass admission.
- **Interrupted backup/restore:** a crash can leave a partial new destination and stale lock. Do not start against partial output. Preserve the original and verified backup; after confirming no writers, inspect/clean only the failed new output and retry into a fresh destination.

Neither startup nor backup tooling silently deletes originals, repairs arbitrary permissions, migrates data, installs dependencies or provisions optional models. Browser and command evidence do not close research, rights, deployment or release-policy decisions.

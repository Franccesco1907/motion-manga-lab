# Local MVP verification history

**Current release boundary:** [v0.1.0 local release](releases/v0.1.0.md) defines the frozen owner-local scope. Final candidate/source-bundle checks belong in an external receipt tied to the exact source inventory and local Git tag; the historical checkpoints below are not that receipt. The owner has reported the local workflow working; this is not third-party usability or broad artwork-quality evidence.

**Recorded 2026-10-17, implementation working tree.** The initial working-tree checks below passed on this Linux machine with existing dependencies, before the subsequently authorized SVG-decoder hardening described below. They preserve the existing creator UX and do not establish a public release, research outcome or human acceptance. The user alone performs the [local acceptance pass](local-mvp-runbook.md#check-the-existing-workspace).

Evidence-directory placeholders below redact private operator locations; they do not rename or relocate the recorded files. Those temporary records remain outside Git and are not public artifact links. Recorded commands, results and limitations remain historical evidence, not a claim that a clean clone was tested.

**Prior dependency-patched checkpoint:** full and production-only npm audits report **zero vulnerabilities**; 314 tests in 49 suites, forced typecheck/lint, the exact `npm run test:browser` production-build/12-checkpoint pipeline and launcher smoke passed. [Dependency-patched results](#dependency-patched-working-tree-repeat) supersede the initial and workaround-only dependency checkpoints below; the creator UX results immediately below record a later historical checkpoint, before the final v0.1.0 candidate. Zero reported advisories are not security certification.

## Creator preview flow — historical 372-test checkpoint

The authorized creator simplification now follows **select a part → adjust motion → Preview changes → Before/After → continue editing**. Motion controls come first; selection editing and exact technical fields use separate disclosures. Static movement guides do not pretend to be rendered animation. Preview changes saves and renders once, then plays only its matching result. Comparison uses one previous successful artifact and one current artifact, with a labeled original fallback; this is not version history.

| Check | Recorded result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **372 passed, 49 suites**, 25.18 seconds. |
| `npm run typecheck -- --force` | Passed. |
| `npm run lint` / `git diff --check` | Passed. |
| `npm run test:browser` | Exact production client build, standalone server build and **15 native Chrome checkpoints passed**. |

Focused red–green work covers revision/source/edit-generation binding, revoked playback intent, pending-save/submission cancellation, reduced motion, quiet fresh completion after changing views, and artifact-specific comparison intent. Component totals are PageEditor **42**, LocalPlayback **34**, SelectionSurface **33**; these are included in the integrated count. Native `play()` rejection leaves the original visible with an explicit retry, and successful finite playback returns to a visibly labeled static original.

The final native report is `<private-preview-browser-evidence-directory>/report.json`; command logs are in `<private-preview-command-evidence-directory>/`. These private temporary paths are operator evidence, not durable public artifacts. The browser runner now uses actual pointer input for clicks and **does not grant user activation to polling/evaluation**. No autoplay-policy bypass is used. Its one-click Preview changes proof observes a naturally advancing decoded video and verifies the fetched artifact ID; explicit Before/After clicks fetch the corresponding previous/current artifact without rendering again. Selection and slider changes make no heavy request. The journey also covers undo, controlled save failure/retry, invalid-render retention, cancellation, three natural loop endings, reduced-motion no-fetch, browser/server restart, and stopped-store backup/restore with exact draft/artifact/original/video parity.

The earlier dense-portrait browser run correctly failed because original and encoded video used different intrinsic aspect ratios (a 0.25 CSS-pixel width difference). A shared normalized media slot fixes that discrepancy rather than weakening the assertion. The final run includes a separate **1170 × 2532 synthetic page with 14 parts and one moving part**. Desktop and narrow Edit/Before/After screenshots were inspected (`dense-{edit,before,after}-{1440,390}.png` beside the report). Before/After media and canvas dimensions are exactly equal at each width:

| Viewport | Media slot | Canvas | Document width |
| --- | --- | --- | --- |
| 1440 px | 323.203125 × 699.984375 px | 760.984375 × 1076.046875 px | 1425 px |
| 390 px | 309 × 669.234375 px | 335 × 1066.5625 px | 375 px |

The dense screenshot pair uses the explicitly labeled original fallback; a separate two-render scenario verifies actual previous/current artifact comparison. Tall portrait controls naturally remain below the artwork on narrow screens. These are headless desktop Chrome viewport checks, not physical-device, visual-regression, accessibility-audit, real-artwork quality or human-usability approval. No configured personal store was opened by the harness. Human acceptance remains solely the user's; prior source bundles remain unchanged and do not contain this UX update.

## Initial working-tree results — before SVG hardening

| Check | Recorded result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **313 passed, 49 suites**, 19.55 seconds. No skipped suites; two workers bound CPU contention without increasing existing encoder timeouts. |
| `npm run typecheck -- --force` | Passed forced project checking. |
| `npm run lint` | Passed. |
| `npm run build` | Passed production client build; 46 modules transformed. |
| `npm run build:server` | Passed standalone server packaging. |
| `git diff --check` | Passed for the integrated workspace at this checkpoint. |
| `node scripts/browser-journey/run.mjs` | **12 checkpoints passed** against the production client and compiled server; details below. |
| `node scripts/local-runtime/smoke.mjs` | Passed actual launcher bootstrap, selected-store persistence/login/restart, graceful lock release and occupied-port non-interference with isolated synthetic data. |

The permanent npm entry point is `npm run test:browser`, which runs `npm run build && npm run build:server && node scripts/browser-journey/run.mjs`. At this checkpoint its build steps and direct runner passed separately; this table does **not** relabel that as an executed combined npm invocation.

The launcher smoke used stdin-only password bootstrap, checked that the wrong/default store was not written, restarted through persisted configuration and left an occupied service untouched. It removed its synthetic temporary data. No personal account/store was used for these proofs.

Workspace logs were retained under `<private-stabilization-evidence-directory>/verification/`: `full-suite.log`, `final-quality.log`, `compiled-green.log` and a private copy of the browser report, `browser-green.json`. These temporary operator records are not source-delivery inputs or durable public evidence links.

## Initial permanent browser journey — before SVG hardening

The actual report `<private-initial-browser-evidence-directory>/report.json` records `status: passed` and all 12 checks below. The runner used sandboxed desktop headless Chrome, synthetic 192 × 240 PNG pixels, temporary account/profile roots and an isolated loopback service. It did not open the configured personal store.

| Checkpoint | Observed behavior |
| --- | --- |
| Preflight | Existing build/runtime/browser prerequisites admitted the run. |
| Isolated account login | UI sign-in succeeded against the temporary account store. |
| Rejected upload | Invalid upload retained the selected file for explicit retry. |
| Upload and editable original | UI upload and real pointer-based rectangle selection/rotation preset operated on the synthetic page. |
| Failed save and retry | A controlled save failure preserved edits; explicit UI retry succeeded. |
| Render and playback | Actual rendering produced a native decoded **1.2-second** clip; Play/Restart remained explicit. |
| Three-play preview | Three natural `ended` events returned the preview to Static. |
| Reduced motion | Remounted reduced-motion reading remained static with no video fetch. |
| Invalid render | Failure retained the previous valid playable output. |
| Durable checkpoint | Saved draft/artifact persisted; original bytes remained unchanged. |
| Process close/reopen | Browser and service stopped; a restarted service and fresh Chrome profile reopened the saved draft/artifact and played the same finite clip. |
| Backup/restore reopen | Stopped synthetic store backed up and restored into a fresh root; a third fresh Chrome session signed in, reopened and played, with exact original/video SHA-256 equality and complete draft/artifact parity. |

This proves actual **browser/server process restart**, not machine reboot. It is not a physical-device test, visual-regression suite, accessibility audit, load test, security certification, model-quality evaluation or assessment of the user's real artwork. Reports and managed fixture cleanup are separate: private evidence remains temporarily, while fixture stores/profiles are removed.

## Regression and red–green evidence

The previous creator-refinement checkpoint had 243 tests in 44 suites. The initial integrated 313-test run adds **70 tests**: backup/restore 28, local runtime 16, source delivery 16, browser helpers 8 and two additional compiled-service checks. Historical one-off browser counts in [execution status](local-execution-status.md) are not this harness's results.

- Backup/restore began with 24 failures against unimplemented behavior, then reached 28 passing tests, including corruption, exact preservation, private output, non-overwrite and lock boundaries.
- Startup began with 12 failing tests, then reached 16 passing tests, including malformed npm-version output and interrupted first-account handling. SIGINT/SIGTERM waits for atomic account work and releases the lock; interruption during hashing can finish a complete account before exiting. Crashes/SIGKILL still require explicit stale-lock inspection.
- Source delivery failed on the missing module before its 16 tests passed. Browser helpers failed on the missing module/timeout behavior before their eight tests passed. Compiled lock coverage failed before packaging/locking was completed.

### Corrected a test-artifact build defect, not the product UI

The compiled-service test's Vite child inherited `NODE_ENV=test` from Vitest. That bundled development React, whose Strict Mode abort/replay could produce a 409 during browser rendering. A failing regression asserted that the compiled test output must contain production rather than development React; the fix explicitly sets `NODE_ENV=production` for that Vite child. The focused compiled suite then passed **four tests**, and the integrated suite and production browser journey passed afterward. No product UI behavior was changed to hide the artifact defect.

CodeGraph synchronization succeeded for the registered root, but the active worktree was omitted by that registration/index. Navigation therefore used direct current-source evidence; root synchronization is not claimed as an indexed map of this worktree.

## SVG-decoder hardening and dependency remediation

The [official Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) affects versions below 0.35.5 and describes possible librsvg-related remote code execution under certain runtime conditions on glibc-based Linux. At the initial workaround checkpoint, the production dependency was **Sharp 0.35.4**; the subsequently authorized dependency patch below installs **0.35.5**. Rejecting SVG after `metadata()` was insufficient: decoding/probing happened before the application's PNG/JPEG/WebP format allowlist.

The separately authorized, dependency-free workaround calls `sharp.block({ operation: ['VipsForeignLoadSvg'] })` at initialization in `scripts/local-projects/store.ts`, before untrusted upload metadata is read. Both Vite and standalone uploads use this shared ingestion store. SVG decoding is disabled in supported ingestion; ordinary PNG/JPEG/WebP imports and their exact original bytes are preserved. This was the advisory's bounded workaround, not a dependency upgrade. It remains enabled as defense in depth after patching; separate provenance-gated historical asset tools are not certified by it.

A native regression first failed because a benign valid SVG resolved through Sharp metadata. After the block, that same probe fails with an unsupported-image error before the application's post-metadata allowlist; store import returns 422 without persisting a project. The focused native server suite passed **17 tests**, including the existing PNG/JPEG/WebP exact-byte checks. The 313-test and first 12-checkpoint results above remain the **earlier checkpoint**, not proof of the changed snapshot. The separately recorded hardened repeat follows.

The **historical pre-patch** npm audit recorded **four affected package nodes at high severity, comprising 15 advisory entries** (entries include lower severities):

| Dependency | Historical installed → patched version | Scope | Historical advisory entries |
| --- | --- | --- | --- |
| `sharp` | 0.35.4 → 0.35.5 | Direct production | 1 |
| `brace-expansion` | 5.0.9 → 5.0.12 | Development | 3 |
| `source-map-js` | 1.2.1 → 1.2.2 | Development | 1 |
| `undici` | 7.29.0 → 7.29.1 | Development | 10 |

The operator retained `npm-audit.json`, `npm-explain-audit.json` and `audit-summary.json` under the private `releases/20261017T084852Z-local-mvp-validation/evidence/` directory. At that workaround-only checkpoint, no dependency or lockfile was changed, and blocking SVG did not clear the audit or remediate the other findings. The subsequent dependency changes below were separately authorized; the old audit files remain historical receipts, not the current status.

### Historical workaround-only working-tree repeat

After the SVG admission regression and workaround, the complete repeat passed:

| Check | Hardened result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **314 passed, 49 suites**, 18.38 seconds; the additional test is the native pre-metadata SVG rejection regression. |
| `npm run typecheck -- --force`; `npm run lint` | Both passed. |
| **Exact** `npm run test:browser` | Passed the production client build (46 modules), server build and **all 12 native browser checkpoints**, including process restart and fresh-root backup/restore reopen/play. |
| `node scripts/local-runtime/smoke.mjs`; `git diff --check` | Both passed. |

Logs are `<private-stabilization-evidence-directory>/verification/hardened-full-suite.log` and `hardened-quality-browser.log`. The repeated native report is `<private-hardened-browser-evidence-directory>/report.json` (`status: passed`, 12 passing checks). Unlike the initial checkpoint, the combined npm browser command itself was executed. These remain bounded working-tree/synthetic checks, not clean-copy delivery proof or security certification.

### Authorized dependency patches and recorded audit

The separately authorized patch installs exactly `sharp` **0.35.5**, `brace-expansion` **5.0.12**, `source-map-js` **1.2.2** and `undici` **7.29.1**, with matching package-lock resolutions. Sharp's matching optional native packages were updated; actual runtime versions report librsvg **2.63.2** and libvips **8.18.7** (previously 2.62.91 and 8.18.6). No new dependency or override was introduced.

The active checkout now has its own real `node_modules` directory from `npm ci`, replacing its old link without changing the original checkout's dependencies. Post-patch **full and production-only npm audits both exited 0 and reported zero vulnerabilities at every severity**; `npm ls --all --json` also exited 0. Independent verification repeated `npm audit --package-lock-only --json` and `npm audit --package-lock-only --omit=dev --json` with the same zero findings, checked the actual installed versions/native libraries and verified changed registry integrities/ranges. The audit receipts are `<private-dependency-patch-evidence-directory>/audit-after-full.json`, `audit-after-prod.json` and `audit-after-exits.txt`; `native-after.json` records loaded native-library versions. Independent receipts are under the same private directory’s `audit-research/`: `audit-final-full.json`, `audit-final-prod.json`, `native-final.json`, `independent-lock-install.json` and `registry-final.json`. These are time-bounded npm advisory results, **not** a security certification or a guarantee that no vulnerabilities exist.

The SVG loader block remains defense in depth, and SVG remains unsupported in the normal upload path. The earlier four-node/15-entry audit table above is preserved only as the before-patch record. The complete post-install application/browser repeat is recorded below, rather than inferred from successful installation or audit.

### Dependency-patched working-tree repeat

After the standalone dependency install, the complete repeat passed:

| Check | Dependency-patched result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **314 passed, 49 suites**, 22.57 seconds; no suites skipped. |
| `npm run typecheck -- --force`; `npm run lint` | Both passed. |
| **Exact** `npm run test:browser` | Passed production client build (46 modules), server build and **all 12 native browser checkpoints**, including process restart and fresh-root backup/restore reopen/play. |
| `node scripts/local-runtime/smoke.mjs`; `git diff --check` | Both passed. |

The post-install logs are `<private-dependency-patch-evidence-directory>/full-suite.log` and `quality-browser.log`; the repeated native report is `<private-patched-browser-evidence-directory>/report.json` (`status: passed`, 12 passing checks). These results use the patched active checkout and isolated synthetic fixtures, not real account data. They do not replace the user's acceptance pass, physical-device work or separately recorded clean-copy delivery proof.

The original source snapshot and the workaround-only hardened snapshot are **superseded for dependency-patched delivery**. Do not reuse their hashes/receipts as proof of the new package/lockfile state. A new immutable dependency-patched bundle and its fresh-copy install/build/browser results require their own external receipt; none is inferred here.

## Delivery and acceptance boundaries

Source-bundle verification, fresh copied-source `npm ci`, client/server builds and any repeated browser run from that clean copy are **separate final-delivery checks**. Their external operator logs must be reported separately; neither this working-tree run nor a source manifest proves they ran. The [runbook](local-mvp-runbook.md#deliver-a-verifiable-source-snapshot) defines the procedure without claiming unrecorded results.

The bundle format is a verifiable working-tree source snapshot, not by itself a Git release or commit. For v0.1.0, a clean bundle must be tied to the local release commit/tag in the external delivery receipt; no GitHub release or remote publication is implied. No public deployment, new artwork/model generation, dependency addition, research-contract decision or recruitment is part of this local stabilization. Human acceptance remains the user's own task; no third-party-user prerequisite is imposed.

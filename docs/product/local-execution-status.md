# Local authoring-to-reader implementation status

**Scope:** Subsequently authorized local/private and self-hosted engineering implementation, 2026-10-04–05. Both browser workflows are implemented; no Internet deployment, validated release, product policy freeze or research result is claimed. The original [M0–M5 plan](implementation-plan.md) and [D1–D7 decisions](mvp.md#open-decisions-and-earliest-blocking-milestone) remain the planning baseline.

## Available locally

| Boundary | Implemented behavior |
| --- | --- |
| Import | Still PNG/JPEG/WebP bytes verified and retained exactly; server UUIDs, private storage, complete atomic imports and safe errors. No silent migration or deletion of existing imported pages. |
| Draft | One source-bound coherent raw draft per page, optimistic revisions and save/reopen. Incomplete numeric strings are stored without coercion; render validation is separate. |
| Selection/direction | Normalized working-image rectangle and add/erase brush controls; legacy static/translate/rotate/reveal and explicitly selected schema-2 scale/stretch controls. Drawing factors and pivots are distinct from selection geometry. Manual masks are not semantic cutouts or background reconstruction. |
| Processing | Bounded original-texture rendering through an owned process, finite encoded WebM and static poster; explicit start/cancel/retry, matching source/draft versions and no automatic retries. Optional offline audited Magi/SAM proposals require human review. |
| Chapters | Explicit ordered arrays of imported page IDs; persisted rename/reorder with revisions. A page failure does not overwrite other originals or drafts. |
| Local snapshots | Explicit review before capturing complete matching rendered pages. Immutable captures, atomic active revision, explicit replace/unpublish; later edits do not change an existing snapshot. Failed/stale output cannot replace valid reading. |
| Reader | Private ordered reading and local snapshot reading, static fallback and explicit finite playback controls; reduced-motion reading remains static. The research reader remains separate. |

These cover bounded authoring and reading through M1–M3. The optional account service adds closed-account isolation and reviewed guest reading related to M4, described below. They do **not** satisfy Internet-launch policy/security acceptance or M5 release-quality thresholds.

## Technical local defaults, not product decisions

- Originals: at most 10 MiB and 20 million pixels; still images only. Bytes remain immutable.
- Working source: EXIF-oriented, white-flattened RGB, maximum edge 1280. `sourceVersion` is the original-byte SHA-256; `normalizationVersion: working-image-v1` defines normalized working-image fractions, not original pixel coordinates. Old coordinates are not silently reinterpreted.
- Drafts: at most 16 regions, 64 strokes per region, 4096 aggregate brush points, 64 characters per raw numeric field and 256 KiB per JSON request/state file. Chapters contain at most 100 unique page IDs.
- Motion: legacy duration cap six seconds, 24 fps and eight moving regions remain. The browser explicitly selects schema-2 scale/stretch with positive targets 0.75–1.25; existing version-1 drafts are not silently upgraded. See [the versioned affine boundary](affine-v2.md). Raw incomplete factors remain saveable; active render values must be finite, complete and within their version's bounds.
- Processing: one shared heavy render/inference slot; at most 144 frames, 32 MiB encoded output, bounded owned-worker timeouts. Brush raster work is bounded at two million operations per selection and aggregate moving-source mask area at 200,000 pixels to bound numerical background completion.
- Local-mode storage: one development-server process; restricted directories/files and atomic JSON replacement, without account isolation or owner quotas. The separate account service adds owner-scoped roots and provisional quotas. Neither mode promises encryption, backups, multi-server coordination or retention automation.

Snapshot manifests contain approved page names and immutable artifact references, not raw drafts, masks, model logs or filesystem paths. Reader asset requests pin the captured snapshot revision, including initial revision zero, so explicit replacement cannot mix new media into an older manifest. Unpublishing denies subsequent local lookup/asset requests for **all** revisions; already fetched media is not remotely revoked. This is not a shareable-URL privacy guarantee.

## Run and preserve data

From the implemented checkout, run `npm run dev` and open its printed loopback URL. The application data directory is `~/.local/share/motion-manga-lab/local-projects-v1`, outside Vite serving paths. Production build and static preview do not contain the service.

The current local encoder requires Linux/procfs and `/snap/bin/ffmpeg`. RGB input is piped with backpressure; output uses a fixed inherited seekable descriptor `/proc/self/fd/3`, backed by an exclusively created private Node-owned file, so the browser receives correct finite duration metadata. This is not a client path or a cross-platform encoder-provisioning solution. For existing audited model environments in the original laboratory, set the trusted operator variable `MOTION_MANGA_MODEL_PROJECT=<project-root>` before starting this extra worktree. Runtime/weights are referenced read-only, not copied or downloaded. Missing resources produce explicit unavailable/failure states; capability inspection is not inference.

Existing data is not automatically migrated, cleaned or overwritten. Preserve the dedicated private directory when restarting. Reset only after stopping the server and separately backing up anything needed.

## Evidence and remaining limits

Tests use generated synthetic pixels and temporary private roots: exact-byte reopen, raw invalid-input persistence, concurrent revision conflicts, atomic failure recovery, chapter order, immutable snapshots and withdrawn lookup denial. Native HTTP integration exercises the real renderer/encoder, finite-video decoding and later-edit/stale-render behavior. Optional model smoke evidence is distinct from deterministic adapter tests and does not establish selection quality.

There is no installed browser E2E, visual-regression, physical-device or formal accessibility/performance acceptance harness. Synthetic examples are not a varied rights-cleared evaluation corpus. Large/occluded backgrounds, mask leakage, lettering quality and anatomy still require review; keep defective cases static. Internet hosting, operational security review, reporting/takedown policy, release thresholds, broader transform-quality acceptance and the formal enjoyment-study decisions remain unresolved or deferred as documented in D1–D7. Implemented closed accounts and bounded affine controls do not freeze those final policies or quality thresholds.

### Recorded engineering checks for the original implementation worktree

- Final `npm test`: **133 passed in 22 suites**; `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` passed. The build transformed 33 modules; lint reported no warnings.
- A real Vite/native-HTTP journey in a temporary HOME exercised two original uploads, restart/reopen of invalid raw input, strict render rejection, two-frame WebM decoding, ordering, reviewed snapshot creation, failed/stale replacement preservation, successful replacement and withdrawal. Header, cross-origin and direct Vite-filesystem access were denied. Temporary smoke servers and synthetic data were stopped/removed; this is not clean-clone or production-deployment evidence.
- A separate one-off native Chrome journey recorded **14 checkpoints** covering import, manual masks, raw recovery, explicit SAM refinement/review, finite reading, reduced motion, chapters, local snapshots, replacement and withdrawal. After a confirmed encoder duration-header defect was corrected, **three targeted Chrome checkpoints** verified one-second native duration/active decoding, completion/restart and 390-pixel reduced-motion reading. The full 14-checkpoint journey was not repeated after that final encoder-only correction.
- Separate explicit offline synthetic model observations completed SAM refinement and Magi suggestions. Magi returned no regions for its tiny synthetic example; completion is not selection quality or generalization evidence. Capability checks alone are not counted as inference.

These are bounded engineering observations on the current Linux machine. They do not replace varied-content evaluation, physical-device results, a formal browser harness or the unresolved release/research gates.

The review-chain preparation adds one regression for self-provisioning the artifact tests' required temporary parent, without changing the production generator's approved path gate. Its complete workspace tip passes **134 tests in 23 suites**, typecheck, lint, build and diff checks. Existing dependencies were reused; this is not clean-clone or remote CI evidence.

## Standalone account browser extension

The compiled Node service and browser now provide closed-account login/logout, per-owner authoring, session/CSRF boundaries and explicit reviewed guest reading. Runtime detection gates private requests; expiry/logout clears prior-owner recovery and private Blob views, and late responses cannot resurrect another owner's state. Existing Vite/local mode remains available without silently migrating or exposing its stored originals.

Sharing is a separate action on a reviewed snapshot, with an independent content-permission acknowledgment and optional plain-text attribution. Actual newly returned links can be copied; stored hashes cannot reconstruct lost links. Replacement rotates the token, withdrawal rejects future requests and guest pages expose only approved derivatives. This is code for cross-user reading on the self-hosted service, not actual Internet deployment or legal verification. See [operator setup and bounded release scope](self-hosted-service.md).

Before publication packaging, a one-off sandboxed Chrome journey against the **compiled standalone server** passed **13 actual UI checkpoints** with synthetic originals, isolated account/browser/store fixtures and no console errors. It exercised manual rectangle/brush and explicit scale/stretch controls, schema-2 save/reopen, native finite playback/restart, private and guest reduced motion, independent sharing permission/attribution, replacement/withdrawal, server restart, induced media failure/static retry, session-expiry cleanup and A-to-B switching while an old response was held. A separate **10-checkpoint native compiled-server supplement** covered owner isolation, versioned output, immutable reading and restart/revocation boundaries; API setup is not mislabeled as UI interaction. Temporary services/profiles/stores were cleaned up. These observations do not add a persistent browser harness or establish physical-device, varied-content or security certification.

The fresh UI publication worktree is based directly on the verified account-API head and retains its newer private-storage path guard. Its complete `npm test` run passed **186 tests in 38 suites**; forced `npm run typecheck -- --force`, lint, client build, server build and diff checks passed. All 26 intended frontend files match the browser-verified implementation bytewise; backend/package/shared-contract files were not copied from the older combined worktree. This reuses installed dependencies and is not clean-clone, remote CI or deployment evidence.

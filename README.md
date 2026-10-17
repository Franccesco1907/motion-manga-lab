# Motion Manga Lab

The research track asks whether restrained motion improves reader enjoyment without disrupting reading pace. Product MVP planning is a separate track documented below; this repository does not yet provide a deployed public authoring service.

## Product planning

The user accepted the planning baseline on **2026-10-04** for a user-directed editor and reader: upload image pages, arrange chapters, animate selected parts and optionally publish a version for other readers. Subsequent authorization covers the feasible local/private implementation below, not public hosting or a validated product release. Proposed details and OPEN decisions remain as labelled, and the enjoyment-study protocol remains a separate track.

- [MVP scope](docs/product/mvp.md)
- [Proposed architecture](docs/product/architecture.md)
- [Implementation plan and acceptance criteria](docs/product/implementation-plan.md)
- [Current local implementation and limits](docs/product/local-execution-status.md)
- [Active plan and research boundary](docs/development-plan.md)

The local workbench's startup instructions and verification are at `experiments/a-workbench/README.md`. This is local, unversioned engineering evidence, not included in this documentation change or available in a clean clone. It is separate from the main application started below and is not a public multi-user service.

## Internal legacy renderer

`src/features/animation/engine/legacy-a-renderer.mjs` is a byte-for-byte copy of the approved local `experiments/a-workbench/engine/renderer.mjs`; its paired synthetic tests use Vitest instead of `node:test`. The original laboratory remains unchanged. This internal Node processing module uses `Buffer`, is not a browser-ready API, and includes no file IO, export or model adapter.

The retained pilot limits are a 1280-pixel maximum edge, a six-second duration cap, a 24 fps cap, 16 regions and eight moving regions, with only static, rotate, translate and reveal actions. These are legacy bounds, not approved product limits. The tests use in-memory synthetic pixels and require no local artwork or experimental files.

The kernel now runs behind the bounded local processing service; the browser does not execute it. The existing research reader remains available separately from the local authoring workspace.

## Local authoring and reading

Run `npm run dev` from this checkout and open the printed loopback URL. The application opens the creator workspace; **Research reader** remains a separate view. Import a still PNG, JPEG or WebP page to enter its editor.

1. Add a part and select it on the page. Rectangle and add/erase brush tools edit the actual manual mask, not a detected character.
2. Choose **Rotate / sway**, **Pulse / scale** or **Move**, then adjust intensity and speed. **Advanced** retains the raw selection, pivot and timing fields; incomplete values remain saveable.
3. Choose **Preview changes** to save, prepare and play the matching result once. Compare **Before** and **After** on the same canvas, then **Continue editing**. Before uses the previous successful preview, or the clearly labeled original when none exists.

Editing only updates selection and static movement guides; it never starts rendering. **Save draft** keeps edits without rendering. Undo/redo restores edits without rolling back server revisions or render jobs. Preparation and failures keep the last valid result available, and outdated results are labeled rather than presented as new. Before/After clicks explicitly play the selected result once; reduced motion remains static.

Explicitly choosing scale/stretch upgrades a draft to [affine version 2](docs/product/affine-v2.md); opening existing pages does not migrate them. Refined brush/model masks are not silently replaced by rectangle tools. Arrange saved pages into ordered chapters separately from page editing. Reviewed reading snapshots can be created, replaced and unpublished locally; this is **not Internet publication**.

The Vite development-only service stores immutable original bytes, editable JSON, jobs and reading snapshots under `~/.local/share/motion-manga-lab/local-projects-v1`, outside repository/public serving paths, with restricted directory/file permissions. Imports become visible only after complete staging and rename. These local files are not encrypted, automatically backed up or shared; the loopback, Host, Origin and request-header checks are not account authentication or rights clearance. To reset storage, stop the server and remove only that dedicated directory after backing up anything you want to retain. Use one local server process for this store.

Reversible local safety defaults include **10 MiB per original, 20 million pixels, one active upload and one heavy render/inference job**. Animated or incomplete files are rejected; originals are never normalized or overwritten. Working copies use EXIF orientation, white alpha flattening and a 1280-pixel maximum edge. Raw numeric draft fields remain strings, including incomplete input; strict render validation is separate. These bounds and normalized working coordinates do not close product decisions D1–D7.

Finite WebM encoding currently requires Linux/procfs and the existing `/snap/bin/ffmpeg`; the encoder writes through an inherited, Node-owned seekable file descriptor to preserve duration metadata, not a client-provided path. Optional audited Magi/SAM assistance requires existing offline environments/weights; no installer or automatic model download is included. In this extra worktree, start with `MOTION_MANGA_MODEL_PROJECT=<project-root> npm run dev` to reference the original laboratory's approved runtimes read-only. This operator environment setting is not a client-selectable path. Capabilities do not prove model quality or completed inference; all proposed regions/masks require review.

The Vite development service rejects non-loopback binding and is absent from `npm run build` output and `npm run preview`; static preview cannot save, process or reopen local data. Opening a page never starts motion. The creator’s explicit **Preview changes** action plays its matching completed result; reading controls remain opt-in and reduced-motion reading stays static. Neither these local controls nor synthetic tests establish device/accessibility certification or study outcomes.

**Loop preview (3 plays)** explicitly repeats a rendered clip three times, then returns to its static image. A six-second clip therefore provides eighteen seconds of preview playback. **Static** stops it immediately; **Play** and **Restart** retain single-play behavior. This product preview does not change the research treatment or enable infinite autoplay.

## Development

Requirements:

- Node.js 22.12 or newer
- npm 11 or newer

```bash
npm ci
npm run dev
```

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` and `npm run test:watch` discover application and script suites. Local `experiments/` suites use their own documented runners; these commands exclude them and do not verify laboratory behavior. The ownership regression uses synthetic files, so it does not require unversioned laboratory inputs.

The project follows test-driven development: add a failing test for observable behavior before implementing that behavior.

## Standalone account service

The compiled standalone service provides browser sign-in to closed operator-created accounts and isolated private workspaces. Reviewed snapshots can be explicitly shared as unlisted, derivative-only guest reading after separate content-permission acknowledgment. Links are returned only on creation/replacement and can be withdrawn. [Operator setup and boundaries](docs/product/self-hosted-service.md) cover login, sharing and data isolation. Internet deployment, legal clearance and validated release-quality evidence are not included.

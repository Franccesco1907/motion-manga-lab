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

Run `npm run dev` from this checkout and open the printed loopback URL. Choose **Local projects** to import still PNG, JPEG or WebP pages, author rectangle/brush selections, direct the existing motion actions, save/reopen drafts and render finite videos. Arrange imported pages into ordered local chapters. Explicitly reviewed reading snapshots can be created, replaced and unpublished locally; this is **not Internet publication**.

The development-only service stores immutable original bytes, editable JSON, jobs and reading snapshots under `~/.local/share/motion-manga-lab/local-projects-v1`, outside repository/public serving paths, with restricted directory/file permissions. Imports become visible only after complete staging and rename. These local files are not encrypted, backed up or shared; the loopback, Host, Origin and request-header checks are not account authentication or rights clearance. To reset storage, stop the server and remove only that dedicated directory after backing up anything you want to retain. Use one local server process for this store.

Reversible local safety defaults include **10 MiB per original, 20 million pixels, one active upload and one heavy render/inference job**. Animated or incomplete files are rejected; originals are never normalized or overwritten. Working copies use EXIF orientation, white alpha flattening and a 1280-pixel maximum edge. Raw numeric draft fields remain strings, including incomplete input; strict render validation is separate. These bounds and normalized working coordinates do not close product decisions D1–D7.

Finite WebM encoding currently requires Linux/procfs and the existing `/snap/bin/ffmpeg`; the encoder writes through an inherited, Node-owned seekable file descriptor to preserve duration metadata, not a client-provided path. Optional audited Magi/SAM assistance requires existing offline environments/weights; no installer or automatic model download is included. In this extra worktree, start with `MOTION_MANGA_MODEL_PROJECT=<project-root> npm run dev` to reference the original laboratory's approved runtimes read-only. This operator environment setting is not a client-selectable path. Capabilities do not prove model quality or completed inference; all proposed regions/masks require review.

The service rejects non-loopback development binding and is absent from `npm run build` output and `npm run preview`; static preview cannot save, process or reopen local data. Motion never starts automatically, and reduced-motion reading stays static. Neither these local controls nor synthetic tests establish device/accessibility certification or study outcomes.

## Development

Requirements:

- Node.js 22.12 or newer
- npm 11 or newer

```bash
npm install
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

## Standalone account API

The compiled standalone service supports closed operator-created accounts, isolated private workspaces and reviewed derivative-only guest API endpoints. [Operator setup and boundaries](docs/product/self-hosted-service.md) describe this API capability. Browser login and guest-reader integration follow in the next child PR; Internet deployment and content-rights clearance are not included.

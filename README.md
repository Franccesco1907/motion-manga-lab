# Motion Manga Lab

The research track asks whether restrained motion improves reader enjoyment without disrupting reading pace. Product MVP planning is a separate track documented below; this repository does not yet provide a deployed public authoring service.

## Product planning

The user accepted the planning baseline on **2026-10-04** for a user-directed editor and reader: upload image pages, arrange chapters, animate selected parts and optionally publish a version for other readers. Subsequent authorization covers staged local/private implementation, not public hosting or a validated product release. Proposed details and OPEN decisions remain as labelled, and the enjoyment-study protocol remains a separate track.

- [MVP scope](docs/product/mvp.md)
- [Proposed architecture](docs/product/architecture.md)
- [Implementation plan and acceptance criteria](docs/product/implementation-plan.md)
- [Open review chain](docs/product/local-delivery-chain.md)
- [Active plan and research boundary](docs/development-plan.md)

The local workbench's startup instructions and verification are at `experiments/a-workbench/README.md`. This is local, unversioned engineering evidence, not included in this documentation change or available in a clean clone. It is separate from the main application started below and is not a public multi-user service.

## Internal legacy renderer

`src/features/animation/engine/legacy-a-renderer.mjs` is an unchanged copy of the approved original-texture laboratory kernel. Its tests use only synthetic pixels and Vitest, not local artwork or `node:test`. Node `Buffer` and the legacy 1280-pixel edge, six-second/24-fps caps, 16 regions and eight moving regions are retained; no browser integration or approved product limits are implied.

This service review branch still renders only the research `Reader`. It now exposes the complete bounded local API; the browser authoring workflow follows in the next child. This is not a second editor or a public service.

## Protected local service

`npm run dev` binds to loopback and mounts `/api/local-projects`; static build and preview do not mount the service. All API requests require `X-Motion-Manga-Local: 1`, a trusted local Host and exact same-origin Origin when present. Originals are fetched as guarded bytes, not through unprotected public URLs. These checks are not account authentication, encryption or backup.

The API imports immutable original PNG/JPEG/WebP bytes, lists local pages, saves coherent source-bound raw drafts with optimistic revisions, creates bounded render/assistance jobs, persists ordered chapters, and explicitly creates/replaces/unpublishes reviewed local snapshots. Snapshot media is pinned to the captured revision; withdrawal denies all later revision lookups. Failed/stale rendering never replaces valid reading. Requests accept UUID references and bounded JSON, never client filesystem/model paths.

Storage is a restricted private application directory outside Vite serving paths. One local server process is supported. Originals remain exact; working copies use EXIF orientation, white alpha flattening and a 1280-pixel edge. Numeric draft strings may remain incomplete; strict render validation is separate. Local limits and normalized coordinates do not close D1–D7.

Finite WebM encoding requires Linux/procfs and the existing `/snap/bin/ffmpeg`, writing an inherited Node-owned seekable descriptor. Optional models require existing audited offline environments/weights. Set the trusted operator environment `MOTION_MANGA_MODEL_PROJECT=<project-root>` to reference an existing approved model project; replace the placeholder before execution. Missing resources are explicit; no automatic installation/download/inference/retry is performed. Capability availability is not completed inference or model-quality evidence.

Tests use generated synthetic pixels and temporary private roots. Native HTTP journeys verify originals, invalid-input reopen, revisions, real finite encoding, order and snapshot lifecycle. Existing installed dependencies were reused locally; no clean-clone install, CI, device, legal or public-release acceptance is implied.

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

The project follows test-driven development: add a failing test for observable behavior before implementing that behavior.

`npm test` and `npm run test:watch` retain application/script suites while excluding `experiments/`, whose separate runners are not verified by those commands. Artifact tests provision their required temporary parent themselves; no pre-created host directory is needed, and the production generator's approved temporary-path gate is unchanged.

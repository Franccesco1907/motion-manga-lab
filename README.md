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

This core review branch still renders only the research `Reader`. The bounded local service and browser authoring workflow follow in the review chain; this stage adds neither export/model adapters nor an editor.

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

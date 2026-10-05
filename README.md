# Motion Manga Lab

The research track asks whether restrained motion improves reader enjoyment without disrupting reading pace. Product MVP planning is a separate track documented below; this repository does not yet provide a deployed public authoring service.

## Product planning

The user accepted the planning baseline on **2026-10-04** for a user-directed editor and reader: upload image pages, arrange chapters, animate selected parts and optionally publish a version for other readers. Product implementation is not authorized by that acceptance; proposed details and OPEN decisions remain as labelled, and the enjoyment-study protocol remains a separate track.

- [MVP scope](docs/product/mvp.md)
- [Proposed architecture](docs/product/architecture.md)
- [Implementation plan and acceptance criteria](docs/product/implementation-plan.md)
- [Active plan and research boundary](docs/development-plan.md)

The local workbench's startup instructions and verification are at `experiments/a-workbench/README.md`. This is local, unversioned engineering evidence, not included in this documentation change or available in a clean clone. It is separate from the main application started below and is not a public multi-user service.

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

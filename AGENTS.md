# Motion Manga Lab Engineering Rules

## Mission and current stage

This active implementation checkout contains a local/private creator MVP and a separate restrained-motion research reader. Use `docs/product/local-mvp-runbook.md` for persistent local operation and recovery; older planning-only revisions do not provide the same operational workflow. Pepper & Carrot Episode 1, Spanish page 2 is provisional spike content only; it is not frozen or representative final-study manga content.

## Sources of truth and scope

- `docs/development-plan.md` defines the active stage, architecture, gates, and deferred work.
- `docs/experiment-protocol.md` defines the draft research contract and records unresolved study decisions.
- `docs/spikes/ep01-page2-treatment-spec.md` freezes spike behavior but does not authorize generation, import, dependencies, or implementation.
- `docs/content-source-evaluation.md` and `docs/asset-provenance/` define content rights, provenance, derivative planning, and approval gates. A `*.plan.json` file is planning data, never generated-output evidence.
- `README.md`, `package.json`, and the TypeScript/Vite configuration define the currently executable developer workflow.

Do not silently resolve an `OPEN` decision, broaden the experiment into a reader platform, or treat spike evidence as study evidence.

## Proven stack and conventions

- Node.js 22.12+, npm 11+, React 19, strict TypeScript 6, Vite 8, plain CSS, Vitest/jsdom, Testing Library, and ESLint.
- Keep UI semantic, mobile-first, progressively enhanced, and organized by product feature rather than technical layer.
- Prefer ordinary DOM, responsive `<picture>`/`<img>`, CSS `transform`/`opacity`, WAAPI, and native visibility/scroll primitives. Add an animation runtime only after the documented bounded spike proves a need.
- Preserve strict typing, observable behavior tests, accessible queries, and existing formatting unless an authorized change establishes a different convention.

## Navigation: CodeGraph first

Use CodeGraph before broad manual searching for source behavior, call paths, symbols, or change impact. For MCP calls, always pass the absolute path of the repository checkout being inspected. Replace `<repository-root>` below with that actual path:

```text
projectPath: <repository-root>
```

Run `codegraph status "<repository-root>"` before relying on the index and `codegraph sync "<repository-root>"` after source changes. Documentation and configuration may not be indexed. If CodeGraph is unavailable, stale, or omits the needed file, fall back to direct file reads and focused search; never infer missing evidence.

## TDD and verification

Use red-green-refactor for every behavior change:

1. Write a failing test for user-observable behavior.
2. Implement only enough behavior to pass.
3. Refactor with the suite green.

Add a failing regression test before fixing a bug. Test behavior rather than implementation details. Animation and accessibility checks must be deterministic: control media queries, image decoding, observer entries, document visibility, and WAAPI lifecycle rather than sleeping on wall-clock time. Verify static parity, reading order, keyboard/touch/zoom behavior, one-shot/restart behavior, cleanup, and reduced motion.

Development, build and local-operation commands:

```bash
npm run dev
npm test
npm run test:watch
npm run typecheck
npm run lint
npm run build
npm run preview
npm run build:server
npm start
npm run account:create -- "<account-name>"
npm run local:configure -- --data-root "/absolute/private/account-store" --port 8080
npm run local:doctor
npm run local:start
npm run backup:local -- --source "/absolute/private/account-store" --destination "/absolute/private/fresh-backup" --server-stopped
npm run restore:local -- --source "/absolute/private/fresh-backup" --destination "/absolute/private/fresh-restored-store" --server-stopped
npm run local:bundle -- --output "/absolute/private/fresh-source-bundle"
npm run local:bundle -- --verify "/absolute/private/fresh-source-bundle"
npm run test:browser
```

The authorized `test:browser` harness uses existing Chrome and isolated synthetic fixtures for the local account workflow. Run it serially with builds and tests because compiled-entry tests rebuild server output. There is no visual-regression, animation-performance or physical-device test command. Do not invent commands or claim unrun evidence; see the local MVP runbook for prerequisites, private-data boundaries and user-owned human acceptance.

## Frozen accessibility and motion constraints

- Content must remain visible, readable, correctly ordered, and operable when JavaScript, decoding, observers, or animation fail.
- `prefers-reduced-motion: reduce` is fully static for the specified spike: create no WAAPI crop animation, keep identity transforms/content opacity, and keep the light overlay at zero.
- Motion must never gate controls, progression, completion, or outcome collection. Preserve static/treatment parity except for the approved motion and light.
- For the specified treatment, animate only crop `transform` and overlay `opacity`; do not animate layout, clipping, filters, blur, blend modes, or inherited CSS variables. Do not add loops, scroll hijacking, timers, or `requestAnimationFrame` animation loops.
- Preserve semantic landmarks, DOM reading order, accessible descriptions, focus behavior, touch, zoom, text scaling, and non-semantic/pointer-inert overlays.

## Optional skills

| Skill | Use when |
| --- | --- |
| `typescript` | Changing strict TypeScript types, APIs, or domain models. |
| `react-19` | Building or reviewing React components and lifecycle behavior. |
| `frontend-design` | Shaping the reader's intentional mobile-first visual design. |
| `review-animations` | Reviewing treatment timing, easing, performance, interruption, and reduced motion. |
| `playwright` | Designing browser E2E checks after an E2E harness is authorized and available. |
| `cognitive-doc-design` | Updating plans, protocols, provenance, or reviewer-facing guidance. |
| `work-unit-commits` | Planning reviewable implementation units; do not commit unless explicitly requested. |

## Safety boundaries

- Do not download, import, commit, or generate artwork or derivatives without separate authorization and all provenance gates.
- Do not add Sharp or any other dependency without separate authorization.
- Do not implement the page-2 treatment until separately authorized.
- Never fabricate output files, hashes, dimensions, byte counts, manifests, device results, accessibility reviews, or other generated evidence.
- Code, comments, documentation, and UI copy default to English unless another artifact language is explicitly requested.

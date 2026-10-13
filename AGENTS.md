# Motion Manga Lab

The repository contains a research reader, local authoring workspace and compiled closed-account service. Product implementation is distinct from the enjoyment study: no deployed public service, study approval or release-quality claim is implied.

## Read only what the task needs

- [README](README.md): commands and runtime prerequisites; [development plan](docs/development-plan.md): active boundaries and remaining gates.
- [Product scope](docs/product/mvp.md), [architecture](docs/product/architecture.md), [implementation gates](docs/product/implementation-plan.md), [local limits](docs/product/local-execution-status.md), [account operations](docs/product/self-hosted-service.md).
- Research changes require the [protocol](docs/experiment-protocol.md), [treatment](docs/spikes/ep01-page2-treatment-spec.md) and relevant [content/provenance](docs/content-source-evaluation.md). A plan.json is planning data, never output evidence.

## Engineering and verification

- Node.js 22.12+, npm 11+, React 19, strict TypeScript 6, Vite 8, plain CSS, Vitest/jsdom and Testing Library. Preserve feature organization, semantic mobile-first UI and progressive enhancement.
- Use CodeGraph when available, with the actual checkout root; check index status before use and sync after source changes. Fall back to focused reads/search if unavailable, stale or incomplete.
- Behavior changes require failing observable regression tests before implementation, then green/refactor. Control media queries, image decoding, observers, visibility and WAAPI deterministically; do not sleep for animation assertions.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; service changes also require `npm run build:server`. Scripts in package.json are authoritative. Laboratory experiments have separate runners and are excluded.
- No browser E2E, physical-device, performance or accessibility certification command exists. Report unrun/blocked evidence honestly. Use relevant installed skills for the files being changed; artifacts default to English.

## Safety and motion

- Do not silently resolve OPEN product/study decisions. Existing local implementation and approved engineering assets do not authorize new artwork/derivatives, model downloads, dependencies, deployment, publication, recruitment or final-study use.
- Preserve original bytes, owner isolation, private storage, resource bounds, explicit review and separate rights acknowledgment for guest sharing. Never fabricate hashes, assets, dimensions, manifests or validation results.
- Reading remains visible, ordered and operable when JavaScript, decoding, observers or animation fail. Preserve keyboard/touch/zoom, text scaling, focus, static/treatment parity and pointer-inert nonsemantic overlays.
- The frozen research treatment animates only crop transform and overlay opacity; reduced motion is fully static (identity transforms/content opacity, zero light, no WAAPI). No layout/filter/blur/blend animation, loops, scroll hijacking, timers or requestAnimationFrame animation loops. Motion never gates controls or outcomes.
- Prefer DOM/images, CSS, WAAPI and native visibility primitives. Add an animation runtime only after a bounded spike demonstrates need. Existing Sharp serves approved processing; it is not authorization for additional dependencies.

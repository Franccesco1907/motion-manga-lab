# Product architecture proposal

**Status:** Part of the user-accepted planning baseline, 2026-10-04. The design remains a recommendation with OPEN decisions, not implementation authorization or provider selection. [Confirmed product scope](mvp.md) governs this proposal.

Keep the original-texture A approach, separate authoring from processing and reading, and promote proven behavior rather than copying the local laboratory wholesale. These are logical boundaries; they do **not** require microservices.

## Boundaries

| Boundary | Responsibility | Must not do |
| --- | --- | --- |
| Editor | Page ordering, region correction, motion direction, retained drafts, explicit review and original/animated comparison | Trust client ownership claims or treat incomplete edits as published content |
| Application service and storage | Enforce ownership, validate/version plans, persist source/assets, coordinate jobs and publication | Expose private paths, accept arbitrary worker paths or silently overwrite newer revisions |
| Processing workers | Bounded detection, segmentation, background preparation and deterministic rendering behind replaceable adapters | Run per reader visit, assume local model availability in production or publish partial results |
| Reader | Consume an approved read-only manifest and static/animated assets in the intended order | Require editor state, model runtimes or a reader GPU |

Retain React, strict TypeScript and Vite for the application. Reuse the A engine and model adapters behind validated interfaces where tests demonstrate compatibility; adapt the existing reader rather than replacing its research behavior implicitly. Authentication, database, object storage, queue, GPU hosting and deployment vendors remain D2/D6 decisions, not dependencies selected here.

Precomputed renders are the recommended initial delivery path: predictable reading without inference, traded against processing delay and stored asset size. Browser-executed motion is not ruled out, but must justify fidelity and accessibility equivalence before replacing this boundary.

## Proposed versioned domain

| Entity | Responsibility and identity |
| --- | --- |
| Upload | Original file, permission/attribution metadata and independently identified normalized working source |
| MangaProject / Chapter / Page | Owner, editable ordered content and explicit source version; page/panel structure follows D1 |
| Region / MaskVersion | Stable part identity, editable selection and actual cutout bound to an exact source version |
| MotionPlan | Versioned action parameters, normalized coordinates, timing, layer/protection roles and review status |
| RenderArtifact | Exact input plan/source/mask versions, engine version, static fallback, playable output and completion status |
| PublishedRevision | Reviewed read-only snapshot of chapter order, content, attribution and matching artifacts |
| Job | Durable stage, owner/input revision, progress, resource limits and terminal result or safe failure |

Normalize geometry to a documented working-image coordinate space; record source dimensions and transformations rather than reinterpreting old coordinates after resizing. Bind masks and backgrounds to source/mask versions. Selection edits invalidate affected repair data and renders; motion-only edits still require a new matching render before publication.

## State and data flow

```text
Upload → private editable project → reviewed motion plan → processing job
       → complete, matching artifacts → explicit publication → read-only reader
```

- Preserve originals separately from working images and exports. Validate actual file bytes and dimensions, not filename extensions; resolve size/resource limits through D1/D6.
- Reader-quality static assets and analysis working copies may need different resolutions. D1 must validate lettering legibility on full pages rather than inherit the laboratory's 1280-pixel working cap.
- Authorize each private read and mutation against the project owner. The lab's loopback Host/Origin guards are not a multi-user authentication design.
- Use revision checks for concurrent edits. Persist one coherent draft without requiring per-part save gates; define recovery behavior for refresh, failed saves and interrupted processing.
- Make processing recoverable with durable job records and duplicate-start protection. Enforce cancellation, timeouts, safe errors and resource budgets; automatic retry policy is not assumed.
- Publish only a complete reviewed snapshot whose source, masks, plan and artifacts match. A failed/stale render must not replace a valid published revision.
- Recommend immutable published snapshots and explicit replacement/unpublication. Visibility, reader access and asset revocation/cache behavior depend on D2/D5; a shareable URL is not a privacy guarantee.
- Expose only approved publication assets to readers, not originals, masks, drafts, model logs or arbitrary storage locations by default. Final original-download policy remains part of D5.

## Integration and preservation

The main `src/App.tsx` currently renders the engineering `Reader`; the laboratory has its own server, data and UI. Product routes, persistent service, chapter authoring and sharing still need implementation. Keep feature-oriented boundaries and adapt the proven engine through an explicit contract, with selected-A parity tests as a regression reference.

Do not migrate, delete or rewrite existing user lab projects implicitly. Preserve the accepted A assets and previous laboratory evidence. Any import path must be explicit, versioned and reversible; product data must not silently reuse the laboratory's local private directory as public storage.

The [formal research protocol](../experiment-protocol.md) and frozen treatment remain separate. Product animations may have different vocabulary and playback behavior only through product scope decisions; that does not relax research gates or prove study outcomes.

# User-directed manga animation MVP

**Status:** User-accepted planning baseline, 2026-10-04. Proposed details and OPEN decisions remain as labelled; product implementation is not yet authorized.

Users upload their own manga, select parts of the drawing, direct their movement, and optionally publish an animated reading experience for others. AI assists selection; it does not replace the user's creative direction or guarantee correct results.

Read next: [architecture proposal](architecture.md) → [implementation plan](implementation-plan.md). The [development-plan gateway](../development-plan.md) separates this product track from the unchanged research protocol.

## Confirmed scope

| Area | Confirmed outcome |
| --- | --- |
| Content | User uploads only; no platform-provided manga catalog. Accept JPG, PNG and WebP images, ordered as pages of a chapter. PDF and CBZ are deferred. |
| Selection | Offer suggested regions; let the user select heads, hands or other parts manually and correct the suggestions. Repositioning or resizing a selection is distinct from animating it. |
| Direction | The user chooses what moves, in which direction, how far and when. Enlargement, reduction and stretching are desired capabilities whose exact first-release scope remains OPEN. |
| Application | Integrate authoring into the main application, with editor, processing and reader boundaries rather than leaving the experience only in `experiments/`. |
| Persistence and sharing | Save editable projects and optionally publish animations for other people to read. Uploading or saving is not itself a request to publish. |
| Quality | Validate usability, visual fidelity, accessibility and performance on varied content; the accepted laboratory is a starting point, not proof for every manga. |

## Intended journey

1. Create a project, upload pages and arrange their chapter order.
2. Open a page; request suggested selections or draw a region directly on the artwork.
3. Inspect the actual cutout, correct it, and set its action, direction, extent and timing.
4. Preview against the original, correct artifacts, and save the editable project.
5. Read the prepared chapter privately; optionally publish a reviewed version for others.

Page/panel subdivision and reading direction still need an explicit decision. The journey does not assume that each uploaded page contains only one panel.

## Proposed usability and release requirements

These are recommendations to approve before implementation, not claims about completed product functionality.

- Keep one coherent draft: switching parts must not discard incomplete fields. Make saved, unsaved, processing, failed and outdated states visible.
- Use image-based selection and direction controls with keyboard/numeric equivalents. Distinguish selection size, drawing scale and background repair; advanced repair controls must not masquerade as movement.
- Make edits reversible and preserve originals. Show field-specific errors and a clear next action instead of unexplained disabled render controls.
- Keep original/animated comparison and an always-readable static fallback. Reduced-motion reading must not require animation, GPU processing or waiting for a render.
- Show processing progress and actionable resource failures. Preserve drafts after failure; retries must be explicit and must not duplicate work.
- Separate private editing from publication. Recommend explicit publish, replace and unpublish actions, with previously published reading unchanged by draft edits.

## Existing foundation versus new work

The A workbench has original-texture rendering, assisted Magi/SAM selection, manual box creation/refinement, saved local projects and reviewed video export. Its actions are static, rotate, translate and reveal. Its repository-root local documentation path is `experiments/a-workbench/README.md`: local, unversioned engineering evidence, not included in this documentation change or available in a clean clone. It is a single-image local laboratory, not a deployed multi-user product.

Uniform scaling is a **new recommended MVP candidate**. Nonuniform stretching is a **new advanced candidate**, not a confirmed exclusion; both require fidelity tests and scope approval. Selection handles and product-grade undo also need specification rather than assuming current lab controls provide them.

The laboratory's six seconds, 24 fps, 1280-pixel working edge, 16 regions and eight moving actors are implementation bounds, **not approved product limits**. Existing examples and local test results do not establish publication rights, general model quality or mobile-device readiness.

## Open decisions and earliest blocking milestone

The user owns scope/policy decisions; technical choices need evidence and explicit selection. Milestones are defined in the [implementation plan](implementation-plan.md).

| ID | Decision to resolve | Blocks |
| --- | --- | --- |
| D1 | Upload size/resolution/count limits; animated-image handling; working quality; page/panel organization; chapter model and right-to-left/left-to-right/vertical reading behavior | M1 contracts, M2 vertical slice |
| D2 | Owner identity/account flow, private access, reader authentication and publication visibility/discoverability | M1 ownership contract; deployed M2; M4 sharing |
| D3 | First-release transforms, including uniform scale and nonuniform stretch; duration/repetition limits and preview fidelity | M1 contract vocabulary; M2 editor acceptance |
| D4 | Reader playback policy, target browsers/devices and accessibility/performance thresholds | M2 reader behavior; M5 release evidence |
| D5 | Upload/publication permission checks, attribution, reporting/takedown, retention and deletion rules | Public upload or sharing in M4; policy work is not legal clearance |
| D6 | Storage, API/job deployment, authentication implementation, GPU provision, cost limits and model/dependency license suitability | M1 concrete integration; hosted processing or public release |
| D7 | Rights-cleared varied evaluation set, defect severity, acceptable manual correction effort and release thresholds | M2 test design; M5 quality decision |

## Not promised by this MVP

Automatic narrative direction for arbitrary manga, perfect reconstruction behind moving parts, a platform source catalog, PDF/CBZ import, social-network features or a measured improvement in reader enjoyment. These documents do not authorize downloads, dependencies, paid services, new artwork, deployment or changes to research `OPEN` decisions.

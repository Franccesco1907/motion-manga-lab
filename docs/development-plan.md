# Development plan

## Current implementation

The main application includes the research reader, local image authoring, ordered chapters, reviewed snapshots, versioned affine motion and a compiled closed-account service with guest reading. The earlier documentation-only/placeholder snapshot is superseded by this code. No Internet deployment or completed product/study release is claimed.

Use [README](../README.md) for commands, [local execution status](product/local-execution-status.md) for implemented limits, and [self-hosted service](product/self-hosted-service.md) for account operations. The old unversioned A workbench is historical engineering evidence; a clean clone does not need it for synthetic application tests. Optional model assistance still requires separately approved local runtimes/weights.

## Product work remaining

The accepted 2026-10-04 direction is a user-directed editor/reader: upload PNG/JPEG/WebP, arrange chapters, edit selections and motion, save and optionally share a reviewed version. There is no supplied manga catalog; PDF/CBZ remain deferred.

Keep [MVP scope and D1-D7](product/mvp.md), [architecture](product/architecture.md), [affine versioning](product/affine-v2.md) and [milestone acceptance criteria](product/implementation-plan.md) as the product contracts. Bounded local M1-M3 behavior and account/guest functionality do not close M4 Internet policy/operations or M5 corpus/device/release evidence. No provider, cost commitment or OPEN decision is implicitly selected.

## Preserved research contract

The question is whether restrained motion increases reader enjoyment without disrupting reading pace. Regular manga readers are the target population; the primary outcome is the project-specific three-item Reader Enjoyment Score in the [draft protocol](experiment-protocol.md). Completion, abandonment, disruption, accessibility and performance are guardrails, not substitutes for enjoyment.

Pepper & Carrot Episode 1 Spanish page 2 is provisional engineering content, not representative final-study manga. Its 18 verified derivatives and panel-level treatment are imported and implemented; the scoped human descriptions/fidelity/attribution review was approved on 2026-08-30. Physical-device evidence, broader final-publication credit confirmation and final content selection remain separate gates. Preserve [source rights](content-source-evaluation.md), [inspection](asset-provenance/pepper-carrot-ep01-inspection.md), [derivative contract](asset-provenance/pepper-carrot-ep01-page2-derivative-plan.md) and [treatment specification](spikes/ep01-page2-treatment-spec.md).

## Research gates, in order

1. **Freeze the protocol:** cognitive-pilot the three-item instrument; predeclare reliability/distribution diagnostics, language/version, scoring, practical effect, study shape, eligibility, analysis, sample-size rationale, stopping rules, privacy and retention. Resolve OPEN decisions before recruitment. The score is not a validated psychometric scale.
2. **Validate control/treatment:** use identical content, layout, quality, controls and questionnaire. Preserve static/reduced-motion reading, semantic order, keyboard/touch/zoom and failure behavior. The control must be credible without animation.
3. **Finish the bounded spike:** profile the frozen native DOM/CSS/WAAPI treatment on agreed low/mid-tier physical devices, against pre-agreed craft, frame stability, main-thread, memory, network and accessibility thresholds. Keep panel-level motion; flattened source art does not justify character segmentation. Use [technology findings](animation-technology-exploration.md) before considering only the strongest alternative runtime.
4. **Instrument minimally:** after protocol freeze, add assignment/versioning, questionnaire and guardrail events. Validate duplicate delivery, refresh/re-entry, offline failure, retention/deletion and an end-to-end data-quality dry run. Provider and transport remain OPEN; collect no unnecessary identifiers.
5. **Pilot an immutable study:** deployment needs separate approval. Verify comprehension, accessibility, assignment and capture, resolve defects, then freeze the main study. Do not tune the hypothesis from pilot outcomes without versioning/restarting the protocol.
6. **Run and decide:** follow predeclared stopping/analysis criteria; report uncertainty, limitations and guardrail failures. Engineering polish or synthetic tests cannot establish an enjoyment benefit.

New artwork imports/generation, models, dependencies, public hosting, final-study use and recruitment retain their separate approval/rights gates. Product acceptance and engineering prototype approval are not research evidence.

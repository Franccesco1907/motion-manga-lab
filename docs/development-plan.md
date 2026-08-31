# Development Plan: Enjoyment-First Motion Manga Experiment

**Status:** Active plan, updated 2026-08-28

## Outcome first

The primary experimental outcome is **increased reader enjoyment**, measured with the selected three-item project-specific **Reader Enjoyment Score** defined in the [draft experiment protocol](./experiment-protocol.md). The project should determine whether a restrained motion treatment makes a manga excerpt more enjoyable than the same reading experience without motion. Completion, abandonment, perceived disruption, accessibility, and performance are secondary outcomes or guardrails; they must not replace enjoyment as the definition of success.

The target population is **regular manga readers**. The next step is to prepare the specified cognitive pilot and complete the exact-asset checks in the [content source evaluation](./content-source-evaluation.md). Implementation should use the recommended open webcomic only for a bounded engineering spike; final representative manga excerpts remain OPEN for the experiment.

## Current state and architectural verdict

| Area | Current state | Verdict |
| --- | --- | --- |
| Product | Visible mobile-first engineering reader prototype | Validate the frozen treatment and control parity without treating it as study evidence. |
| Frontend | React 19, strict TypeScript 6, Vite 8 | Retain; this is sufficient for the experiment. |
| Quality | Vitest, Testing Library, ESLint, type checking | Retain; test observable behavior before implementation. |
| Content and motion | Episode 1 source and exact Spanish page 2 treatment are defined; one corrected 18-output WebP/JPEG run is verified, imported, and implemented for the prototype | Require human fidelity/accessibility/device and final attribution approval before study/publication use. Reject subject-level motion and keep final study content open. |
| Measurement | Draft protocol, primary Reader Enjoyment Score, target population, and cognitive-pilot procedure selected; no telemetry or complete analysis contract | Pilot the instrument and resolve the remaining experiment contract before treatment implementation. |
| Operations | No backend, CI, deployment, or production telemetry | Add only the minimum needed for a pilot. |

**Architectural verdict:** use a mobile-first, semantic DOM reader with responsive image layers. Start with native CSS `transform`/`opacity`, the Web Animations API (WAAPI), and browser visibility/scroll primitives. Do not select an animation dependency until a bounded spike shows that native technology misses a pre-agreed craft, performance, or maintainability threshold. Keep frontend code organized by product feature rather than by technical layer.

## Working principles

- Compare a credible static control with one restrained motion treatment.
- Keep reading available when JavaScript animation fails or motion is reduced.
- Change one experimental variable: motion. Keep content, layout, image quality, controls, and questionnaire equivalent.
- Prefer progressive enhancement and semantic HTML over a rendering engine.
- Collect only data required to evaluate enjoyment and guardrails.
- Treat visual polish as part of treatment validity, but do not add motion without a reading purpose.
- Keep engineering-spike content provenance separate from final experimental excerpts and their representativeness decision.

## Stages

### Step 0 — Freeze the experiment contract

**Objective:** make enjoyment measurable and prevent implementation choices from redefining success.

**Activities**

- Apply the selected three-item Reader Enjoyment Score identically between conditions.
- Conduct pilot cognitive testing; define reliability and response-distribution diagnostics; freeze the instrument language/version before the main study.
- Resolve the remaining OPEN decisions in [experiment-protocol.md](./experiment-protocol.md), including practical effect, study shape, operational eligibility, analysis approach, and decision thresholds.
- Apply the package-level rights, attribution, layer, and provenance checklist in the [content source evaluation](./content-source-evaluation.md).
- Confirm final representative manga excerpts and target devices separately from the engineering-spike content.
- Define control/treatment equivalence and the reduced-motion treatment behavior.

**Tools:** written protocol, evidence review, stakeholder review; no application dependency required.

**Exit criteria**

- Reader Enjoyment Score wording/order, response scale, timing, language/version, and scoring pass pilot cognitive testing and are frozen before the main study.
- Reliability and response-distribution diagnostics are predeclared without using main-study condition results to select or alter items.
- Sample-size and power rationale are documented from an explicit design, not guessed.
- Guardrails, stopping conditions, exclusions, and privacy/retention rules are agreed.
- Exact final study assets, rights, attribution, and representativeness are approved; a spike recommendation alone does not satisfy this criterion.

**Dependencies and risks:** pilot participants, measurement/statistical expertise, content rights, and recruitment feasibility. The Reader Enjoyment Score is project-specific, not a validated psychometric scale; unclear wording or poor response behavior found during the pilot must be resolved and versioned before the main study.

### Step 1 — Build the static control reader

**Objective:** establish an accessible, mobile-first reading experience that can stand alone as the control.

**Activities**

- Define a minimal content manifest for excerpt, page/panel order, responsive sources, layer metadata, and accessible text alternatives.
- Render semantic reading landmarks and responsive `<picture>`/`<img>` assets.
- Implement loading, progression, completion, error, and restart behavior without motion.
- Test keyboard, touch, zoom, responsive layout, image failure, and reading order.

**Tools:** existing React, TypeScript, Vite, Vitest, Testing Library, and browser accessibility/developer tools.

**Exit criteria**

- The representative excerpt can be read and completed on target mobile viewports.
- Reading order and controls remain usable without animation.
- Behavioral tests cover the critical reader path and failure states.

**Dependencies and risks:** licensed assets, text alternatives, image dimensions/crops, and content representativeness. A weak control invalidates the comparison.

### Step 2 — Run the bounded animation technology spike

**Objective:** choose the least complex technology that can deliver a credible treatment.

**Activities**

- After the remaining import gates pass, implement the frozen [Episode 1 page 2 treatment specification](./spikes/ep01-page2-treatment-spec.md) with semantic DOM image layers, CSS transforms/opacity, WAAPI, and native visibility/scroll primitives.
- If generation is separately authorized, follow the [derivative plan](./asset-provenance/pepper-carrot-ep01-page2-derivative-plan.md) exactly: pinned Sharp/libvips environment, crop-first serial processing, widths 640/1280/2275, WebP/JPEG outputs, explicit sRGB policy, and actual evidence from Sharp `info`.
- Keep the treatment panel-level. Do not segment or imply isolated motion for characters, the broom, liquid, or painted sparkles; the [source inspection](./asset-provenance/pepper-carrot-ep01-inspection.md) found no animation-ready subject layers.
- Preserve the specification's progressive-enhancement baseline, exact observer/lifecycle behavior, fully static reduced-motion path, and static-control parity contract.
- Test reduced motion and profile frame stability, main-thread cost, memory, load weight, visual fidelity, and implementation complexity on representative low- and mid-tier mobile devices.
- Implement **only the strongest alternative** if the native version misses an agreed threshold: Motion for React-driven sequencing/gestures, GSAP for complex authored timelines, or PixiJS for a demonstrated rendering bottleneck.
- Record results against the same assets, effect, viewport, interaction, and measurement procedure.

**Tools:** browser performance/memory/network tooling and physical-device testing; candidate libraries are temporary spike choices, not committed dependencies.

**Exit criteria**

- Thresholds are agreed before comparison results are interpreted.
- The selected approach meets treatment fidelity and all guardrails with the lowest justified complexity.
- The decision and rejected escalation paths are recorded in [animation-technology-exploration.md](./animation-technology-exploration.md).

**Dependencies and risks:** human render-fidelity/accessibility review, final attribution approval, and device access. The corrected derivatives and treatment are imported and implemented only for the authorized engineering prototype. Episode 1 supports panel-level treatment but not subject-level animation. Pepper & Carrot is suitable for engineering but is not representative manga; the spike must not freeze final study content. An unbounded framework bake-off would spend effort without improving the product decision.

### Step 3 — Build the motion treatment

**Objective:** produce a polished treatment that differs from the control only by intentional motion.

**Activities**

- Encode a small effect vocabulary with explicit purpose, trigger, timing, cleanup, and reduced-motion behavior.
- Apply motion to the same content and layout used by the control.
- Stop or suspend work for off-screen panels; make playback deterministic and restartable.
- Review the treatment at normal speed, slow motion, and frame by frame on physical devices.

**Tools:** the spike winner; existing test stack; browser animation and performance tools.

**Exit criteria**

- Treatment and control are equivalent except for motion.
- Every effect has a reading purpose and a reduced-motion equivalent.
- No known critical accessibility, disruption, or performance guardrail failure remains.

**Dependencies and risks:** editorial motion direction and asset preparation. Over-animation can reduce enjoyment while still looking impressive in isolation.

### Step 4 — Add experiment instrumentation

**Objective:** capture the primary Reader Enjoyment Score and minimum guardrail evidence reliably.

**Activities**

- Implement condition assignment, study-version tracking, conceptual events from the protocol, and the versioned three-item Reader Enjoyment Score.
- Validate completion/abandonment definitions and performance summaries.
- Test duplicate delivery, refresh/re-entry, offline/failure behavior, and data deletion/retention paths.
- Perform an end-to-end data-quality dry run before recruitment.

**Tools:** provider and transport are OPEN; prefer a minimal, replaceable boundary over vendor-specific calls throughout the reader.

**Exit criteria**

- A test session can be traced from assignment through reading and questionnaire submission without direct identifiers.
- Event validation rejects incompatible study versions and impossible transitions.
- The collected fields match the frozen protocol and nothing more.

**Dependencies and risks:** privacy review, hosting choice, and retention policy. Instrumentation defects can make otherwise valid sessions unusable.

### Step 5 — Pilot and deploy the study

**Objective:** prove operational and comprehension readiness without making an efficacy claim.

**Activities**

- Deploy an immutable study version over HTTPS.
- Run a small operational pilot to find comprehension, accessibility, assignment, rendering, and telemetry defects.
- Review only predeclared data-quality and safety checks; do not tune the enjoyment hypothesis from pilot outcomes unless the protocol is versioned and restarted.

**Tools:** deployment and monitoring provider are OPEN; add CI only where it protects the study release.

**Exit criteria**

- Participants can complete both assigned experiences and submit all three Reader Enjoyment Score responses per condition.
- Condition assignment and data capture pass the dry-run checks.
- Pilot defects are resolved or explicitly accepted before the main study version is frozen.

**Dependencies and risks:** recruitment, target-device coverage, deployment reliability, and accidental exposure of unpublished content.

### Step 6 — Run, analyze, and decide

**Objective:** decide whether motion increases enjoyment without unacceptable harm.

**Activities**

- Run the frozen protocol to its predeclared stopping point.
- Analyze the primary Reader Enjoyment Score first, then guardrails and exploratory outcomes.
- Report missing data, exclusions, protocol deviations, and uncertainty.
- Choose to proceed, revise and retest, or stop; do not justify infrastructure from a neutral result.

**Tools:** analysis tooling is OPEN and should be selected with the statistical design.

**Exit criteria**

- The decision follows the predeclared enjoyment and guardrail rule.
- Results and limitations are reproducible from the frozen study version.
- Any next investment has evidence tied to a reader outcome.

**Dependencies and risks:** adequate recruitment, protocol adherence, and analysis expertise.

## Explicitly deferred

These items remain out of scope until experiment evidence or measured constraints justify them:

- Production backend, accounts, synchronization, and long-term content management.
- Global client state management or a generalized reader platform.
- AI-assisted segmentation, animation generation, or personalization.
- GSAP, Motion, PixiJS, Canvas/WebGL, or another animation dependency by default.
- A visual timeline editor, generalized effect DSL, or multi-title publishing pipeline.
- Video/GIF/Lottie/Rive conversion pipelines for manga panels.
- Broad analytics, behavioral profiling, advertising, or unrelated engagement metrics.
- Offline/PWA support, native applications, internationalization, and large-scale deployment architecture.

## Immediate next action

Review the [actual derivative manifest](./asset-provenance/pepper-carrot-ep01-page2-derivatives.manifest.json). The verified derivatives are imported only for the engineering prototype. The next asset steps are human color-managed fidelity and Spanish accessible-description review, followed by physical-device byte/decode/render checks and final attribution approval before any study or publication use. Prepare the cognitive-pilot materials in parallel and continue resolving the remaining OPEN decisions below; Step 0 is not frozen.

## Remaining OPEN decisions

- Operational manga-reading frequency, age/consent boundary, study language, geography, recruitment channel, and familiarity screening.
- Practical effect threshold, final study design, exact statistical test/model, uncertainty rule, power rationale, and sample size.
- Final representative manga excerpts, excerpt comparability, exact asset rights/attribution, and treatment-fidelity review.
- Guardrail definitions and numbers, reduced-motion estimand handling, supported devices/browsers, and failure rules.
- Privacy provider, jurisdiction, consent text, retention, withdrawal/deletion, and free-text policy.
- Cognitive-pilot participant count, operational comprehension criterion, diagnostics, and reviewer approval.

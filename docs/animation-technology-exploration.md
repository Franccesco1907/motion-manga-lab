# Animation Technology Exploration

**Decision status:** Initial recommendation, subject to a bounded spike

**Evidence reviewed:** Official documentation available on 2026-08-28

## Recommendation

Start with a **semantic DOM reader**, responsive `<picture>`/`<img>` layers, CSS transforms/opacity for predetermined effects, WAAPI for programmatic playback, and native visibility/scroll primitives. This path best preserves reading semantics, responsive images, progressive enhancement, accessibility, testability, and a small dependency surface.

Do not add Motion, GSAP, PixiJS, or another animation runtime by default. Run one bounded spike with the same representative workload and treatment. Build only the strongest alternative if native technology misses a pre-agreed craft, performance, or maintainability threshold.

This is a project-specific recommendation, not a claim that native animation is universally faster or more capable.

## Verified facts from official documentation

| Technology | Verified capability or constraint |
| --- | --- |
| Native CSS/WAAPI | CSS animations define keyframed style changes. WAAPI exposes the browser animation engine to JavaScript and supports playback controls such as play, pause, reverse, cancel, timing, callbacks, and promises. MDN cautions against indefinitely retaining filling animations because active animation state consumes resources. |
| Native visibility/scroll | IntersectionObserver asynchronously reports threshold-based viewport/ancestor intersections; callbacks still execute on the main thread and are not exact per-pixel scroll tracking. CSS scroll-driven animations can attach animation progress to scroll or view timelines. |
| Native accessibility | `prefers-reduced-motion` reports a user preference to remove, reduce, or replace non-essential motion. It is a signal to provide an appropriate experience, not evidence that every animation must simply be disabled. |
| Motion | Motion for React supports scroll-triggered and scroll-linked animation, gestures, variants, and scoped imperative sequences through `useAnimate`. Its documentation describes a hybrid engine that uses WAAPI and ScrollTimeline where possible and JavaScript for capabilities such as springs, gesture tracking, and interruptible keyframes. |
| GSAP/ScrollTrigger | ScrollTrigger supports triggered and scroll-linked timelines, scrub, pin, snap, velocity, callbacks, development markers, and responsive setup. Its documentation also describes refresh/recalculation behavior and mobile scrolling considerations, including address-bar/resize behavior and optional `normalizeScroll()` tradeoffs. |
| PixiJS 8 | PixiJS provides WebGL/WebGPU 2D rendering, textures/assets, sprites, ticker-driven updates, resizing, renderer options, and texture garbage-collection controls. Applications initialize asynchronously and require explicit lifecycle/resource management. |
| Rive | Rive's web runtime loads authored `.riv` assets into Canvas/WebGL2 through JavaScript/WASM, offers state-machine interactivity, and requires runtime cleanup. It is a separate authoring/runtime workflow rather than a semantic image-reader model. |

Performance remains workload- and device-dependent. MDN notes that CSS and `requestAnimationFrame()` can perform similarly when both run work on the main thread; compositor-friendly properties and browser optimization matter. Therefore, technology selection must use a representative measurement rather than marketing performance claims.

## Project-specific comparison

The judgments below apply to a mobile manga reader composed primarily of raster image layers.

| Criterion | Native HTML/CSS/JS + WAAPI | Motion | GSAP + ScrollTrigger | PixiJS / Canvas / WebGL |
| --- | --- | --- | --- | --- |
| Semantic/accessibility fit | **Best.** Reading landmarks, controls, images, alternatives, and fallback remain ordinary DOM. | **Strong.** Retains DOM semantics if used on semantic elements, but motion behavior adds a library abstraction. | **Strong with discipline.** Animates DOM, but pinning/reparenting and choreography can complicate focus, reading flow, and cleanup. | **Weakest by default.** Canvas pixels do not provide the reader's semantic structure; accessible DOM equivalents must be maintained separately. |
| Responsive image layering | **Best.** Native `picture`, `srcset`, `sizes`, intrinsic dimensions, lazy loading, and CSS layout remain available per layer. | **Strong.** Uses DOM image layers; responsive behavior remains native. | **Strong.** Uses DOM image layers; timeline calculations need responsive refresh/setup care. | **Custom.** Textures, resolution, DPR, crop/layout, loading, and fallback become renderer responsibilities. |
| Timeline and scroll control | Good for bounded sequences with CSS, WAAPI, IntersectionObserver, and progressive scroll timelines; custom orchestration code grows with complexity. | Very good for React state, scoped sequences, interruptibility, gestures, and common scroll bindings. | Strongest candidate for dense authored timelines, labels, pin/scrub/snap, and editorial scroll choreography. | Fully programmable render loop, but timeline and scroll semantics must be designed and synchronized. |
| Mobile performance characteristics | Lowest runtime overhead and can use browser-optimized animation paths; many large image layers, paint-heavy effects, or poor lifecycle handling can still fail. | Hybrid execution can simplify efficient paths, but JavaScript fallbacks and React integration must be profiled under load. | Mature orchestration, but complex scroll measurement, pinning, refresh, and mobile viewport behavior increase tuning surface. | Can batch large 2D scenes on the GPU, but texture memory, upload cost, DPR, continuous ticking, context limits, and cleanup become primary risks. |
| Bundle/dependency cost | No animation dependency; only project code and assets. | Adds a tree-shakeable runtime and API dependency; actual transferred/executed cost must be measured for used imports. | Adds GSAP and any plugins used; actual build cost and licensing suitability must be verified for the selected distribution. | Adds a rendering engine plus renderer/asset code; likely the largest operational surface among core candidates, to be measured rather than assumed. |
| Testing and debugging | DOM behavior works naturally with Testing Library; browser DevTools expose layout, animations, network, accessibility, and performance. | DOM remains testable, but animation clocks, hooks, and cleanup need controlled tests and browser verification. | Timeline state and ScrollTrigger markers help visual debugging; lifecycle, refresh, and DOM mutations need integration tests. | Unit tests can cover scene logic, but pixel output, GPU behavior, context loss, accessibility parity, and memory require more browser/device testing. |
| Asset workflow | Existing raster layers and responsive derivatives can be used directly. | Same raster/DOM workflow as native. | Same raster/DOM workflow as native; authored timeline metadata may emerge. | Requires texture/spritesheet decisions, GPU-friendly dimensions, preloading, and explicit destruction/caching policy. |
| Lock-in | Lowest; standards-based keyframes and timing data are portable. | Moderate API coupling; underlying DOM assets remain portable. | Moderate-to-high timeline/plugin API coupling, especially for advanced choreography. | Highest architectural coupling because rendering, interaction, layout, and assets move into an engine model. |
| Justified when | Default while it meets frozen thresholds. | React-driven sequencing, gestures, scroll bindings, or interruption are materially simpler and safer than custom native orchestration. | The treatment genuinely requires complex, authored editorial timelines that native/Motion cannot express maintainably. | Measured DOM layer/effect limits cause failure and an equivalent Pixi spike provides a material win without breaking guardrails. |

## Other formats and runtimes

| Option | Actual fit for this experiment |
| --- | --- |
| Video | Useful for a fixed cinematic sequence, but weak for responsive per-layer composition, reader-controlled pacing, selective reduced motion, semantic panel access, and condition equivalence. It should not replace the reader. |
| GIF | Simple playback but poor control over pause, timing, layers, responsiveness, and reduced motion. It is unsuitable as the primary treatment format. |
| Lottie | Appropriate when motion is authored as a compatible vector/shape animation asset. It does not naturally solve raster manga layering, responsive reader semantics, or panel-level image delivery; adopting it would add an export/runtime workflow. |
| Rive | Appropriate for authored interactive vector/state-machine experiences. Its Canvas/WebGL/WASM runtime and `.riv` workflow are disproportionate for raster manga layers unless a specific interactive vector treatment is selected and measured. |

These formats may be used for a narrowly justified effect, but none is selected for the initial reader or technology spike.

## Measurable escalation triggers

All numerical pass/fail values are **OPEN** and must be frozen before profiling the spike.

### Escalate from native to Motion when

- the representative effect meets performance/fidelity needs but native sequencing, cancellation, restart, gesture, or React-state coordination exceeds the agreed complexity/defect threshold; and
- a same-effect Motion implementation materially reduces code/lifecycle risk without failing load, accessibility, or performance guardrails.

### Escalate from native/Motion to GSAP when

- the approved treatment requires timeline labels, dense overlaps, precise scrub/pin/snap behavior, or responsive editorial choreography that the simpler approach cannot maintain at the agreed craft threshold; and
- a same-effect GSAP implementation wins the measured complexity/fidelity comparison after mobile scroll and cleanup behavior are verified.

### Escalate to PixiJS when

- representative layer count or effects cause measured frame instability, main-thread/paint cost, or memory failure in the DOM approach; and
- a same-effect PixiJS implementation produces a material measured improvement on target devices while meeting load-weight, visual-fidelity, reduced-motion, accessibility-parity, testing, and cleanup thresholds.

Do not escalate because a demo looks smoother on a desktop development machine or because a library advertises a frame rate.

## Bounded technology spike

### Scope

After its asset and import gates pass, use the frozen Episode 1 page 2 treatment as the representative workload: three responsive whole-crop images in reading order, one-shot transform emphasis, the panel 1 opacity-only light echo, viewport entry/exit, decode gating, interruption/re-entry, and completion. Keep assets, keyframes, duration/easing intent, viewport, and interaction equivalent.

### Procedure

1. **Freeze criteria:** agree on devices, measurement method, craft rubric, and pass/fail thresholds before implementation results are reviewed.
2. **Build native first:** semantic DOM, responsive images, transform/opacity, WAAPI, IntersectionObserver, and scroll-driven animation only as progressive enhancement.
3. **Verify fallback:** content remains readable with JavaScript animation unavailable and with `prefers-reduced-motion: reduce`.
4. **Measure on hardware:** use representative physical low- and mid-tier mobile devices; calibrated throttling may supplement but not replace hardware evidence.
5. **Choose one challenger only if needed:** Motion for orchestration/gesture complexity, GSAP for authored timeline complexity, or PixiJS for a measured rendering bottleneck.
6. **Repeat identically:** compare the same workload, treatment, and measurement procedure. Record source/build versions and device/browser conditions.
7. **Decide:** retain native unless the challenger clears the pre-agreed escalation bar across the full scorecard.

### Scorecard

| Measure | Evidence to capture | Pass threshold |
| --- | --- | --- |
| Frame stability | Frame-time distribution, missed/dropped frames, and instability during scroll, entry, interruption, and asset decode | **OPEN** |
| Main-thread cost | Scripting, style/layout, paint, long tasks/animation frames, and work while scrolling | **OPEN** |
| Memory | Peak and steady-state memory, texture/image cost, and recovery after leaving/restarting the panel | **OPEN** |
| Load weight | Compressed transfer, executed JavaScript, animation runtime, and treatment asset bytes | **OPEN** |
| Visual fidelity | Predefined craft review of timing, easing, layer alignment, interruption, responsive crops, and scroll behavior | **OPEN** |
| Reduced motion | Complete readable state, no prohibited movement, and equivalent progression/outcome collection | No critical defect; detailed threshold **OPEN** |
| Semantic accessibility | Reading order, alternatives, focus/controls, zoom, and no canvas-only loss of information | No critical defect; detailed threshold **OPEN** |
| Implementation complexity | Treatment-specific code, concepts, cleanup paths, test seams, responsive branches, and reproducibility—not line count alone | **OPEN** |

The experiment's primary outcome remains **enjoyment**. This spike chooses an implementation path capable of delivering a valid treatment; it does not prove that motion improves enjoyment.

## Sources

Official documentation accessed 2026-08-28:

- MDN: [Using CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations)
- MDN: [Using the Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API)
- MDN: [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- MDN: [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- MDN: [CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations)
- MDN: [CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)
- MDN: [Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)
- Motion: [Motion for React](https://motion.dev/docs/react), [React animation](https://motion.dev/docs/react-animation), and [`useAnimate`](https://motion.dev/docs/react-use-animate)
- GSAP: [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- PixiJS 8.16: [README](https://github.com/pixijs/pixijs/blob/v8.16.0/README.md) and [Application guide](https://pixijs.com/8.x/guides/components/application)
- Rive: [Web runtime](https://rive.app/docs/runtimes/web/web-js)
- Lottie: [Web documentation](https://airbnb.io/lottie/#/web)

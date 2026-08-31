# Episode 1 Page 2 Panel Treatment Specification

**Treatment ID:** `ep01-e01p02-panel-emphasis-v1`

**Status:** APPROVED and implemented for the authorized engineering prototype; the verified derivative set is imported and its scoped human fidelity/accessibility/attribution review is approved, while physical-device evidence, broader final-publication credit confirmation, and final-study selection stay open.

## Decision

Use the three Spanish content panels from Pepper & Carrot Episode 1, page 2, in top-to-bottom reading order. The motion treatment is a one-shot, whole-crop camera emphasis with one non-semantic light echo on the first panel. Every panel is fully readable before, during, and after enhancement.

This specification freezes engineering behavior for a technology spike. A later explicit user decision authorized the repository import and prototype implementation recorded in the actual manifest; this specification still does not select final-study content, claim that motion improves enjoyment, or authorize recruitment.

## Non-goals

- No character, broom, liquid, sparkle, speech-bubble, or background separation.
- No invented depth layers, parallax, articulated motion, or AI-assisted segmentation.
- No pinning, scroll hijacking, autoplay loop, sound, artificial reading delay, or motion-gated progression.
- No animation framework dependency; use native CSS, IntersectionObserver, and WAAPI.
- No font distribution or SVG text re-rendering. The spike uses the official compiled Spanish page so text remains baked into the same source image.

## Exact source identity

| Item | Verified identity |
| --- | --- |
| Official source page | <https://www.peppercarrot.com/en/webcomic-sources/ep01_Potion-of-Flight__files.html> |
| Official Spanish source page | <https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html> |
| Art package | `ep01_Potion-of-Flight_art-pack.zip`, 83,013,227 bytes |
| Art package SHA-256 | `96d46cb7fe007d4e2eeba76d661e0d42eaab9435c450103801add1016bf40172` |
| Nested source | `E01P02.kra`, 33,233,067 bytes |
| Nested source SHA-256 | `4013f9964a8bd635e5546c055e8cde7f12ff9608f7110019819c39e9bff7d790` |
| Spanish compiled page | [`es_Pepper-and-Carrot_by-David-Revoy_E01P02.jpg`](https://www.peppercarrot.com/0_sources/ep01_Potion-of-Flight/hi-res/es_Pepper-and-Carrot_by-David-Revoy_E01P02.jpg), 2,211,946 bytes |
| Spanish compiled page SHA-256 | `a41885213a22e29579d28f4c932f2da6f9be1312f9fec4079647818f61a91638` |
| Canvas | 2481 × 3503 pixels, top-left origin |

The art-package hash was reverified before geometry inspection. The Spanish rendering URL was rediscovered from the official Spanish source page and visually checked against the source panel layout.

## Geometry evidence

The `E01P02.kra` frame shape contains six rectangles in an SVG `viewBox` of `0 0 1984.8 2802.4`. The SVG-to-canvas scale is exactly `1.25`.

| Shape | Classification | Transformed pixel extent including stroke |
| --- | --- | --- |
| `shape0` | Outer top frame | `x=[-0.583333, 2481.489768)`, `y=[-1.758270, 102.770841)` |
| `shape1` | Outer left frame | `x=[-1.458333, 102.958338)`, `y=[-0.476639, 3503.270943)` |
| `shape2` | Outer right frame | `x=[2380.979176, 2482.642440)`, `y=[-0.476639, 3503.270943)` |
| `shape3` | Outer bottom frame | `x=[-0.583333, 2481.489768)`, `y=[3400.979265, 3504.544243)` |
| `shape4` | Panel 1/2 separator | `x=[-6.583333, 2475.489768)`, `y=[1166.168633, 1234.710302)` |
| `shape5` | Panel 2/3 separator | `x=[-6.583333, 2475.489768)`, `y=[2231.168562, 2299.710231)` |

Raster validation of the embedded 2481 × 3503 merged image found fully white runs at columns `0–101` and `2381–2480`, and rows `0–101`, `1167–1233`, `2232–2298`, and `3401–3502`. These runs distinguish frame and separator pixels from visible content.

### Coordinate convention

All crop rectangles use zero-based source pixels as `(x, y, width, height)`. Bounds are half-open: a crop includes `x` through `x + width - 1` and `y` through `y + height - 1`.

The **content bounds** start immediately after each fully white frame run. The **specified crop** applies a two-pixel inset on every side. One pixel removes the observed anti-aliased transition at the upper/left inner frame edge; the second is a conservative scaling-safe inset that prevents white seams after responsive resampling.

## Exact crops

| Read order | Panel ID | Source content bounds | Safe inset | Specified crop | Inclusive last pixel | Output aspect ratio |
| ---: | --- | --- | --- | --- | --- | ---: |
| 1 | `e01p02-panel-01` | `(102, 102, 2279, 1065)` | `2px` each side | `(104, 104, 2275, 1061)` | `(2378, 1164)` | `2.144204` |
| 2 | `e01p02-panel-02` | `(102, 1234, 2279, 998)` | `2px` each side | `(104, 1236, 2275, 994)` | `(2378, 2229)` | `2.288732` |
| 3 | `e01p02-panel-03` | `(102, 2299, 2279, 1102)` | `2px` each side | `(104, 2301, 2275, 1098)` | `(2378, 3398)` | `2.071949` |

All specified crops fit the 2481 × 3503 canvas, preserve top-to-bottom reading order, and do not overlap. The safe inset does not intersect Spanish speech bubbles or lettering.

## Treatment contract

### Common behavior

- The crop wrapper keeps its specified aspect ratio and does not change layout during animation.
- `transform-origin` is `50% 50%` for all panels.
- Crop opacity remains `1` and `clip-path` remains `inset(0 0 0 0)` at every keyframe. Content is never concealed to create a reveal.
- Each crop begins and ends at `translate3d(0, 0, 0) scale(1)`.
- Segment A uses `cubic-bezier(0.77, 0, 0.175, 1)` for intentional on-screen movement. Segment B returns with `cubic-bezier(0.23, 1, 0.32, 1)` so the panel settles promptly. No `ease-in` or `transition: all` is permitted.
- Panels normally start independently when they meet the view-entry rule. If multiple unplayed panels qualify in the same observer callback, sort them by reading order and add a batch-local `60ms` delay per ordinal (`0ms`, `60ms`, `120ms`). Content is already visible, so this craft stagger never delays reading or progression and no panel waits for another animation to finish.
- Durations of `700–880ms` are intentional because this is rare, one-shot editorial camera motion rather than interface feedback. Controls and reading remain immediately responsive.

### Per-panel timeline

| Panel | Editorial purpose | Start state | Emphasis keyframe | Final state | Duration | Delay | Light overlay |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| `e01p02-panel-01` | Acknowledge the transformation beat without animating the broom or characters. | Offset `0`: identity transform; opacity `1`; clip `inset(0 0 0 0)` | Offset `0.42`: `translate3d(0, -6px, 0) scale(1.010)`; opacity `1`; clip unchanged | Offset `1`: identity transform; opacity `1`; clip unchanged | `880ms` | `0ms` alone; same-batch ordinal × `60ms` | One opacity-only light echo, defined below |
| `e01p02-panel-02` | Give the reaction/intervention beat a brief camera emphasis without tracking an isolated subject. | Offset `0`: identity transform; opacity `1`; clip `inset(0 0 0 0)` | Offset `0.45`: `translate3d(0, -4px, 0) scale(1.007)`; opacity `1`; clip unchanged | Offset `1`: identity transform; opacity `1`; clip unchanged | `760ms` | `0ms` alone; same-batch ordinal × `60ms` | None; overlay opacity remains `0` |
| `e01p02-panel-03` | Land the splash consequence with a restrained downward camera settle. | Offset `0`: identity transform; opacity `1`; clip `inset(0 0 0 0)` | Offset `0.40`: `translate3d(0, 4px, 0) scale(1.006)`; opacity `1`; clip unchanged | Offset `1`: identity transform; opacity `1`; clip unchanged | `700ms` | `0ms` alone; same-batch ordinal × `60ms` | None; overlay opacity remains `0` |

### Panel 1 light echo

The light is a non-semantic, pointer-inert overlay above the crop and below any application UI. It must be excluded from the accessibility tree.

- Background: `radial-gradient(circle at 48% 43%, rgba(255, 245, 179, 0.28) 0%, rgba(255, 238, 128, 0.10) 28%, rgba(255, 238, 128, 0) 58%)`.
- Compositing: normal source-over; no blend mode, blur, or filter.
- Timeline: opacity `0` at offset `0`, `0.16` at offset `0.35`, and `0` at offset `1`.
- Duration: `720ms`.
- Delay: `80ms` after the crop transform starts.
- Easing: `cubic-bezier(0.23, 1, 0.32, 1)`.
- It runs once with the crop and never loops.

## Trigger and lifecycle

### Progressive-enhancement setup

1. Server-rendered or initial HTML/CSS displays every crop at identity transform, opacity `1`, and no clipping or light.
2. JavaScript creates the observer, binds visibility/restart cleanup, evaluates the reduced-motion media query, and associates each image with its crop.
3. Only after setup succeeds, JavaScript adds the root enhancement class. That class may expose the opacity-zero light overlay, but it must not change crop visibility or layout.
4. A panel is animation-eligible only after its image decode resolves. A decode or setup failure skips motion and leaves the final readable state intact.

### View-entry rule

Use one `IntersectionObserver` with:

- `root: null`;
- `rootMargin: "0px 0px -10% 0px"`; and
- `threshold: [0, 0.6]`.

Start a panel when `entry.isIntersecting` is true, `entry.intersectionRatio >= 0.60`, its image has decoded, reduced motion is not requested, and the panel has not played in the current reading run. If decoding completes after the threshold callback, start only if the panel still satisfies the same intersection rule; otherwise wait for the next qualifying entry.

### Interruption, offscreen, and replay

- Scroll reversal while any part remains visible does not reverse or restart an animation.
- If intersection reaches `0` while running, pause at the current WAAPI time. Resume from that time on any visible re-entry; do not require the `0.60` threshold again after a run has started.
- Pause running animations while `document.visibilityState` is `hidden`. Resume only when the document is visible and the corresponding panel intersects the viewport.
- On completion, force the exact final values, remove temporary `will-change`, mark the panel played, and unobserve it.
- Re-entry after completion never replays automatically. The treatment plays once per panel per reading run.
- An explicit reader restart cancels running animations, restores identity/opacity `1`/no clip/light `0`, clears played state, and re-arms observation. A currently qualifying panel may then begin a new run immediately; content is never hidden during reset.
- If the reduced-motion preference changes to `reduce` during playback, cancel immediately into the final state, disable every overlay, and do not replay automatically if the preference later changes back.
- No animation state may delay controls, progression, completion, or outcome collection.

## Reduced-motion contract

When `prefers-reduced-motion: reduce` matches:

- do not create or play WAAPI crop animations;
- keep every crop at `translate3d(0, 0, 0) scale(1)`;
- keep opacity at `1` and clip at `inset(0 0 0 0)`;
- keep every light overlay at opacity `0` with no pulse or flicker;
- display content immediately after the same image-loading path; and
- preserve identical reading order, progression, controls, completion logic, and outcome collection.

No fallback opacity animation is justified because the content has no state change to communicate. Reduced motion is therefore fully static.

## Static-control parity matrix

| Dimension | Static control | Motion treatment | Required parity |
| --- | --- | --- | --- |
| Source | Same derivatives from the verified Spanish page hash | Same files | Byte-identical image assets |
| Crop geometry | Three specified rectangles in read order | Same | Exact coordinates and output dimensions |
| Responsive images | Same formats, quality, intrinsic dimensions, `srcset`, and `sizes` | Same | Identical network candidates |
| Layout | Same wrappers, aspect ratios, spacing, max width, and breakpoints | Same | No treatment-specific geometry |
| Text and image quality | Spanish text baked into the same compiled source | Same | No SVG/font substitution |
| Reading order | Panel 1 → panel 2 → panel 3 | Same | DOM order is unchanged |
| Loading | Panel 1 eager/high priority; panels 2–3 lazy/auto priority; all decode asynchronously | Same | Attributes and error behavior match |
| Controls and progression | Same | Same | Motion never gates interaction |
| Accessibility copy | Same title, descriptions, and alternatives | Same | Overlay is non-semantic and hidden from assistive technology |
| Instrumentation | Same reading/completion events with the static condition identifier | Same events with the motion condition identifier | No animation-detail behavioral tracking |
| Failure state | Readable identity-state crops | Same | JS/observer/WAAPI failure changes no content |
| Condition difference | No crop animation; no light | Defined one-shot transforms and panel 1 light echo | Motion/light only |

## Acceptance criteria

### Accessibility and behavior

- [ ] With JavaScript disabled or setup forced to fail, all three crops are immediately visible, readable, and in the correct order.
- [ ] With reduced motion active before load or enabled during playback, no transform, scale, clip, opacity, or light animation occurs.
- [ ] The overlay has no semantics, pointer handling, focus target, announcement, or contrast-critical information.
- [ ] Keyboard, browser text scaling, focus order, scrolling, and controls behave identically between conditions.
- [ ] Touch and zoom behavior on the selected physical devices is identical between conditions.
- [ ] No content, control, or completion state waits for an animation.
- [x] Spanish accessible descriptions were approved by Franccesco on 2026-08-30 for the engineering-prototype packet; the separately authorized import was already complete.

### Motion craft and performance

- [ ] Only crop `transform` and overlay `opacity` animate; no layout property, filter, blur, blend mode, or inherited CSS variable is animated.
- [ ] `will-change` is applied only immediately before playback and removed on completion, cancellation, or reduced-motion change.
- [ ] No timer, `requestAnimationFrame` loop, repeated keyframe, or third-party animation runtime is introduced.
- [ ] Observer callbacks are deterministic for threshold, pause, resume, once, restart, decode, and document-visibility cases.
- [ ] The treatment contributes zero layout shift and no animation-attributable long task over `50ms`.
- [ ] Normal-speed, slow-motion, frame-by-frame, and physical low-/mid-tier device review finds no flash, seam, dropped-frame cluster, illegible text, or visible final-state drift.

### Test contract for later implementation

- [ ] Unit checks assert all half-open crop bounds fit the 2481 × 3503 source and do not overlap.
- [ ] Behavioral checks prove baseline visibility before enhancement, exact observer options, decode gating, one-shot playback, offscreen pause/resume, explicit restart, and final-state cleanup.
- [ ] Reduced-motion checks prove zero animation objects are created and overlay opacity remains `0`.
- [ ] Static/treatment fixture checks prove both conditions resolve to the same source files, dimensions, layout, text, loading attributes, controls, and reading order.
- [ ] Visual checks compare crop edges and Spanish text against the official page at representative responsive sizes.

## Derived-asset requirements

The exact formats, settings, widths, operation order, naming, and 18-output matrix are defined in the [derivative plan](../asset-provenance/pepper-carrot-ep01-page2-derivative-plan.md) and its machine-readable [plan JSON](../asset-provenance/pepper-carrot-ep01-page2-derivatives.plan.json). The separately authorized temporary run and verified repository import are recorded in the [actual manifest](../asset-provenance/pepper-carrot-ep01-page2-derivatives.manifest.json). The 18 derivatives are stored under `public/content/pepper-carrot/episode-01/page-02`; the full-page source, archives, fonts, and temporary evidence remain outside the repository. Import verification required:

1. Derive all three crops only from the verified Spanish compiled page identified above.
2. Use the same derived files in static and motion conditions; do not create treatment-specific image content.
3. Record the crop rectangle, tool and version, deterministic command/procedure, format, quality setting, intrinsic dimensions, byte size, and SHA-256 for every master and responsive rendition.
4. Preserve the specified crop dimensions at the native master level. Responsive renditions must keep the exact aspect ratio and must not introduce treatment-specific sharpening, color, or compression.
5. Verify edge cleanliness, Spanish lettering, color, and compression visually against the official page before approval.
6. Do not import the source archive, `.kra`, full page, font, temporary render, or unrelated episode content.
7. Attach attribution and modification notices through the [Episode 1 provenance record](../asset-provenance/pepper-carrot-ep01-inspection.md).

## Remaining approval gates

- [x] Define derivative formats, quality settings, responsive widths, deterministic tooling contract, and machine-readable manifest PLAN.
- [x] Pin/add Sharp under separate authorization, generate outputs twice in temporary staging, and create the actual manifest with output hashes, sizes, dimensions, runtime evidence, and modification notices.
- [x] Approve human crop/render fidelity for the packet-covered responsive derivatives.
- [x] Approve the three Spanish accessible descriptions.
- [x] Approve the attribution and modification notice for the engineering-prototype derivative set.
- [ ] Confirm and retain applicable broader Hereva universe and source-page credits before final publication.
- [x] Approve repository import separately; explicit prototype authorization was granted and the verified 18-file set was imported.
- [ ] Select physical target devices and complete the later performance/craft review.

Final representative manga content and the main-study treatment remain OPEN.

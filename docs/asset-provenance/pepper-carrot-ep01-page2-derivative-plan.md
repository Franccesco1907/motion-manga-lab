# Pepper & Carrot Episode 1 Page 2 Derivative Plan

**Plan ID:** `pepper-carrot-ep01-page2-derivatives-v1`

**Status:** DEFINED — no source file was downloaded, no derivative was generated, and no output manifest exists.

## Decision

Plan the smallest credible responsive pipeline for approved treatment `ep01-e01p02-panel-emphasis-v1`: crop the verified Spanish compiled page first, then produce three widths in WebP and JPEG. This creates an ordered plan for **18 outputs** without authorizing Sharp installation, source acquisition, generation, repository import, or application implementation.

The machine-readable companion is [`pepper-carrot-ep01-page2-derivatives.plan.json`](./pepper-carrot-ep01-page2-derivatives.plan.json). It is a plan, not evidence that any output exists.

## Source and treatment identity

| Item | Frozen value |
| --- | --- |
| Treatment | [`ep01-e01p02-panel-emphasis-v1`](../spikes/ep01-page2-treatment-spec.md) |
| Source rendering | `es_Pepper-and-Carrot_by-David-Revoy_E01P02.jpg`, 2481 × 3503 |
| Source SHA-256 | `a41885213a22e29579d28f4c932f2da6f9be1312f9fec4079647818f61a91638` |
| Art package SHA-256 | `96d46cb7fe007d4e2eeba76d661e0d42eaab9435c450103801add1016bf40172` |
| Nested `E01P02.kra` SHA-256 | `4013f9964a8bd635e5546c055e8cde7f12ff9608f7110019819c39e9bff7d790` |
| Provenance | [Episode 1 inspection](./pepper-carrot-ep01-inspection.md) |
| License | CC BY 4.0; final attribution and modification notice remain approval gates |

## Output set

### Responsive widths

| Width | Purpose | Rule |
| ---: | --- | --- |
| `640` | Compact mobile candidate | Resize down only; never enlarge |
| `1280` | High-density mobile and moderate desktop candidate | Resize down only; never enlarge |
| `2275` | Native safe-crop ceiling | Preserve native crop width; never exceed it |

Three widths are enough to test responsive selection without proliferating formats or breakpoints before network evidence exists.

### Encoder settings

| Format | Role | Explicit settings | Rationale |
| --- | --- | --- | --- |
| WebP | Primary | `quality: 92`, `lossless: false`, `nearLossless: false`, `smartSubsample: true`, `preset: "picture"`, `effort: 6`, `force: true` | High quality protects painted gradients and baked lettering; smart subsampling protects colored edges. Maximum offline effort is acceptable for 9 planned outputs. |
| JPEG | Fallback | `quality: 94`, `progressive: true`, `chromaSubsampling: "4:4:4"`, `optimizeCoding: true`, `mozjpeg: false`, `force: true` | High quality and 4:4:4 reduce chroma bleed around colored comic detail and text. Progressive coding and optimized Huffman tables improve delivery without changing the source crop. |

The fallback is generated from the verified source through the same crop/resize/profile pipeline, not copied directly from the full-page JPEG.

### Why AVIF is deferred

AVIF would add 9 outputs, another encoder configuration, more review surface, and another runtime candidate before the spike has byte, decode, or visual-fidelity evidence. Reconsider it only if profiling shows a material payload benefit over the planned WebP at equivalent lettering, gradient, color, and target-device decode quality. Format count must shrink or stay stable unless evidence justifies expansion.

## Deterministic Sharp contract

Sharp is the planned implementation tool because its official API supports exact extraction before resize, explicit no-upscale resizing, controlled WebP/JPEG encoding, output metadata policy, and authoritative output `info`.

Do **not** select or invent a Sharp version in this plan. At generation time, pin the exact Sharp package version in the approved implementation change and record `process.version`, platform, architecture, the complete `sharp.versions` object, and its bundled libvips version. Output bytes are not considered reproducible across unrecorded Sharp/libvips/platform combinations.

### Operation order

Process planned outputs serially in this exact sort order: panel read order, width ascending (`640`, `1280`, `2275`), then format (`webp`, `jpeg`). Instantiate a fresh Sharp pipeline from the same verified input bytes for each output.

1. Read source bytes outside the repository staging tree.
2. Verify the source filename, SHA-256, and 2481 × 3503 dimensions; stop on any mismatch.
3. Apply `extract({ left, top, width, height })` using the frozen half-open crop rectangle.
4. Apply `resize({ width, fit: "inside", withoutEnlargement: true, kernel: "lanczos3", fastShrinkOnLoad: false })`.
5. Transform to and attach the built-in sRGB profile with `withIccProfile("srgb", { attach: true })`.
6. Apply the exact encoder settings for the planned format.
7. Produce a buffer with output `info`; do not write into the repository yet.
8. Verify `info.format`, `info.width`, `info.height`, channels, and byte count. Actual dimensions come from `info`, not from the mathematical expectation.
9. Hash the output bytes with SHA-256 and append one actual-manifest record.
10. Write to an isolated staging directory using the deterministic filename only after all checks for that buffer pass.
11. After all 18 outputs pass, rerun in a clean copy of the same recorded environment and require identical output hashes before import review.

CLI-neutral pseudocode:

```text
assert sha256(sourceBytes) == frozenSourceHash
assert sourceDimensions == (2481, 3503)

for plannedOutput in orderedPlan:
  pipeline = new Sharp(sourceBytes)
  pipeline.extract(plannedOutput.crop)
  pipeline.resize(plannedOutput.width, inside + no-enlarge + lanczos3 + no-fast-shrink)
  pipeline.convertAndAttachProfile(srgb)
  pipeline.encode(plannedOutput.format, exactSettings)
  data, info = pipeline.toBufferWithInfo()
  verifyInfoAgainstPlan(info)
  recordActualEvidence(data, info, runtimeVersions, procedureRevision)
  stageAtomically(plannedOutput.filename, data)
```

Changing operation order, crop values, width order, format order, encoder settings, metadata policy, filename template, or procedure revision creates a new plan version and requires regenerated evidence.

## Metadata and color policy

- Convert output pixels to the built-in sRGB profile and attach that ICC profile explicitly.
- Do not call `keepMetadata()` or retain source EXIF, XMP, IPTC, orientation, camera, timestamp, or unrelated density metadata.
- Verify that generated files contain the attached sRGB profile and no unexpected source metadata.
- Do not assume metadata behavior from defaults alone; record the Sharp/libvips environment and inspect actual outputs.
- Compare generated colors and gradients against the verified source on color-managed browsers and at least one physical mobile display before approval.

This balances portable color interpretation with metadata minimization. If profile attachment produces a measured compatibility or byte-cost problem, revise the plan explicitly rather than silently stripping it.

## Naming and expected output matrix

Filename template:

```text
pepper-carrot-ep01-e01p02-panel-{panel:02d}-w{width:04d}.{extension}
```

Extensions are `.webp` for WebP and `.jpg` for JPEG. Filenames are lowercase ASCII and unique within the plan.

Expected heights use nearest-integer aspect-ratio math only. They are review aids, not generated evidence. Every row remains `pending_generation` until actual Sharp `info` confirms dimensions.

| Order | Panel | Crop `(x,y,w,h)` | Width | Format | Expected dimensions | Filename |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | `01` | `(104,104,2275,1061)` | 640 | WebP | 640 × 298 | `pepper-carrot-ep01-e01p02-panel-01-w0640.webp` |
| 2 | `01` | `(104,104,2275,1061)` | 640 | JPEG | 640 × 298 | `pepper-carrot-ep01-e01p02-panel-01-w0640.jpg` |
| 3 | `01` | `(104,104,2275,1061)` | 1280 | WebP | 1280 × 597 | `pepper-carrot-ep01-e01p02-panel-01-w1280.webp` |
| 4 | `01` | `(104,104,2275,1061)` | 1280 | JPEG | 1280 × 597 | `pepper-carrot-ep01-e01p02-panel-01-w1280.jpg` |
| 5 | `01` | `(104,104,2275,1061)` | 2275 | WebP | 2275 × 1061 | `pepper-carrot-ep01-e01p02-panel-01-w2275.webp` |
| 6 | `01` | `(104,104,2275,1061)` | 2275 | JPEG | 2275 × 1061 | `pepper-carrot-ep01-e01p02-panel-01-w2275.jpg` |
| 7 | `02` | `(104,1236,2275,994)` | 640 | WebP | 640 × 280 | `pepper-carrot-ep01-e01p02-panel-02-w0640.webp` |
| 8 | `02` | `(104,1236,2275,994)` | 640 | JPEG | 640 × 280 | `pepper-carrot-ep01-e01p02-panel-02-w0640.jpg` |
| 9 | `02` | `(104,1236,2275,994)` | 1280 | WebP | 1280 × 559 | `pepper-carrot-ep01-e01p02-panel-02-w1280.webp` |
| 10 | `02` | `(104,1236,2275,994)` | 1280 | JPEG | 1280 × 559 | `pepper-carrot-ep01-e01p02-panel-02-w1280.jpg` |
| 11 | `02` | `(104,1236,2275,994)` | 2275 | WebP | 2275 × 994 | `pepper-carrot-ep01-e01p02-panel-02-w2275.webp` |
| 12 | `02` | `(104,1236,2275,994)` | 2275 | JPEG | 2275 × 994 | `pepper-carrot-ep01-e01p02-panel-02-w2275.jpg` |
| 13 | `03` | `(104,2301,2275,1098)` | 640 | WebP | 640 × 309 | `pepper-carrot-ep01-e01p02-panel-03-w0640.webp` |
| 14 | `03` | `(104,2301,2275,1098)` | 640 | JPEG | 640 × 309 | `pepper-carrot-ep01-e01p02-panel-03-w0640.jpg` |
| 15 | `03` | `(104,2301,2275,1098)` | 1280 | WebP | 1280 × 618 | `pepper-carrot-ep01-e01p02-panel-03-w1280.webp` |
| 16 | `03` | `(104,2301,2275,1098)` | 1280 | JPEG | 1280 × 618 | `pepper-carrot-ep01-e01p02-panel-03-w1280.jpg` |
| 17 | `03` | `(104,2301,2275,1098)` | 2275 | WebP | 2275 × 1098 | `pepper-carrot-ep01-e01p02-panel-03-w2275.webp` |
| 18 | `03` | `(104,2301,2275,1098)` | 2275 | JPEG | 2275 × 1098 | `pepper-carrot-ep01-e01p02-panel-03-w2275.jpg` |

## Actual-manifest contract

The eventual actual manifest must use a different filename and status from the `.plan.json`; it must never overwrite planned values with invented evidence. Each generated-output record requires:

| Area | Required actual fields |
| --- | --- |
| Manifest identity | schema version, status, plan ID/hash, procedure revision, generation timestamp |
| Source | canonical URL, filename, dimensions, byte count, SHA-256, art-package and nested-source hashes |
| Crop | panel ID/read order, coordinate convention, exact `left`, `top`, `width`, `height`, safe inset |
| Runtime | Node version, OS/platform, architecture, exact Sharp package version, complete `sharp.versions`, bundled libvips version, lockfile SHA-256 |
| Resize | requested width, fit, no-enlargement flag, kernel, fast-shrink flag, actual `info.width` and `info.height` |
| Encoder | format and every explicit option listed in this plan |
| Metadata/color | input profile observation, output profile, attach policy, stripped metadata classes, actual verification result |
| Output | filename, format, channels, actual dimensions, byte count, SHA-256 |
| Rights | license identifier/link, source/provenance links, complete attribution, modifications performed |
| Review | visual-fidelity status/reviewer/date, accessibility-description status/reviewer/date, byte/performance findings |

The actual manifest must contain one record per successfully staged output and exactly 18 records before import can be considered.

## Acceptance checks

### Visual fidelity

- [ ] Compare every output against the verified Spanish source at 100% and 200% zoom and at intended CSS sizes.
- [ ] Check speech-bubble text, onomatopoeia, high-contrast edges, glow gradients, dark texture, crop seams, and color shifts.
- [ ] Confirm actual dimensions from Sharp `info` match the plan; any mismatch blocks the run and requires plan review.
- [ ] Confirm the attached profile is sRGB and no unexpected source metadata remains.
- [ ] Require two clean runs in the same recorded environment to produce identical hashes.

### Accessibility descriptions

- [ ] Author and review one Spanish accessible description per panel in reading order.
- [ ] Use the same descriptions in static and motion conditions.
- [ ] Keep treatment-only light and camera movement out of the content description unless a separate study instruction requires disclosure.
- [ ] Confirm baked lettering remains legible at the smallest rendered candidate; do not rely on alt text to compensate for illegible image text.

### Byte and performance

- [ ] Record bytes for all outputs and paired WebP/JPEG comparisons at each panel/width.
- [ ] Investigate any WebP that is not smaller than its paired JPEG; do not import redundant primary output without justification.
- [ ] Confirm byte size generally increases with width within each panel/format; investigate inversions rather than silently accepting them.
- [ ] Verify responsive selection never requests a width above 2275 or enlarges a crop.
- [ ] Measure decode/render behavior and total selected payload on the later approved low-/mid-tier physical devices.
- [ ] Reconsider AVIF only after these measurements establish a material unresolved payload need.

## Approval, rollback, and deletion

- Generation requires separate authorization plus an implementation-time pinned Sharp version and dependency change.
- Generate into an isolated temporary staging directory, never directly into repository or public asset paths.
- If any source hash, dimension, output-info, metadata, reproducibility, accessibility, or fidelity check fails, delete all staged outputs and the incomplete actual manifest. Do not retain or import a partial set.
- Import is an atomic review decision for the approved outputs plus actual manifest, attribution, and accessible descriptions.
- Rollback removes every imported rendition and its manifest references together; static and treatment conditions must never point to different asset sets.
- Source archives, full-page source rendering, `.kra` files, fonts, and temporary comparison files must be deleted after evidence capture and must never be committed.

## Remaining gates

- [x] Formats, widths, encoder settings, operation order, metadata policy, deterministic names, and output matrix DEFINED.
- [x] Machine-readable manifest PLAN created with no fake output evidence.
- [ ] Separate authorization to pin/add Sharp and generate temporary outputs.
- [ ] Actual 18-output generation and actual manifest with dimensions, bytes, hashes, and runtime versions.
- [ ] Visual fidelity, metadata/color, accessibility-description, byte, and physical-device review.
- [ ] Complete attribution and modification notices for the generated set.
- [ ] Separate repository-import authorization.

Final-study content, final-study treatment, and AVIF remain OPEN.

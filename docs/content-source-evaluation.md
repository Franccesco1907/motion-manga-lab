# Content Source Evaluation for the Engineering Spike

**Decision status:** Episode 1 imported under explicit authorization for the bounded panel-level engineering prototype; scoped human description/fidelity/attribution review approved on 2026-08-30; final experimental content remains OPEN

**Evidence reviewed:** Verified official sources available on 2026-08-28

## Decision

Use **Pepper & Carrot Episode 1 provisionally for a bounded, panel-level engineering/animation spike**, under the explicit prototype import authorization recorded by the [actual manifest](./asset-provenance/pepper-carrot-ep01-page2-derivatives.manifest.json), the [empirical source inspection](./asset-provenance/pepper-carrot-ep01-inspection.md), and the [defined page 2 treatment](./spikes/ep01-page2-treatment-spec.md). The package can test responsive crops, panel progression, restrained overlay motion, static fallback, and attribution. Its flattened artwork does not support low-effort character parallax or articulated animation.

Do **not** select it as final study content. Pepper & Carrot's official site describes it as a free/libre/open-source webcomic, not manga. It is a Western webcomic influenced by manga/anime and is not representative conventional manga for the selected population of regular manga readers.

## Bounded search status

This evaluation is **not an exhaustive open-comic or open-manga search**. The available research established Pepper & Carrot's suitability, but a broad three-candidate comparison was not completed because the delegated research actor reached its usage limit. No unverified alternative is inferred or recommended here.

The decision is therefore narrow: Pepper & Carrot is a provisional engineering source, while final experimental excerpts remain OPEN pending a separate representativeness and rights decision.

## Acceptance criteria

A source may enter the engineering spike only when current authoritative evidence and exact-file inspection establish that:

- redistribution and adaptation of the artwork are permitted for the intended use;
- attribution, change-notice, license-link, and any other obligations can be satisfied;
- canonical source and rendered files are available from a current official location;
- the chosen page has technically usable layers or can be separated without making reconstruction the main work;
- lettering/text and artwork workflows are understood for the selected language;
- source resolution supports responsive crops and treatment/static parity;
- a bounded panel/effect can test animation, reduced motion, accessibility, loading, and mobile performance; and
- the source's classification and limits on study representativeness are stated accurately.

Final study content has an additional criterion: it must be defensibly representative for regular manga readers. Passing the engineering criteria does not satisfy that requirement.

## Verified Pepper & Carrot facts

| Area | Verified fact | Official source |
| --- | --- | --- |
| Identity | The project describes Pepper & Carrot as a free/libre/open-source **webcomic**. It does not establish the work as manga. | [Official About page](https://www.peppercarrot.com/en/about/index.html) |
| Copyright and license | Artwork copyright is David Revoy and the official content license is Creative Commons Attribution 4.0 International. | [Official About page](https://www.peppercarrot.com/en/about/index.html), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Episode sources | The official files area states that source files are shared, lists every episode, and links episode-level source/render files. | [Official episode files](https://www.peppercarrot.com/en/files/episodes.html) |
| Reusable panel art | The official all-panels area provides high-resolution `gfx-only` pages without speech bubbles for cropping and panel reuse. | [Official all-panels files](https://www.peppercarrot.com/en/files/all-comic-panels.html) |
| Production workflow | Official credits identify Krita for artwork and Inkscape for vectors/speech bubbles. Source availability does not by itself prove that a selected `.kra` contains clean animation-ready layers. | [Official About and credits](https://www.peppercarrot.com/en/about/index.html) |
| Language workflow | Episode 1's Spanish package contains page SVGs with separate `artwork`, `speechbubbles`, and `txt` layers, a transcript, and credit metadata. Its linked artwork is 992 × 1401, while the SVG canvas and full render are 2481 × 3503. The SVG references unembedded Lavi and Arial fonts. | [Episode 1 inspection](./asset-provenance/pepper-carrot-ep01-inspection.md), [official Spanish source page](https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html) |
| Episode 1 layer readiness | Pages 1–3 have a vector frame layer plus one or two broad paint layers. They contain no subject hierarchy, masks, groups, or isolated character/effect layers. | [Episode 1 inspection](./asset-provenance/pepper-carrot-ep01-inspection.md) |
| Source authority | The archived `Deevad/peppercarrot` README distinguishes GPLv3+ scripts from CC BY 4.0 artwork and documents `.kra`/SVG workflows, but the current official site and Framagit are authoritative for acquisition and licensing decisions. | [Official site](https://www.peppercarrot.com/en/about/index.html), [current Framagit group](https://framagit.org/peppercarrot) |

## License and attribution obligations

CC BY 4.0 permits sharing, redistribution, and adaptation, including for commercial purposes, provided its conditions are met. For this project, the attribution record should at minimum:

- identify **Pepper & Carrot** and David Revoy;
- link the exact official source used;
- link [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
- retain relevant credits supplied with the selected episode/language source;
- indicate crops, layer extraction, cleanup, translation use, animation, and other modifications;
- avoid implying endorsement by the creator or contributors; and
- avoid applying legal or technical restrictions that prevent recipients from exercising the licensed rights.

Place a concise attribution near the study or its About/credits surface, and keep complete provenance in the repository's derived-asset manifest.

This document is a project risk and provenance record, **not legal advice**. Review the exact files, supplied notices, intended deployment, and attribution before publication.

## Technical suitability

Episode 1 is conditionally suitable for the spike because:

- the official packages and Spanish renderings are canonical, intact, and hashable;
- pages 1–3 provide 2481 × 3503 sRGB source canvases and explicit vector panel frames;
- official high-resolution `gfx-only` and compiled renderings support panel crops without OCR;
- Spanish speech bubbles and text remain editable in named SVG layers; and
- page 2 provides the strongest bounded sequence for one-shot whole-crop camera emphasis and a restrained light echo.

The inspection also establishes a hard limit: characters, props, backgrounds, and painted effects are flattened into broad paint layers. Subject-level parallax or articulated motion would require manual reconstruction and is rejected for this spike. The Spanish SVGs reference Lavi and Arial without embedding them; Lavi is separately offered under GPLv3 by the official font repository. The spike therefore uses the official compiled Spanish rendering and avoids font delivery. The engineering-prototype import and packet-covered human crop/export fidelity review are complete; physical-device evidence, broader final-publication credit confirmation, and final-study selection remain separate gates.

## Representativeness caveat

The spike asks whether the proposed web stack can deliver a credible animated panel while preserving static reading, reduced motion, accessibility, and mobile performance. It does not test whether regular manga readers enjoy the treatment.

Pepper & Carrot must be described as a Western open webcomic, not manga. Final study excerpts remain OPEN until conventional manga representativeness, excerpt comparability, reader familiarity, language, rights, and attribution are resolved.

## Exact next acquisition and verification checklist

The explicit engineering-prototype authorization permitted import after deterministic output verification while initially leaving human review items open. Franccesco approved the packet-covered descriptions, visual fidelity, and attribution/modification notice on 2026-08-30. The unchecked device, broader-credit, and final-study items below continue to gate study/publication claims:

- [x] Select Episode 1, inspect Spanish pages 1–3, and recommend page 2 for a bounded panel-level effect.
- [x] Inspect the actual `.kra` files for layer boundaries, groups, masks, blend modes, linked resources, fonts, color profile, and archive integrity.
- [x] Verify the license and creator/contributor/translation credits supplied with the selected source.
- [x] Record canonical source URL, direct file URLs, access date, filenames, byte sizes, server modification dates, and integrity hashes.
- [x] Define a concise and full attribution approach in the provenance inspection.
- [x] Approve the exact attribution and modification notice for the engineering-prototype derivative set.
- [x] Define exact page 2 crop coordinates, timing, trigger, interruption/re-entry behavior, reduced motion, and static parity.
- [x] Define WebP/JPEG settings, responsive widths, deterministic Sharp procedure, metadata policy, filenames, and the 18-output manifest PLAN.
- [x] Document every performed derivative modification and explicitly record that no cleanup, segmentation, translation/font re-rendering, or baked animation was performed.
- [x] Generate the approved outputs twice in temporary staging and create the actual derived-asset manifest mapping each output to its source, license, credits, modifications, actual dimensions/bytes/hash, runtime versions, and generation procedure.
- [x] Verify the exact Spanish text/vector structure, translation credits, font references, linked artwork, and source dimensions.
- [x] Select the official high-resolution compiled Spanish rendering for the spike; do not distribute or re-render the separately licensed fonts.
- [x] Under separate authorization, pin/add Sharp, generate into temporary staging, and verify source identity, crop geometry, text/edge fidelity through bounded local agent inspection, metadata, compression metrics, and reproducibility.
- [x] Complete the packet-covered human color-managed fidelity review and Spanish accessible-description review.
- [ ] Complete target-device payload, decode/render, performance, dropped-frame, touch/zoom, and motion-craft checks.
- [ ] Confirm applicable broader Hereva universe and source-page credits before final publication.
- [x] Confirm that static and motion modes use the same imported source/crop files, dimensions, color, and reading order.
- [x] Approve and verify the 18-file import for the local engineering prototype; study-build approval remains separate.

Spike provenance must remain separate from final-study content provenance.

## Sources

Official sources accessed 2026-08-28:

- Pepper & Carrot About, credits, and license: <https://www.peppercarrot.com/en/about/index.html>
- Pepper & Carrot episode files: <https://www.peppercarrot.com/en/files/episodes.html>
- Pepper & Carrot high-resolution `gfx-only` panels: <https://www.peppercarrot.com/en/files/all-comic-panels.html>
- Current Pepper & Carrot Framagit group: <https://framagit.org/peppercarrot>
- Creative Commons Attribution 4.0 International: <https://creativecommons.org/licenses/by/4.0/>
- Episode 1 official source files: <https://www.peppercarrot.com/en/webcomic-sources/ep01_Potion-of-Flight__files.html>
- Episode 1 official Spanish source files and credits: <https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html>
- Pepper & Carrot fonts and licenses: <https://www.peppercarrot.com/en/fonts/index.html>

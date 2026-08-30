# Pepper & Carrot Episode 1 Source Inspection

**Inspection date:** 2026-08-28

**Decision:** Conditionally suitable for a bounded, panel-level engineering spike; page 2 treatment and derivative PLAN are DEFINED, but dependency addition, generation, import, and implementation remain blocked.

No source archive, artwork, font, crop, or derivative from this inspection is stored in the repository.

## Scope

This inspection covers the official source packages and Spanish renderings for **Episode 1: The Potion of Flight**. It answers whether pages 1–3 can support a small native DOM/CSS/WAAPI engineering spike without turning asset reconstruction into the main work.

It does not approve Episode 1 as final-study content. Pepper & Carrot remains a Western open webcomic and is not representative conventional manga for the selected population of regular manga readers.

## Canonical sources and integrity

The direct package URLs below were discovered from the [official Episode 1 source page](https://www.peppercarrot.com/en/webcomic-sources/ep01_Potion-of-Flight__files.html), not inferred from filenames. Files were downloaded only to `/tmp/opencode/motion-manga-lab-ep01-inspection`, tested as archives, and inspected without opening them in an authoring application.

| File | Official URL | Bytes | SHA-256 | Server `Last-Modified` |
| --- | --- | ---: | --- | --- |
| `ep01_Potion-of-Flight_art-pack.zip` | [Art package](https://www.peppercarrot.com/0_sources/ep01_Potion-of-Flight/zip/ep01_Potion-of-Flight_art-pack.zip) | 83,013,227 | `96d46cb7fe007d4e2eeba76d661e0d42eaab9435c450103801add1016bf40172` | 2023-10-06 21:06:57 GMT |
| `ep01_Potion-of-Flight_lang-pack.zip` | [Language package](https://www.peppercarrot.com/0_sources/ep01_Potion-of-Flight/zip/ep01_Potion-of-Flight_lang-pack.zip) | 8,588,151 | `c0ee8ea1f9134c1b584702bb74950e2bba9d98294bb7e649eb941a448291ef51` | 2026-07-09 07:37:15 GMT |

Both outer archives and every inspected nested `.kra` archive passed ZIP CRC checks. The official page was served by site build `202606a`; no immutable repository commit could be verified because the linked Framagit route returned an Anubis bot challenge. The package hashes above are therefore the operative inspection identifiers.

The three official Spanish compiled renderings were also inspected visually from the direct URLs linked by the [Spanish Episode 1 source page](https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html). They were temporary inspection copies, not proposed repository assets.

## Krita package findings

The art package contains six `.kra` files: cover, header, pages 1–3, and credits. Pages 1–3 use an sRGB built-in profile at 2481 × 3503 pixels. Their relevant structure is:

| Page | Nodes | Frame geometry | Practical finding |
| --- | --- | --- | --- |
| `E01P01.kra` | `frame` shape layer, `2015-extension` paint layer, `bg` paint layer | Six vector rectangles | Three visible panels, but subjects and effects are flattened into broad paint layers. |
| `E01P02.kra` | `frame` shape layer, `2015-extension` paint layer, `bg` paint layer | Six vector rectangles | Three visible panels and the strongest motion cues, but no isolated broom, character, sparkle, or liquid layers. |
| `E01P03.kra` | `frame` shape layer, `bg` paint layer | Four vector rectangles | Full-page payoff composition; foreground subjects and background are not separated. |

All listed nodes are visible, unlocked, full opacity, and use normal compositing. The XML contains no group layers, masks, filter masks, text layers, or animation-ready subject hierarchy. The `2015-extension` paint layer on pages 1 and 2 is not a useful semantic separation of actors or effects.

The embedded merged images match the 2481 × 3503 document dimensions. Alpha-channel inspection found every pixel fully opaque on all three pages: the non-transparent bounds are the entire canvas, with no transparent or partially transparent pixels. Panel use therefore requires explicit rectangular cropping or clipping rather than relying on intrinsic transparent bounds. The language package's linked `gfx` PNGs are lower-resolution 992 × 1401 RGB renderings, so they should not be mistaken for full-resolution art layers.

**Conclusion:** the package supports panel geometry, high-resolution rendering, and crop-based camera treatment. It does not support low-effort character parallax or articulated motion. Manual segmentation for that purpose would fail the project's requirement that reconstruction not become the main work.

## Spanish text workflow

The language package contains Spanish SVGs for the header, pages 1–3, and credits, plus a transcript and `info.json` credit record. Each page SVG is 2481 × 3503 and has three named Inkscape layers:

1. `artwork` — a linked `../gfx_Pepper-and-Carrot_by-David-Revoy_E01P0X.png` image;
2. `speechbubbles` — vector bubble geometry; and
3. `txt` — editable vector text.

All three linked page images exist in the package. The SVGs reference **Lavi** and **Arial**, but the package embeds neither font. The [official Pepper & Carrot fonts page](https://www.peppercarrot.com/en/fonts/index.html) identifies Lavi as the project's main speech-bubble font and licenses it under GPLv3. Any future distribution or web embedding of the font therefore requires a separate licensing and delivery decision. Using the official compiled Spanish rendering avoids that font dependency; reconstructing a high-resolution text overlay requires an explicit fidelity check.

The package records these episode-language credits:

- art and scenario: David Revoy;
- Spanish translation: Juanjo Faico; and
- contributions: Andrej Ficko and Hồ Nhựt Châu.

The exact official source page also supplies broader Hereva universe credits that must be retained in the full provenance record if the episode is republished.

## Page suitability

| Page | Editorial role | Spike suitability |
| --- | --- | --- |
| Page 1 | Setup across three stable horizontal panels | Suitable for restrained whole-crop camera emphasis; weak for testing effect timing. |
| Page 2 | Transformation, pursuit, and splash across three panels | **Selected candidate.** It provides clear sequential beats and strong existing motion cues for one-shot whole-crop emphasis plus a subtle light echo. |
| Page 3 | Single-page visual payoff | Useful as a static ending or simple camera move, but poor for testing sequential panel progression. |

The selected bounded candidate is **Spanish page 2**, limited to whole-crop transforms and one non-semantic light echo. Exact frame geometry, crop rectangles, timing, view-entry trigger, lifecycle, reduced-motion behavior, and static parity are now defined in the [page 2 treatment specification](../spikes/ep01-page2-treatment-spec.md). The treatment does not animate isolated characters, the broom, liquid, or painted effects because those elements are flattened.

## Attribution plan

A concise product credit should identify the work, episode, creator, translator, license, official source, and modifications. A suitable starting form is:

> “Pepper & Carrot — Episode 1: The Potion of Flight,” art and scenario by David Revoy; Spanish translation by Juanjo Faico; contributions by Andrej Ficko and Hồ Nhựt Châu. Licensed under CC BY 4.0. Cropped and animated for an engineering prototype; no endorsement implied.

The final credit must link the [official Spanish source page](https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), retain the source page's applicable episode and universe credits, and enumerate actual modifications after assets are prepared.

## Gate status

- [x] Canonical official package URLs, access date, byte sizes, server modification dates, and SHA-256 hashes recorded.
- [x] Package and nested archive integrity verified.
- [x] Pages 1–3 inspected for dimensions, color profile, alpha bounds, layers, masks, compositing, and panel geometry.
- [x] Spanish SVG structure, linked artwork, transcript, credit metadata, and font references inspected.
- [x] License, core episode credits, representativeness limit, and attribution approach documented.
- [x] A technically bounded page and effect class recommended without creating derivatives.
- [x] Exact crop coordinates, timing, trigger, reduced-motion behavior, and static parity DEFINED in the engineering treatment specification.
- [x] Derivative formats, settings, widths, deterministic procedure, and 18-output manifest PLAN DEFINED without generation.
- [ ] Actual derived-asset manifest created with Sharp `info`, output hashes/bytes/dimensions, runtime versions, source mapping, and modification notices.
- [ ] High-resolution crop and Spanish text rendering fidelity verified after preparation.
- [ ] Attribution text updated with the modifications actually performed and approved before publication.

Repository import remains blocked until the unchecked items are completed. The [treatment specification](../spikes/ep01-page2-treatment-spec.md) freezes engineering behavior, while the [derivative plan](./pepper-carrot-ep01-page2-derivative-plan.md) defines generation requirements only. Neither authorizes dependency addition, output generation, import, or implementation.

## Verification commands

Inspection used `sha256sum`, `stat`, `unzip -l`, `unzip -t`, and Python standard-library `zipfile` plus XML parsing. No embedded content was executed, no authoring software or new dependency was installed, and no layer or derivative was exported.

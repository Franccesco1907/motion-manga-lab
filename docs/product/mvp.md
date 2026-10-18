# User-directed manga animation MVP

**Status:** The owner accepted the local/private creator MVP as **v0.1.0**. Its [release contract](releases/v0.1.0.md) freezes the current local workflow, not the broader public product proposed on 2026-10-04. D1–D7 below remain OPEN for that broader scope.

## Closed local v0.1.0 scope

| Area | Local release contract |
| --- | --- |
| Content and chapters | Create local work from owner-supplied still JPG/PNG/WebP pages; preserve original bytes and arrange pages in ordered chapters. No source catalog or new import format. |
| Selection | Manual rectangle and add/erase brush controls. Selection geometry is separate from drawing movement; a manual mask is not a semantic cutout or perfect background reconstruction. |
| Motion | Bounded **Rotate / sway**, **Move**, **Pulse / scale** and finite **Repeat movement**; exact fields and independent-axis stretch remain in **Advanced**. Motion stays within the existing encoded clip, not an endless loop. |
| Editing and preview | One shared canvas, explicit **Preview changes**, Before/After comparison, reversible content edits and raw-field save/reopen. Before means the prior successful preview, or a labeled original fallback; it is not always the original. |
| Persistence and download | Private save/reopen and last valid preview retention; **Download animation** retrieves the exact current **After** WebM without rendering or transcoding. It excludes the player's extra three-play loop. The browser owns file saving. |
| Operation | The runbook's local account-store workflow, preflight/start and stopped-service backup/restore. Existing private reading, local snapshots and optional unlisted guest reading are not Internet deployment. |

Use the [local MVP runbook](local-mvp-runbook.md) to operate the release and [execution status](local-execution-status.md) for implementation details. Optional model assistance is not required or newly authorized; the supported local launcher keeps it unavailable. The owner reports that the workflow works. This is owner acceptance, not a varied-content, third-party-user, physical-device, accessibility or research finding.

The existing Linux/procfs and FFmpeg requirements, upload/working-image/resource limits and bounded scale/stretch factors are **supported v0.1.0 constraints**. They are not promises of arbitrary-manga quality or the final limits of a future hosted product. The release contract is the concise source of truth for those bounds.

## Broader product planning baseline — not this release

The earlier proposal lets users upload their own manga, correct suggested or manual selections, direct movement and optionally publish a reviewed reading experience. It calls for broader usability, visual-fidelity, accessibility and performance evaluation. AI would assist selection, not replace creative direction or guarantee correct results.

[Architecture proposal](architecture.md) → [implementation plan](implementation-plan.md) retain this broader planning context. The [development-plan gateway](../development-plan.md) separates both product scopes from the preserved research protocol. Optional public publication, page/panel subdivision, reading-direction policy and general evaluation thresholds remain future decisions, not omissions from local v0.1.0 acceptance.

The independent A workbench supplied bounded engineering experience; it is not a deployed multi-user product or a required clean-clone input. Subsequent main-application implementation added scale/stretch, reversible editing, persistence, local reading and operational recovery. Historical laboratory observations do not establish publication rights, general model quality or mobile-device readiness.

## Open decisions and earliest blocking milestone

**All D1–D7 remain OPEN for the broader/public product.** The release contract settles only the current local configuration and owner workflow; it does not close these general policies or M5 evaluation thresholds. The user owns scope/policy decisions; technical choices need evidence and explicit selection. Milestones below refer to the broader [implementation plan](implementation-plan.md), not local-release blockers.

| ID | Decision to resolve | Blocks |
| --- | --- | --- |
| D1 | Upload size/resolution/count limits; animated-image handling; working quality; page/panel organization; chapter model and right-to-left/left-to-right/vertical reading behavior | M1 contracts, M2 vertical slice |
| D2 | Owner identity/account flow, private access, reader authentication and publication visibility/discoverability | M1 ownership contract; deployed M2; M4 sharing |
| D3 | First-release transforms, including uniform scale and nonuniform stretch; duration/repetition limits and preview fidelity | M1 contract vocabulary; M2 editor acceptance |
| D4 | Reader playback policy, target browsers/devices and accessibility/performance thresholds | M2 reader behavior; M5 release evidence |
| D5 | Upload/publication permission checks, attribution, reporting/takedown, retention and deletion rules | Public upload or sharing in M4; policy work is not legal clearance |
| D6 | Storage, API/job deployment, authentication implementation, GPU provision, cost limits and model/dependency license suitability | M1 concrete integration; hosted processing or public release |
| D7 | Rights-cleared varied evaluation set, defect severity, acceptable manual correction effort and release thresholds | M2 test design; M5 quality decision |

## Not promised by local v0.1.0

Automatic narrative direction for arbitrary manga, perfect reconstruction behind moving parts, public account/platform deployment, cloud services, a source catalog, payments, automatic-model work, PDF/CBZ or additional export formats, social-network features or a measured improvement in reader enjoyment. The existing exact-WebM download is included; release closure does not authorize separate artwork acquisition/generation work, new dependencies, paid services, deployment or changes to research `OPEN` decisions.

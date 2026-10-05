# Explicit local affine renderer version 2

This backend increment adds uniform drawing scale and independent-axis stretch behind **draft schema version 2**. It does not change the byte-preserved legacy renderer or silently migrate saved version-1 drafts. These are bounded local engineering capabilities, not general visual-quality or research acceptance.

## Version and UI boundary

- Existing schema-1 drafts use `legacy-a-v1` and remain valid. Old job/artifact records without version metadata are read as version 1.
- Schema-2 drafts use `affine-a-v2`; jobs and immutable artifacts record `draftSchemaVersion` and `rendererVersion`. Worker output and reviewed reading snapshots must match those versions as well as source/draft identity.
- Both versions retain the original-byte SHA-256 and `working-image-v1` normalized working-image coordinates. Working-source normalization is not reinterpreted.
- The frozen browser editor still offers only its four legacy actions. This PR is independently usable through the protected local draft/render API, not complete browser scale/stretch controls. Those controls follow in a dependent UI change; a schema-2 draft must not be presented as editable by the current schema-1 editor.

## Raw motion contract

The existing guarded `PUT /api/local-projects/<page-id>/draft` accepts the explicit schema-2 draft with its optimistic `expectedRevision`. Do not omit current source identity or change selection geometry to express a drawing transform.

| Field | Meaning |
| --- | --- |
| `motion.type: scale` | Uniform transform using raw string `motion.scale` |
| `motion.type: stretch` | Independent raw strings `motion.scaleX` and `motion.scaleY` |
| `motion.anchorX`, `anchorY` | Explicit normalized working-image pivot, each within 0–1 |
| Selection rectangle/brush fields | Unchanged selection geometry and actual mask, not drawing scale |
| Timing/easing/end state | Existing raw timing fields; finite linear/smooth/ease-in interpolation and hold/reset |

Incomplete bounded factor strings remain saveable without coercion. Rendering requires complete finite positive target factors **0.75–1.25** on each active axis; zero, negative, nonfinite and out-of-range values fail explicitly. Identity factor 1 preserves original RGB exactly.

Without `period`, a transform moves once from identity to its target over `duration`, then holds or resets as selected. An explicit `period` enables a finite sinusoidal pulse around identity: the target and opposite excursion remain within the same positive bounds, and the final pulse returns to identity. More than one cycle requires a period; repetition is finite and must fit the scene. Pulse timing is sinusoidal rather than applying the one-shot easing curve.

## Fidelity and resource bounds

Inverse affine sampling uses premultiplied mask-weighted RGB to avoid pulling neighboring background colors into actor edges. Declared support includes the original erase mask and conservative finite transform/pulse extrema, clipped to the image. Protected and foreground pixels are restored exactly, and pixels outside declared support remain unchanged. Hidden-background interpolation is still approximation, not reconstructed truth.

Existing bounds remain: 1280-pixel working edge, 16 regions/eight moving actors, 200,000 aggregate moving-source pixels, bounded brush work, six seconds, 24 fps, 144 frames, worker memory/time supervision and 32 MiB output. Scaling or an invalid/out-of-bounds anchor cannot bypass source-mask or worker admission checks. No original bytes, models, assets or dependencies are modified.

Synthetic tests cover asymmetric marker locations, identity/v1 frame parity, easing/finite pulses/hold/reset, border clipping, premultiplied edges, protected/foreground RGB, raw draft reopen and strict rejection. A native HTTP test saves schema 2, starts its owned worker, decodes a finite four-frame WebM and captures a matching reviewed snapshot; mismatched renderer versions cannot publish locally. This is not varied-content/device certification or a claim that public MVP gates are complete.

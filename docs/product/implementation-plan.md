# Deliver the authoring-to-reader MVP in observable increments

**Status:** Part of the user-accepted planning baseline, 2026-10-04. Proposed details and OPEN decisions remain as labelled. Documentation only; begin implementation after the user authorizes the next work unit under the [scope](mvp.md). No dates or estimates are committed.

Each work unit should include its behavior tests, interface changes, recovery path and user guidance together. Keep laboratory evidence and user data intact; do not split implementation into untestable layers or start a second unrelated editor.

## Milestones and exit evidence

| Milestone | Work and dependencies | Observable acceptance |
| --- | --- | --- |
| **M0 — Resolve first-unit decisions** | Planning baseline accepted; resolve the D1–D7 choices needed for the next unit, not every future detail at once. | User-approved first vertical slice, explicit deferred decisions and acceptance thresholds; implementation authorization recorded separately. |
| **M1 — Establish reusable contracts** | Depends on M0 and relevant D1/D2/D6 choices. Inventory and explicitly promote approved lab source, tests and provenance references before clean-clone parity testing. Define versioned project/page/region/plan/job/artifact contracts, owner boundary and original/working-source handling. Isolate A rendering and model adapters from fixture/local-path assumptions. Separate test runners. | Approved integration inputs are versioned or reproducibly provisioned without private data or unauthorized assets. Contract tests reject mismatched versions, invalid geometry and unsafe asset references. An authorized fixture preserves selected-A behavior in a clean clone. Existing reader and local lab still run unchanged. |
| **M2 — Complete one-page vertical slice** | Depends on M1 and D3/D4/D7 acceptance decisions. Inside the main app: upload one authorized page, select/correct parts, direct supported actions, save/reopen, render and read privately with a static fallback. | A creator completes this path without terminal commands or hidden per-part save prerequisites. Incomplete edits survive part changes; save/job errors retain recoverable drafts. A reopened project retains its selection and movement. No claim of a complete MVP yet. |
| **M3 — Organize chapters and multiple pages** | Depends on M2 and resolved D1 organization rules. Add batch import, ordering, chapter navigation and page-local editing/processing. | Order survives reopening and matches the reader. A page failure does not discard successful uploads or other page edits. Page/source changes invalidate only dependent output; agreed RTL/vertical behavior is tested. |
| **M4 — Publish safely for other readers** | Depends on M3 and D2/D5/D6. Add explicit reviewed publication, replacement and unpublication, with ownership checks and artifact access rules. | A second authorized reader sees the intended published snapshot but cannot edit it or access private drafts. Later draft edits do not change published reading. Stale/failed renders cannot publish; unpublication follows the agreed access/cache policy. |
| **M5 — Validate and gate release** | Depends on complete journey and D4/D7 thresholds; security/content rules from M4 remain mandatory. Test diverse content and failure/recovery behavior on agreed devices. | Recorded usability, fidelity, accessibility, performance and security results meet predefined criteria. Failures have fixed behavior or explicit safe/static fallback; no generalization or study-benefit claim exceeds the evidence. |

M1–M3 can use a bounded development deployment; **no public upload/sharing launch precedes the relevant ownership, resource, rights-policy and security gates**. Infrastructure choices must not be inferred from the existing local machine or subscription allowances.

## First implementation work unit

After authorization, begin M1 by inventorying local lab source, tests and provenance references and explicitly approving the subset to promote into version control. Do not include private projects, model weights or binaries without separate authorization. This documentation change includes none of those experimental inputs.

Then define a versioned page/region/motion contract and an A renderer adapter test using an authorized, reproducibly available fixture. Resolve the working-coordinate, supported-transform and owner-boundary decisions needed by that contract first. Clean-clone adapter parity requires those approved inputs; it cannot depend on untracked local paths. Do not begin with authentication-provider setup, a visual redesign or a wholesale lab copy.

Success means the main application can depend on a stable contract without changing the selected A result; it does not yet mean public hosting, multi-page authoring or new transforms work. Keep this unit reversible without deleting historical experiments.

## Verification to establish before delivery claims

- **Test ownership:** in the local worktree, root Vitest also collects incompatible laboratory `node:test` files, as recorded at the repository-root local path `experiments/a-workbench/README.md` (Verification). This is unversioned engineering evidence, not included in this documentation change or available in a clean clone. Define intended suites and discoverability during integration; do not hide failures and report an unfiltered suite as green.
- **Behavior and fidelity:** use deterministic tests for draft/save transitions, source/mask revisions, movement parameters, stale results and protected/static pixels. Add regressions before fixes, and test new scaling/stretching separately if approved.
- **Browser evidence:** authorize and define a repeatable E2E/accessibility/visual-performance harness and package commands before relying on them. Existing one-off Chrome observations are not an installed formal harness or physical-device certification.
- **End-to-end journeys:** upload → selection/refinement → movement → save/reopen → render → chapter reading → publish/read/unpublish. Include invalid uploads, out-of-memory, interrupted workers, concurrent edits, failed requests and stale exports.
- **Usability/accessibility:** check keyboard and touch alternatives, focus/error guidance, zoom, readable text, page order, visible save status, reduced motion and media/network failure. Define acceptance targets before interpreting results.
- **Varied content:** recommend 5–10 rights-cleared held-out pages/panels beyond the tuned examples; agree the set in D7. Record missed parts, mask leakage, damaged lettering, uncovered-background artifacts, correction time and task completion. A model job completing is not visual-quality evidence.

## Exit and remaining boundaries

The MVP is complete only when a creator can upload an ordered chapter, direct and save its animation, and explicitly share a stable readable version with another person under the agreed access policy. The one-page slice, internal test counts and laboratory approval are not substitutes for that journey.

PDF/CBZ, platform content sourcing and automatic narrative planning are not prerequisites. Uniform scaling and stretching remain scope decisions, not silently removed user requests. Formal reader-enjoyment research continues under its separate protocol and unresolved gates.

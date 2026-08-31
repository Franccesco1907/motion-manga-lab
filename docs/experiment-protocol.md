# Experiment Protocol: Does Motion Increase Manga Reader Enjoyment?

**Status: DRAFT — not approved for recruitment or inferential analysis**

**Draft date:** 2026-08-28

## Decision this protocol must support

Determine whether a restrained motion treatment increases **reader enjoyment**, compared with a static presentation of the same manga reading experience, without unacceptable disruption, accessibility, or performance harm.

Completion, abandonment, perceived disruption, accessibility, and performance are secondary outcomes or guardrails. They do not replace enjoyment as the primary outcome.

## Research question and hypotheses

**Research question:** among the target readers and devices, does the motion treatment produce a more enjoyable reading experience than the static control?

**Falsifiable treatment hypothesis:** the predeclared participant-level Reader Enjoyment Score will be higher under the motion condition than under the static condition.

**Null hypothesis:** the motion condition does not improve the predeclared Reader Enjoyment Score relative to the static condition.

The smallest effect worth acting on and the statistical decision criterion are **OPEN**. They must be set before sample size is calculated and before outcome data is reviewed.

## Target population

The selected target population for the initial experiment is **regular manga readers**.

“Regular” is not yet an operational eligibility rule. Minimum recent reading frequency, age/consent boundary, study language, geography, recruitment channel, and any familiarity screening remain **OPEN**. These decisions must be explicit before recruitment and must not be inferred from convenient access to participants.

## Outcomes

### Primary outcome: Reader Enjoyment Score

The primary endpoint is the project-specific **Reader Enjoyment Score**. It consists of three face-valid statements focused only on enjoyment:

1. “I enjoyed this reading experience.”
2. “I liked the experience of reading this excerpt.”
3. “Overall, this reading experience was satisfying.”

Each statement uses the same seven-point agreement scale:

| Response | Label |
| --- | --- |
| 1 | Strongly disagree |
| 2 | Disagree |
| 3 | Somewhat disagree |
| 4 | Neither agree nor disagree |
| 5 | Somewhat agree |
| 6 | Agree |
| 7 | Strongly agree |

Every integer is labeled and available consistently; higher values mean greater enjoyment. The participant-level primary score for a condition is the arithmetic mean of its three item responses. All three responses are required for the main-analysis primary score. Do not silently impute a missing item; missing-response handling and sensitivity reporting remain part of the OPEN statistical plan.

Collect the three items immediately after each reading condition, before the next excerpt or any comparison question. Keep item wording and order, response labels, scale direction, instrument language/version, timing, and scoring identical between conditions and frozen before the main study.

This is a **project-specific instrument, not a validated psychometric scale**. Before the main study, conduct pilot cognitive testing and define a reliability and response-distribution diagnostic. Do not select, drop, or reword items using main-study condition results. Any correction supported by pilot evidence must create a new instrument version and be frozen before the main study.

### Cognitive pilot procedure

The cognitive pilot tests interpretation and response process, not treatment efficacy or a numerical enjoyment threshold.

**Goals**

- Confirm that regular manga readers interpret each item as an evaluation of enjoyment of the just-completed reading experience.
- Detect ambiguity between enjoyment of the presentation and liking the story, art, genre, or familiarity with the title.
- Confirm that participants can distinguish the three statements and understand the seven labeled response options and scale direction as intended.
- Check whether immediate post-reading placement, item order, device presentation, or language creates confusion or avoidable burden.

**Procedure**

1. Recruit participants from the target population under a clearly labeled provisional eligibility rule; do not convert that rule into final eligibility without a separate decision.
2. Present the instrument in the intended post-reading context and on a representative mobile layout.
3. Ask each participant to answer first, then paraphrase each item, explain what experience they considered, and describe how they selected a response label.
4. Probe neutral wording, overlap between items, scale direction, the meaning of “this reading experience” and “this excerpt,” and any distinction the participant makes between content and presentation.
5. Record observations by item, participant, instrument language, device context, and instrument version without treating the responses as efficacy data.
6. Classify issues as comprehension, retrieval/context, judgment, response mapping, accessibility/presentation, or facilitator/process issues.
7. Revise only when documented evidence identifies a material interpretation or usability problem. Record the rationale and create a new instrument version.
8. Re-pilot every changed item or presentation rule. Freeze wording, order, scale, timing, language, presentation, and scoring only after review of the final pilot evidence.

The number of cognitive-pilot participants, operational comprehension criterion, reliability diagnostic, response-distribution diagnostic, and responsible reviewer remain **OPEN**. Cognitive-pilot responses are excluded from the main efficacy analysis.

### Secondary and guardrail outcomes

| Outcome | Role | Proposed observation |
| --- | --- | --- |
| Completion | Secondary | Whether the assigned excerpt reaches the predeclared completion state. |
| Abandonment | Secondary | Whether a started experience fails to reach completion under a predeclared time/session rule. |
| Perceived disruption | Guardrail | Short post-reading item asking whether motion interrupted or made reading harder. Exact wording and threshold are OPEN. |
| Reduced motion | Accessibility guardrail | Reading remains complete and understandable when the user requests reduced motion; record only the applied experience mode needed for analysis. |
| Other accessibility | Guardrail | Keyboard/touch/zoom usability, reading order, alternatives for visual content, and critical accessibility defects. |
| Performance | Guardrail | Versioned client summary of load and animation responsiveness on target devices; exact measures and limits are OPEN. |

Time-on-task, scroll behavior, and preference comments may be exploratory if collected. They must not be promoted to primary outcomes after results are known.

## Conditions

### Static control

- Same excerpt, image quality, responsive layout, controls, progression, and questionnaire as the treatment.
- No editorial panel/layer motion.
- Necessary interface feedback should remain minimal and identical across conditions.

### Motion treatment

- Same experience as the control plus one frozen, restrained motion treatment.
- Effects must have an editorial purpose and must not reveal content earlier, alter reading order, block progression, or change image quality.
- The reduced-motion path removes or replaces movement that could cause discomfort while preserving content and completion.

Treatment fidelity should be checked before launch. If content, controls, timing prompts, or loading behavior differ materially, the study will not isolate motion.

## Content roles and rights status

The [content source evaluation](./content-source-evaluation.md), [Episode 1 inspection](./asset-provenance/pepper-carrot-ep01-inspection.md), and [frozen engineering treatment definition](./spikes/ep01-page2-treatment-spec.md) conditionally select **Pepper & Carrot Episode 1, Spanish page 2, for a bounded panel-level engineering/animation spike only**. The source artwork is flattened and does not support low-effort subject-level animation. The search was bounded and not exhaustive; no alternative source is selected.

Pepper & Carrot is a Western open webcomic, not manga. Its CC BY 4.0 license and source workflow make it legally and technically strong for engineering, but it does not establish conventional manga representativeness for regular manga readers.

The engineering specification defines crop geometry, motion/light behavior, trigger/lifecycle, reduced motion, and static parity; its linked derivative plan and actual manifest define the generated and prototype-imported outputs. Neither defines the final-study treatment. Explicit authorization allows these assets only in the engineering prototype. No study build or recruitment use is approved until the evaluation's remaining [acquisition and verification gates](./content-source-evaluation.md#exact-next-acquisition-and-verification-checklist) pass for human fidelity/accessibility review, physical-device evidence, attribution approval, and final-content selection.

Final study excerpts, comparability, familiarity controls, representativeness, exact rights, and attribution remain **OPEN**. Spike assets and final study assets require separate provenance records.

## Proposed study shape

Use a **randomized, counterbalanced within-participant comparison** as the working design:

1. Each participant reads two comparable excerpts: one static and one with motion.
2. Randomization counterbalances condition order and which excerpt receives motion.
3. The Reader Enjoyment Score items are collected immediately after each excerpt, before the next experience or any comparison question.
4. The main contrast compares the predeclared participant-level Reader Enjoyment Score between conditions while accounting for order and excerpt assignment as specified in the analysis plan.

This design reduces between-person preference variance, but it introduces carryover and content-comparability risks. The final choice between this design and a between-participant design is **OPEN** pending content availability, expected carryover, recruitment feasibility, and statistical review. Re-reading the exact same excerpt in both conditions is not recommended unless carryover is explicitly addressed.

## Conceptual event schema

Events describe the study state, not a general analytics product. Every event includes a pseudonymous session identifier, study version, timestamp, and only the fields required for its purpose.

| Event | Purpose | Minimum conceptual fields |
| --- | --- | --- |
| `study_session_started` | Establish an eligible study session | study version, consent/protocol state, assigned order |
| `reading_started` | Mark exposure to an assigned condition | excerpt ID, condition, sequence position, applied motion preference |
| `reading_progressed` | Support coarse completion/abandonment checks | excerpt ID, condition, predeclared progress milestone |
| `reading_completed` | Mark the defined endpoint | excerpt ID, condition, elapsed bucket or duration if approved |
| `reading_ended_early` | Distinguish explicit exit from missing completion | excerpt ID, condition, predeclared reason when voluntarily provided |
| `questionnaire_submitted` | Capture outcomes | excerpt ID, condition, instrument language/version, three Reader Enjoyment Score item responses, response completeness, versioned guardrail responses |
| `performance_summary_recorded` | Evaluate technical guardrails | condition, device class bucket, versioned aggregate measures |
| `study_session_completed` | Mark completion of the assigned sequence | study version, completed sequence positions |

Do not collect raw pointer paths, continuous scroll streams, full user-agent strings, IP-derived location, advertising identifiers, or unrelated browsing behavior. Event names and payload validation should be versioned before the pilot.

## Privacy and data minimization

- Obtain informed consent appropriate to the study and audience before collecting research data.
- Use random session identifiers; do not collect names, email addresses, account IDs, or precise location unless a separately justified recruitment process requires them.
- Keep recruitment/contact data separate from response data and use the minimum linkage needed for incentives or withdrawal.
- Store coarse device/performance categories where possible instead of fingerprinting attributes.
- Define retention, access, deletion, export, and breach handling before deployment.
- Report aggregate results; review free text, if enabled, for accidental personal information.

The telemetry provider, jurisdiction, retention period, and consent text are **OPEN** and require privacy review.

## Inclusion and exclusion

### Proposed inclusion

- A regular manga reader under the final operational eligibility rule.
- Able to provide valid consent under the final recruitment policy.
- Uses a supported target device/browser and can access the assigned excerpt.
- Can understand the study language and primary outcome items.

### Predeclared exclusion candidates

- No valid consent or duplicate/ineligible enrollment under the approved recruitment rules.
- Incompatible study version, invalid condition assignment, or a verified technical failure that prevents meaningful exposure or questionnaire submission.
- No exposure to the minimum predeclared portion of an assigned condition.

Do not exclude a participant because their enjoyment response is unfavorable, because they use reduced motion, or because their reading speed appears unusual. Reduced-motion users should be included unless the research question is explicitly narrowed; their treatment and analysis handling must be predeclared.

## Stopping and decision rule

### Stopping

- Stop or pause immediately for a critical consent, privacy, content-rights, safety, assignment, or data-integrity defect.
- An operational pilot may stop when its predeclared readiness checks are satisfied; it must not be used to claim efficacy.
- The main study stops at the sample size and rule produced by the approved design/power analysis. There is no invented sample target in this draft.
- Do not repeatedly inspect the primary result and stop when it becomes favorable unless a valid sequential design is specified in advance.

### Product decision

- **Proceed:** enjoyment meets the predeclared practical and statistical criterion, and no guardrail crosses its rejection threshold.
- **Revise and retest:** treatment fidelity or a guardrail fails in a correctable way; changes create a new version and require a new frozen protocol.
- **Do not adopt motion by default:** enjoyment is neutral, worse, too uncertain, or improved only with unacceptable disruption, accessibility, or performance cost.

Numerical thresholds for enjoyment and every guardrail are **OPEN**. They must be agreed before the main study and must account for uncertainty, not only point estimates.

## Assumptions

1. Suitable, licensed excerpts can be prepared with equivalent static and motion presentations.
2. The three enjoyment statements can be understood and answered immediately after reading without materially disrupting the experience.
3. The selected excerpts and devices are representative enough for the intended product decision.
4. The treatment can be delivered without changing content order, controls, or image quality.
5. Reduced-motion behavior can preserve full reading access.

## OPEN decisions

The Reader Enjoyment Score definition is selected; the experiment contract as a whole is not frozen.

1. **Operational eligibility and recruitment:** the target population is regular manga readers; exact recent-reading frequency, age/consent boundaries, study language, geography, recruitment channel, and familiarity screening remain OPEN.
2. **Practical effect:** smallest Reader Enjoyment Score improvement worth adopting.
3. **Study design:** within-participant versus between-participant, excerpt allocation, counterbalancing, and carryover controls.
4. **Statistical plan:** estimand, model/test, uncertainty reporting, multiplicity handling, treatment of order/excerpt effects, missing-response sensitivity reporting, and reliability/response-distribution diagnostics.
5. **Sample size and power:** derived only after decisions 2–4 and expected variance/effect evidence are available.
6. **Final experimental content:** exact licensed excerpts, equivalence criteria, regular-reader representativeness, familiarity screening, package-level provenance/attribution, and treatment-fidelity review. The spike recommendation does not resolve this decision.
7. **Guardrails:** exact disruption item, completion/abandonment definitions, accessibility checks, performance measures, and rejection thresholds.
8. **Reduced motion:** treatment definition and how its effect contributes to the primary estimand.
9. **Technical scope:** supported devices/browsers and handling of rendering or network failures.
10. **Privacy:** consent text, provider, storage region, retention, withdrawal/deletion, and free-text policy.
11. **Instrument pilot:** participant count, operational comprehension criterion, diagnostic criteria, responsible reviewer, and evidence required to complete the specified version-freeze process.
12. **Pilot separation:** which pilot data are excluded from the main analysis and what changes force a new study or instrument version.

## Draft readiness checklist

- [x] Project-specific Reader Enjoyment Score items, seven-point response scale, timing, and complete-response scoring are selected.
- [x] Target population is selected as regular manga readers.
- [x] Cognitive-pilot goals, evidence-capture procedure, and versioning mechanics are specified.
- [ ] Instrument language/version passes pilot cognitive testing and is frozen before the main study.
- [ ] Reliability and response-distribution diagnostics are predeclared.
- [ ] Practical effect, design, analysis, power, and sample size are justified.
- [ ] Final control, treatment, representative manga excerpts, package-level rights/attribution, and reduced-motion behavior are frozen.
- [ ] Guardrail definitions and thresholds are frozen.
- [ ] Eligibility, exclusions, stopping, and missing-data rules are frozen.
- [ ] Consent, privacy, retention, and content rights are approved.
- [ ] Instrumentation and condition assignment pass an end-to-end dry run.

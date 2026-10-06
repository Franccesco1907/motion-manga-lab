# Authoring and self-hosted reading review chain

This coordination document tracks the user-authorized local/private implementation and its account/guest-reading extension. The tracker is documentation-only; executable capabilities arrive in dependent branches. The chain does not authorize merging or claim an Internet launch or completed release gates.

## Review order

```text
main
  <- feat/local-authoring-tracker (draft, no merge)
      <- feat/local-authoring-01-core
          <- feat/local-authoring-02-service
              <- feat/local-authoring-03-workspace
                  <- feat/authoring-affine-v2
                      <- feat/self-hosted-account-api
                          <- feat/account-authoring-ui (this follow-up)
```

1. **Core:** isolate laboratory test discovery and promote the unchanged original-texture renderer with synthetic tests.
2. **Local service:** private original storage, coherent raw drafts, bounded rendering/offline assistance, ordered chapters and reviewed immutable local snapshots, with native filesystem/HTTP tests.
3. **Workspace:** complete browser authoring and reading against that service, with accessibility/failure/recovery tests and operating guidance.
4. **Affine backend:** explicit schema-2 scale/stretch kernels and guarded worker contracts; version-1 semantics remain unchanged.
5. **Account API:** compiled standalone service, closed accounts, owner storage/resource isolation and reviewed derivative-only guest endpoints.
6. **Account/guest/affine UI:** verified runtime login gate, owner recovery/expiry cleanup, explicit factor controls and reviewed guest-link lifecycle.

| Unit | Published predecessor |
| --- | --- |
| Tracker | [#7](https://github.com/Franccesco1907/motion-manga-lab/pull/7), draft/no-merge |
| Core | [#8](https://github.com/Franccesco1907/motion-manga-lab/pull/8) → #7 |
| Local service | [#9](https://github.com/Franccesco1907/motion-manga-lab/pull/9) → #8 |
| Workspace | [#10](https://github.com/Franccesco1907/motion-manga-lab/pull/10) → #9 |
| Affine backend | [#11](https://github.com/Franccesco1907/motion-manga-lab/pull/11) → #10 |
| Account API | [#12](https://github.com/Franccesco1907/motion-manga-lab/pull/12) → #11 |
| Account/guest/affine UI | This branch targets `feat/self-hosted-account-api` (#12); its final PR number is assigned on publication. |

The service and browser units combine closely coupled milestones so every branch can build and its tests stay with its behavior. The user explicitly accepted cohesive units exceeding the normal 400-line review budget and waived the pre-approved-issue prerequisite for this delivery chain only. Existing `type:feature` labels apply; no issue is falsely closed and no protection or approval label is created.

Each child targets its immediate parent branch. All PRs remain open; this tracker stays draft/no-merge. Integration and merge decisions belong to the human reviewer, not this delivery operation.

## Scope and deferred gates

The final chain tip provides local authoring plus a separately compiled, closed-account service with owner isolation and explicit unlisted guest reading. It does not deploy the service or satisfy public M4 policy/operational acceptance and M5 varied-content/device/release evidence. Those gates remain explicit under [the implementation plan](implementation-plan.md) and [D1–D7](mvp.md#open-decisions-and-earliest-blocking-milestone).

No artwork, private projects, model weights or new dependencies belong in these PRs. Runtime prerequisites and actual verification are recorded per child. Passing local checks is not fabricated CI, human review, a clean-clone dependency installation, or approval to merge.

# Local authoring implementation review chain

This draft coordination branch tracks review of the user-authorized local/private implementation. It does not deliver the application by itself, authorize merging, or claim that the public MVP or release gates are complete.

## Review order

```text
main
  <- feat/local-authoring-tracker (draft, no merge)
      <- feat/local-authoring-01-core
          <- feat/local-authoring-02-service
              <- feat/local-authoring-03-workspace
```

1. **Core:** isolate laboratory test discovery and promote the unchanged original-texture renderer with synthetic tests.
2. **Local service:** private original storage, coherent raw drafts, bounded rendering/offline assistance, ordered chapters and reviewed immutable local snapshots, with native filesystem/HTTP tests.
3. **Workspace:** complete browser authoring and reading against that service, with accessibility/failure/recovery tests and operating guidance.

The service and browser units combine closely coupled milestones so every branch can build and its tests stay with its behavior. The user explicitly accepted cohesive units exceeding the normal 400-line review budget and waived the pre-approved-issue prerequisite for this delivery chain only. Existing `type:feature` labels apply; no issue is falsely closed and no protection or approval label is created.

Each child targets its immediate parent branch. All PRs remain open; this tracker stays draft/no-merge. Integration and merge decisions belong to the human reviewer, not this delivery operation.

## Scope and deferred gates

The final chain tip provides a bounded local engineering workflow, not Internet publication or multi-user account isolation. Public M4 sharing/security/content-policy acceptance and M5 varied-content/device/release evidence remain deferred under [the implementation plan](implementation-plan.md) and [D1–D7](mvp.md#open-decisions-and-earliest-blocking-milestone).

No artwork, private projects, model weights or new dependencies belong in these PRs. Runtime prerequisites and actual verification are recorded per child. Passing local checks is not fabricated CI, human review, a clean-clone dependency installation, or approval to merge.

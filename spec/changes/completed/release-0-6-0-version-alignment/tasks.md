# PromptHub 0.6.0 Version Alignment Tasks

> Completed change history. Current requirements: [owning topic](../../../releases/0.6.0.md). Earlier proposals and designs below are retained as evidence, not current instructions.

- [x] `T-REL-000` Define and analyze the `FR -> DES -> TEST -> T` release
      boundary before implementation.
- [x] `T-REL-001` Align all shipped product manifests to the root's selected
      `0.6.0`-line candidate and verify
      exact equality (`FR-REL-001`, `DES-REL-001`, `TEST-REL-001`).
- [x] `T-REL-002` Verify the archived website publication-boundary change
      against preparation, ordering, and invalid-state paths (`FR-REL-002`,
      `NFR-REL-001`, `DES-REL-002`, `TEST-REL-002`, `TEST-REL-003`,
      `TEST-REL-004`).
- [x] `T-REL-003` Add the preparation release record, synchronize website
      output, and preserve published stable copy (`FR-REL-002`, `DES-REL-003`,
      `TEST-REL-005`).
- [x] `T-REL-004` Run focused checks and `pnpm verify:release:quick`, then record
      actual results and residual release risks.
- [x] `T-REL-005` Complete converge records; keep the change active until
      `0.6.0` publication is complete.
- [x] `T-REL-006` Add the failing GHCR prerelease-isolation regression, then
      restrict the mutable `latest` alias to stable tag refs (`FR-REL-003`,
      `DES-REL-004`, `TEST-REL-006`).
- [x] `T-REL-007` Verify the corrected tag workflow publishes beta-versioned
      images without changing stable `latest`, then record remote evidence.
- [x] Reconcile post-merge README/changelog content on the existing `0.6.0`
      line, synchronize website output, and run focused checks plus the quick
      governance diagnostic gate without changing published preview history.

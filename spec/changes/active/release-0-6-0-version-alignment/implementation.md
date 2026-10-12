# PromptHub 0.6.0 Version Alignment Implementation

## Status

- Phase: converge
- Status: release-pending

## Shipped

- The 0.6 line advanced through `0.6.0-beta.1`; the current release candidate
  uses `0.6.0-beta.2` across Root, Desktop, CLI, self-hosted Web, Cloudflare
  Worker, Mobile package, Expo metadata, project context, and CLI runtime.
- Stable promotion will replace the prerelease identity with `0.6.0` only
  after the explicit stable release gate.
- Website release synchronization now selects explicit stable release records
  instead of treating the root build version as published.
- The `0.6.0` preparation record and unreleased changelog note are synchronized.
- Public website badges, introduction copy, and download URLs remain on the
  published `0.5.9` stable release.
- During the `v0.6.0-beta.1` replacement, the first Self-Hosted Web run was
  cancelled before its Docker job because the existing any-`v*` metadata rule
  would also publish the mutable GHCR `latest` alias. No beta image was pushed
  by that cancelled run.
- The GHCR metadata rule now emits `latest` only for a tag ref whose ref name
  has no prerelease suffix. Beta images retain explicit semver, source-tag and
  commit-SHA tags.
- Stable recovery workflow run `32259627093` restored GHCR `latest` to the
  published `0.5.9` image before the replacement beta was promoted.
- Final Self-Hosted Web run `32265536642` published only the explicit
  `0.6.0-beta.1`, `v0.6.0-beta.1`, and `sha-6c08b5e` tags for the beta
  candidate; it did not publish `latest`.

## Historical Verification

- `TEST-REL-001`:
  - Command: exact manifest assertion over seven product version sources
  - Result: passed; every source reported `0.6.0`
- `TEST-REL-002`, `TEST-REL-003`, `TEST-REL-004`:
  - Command: `pnpm --dir website test:release-sync`
  - Result: 4 tests passed with 100% line, branch, and function coverage for
    `website/scripts/release-metadata.mjs`
- `TEST-REL-005`:
  - Command: `pnpm --dir website sync:release`
  - Result: passed; generated public release metadata remained `v0.5.9`
- CLI runtime:
  - Command: `pnpm --filter @prompthub/cli test -- tests/run.test.ts --run`
  - Result: 22 tests passed
- Type safety:
  - Commands: `pnpm --filter @prompthub/core typecheck`,
    `pnpm --filter @prompthub/cli typecheck`
  - Result: passed
- Website production build:
  - Command: `pnpm --dir website build`
  - Result: 13 pages built successfully; Browserslist reported stale advisory
    data without failing the build
- Specification and formatting:
  - Commands: `pnpm spec:test`, `pnpm spec:index:check`, targeted
    `prettier --check`, `git diff --check`
  - Result: passed
- Release quick gate:
  - Command: `pnpm verify:release:quick`
  - Result: 21 of 22 checks passed. The only failure is the pre-existing
    file-size gate for `SkillStore.tsx` and `SkillStoreDetail.tsx` at 1536
    lines each, above the preferred 1500-line limit. All shared, database, core,
    CLI, Desktop, Web, Worker, and Mobile typecheck/test/lint checks in the
    profile passed.
- `TEST-REL-006` first failed against the any-`v*` raw `latest` rule, then
  passed after the stable-ref guard was added. The cancelled Web run completed
  Web verification and Docker Compose validation; its Docker metadata and
  build-push steps never started.
- The corrected candidate passed `pnpm verify:release` with 42/42 checks, zero
  failed or blocked checks, and a maximum concurrency of two. Performance,
  Desktop unit/integration/build/bundle/E2E, CLI/Web builds, Web smoke,
  Cloudflare dry-run and Mobile gates all passed.
- Stable recovery workflow run `32259627093` completed successfully. Read-only
  registry inspection confirmed both `latest` and `0.5.9` resolve to manifest
  digest
  `sha256:110d9c320236a7bc41fc624b564db58b1f71c13a110ee02b198e0024abc3784e`,
  version `0.5.9`, revision
  `1e933ae29726361982c5ce7b49bc4f4c6da326ba`.
- Final Self-Hosted Web run `32265536642` completed successfully at commit
  `6c08b5e84d70ecb41b32030b00e2e04fae96319a`. The explicit
  `0.6.0-beta.1` and `v0.6.0-beta.1` tags resolve to manifest digest
  `sha256:5e83e5cdc63392cf2367e13587d8a1991fe7efe73b776f3383cb6ef6a6784526`,
  version `0.6.0-beta.1`, and the same candidate revision. A post-publication
  check reconfirmed that stable `latest` was unchanged.

## Analyze

- Traceability complete: yes
- Conflicts/blockers resolved: yes; code/build version and published stable
  metadata use separate authoritative sources

## Converge

- Stable workflow/knowledge/rules synced: release rules already define the
  required stable-versus-preparation boundary
- Issues/releases/ADRs/indexes synced: `spec/releases/0.6.0.md`,
  `spec/releases/README.md`, and `spec/changes/index.md` updated; no issue or ADR
  state changed
- Final change destination: remain active until `0.6.0` publication

## Synced Docs

- `CHANGELOG.md`
- `website/src/content/docs/changelog.md`
- `spec/releases/0.6.0.md`
- `spec/releases/README.md`
- `AGENTS.md`

Localized README stable badges, download links, locale files, and screenshots
were intentionally left unchanged because `0.6.0` has not been published and
this change has no visible product UI delta.

## Follow-ups

- Keep this change active until the stable `0.6.0` release is published and
  stable-facing website metadata, downloads, and GHCR `latest` are explicitly
  promoted together.
- The `v0.6.0-beta.1` replacement publication is complete; it does not promote
  any stable-facing surface from `0.5.9`.
- The beta.2 prerelease was published independently through
  `release-0-6-0-beta-2-readiness`; stable `0.6.0` preparation remains active.

## Mainline Documentation Reconciliation (2026-10-12)

- Main includes PR #223 through merge commit `4ab857b0`; a fast-forward-only
  pull confirmed the checkout was already synchronized with origin/main.
- Product manifests and CLI runtime remain `0.6.0-beta.2`; the mainline target
  remains `0.6.0`, not the contribution branch's `0.6.4`.
- Seven product READMEs now show a separate development badge and unreleased
  summary. The docs index links to the current release boundary; dated beta
  history and stable downloads remain unchanged.
- The unreleased changelog summarizes the integrated Prompt UX/search/hierarchy,
  backup guidance, localized errors, and Web visibility changes. The 0.6.0
  preparation record uses the accepted SQLite/filesystem target and marks
  foundation migration/acceptance as incomplete rather than preserving the
  superseded file-first requirement.
- Version-alignment regressions read the candidate from the root manifest and
  cover all README channels, unreleased history, and generated website metadata.
- Desktop locale files and screenshots are unchanged by this task: no runtime
  UI copy is added and no new GUI evidence is claimed. Native GUI automation,
  signing, packaging, tagging, and publication are outside this request.

### Verification

- `pnpm exec node --test --test-reporter=spec scripts/version-alignment.test.mjs`:
  passed 5 tests covering the 0.6.0 line, all seven manifest sources, CLI
  runtime, development/stable README separation, and website changelog parity.
- `pnpm --dir website sync:release`: passed; generated stable metadata remains
  `v0.5.9` with date `2026-07-14`. Only the generated changelog content changed;
  stable metadata and both introduction files remain byte-for-byte unchanged.
- `pnpm --dir website test:release-sync`: passed 4 tests; the stable selector
  has 100% line, branch, and function coverage for preparation, ordering, and
  invalid publication records.
- Scoped `prettier --check`: passed for all 17 changed release/document/test
  files. `git diff --check` passed for the same task scope.
- Readback assertions: all seven README HTML wrappers balance; published
  README/changelog history from the beta.2 heading onward is unchanged.
- `pnpm verify:release:quick --surface governance --concurrency 1`: passed all
  3 selected checks (CI configuration, spec governance, and source-size rules)
  in 2.5 seconds. This is a scoped quick diagnostic, not an all-product or
  release-acceptance result.
- Product runtime checks were not rerun because product manifests, CLI version,
  and application source are unchanged by this task. Full quick/release, GUI,
  packaging, signing, and publication remain unexecuted for this reconciliation.
- Website production build was not run: `website/node_modules` is absent.
  Existing Node/pnpm dependencies were reused for synchronization and metadata
  tests; no dependency installation or development server was started.

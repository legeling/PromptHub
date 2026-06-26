# Implementation log

## What shipped

- `prompthub-releases` R2 bucket created in account
  `f710bc3af01927081d8a8c9402e19348` with public URL
  `https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev`.
- Bucket README (`bucket-readme.md`) describes the layout convention; it is
  also uploaded to the bucket root as `README.md`.
- `.github/workflows/release.yml` gains a stable-only `Sync stable artifacts
  to R2` step plus its skip twin. The step:
  - Skips on prerelease tags (`-beta`, `-alpha`, `-rc`).
  - Skips when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is missing
    (forks-safe).
  - Skips when the GitHub release is still a draft.
  - Stages binaries with version-less names into `r2_staging/latest/`,
    version-suffixed names into `r2_staging/v<version>/`.
  - Generates `checksums.txt` for both directories and `latest/latest.json`.
  - Uploads each file with the right `--content-type`.
- `.github/workflows/release.yml` now gates optional publishers through a
  `publish_secrets` readiness step instead of reading step-scoped secret env
  variables from `if:` expressions. This prevents the R2/Homebrew publisher
  conditions from evaluating before their step env exists.
- `apps/desktop/tests/unit/scripts/release-workflow.test.ts` locks the
  release workflow boundary: optional publisher `if:` expressions must use
  non-secret readiness outputs and must not directly read secret env values.
- `website/scripts/sync-release.mjs` learns the `PROMPTHUB_USE_CDN_MIRROR`
  env flag. Default off; flip to `1` only after R2 `latest/` has been
  populated and public HEAD checks return 200.
- README (zh) plus 6 locale variants now show a two-lane download table:
  "直链下载 / Direct download / 直鏈下載 / etc." in the left column and
  "GitHub Releases" in the right column. Both columns currently resolve to
  the same GitHub Releases URLs because the R2 `latest/` prefix is empty;
  the inline note explains the direct lane will switch back to CDN URLs only
  after mirror verification.

## 2026-06-24 regression follow-up

User-visible failure: README "Direct download" buttons pointed at
`https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/...`, but
`latest/PromptHub-Setup-x64.exe`, `latest/latest.json`, and
`latest/checksums.txt` were absent from R2 and returned 404. GitHub Releases
assets for v0.5.8 returned 200.

Root cause: the public docs were switched to the CDN lane before R2
`latest/` had been populated. In addition, the release workflow used
step-level secret env values in `if:` conditions (`env.CLOUDFLARE_API_TOKEN`
and `env.HOMEBREW_TAP_TOKEN`), which is fragile because step `if:` is
evaluated before the step's own `env:` block is available.

Fix:

- README and all 6 localized README files now temporarily point their
  "Direct download" column back to the working GitHub v0.5.8 asset URLs.
- The release workflow now converts optional publishing secrets into
  non-secret readiness outputs via `steps.publish_secrets.outputs.*`.
- R2 sync now requires both `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`.
- A workflow regression test prevents future `if:` expressions from reading
  secret env values directly.

## What is intentionally deferred

- Backfilling the existing v0.5.6 binaries into R2. Would have cost ~580 MB
  of egress from GitHub to local then 580 MB upload to R2; the maintainer
  declined the bandwidth spend. The next stable release will populate the
  bucket naturally.
- Custom domain. The plain `pub-...r2.dev` URL is good enough for now.
- Updating Homebrew Cask + electron-updater to read from R2. Both still
  point at GitHub Releases. Switching them is a separate change.

## What I attempted that should be flagged

- Initially attempted `gh release download v0.5.6 ...` from `/tmp` to
  back-fill 0.5.6 into R2. Maintainer told me to stop and revealed the
  download had already partially completed (~580 MB landed in
  `/tmp/r2-bootstrap-0.5.6/`). Cleaned up with `rm -rf` immediately. No R2
  upload happened. Lesson recorded: any operation that pulls release
  artifacts down should be confirmed before triggering, even if the eventual
  destination is a code path that only "fans out" the file.

## Verification

- `wrangler r2 bucket list` confirmed `prompthub-releases` exists alongside
  the older `article-assets` bucket.
- `curl -s https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/README.md`
  returns the layout doc (HTTP 200, 1971 bytes).
- `curl -I https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-x64.exe`
  reproduced the current CDN failure (HTTP 404).
- `curl -I -L https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-x64.exe`
  verified the fallback asset exists (HTTP 200 after redirects).
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`
  parses the workflow without error.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/scripts/release-workflow.test.ts` ✅
- `pnpm --filter @prompthub/desktop typecheck` ✅
- `pnpm --filter @prompthub/desktop lint` ✅
- `pnpm --filter @prompthub/desktop test:unit` ✅ 152 files / 1263 tests.
- `node website/scripts/sync-release.mjs` (without
  `PROMPTHUB_USE_CDN_MIRROR=1`) regenerated `website/src/generated/release.ts`
  with the GitHub Releases URLs as expected.

## Files touched

- `.github/workflows/release.yml`
- `website/scripts/sync-release.mjs`
- `website/src/generated/release.ts` (regenerated by the script)
- `README.md`
- `docs/README.en.md`
- `docs/README.zh-TW.md`
- `docs/README.ja.md`
- `docs/README.fr.md`
- `docs/README.de.md`
- `docs/README.es.md`
- `spec/changes/active/r2-direct-downloads/proposal.md`
- `spec/changes/active/r2-direct-downloads/design.md`
- `spec/changes/active/r2-direct-downloads/tasks.md`
- `spec/changes/active/r2-direct-downloads/implementation.md`
- `spec/changes/active/r2-direct-downloads/bucket-readme.md` (also uploaded
  to the bucket as `README.md`)

# Implementation

## Changes

- Ported the useful Prompt output-format contribution from `jazzson51569/PromptHub` commit `fa7b0e6b`.
- Added `prompt_output_format_items` with cascade cleanup.
- Added `PromptOutputFormatDB` and desktop IPC/preload/store wiring.
- Added a Prompt detail panel for configuring output sequences.
- Updated copy behavior so configured sequences are copied as one combined clipboard text.
- Added seven-locale i18n keys and DB regression tests.

## Verification

- `pnpm typecheck`
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/prompt-output-format-db.test.ts tests/unit/components/prompt-detail-metadata.test.tsx --run`

## Notes

The fork branch was not merged directly because it has unrelated build, debug, package, and local data-path changes. This change intentionally ports only the output-format/Prompt-copy feature.

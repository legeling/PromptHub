# Infistar Sponsor Promotion Implementation

## Status

The sponsor-provided creative has replaced the earlier rewritten tables. Local
implementation and focused verification are complete; publication and change
archival remain pending.

## Traceability

| Requirement       | Design            | Verification                         | Task                  |
| ----------------- | ----------------- | ------------------------------------ | --------------------- |
| `FR-INFISTAR-001` | Placement         | `TEST-INFISTAR-001` placement parity | `T-INFISTAR-001..006` |
| `FR-INFISTAR-002` | Superseded        | Replaced by `TEST-INFISTAR-004`      | `T-INFISTAR-005..006` |
| `FR-INFISTAR-003` | Superseded        | Replaced by `TEST-INFISTAR-004`      | `T-INFISTAR-005..006` |
| `FR-INFISTAR-004` | Creative Boundary | `TEST-INFISTAR-004` creative parity  | `T-INFISTAR-005..006` |

## Analyze Gate

- The change is documentation-only and does not alter provider presets, runtime
  routing, application UI, or release metadata.
- The maintainer requires the sponsor-provided image and Chinese campaign copy
  to remain unchanged and explicitly rejects appended disclosures or rewritten
  qualifications.
- The only approved transformation is adding the supplied `infistar.cc` URL to
  the banner and the existing `专属推广链接` phrase.

## Implemented Surfaces

- Stored the supplied banner unchanged under the repository documentation and
  website public-asset trees.
- Replaced the rewritten tables in the root README, six localized README files,
  public sponsor record, and Chinese/English website backer pages with the same
  sponsor-supplied Chinese campaign block.
- Positioned each README campaign after the contents and before the download
  section; the bottom sponsor section contains only personal donation methods.
- Linked only the banner and the existing `专属推广链接` phrase to the supplied
  `infistar.cc` registration URL.
- Updated only the campaign-title brand token from `Infistar.ai` to
  `infistar.cc` across all public sponsor surfaces; the banner and body copy are
  unchanged.
- Wrapped each complete campaign block in the first row of a single-column
  partner table so future sponsors can be added as additional rows.
- Kept the existing community donation records and donation methods unchanged.

## Verification

- `TEST-INFISTAR-001`: the placement scan confirmed one campaign block in every
  README locale before the download anchor.
- `TEST-INFISTAR-004`: both committed image copies and the built website asset
  match the source PNG at SHA-256
  `429c0ebe67945ec9b2175cab246757232025d4fba38a78c5d49c8db0e2fb5234`.
- The exact-copy scan confirmed the supplied title and five body lines appear
  once on each of the ten public sponsor surfaces, with exactly two
  `infistar.cc` registration links and no legacy `www` URL.
- A focused title scan confirmed all ten surfaces use `infistar.cc` in the
  campaign heading while the `Infistar.ai 无限星河` sponsor name in the body
  remains unchanged.
- Source and rendered-output scans confirmed each surface has one single-column
  partner table with exactly one Infistar data row; the structure accepts future
  partners as additional rows.
- The absence scan confirmed that the removed rewritten tables, translations,
  affiliate notices, and qualification text are not present on those surfaces.
- Prettier and `git diff --check` passed for the changed public documents and
  active change records.
- The campaign URL returned HTTP 200 without changing the affiliate query.
- `pnpm --dir website build` passed. Both generated backer pages contain the
  linked banner, exact campaign copy, and benefit line; the build emitted only
  the existing stale Browserslist-data advisory.
- Spec index and traceability checks passed after the correction record was
  updated.

## Release Boundary

No application code, provider preset, runtime behavior, release version, or
third-party service configuration changed. The full release harness was not run
because this batch changes static public documentation only; the website build
is the relevant executable gate.

## Compact README Layout (2026-10-18)

- All seven READMEs now show APIMart and Infistar banners side by side at
  280-pixel display widths. Original image files and referral URLs are unchanged.
- Full approved campaign text remains in a collapsed details section with a
  localized summary. Large banners are not repeated inside the expanded text.
- Website backer pages and the public sponsor record retain their existing layout.
- No automated tests or GUI rendering were run for this documentation layout edit.

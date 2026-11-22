# 0.6.4-beta.1 local verification

## Product

Delivery

## Status

in progress

## Candidate

The build identifies as 0.6.4-beta.1 in the root, desktop, CLI, mobile, self-hosted Web and Worker manifests and CLI runtime. The website sync still selects stable 0.6.3. No public release date is assigned. The release index, seven product README locales and changelog describe the candidate. The docs navigation and existing screenshots are unaffected.

## Verification

- Version alignment passed 5/5. Updater and update notes suites passed 57/57, and website metadata tests passed.
- The local macOS arm64 DMG passed image verification, the ZIP passed archive verification, and the updater manifest matched its files. The embedded changelog matched the repository copy. These local QA packages do not have a distribution signature or notarization.
- An official 0.6.3 ZIP verified against its published SHA-256 created a prompt and two history entries in an isolated profile. The preview ZIP opened the same profile twice. The record ID, complete prompt and both history entries matched the stable readback on both starts. This checks a local binary upgrade, not a public updater download.
- The full release harness and independent QA disposition must be checked before creating a public tag. Signed cross-platform distribution, installer lifecycle tests and public channel readback belong to release promotion.

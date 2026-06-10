# Proposal

## Why

`apps/web/.env.example` documents `DATA_DIR=./data`, but the Web server
configuration reads `DATA_ROOT`. A self-hosted user who copies the example file
will not actually move the runtime data root, making deployment and backup
paths misleading.

## Scope

- In scope:
  - Align the Web example environment file with the implemented `DATA_ROOT`
    configuration key.
  - Add a regression that checks the example file uses the supported key.
- Out of scope:
  - Adding a legacy `DATA_DIR` alias.
  - Changing runtime path layout.
  - Editing local untracked `.env` files.

## Risks

- Users with existing local `.env` files that contain `DATA_DIR` still need to
  rename it manually; this change only fixes the tracked example and docs.

## Rollback Thinking

Rollback restores `DATA_DIR` in `.env.example` and removes the static example
configuration regression.

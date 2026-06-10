# Proposal

## Why

Web prompt workspace export currently removes `data/prompts` before rewriting
folder, prompt, and version files from SQLite. If any filesystem write fails
after the removal, the previously usable workspace can disappear or become
partial even though the database mutation has already completed.

## Scope

- Make web prompt workspace exports write into a staging directory before
  replacing the live workspace.
- Preserve the previous live workspace when staging writes fail.
- Add regression coverage for interrupted prompt file writes.

## Risks

- Directory replacement must avoid deleting user data when cleanup fails.
- Temporary staging or backup directories may remain after process crashes and
  should be ignored by normal prompt workspace import/export scans.

## Rollback

Revert the staging export helper and return to direct `data/prompts` rewrites.
The regression test will fail if this reintroduces partial workspace loss.

## Impacted User Flows

- Web prompt/folder mutations that trigger workspace sync.
- Web backup/import flows that call prompt workspace export after database
  import.

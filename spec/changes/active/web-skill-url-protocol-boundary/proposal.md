# Web Skill URL Protocol Boundary

## Why

Web Skill metadata accepts URL-like fields such as `source_url`, `content_url`,
and `icon_url`. The current `z.string().url()` validation accepts protocols
such as `javascript:`, `file:`, and unrestricted `data:` URLs. These fields are
persisted, exported, synced, and may be rendered by downstream clients, so the
API boundary should reject unsafe protocols before they enter durable state.

## Scope

- Validate live Skill create/import/update URL metadata.
- Validate direct `SkillService` callers that bypass route schemas.
- Validate imported sync/backup snapshots before `BackupService.import()` writes
  Skill records.
- Allow HTTP(S) URLs for source/content/icon metadata.
- Allow only base64 image `data:` URLs for `icon_url`.

## Out Of Scope

- Rewriting existing stored Skill records.
- Changing desktop renderer URL sanitization.
- Adding a new UI for editing these fields.

## Rollback

Revert the validators and regressions. No schema migration is introduced.

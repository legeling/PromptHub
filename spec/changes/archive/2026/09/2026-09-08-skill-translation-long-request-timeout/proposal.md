# Skill Translation Long Request Timeout

## Phase And Status

- Phase: converge
- Status: completed
- Primary requirement: `FR-SKILL-TRANSLATION-001`
- Exit condition: Skill translation uses the desktop main-process transport for intranet HTTP endpoints and has a bounded timeout suitable for full-document generation.

## Why

Full `SKILL.md` translation can exceed the generic 30-second AI transport default, especially on self-hosted intranet models. The resulting timeout is currently presented as a connection failure even though intranet base URLs are supported.

## Scope

- In scope: a translation-only request timeout and regression coverage for intranet HTTP transport.
- Out of scope: changing global AI timeouts, proxy policy, provider protocol handling, or persisted model settings.

## Risks

- A longer bounded wait keeps one translation request open longer; it does not add retries or concurrency.

## Rollback Thinking

- Remove the translation-specific timeout to restore the shared 30-second transport default.

## Related Records

- Issue: user-reported intranet translation connection failure
- Stable workflow/knowledge docs: `spec/knowledge/behavior/skills.md`

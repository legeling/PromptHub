# AI Request Timeout Unification

## Phase And Status

- Phase: converge
- Status: completed
- Primary requirement: `FR-AI-TIMEOUT-001`
- Exit condition: Desktop and shared core AI HTTP requests use one five-minute timeout constant across connection and full response consumption.

## Why

AI request deadlines are currently split across 12, 30, 60, 120, and 300 seconds. Short defaults can terminate slow intranet and long-generation requests, and duplicated constants make behavior drift.

## Scope

- In scope: AI model discovery, connection tests, chat/translation, image generation, desktop main-process AI transport, and the shared core AI client.
- Out of scope: Agent-management probes, downloads, Git, sync, database locks, test-runner timeouts, polling cadence, and adding retries.

## Risks

- Unreachable AI endpoints can remain pending for up to five minutes; users can still leave or retry only after the bounded request settles.

## Rollback Thinking

- Restore operation-specific constants and the shorter main/core defaults.

## Related Records

- Supersedes the timeout value in `2026-09-08-skill-translation-long-request-timeout` while retaining its intranet routing and error-classification fix.
- Stable docs: `spec/knowledge/reference/ai-provider-apis.md`, `spec/knowledge/behavior/skills.md`

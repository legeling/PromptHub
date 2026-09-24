# Design

## `DES-SKILL-TRANSLATION-001`: Translation-scoped timeout

Pass a 120-second timeout from the Skill translation slice into the existing `chatCompletion` options. The existing AI client forwards that value to `window.api.ai.request`, whose main-process handler performs the network request without renderer CORS restrictions.

## Affected Areas

- Data model: none
- IPC / API: no contract change; use the existing optional `timeoutMs`
- Filesystem / sync: none
- UI / UX: slow translations remain pending instead of failing at 30 seconds

## Tradeoffs

- 120 seconds is long enough for bounded full-document generation on slower local models while remaining well below an unbounded wait. Time and space complexity are unchanged: one request, `O(n)` request/response serialization, and response memory proportional to generated content.

## Failure And Rollback

- External boundary: configured AI endpoint
- Partial failure behavior: timeout still rejects without caching a partial translation
- Recovery/rollback: retry remains user-driven; removing the option restores the old timeout

## Analyze Result

- Requirement links: `FR-SKILL-TRANSLATION-001`
- Verification links: `TEST-SKILL-TRANSLATION-001`, `TEST-SKILL-TRANSLATION-002`
- Blocking conflicts: none; stable Skill behavior does not define a conflicting timeout
- Unresolved `[待确认]`: none

## Traceability

| Requirement                | Design                      | Verification                                               | Task                      |
| -------------------------- | --------------------------- | ---------------------------------------------------------- | ------------------------- |
| `FR-SKILL-TRANSLATION-001` | `DES-SKILL-TRANSLATION-001` | `TEST-SKILL-TRANSLATION-001`, `TEST-SKILL-TRANSLATION-002` | `T-SKILL-TRANSLATION-001` |

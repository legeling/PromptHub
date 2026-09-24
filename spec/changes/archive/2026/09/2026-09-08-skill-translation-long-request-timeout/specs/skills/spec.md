# Skills Delta

## Modified Requirement: `FR-SKILL-TRANSLATION-001`

PromptHub must support translating a complete `SKILL.md` through a configured OpenAI-compatible intranet HTTP endpoint. Translation requests must use the desktop main-process AI transport and a finite timeout sized for long-document generation rather than the generic short request default.

### Scenario: Slow intranet translation

- Given a chat model uses an intranet HTTP base URL
- When a full Skill translation takes longer than 30 seconds
- Then the renderer delegates the request to the main-process transport
- And the translation remains active up to the translation-specific bounded timeout
- And no global AI timeout or retry policy changes

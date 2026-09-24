# AI Timeout Delta

## Added Requirement: `FR-AI-TIMEOUT-001`

All PromptHub AI HTTP request surfaces owned by the desktop AI transport or shared core AI client must derive their deadline from one shared constant set to 300 seconds. Callers must not maintain shorter per-operation constants for discovery, tests, chat, translation, or image generation.

### Scenario: Slow AI provider

- Given an AI endpoint has not completed within the former operation-specific deadline
- When it remains within 300 seconds
- Then PromptHub keeps the request alive
- And the same deadline applies at renderer caller, desktop main-process transport, and shared core client boundaries
- And the deadline remains active while the response body or stream is consumed
- And no automatic retry or unbounded wait is introduced

# AI Settings Model Test Latency

## Added Requirements

### Requirement: Model Tests Are Lightweight Probes

Desktop AI settings chat model tests MUST use a lightweight probe instead of the model's full normal generation parameters.

#### Scenario: Local OpenAI-compatible model test

- Given a configured local OpenAI-compatible chat model has high normal `maxTokens`, streaming, or thinking enabled
- When the user clicks test model or test default model
- Then the test request MUST cap generated output to a small token budget
- And the test request MUST disable streaming and thinking
- And the test request MUST use a short explicit timeout.

### Requirement: Prompt Execution Parameters Are Preserved

The lightweight probe MUST NOT change normal prompt execution defaults.

#### Scenario: Regular chat completion

- Given a normal prompt execution calls `chatCompletion`
- When no test-specific override is provided
- Then the existing model chat parameters remain in effect.

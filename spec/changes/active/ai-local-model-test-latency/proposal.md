# Proposal

## Why

Users report that testing a local OpenAI-compatible model in Settings can take around 60 seconds, while another application probes the same local model much faster. The current desktop AI test path asks the model to generate up to 2048 tokens, which turns a connectivity check into a long generation workload for local 9B models.

## Scope

- In scope:
  - Make chat model test connection a lightweight probe.
  - Preserve full user chat parameters for real prompt execution.
  - Add regression coverage for token cap, stream, thinking, and timeout behavior.
- Out of scope:
  - Benchmarking model throughput.
  - Changing prompt execution defaults.
  - Changing model discovery via `/models`.

## Risks

- Too small a test response can fail providers that require some generated content. The probe still asks for a simple `OK` response and allows a small output budget.
- Some endpoints may still be slow before first local model warm-up; the request now has a shorter explicit test timeout.

## Rollback Thinking

Revert the `testAIConnection` probe options and the related regression test.

# Design

## Overview

`testAIConnection` should verify that a configured chat model can respond, not measure full generation speed. The probe will send a short prompt, force non-streaming output, disable thinking, use deterministic temperature, cap output to a few tokens, and pass a test-specific timeout through the shared AI request transport.

## Affected Areas

- Data model: none.
- IPC / API: no new IPC channel. `timeoutMs` already exists on the AI transport request.
- Filesystem / sync: none.
- UI / UX: Settings model test latency should reflect probe responsiveness instead of long-form generation.

## Tradeoffs

- The test no longer exercises stream and thinking options. Those are generation features, not connection requirements.
- Local model first-run warm-up can still take time, but the test will not spend time generating a long answer after the model is ready.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_PROVIDER_PROTOCOLS,
  planAgentProviderProtocolRoute,
} from "@prompthub/shared/utils/agent-provider-protocol-route";

const SUPPORTED_PLATFORMS = [
  "codex",
  "claude",
  "gemini",
  "kimi",
  "grok",
  "opencode",
  "pi",
  "qwen",
] as const;

describe("Agent provider protocol route planner", () => {
  it("offers Codex Responses directly and keeps Chat on the separately available bridge", () => {
    assert.equal(
      planAgentProviderProtocolRoute({
        platformId: "codex",
        upstreamProtocol: "openai-responses",
        bridgeAvailable: false,
      }).mode,
      "direct",
    );
    assert.deepEqual(
      planAgentProviderProtocolRoute({
        platformId: "codex",
        upstreamProtocol: "openai-chat",
        bridgeAvailable: false,
      }),
      {
        mode: "bridge",
        available: false,
        upstreamProtocol: "openai-chat",
        agentProtocol: "openai-responses",
        reason: "bridge-unavailable",
      },
    );
  });
  it("models the four canonical protocols in product order", () => {
    assert.deepEqual(AGENT_PROVIDER_PROTOCOLS, [
      "openai-chat",
      "openai-responses",
      "anthropic-messages",
      "google-generative-ai",
    ]);
  });

  it("plans every canonical protocol for every verified provider adapter", () => {
    for (const platformId of SUPPORTED_PLATFORMS) {
      for (const upstreamProtocol of AGENT_PROVIDER_PROTOCOLS) {
        const plan = planAgentProviderProtocolRoute({
          platformId,
          upstreamProtocol,
          bridgeAvailable: false,
        });
        assert.notEqual(
          plan.mode,
          "unsupported",
          `${platformId} must plan ${upstreamProtocol}`,
        );
        assert.equal(plan.upstreamProtocol, upstreamProtocol);
        if (plan.mode === "bridge") {
          assert.equal(plan.available, false);
          assert.equal(plan.reason, "bridge-unavailable");
        }
      }
    }
  });

  it("keeps Kimi's four verified provider kinds direct", () => {
    assert.deepEqual(
      AGENT_PROVIDER_PROTOCOLS.map((upstreamProtocol) =>
        planAgentProviderProtocolRoute({
          platformId: "kimi",
          upstreamProtocol,
          bridgeAvailable: false,
        }),
      ),
      AGENT_PROVIDER_PROTOCOLS.map((upstreamProtocol) => ({
        mode: "direct",
        available: true,
        upstreamProtocol,
        agentProtocol: upstreamProtocol,
      })),
    );
  });

  it("maps Pi's OpenAI Chat family to its native completions identifier", () => {
    assert.deepEqual(
      planAgentProviderProtocolRoute({
        platformId: "pi",
        upstreamProtocol: "openai-chat",
        bridgeAvailable: false,
      }),
      {
        mode: "direct",
        available: true,
        upstreamProtocol: "openai-chat",
        agentProtocol: "openai-completions",
      },
    );
  });

  it("enables a non-native route only when the bridge runtime is available", () => {
    assert.deepEqual(
      planAgentProviderProtocolRoute({
        platformId: "codex",
        upstreamProtocol: "anthropic-messages",
        bridgeAvailable: true,
      }),
      {
        mode: "bridge",
        available: true,
        upstreamProtocol: "anthropic-messages",
        agentProtocol: "openai-responses",
      },
    );
  });

  it("fails closed for unknown protocols and platforms", () => {
    assert.deepEqual(
      planAgentProviderProtocolRoute({
        platformId: "unknown",
        upstreamProtocol: "openai-chat",
        bridgeAvailable: true,
      }),
      {
        mode: "unsupported",
        available: false,
        upstreamProtocol: "openai-chat",
        reason: "platform-unsupported",
      },
    );
    assert.deepEqual(
      planAgentProviderProtocolRoute({
        platformId: "codex",
        upstreamProtocol: "unsafe-protocol",
        bridgeAvailable: true,
      }),
      {
        mode: "unsupported",
        available: false,
        upstreamProtocol: null,
        reason: "protocol-unsupported",
      },
    );
  });
});

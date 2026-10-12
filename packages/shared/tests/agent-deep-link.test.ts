import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_DEEP_LINK_MAX_DECODED_LENGTH,
  AGENT_DEEP_LINK_MAX_RAW_LENGTH,
  parseAgentDeepLink,
} from "@prompthub/shared/utils/agent-deep-link";

function validEnvelope() {
  return {
    version: 1,
    objectType: "provider-profile",
    value: {
      version: 1,
      profile: {
        platformId: "codex",
        name: "团队 Provider",
        providerKind: "openai-compatible",
        protocol: "openai-responses",
        endpoint: "https://api.example.com/v1",
        config: { region: "全球", retries: 2 },
        source: "manual",
      },
      modelMappings: [
        {
          routeKey: "primary",
          modelId: "gpt-5.4",
          parameters: { reasoningEffort: "high" },
        },
      ],
      requiresSecret: true,
    },
  };
}

function linkFor(value: unknown): string {
  return `prompthub://import?payload=${encodeURIComponent(JSON.stringify(value))}`;
}

function expectError(
  link: string,
  code:
    | "AGENT_DEEP_LINK_INVALID"
    | "AGENT_DEEP_LINK_TOO_LARGE"
    | "AGENT_DEEP_LINK_UNSUPPORTED"
    | "AGENT_DEEP_LINK_SENSITIVE_VALUE_REJECTED",
): void {
  assert.deepEqual(parseAgentDeepLink(link), { ok: false, errorCode: code });
}

describe("Agent Provider Profile deep links", () => {
  it("accepts one bounded provider export and normalizes its source", () => {
    const result = parseAgentDeepLink(linkFor(validEnvelope()));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.command, {
      type: "agent:import-provider",
      preview: {
        version: 1,
        profile: {
          platformId: "codex",
          name: "团队 Provider",
          providerKind: "openai-compatible",
          protocol: "openai-responses",
          endpoint: "https://api.example.com/v1",
          config: { region: "全球", retries: 2 },
          source: "import",
        },
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "gpt-5.4",
            parameters: { reasoningEffort: "high" },
          },
        ],
        requiresSecret: true,
      },
    });
  });

  it("accepts every declared protocol and public optional-value branch", () => {
    const cases = [
      ["claude", "anthropic-messages", "manual"],
      ["opencode", "google-generative-ai", "native-import"],
      ["opencode", "openai-chat", "universal"],
      ["claude", "platform-native", "import"],
    ] as const;

    for (const [platformId, protocol, source] of cases) {
      const envelope = validEnvelope();
      envelope.value.profile.platformId = platformId;
      envelope.value.profile.protocol = protocol;
      envelope.value.profile.source = source;
      envelope.value.profile.endpoint = null as unknown as string;
      envelope.value.profile.config = {
        region: "global",
        retries: 2,
        nested: [null, true, { label: "public" }],
      } as unknown as typeof envelope.value.profile.config;
      envelope.value.modelMappings = [];
      envelope.value.requiresSecret = false;

      const result = parseAgentDeepLink(linkFor(envelope));
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.command.preview.profile.endpoint, null);
        assert.equal(result.command.preview.profile.source, "import");
      }
    }

    const withoutEndpoint = validEnvelope();
    delete (withoutEndpoint.value.profile as { endpoint?: string }).endpoint;
    const result = parseAgentDeepLink(linkFor(withoutEndpoint));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.command.preview.profile.endpoint, null);
  });

  it("rejects malformed URL structure and duplicate payload parameters", () => {
    const payload = encodeURIComponent(JSON.stringify(validEnvelope()));
    for (const link of [
      `https://import?payload=${payload}`,
      `prompthub://other?payload=${payload}`,
      `prompthub://import/path?payload=${payload}`,
      `prompthub://user@import?payload=${payload}`,
      `prompthub://import:99?payload=${payload}`,
      `prompthub://import?payload=${payload}#fragment`,
      `prompthub://import?payload=${payload}&extra=1`,
      `prompthub://import?payload=${payload}&payload=${payload}`,
      "prompthub://import",
      "not a url",
    ]) {
      expectError(link, "AGENT_DEEP_LINK_INVALID");
    }
  });

  it("rejects temporarily unsupported provider targets", () => {
    for (const platformId of [
      "gemini",
      "qwen",
      "kimi",
      "grok",
      "copilot",
      "kiro",
    ]) {
      const envelope = validEnvelope();
      envelope.value.profile.platformId = platformId;
      expectError(linkFor(envelope), "AGENT_DEEP_LINK_UNSUPPORTED");
    }
  });

  it("rejects unsupported versions, object types, platforms, and protocols", () => {
    expectError(
      linkFor({ ...validEnvelope(), version: 2 }),
      "AGENT_DEEP_LINK_UNSUPPORTED",
    );
    expectError(
      linkFor({ ...validEnvelope(), objectType: "skill" }),
      "AGENT_DEEP_LINK_UNSUPPORTED",
    );

    const customPlatform = validEnvelope();
    customPlatform.value.profile.platformId = "private-agent";
    expectError(linkFor(customPlatform), "AGENT_DEEP_LINK_UNSUPPORTED");

    const partialPlatform = validEnvelope();
    partialPlatform.value.profile.platformId = "cursor";
    expectError(linkFor(partialPlatform), "AGENT_DEEP_LINK_UNSUPPORTED");

    const protocol = validEnvelope();
    protocol.value.profile.protocol = "unknown-wire";
    expectError(linkFor(protocol), "AGENT_DEEP_LINK_UNSUPPORTED");
  });

  it("rejects unknown keys and malformed portable profile fields", () => {
    const invalid = [
      { ...validEnvelope(), unexpected: true },
      {
        ...validEnvelope(),
        value: { ...validEnvelope().value, unexpected: true },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: { ...validEnvelope().value.profile, id: "sender-id" },
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: { ...validEnvelope().value.profile, name: "" },
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: {
            ...validEnvelope().value.profile,
            endpoint: "file:///tmp/provider.sock",
          },
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          modelMappings: [
            validEnvelope().value.modelMappings[0],
            validEnvelope().value.modelMappings[0],
          ],
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          modelMappings: Array.from({ length: 17 }, (_, index) => ({
            routeKey: `route-${index}`,
            modelId: `model-${index}`,
            parameters: {},
          })),
        },
      },
    ];

    for (const value of invalid) {
      expectError(linkFor(value), "AGENT_DEEP_LINK_INVALID");
    }
  });

  it("rejects missing, mistyped, and unbounded schema fields", () => {
    const missingEnvelopeKey = validEnvelope() as Record<string, unknown>;
    delete missingEnvelopeKey.value;

    const missingExportKey = validEnvelope();
    delete (
      missingExportKey.value as typeof missingExportKey.value & {
        requiresSecret?: boolean;
      }
    ).requiresSecret;

    const missingProfileKey = validEnvelope();
    delete (
      missingProfileKey.value
        .profile as typeof missingProfileKey.value.profile & {
        source?: string;
      }
    ).source;

    expectError(
      linkFor({
        ...validEnvelope(),
        value: { ...validEnvelope().value, version: 2 },
      }),
      "AGENT_DEEP_LINK_UNSUPPORTED",
    );

    const invalidValues: unknown[] = [
      null,
      [],
      "payload",
      missingEnvelopeKey,
      { ...validEnvelope(), value: null },
      { ...validEnvelope(), value: [] },
      missingExportKey,
      {
        ...validEnvelope(),
        value: { ...validEnvelope().value, requiresSecret: "yes" },
      },
      {
        ...validEnvelope(),
        value: { ...validEnvelope().value, profile: null },
      },
      {
        ...validEnvelope(),
        value: { ...validEnvelope().value, profile: [] },
      },
      missingProfileKey,
      profileWith({ source: 42 }),
      profileWith({ source: "external" }),
      profileWith({ platformId: 42 }),
      profileWith({ platformId: "CODEX" }),
      profileWith({ platformId: `c${"x".repeat(80)}` }),
      profileWith({ name: 42 }),
      profileWith({ name: "   " }),
      profileWith({ name: "x".repeat(121) }),
      profileWith({ name: "bad\nname" }),
      profileWith({ providerKind: 42 }),
      profileWith({ providerKind: "bad kind" }),
      profileWith({ providerKind: `p${"x".repeat(80)}` }),
      profileWith({ protocol: 42 }),
      profileWith({ protocol: "bad protocol" }),
      profileWith({ protocol: `p${"x".repeat(80)}` }),
      profileWith({ config: null }),
      profileWith({ config: [] }),
      profileWith({ endpoint: 42 }),
      profileWith({ endpoint: "   " }),
      mappingWith(null),
      mappingWith({
        routeKey: "primary",
        modelId: "model",
        parameters: {},
        extra: true,
      }),
      mappingWith({ modelId: "model", parameters: {} }),
      mappingWith({ routeKey: 42, modelId: "model", parameters: {} }),
      mappingWith({ routeKey: "", modelId: "model", parameters: {} }),
      mappingWith({
        routeKey: `r${"x".repeat(80)}`,
        modelId: "model",
        parameters: {},
      }),
      mappingWith({ routeKey: "bad route", modelId: "model", parameters: {} }),
      mappingWith({ routeKey: "route", modelId: 42, parameters: {} }),
      mappingWith({ routeKey: "route", modelId: "", parameters: {} }),
      mappingWith({
        routeKey: "route",
        modelId: "x".repeat(257),
        parameters: {},
      }),
      mappingWith({ routeKey: "route", modelId: "bad\nmodel", parameters: {} }),
      mappingWith({ routeKey: "route", modelId: "model", parameters: null }),
    ];

    for (const [index, value] of invalidValues.entries()) {
      assert.deepEqual(
        parseAgentDeepLink(linkFor(value)),
        { ok: false, errorCode: "AGENT_DEEP_LINK_INVALID" },
        `invalid schema case ${index}`,
      );
    }
  });

  it("rejects excessive JSON depth and node count before domain parsing", () => {
    let deep: unknown = true;
    for (let index = 0; index < 22; index += 1) deep = { nested: deep };
    expectError(linkFor(deep), "AGENT_DEEP_LINK_INVALID");

    expectError(
      linkFor(Array.from({ length: 2_050 }, () => true)),
      "AGENT_DEEP_LINK_INVALID",
    );
  });

  it("rejects literal secrets without returning or throwing their values", () => {
    const secret = "sk-do-not-leak-123";
    const sensitiveValues = [
      {
        ...validEnvelope(),
        apiKey: secret,
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: {
            ...validEnvelope().value.profile,
            config: { access_token: secret },
          },
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          modelMappings: [
            {
              routeKey: "primary",
              modelId: "gpt-5.4",
              parameters: { authorizationHeader: secret },
            },
          ],
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: {
            ...validEnvelope().value.profile,
            endpoint: `https://user:${secret}@api.example.com/v1`,
          },
        },
      },
      {
        ...validEnvelope(),
        value: {
          ...validEnvelope().value,
          profile: {
            ...validEnvelope().value.profile,
            endpoint: `https://:${secret}@api.example.com/v1`,
          },
        },
      },
    ];

    for (const value of sensitiveValues) {
      const result = parseAgentDeepLink(linkFor(value));
      assert.deepEqual(result, {
        ok: false,
        errorCode: "AGENT_DEEP_LINK_SENSITIVE_VALUE_REJECTED",
      });
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
  });

  it("enforces both raw URL and decoded payload limits", () => {
    assert.deepEqual(parseAgentDeepLink(undefined as unknown as string), {
      ok: false,
      errorCode: "AGENT_DEEP_LINK_TOO_LARGE",
    });
    expectError(
      "x".repeat(AGENT_DEEP_LINK_MAX_RAW_LENGTH + 1),
      "AGENT_DEEP_LINK_TOO_LARGE",
    );

    const value = validEnvelope();
    value.value.profile.config = {
      note: "x".repeat(AGENT_DEEP_LINK_MAX_DECODED_LENGTH),
    } as unknown as typeof value.value.profile.config;
    expectError(linkFor(value), "AGENT_DEEP_LINK_TOO_LARGE");
    expectError("prompthub://import?payload=", "AGENT_DEEP_LINK_INVALID");
    expectError(
      "prompthub://import?payload=%7Bnot-json",
      "AGENT_DEEP_LINK_INVALID",
    );
  });
});

function profileWith(fields: Record<string, unknown>): unknown {
  const envelope = validEnvelope();
  return {
    ...envelope,
    value: {
      ...envelope.value,
      profile: { ...envelope.value.profile, ...fields },
    },
  };
}

function mappingWith(mapping: unknown): unknown {
  const envelope = validEnvelope();
  return {
    ...envelope,
    value: {
      ...envelope.value,
      modelMappings: mapping === null ? [null] : [mapping],
    },
  };
}

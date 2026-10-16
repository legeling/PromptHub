import { describe, expect, it } from "vitest";
import {
  decodeRendererSettings,
  encodeRendererSettings,
} from "../src/renderer-settings-codec";

describe("SQLite renderer settings codec", () => {
  it("separates every credential from ordinary settings and round-trips one current contract", () => {
    const settings = {
      sync: {
        enabled: true,
        provider: "webdav",
        username: "sync-user",
        password: "sync-secret",
      },
      language: "fr",
      githubToken: "github-secret",
      webdavPassword: "dav-secret",
      aiProviders: [
        { id: "provider", apiKey: "provider-secret", provider: "openai" },
      ],
      aiModels: [{ id: "model", apiKey: "model-secret", model: "fixture" }],
      networkProxy: {
        mode: "manual",
        username: "proxy-user",
        password: "proxy-secret",
      },
    };
    const encoded = encodeRendererSettings(settings);
    expect(decodeRendererSettings(encoded.settings, encoded.secrets)).toEqual({
      ...settings,
      modelRouteDefaults: {},
    });
    expect(JSON.stringify(encoded.settings)).not.toMatch(
      /github-secret|dav-secret|provider-secret|model-secret|proxy-user|proxy-secret|sync-user|sync-secret/,
    );
    expect(settings.aiProviders[0].apiKey).toBe("provider-secret");
  });

  it("preserves explicit clears without carrying previous secret references", () => {
    const encoded = encodeRendererSettings({
      githubToken: "",
      aiProviders: [],
      aiModels: [],
      networkProxy: { mode: "direct" },
    });
    expect(encoded.secrets).toEqual({});
    expect(decodeRendererSettings(encoded.settings, encoded.secrets)).toEqual({
      aiProviders: [],
      aiModels: [],
      modelRouteDefaults: {},
      networkProxy: { mode: "direct" },
    });
  });

  it.each([
    { githubToken: 123 },
    { networkProxy: "invalid" },
    { networkProxy: { passwordRef: "hidden" } },
    { aiProviders: [{ id: "provider", apiKeyRef: "hidden" }] },
    { aiModels: [{ id: "model", apiKey: 123 }] },
  ])("rejects malformed public settings %j", (settings) => {
    expect(() => encodeRendererSettings(settings)).toThrow(
      /invalid|reference/i,
    );
  });

  it("rejects missing references and plaintext secrets in current SQL", () => {
    const encoded = encodeRendererSettings({ githubToken: "secret" });
    expect(() => decodeRendererSettings(encoded.settings, {})).toThrow(
      /missing.*secret/i,
    );
    expect(() =>
      decodeRendererSettings({ githubToken: "plaintext" }, {}),
    ).toThrow(/unprotected/i);
    expect(() =>
      decodeRendererSettings(
        { aiProviders: [{ id: "provider", apiKey: "plaintext" }] },
        {},
      ),
    ).toThrow(/unprotected/i);
  });

  it("preserves a large model inventory and rejects duplicate identities", () => {
    const modelCount = 600;
    const aiModels = Array.from({ length: modelCount }, (_, index) => ({
      id: `model-${index}`,
      model: `model-${index}`,
      apiKey: "synthetic-secret",
    }));
    const encoded = encodeRendererSettings({ aiModels });
    expect(
      decodeRendererSettings(encoded.settings, encoded.secrets).aiModels,
    ).toEqual(aiModels);
    expect(() =>
      encodeRendererSettings({ aiModels: [aiModels[0], aiModels[0]] }),
    ).toThrow(/duplicate/i);
  });
});

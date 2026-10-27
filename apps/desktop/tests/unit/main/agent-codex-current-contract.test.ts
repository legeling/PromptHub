import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { afterEach, expect, it } from "vitest";
import type { AgentProviderProfile } from "@prompthub/shared";
import { createAgentCodexProviderAdapter } from "../../../src/main/services/agent-codex-provider-adapter";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(raw: string) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-codex-contract-"),
  );
  roots.push(root);
  await fs.writeFile(path.join(root, "config.toml"), raw);
  const adapter = createAgentCodexProviderAdapter({
    backupRoot: path.join(root, "backups"),
    secretStore: { read: async () => "synthetic-key" },
    backupEncryption: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
  });
  const profile: AgentProviderProfile = {
    id: "gateway",
    platformId: "codex",
    name: "Gateway",
    providerKind: "openai-compatible",
    protocol: "openai-responses",
    endpoint: "https://example.test/v1",
    config: { providerId: "gateway" },
    secretRef: "synthetic",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
  return {
    root,
    adapter,
    context: { agentId: "codex", platformId: "codex", rootPath: root },
    target: {
      profile,
      modelMappings: [
        {
          id: "primary",
          providerProfileId: profile.id,
          routeKey: "primary",
          modelId: "selected",
          parameters: {},
        },
      ],
    },
  };
}

it("reads the native top-level model instead of an inactive legacy profile", async () => {
  const { adapter, context } = await fixture(
    'model="actual"\nmodel_provider="gateway"\n[profiles.gateway]\nmodel="inactive"\n',
  );
  expect((await adapter.inspect(context)).values.model).toBe("actual");
  expect((await adapter.importCurrent(context)).modelMappings[0].modelId).toBe(
    "actual",
  );
});

it.each([
  'auth = { command = "/usr/bin/false" }\nrequires_openai_auth = true\n',
  'requires_openai_auth = true\n[model_providers.gateway.auth]\ncommand="/usr/bin/false"\n',
])(
  "replaces conflicting native authentication and can restore it exactly",
  async (auth) => {
    const raw =
      'model="before"\nmodel_provider="gateway"\n# keep\n[model_providers.gateway]\nname="Gateway"\nbase_url="https://example.test/v1"\n' +
      auth +
      '[model_providers.other]\nname="Untouched"\n';
    const { root, adapter, context, target } = await fixture(raw);
    const plan = await adapter.planActivation({
      context,
      ...target,
      baseline: await adapter.inspect(context),
    });
    const receipt = await adapter.apply(context, plan, target);
    expect((await adapter.verify(context, plan, receipt)).verified).toBe(true);
    const updated = await fs.readFile(path.join(root, "config.toml"), "utf8");
    expect(parse(updated)).toMatchObject({
      model: "selected",
      model_providers: {
        gateway: { experimental_bearer_token: "synthetic-key" },
        other: { name: "Untouched" },
      },
    });
    expect(updated).not.toContain("command");
    expect(updated).not.toContain("requires_openai_auth");
    expect(updated).not.toContain("[profiles.");
    expect(updated).toContain("# keep");
    expect((await adapter.rollback(context, receipt)).restored).toBe(true);
    expect(await fs.readFile(path.join(root, "config.toml"), "utf8")).toBe(raw);
  },
);

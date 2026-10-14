/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type {
  AgentProviderProfile,
  AgentProviderModelMapping,
} from "@prompthub/shared";
import { createAgentOpenCodeProviderAdapter } from "../../../src/main/services/agent-opencode-provider-adapter";
import { createEncryptedConfigBackup } from "../../../src/main/services/agent-encrypted-config-backup";
import { inspectAgentModelConfig } from "../../../src/main/services/agent-model-config";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(auth: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-ownership-"));
  roots.push(root);
  const authPath = path.join(root, "auth.json");
  await fs.writeFile(authPath, JSON.stringify(auth));
  const secretStore = { read: vi.fn(async () => "fixture-key") };
  const options = {
    backupRoot: path.join(root, "backups"),
    authPath,
    secretStore,
    // Only OS encryption is replaced; config IO, planning and rollback are real.
    backupEncryption: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString(),
    },
  };
  return {
    root,
    authPath,
    options,
    secretStore,
    context: { agentId: "opencode", platformId: "opencode", rootPath: root },
    adapter: createAgentOpenCodeProviderAdapter(options),
  };
}

function directTarget() {
  const profile: AgentProviderProfile = {
    id: "direct",
    platformId: "opencode",
    name: "Fixture",
    providerKind: "openai-compatible",
    protocol: "openai-chat",
    endpoint: "https://example.com/v1",
    config: { providerId: "gateway", package: "@ai-sdk/openai-compatible" },
    secretRef: "fixture",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
  const modelMappings: AgentProviderModelMapping[] = [
    {
      id: "primary",
      providerProfileId: profile.id,
      routeKey: "primary",
      modelId: "new-model",
      parameters: {},
    },
  ];
  return { profile, modelMappings };
}

it.each(["oauth", "wellknown"])(
  "rejects direct activation over a target %s credential without changing either file",
  async (type) => {
    const f = await fixture({
      gateway: { type, access: "fixture-access", refresh: "fixture-refresh" },
    });
    const configPath = path.join(f.root, "opencode.json");
    await fs.writeFile(configPath, '{"model":"other/model"}');
    const before = await fs.readFile(f.authPath, "utf8");
    const target = directTarget();
    const plan = await f.adapter.planActivation({
      context: f.context,
      ...target,
      baseline: await f.adapter.inspect(f.context),
    });
    expect(plan.canApply).toBe(false);
    expect(plan.blockedReasons).toContain("native-provider-auth-owned");
    await expect(f.adapter.apply(f.context, plan, target)).rejects.toThrow();
    expect(await fs.readFile(f.authPath, "utf8")).toBe(before);
    expect(await fs.readFile(configPath, "utf8")).toBe(
      '{"model":"other/model"}',
    );
  },
);

it("restores an imported native selection without writing its credential, and rolls back only selection", async () => {
  const f = await fixture({
    gateway: {
      type: "oauth",
      access: "fixture-access",
      refresh: "fixture-refresh",
    },
  });
  const configPath = path.join(f.root, "opencode.jsonc");
  await fs.writeFile(
    configPath,
    '{ // preserve native\n "model":"gateway/original", "provider":{"gateway":{"npm":"@ai-sdk/native","models":{"original":{}}}}}',
  );
  const imported = await f.adapter.importCurrent(f.context);
  const profile: AgentProviderProfile = {
    ...imported.profile,
    endpoint: imported.profile.endpoint ?? null,
    secretRef: imported.profile.secretRef ?? null,
    id: "native",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
  const modelMappings = imported.modelMappings.map((m, i) => ({
    ...m,
    id: String(i),
    providerProfileId: profile.id,
  }));
  const target = { profile, modelMappings };
  const beforeAuth = await fs.readFile(f.authPath, "utf8");
  await fs.writeFile(
    configPath,
    '{"model":"other/model","provider":{"gateway":{"npm":"@ai-sdk/native","models":{"original":{}}}}}',
  );
  const beforeConfig = await fs.readFile(configPath, "utf8");
  const plan = await f.adapter.planActivation({
    context: f.context,
    ...target,
    baseline: await f.adapter.inspect(f.context),
  });
  expect(plan.canApply).toBe(true);
  const receipt = await f.adapter.apply(f.context, plan, target);
  expect((await f.adapter.inspect(f.context)).values.model).toBe("original");
  expect(await fs.readFile(f.authPath, "utf8")).toBe(beforeAuth);
  expect(f.secretStore.read).not.toHaveBeenCalled();
  expect((await f.adapter.verify(f.context, plan, receipt)).verified).toBe(
    true,
  );
  expect((await f.adapter.rollback(f.context, receipt)).restored).toBe(true);
  expect(await fs.readFile(configPath, "utf8")).toBe(beforeConfig);
  expect(await fs.readFile(f.authPath, "utf8")).toBe(beforeAuth);
  await fs.writeFile(f.authPath, "{}");
  expect(
    (
      await f.adapter.planActivation({
        context: f.context,
        ...target,
        baseline: await f.adapter.inspect(f.context),
      })
    ).canApply,
  ).toBe(false);
});

it("merges lower config fields, writes only the selected JSONC file and restores its exact bytes", async () => {
  const f = await fixture();
  const lowerPath = path.join(f.root, "opencode.json");
  const upperPath = path.join(f.root, "opencode.jsonc");
  const lower =
    '{"model":"gateway/original","provider":{"gateway":{"npm":"@ai-sdk/openai-compatible","options":{"baseURL":"https://example.com/v1"},"models":{"original":{}}}}}';
  const upper = '{ // user preferences\n "autoupdate":false }';
  await fs.writeFile(lowerPath, lower);
  await fs.writeFile(upperPath, upper);
  const baseline = await f.adapter.inspect(f.context);
  expect(baseline.values).toMatchObject({
    model: "original",
    package: "@ai-sdk/openai-compatible",
  });
  expect(
    await inspectAgentModelConfig({ agentId: "opencode", rootPath: f.root }),
  ).toMatchObject({ model: "gateway/original" });
  const target = directTarget();
  const plan = await f.adapter.planActivation({
    context: f.context,
    ...target,
    baseline,
  });
  expect(plan.canApply).toBe(true);
  const receipt = await f.adapter.apply(f.context, plan, target);
  const reopened = createAgentOpenCodeProviderAdapter(f.options);
  expect((await reopened.inspect(f.context)).values.model).toBe("new-model");
  expect(await fs.readFile(lowerPath, "utf8")).toBe(lower);
  expect(await fs.readFile(upperPath, "utf8")).toContain("// user preferences");
  expect((await reopened.rollback(f.context, receipt)).restored).toBe(true);
  expect(await fs.readFile(upperPath, "utf8")).toBe(upper);
  const stalePlan = await reopened.planActivation({
    context: f.context,
    ...target,
    baseline: await reopened.inspect(f.context),
  });
  await fs.writeFile(lowerPath, '{"model":"external/change"}');
  await expect(reopened.apply(f.context, stalePlan, target)).rejects.toThrow(
    "AGENT_PROVIDER_PLAN_STALE",
  );
  expect(await fs.readFile(upperPath, "utf8")).toBe(upper);
});

it("recovers a pre-upgrade single-file receipt at the rollback boundary", async () => {
  const f = await fixture();
  const original = '{"model":"native/original"}';
  const auth = await fs.readFile(f.authPath, "utf8");
  const backupRef = await createEncryptedConfigBackup({
    backupRoot: f.options.backupRoot,
    agentId: "opencode",
    sourcePath: path.join(f.root, "provider-bundle.json"),
    content: JSON.stringify({
      version: 1,
      configRelativePath: "opencode.json",
      config: original,
      auth,
    }),
    encryption: f.options.backupEncryption,
  });
  await fs.writeFile(
    path.join(f.root, "opencode.json"),
    '{"model":"changed/model"}',
  );
  const result = await f.adapter.rollback(f.context, {
    platformId: "opencode",
    profileId: "old-profile",
    adapterVersion: "opencode-provider-profile-v1",
    nativeDigestBefore: createHash("sha256")
      .update(`c:${original}`)
      .update(`a:${auth}`)
      .digest("hex"),
    nativeDigestAfter: "unused",
    backupRef,
    appliedAt: 1,
  });
  expect(result.restored).toBe(true);
  expect(await fs.readFile(path.join(f.root, "opencode.json"), "utf8")).toBe(
    original,
  );
  expect(await fs.readFile(f.authPath, "utf8")).toBe(auth);
});

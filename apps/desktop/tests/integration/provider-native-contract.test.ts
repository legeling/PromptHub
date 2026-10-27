import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderAdapterContext,
  AgentProviderProfile,
} from "@prompthub/shared";
import { createAgentCodexProviderAdapter } from "../../src/main/services/agent-codex-provider-adapter";
import { createAgentOpenCodeProviderAdapter } from "../../src/main/services/agent-opencode-provider-adapter";
import { importPiCustomProvider } from "../../src/main/services/agent-pi-model-writes";
import { updateAgentModelConfig } from "../../src/main/services/agent-model-config";
import {
  createClaudeGateway,
  NATIVE_REPLY,
} from "./helpers/claude-native-gateway";
import {
  createOpenAINativeGateway,
  PROVIDER_PROCESS_TIMEOUT_MS,
  PROVIDER_REPLY,
  PROVIDER_SECRET,
  runNativeProvider,
} from "./helpers/openai-native-gateway";

const native = process.env.PROMPTHUB_NATIVE_AGENT_TESTS === "1";
let home: string;
let gateway: Awaited<ReturnType<typeof createOpenAINativeGateway>>;
const MODEL = "fixture-model";
const PI_ARGS = [
  "--offline",
  "-p",
  "--no-session",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
  "--no-approve",
  "Return a greeting.",
];
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString(),
};

describe.skipIf(!native)("installed native provider consumption", () => {
  beforeEach(async () => {
    home = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-native-provider-"),
    );
    await fs.mkdir(path.join(home, "project"));
    gateway = await createOpenAINativeGateway();
  });
  afterEach(async () => {
    await gateway.close();
    await fs.rm(home, { recursive: true, force: true });
  });

  it.each([
    { agent: "codex", responses: true, v2: false },
    { agent: "opencode", responses: false, v2: false },
    { agent: "opencode", responses: true, v2: false },
    { agent: "opencode", responses: false, v2: true },
    { agent: "opencode", responses: true, v2: true },
  ])(
    "$agent responses=$responses v2=$v2 activates, restarts and rolls back",
    async ({ agent, responses, v2 }) => {
      const root = path.join(
        home,
        agent === "codex" ? ".codex" : ".config/opencode",
      );
      await fs.mkdir(root, { recursive: true });
      const configFile = path.join(
        root,
        agent === "codex" ? "config.toml" : "opencode.jsonc",
      );
      const original =
        agent === "codex"
          ? 'model="before"\n[model_providers.gateway]\nname="Old"\n[model_providers.gateway.auth]\ncommand="/usr/bin/false"\n[profiles.gateway]\nmodel="inactive"\n'
          : JSON.stringify(v2 ? { providers: {} } : {});
      await fs.writeFile(configFile, original);
      const context: AgentProviderAdapterContext = {
        agentId: agent,
        platformId: agent,
        rootPath: root,
      };
      const options = {
        backupRoot: path.join(home, "backups"),
        backupEncryption: encryption,
        secretStore: { read: async () => PROVIDER_SECRET },
        authPath: path.join(home, ".local/share/opencode/auth.json"),
      };
      const adapter =
        agent === "codex"
          ? createAgentCodexProviderAdapter(options)
          : createAgentOpenCodeProviderAdapter(options);
      const profile: AgentProviderProfile = {
        id: "test",
        platformId: agent,
        name: "Fixture",
        providerKind: responses ? "openai" : "openai-compatible",
        protocol: responses ? "openai-responses" : "openai-chat",
        endpoint: gateway.endpoint,
        config: {
          providerId: "gateway",
          ...(agent === "opencode"
            ? {
                package: responses
                  ? "@ai-sdk/openai"
                  : "@ai-sdk/openai-compatible",
              }
            : {}),
        },
        secretRef: "synthetic",
        source: "manual",
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      };
      const target = {
        profile,
        modelMappings: [
          {
            id: "primary",
            providerProfileId: "test",
            routeKey: "primary",
            modelId: MODEL,
            parameters: {},
          },
        ],
      };
      const plan = await adapter.planActivation({
        context,
        ...target,
        baseline: await adapter.inspect(context),
      });
      expect(plan.canApply).toBe(true);
      const receipt = await adapter.apply(context, plan, target);
      expect((await adapter.verify(context, plan, receipt)).verified).toBe(
        true,
      );
      const executable = v2 ? process.env.PROMPTHUB_OPENCODE_V2_BINARY : agent;
      expect(
        executable,
        "Set PROMPTHUB_OPENCODE_V2_BINARY to the isolated V2 executable",
      ).toBeTruthy();
      const args =
        agent === "codex"
          ? [
              "exec",
              "--ephemeral",
              "--skip-git-repo-check",
              "--sandbox",
              "read-only",
              "Return a greeting.",
            ]
          : [
              "run",
              ...(v2 ? ["--standalone"] : ["--pure"]),
              "--format",
              "json",
              "Return a greeting.",
            ];
      for (let restart = 0; restart < 2; restart += 1) {
        const result = await runNativeProvider(executable!, args, home, root);
        expect(result.stderr).not.toContain("Error loading config");
        expect(result, result.stderr).toMatchObject({
          exitCode: 0,
          killed: false,
        });
        expect(result.stdout).toContain(PROVIDER_REPLY);
      }
      expect(gateway.requests.length).toBeGreaterThanOrEqual(2);
      expect(
        gateway.requests.every(
          (request) =>
            request.model === MODEL &&
            request.authenticated &&
            request.path.endsWith(
              responses ? "/responses" : "/chat/completions",
            ),
        ),
      ).toBe(true);
      expect((await adapter.rollback(context, receipt)).restored).toBe(true);
      expect(await fs.readFile(configFile, "utf8")).toBe(original);
    },
    PROVIDER_PROCESS_TIMEOUT_MS * 2 + 10_000,
  );

  it.each([
    "openai-completions",
    "openai-responses",
    "google-generative-ai",
  ] as const)(
    "Pi %s consumes persisted model and credentials after restart",
    async (api) => {
      const root = path.join(home, ".pi/agent");
      await fs.mkdir(root, { recursive: true });
      const options = { backupRoot: path.join(home, "backups") };
      await importPiCustomProvider(
        root,
        {
          providerId: "fixture",
          baseUrl: gateway.endpoint,
          api,
          models: [{ id: MODEL }],
        },
        PROVIDER_SECRET,
        options,
      );
      await updateAgentModelConfig(
        {
          agentId: "pi",
          rootPath: root,
          model: `fixture/${MODEL}`,
        },
        options,
      );
      for (let restart = 0; restart < 2; restart += 1) {
        const result = await runNativeProvider("pi", PI_ARGS, home, root);
        expect(result, result.stderr).toMatchObject({
          exitCode: 0,
          killed: false,
        });
        expect(result.stdout).toContain(PROVIDER_REPLY);
      }
      expect(gateway.requests).toHaveLength(2);
      expect(
        gateway.requests.every(
          (request) => request.model === MODEL && request.authenticated,
        ),
      ).toBe(true);
    },
    PROVIDER_PROCESS_TIMEOUT_MS * 2 + 10_000,
  );
  it(
    "Pi Anthropic consumes persisted model and API key after restart",
    async () => {
      const anthropic = await createClaudeGateway(PROVIDER_SECRET);
      try {
        const root = path.join(home, ".pi/agent");
        await fs.mkdir(root, { recursive: true });
        const options = { backupRoot: path.join(home, "backups") };
        await importPiCustomProvider(
          root,
          {
            providerId: "fixture",
            baseUrl: anthropic.endpoint,
            api: "anthropic-messages",
            models: [{ id: MODEL }],
          },
          PROVIDER_SECRET,
          options,
        );
        await updateAgentModelConfig(
          { agentId: "pi", rootPath: root, model: `fixture/${MODEL}` },
          options,
        );
        for (let restart = 0; restart < 2; restart += 1) {
          const result = await runNativeProvider("pi", PI_ARGS, home, root);
          expect(result, result.stderr).toMatchObject({
            exitCode: 0,
            killed: false,
          });
          expect(result.stdout).toContain(NATIVE_REPLY);
        }
        expect(anthropic.requests).toHaveLength(2);
        expect(
          anthropic.requests.every(
            (request) =>
              request.model === MODEL && request.apiKey === PROVIDER_SECRET,
          ),
        ).toBe(true);
      } finally {
        await anthropic.close();
      }
    },
    PROVIDER_PROCESS_TIMEOUT_MS * 2 + 10_000,
  );
});

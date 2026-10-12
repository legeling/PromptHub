import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

import {
  reconcileAgentProviderState,
  type AgentProviderAdapter,
} from "@prompthub/core";
import type {
  AgentModelConfiguration,
  AgentProviderActivationInput,
  AgentProviderActivationPlan,
  AgentProviderAdapterContext,
  AgentProviderApplyReceipt,
  AgentProviderComparableState,
  AgentProviderComparableValue,
  AgentProviderImportPreview,
  AgentProviderRollbackResult,
  AgentProviderVerification,
  UpdateAgentModelResult,
} from "@prompthub/shared";

import {
  atomicWrite,
  inspectAgentModelConfig,
  readTextConfig,
  updateAgentModelConfig,
} from "./agent-model-config";

interface AgentModelProviderAdapterOptions {
  backupRoot: string;
  now?: () => number;
  inspect?: typeof inspectAgentModelConfig;
  update?: typeof updateAgentModelConfig;
}

const ADAPTER_VERSION = "model-profile-v1";
export const AGENT_MODEL_PROVIDER_PLATFORM_IDS = SKILL_PLATFORMS.filter(
  ({ id }) => isAgentDepthCapabilityAvailable(id, "providerModel"),
).map(({ id }) => id);
const SUPPORTED_PLATFORM_IDS = new Set<string>(
  AGENT_MODEL_PROVIDER_PLATFORM_IDS,
);
const DEFAULT_CONFIG_PATHS: Record<string, string> = {
  antigravity: "settings.json",
  autoclaw: "setting.json",
  claude: "settings.json",
  copilot: "settings.json",
  codex: "config.toml",
  copaw: "config.json",
  gemini: "settings.json",
  grok: "config.toml",
  hermes: "config.yaml",
  kiro: "settings/cli.json",
  kimi: "config.toml",
  opencode: "opencode.jsonc",
  pi: "settings.json",
  openclaw: "openclaw.json",
  qclaw: "openclaw.json",
  qoder: "settings.json",
  qwen: "settings.json",
  "oh-my-pi": "config.yml",
};

function requireContext(
  platformId: string,
  context: AgentProviderAdapterContext,
): void {
  if (
    context.platformId !== platformId ||
    context.agentId !== platformId ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim()
  ) {
    throw new Error("AGENT_PROVIDER_CONTEXT_PLATFORM_MISMATCH");
  }
}

function digestValues(
  platformId: string,
  values: Record<string, AgentProviderComparableValue>,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ platformId, values }))
    .digest("hex");
}

function comparableState(
  platformId: string,
  config: AgentModelConfiguration,
): AgentProviderComparableState {
  const values: Record<string, AgentProviderComparableValue> = {
    status: config.status,
    model: config.model,
    secondaryModel: config.secondaryModel,
    provider: config.provider,
    endpoint: config.endpoint,
    credentialStatus: config.credentialStatus,
    sourceRelativePath: config.sourceRelativePath,
  };
  return {
    platformId,
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digestValues(platformId, values),
    values,
  };
}

function desiredValues(input: AgentProviderActivationInput): {
  blockedReasons: string[];
  values: Record<string, AgentProviderComparableValue>;
} {
  const blockedReasons: string[] = [];
  const values: Record<string, AgentProviderComparableValue> = {};
  const seen = new Set<string>();
  for (const mapping of input.modelMappings) {
    if (seen.has(mapping.routeKey)) {
      blockedReasons.push("duplicate-model-route");
      continue;
    }
    seen.add(mapping.routeKey);
    const field =
      mapping.routeKey === "primary"
        ? "model"
        : mapping.routeKey === "secondary"
          ? "secondaryModel"
          : `route:${mapping.routeKey}`;
    values[field] = mapping.modelId;
    if (Object.keys(mapping.parameters).length > 0) {
      blockedReasons.push("model-parameters-unsupported");
    }
  }
  if (!seen.has("primary")) blockedReasons.push("primary-model-required");
  return { blockedReasons: [...new Set(blockedReasons)], values };
}

function blockedReason(config: AgentModelConfiguration): string | null {
  if (config.status === "invalid") return "native-config-invalid";
  if (config.status === "unsupported") return "native-config-unsupported";
  if (!config.canSetModel) return "native-config-read-only";
  return null;
}

function desiredField(
  plan: AgentProviderActivationPlan,
  field: string,
): string | null {
  const decision = plan.decisions.find(
    (candidate) => candidate.field === field,
  );
  return decision?.status === "apply" && typeof decision.desired === "string"
    ? decision.desired
    : null;
}

function resolvedTargetPath(
  context: AgentProviderAdapterContext,
  sourceRelativePath: string | null,
  backupRef: string | null,
): string {
  const relativePath =
    sourceRelativePath ||
    DEFAULT_CONFIG_PATHS[context.platformId] ||
    (backupRef ? path.basename(backupRef) : undefined);
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\0")
  ) {
    throw new Error("AGENT_PROVIDER_TARGET_INVALID");
  }
  const root = path.resolve(context.rootPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("AGENT_PROVIDER_TARGET_INVALID");
  }
  return target;
}

function assertBackupPath(backupRoot: string, backupRef: string): void {
  const root = path.resolve(backupRoot);
  const candidate = path.resolve(backupRef);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error("AGENT_PROVIDER_BACKUP_INVALID");
  }
}

export function createAgentModelProviderAdapter(
  platformId: string,
  options: AgentModelProviderAdapterOptions,
): AgentProviderAdapter {
  if (!SUPPORTED_PLATFORM_IDS.has(platformId)) {
    throw new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  }
  const inspect = options.inspect ?? inspectAgentModelConfig;
  const update = options.update ?? updateAgentModelConfig;
  const now = options.now ?? Date.now;

  async function inspectState(
    context: AgentProviderAdapterContext,
  ): Promise<AgentProviderComparableState> {
    requireContext(platformId, context);
    return comparableState(platformId, await inspect(context));
  }

  return {
    platformId,
    version: ADAPTER_VERSION,
    inspect: inspectState,
    async importCurrent(context): Promise<AgentProviderImportPreview> {
      requireContext(platformId, context);
      const config = await inspect(context);
      if (config.status === "invalid" || config.status === "unsupported") {
        throw new Error("AGENT_PROVIDER_IMPORT_UNAVAILABLE");
      }
      const modelMappings = config.model
        ? [
            {
              routeKey: "primary",
              modelId: config.model,
              parameters: {},
            },
          ]
        : [];
      if (platformId === "opencode" && config.secondaryModel) {
        modelMappings.push({
          routeKey: "secondary",
          modelId: config.secondaryModel,
          parameters: {},
        });
      }
      return {
        state: comparableState(platformId, config),
        profile: {
          platformId,
          name: config.provider || `${platformId} native`,
          providerKind: config.provider || "platform-default",
          protocol: "platform-native",
          endpoint: config.endpoint,
          config: {
            adapter: config.adapter,
            credentialStatus: config.credentialStatus,
          },
          secretRef: null,
          source: "native-import",
        },
        modelMappings,
        warnings: config.formattingMayChange
          ? ["native-formatting-may-change"]
          : [],
      };
    },
    async planActivation(input) {
      requireContext(platformId, input.context);
      if (input.profile.platformId !== platformId) {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const config = await inspect(input.context);
      const current = comparableState(platformId, config);
      const desired = desiredValues(input);
      const configBlock = blockedReason(config);
      const blockedReasons = [
        ...desired.blockedReasons,
        ...(input.profile.endpoint ? ["provider-endpoint-unsupported"] : []),
        ...(input.profile.secretRef ? ["provider-secret-unsupported"] : []),
        ...(!["native", "platform-native"].includes(input.profile.protocol)
          ? ["provider-protocol-unsupported"]
          : []),
        ...(configBlock ? [configBlock] : []),
      ];
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline: input.baseline,
        current,
        desired: { platformId, values: desired.values },
        supportedKeys:
          platformId === "opencode" ? ["model", "secondaryModel"] : ["model"],
        blockedReasons,
      });
    },
    async apply(context, plan): Promise<AgentProviderApplyReceipt> {
      requireContext(platformId, context);
      const before = await inspectState(context);
      if (
        plan.platformId !== platformId ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== before.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_PROVIDER_APPLY_PLAN_INVALID");
      }
      const model =
        desiredField(plan, "model") ||
        (typeof before.values.model === "string" ? before.values.model : null);
      if (!model) throw new Error("AGENT_PROVIDER_PRIMARY_MODEL_REQUIRED");
      const secondaryModel =
        platformId === "opencode"
          ? desiredField(plan, "secondaryModel") ||
            (typeof before.values.secondaryModel === "string"
              ? before.values.secondaryModel
              : null)
          : undefined;
      const result: UpdateAgentModelResult = await update(
        {
          agentId: platformId,
          rootPath: context.rootPath,
          model,
          secondaryModel,
        },
        { backupRoot: options.backupRoot },
      );
      const after = comparableState(platformId, result);
      return {
        platformId,
        profileId: plan.profileId,
        adapterVersion: ADAPTER_VERSION,
        nativeDigestBefore: before.nativeDigest,
        nativeDigestAfter: after.nativeDigest,
        backupRef: result.backupPath,
        appliedAt: now(),
      };
    },
    async verify(context, plan, receipt): Promise<AgentProviderVerification> {
      requireContext(platformId, context);
      const state = await inspectState(context);
      const fieldsMatch = plan.decisions.every(
        (decision) =>
          decision.status !== "apply" ||
          state.values[decision.field] === decision.desired,
      );
      const verified =
        receipt.platformId === platformId &&
        receipt.adapterVersion === ADAPTER_VERSION &&
        state.nativeDigest === receipt.nativeDigestAfter &&
        fieldsMatch;
      return {
        verified,
        nativeDigest: state.nativeDigest,
        state,
        ...(verified ? {} : { errorCode: "provider-state-mismatch" }),
      };
    },
    async rollback(context, receipt): Promise<AgentProviderRollbackResult> {
      try {
        requireContext(platformId, context);
        const current = await inspect(context);
        const targetPath = resolvedTargetPath(
          context,
          current.sourceRelativePath,
          receipt.backupRef,
        );
        if (receipt.backupRef) {
          assertBackupPath(options.backupRoot, receipt.backupRef);
          await atomicWrite(
            targetPath,
            await readTextConfig(receipt.backupRef),
          );
        } else {
          await fs.rm(targetPath, { force: true });
        }
        const restored = await inspectState(context);
        return {
          restored: restored.nativeDigest === receipt.nativeDigestBefore,
          nativeDigest: restored.nativeDigest,
          ...(restored.nativeDigest === receipt.nativeDigestBefore
            ? {}
            : { errorCode: "provider-rollback-mismatch" }),
        };
      } catch {
        return {
          restored: false,
          nativeDigest: null,
          errorCode: "provider-rollback-failed",
        };
      }
    },
  };
}

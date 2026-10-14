import type {
  AgentCliUpdateDescriptor,
  SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  AgentCliDiagnostic,
  AgentCliInstallSource,
  AgentCliLifecycleErrorCode,
  AgentCliLifecyclePlan,
  AgentCliLifecycleResult,
} from "@prompthub/shared/types";
import {
  diagnoseAgentCli,
  supportsAgentCliUpdateSource,
  type AgentCliDiagnosticDependencies,
} from "./agent-cli-diagnostic-service";

const PLAN_TTL_MS = 5 * 60 * 1_000;
const MAX_PENDING_PLANS = 32;
import {
  AGENT_CLI_MUTATION_TIMEOUT_MS,
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
} from "./agent-native-command-policy";
const SEMVER_PATTERN =
  /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/;

export class AgentCliLifecycleError extends Error {
  constructor(public readonly code: AgentCliLifecycleErrorCode) {
    super(code);
    this.name = "AgentCliLifecycleError";
  }
}

export interface AgentCliLifecycleDependencies extends AgentCliDiagnosticDependencies {
  randomId(): string;
}

interface PendingUpdatePlan {
  publicPlan: AgentCliLifecyclePlan;
  platform: SkillPlatform;
  ownerId: number;
  agentExecutablePath: string;
  rollbackArgs: string[];
}

function semanticVersion(versionText: string | null): string | null {
  return versionText?.match(SEMVER_PATTERN)?.[1] ?? null;
}

function requireHealthyVersion(diagnostic: AgentCliDiagnostic): {
  executablePath: string;
  installSource: AgentCliInstallSource;
  version: string;
} {
  if (diagnostic.status === "not-installed") {
    throw new AgentCliLifecycleError("not-installed");
  }
  if (
    diagnostic.status !== "installed" ||
    !diagnostic.executablePath ||
    !diagnostic.installSource
  ) {
    throw new AgentCliLifecycleError("diagnostic-failed");
  }
  const version = semanticVersion(diagnostic.version);
  if (!version) {
    throw new AgentCliLifecycleError("invalid-version");
  }
  return {
    executablePath: diagnostic.executablePath,
    installSource: diagnostic.installSource,
    version,
  };
}

async function resolveFirstExecutable(
  candidates: string[],
  dependencies: AgentCliLifecycleDependencies,
): Promise<string | null> {
  for (const candidate of candidates) {
    const executable = await dependencies.resolve(candidate);
    if (executable) return executable;
  }
  return null;
}

async function resolveUpdateCommand(
  update: AgentCliUpdateDescriptor,
  current: ReturnType<typeof requireHealthyVersion>,
  dependencies: AgentCliLifecycleDependencies,
): Promise<{
  executable: string;
  args: string[];
  rollbackArgs: string[];
}> {
  const executable = update.command
    ? await resolveFirstExecutable(
        update.command.executableCandidates,
        dependencies,
      )
    : current.executablePath;
  if (!executable) {
    throw new AgentCliLifecycleError("update-command-not-found");
  }
  return {
    executable,
    args: [...update.args],
    rollbackArgs: [
      ...(update.rollbackArgsPrefix ?? update.args),
      `${update.rollbackTargetPrefix}${current.version}`,
    ],
  };
}

export class AgentCliLifecycleService {
  private readonly plans = new Map<string, PendingUpdatePlan>();

  constructor(private readonly dependencies: AgentCliLifecycleDependencies) {}

  async planUpdate(
    platform: SkillPlatform,
    ownerId: number,
  ): Promise<AgentCliLifecyclePlan> {
    const update = platform.cli?.update;
    if (!update) {
      throw new AgentCliLifecycleError("unsupported");
    }
    const diagnostic = await diagnoseAgentCli(platform, this.dependencies);
    const current = requireHealthyVersion(diagnostic);
    if (!supportsAgentCliUpdateSource(platform, current.installSource)) {
      throw new AgentCliLifecycleError("unsupported-install-source");
    }
    const command = await resolveUpdateCommand(
      update,
      current,
      this.dependencies,
    );
    const now = this.dependencies.now();
    this.prunePlans(now);
    const id = this.createPlanId();
    const storedPlan: AgentCliLifecyclePlan = {
      id,
      agentId: platform.id,
      operation: "update",
      command: {
        executable: command.executable,
        args: command.args,
      },
      currentVersion: current.version,
      installSource: current.installSource,
      expiresAt: now + PLAN_TTL_MS,
    };
    this.plans.set(id, {
      publicPlan: storedPlan,
      platform,
      ownerId,
      agentExecutablePath: current.executablePath,
      rollbackArgs: command.rollbackArgs,
    });
    return {
      ...storedPlan,
      command: {
        executable: storedPlan.command.executable,
        args: [...storedPlan.command.args],
      },
    };
  }

  async applyUpdate(
    planId: string,
    ownerId: number,
  ): Promise<AgentCliLifecycleResult> {
    const pending = this.plans.get(planId);
    if (!pending) {
      throw new AgentCliLifecycleError("plan-not-found");
    }
    if (pending.ownerId !== ownerId) {
      throw new AgentCliLifecycleError("plan-owner-mismatch");
    }
    this.plans.delete(planId);
    if (this.dependencies.now() > pending.publicPlan.expiresAt) {
      throw new AgentCliLifecycleError("plan-expired");
    }

    const before = await diagnoseAgentCli(pending.platform, this.dependencies);
    const current = requireHealthyVersion(before);
    if (
      current.executablePath !== pending.agentExecutablePath ||
      current.version !== pending.publicPlan.currentVersion
    ) {
      throw new AgentCliLifecycleError("precondition-changed");
    }

    try {
      await this.dependencies.run(
        pending.publicPlan.command.executable,
        pending.publicPlan.command.args,
        {
          timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
          maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
        },
      );
    } catch {
      return this.recoverAfterFailure(pending, "update-failed");
    }

    const verified = await this.safeDiagnostic(pending.platform);
    const verifiedVersion = semanticVersion(verified?.version ?? null);
    if (
      verified?.status === "installed" &&
      verified.executablePath === pending.agentExecutablePath &&
      verifiedVersion
    ) {
      return {
        agentId: pending.publicPlan.agentId,
        operation: "update",
        status:
          verifiedVersion === pending.publicPlan.currentVersion
            ? "no-change"
            : "applied",
        previousVersion: pending.publicPlan.currentVersion,
        currentVersion: verifiedVersion,
        errorCode: null,
      };
    }
    return this.rollback(pending, "verification-failed");
  }

  private async recoverAfterFailure(
    pending: PendingUpdatePlan,
    errorCode: "update-failed",
  ): Promise<AgentCliLifecycleResult> {
    const diagnostic = await this.safeDiagnostic(pending.platform);
    const version = semanticVersion(diagnostic?.version ?? null);
    if (
      diagnostic?.status === "installed" &&
      diagnostic.executablePath === pending.agentExecutablePath &&
      version === pending.publicPlan.currentVersion
    ) {
      return this.failureResult(pending, version, errorCode);
    }
    return this.rollback(pending, errorCode);
  }

  private async rollback(
    pending: PendingUpdatePlan,
    errorCode: "update-failed" | "verification-failed",
  ): Promise<AgentCliLifecycleResult> {
    try {
      await this.dependencies.run(
        pending.publicPlan.command.executable,
        pending.rollbackArgs,
        {
          timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
          maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
        },
      );
      const restored = await this.safeDiagnostic(pending.platform);
      const restoredVersion = semanticVersion(restored?.version ?? null);
      if (
        restored?.status === "installed" &&
        restored.executablePath === pending.agentExecutablePath &&
        restoredVersion === pending.publicPlan.currentVersion
      ) {
        return {
          agentId: pending.publicPlan.agentId,
          operation: "update",
          status: "rolled-back",
          previousVersion: pending.publicPlan.currentVersion,
          currentVersion: restoredVersion,
          errorCode,
        };
      }
    } catch {
      // A stable public result is returned below; raw command output stays local.
    }
    return this.failureResult(pending, null, "rollback-failed");
  }

  private failureResult(
    pending: PendingUpdatePlan,
    currentVersion: string | null,
    errorCode: "update-failed" | "rollback-failed",
  ): AgentCliLifecycleResult {
    return {
      agentId: pending.publicPlan.agentId,
      operation: "update",
      status: "failed",
      previousVersion: pending.publicPlan.currentVersion,
      currentVersion,
      errorCode,
    };
  }

  private async safeDiagnostic(
    platform: SkillPlatform,
  ): Promise<AgentCliDiagnostic | null> {
    try {
      return await diagnoseAgentCli(platform, this.dependencies);
    } catch {
      return null;
    }
  }

  private prunePlans(now: number): void {
    for (const [id, plan] of this.plans) {
      if (plan.publicPlan.expiresAt < now) this.plans.delete(id);
    }
    while (this.plans.size >= MAX_PENDING_PLANS) {
      const oldestId = this.plans.keys().next().value as string;
      this.plans.delete(oldestId);
    }
  }

  private createPlanId(): string {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.dependencies.randomId();
      if (id && !this.plans.has(id)) return id;
    }
    throw new AgentCliLifecycleError("plan-not-found");
  }
}

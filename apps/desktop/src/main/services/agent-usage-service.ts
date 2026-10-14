import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isPlatformRootConfigured } from "@prompthub/core/platform-paths";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { isClaudeCloudProviderEnabled } from "@prompthub/shared/utils/claude-config";

import { parse as parseToml } from "smol-toml";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";

import type {
  AgentUsageMetric,
  AgentUsageQuota,
} from "@prompthub/shared/types";
import {
  createAntigravityLocalUsageClient,
  type AntigravityLocalUsageClient,
} from "./agent-usage-antigravity-local";
import {
  ACCOUNT_USAGE_SCOPE,
  amountFromRemaining,
  amountFromUsed,
  boundUsageMetrics,
  percentageFromRemaining,
  percentageFromUsed,
} from "./agent-usage-contract";
import { SkillInstaller } from "./skill-installer";
import {
  getPlatformRootDir,
  getBuiltinAgentOverride,
} from "./skill-installer-utils";
import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "./native-command";
import {
  createKimiOAuthTokenService,
  type KimiOAuthTokenService,
} from "./kimi-oauth-token-service";

export interface AgentUsageServiceOptions {
  resolveConfigRoot?: (agentId: string) => string;
  pathExists?: (candidate: string) => Promise<boolean>;
  commandRunner?: NativeCommandRunner;
  fetchImpl?: typeof fetch;
  readFile?: (filePath: string) => Promise<string>;
  readDir?: (dirPath: string) => Promise<string[]>;
  now?: () => number;
  homeDir?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  antigravityLocalClient?: AntigravityLocalUsageClient;
  kimiOAuthTokenService?: KimiOAuthTokenService;
}

export interface AgentUsageService {
  getUsage(
    agentId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AgentUsageQuota>;
}

interface ClaudeCredentials {
  accessToken: string;
  expiresAt: number | null;
  subscriptionType: string | null;
}

interface CodexCredentials {
  accessToken: string;
  accountId: string | null;
}

interface UsageWindow {
  utilization: number;
  resetsAt: number | null;
}

interface CodexUsageWindow extends UsageWindow {
  windowSeconds: number;
}

interface TokenCredentials {
  accessToken: string;
  expiresAt: number | null;
  renewable?: boolean;
}

type FetchJsonResult =
  | { kind: "ok"; body: unknown }
  | { kind: "expired" }
  | { kind: "unavailable"; errorCode: string };

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const USAGE_ADAPTER = "claude-oauth-v1";
const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_USAGE_ADAPTER = "codex-oauth-v1";
const CODEX_OFFICIAL_PROVIDER = "openai";
const KIMI_USAGE_ENDPOINT = "https://api.kimi.com/coding/v1/usages";
const KIMI_USAGE_ADAPTER = "kimi-oauth-v1";
const GROK_USER_ENDPOINT =
  "https://cli-chat-proxy.grok.com/v1/user?include=subscription";
const GROK_BILLING_ENDPOINT =
  "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const GROK_USAGE_ADAPTER = "grok-oauth-v1";
const ANTIGRAVITY_USAGE_ADAPTER = "antigravity-oauth-v1";
const ANTIGRAVITY_KEYCHAIN_SERVICE = "gemini";
const ANTIGRAVITY_KEYCHAIN_ACCOUNT = "antigravity";
const GEMINI_USAGE_ADAPTER = "gemini-oauth-v1";
const COPILOT_USAGE_ENDPOINT = "https://api.github.com/copilot_internal/user";
const COPILOT_USAGE_ADAPTER = "copilot-oauth-v1";
const CLOUDCODE_BASE_URL = "https://cloudcode-pa.googleapis.com/v1internal";
const ANTIGRAVITY_TOKEN_RELATIVE_PATH = path.join(
  ".gemini",
  "antigravity-cli",
  "antigravity-oauth-token",
);
const GEMINI_CREDENTIALS_RELATIVE_PATH = path.join(
  ".gemini",
  "oauth_creds.json",
);
const GH_HOSTS_RELATIVE_PATH = path.join(".config", "gh", "hosts.yml");
const COPILOT_HOSTS_RELATIVE_PATH = path.join(
  ".config",
  "github-copilot",
  "hosts.json",
);
const SEVEN_DAY_WINDOW_SECONDS = 86_400;
const LEGACY_KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_TIMEOUT_MS = 10_000;
const KEYCHAIN_MAX_BUFFER = 64 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const MAX_GROK_AUTH_BYTES = 256 * 1024;
const KIMI_WINDOW_SECONDS_BY_UNIT: Readonly<Record<string, number>> = {
  second: 1,
  minute: 60,
  hour: 3_600,
  day: 86_400,
  week: 604_800,
};

const WINDOW_METRIC_META = {
  fiveHour: {
    id: "fiveHour",
    label: "5-hour window",
    scope: ACCOUNT_USAGE_SCOPE,
    durationSeconds: 18_000,
  },
  sevenDay: {
    id: "sevenDay",
    label: "7-day window",
    scope: ACCOUNT_USAGE_SCOPE,
    durationSeconds: 604_800,
  },
  sevenDayOpus: {
    id: "sevenDayOpus",
    label: "7-day Opus window",
    scope: { kind: "model-group", id: "opus", label: "Opus" } as const,
    durationSeconds: 604_800,
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Accepts ISO strings or epoch numbers; values below 1e12 are treated as
// epoch seconds, anything larger as epoch milliseconds.
function parseResetTime(value: unknown): number | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    return parseResetTime(Number(value));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  return null;
}

function toWindowMetric(
  key: keyof typeof WINDOW_METRIC_META,
  window: UsageWindow | null,
): AgentUsageMetric | null {
  if (!window) return null;
  const meta = WINDOW_METRIC_META[key];
  return {
    id: meta.id,
    label: meta.label,
    scope: meta.scope,
    period: { kind: "rolling", durationSeconds: meta.durationSeconds },
    value: percentageFromUsed(window.utilization),
    resetsAt: window.resetsAt,
  };
}

function defaultResolveConfigRoot(agentId: string): string {
  const platform = SkillInstaller.getSupportedPlatforms().find(
    (candidate) => candidate.id === agentId,
  );
  if (!platform) {
    throw new Error(`Unknown Agent platform: ${agentId}`);
  }
  return getPlatformRootDir(platform);
}

async function defaultPathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function hashedKeychainService(configRoot: string): string {
  const digest = createHash("sha256").update(configRoot).digest("hex");
  return `${LEGACY_KEYCHAIN_SERVICE}-${digest.slice(0, 8)}`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(value) ? value : null;
}

function parseCredentials(raw: string): ClaudeCredentials | null {
  const value = parseJsonObject(raw);
  if (!value) return null;

  const oauth = isRecord(value.claudeAiOauth) ? value.claudeAiOauth : null;
  const tokenCandidate = oauth?.accessToken ?? value.accessToken;
  if (typeof tokenCandidate !== "string" || !tokenCandidate.trim()) {
    return null;
  }

  const expiresAt =
    typeof oauth?.expiresAt === "number" && Number.isFinite(oauth.expiresAt)
      ? oauth.expiresAt
      : null;
  const subscriptionType =
    typeof oauth?.subscriptionType === "string" && oauth.subscriptionType.trim()
      ? oauth.subscriptionType.trim()
      : null;

  return {
    accessToken: tokenCandidate,
    expiresAt,
    subscriptionType,
  };
}

function parseUsageWindow(value: unknown): UsageWindow | null {
  if (!isRecord(value)) return null;
  const utilization = value.utilization;
  if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
    return null;
  }
  const resetsAt =
    typeof value.resets_at === "string" && value.resets_at
      ? Date.parse(value.resets_at)
      : Number.NaN;
  return {
    utilization,
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  };
}

function parseCodexAuth(raw: string): CodexCredentials | null {
  const value = parseJsonObject(raw);
  if (!value) return null;
  const tokens = isRecord(value.tokens) ? value.tokens : null;
  const accessToken = tokens?.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return null;
  }
  const accountId = tokens?.account_id;
  return {
    accessToken,
    accountId:
      typeof accountId === "string" && accountId.trim()
        ? accountId.trim()
        : null,
  };
}

// The official Codex backend does not guarantee primary/secondary slot
// semantics, so windows are classified by their length instead of their slot.
function parseCodexWindow(value: unknown): CodexUsageWindow | null {
  if (!isRecord(value)) return null;
  const usedPercent = value.used_percent;
  const windowSeconds = value.limit_window_seconds;
  if (
    typeof usedPercent !== "number" ||
    !Number.isFinite(usedPercent) ||
    typeof windowSeconds !== "number" ||
    !Number.isFinite(windowSeconds)
  ) {
    return null;
  }
  const resetAt = value.reset_at;
  return {
    utilization: usedPercent,
    resetsAt:
      typeof resetAt === "number" && Number.isFinite(resetAt)
        ? resetAt * 1000
        : null,
    windowSeconds,
  };
}

function pickLargerWindow(
  current: CodexUsageWindow | null,
  candidate: CodexUsageWindow,
): CodexUsageWindow {
  if (!current || candidate.utilization >= current.utilization) {
    return candidate;
  }
  return current;
}

function parseKimiCredentials(raw: string): TokenCredentials | null {
  const value = parseJsonObject(raw);
  if (!value) return null;
  const accessToken = value.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) return null;
  return {
    accessToken,
    expiresAt: parseResetTime(value.expires_at),
  };
}

function parseGrokCredentials(raw: string): TokenCredentials | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_GROK_AUTH_BYTES) return null;
  const value = parseJsonObject(raw);
  if (!value) return null;
  for (const [host, candidate] of Object.entries(value)) {
    if (!host.startsWith("https://auth.x.ai::") || !isRecord(candidate)) {
      continue;
    }
    const accessToken = toNonEmptyString(candidate.key);
    if (!accessToken) continue;
    return {
      accessToken,
      expiresAt: parseResetTime(candidate.expires_at),
    };
  }
  return null;
}

function parseKimiWindowDuration(
  entry: Record<string, unknown>,
): number | null {
  const window = isRecord(entry.window) ? entry.window : null;
  const duration = toFiniteNumber(window?.duration);
  const unit = toNonEmptyString(window?.timeUnit)
    ?.toLowerCase()
    .replace(/^time_unit_/, "")
    .replace(/s$/, "");
  if (duration === null || duration <= 0 || !unit) return null;
  const multiplier = KIMI_WINDOW_SECONDS_BY_UNIT[unit] ?? null;
  return multiplier === null ? null : duration * multiplier;
}

function parseKimiQuotaValue(
  detail: Record<string, unknown>,
): AgentUsageMetric["value"] | null {
  const limit = toFiniteNumber(detail.limit);
  if (limit === null) return null;
  const remaining = toFiniteNumber(detail.remaining);
  if (remaining !== null) {
    return amountFromRemaining(remaining, limit, "requests");
  }
  const used = toFiniteNumber(detail.used);
  return used === null ? null : amountFromUsed(used, limit, "requests");
}

function parseKimiRollingLimit(entry: unknown): AgentUsageMetric | null {
  if (!isRecord(entry)) return null;
  const detail = isRecord(entry.detail) ? entry.detail : entry;
  const value = parseKimiQuotaValue(detail);
  if (!value) return null;
  return {
    id: "rolling",
    label: "Rolling window",
    scope: ACCOUNT_USAGE_SCOPE,
    period: {
      kind: "rolling",
      durationSeconds: parseKimiWindowDuration(entry),
    },
    value,
    resetsAt: parseResetTime(
      entry.resetTime ?? detail.resetTime ?? entry.reset_time,
    ),
  };
}

function mapKimiMetrics(body: unknown): AgentUsageMetric[] {
  if (!isRecord(body)) return [];
  const metrics: AgentUsageMetric[] = [];
  const usage = isRecord(body.usage) ? body.usage : null;
  if (usage) {
    const value = parseKimiQuotaValue(usage);
    const resetsAt = parseResetTime(usage.resetTime);
    if (value?.kind === "amount") {
      metrics.push({
        id: "weekly",
        label: "Weekly quota",
        scope: ACCOUNT_USAGE_SCOPE,
        period: { kind: "calendar", unit: "week" },
        value,
        resetsAt,
      });
    } else {
      metrics.push({
        id: "weekly",
        label: "Weekly quota",
        scope: ACCOUNT_USAGE_SCOPE,
        period: { kind: "calendar", unit: "week" },
        value: { kind: "unknown" },
        resetsAt,
      });
    }
  }
  if (Array.isArray(body.limits)) {
    for (const entry of body.limits) {
      const metric = parseKimiRollingLimit(entry);
      if (metric) metrics.push(metric);
    }
  }
  return metrics;
}

function parseKimiPlan(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.user)) return null;
  const membership = isRecord(body.user.membership)
    ? body.user.membership
    : null;
  return toNonEmptyString(membership?.level);
}

function parseGrokPlan(body: unknown): string | null {
  return isRecord(body) ? toNonEmptyString(body.subscriptionTier) : null;
}

function mapGrokWeeklyMetric(body: unknown): AgentUsageMetric[] {
  if (!isRecord(body) || !isRecord(body.config)) return [];
  const used = toFiniteNumber(body.config.creditUsagePercent);
  const currentPeriod = isRecord(body.config.currentPeriod)
    ? body.config.currentPeriod
    : null;
  const resetsAt = parseResetTime(currentPeriod?.end);
  if (used === null || resetsAt === null) return [];
  return [
    {
      id: "weekly",
      label: "Weekly quota",
      scope: ACCOUNT_USAGE_SCOPE,
      period: { kind: "calendar", unit: "week" },
      value: percentageFromUsed(used),
      resetsAt,
    },
  ];
}

function parseAntigravityCredentials(raw: string): TokenCredentials | null {
  const value = parseJsonObject(raw);
  if (!value || !isRecord(value.token)) return null;
  const accessToken = value.token.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) return null;
  return {
    accessToken,
    expiresAt: parseResetTime(value.token.expiry),
    renewable:
      typeof value.token.refresh_token === "string" &&
      Boolean(value.token.refresh_token.trim()),
  };
}

function parseAntigravityKeychainCredentials(
  raw: string,
): TokenCredentials | null {
  const direct = parseAntigravityCredentials(raw);
  if (direct) return direct;

  // Antigravity 2.x stores `<account-ref>:<base64url-json>` in the macOS
  // Keychain. Decode candidates defensively so a future prefix change does
  // not expose or invalidate the credential payload.
  for (const candidate of raw.split(":").reverse()) {
    if (!candidate.trim()) continue;
    try {
      const decoded = Buffer.from(candidate.trim(), "base64url").toString(
        "utf8",
      );
      const parsed = parseAntigravityCredentials(decoded);
      if (parsed) return parsed;
    } catch {
      // Continue to the next candidate or the file-based fallbacks.
    }
  }
  return null;
}

function parseGeminiCredentials(raw: string): TokenCredentials | null {
  const value = parseJsonObject(raw);
  if (!value) return null;
  const accessToken = value.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) return null;
  return {
    accessToken,
    expiresAt: parseResetTime(value.expiry_date),
  };
}

function extractCloudCodeProject(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const project = body.cloudaicompanionProject;
  if (typeof project === "string" && project.trim()) return project.trim();
  if (isRecord(project)) return toNonEmptyString(project.id);
  return null;
}

function extractCloudCodeTier(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.currentTier)) return null;
  const tier = body.currentTier;
  return toNonEmptyString(tier.name) ?? toNonEmptyString(tier.id);
}

// The models payload is a dict keyed by model name in current responses,
// but a list shape is accepted defensively.
function mapAntigravityModelMetrics(body: unknown): AgentUsageMetric[] {
  if (!isRecord(body)) return [];
  const models = body.models;
  const entries: Array<[string, unknown]> = [];
  if (isRecord(models)) {
    entries.push(...Object.entries(models));
  } else if (Array.isArray(models)) {
    for (const item of models) {
      if (!isRecord(item)) continue;
      const name =
        toNonEmptyString(item.name) ??
        toNonEmptyString(item.model) ??
        toNonEmptyString(item.id);
      if (name) entries.push([name, item]);
    }
  }
  const metrics: AgentUsageMetric[] = [];
  for (const [name, value] of entries) {
    if (!isRecord(value) || !isRecord(value.quotaInfo)) continue;
    const quotaInfo = value.quotaInfo;
    const remainingFraction = toFiniteNumber(quotaInfo.remainingFraction);
    if (remainingFraction === null) continue;
    metrics.push({
      id: `model:${name}`,
      label: "Model quota",
      scope: { kind: "model", id: name, label: name },
      period: { kind: "provider-defined", label: "Provider quota" },
      value: percentageFromRemaining(remainingFraction * 100),
      resetsAt: parseResetTime(quotaInfo.resetTime),
    });
  }
  return metrics;
}

function mapGeminiBucketMetrics(body: unknown): AgentUsageMetric[] {
  if (!isRecord(body) || !Array.isArray(body.buckets)) return [];
  const metrics: AgentUsageMetric[] = [];
  for (const bucket of body.buckets) {
    if (!isRecord(bucket)) continue;
    const modelId = toNonEmptyString(bucket.modelId);
    const remainingFraction = toFiniteNumber(bucket.remainingFraction);
    if (!modelId || remainingFraction === null) continue;
    metrics.push({
      id: `model:${modelId}`,
      label: "Model quota",
      scope: { kind: "model", id: modelId, label: modelId },
      period: { kind: "provider-defined", label: "Provider quota" },
      value: percentageFromRemaining(remainingFraction * 100),
      resetsAt: parseResetTime(bucket.resetTime),
    });
  }
  return metrics;
}

function parseCopilotSnapshot(
  id: string,
  label: string,
  value: unknown,
  resetsAt: number | null,
): AgentUsageMetric | null {
  if (!isRecord(value)) return null;
  const base = {
    id,
    label,
    scope: { kind: "feature", id, label } as const,
    period: { kind: "calendar", unit: "billing-cycle" } as const,
    resetsAt,
  };
  if (value.unlimited === true) {
    return { ...base, value: { kind: "unlimited" } };
  }
  const entitlement = toFiniteNumber(value.entitlement);
  const remaining = toFiniteNumber(value.remaining);
  const percentUsed = toFiniteNumber(value.percent_used);
  if (entitlement !== null && remaining !== null) {
    return {
      ...base,
      value: amountFromRemaining(remaining, entitlement, "requests"),
    };
  }
  if (percentUsed !== null) {
    return { ...base, value: percentageFromUsed(percentUsed) };
  }
  return { ...base, value: { kind: "unknown" } };
}

function mapCopilotMetrics(body: unknown): AgentUsageMetric[] {
  if (!isRecord(body)) return [];
  const resetsAt = parseResetTime(body.quota_reset_date);
  const snapshots = isRecord(body.quota_snapshots) ? body.quota_snapshots : {};
  return [
    parseCopilotSnapshot(
      "premium",
      "Premium requests",
      snapshots.premium_interactions,
      resetsAt,
    ),
    parseCopilotSnapshot("chat", "Chat requests", snapshots.chat, resetsAt),
  ].filter((metric): metric is AgentUsageMetric => metric !== null);
}

function buildQuota(
  agentId: string,
  status: AgentUsageQuota["status"],
  fetchedAt: number,
  overrides: Partial<AgentUsageQuota> = {},
): AgentUsageQuota {
  const quota: AgentUsageQuota = {
    schemaVersion: 2,
    agentId,
    adapter: USAGE_ADAPTER,
    status,
    source: "provider",
    plan: null,
    metrics: [],
    fetchedAt,
    ...overrides,
  };
  quota.metrics = boundUsageMetrics(quota.metrics);
  return quota;
}

export function createAgentUsageService(
  options: AgentUsageServiceOptions = {},
): AgentUsageService {
  const resolveConfigRoot =
    options.resolveConfigRoot ?? defaultResolveConfigRoot;
  const pathExists = options.pathExists ?? defaultPathExists;
  const commandRunner = options.commandRunner ?? createNativeCommandRunner();
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFile =
    options.readFile ?? ((filePath: string) => fs.readFile(filePath, "utf8"));
  const readDir = options.readDir ?? ((dirPath: string) => fs.readdir(dirPath));
  const now = options.now ?? Date.now;
  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const antigravityLocalClient =
    options.antigravityLocalClient ??
    createAntigravityLocalUsageClient({ commandRunner, platform });
  const kimiOAuthTokenService =
    options.kimiOAuthTokenService ??
    createKimiOAuthTokenService({
      fetchImpl,
      now,
      platform,
      readFile,
      validateCredentialFile: options.readFile === undefined,
    });

  const cache = new Map<
    string,
    { quota: AgentUsageQuota; storedAt: number; credentialScope: string }
  >();

  function claudeCredentialScope(configRoot: string): string {
    const definition = getPlatformById("claude");
    if (!definition) throw new Error("Missing Claude platform definition");
    return isPlatformRootConfigured(definition, configRoot, {
      homeDir,
      environment: options.environment,
      rootOverride: options.resolveConfigRoot
        ? undefined
        : getBuiltinAgentOverride("claude")?.rootPath,
    })
      ? hashedKeychainService(configRoot)
      : LEGACY_KEYCHAIN_SERVICE;
  }

  async function readKeychainCredentials(
    serviceName: string,
  ): Promise<ClaudeCredentials | null> {
    const security = await commandRunner.resolve("security");
    if (!security) return null;
    try {
      const result = await commandRunner.run(
        security,
        ["find-generic-password", "-s", serviceName, "-w"],
        { timeout: KEYCHAIN_TIMEOUT_MS, maxBuffer: KEYCHAIN_MAX_BUFFER },
      );
      return parseCredentials(result.stdout);
    } catch {
      return null;
    }
  }

  async function readFileCredentials(
    configRoot: string,
  ): Promise<ClaudeCredentials | null> {
    const credentialsPath = path.join(configRoot, ".credentials.json");
    try {
      const raw = await readFile(credentialsPath);
      return parseCredentials(raw);
    } catch {
      return null;
    }
  }

  async function resolveCredentials(
    configRoot: string,
    credentialScope: string,
  ): Promise<ClaudeCredentials | null> {
    if (platform === "darwin") {
      const credentials = await readKeychainCredentials(credentialScope);
      if (credentials) return credentials;
    }
    return readFileCredentials(configRoot);
  }

  async function fetchUsage(
    credentials: ClaudeCredentials,
  ): Promise<FetchJsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(USAGE_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      if (response.status === 401) {
        return { kind: "expired" };
      }
      if (!response.ok) {
        return { kind: "unavailable", errorCode: "http-error" };
      }
      return { kind: "ok", body: (await response.json()) as unknown };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        kind: "unavailable",
        errorCode: isTimeout ? "timeout" : "network-error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Shared fetch wrapper for the adapters added after Claude/Codex; both
  // 401 and 403 mean the stored token is no longer accepted.
  async function fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<FetchJsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { kind: "expired" };
      }
      if (!response.ok) {
        return { kind: "unavailable", errorCode: "http-error" };
      }
      return { kind: "ok", body: (await response.json()) as unknown };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        kind: "unavailable",
        errorCode: isTimeout ? "timeout" : "network-error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // A third-party model_provider in config.toml means the user is not on the
  // official Codex backend, so the ChatGPT usage endpoint must not be called.
  async function readCodexModelProvider(
    configRoot: string,
  ): Promise<string | null> {
    try {
      const raw = await readFile(path.join(configRoot, getAgentPrimaryModelConfigPath("codex")));
      const parsed: unknown = parseToml(raw);
      if (!isRecord(parsed)) return null;
      const provider = parsed.model_provider;
      return typeof provider === "string" && provider.trim()
        ? provider.trim()
        : null;
    } catch {
      return null;
    }
  }

  async function readCodexCredentials(
    configRoot: string,
  ): Promise<CodexCredentials | null> {
    try {
      const raw = await readFile(path.join(configRoot, "auth.json"));
      return parseCodexAuth(raw);
    } catch {
      return null;
    }
  }

  // A custom gateway (ANTHROPIC_BASE_URL) or cloud provider flag in
  // settings.json means Claude Code traffic bypasses the official Anthropic
  // subscription, so the official usage endpoint must not be called.
  async function isClaudeCustomGateway(configRoot: string): Promise<boolean> {
    try {
      const raw = await readFile(
        path.join(configRoot, getAgentPrimaryModelConfigPath("claude")),
      );
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || !isRecord(parsed.env)) return false;
      const env = parsed.env;
      const endpoint = env.ANTHROPIC_BASE_URL;
      return (
        (typeof endpoint === "string" && endpoint.trim().length > 0) ||
        [
          "CLAUDE_CODE_USE_BEDROCK",
          "CLAUDE_CODE_USE_VERTEX",
          "CLAUDE_CODE_USE_FOUNDRY",
        ].some((key) => isClaudeCloudProviderEnabled(env[key]))
      );
    } catch {
      return false;
    }
  }

  async function fetchCodexUsage(
    credentials: CodexCredentials,
  ): Promise<FetchJsonResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: "application/json",
    };
    if (credentials.accountId) {
      headers["ChatGPT-Account-Id"] = credentials.accountId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(CODEX_USAGE_ENDPOINT, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { kind: "expired" };
      }
      if (!response.ok) {
        return { kind: "unavailable", errorCode: "http-error" };
      }
      return { kind: "ok", body: (await response.json()) as unknown };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        kind: "unavailable",
        errorCode: isTimeout ? "timeout" : "network-error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function queryCodexUsage(agentId: string, configRoot: string): Promise<AgentUsageQuota> {
    const buildCodexQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: CODEX_USAGE_ADAPTER,
        ...overrides,
      });

    const modelProvider = await readCodexModelProvider(configRoot);
    if (modelProvider !== null && modelProvider !== CODEX_OFFICIAL_PROVIDER) {
      return buildCodexQuota("unavailable", {
        errorCode: "custom-provider-active",
      });
    }

    const credentials = await readCodexCredentials(configRoot);
    if (!credentials) {
      return buildCodexQuota("no-credentials");
    }

    const result = await fetchCodexUsage(credentials);
    if (result.kind === "expired") {
      return buildCodexQuota("expired");
    }
    if (result.kind === "unavailable") {
      return buildCodexQuota("unavailable", { errorCode: result.errorCode });
    }

    const body = isRecord(result.body) ? result.body : {};
    const rateLimit = isRecord(body.rate_limit) ? body.rate_limit : {};
    let fiveHour: CodexUsageWindow | null = null;
    let sevenDay: CodexUsageWindow | null = null;
    for (const slot of ["primary_window", "secondary_window"] as const) {
      const window = parseCodexWindow(rateLimit[slot]);
      if (!window) continue;
      if (window.windowSeconds <= SEVEN_DAY_WINDOW_SECONDS) {
        fiveHour = pickLargerWindow(fiveHour, window);
      } else {
        sevenDay = pickLargerWindow(sevenDay, window);
      }
    }
    return buildCodexQuota("ok", {
      metrics: [
        toWindowMetric("fiveHour", fiveHour),
        toWindowMetric("sevenDay", sevenDay),
      ].filter((metric): metric is AgentUsageMetric => metric !== null),
      plan:
        typeof body.plan_type === "string" && body.plan_type.trim()
          ? body.plan_type.trim()
          : null,
    });
  }

  async function readKimiCredentialsFile(
    filePath: string,
  ): Promise<TokenCredentials | null> {
    try {
      const raw = await readFile(filePath);
      return parseKimiCredentials(raw);
    } catch {
      return null;
    }
  }

  async function readLegacyKimiCredentials(
    configRoot: string,
  ): Promise<TokenCredentials | null> {
    // Older builds dropped token json files directly under <root>/oauth/.
    let entries: string[];
    try {
      entries = await readDir(path.join(configRoot, "oauth"));
    } catch {
      return null;
    }
    for (const entry of [...entries].sort()) {
      if (!entry.endsWith(".json")) continue;
      const parsed = await readKimiCredentialsFile(
        path.join(configRoot, "oauth", entry),
      );
      if (parsed) return parsed;
    }
    return null;
  }

  async function queryKimiUsage(
    agentId: string,
    configRoot: string,
  ): Promise<AgentUsageQuota> {
    const buildKimiQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: KIMI_USAGE_ADAPTER,
        ...overrides,
      });

    const currentToken = await kimiOAuthTokenService.getAccessToken(configRoot);
    let accessToken: string;
    let currentCredential = false;
    if (currentToken.kind === "ok") {
      accessToken = currentToken.accessToken;
      currentCredential = true;
    } else if (currentToken.kind === "no-credentials") {
      const legacy = await readLegacyKimiCredentials(configRoot);
      if (!legacy) return buildKimiQuota("no-credentials");
      if (legacy.expiresAt !== null && legacy.expiresAt <= now()) {
        return buildKimiQuota("expired");
      }
      accessToken = legacy.accessToken;
    } else if (currentToken.kind === "expired") {
      return buildKimiQuota("expired");
    } else {
      return buildKimiQuota("unavailable", {
        errorCode: currentToken.errorCode,
      });
    }

    let result = await fetchJson(KIMI_USAGE_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (result.kind === "expired" && currentCredential) {
      const refreshed = await kimiOAuthTokenService.getAccessToken(configRoot, {
        forceRefresh: true,
      });
      if (refreshed.kind === "ok") {
        result = await fetchJson(KIMI_USAGE_ENDPOINT, {
          method: "GET",
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
        });
      } else if (refreshed.kind === "unavailable") {
        return buildKimiQuota("unavailable", {
          errorCode: refreshed.errorCode,
        });
      }
    }
    if (result.kind === "expired") {
      return buildKimiQuota("expired");
    }
    if (result.kind === "unavailable") {
      return buildKimiQuota("unavailable", { errorCode: result.errorCode });
    }
    return buildKimiQuota("ok", {
      metrics: mapKimiMetrics(result.body),
      plan: parseKimiPlan(result.body),
    });
  }

  async function queryGrokUsage(
    agentId: string,
    configRoot: string,
  ): Promise<AgentUsageQuota> {
    const buildGrokQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: GROK_USAGE_ADAPTER,
        ...overrides,
      });

    let credentials: TokenCredentials | null = null;
    try {
      credentials = parseGrokCredentials(
        await readFile(path.join(configRoot, "auth.json")),
      );
    } catch {
      // Missing or unreadable native auth remains an explicit no-credential state.
    }
    if (!credentials) return buildGrokQuota("no-credentials");
    if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
      return buildGrokQuota("expired");
    }

    const request = (url: string) =>
      fetchJson(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/json",
          "User-Agent": "prompthub-desktop",
          "x-grok-client-mode": "build",
        },
      });
    const [userResult, billingResult] = await Promise.all([
      request(GROK_USER_ENDPOINT),
      request(GROK_BILLING_ENDPOINT),
    ]);
    const plan =
      userResult.kind === "ok" ? parseGrokPlan(userResult.body) : null;
    if (billingResult.kind === "expired") {
      return buildGrokQuota("expired", { plan });
    }
    if (billingResult.kind === "unavailable") {
      return buildGrokQuota("unavailable", {
        plan,
        errorCode: billingResult.errorCode,
      });
    }
    return buildGrokQuota("ok", {
      plan,
      metrics: mapGrokWeeklyMetric(billingResult.body),
    });
  }

  async function readHomeCredentials(
    relativePath: string,
    parse: (raw: string) => TokenCredentials | null,
  ): Promise<TokenCredentials | null> {
    try {
      const raw = await readFile(path.join(homeDir, relativePath));
      return parse(raw);
    } catch {
      return null;
    }
  }

  async function readAntigravityKeychainCredentials(): Promise<TokenCredentials | null> {
    if (platform !== "darwin") return null;
    const security = await commandRunner.resolve("security");
    if (!security) return null;
    try {
      const result = await commandRunner.run(
        security,
        [
          "find-generic-password",
          "-s",
          ANTIGRAVITY_KEYCHAIN_SERVICE,
          "-a",
          ANTIGRAVITY_KEYCHAIN_ACCOUNT,
          "-w",
        ],
        { timeout: KEYCHAIN_TIMEOUT_MS, maxBuffer: KEYCHAIN_MAX_BUFFER },
      );
      return parseAntigravityKeychainCredentials(result.stdout.trim());
    } catch {
      return null;
    }
  }

  async function resolveAntigravityCredentialCandidates(): Promise<
    TokenCredentials[]
  > {
    const candidates = await Promise.all([
      readAntigravityKeychainCredentials(),
      readHomeCredentials(
        ANTIGRAVITY_TOKEN_RELATIVE_PATH,
        parseAntigravityCredentials,
      ),
      readHomeCredentials(
        GEMINI_CREDENTIALS_RELATIVE_PATH,
        parseGeminiCredentials,
      ),
    ]);
    const seen = new Set<string>();
    return candidates.filter((candidate): candidate is TokenCredentials => {
      if (!candidate || seen.has(candidate.accessToken)) return false;
      seen.add(candidate.accessToken);
      return true;
    });
  }

  // Shared Cloud Code Assist preamble for the Google-backed adapters:
  // resolves the managed project id and the subscription tier label.
  async function loadCodeAssist(
    accessToken: string,
    body: string,
  ): Promise<
    | { kind: "ok"; projectId: string | null; plan: string | null }
    | { kind: "expired" }
    | { kind: "unavailable"; errorCode: string }
  > {
    const result = await fetchJson(`${CLOUDCODE_BASE_URL}:loadCodeAssist`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (result.kind !== "ok") return result;
    return {
      kind: "ok",
      projectId: extractCloudCodeProject(result.body),
      plan: extractCloudCodeTier(result.body),
    };
  }

  async function queryAntigravityUsage(
    agentId: string,
  ): Promise<AgentUsageQuota> {
    const buildAntigravityQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: ANTIGRAVITY_USAGE_ADAPTER,
        ...overrides,
      });

    const localUsage = await antigravityLocalClient.getUsage();
    if (localUsage.kind === "ok") {
      return buildAntigravityQuota("ok", {
        adapter: "antigravity-local-v1",
        metrics: localUsage.metrics,
        plan: localUsage.plan,
      });
    }

    // Prefer the current Antigravity desktop session, then retain the 1.x CLI
    // and shared Gemini files as compatibility sources. A stale source must
    // never hide a later valid one.
    const candidates = await resolveAntigravityCredentialCandidates();
    if (candidates.length === 0) {
      return buildAntigravityQuota("no-credentials");
    }
    let sawExpiredCredential = false;
    let sawRenewableCredential = false;
    for (const credentials of candidates) {
      if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
        sawExpiredCredential = true;
        sawRenewableCredential ||= credentials.renewable === true;
        continue;
      }

      const assist = await loadCodeAssist(
        credentials.accessToken,
        JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
      );
      if (assist.kind === "expired") {
        sawExpiredCredential = true;
        sawRenewableCredential ||= credentials.renewable === true;
        continue;
      }
      if (assist.kind === "unavailable") {
        return buildAntigravityQuota("unavailable", {
          errorCode: assist.errorCode,
        });
      }

      const modelsResult = await fetchJson(
        `${CLOUDCODE_BASE_URL}:fetchAvailableModels`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project: assist.projectId }),
        },
      );
      if (modelsResult.kind === "expired") {
        sawExpiredCredential = true;
        sawRenewableCredential ||= credentials.renewable === true;
        continue;
      }
      if (modelsResult.kind === "unavailable") {
        return buildAntigravityQuota("unavailable", {
          errorCode: modelsResult.errorCode,
        });
      }
      return buildAntigravityQuota("ok", {
        metrics: mapAntigravityModelMetrics(modelsResult.body),
        plan: assist.plan,
      });
    }
    if (sawRenewableCredential) {
      return buildAntigravityQuota("unavailable", {
        errorCode:
          localUsage.kind === "not-running"
            ? "antigravity-not-running"
            : "antigravity-session-unavailable",
      });
    }
    return buildAntigravityQuota(
      sawExpiredCredential ? "expired" : "no-credentials",
    );
  }

  async function queryGeminiUsage(agentId: string): Promise<AgentUsageQuota> {
    const buildGeminiQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: GEMINI_USAGE_ADAPTER,
        ...overrides,
      });

    const credentials = await readHomeCredentials(
      GEMINI_CREDENTIALS_RELATIVE_PATH,
      parseGeminiCredentials,
    );
    if (!credentials) {
      return buildGeminiQuota("no-credentials");
    }
    if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
      return buildGeminiQuota("expired");
    }

    const assist = await loadCodeAssist(credentials.accessToken, "{}");
    if (assist.kind === "expired") {
      return buildGeminiQuota("expired");
    }
    if (assist.kind === "unavailable") {
      return buildGeminiQuota("unavailable", { errorCode: assist.errorCode });
    }

    const quotaResult = await fetchJson(
      `${CLOUDCODE_BASE_URL}:retrieveUserQuota`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project: assist.projectId }),
      },
    );
    if (quotaResult.kind === "expired") {
      return buildGeminiQuota("expired");
    }
    if (quotaResult.kind === "unavailable") {
      return buildGeminiQuota("unavailable", {
        errorCode: quotaResult.errorCode,
      });
    }
    return buildGeminiQuota("ok", {
      metrics: mapGeminiBucketMetrics(quotaResult.body),
      plan: assist.plan,
    });
  }

  // GitHub OAuth tokens are reused from the gh CLI or the Copilot CLI
  // credential stores; PromptHub never runs its own OAuth flow here.
  async function readCopilotToken(): Promise<string | null> {
    try {
      const raw = await readFile(path.join(homeDir, GH_HOSTS_RELATIVE_PATH));
      // hosts.yml is flat enough that a line parse avoids a YAML dependency.
      const match = raw.match(/^\s*oauth_token:\s*(\S+)\s*$/m);
      if (match?.[1]) return match[1];
    } catch {
      // Fall through to the Copilot hosts.json store.
    }
    try {
      const raw = await readFile(
        path.join(homeDir, COPILOT_HOSTS_RELATIVE_PATH),
      );
      const value = parseJsonObject(raw);
      if (!value) return null;
      for (const host of Object.values(value)) {
        const token = isRecord(host)
          ? toNonEmptyString(host.oauth_token)
          : null;
        if (token) return token;
      }
    } catch {
      return null;
    }
    return null;
  }

  async function queryCopilotUsage(agentId: string): Promise<AgentUsageQuota> {
    const buildCopilotQuota = (
      status: AgentUsageQuota["status"],
      overrides: Partial<AgentUsageQuota> = {},
    ): AgentUsageQuota =>
      buildQuota(agentId, status, now(), {
        adapter: COPILOT_USAGE_ADAPTER,
        ...overrides,
      });

    const token = await readCopilotToken();
    if (!token) {
      return buildCopilotQuota("no-credentials");
    }

    const result = await fetchJson(COPILOT_USAGE_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "prompthub-desktop",
      },
    });
    if (result.kind === "expired") {
      return buildCopilotQuota("expired");
    }
    if (result.kind === "unavailable") {
      return buildCopilotQuota("unavailable", { errorCode: result.errorCode });
    }
    const body = isRecord(result.body) ? result.body : {};
    return buildCopilotQuota("ok", {
      metrics: mapCopilotMetrics(result.body),
      plan: toNonEmptyString(body.copilot_plan),
    });
  }

  async function queryUsage(
    agentId: string,
    configRoot: string,
    credentialScope = "",
  ): Promise<AgentUsageQuota> {
    // Resolving the config root through the platform registry doubles as the
    // agentId allowlist check; unknown ids throw before any lookup happens.
    if (!isAgentDepthCapabilityAvailable(agentId, "usage")) {
      return buildQuota(agentId, "unavailable", now(), {
        adapter: "unsupported",
        errorCode: "unsupported-agent",
      });
    }
    if (!(await pathExists(configRoot))) {
      return buildQuota(agentId, "unavailable", now(), {
        adapter: "agent-installation-guard-v1",
        errorCode: "agent-not-installed",
      });
    }
    if (agentId === "codex") {
      return queryCodexUsage(agentId, configRoot);
    }
    if (agentId === "kimi") {
      return queryKimiUsage(agentId, configRoot);
    }
    if (agentId === "grok") {
      return queryGrokUsage(agentId, configRoot);
    }
    if (agentId === "antigravity") {
      return queryAntigravityUsage(agentId);
    }
    if (agentId === "gemini") {
      return queryGeminiUsage(agentId);
    }
    if (agentId === "copilot") {
      return queryCopilotUsage(agentId);
    }
    if (agentId !== "claude") {
      return buildQuota(agentId, "unavailable", now(), {
        adapter: "unsupported",
        errorCode: "unsupported-agent",
      });
    }

    // A custom gateway or cloud provider in settings.json means traffic no
    // longer goes to the official Anthropic subscription, so the official
    // quota endpoint must not be queried (mirrors the Codex short-circuit).
    if (await isClaudeCustomGateway(configRoot)) {
      return buildQuota(agentId, "unavailable", now(), {
        errorCode: "custom-provider-active",
      });
    }

    const credentials = await resolveCredentials(configRoot, credentialScope);
    if (!credentials) {
      return buildQuota(agentId, "no-credentials", now());
    }
    if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
      return buildQuota(agentId, "expired", now(), {
        plan: credentials.subscriptionType,
      });
    }

    const result = await fetchUsage(credentials);
    if (result.kind === "expired") {
      return buildQuota(agentId, "expired", now(), {
        plan: credentials.subscriptionType,
      });
    }
    if (result.kind === "unavailable") {
      return buildQuota(agentId, "unavailable", now(), {
        plan: credentials.subscriptionType,
        errorCode: result.errorCode,
      });
    }

    const body = isRecord(result.body) ? result.body : {};
    return buildQuota(agentId, "ok", now(), {
      metrics: [
        toWindowMetric("fiveHour", parseUsageWindow(body.five_hour)),
        toWindowMetric("sevenDay", parseUsageWindow(body.seven_day)),
        toWindowMetric("sevenDayOpus", parseUsageWindow(body.seven_day_opus)),
      ].filter((metric): metric is AgentUsageMetric => metric !== null),
      plan: credentials.subscriptionType,
    });
  }

  return {
    async getUsage(agentId, getOptions = {}) {
      if (typeof agentId !== "string" || agentId.trim().length === 0) {
        throw new Error("Agent usage query requires a non-empty agentId");
      }

      const scopedRoot = resolveConfigRoot(agentId);
      const credentialScope = agentId === "claude"
        ? claudeCredentialScope(scopedRoot) : scopedRoot;
      const cached = cache.get(agentId);
      if (
        !getOptions.forceRefresh &&
        cached &&
        cached.credentialScope === credentialScope &&
        now() - cached.storedAt < CACHE_TTL_MS
      ) {
        return cached.quota;
      }

      const quota = await queryUsage(agentId, scopedRoot, credentialScope);
      cache.set(agentId, { quota, storedAt: now(), credentialScope });
      return quota;
    },
  };
}

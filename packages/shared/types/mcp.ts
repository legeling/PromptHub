export type McpTransport = "stdio" | "streamable-http" | "sse";

export const MCP_TARGET_KINDS = [
  "codex",
  "claude",
  "claude-desktop",
  "cursor",
  "vscode",
  "cline",
  "gemini",
  "windsurf",
  "kiro",
  "kilo",
  "workbuddy",
  "codebuddy",
  "kimi",
  "augment",
  "amp",
  "qwen",
  "opencode",
  "pi",
  "oh-my-pi",
  "zcode",
  "grok",
  "openclaw",
  "qoder",
  "antigravity",
  "reasonix",
  "custom-json",
  "custom-toml",
] as const;

export type McpTargetKind = (typeof MCP_TARGET_KINDS)[number];

export function isMcpTargetKind(value: unknown): value is McpTargetKind {
  return (
    typeof value === "string" &&
    (MCP_TARGET_KINDS as readonly string[]).includes(value)
  );
}

export type McpTargetScope = "global" | "workspace" | "custom";

export interface McpTargetPreset {
  id: string;
  target: McpTargetKind;
  scope: McpTargetScope;
  label: string;
  path: string;
  platformId?: string;
}

export interface McpServerSource {
  type: "manual" | "market" | "import";
  id?: string;
  label?: string;
  url?: string;
  marketSourceId?: string;
  marketSourceUrl?: string;
  installedTemplateVersion?: string;
  installedTemplateFingerprint?: string;
  marketLastCheckedAt?: number;
  marketLastError?: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  notes?: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Canonical `${VAR}` templates for process environment entries. */
  envRefs?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** Canonical templates for HTTP header values; values are never resolved here. */
  headerRefs?: Record<string, string>;
  /** Native options are projected only to targets that implement their contract. */
  authProviderType?: string;
  oauth?: { clientId?: string; clientSecret?: string };
  disabledTools?: string[];
  enabledTools?: string[];
  bearerTokenEnvVar?: string;
  headersHelper?: string;
  httpHeadersHelper?: string;
  startupTimeoutSec?: number;
  toolTimeoutSec?: number;
  required?: boolean;
  envVars?: string[];
  enabled: boolean;
  isFavorite?: boolean;
  tags?: string[];
  source: McpServerSource;
  createdAt: number;
  updatedAt: number;
}

export type McpServerDraft = Partial<McpServerConfig> & {
  id?: string;
  name?: string;
};

export interface McpRuntimeDetails {
  runtime?: string;
  packageOrScript?: string;
}

export interface McpEnvRequirement {
  name: string;
  required: boolean;
  description?: string;
  placeholder?: string;
  source: "env" | "args" | "url" | "headers";
}

export interface McpPlaceholderRequirement {
  value: string;
  source: "args" | "url" | "headers";
  description?: string;
}

export interface McpMarketSource {
  id: string;
  label: string;
  url: string;
  description?: string;
  trustLevel: "official" | "verified" | "community";
}

export interface McpMarketFetchRequest {
  sourceId: string;
  url: string;
}

export interface McpTargetBinding {
  id: string;
  serverIds: string[];
  target: McpTargetKind;
  scope: McpTargetScope;
  path: string;
  enabled: boolean;
  entryDigests?: Record<string, McpTargetEntryDigest>;
  lastAppliedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface McpLibraryFile {
  kind: "prompthub-mcp-library";
  version: 1;
  updatedAt: string;
  servers: McpServerConfig[];
  bindings: McpTargetBinding[];
}

export interface McpMarketTemplate {
  id: string;
  version?: string;
  name: string;
  displayName: string;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  envRefs?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  headerRefs?: Record<string, string>;
  tags: string[];
  homepage?: string;
  repository?: string;
  documentationUrl?: string;
  packageName?: string;
  runtime?: string;
  source?: {
    id: string;
    label: string;
    url?: string;
    trustLevel?: "official" | "verified" | "community";
  };
  requiredEnv?: McpEnvRequirement[];
}

export type McpMarketUpdateStatus =
  | "up-to-date"
  | "update-available"
  | "local-modified"
  | "conflict"
  | "legacy-review"
  | "source-mismatch";

export interface McpMarketUpdateCheck {
  serverId: string;
  templateId: string;
  status: McpMarketUpdateStatus;
  localModified: boolean;
  remoteChanged: boolean;
  installedFingerprint?: string;
  localFingerprint: string;
  remoteFingerprint: string;
  checkedAt: number;
  reason: string;
}

export interface McpMarketUpdateResult {
  status: "updated" | "up-to-date";
  check: McpMarketUpdateCheck;
  server: McpServerConfig;
}

export interface McpApplyTarget {
  target: McpTargetKind;
  scope: McpTargetScope;
  path: string;
  serverIds: string[];
  force?: boolean;
}

export interface McpRemoveTargetNames {
  target: McpTargetKind;
  scope: McpTargetScope;
  path: string;
  serverNames: string[];
}

export interface McpApplyResult {
  path: string;
  /** @deprecated Target projections no longer create persistent backup files. */
  backupPath?: string;
  target: McpTargetKind;
  appliedServerNames: string[];
  overwrittenServerNames: string[];
  content: string;
}

export type McpTargetEntryDigestAlgorithm = "mcp-target-entry-sha256-v1";

export interface McpTargetEntryDigest {
  algorithm: McpTargetEntryDigestAlgorithm;
  digest: string;
  serverName: string;
  recordedAt: number;
}

export type McpTargetSyncStatus =
  | "synced"
  | "needs-sync"
  | "external-modified"
  | "conflict"
  | "missing-target"
  | "missing-entry"
  | "parse-error"
  | "legacy-needs-review"
  | "skipped-disabled-platform"
  | "skipped-server-disabled";

export interface McpTargetSyncCheck {
  bindingId: string;
  target: McpTargetKind;
  scope: McpTargetScope;
  path: string;
  serverId: string;
  serverName: string;
  status: McpTargetSyncStatus;
  safeToReapply: boolean;
  baselineDigest?: string;
  currentDigest?: string;
  targetDigest?: string;
  reason: string;
}

export interface McpTargetSyncOptions {
  disabledPlatformIds?: string[];
  includeDisabled?: boolean;
  recreateMissing?: boolean;
  forceConflicts?: boolean;
  targetBindingIds?: string[];
}

export interface McpTargetSyncUpdated {
  /** @deprecated Target projections no longer create persistent backup files. */
  backupPath?: string;
  bindingId: string;
  path: string;
  scope: McpTargetScope;
  serverName: string;
  status: McpTargetSyncStatus;
  target: McpTargetKind;
}

export interface McpTargetSyncSkipped {
  bindingId: string;
  path: string;
  reason: string;
  scope: McpTargetScope;
  serverName: string;
  status: McpTargetSyncStatus;
  target: McpTargetKind;
}

export interface McpTargetSyncBlocked extends McpTargetSyncSkipped {}

export interface McpTargetSyncFailed extends McpTargetSyncSkipped {
  error: string;
}

export interface McpTargetSyncApplyResult {
  updated: McpTargetSyncUpdated[];
  skipped: McpTargetSyncSkipped[];
  blocked: McpTargetSyncBlocked[];
  failed: McpTargetSyncFailed[];
}

export interface McpImportResult {
  imported: McpServerConfig[];
  skipped: string[];
}

export type McpCreateSourceKind =
  | "auto"
  | "command"
  | "config"
  | "path"
  | "url";

export type McpDetectedSourceKind =
  | "command"
  | "config-content"
  | "config-file"
  | "github"
  | "local-project"
  | "remote-url";

export interface McpCreateFromTargetRequest {
  kind: "target";
  preset: McpTargetPreset;
  serverName: string;
}

export type McpCreateFromSourceRequest =
  | { input: string; kind?: McpCreateSourceKind }
  | McpCreateFromTargetRequest;

export interface McpCreateFromSourceResult extends McpImportResult {
  detectedKind: McpDetectedSourceKind;
  warnings: string[];
}

export interface McpRemoveResult {
  path: string;
  /** @deprecated Target projections no longer create persistent backup files. */
  backupPath?: string;
  target: McpTargetKind;
  removedServerNames: string[];
  content: string;
}

export interface McpTargetStatusEntry {
  presetId: string;
  path: string;
  exists: boolean;
  serverNames: string[];
  servers?: McpServerConfig[];
}

export type McpHealthStatus = "ok" | "warning" | "error";

export const MCP_VERSION_PAGE_SIZE = 20;
export interface McpVersionSummary {
  version: number;
  isCurrent: boolean;
  createdAt: string;
  note?: string;
  restoredFromVersion?: number;
  semanticDigest: string;
}
export interface McpVersionDetail extends McpVersionSummary {
  server: McpServerConfig;
}
export interface McpVersionPage {
  currentVersion: number;
  total: number;
  offset: number;
  limit: number;
  items: McpVersionSummary[];
}
export interface McpVersionListOptions {
  offset?: number;
  limit?: number;
}
export interface McpVersionComparison {
  fromVersion: number;
  toVersion: number;
  changes: { field: string; before?: unknown; after?: unknown }[];
}

export interface McpHealthIssue {
  code:
    | "MISSING_COMMAND"
    | "COMMAND_NOT_FOUND"
    | "INVALID_URL"
    | "MISSING_ENV"
    | "INVALID_ENV_VALUE"
    | "UNRESOLVED_ENV_REFERENCE"
    | "PLACEHOLDER_VALUE"
    | "MISSING_CWD";
  severity: McpHealthStatus;
  message: string;
  field?: string;
}

export interface McpHealthCheckResult {
  serverId: string;
  serverName: string;
  status: McpHealthStatus;
  checkedAt: string;
  runtime?: McpRuntimeDetails;
  issues: McpHealthIssue[];
}

export interface McpEnvImportResult {
  server: McpServerConfig;
  importedKeys: string[];
  skippedKeys: string[];
  missingKeys: string[];
}

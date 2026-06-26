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
  "opencode",
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

export interface McpServerSource {
  type: "manual" | "market" | "import";
  id?: string;
  label?: string;
  url?: string;
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
  url?: string;
  headers?: Record<string, string>;
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

export interface McpTargetBinding {
  id: string;
  serverIds: string[];
  target: McpTargetKind;
  scope: McpTargetScope;
  path: string;
  enabled: boolean;
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
  name: string;
  displayName: string;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
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
  backupPath?: string;
  target: McpTargetKind;
  appliedServerNames: string[];
  overwrittenServerNames: string[];
  content: string;
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

export interface McpCreateFromSourceRequest {
  input: string;
  kind?: McpCreateSourceKind;
}

export interface McpCreateFromSourceResult extends McpImportResult {
  detectedKind: McpDetectedSourceKind;
  warnings: string[];
}

export interface McpRemoveResult {
  path: string;
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

export interface McpHealthIssue {
  code:
    | "MISSING_COMMAND"
    | "COMMAND_NOT_FOUND"
    | "INVALID_URL"
    | "MISSING_ENV"
    | "INVALID_ENV_VALUE"
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

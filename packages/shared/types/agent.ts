export type AgentCapabilityKey =
  | "overview"
  | "provider"
  | "appearance"
  | "assets"
  | "configFiles"
  | "sessions"
  | "usage"
  | "maintenance";

export type AgentCapabilityStatus =
  | "supported"
  | "partial"
  | "planned"
  | "unsupported";

export const AGENT_PLATFORM_CAPABILITY_KEYS = [
  "installationPath",
  "providerModel",
  "skills",
  "mcp",
  "rules",
  "plugins",
  "configFiles",
  "sessions",
  "usage",
  "launch",
  "maintenanceCli",
  "backupExportImport",
  "secretRuntimeExclusion",
  "appearance",
] as const;

export type AgentPlatformCapabilityKey =
  (typeof AGENT_PLATFORM_CAPABILITY_KEYS)[number];

export interface AgentPlatformCapabilityDeclaration {
  status: AgentCapabilityStatus;
  evidence: string;
}

export type AgentPlatformCapabilityInventory = Record<
  AgentPlatformCapabilityKey,
  AgentPlatformCapabilityDeclaration
>;

export type AgentProductLifecycle = "current" | "enterprise-legacy";

export interface ManagedAgentCapability {
  status: AgentCapabilityStatus;
  reason?: string;
}

export interface ManagedAgentPaths {
  root: string;
  skills: string;
  profiles?: string;
  mcp?: string;
  plugins?: string;
  rules?: string;
  projectRules?: string;
  projectRuleKind?: "workspace" | "cursor";
  configFiles: string[];
  configFileRelativePaths: string[];
}

export interface ManagedAgentSummary {
  id: string;
  name: string;
  icon: string;
  displayIconId?: string;
  isCustom: boolean;
  isConfigured: boolean;
  isDetected: boolean;
  isPinned: boolean;
  launchable?: boolean;
  status: "installed" | "configured" | "not-detected";
  lifecycle?: AgentProductLifecycle;
  replacementPlatformId?: string;
  workspaceKind?: "standard" | "plugin-harness";
  paths: ManagedAgentPaths;
  capabilities: Record<AgentCapabilityKey, ManagedAgentCapability>;
}

export type AgentInventoryTarget = "server-host" | "logical-only";

export interface AgentInventoryCapabilities {
  inventory: true;
  settings: true;
  hostDetection: boolean;
  filesystemMutation: false;
  configFiles: boolean;
  providers: boolean;
  sessions: boolean;
  launch: false;
  maintenance: boolean;
}

export interface AgentInventoryItem extends ManagedAgentSummary {
  enabled: boolean;
}

export interface AgentInventoryResponse {
  target: AgentInventoryTarget;
  agents: AgentInventoryItem[];
  capabilities: AgentInventoryCapabilities;
}

export const AGENT_SERVICE_DOMAINS = [
  "skills",
  "mcp",
  "plugins",
  "rules",
  "definitions",
  "provider",
  "appearance",
  "configFiles",
  "sessions",
  "usage",
  "maintenance",
] as const;

export type AgentServiceDomain = (typeof AGENT_SERVICE_DOMAINS)[number];
export type AgentServiceStatus = "available" | "partial" | "unavailable";
export type AgentServiceActionStatus = "available" | "unavailable";

export interface AgentServiceItem {
  id: string;
  label: string;
  description?: string;
  state: string;
}

export interface AgentServiceManifestEntry {
  domain: AgentServiceDomain;
  serviceAvailable: true;
  status: AgentServiceStatus;
}

export interface AgentServiceResult {
  agentId: string;
  domain: AgentServiceDomain;
  status: AgentServiceStatus;
  items: AgentServiceItem[];
  total: number;
  truncated: boolean;
  actions: Record<string, AgentServiceActionStatus>;
  reason?: string;
}

export type AgentLaunchResult =
  | { success: true }
  | {
      success: false;
      errorCode: "unsupported" | "not-installed" | "launch-failed";
    };

export type AgentCliDiagnosticStatus =
  | "installed"
  | "not-installed"
  | "unhealthy"
  | "unsupported";

export type AgentCliInstallSource =
  | "homebrew"
  | "node-version-manager"
  | "pnpm"
  | "npm"
  | "user-local"
  | "system"
  | "unknown";

export type AgentCliDiagnosticErrorCode =
  | "unsupported"
  | "not-found"
  | "timeout"
  | "output-limit"
  | "command-failed"
  | "invalid-output";

export interface AgentCliDiagnostic {
  agentId: string;
  status: AgentCliDiagnosticStatus;
  executablePath: string | null;
  version: string | null;
  installSource: AgentCliInstallSource | null;
  errorCode: AgentCliDiagnosticErrorCode | null;
  checkedAt: number;
  canUpdate: boolean;
}

export type AgentCliLifecycleOperation = "update";

export interface AgentCliLifecyclePlan {
  id: string;
  agentId: string;
  operation: AgentCliLifecycleOperation;
  command: {
    executable: string;
    args: string[];
  };
  currentVersion: string;
  installSource: AgentCliInstallSource;
  expiresAt: number;
}

export type AgentCliLifecycleResultStatus =
  | "applied"
  | "no-change"
  | "rolled-back"
  | "failed";

export type AgentCliLifecycleErrorCode =
  | "unsupported"
  | "not-installed"
  | "diagnostic-failed"
  | "invalid-version"
  | "unsupported-install-source"
  | "update-command-not-found"
  | "plan-not-found"
  | "plan-owner-mismatch"
  | "plan-expired"
  | "precondition-changed"
  | "update-failed"
  | "verification-failed"
  | "rollback-failed";

export interface AgentCliLifecycleResult {
  agentId: string;
  operation: AgentCliLifecycleOperation;
  status: AgentCliLifecycleResultStatus;
  previousVersion: string;
  currentVersion: string | null;
  errorCode: Extract<
    AgentCliLifecycleErrorCode,
    "update-failed" | "verification-failed" | "rollback-failed"
  > | null;
}

export interface AgentDesktopThemeSummary {
  id: string;
  name: string;
  version: string;
  directoryPath: string;
  compatibleTarget: boolean;
  lintWarningCount: number;
}

export interface AgentPetSummary {
  id: string;
  name: string;
  description: string;
  directoryPath: string;
  spriteVersionNumber: 1 | 2;
  spritesheetName: string;
  spritesheetBytes: number;
}

export interface UpdateAgentPetInput {
  agentId: string;
  petId: string;
  name: string;
  description: string;
}

export interface AgentPetStoreItem {
  id: string;
  name: string;
  localizedName: string | null;
  author: string;
  authorHandle: string;
  category: string;
  license: string;
  description: string;
  spriteVersionNumber: 1 | 2;
  installed: boolean;
}

export interface AgentPetStoreQuery {
  agentId: string;
  search?: string;
  locale?: string;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}

export interface AgentPetStorePage {
  items: AgentPetStoreItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AgentAppearanceOverview {
  agentId: string;
  supported: boolean;
  engineVersion: string | null;
  adapterLastVerifiedVersion: string | null;
  activeThemeId: string | null;
  themeDirectoryPath: string;
  petDirectoryPath: string;
  themes: AgentDesktopThemeSummary[];
  pets: AgentPetSummary[];
  invalidThemeCount: number;
  invalidPetCount: number;
}

export interface ApplyAgentThemeInput {
  agentId: string;
  themeId: string;
  restartExisting?: boolean;
}

export interface AgentAppearanceActionResult {
  success: true;
  activeThemeId: string | null;
  message?: string;
}

export type ManagedAgentFilter =
  | "all"
  | "installed"
  | "configured"
  | "needs-attention"
  | "not-detected"
  | "custom";

export type AgentModelConfigStatus =
  | "configured"
  | "not-configured"
  | "missing"
  | "invalid"
  | "unsupported";

export type AgentCredentialStatus =
  | "configured"
  | "platform-managed"
  | "missing"
  | "unknown";

export type AgentPiThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface AgentPiCustomModelInput {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  thinkingLevelMap?: Partial<Record<AgentPiThinkingLevel, string | null>>;
}

export type AgentPiProviderApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

export interface AgentPiCustomProviderInput {
  providerId: string;
  baseUrl: string;
  api: AgentPiProviderApi;
  /** Optional environment reference such as "$GEMINI_API_KEY"; never a literal key. */
  apiKeyRef?: string;
  models: AgentPiCustomModelInput[];
}

export interface AgentPiCustomProviderUpdateInput {
  providerId: string;
  baseUrl: string;
  api: AgentPiProviderApi;
}

export interface AgentPiCustomModelUpdateInput extends AgentPiCustomModelInput {
  originalId: string;
}

export interface AgentPiWriteResult {
  backupPath: string | null;
}

export interface AgentModelCatalogEntry {
  id: string;
  name?: string;
  api?: string;
  /** Effective endpoint without URL credentials, query or fragment. */
  endpoint?: string | null;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  thinkingLevelMap?: Partial<Record<AgentPiThinkingLevel, string | null>>;
  source: "built-in" | "custom";
}

export interface AgentModelCatalogProvider {
  id: string;
  models: AgentModelCatalogEntry[];
  credentialReady: boolean;
  source: "built-in" | "custom";
  /** Provider API adapter from Pi's catalog; never contains credentials. */
  api?: AgentPiProviderApi | null;
  /** Sanitized endpoint (userinfo/query/fragment removed); null = platform default. */
  endpoint?: string | null;
  /** Credential mechanism only; the credential value never crosses IPC. */
  credentialSource?: "auth" | "environment" | "provider-config" | "missing";
}

export interface AgentModelConfiguration {
  agentId: string;
  adapter: string | null;
  status: AgentModelConfigStatus;
  model: string | null;
  secondaryModel: string | null;
  fallbackModels: string[];
  provider: string | null;
  endpoint: string | null;
  availableModels: string[];
  credentialStatus: AgentCredentialStatus;
  sourceRelativePath: string | null;
  canSetModel: boolean;
  formattingMayChange: boolean;
  errorCode?: string;
  /** Full provider -> models catalog for platforms with a native model store. */
  modelCatalog?: AgentModelCatalogProvider[];
  /** Pi's persisted default thinking level from settings.json. */
  thinkingLevel?: AgentPiThinkingLevel | null;
}

export interface UpdateAgentModelInput {
  agentId: string;
  model: string;
  secondaryModel?: string | null;
  /** Pi-only default thinking level persisted to settings.json. */
  thinkingLevel?: AgentPiThinkingLevel;
}

export interface UpdateAgentModelResult extends AgentModelConfiguration {
  backupPath: string | null;
}

export interface AgentResumeCommand {
  executable: string;
  args: string[];
  cwd?: string;
  /** Null explicitly clears an inherited scope; only native data-root keys are accepted. */
  environment?: {
    CLAUDE_CONFIG_DIR?: string | null;
    KIMI_CODE_HOME?: string | null;
    QWEN_RUNTIME_DIR?: string | null;
    CODEX_HOME?: string | null;
    GROK_HOME?: string | null;
    PI_CODING_AGENT_DIR?: string | null;
  };
}

export type AgentSessionSourceScanStatus = "idle" | "ok" | "partial" | "error";

export type AgentSessionIndexStatus = "present" | "missing" | "parse-error";

export interface AgentSessionSource {
  id: string;
  platformId: string;
  rootPath: string;
  adapterId: string;
  adapterVersion: string;
  enabled: boolean;
  scanCursor: string | null;
  lastStatus: AgentSessionSourceScanStatus;
  lastScannedAt: number | null;
  lastErrorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RegisterAgentSessionSourceInput {
  platformId: string;
  rootPath: string;
  adapterId: string;
  adapterVersion: string;
  enabled?: boolean;
}

export interface AgentSessionIndexRecord {
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  projectPath: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  model: string | null;
  messageCount: number | null;
  redactedPreview: string | null;
  sourcePath: string;
  sourceMtimeMs: number | null;
  sourceSizeBytes: number | null;
  sourceDigest: string | null;
  sourceStatus: AgentSessionIndexStatus;
  tags: string[];
  note: string | null;
  indexedAt: number;
  annotationUpdatedAt: number | null;
}

export interface AgentSessionScanRecordInput {
  externalId: string;
  title: string;
  projectPath?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  model?: string | null;
  messageCount?: number | null;
  redactedPreview?: string | null;
  sourcePath: string;
  sourceMtimeMs?: number | null;
  sourceSizeBytes?: number | null;
  sourceDigest?: string | null;
  sourceStatus: AgentSessionIndexStatus;
}

export interface CommitAgentSessionScanInput {
  sourceId: string;
  mode: "full" | "incremental";
  adapterVersion: string;
  scanCursor?: string | null;
  scannedAt: number;
  status: Exclude<AgentSessionSourceScanStatus, "idle" | "error">;
  records: AgentSessionScanRecordInput[];
}

export interface AgentSessionScanCommitResult {
  source: AgentSessionSource;
  changedCount: number;
}

export interface RecordAgentSessionScanFailureInput {
  sourceId: string;
  scannedAt: number;
  errorCode: string;
}

export interface AgentSessionIndexListInput {
  sourceId: string;
  search?: string;
  statuses?: AgentSessionIndexStatus[];
  limit: number;
  offset: number;
}

export interface AgentSessionIndexListResult {
  items: AgentSessionIndexRecord[];
  total: number;
  hasMore: boolean;
}

export interface AgentSessionIndexPublicState {
  supported: boolean;
  enabled: boolean;
  lastStatus: AgentSessionSourceScanStatus | null;
  lastScannedAt: number | null;
  lastErrorCode: string | null;
}

export interface AgentSessionIndexSetEnabledRequest {
  agentId: string;
  enabled: boolean;
}

export interface AgentSessionIndexRefreshRequest {
  agentId: string;
  requestId: string;
}

export interface AgentSessionIndexCancelRequest {
  requestId: string;
}

export interface AgentSessionIndexProgress {
  agentId: string;
  requestId: string;
  processed: number;
  total: number;
}

export interface UpdateAgentSessionAnnotationsInput {
  tags: string[];
  note?: string | null;
}

export interface AgentSessionMetadata {
  id: string;
  title: string;
  projectLabel: string | null;
  projectPath: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  model: string | null;
  messageCount: number | null;
  sizeBytes?: number | null;
  nativeDeleteSupported?: boolean;
  sourcePath: string | null;
  resume: AgentResumeCommand | null;
}

export interface AgentConversationDeleteResult {
  agentId: string;
  sessionId: string;
}

export interface AgentSessionListResult {
  agentId: string;
  adapter: string;
  sessions: AgentSessionMetadata[];
  total: number;
  hasMore: boolean;
}

export interface AgentSessionEntry {
  id: string;
  role: "user" | "assistant" | "tool" | "system" | "unknown";
  timestamp: number | null;
  text: string;
}

export interface AgentSessionDetailPageInput {
  cursor?: string;
  limit?: number;
}

export interface AgentSessionDetail {
  agentId: string;
  adapter: string;
  sessionId: string;
  entries: AgentSessionEntry[];
  parseErrors: number;
  truncated: boolean;
  nextCursor?: string | null;
}

export interface AgentConversationMetadata {
  id: string;
  agentId: string;
  sessionId: string;
  title: string | null;
  projectId: string | null;
  projectPath: string | null;
  tags: string[];
  note: string | null;
  favorite: boolean;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertAgentConversationMetadataInput {
  agentId: string;
  sessionId: string;
  title?: string | null;
  projectId?: string | null;
  projectPath?: string | null;
  tags: string[];
  note?: string | null;
  favorite?: boolean;
  archived?: boolean;
}

export type AgentConversationHandoffTransport =
  | "direct"
  | "launch"
  | "unavailable";

export type AgentConversationHandoffStatus = "planned" | "launched" | "failed";

export interface AgentConversationHandoffRecord {
  id: string;
  sourceAgentId: string;
  sourceSessionId: string;
  targetAgentId: string;
  projectId: string | null;
  projectPath: string | null;
  transport: AgentConversationHandoffTransport;
  payloadDigest: string;
  status: AgentConversationHandoffStatus;
  targetSessionId: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentConversationHandoffInput {
  sourceAgentId: string;
  sourceSessionId: string;
  targetAgentId: string;
  projectId?: string | null;
  projectPath?: string | null;
  transport: AgentConversationHandoffTransport;
  payloadDigest: string;
  status: AgentConversationHandoffStatus;
}

export interface UpdateAgentConversationHandoffInput {
  status: AgentConversationHandoffStatus;
  targetSessionId?: string | null;
  errorCode?: string | null;
}

export interface AgentConversationResumeRequest {
  agentId: string;
  sessionId: string;
}

export interface AgentConversationActionResult {
  status: "launched" | "unavailable";
  mode: "native-resume" | "cross-agent";
  errorCode?: string;
}

export interface AgentConversationHandoffRequest {
  sourceAgentId: string;
  sourceSessionId: string;
  targetAgentId: string;
  projectId?: string | null;
  projectPath: string;
}

export interface AgentConversationHandoffPreview extends AgentConversationHandoffRequest {
  previewToken: string;
  sourceTitle: string;
  payload: string;
  payloadDigest: string;
  transport: AgentConversationHandoffTransport;
  cliCommand: string | null;
}

export interface ContinueAgentConversationRequest extends AgentConversationHandoffPreview {
  confirmedPayloadDigest: string;
}

export interface AgentConversationExportRequest {
  agentId: string;
  sessionId: string;
  format: "json" | "markdown";
}

export interface AgentConversationExportResult {
  fileName: string;
  content: string;
  mimeType: "application/json" | "text/markdown";
}

export interface AgentConversationExportSaveResult {
  canceled: boolean;
  filePath: string | null;
}

export type AgentUsageQuotaStatus =
  | "ok"
  | "no-credentials"
  | "expired"
  | "unavailable";

export type AgentCodexProviderKeySource = "managed" | "env" | "none";

export type AgentProviderProfileSource =
  | "manual"
  | "native-import"
  | "universal"
  | "import";

export interface AgentProviderProfile {
  id: string;
  platformId: string;
  name: string;
  providerKind: string;
  protocol: string;
  endpoint: string | null;
  config: Record<string, unknown>;
  secretRef: string | null;
  source: AgentProviderProfileSource;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentProviderProfileInput {
  platformId: string;
  name: string;
  providerKind: string;
  protocol: string;
  endpoint?: string | null;
  config: Record<string, unknown>;
  secretRef?: string | null;
  source: AgentProviderProfileSource;
}

export interface UpdateAgentProviderProfileInput {
  name?: string;
  providerKind?: string;
  protocol?: string;
  endpoint?: string | null;
  config?: Record<string, unknown>;
  secretRef?: string | null;
  source?: AgentProviderProfileSource;
}

export interface AgentProviderModelMapping {
  id: string;
  providerProfileId: string;
  routeKey: string;
  modelId: string;
  parameters: Record<string, unknown>;
}

export interface UpsertAgentProviderModelMappingInput {
  providerProfileId: string;
  routeKey: string;
  modelId: string;
  parameters: Record<string, unknown>;
}

export interface CreateAgentProviderModelMappingInput {
  routeKey: string;
  modelId: string;
  parameters: Record<string, unknown>;
}

export type AgentProviderSecretState = "none" | "available" | "missing";

export interface AgentProviderProfilePublic extends Omit<
  AgentProviderProfile,
  "secretRef"
> {
  modelMappings: AgentProviderModelMapping[];
  secretState: AgentProviderSecretState;
}

export type AgentProviderCurrentStateStatus =
  | "verified"
  | "none"
  | "stale"
  | "unavailable";

export type AgentProviderNativeClassification =
  | "official"
  | "custom"
  | "unknown";

export type AgentProviderNativeCredential =
  | "platform-managed"
  | "configured-api-key"
  | "configured-auth-token"
  | "environment"
  | "missing"
  | "unknown";

export interface AgentProviderNativeConfigSummary {
  classification: AgentProviderNativeClassification;
  name: string;
  providerKind: string;
  protocol: string;
  endpoint: string | null;
  model: string | null;
  credential: AgentProviderNativeCredential;
  officialRestoreAvailable: boolean;
}

export interface AgentProviderCurrentState {
  platformId: string;
  status: AgentProviderCurrentStateStatus;
  currentProfileId: string | null;
  nativeConfig: AgentProviderNativeConfigSummary | null;
  officialService?: {
    summary: AgentProviderNativeConfigSummary;
    status: "active" | "inactive" | "unavailable";
  } | null;
  checkedAt: number;
}

export interface AgentCodexAccountSummary {
  id: string;
  label: string;
  maskedAccountId: string | null;
  /** Display-only identity from the encrypted login; never an authorization claim. */
  email?: string | null;
  /** Missing on older responses; false identifies a pending login record. */
  hasAuth?: boolean;
  /** Selected pending record awaiting an explicit save after native login. */
  isLoginPending?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ImportAgentCodexAccountRequest {
  /** Existing record to rename or update. Omit to create. */
  id?: string;
  label: string;
  /** Write-only. Main process responses must never echo this value. */
  authJson?: string;
}

export interface AgentCodexAccountActivationResult {
  account: AgentCodexAccountSummary;
  preservedCurrent: boolean;
  requiresLogin?: boolean;
}

export interface CreateAgentProviderProfileRequest {
  profile: Omit<CreateAgentProviderProfileInput, "secretRef">;
  modelMappings: CreateAgentProviderModelMappingInput[];
  /** Write-only. Main process responses must never echo this value. */
  secret?: string | null;
}

export interface UpdateAgentProviderProfileRequest {
  id: string;
  expectedUpdatedAt: number;
  profile: Omit<UpdateAgentProviderProfileInput, "secretRef">;
  modelMappings?: CreateAgentProviderModelMappingInput[];
  secretAction: "preserve" | "replace" | "clear";
  /** Write-only and only valid with secretAction="replace". */
  secret?: string | null;
}

export interface AgentProviderProfileExport {
  version: 1;
  profile: Omit<CreateAgentProviderProfileInput, "secretRef">;
  modelMappings: CreateAgentProviderModelMappingInput[];
  requiresSecret: boolean;
}

export type AgentProviderSourceIncompatibility =
  | "platform-unsupported"
  | "protocol-unsupported"
  | "no-chat-model"
  | "invalid-endpoint";

export interface AgentProviderSourceModel {
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
}

export interface AgentProviderSourceCandidate {
  source: "prompthub";
  sourceId: string;
  name: string;
  providerKind: string;
  /** Recommended direct mapping for the destination Agent. */
  protocol: string | null;
  /** Ordered writable protocol choices for the destination Agent. */
  protocols: string[];
  endpoint: string;
  credentialReady: boolean;
  compatible: boolean;
  incompatibility: AgentProviderSourceIncompatibility | null;
  models: AgentProviderSourceModel[];
}

export type ClaudeCredentialEnvKey =
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_AUTH_TOKEN";

export interface ImportAgentProviderSourceRequest {
  platformId: string;
  sourceId: string;
  modelId: string;
  protocol: string;
  /** Claude-only native header choice; omission retains API-key authentication. */
  credentialEnvKey?: ClaudeCredentialEnvKey;
}

export type AgentProviderMigrationCredentialSource =
  | "legacy-managed"
  | "environment"
  | "native-inline"
  | "none";

export interface AgentProviderMigrationCandidate {
  providerId: string;
  name: string;
  baseUrl: string;
  wireApi: "chat" | "responses";
  envKey: string | null;
  credentialSource: AgentProviderMigrationCredentialSource;
  credentialReady: boolean;
  isActive: boolean;
  profileModel: string | null;
  alreadyMigrated: boolean;
}

export interface AgentProviderMigrationPreview {
  agentId: "codex";
  nativeDigest: string;
  candidates: AgentProviderMigrationCandidate[];
}

export interface AgentProviderMigrationRequest {
  agentId: string;
  expectedNativeDigest: string;
  providerIds: string[];
}

export interface AgentProviderMigrationResult {
  profiles: AgentProviderProfilePublic[];
}

export type AgentProviderSnapshotOperation =
  | "import"
  | "activate"
  | "backfill"
  | "restore";

export type AgentProviderSnapshotResult =
  | "planned"
  | "applied"
  | "verified"
  | "rolled-back"
  | "failed";

export interface AgentProviderSnapshot {
  id: string;
  platformId: string;
  providerProfileId: string | null;
  nativeDigest: string;
  redactedSnapshot: Record<string, unknown>;
  backupRef: string | null;
  operation: AgentProviderSnapshotOperation;
  result: AgentProviderSnapshotResult;
  createdAt: number;
}

export interface CreateAgentProviderSnapshotInput {
  platformId: string;
  providerProfileId?: string | null;
  nativeDigest: string;
  redactedSnapshot: Record<string, unknown>;
  backupRef?: string | null;
  operation: AgentProviderSnapshotOperation;
  result: AgentProviderSnapshotResult;
}

export interface AgentManagementBackupProfile {
  id: string;
  profile: Omit<CreateAgentProviderProfileInput, "secretRef">;
  modelMappings: CreateAgentProviderModelMappingInput[];
  requiresSecret: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentManagementBackupSnapshot {
  id: string;
  platformId: string;
  providerProfileId: string | null;
  nativeDigest: string;
  redactedSnapshot: Record<string, unknown>;
  operation: AgentProviderSnapshotOperation;
  result: AgentProviderSnapshotResult;
  createdAt: number;
}

export interface AgentManagementBackupSessionSourcePreference {
  platformId: string;
  adapterId: string;
  enabled: boolean;
}

export interface AgentManagementBackup {
  version: 1;
  providerProfiles: AgentManagementBackupProfile[];
  snapshots: AgentManagementBackupSnapshot[];
  sessionSourcePreferences?: AgentManagementBackupSessionSourcePreference[];
}

export interface AgentManagementBackupRestoreResult {
  profileCount: number;
  snapshotCount: number;
  availableSecretProfileIds: string[];
  missingSecretProfileIds: string[];
  restoredSessionPreferenceCount: number;
  unresolvedSessionPreferenceKeys: string[];
}

export type AgentProviderComparableValue =
  | null
  | string
  | number
  | boolean
  | AgentProviderComparableValue[]
  | { [key: string]: AgentProviderComparableValue };

export interface AgentProviderComparableState {
  platformId: string;
  adapterVersion: string;
  nativeDigest: string;
  values: Record<string, AgentProviderComparableValue>;
}

export interface AgentProviderDesiredState {
  platformId: string;
  values: Record<string, AgentProviderComparableValue>;
}

export type AgentProviderFieldDecisionStatus =
  | "apply"
  | "preserve"
  | "backfill"
  | "external-modified"
  | "conflict"
  | "unsupported"
  | "blocked";

export interface AgentProviderFieldDecision {
  field: string;
  status: AgentProviderFieldDecisionStatus;
  baseline?: AgentProviderComparableValue;
  current?: AgentProviderComparableValue;
  desired?: AgentProviderComparableValue;
}

export interface AgentProviderReconciliationInput {
  profileId: string;
  baseline: AgentProviderComparableState | null;
  current: AgentProviderComparableState;
  desired: AgentProviderDesiredState;
  supportedKeys: string[];
  blockedReasons?: string[];
}

export interface AgentProviderActivationPlan {
  platformId: string;
  profileId: string;
  adapterVersion: string;
  currentDigest: string;
  status: AgentProviderFieldDecisionStatus;
  decisions: AgentProviderFieldDecision[];
  canApply: boolean;
  requiresReview: boolean;
  blockedReasons: string[];
}

export type AgentProviderFieldResolutionAction =
  | "preserve-current"
  | "use-profile";

export interface AgentProviderFieldResolution {
  field: string;
  action: AgentProviderFieldResolutionAction;
}

export interface AgentProviderImportCurrentRequest {
  agentId: string;
}

export interface AgentProviderPreviewRequest {
  agentId: string;
  profileId: string;
}

export interface AgentProviderActivateRequest extends AgentProviderPreviewRequest {
  expectedCurrentDigest: string;
  resolutions?: AgentProviderFieldResolution[];
}

export type AgentProviderConnectionTestRequest = AgentProviderPreviewRequest;

export type AgentProviderCurrentConnectionTestRequest =
  AgentProviderImportCurrentRequest;

export type AgentProviderConnectionTestStatus =
  | "ok"
  | "model-not-found"
  | "no-credentials"
  | "invalid-endpoint"
  | "blocked-address"
  | "auth-error"
  | "http-error"
  | "protocol-error"
  | "network-error"
  | "timeout"
  | "response-too-large"
  | "unsupported";

export interface AgentProviderConnectionTestResult {
  platformId: string;
  profileId: string;
  protocol: string;
  endpointOrigin: string | null;
  model: string | null;
  status: AgentProviderConnectionTestStatus;
  startedAt: number;
  finishedAt: number;
  totalMs: number;
  retryCount: number;
  modelCount: number | null;
  modelAvailable: boolean | null;
  errorCode?: string;
}

export interface AgentProviderModelTestRequest extends AgentProviderPreviewRequest {
  requestId: string;
}

export interface AgentProviderCurrentModelTestRequest extends AgentProviderImportCurrentRequest {
  requestId: string;
}

export interface AgentProviderModelTestCancelRequest {
  requestId: string;
}

export type AgentProviderModelTestStatus =
  | "ok"
  | "cancelled"
  | "no-credentials"
  | "invalid-endpoint"
  | "blocked-address"
  | "auth-error"
  | "model-not-found"
  | "quota-error"
  | "rate-limited"
  | "http-error"
  | "protocol-error"
  | "network-error"
  | "connect-timeout"
  | "first-token-timeout"
  | "total-timeout"
  | "response-too-large"
  | "unsupported";

export interface AgentProviderModelTestResult {
  platformId: string;
  profileId: string;
  protocol: string;
  endpointOrigin: string | null;
  model: string | null;
  status: AgentProviderModelTestStatus;
  startedAt: number;
  finishedAt: number;
  totalMs: number;
  firstTokenMs: number | null;
  retryCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  outputPreview: string | null;
  errorCode?: string;
}

export interface AgentProviderAdapterContext {
  agentId: string;
  platformId: string;
  rootPath: string;
  projectRootPath?: string | null;
}

export interface AgentProviderImportPreview {
  state: AgentProviderComparableState;
  profile: CreateAgentProviderProfileInput;
  modelMappings: CreateAgentProviderModelMappingInput[];
  warnings: string[];
}

export interface AgentProviderActivationInput {
  context: AgentProviderAdapterContext;
  profile: AgentProviderProfile;
  modelMappings: AgentProviderModelMapping[];
  baseline: AgentProviderComparableState | null;
}

export interface AgentProviderApplyReceipt {
  platformId: string;
  profileId: string;
  adapterVersion: string;
  nativeDigestBefore: string;
  nativeDigestAfter: string;
  backupRef: string | null;
  appliedAt: number;
}

export interface AgentProviderVerification {
  verified: boolean;
  nativeDigest: string;
  state: AgentProviderComparableState;
  errorCode?: string;
}

export interface AgentProviderRollbackResult {
  restored: boolean;
  nativeDigest: string | null;
  errorCode?: string;
}

export type AgentProviderActivationExecutionStatus =
  | "verified"
  | "rolled-back"
  | "failed";

export interface AgentProviderActivationExecutionResult {
  status: AgentProviderActivationExecutionStatus;
  plan: AgentProviderActivationPlan;
  verification: AgentProviderVerification | null;
  rollback: AgentProviderRollbackResult | null;
  errorCode?: string;
}

export interface AgentCodexProvider {
  id: string;
  name: string;
  baseUrl: string;
  wireApi: "chat" | "responses";
  envKey: string | null;
  keySource: AgentCodexProviderKeySource;
  hasKey: boolean;
  isActive: boolean;
  profileModel: string | null;
}

export interface AgentCodexProviderList {
  agentId: string;
  activeProvider: string;
  defaultModel: string | null;
  providers: AgentCodexProvider[];
}

export interface UpsertAgentCodexProviderInput {
  agentId: string;
  providerId: string;
  name: string;
  baseUrl: string;
  wireApi: "chat" | "responses";
  apiKey?: string | null;
  envKey?: string | null;
  profileModel?: string | null;
}

export interface AgentCodexProviderTestResult {
  status:
    | "ok"
    | "auth-error"
    | "network-error"
    | "timeout"
    | "http-error"
    | "invalid-url"
    | "no-credentials";
  latencyMs: number | null;
  modelCount: number | null;
  errorCode?: string;
}

export type AgentQuotaScope =
  | { kind: "account" }
  | { kind: "model-group"; id: string; label: string }
  | { kind: "model"; id: string; label: string }
  | { kind: "feature"; id: string; label: string };

export type AgentQuotaPeriod =
  | { kind: "rolling"; durationSeconds: number | null }
  | {
      kind: "calendar";
      unit: "day" | "week" | "month" | "billing-cycle";
    }
  | { kind: "lifetime" }
  | { kind: "provider-defined"; label: string };

export type AgentQuotaValue =
  | { kind: "percentage"; remainingPercent: number }
  | { kind: "balance"; remainingAmount: number; unit: "credits" | "resets" }
  | {
      kind: "amount";
      remainingPercent: number;
      remainingAmount: number;
      limitAmount: number;
      unit: string;
    }
  | { kind: "unlimited" }
  | { kind: "unknown" };

export interface AgentUsageMetric {
  id: string;
  label: string;
  scope: AgentQuotaScope;
  period: AgentQuotaPeriod;
  value: AgentQuotaValue;
  resetsAt: number | null;
}

export interface AgentUsageQuota {
  schemaVersion: 2;
  agentId: string;
  adapter: string;
  status: AgentUsageQuotaStatus;
  source: "provider";
  plan: string | null;
  fetchedAt: number;
  errorCode?: string;
  metrics: AgentUsageMetric[];
}

export interface AgentUsageQueryOptions {
  forceRefresh?: boolean;
}

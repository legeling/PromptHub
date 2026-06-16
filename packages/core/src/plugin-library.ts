import fs from "fs";
import path from "path";
import * as childProcess from "child_process";

import type {
  PluginAuthor,
  PluginInstallResult,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPolicy,
  PluginMarketPreview,
  PluginMarketSource,
  PluginPackageSource,
  PluginSemanticClassification,
  PluginTargetCompatibility,
  PluginTrustLevel,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";

import { getConfigDir, getDataDir } from "./runtime-paths";

const PLUGIN_LIBRARY_FILE_NAME = "plugin-library.json";
const PLUGIN_MARKETPLACE_FILE = ".agents/plugins/marketplace.json";
const CODEX_PLUGIN_MANIFEST_FILE = ".codex-plugin/plugin.json";

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

interface CorePluginLibraryServiceOptions {
  fetchFn?: FetchLike;
  marketSources?: PluginMarketSource[];
  materializePackages?: boolean;
  materializePackageFn?: PackageMaterializer;
}

type RawRecord = Record<string, unknown>;

interface MaterializedPluginPackage {
  managedPath: string;
  localRepositoryPath: string;
  localPackagePath: string;
}

type PackageMaterializer = (
  entry: PluginMarketEntry,
  pluginId: string,
) => Promise<MaterializedPluginPackage>;

export class CorePluginError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CorePluginError";
    this.code = code;
  }
}

export const BUILTIN_PLUGIN_MARKET_SOURCES: PluginMarketSource[] = [
  {
    id: "openai-curated",
    displayName: "Codex official",
    repository: "https://github.com/openai/plugins",
    marketplaceFile: PLUGIN_MARKETPLACE_FILE,
    rawJsonUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json",
    trustLevel: "official",
    description: "OpenAI curated Codex plugin marketplace.",
  },
  {
    id: "prompthub-official",
    displayName: "PromptHub Official",
    repository: "https://github.com/legeling/PromptHub",
    marketplaceFile: PLUGIN_MARKETPLACE_FILE,
    rawJsonUrl:
      "https://raw.githubusercontent.com/legeling/PromptHub/main/.agents/plugins/marketplace.json",
    trustLevel: "official",
    description: "PromptHub official plugin marketplace.",
  },
];

export function getPluginLibraryFilePath(): string {
  return path.join(getConfigDir(), PLUGIN_LIBRARY_FILE_NAME);
}

function getManagedPluginsDir(): string {
  return path.join(getDataDir(), "plugins");
}

export function emptyPluginInventory(): PluginInventorySummary {
  return Object.fromEntries(
    PLUGIN_INVENTORY_KEYS.map((key) => [key, 0]),
  ) as PluginInventorySummary;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function defaultLibrary(): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: nowIso(),
    plugins: [],
  };
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function createPluginId(sourceId: string | undefined, name: string): string {
  const normalizedSource = normalizeSlug(sourceId || "custom") || "custom";
  const normalizedName = normalizeSlug(name) || "plugin";
  return `${normalizedSource}:${normalizedName}`;
}

function normalizeRelativePosixPath(value: string): string {
  if (value.includes("\0")) {
    throw new CorePluginError("INVALID_PATH", "Plugin 路径包含非法空字节");
  }

  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  const withoutPrefix = normalized.replace(/^\.\//, "");
  if (
    !withoutPrefix ||
    withoutPrefix.startsWith("../") ||
    withoutPrefix === ".." ||
    path.posix.isAbsolute(withoutPrefix)
  ) {
    throw new CorePluginError("INVALID_PATH", `Plugin 路径不安全: ${value}`);
  }
  return withoutPrefix;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeTrustLevel(value: unknown): PluginTrustLevel {
  return value === "verified" || value === "community" || value === "custom"
    ? value
    : "official";
}

function normalizeAuthor(value: unknown): PluginAuthor | undefined {
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim() };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as RawRecord;
  const name = safeString(record.name);
  if (!name) {
    return undefined;
  }
  return {
    name,
    email: safeString(record.email),
    url: safeString(record.url),
  };
}

function normalizeMarketPolicy(value: unknown): PluginMarketPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as RawRecord;
  const installation = safeString(record.installation);
  const authentication = safeString(record.authentication);
  if (!installation && !authentication) {
    return undefined;
  }
  return { installation, authentication };
}

function normalizeInventory(raw: unknown): PluginInventorySummary {
  const inventory = emptyPluginInventory();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return inventory;
  }
  const record = raw as Partial<PluginInventorySummary>;
  for (const key of PLUGIN_INVENTORY_KEYS) {
    const value = record[key];
    inventory[key] = typeof value === "number" && value > 0 ? value : 0;
  }
  return inventory;
}

function countManifestField(value: unknown): number {
  if (typeof value === "string") {
    return value.trim() ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 0;
}

export function extractPluginInventoryFromManifest(
  manifest: RawRecord,
): PluginInventorySummary {
  const inventory = emptyPluginInventory();
  inventory.skills = countManifestField(manifest.skills);
  inventory.mcpServers = countManifestField(
    manifest.mcpServers ?? manifest.mcp_servers ?? manifest.mcp,
  );
  inventory.apps = countManifestField(manifest.apps ?? manifest.app);
  inventory.commands = countManifestField(manifest.commands);
  inventory.hooks = countManifestField(manifest.hooks);
  inventory.agents = countManifestField(manifest.agents);
  inventory.assets = countManifestField(manifest.assets);
  inventory.docs = countManifestField(manifest.docs ?? manifest.documentation);
  inventory.lspServers = countManifestField(
    manifest.lspServers ?? manifest.lsp_servers,
  );
  inventory.scripts = countManifestField(manifest.scripts);
  return inventory;
}

export function classifyPluginInventory(
  inventory: PluginInventorySummary,
): PluginSemanticClassification {
  const total = PLUGIN_INVENTORY_KEYS.reduce(
    (sum, key) => sum + inventory[key],
    0,
  );
  if (total >= 2) {
    return "bundle";
  }
  if (total === 1 && inventory.skills === 1) {
    return "single-skill";
  }
  if (
    total === 1 &&
    (inventory.commands === 1 ||
      inventory.hooks === 1 ||
      inventory.scripts === 1)
  ) {
    return "runtime-module";
  }
  return "invalid";
}

function assertBundlePlugin(
  classification: PluginSemanticClassification,
  name: string,
): void {
  if (classification === "bundle") {
    return;
  }

  const reason = getPluginSemanticUnsupportedReason(classification);
  throw new CorePluginError(
    "UNSUPPORTED_PLUGIN_SEMANTIC",
    `${name} 未通过 Plugin 语义检查：${reason}`,
  );
}

function getPluginSemanticUnsupportedReason(
  classification: PluginSemanticClassification,
): string | undefined {
  if (classification === "bundle") {
    return undefined;
  }
  if (classification === "single-skill") {
    return "只有单个 Skill，不是完整 Plugin 能力包";
  }
  if (classification === "runtime-module") {
    return "只有运行时模块/Hook，不是完整 Plugin 能力包";
  }
  return "没有可识别的多能力 inventory";
}

function normalizeLibrary(raw: Partial<PluginLibraryFile>): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    plugins: Array.isArray(raw.plugins)
      ? raw.plugins
          .filter((plugin): plugin is PluginLibraryEntry =>
            Boolean(
              plugin &&
              typeof plugin === "object" &&
              typeof plugin.id === "string" &&
              typeof plugin.name === "string",
            ),
          )
          .map((plugin) => ({
            id: plugin.id!,
            name: plugin.name!,
            displayName: plugin.displayName || plugin.name!,
            description: plugin.description,
            version: plugin.version,
            author: normalizeAuthor(plugin.author),
            category: plugin.category,
            trustLevel: normalizeTrustLevel(plugin.trustLevel),
            inventory: normalizeInventory(plugin.inventory),
            classification:
              plugin.classification === "single-skill" ||
              plugin.classification === "runtime-module" ||
              plugin.classification === "invalid"
                ? plugin.classification
                : "bundle",
            source: {
              kind: plugin.source?.kind || "market",
              sourceId: plugin.source?.sourceId,
              label: plugin.source?.label,
              repository: plugin.source?.repository,
              rawJsonUrl: plugin.source?.rawJsonUrl,
              marketplaceFile: plugin.source?.marketplaceFile,
              packagePath: plugin.source?.packagePath,
              manifestPath: plugin.source?.manifestPath,
              localRepositoryPath: plugin.source?.localRepositoryPath,
              localPackagePath: plugin.source?.localPackagePath,
              url: plugin.source?.url,
            },
            tags: safeStringArray(plugin.tags),
            homepage: plugin.homepage,
            repository: plugin.repository,
            managedPath: plugin.managedPath,
            localRepositoryPath: plugin.localRepositoryPath,
            localPackagePath: plugin.localPackagePath,
            installedAt:
              typeof plugin.installedAt === "number"
                ? plugin.installedAt
                : nowMs(),
            updatedAt:
              typeof plugin.updatedAt === "number" ? plugin.updatedAt : nowMs(),
          }))
      : [],
  };
}

function parseJsonObject(content: string, label: string): RawRecord {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CorePluginError("INVALID_JSON", `${label} 不是 JSON 对象`);
  }
  return parsed as RawRecord;
}

function getMarketplaceDisplayName(
  marketplace: RawRecord,
  source: PluginMarketSource,
): string {
  const rawInterface = marketplace.interface;
  if (rawInterface && typeof rawInterface === "object") {
    const displayName = safeString((rawInterface as RawRecord).displayName);
    if (displayName) {
      return displayName;
    }
  }
  return source.displayName;
}

function buildRawPluginFileUrl(
  source: PluginMarketSource,
  relativePath: string,
): string {
  const safeRelativePath = normalizeRelativePosixPath(relativePath);
  const safeMarketplacePath = normalizeRelativePosixPath(
    source.marketplaceFile,
  );
  if (!source.rawJsonUrl.endsWith(safeMarketplacePath)) {
    throw new CorePluginError(
      "INVALID_SOURCE",
      `无法从 ${source.rawJsonUrl} 推导插件文件地址`,
    );
  }
  const baseUrl = source.rawJsonUrl.slice(0, -safeMarketplacePath.length);
  return new URL(safeRelativePath, baseUrl).toString();
}

function buildCodexPluginDetailUrl(
  name: string,
  marketplaceId: string,
): string {
  return `codex://plugins/${encodeURIComponent(name)}@${encodeURIComponent(
    marketplaceId,
  )}`;
}

function ensureInsideDirectory(parent: string, child: string): void {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (
    resolvedChild !== resolvedParent &&
    !resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  ) {
    throw new CorePluginError("INVALID_PATH", `路径不在受控目录内: ${child}`);
  }
}

function runGit(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (error) => {
      reject(new CorePluginError("GIT_FAILED", error.message));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CorePluginError(
          "GIT_FAILED",
          `Git 命令执行失败 (${code ?? "unknown"}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

async function materializeGitPackage(
  entry: PluginMarketEntry,
  pluginId: string,
): Promise<MaterializedPluginPackage> {
  if (!entry.source.repository || !entry.source.packagePath) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${entry.displayName} 没有可下载的 Git source`,
    );
  }

  const pluginRoot = path.join(
    getManagedPluginsDir(),
    normalizeSlug(pluginId) || "plugin",
  );
  const tempRoot = `${pluginRoot}.tmp-${process.pid}-${Date.now()}`;
  const repoDir = path.join(tempRoot, "repo");
  const safePackagePath = normalizeRelativePosixPath(entry.source.packagePath);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    await runGit([
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--",
      entry.source.repository,
      repoDir,
    ]);
    await runGit(
      ["sparse-checkout", "set", "--no-cone", safePackagePath],
      repoDir,
    );

    const localPackagePath = path.join(repoDir, ...safePackagePath.split("/"));
    ensureInsideDirectory(repoDir, localPackagePath);
    if (
      !fs.existsSync(path.join(localPackagePath, CODEX_PLUGIN_MANIFEST_FILE))
    ) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `${entry.displayName} 下载后没有找到 Plugin manifest`,
      );
    }

    fs.rmSync(pluginRoot, { recursive: true, force: true });
    fs.renameSync(tempRoot, pluginRoot);
    return {
      managedPath: pluginRoot,
      localRepositoryPath: path.join(pluginRoot, "repo"),
      localPackagePath: path.join(
        pluginRoot,
        "repo",
        ...safePackagePath.split("/"),
      ),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function normalizeMarketEntry(
  raw: unknown,
  source: PluginMarketSource,
  marketplaceDisplayName: string,
): PluginMarketEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as RawRecord;
  const name = safeString(record.name);
  if (!name) {
    return null;
  }

  const rawSource =
    record.source && typeof record.source === "object"
      ? (record.source as RawRecord)
      : {};
  const sourceKind = safeString(rawSource.source);
  const rawPath = safeString(rawSource.path);
  const packagePath = rawPath ? normalizeRelativePosixPath(rawPath) : undefined;
  const manifestPath = packagePath
    ? normalizeRelativePosixPath(
        path.posix.join(packagePath, CODEX_PLUGIN_MANIFEST_FILE),
      )
    : undefined;
  const rawInterface =
    record.interface && typeof record.interface === "object"
      ? (record.interface as RawRecord)
      : {};
  const displayName =
    safeString(rawInterface.displayName) ||
    safeString(record.displayName) ||
    name;

  return {
    id: createPluginId(source.id, name),
    marketplaceId: source.id,
    name,
    displayName,
    description:
      safeString(rawInterface.shortDescription) ||
      safeString(record.description),
    category: safeString(record.category) || safeString(rawInterface.category),
    trustLevel: source.trustLevel,
    source: {
      kind: sourceKind === "local" ? "market" : "git",
      sourceId: source.id,
      label: marketplaceDisplayName,
      repository: source.repository,
      rawJsonUrl: source.rawJsonUrl,
      marketplaceFile: source.marketplaceFile,
      packagePath,
      manifestPath,
      url: safeString(rawSource.url),
    },
    policy: normalizeMarketPolicy(record.policy),
    codexDetailUrl: buildCodexPluginDetailUrl(name, source.id),
  };
}

function readLocalPromptHubMarketplace(
  source: PluginMarketSource,
): string | null {
  if (source.id !== "prompthub-official") {
    return null;
  }
  const localPath = path.resolve(process.cwd(), PLUGIN_MARKETPLACE_FILE);
  if (!fs.existsSync(localPath)) {
    return null;
  }
  return fs.readFileSync(localPath, "utf8");
}

export function getPluginTargetMatrix(): PluginTargetCompatibility[] {
  return [
    {
      id: "codex",
      displayName: "Codex",
      status: "native",
      enabled: true,
      nativeMarker: ".codex-plugin/plugin.json",
      installSurface: "codex plugin / .agents/plugins/marketplace.json",
      description: "Native PromptHub Plugin target for Codex plugin bundles.",
    },
    {
      id: "claude-code",
      displayName: "Claude Code",
      status: "adapter",
      enabled: true,
      nativeMarker: ".claude-plugin/plugin.json",
      installSurface: "claude plugin / --plugin-dir / --plugin-url",
      adapterOutput: "Generate Claude Code plugin package from inventory.",
    },
    {
      id: "cursor",
      displayName: "Cursor",
      status: "adapter",
      enabled: true,
      nativeMarker: ".cursor-plugin/plugin.json",
      installSurface: ".cursor-plugin/marketplace.json",
      adapterOutput: "Generate Cursor plugin package from inventory.",
    },
    {
      id: "gemini-cli",
      displayName: "Gemini CLI",
      status: "adapter",
      enabled: true,
      nativeMarker: "gemini-extension.json",
      installSurface: "gemini extensions install",
      adapterOutput: "Generate Gemini extension package from inventory.",
    },
    {
      id: "kiro",
      displayName: "Kiro",
      status: "adapter",
      enabled: true,
      nativeMarker: "POWER.md",
      installSurface: "Kiro power package",
      adapterOutput: "Generate Kiro power package with bundled assets.",
    },
    {
      id: "github-copilot",
      displayName: "GitHub Copilot / VS Code",
      status: "adapter",
      enabled: true,
      nativeMarker: "plugin.json",
      installSurface: "copilot plugin / VS Code Agent Plugins",
      adapterOutput: "Generate Copilot or VS Code agent plugin package.",
    },
    {
      id: "opencode",
      displayName: "OpenCode",
      status: "runtime-only",
      enabled: false,
      nativeMarker: ".opencode/plugins",
      installSurface: "opencode.json plugin modules",
      unsupportedReason:
        "Runtime JS/TS plugin modules are not full Plugin bundle inventory.",
    },
    {
      id: "cline",
      displayName: "Cline",
      status: "runtime-only",
      enabled: false,
      nativeMarker: "AgentPlugin entrypoint",
      installSurface: "cline plugin install",
      unsupportedReason:
        "AgentPlugin runtime entrypoints are not full Plugin bundle inventory.",
    },
    {
      id: "windsurf",
      displayName: "Windsurf / Devin",
      status: "composite",
      enabled: false,
      installSurface: "Separate skills, workflows, hooks and MCP surfaces",
      unsupportedReason:
        "No confirmed single native bundle package; requires composite adapter.",
    },
    {
      id: "roo-code",
      displayName: "Roo Code",
      status: "composite",
      enabled: false,
      installSurface: "Skills, rules, commands and MCP-like config surfaces",
      unsupportedReason:
        "No confirmed single plugin package; requires decomposition.",
    },
    {
      id: "cherry-studio",
      displayName: "Cherry Studio",
      status: "composite",
      enabled: false,
      installSurface: "Local skill and agent registries",
      unsupportedReason:
        "No confirmed single plugin package; requires decomposition.",
    },
    {
      id: "amp",
      displayName: "Amp / Other Agents",
      status: "pending",
      enabled: false,
      unsupportedReason:
        "Public evidence is insufficient for a stable adapter.",
    },
  ];
}

export class CorePluginLibraryService {
  private fetchFn: FetchLike;
  private marketSources: PluginMarketSource[];
  private materializePackages: boolean;
  private materializePackageFn: PackageMaterializer;

  constructor(options: CorePluginLibraryServiceOptions = {}) {
    this.fetchFn =
      options.fetchFn ??
      (globalThis.fetch as unknown as FetchLike | undefined) ??
      (async () => {
        throw new CorePluginError(
          "FETCH_UNAVAILABLE",
          "当前运行环境不支持 fetch",
        );
      });
    this.marketSources = options.marketSources ?? BUILTIN_PLUGIN_MARKET_SOURCES;
    this.materializePackages = options.materializePackages ?? false;
    this.materializePackageFn =
      options.materializePackageFn ?? materializeGitPackage;
  }

  read(): PluginLibraryFile {
    const filePath = getPluginLibraryFilePath();
    if (!fs.existsSync(filePath)) {
      return defaultLibrary();
    }

    const raw = parseJsonObject(
      fs.readFileSync(filePath, "utf8"),
      "Plugin library",
    );
    return normalizeLibrary(raw);
  }

  getMarketSources(): PluginMarketSource[] {
    return [...this.marketSources];
  }

  getTargetMatrix(): PluginTargetCompatibility[] {
    return getPluginTargetMatrix();
  }

  async getMarketEntries(): Promise<PluginMarketEntry[]> {
    const entries: PluginMarketEntry[] = [];
    for (const source of this.marketSources) {
      try {
        const sourceEntries = await this.readMarketplace(source);
        entries.push(...sourceEntries);
      } catch (error) {
        console.warn(
          `[plugin-library] Failed to read marketplace ${source.id}:`,
          error,
        );
      }
    }
    return entries;
  }

  async previewMarketPlugin(entryId: string): Promise<PluginMarketPreview> {
    const entry = await this.findMarketEntry(entryId);
    return this.buildPreviewForEntry(entry);
  }

  private async findMarketEntry(entryId: string): Promise<PluginMarketEntry> {
    const entries = await this.getMarketEntries();
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin 商店条目不存在: ${entryId}`,
      );
    }
    return entry;
  }

  async installMarketPlugin(entryId: string): Promise<PluginInstallResult> {
    const preview = await this.previewMarketPlugin(entryId);
    const entry = preview.entry;
    const inventory = preview.inventory;
    const classification = preview.classification;
    assertBundlePlugin(classification, entry.displayName);

    const name = preview.entry.name;
    const id = createPluginId(entry.marketplaceId, name);
    const library = this.read();
    if (library.plugins.some((plugin) => plugin.id === id)) {
      throw new CorePluginError(
        "DUPLICATE_PLUGIN",
        `Plugin 已安装: ${entry.displayName}`,
      );
    }

    const materialized = this.materializePackages
      ? await this.materializePackageFn(entry, id)
      : undefined;
    const timestamp = nowMs();
    const source: PluginPackageSource = {
      ...entry.source,
      localRepositoryPath: materialized?.localRepositoryPath,
      localPackagePath: materialized?.localPackagePath,
    };
    const plugin: PluginLibraryEntry = {
      id,
      name,
      displayName: preview.displayName,
      description: preview.description,
      version: preview.version,
      author: preview.author,
      category: preview.category,
      trustLevel: entry.trustLevel,
      inventory,
      classification,
      source,
      tags: preview.tags,
      homepage: preview.homepage,
      repository: preview.repository,
      managedPath: materialized?.managedPath,
      localRepositoryPath: materialized?.localRepositoryPath,
      localPackagePath: materialized?.localPackagePath,
      installedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: [...library.plugins, plugin],
    };

    try {
      writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    } catch (error) {
      if (materialized?.managedPath) {
        fs.rmSync(materialized.managedPath, { recursive: true, force: true });
      }
      throw error;
    }

    return {
      plugin,
      library: nextLibrary,
      warnings: preview.warnings,
    };
  }

  private async buildPreviewForEntry(
    entry: PluginMarketEntry,
  ): Promise<PluginMarketPreview> {
    const manifest = await this.readManifestForEntry(entry);
    const inventory = extractPluginInventoryFromManifest(manifest);
    const classification = classifyPluginInventory(inventory);
    const name = safeString(manifest.name) ?? entry.name;
    const interfaceRecord =
      manifest.interface && typeof manifest.interface === "object"
        ? (manifest.interface as RawRecord)
        : {};
    const displayName =
      safeString(interfaceRecord.displayName) ||
      safeString(manifest.displayName) ||
      entry.displayName ||
      name;
    const shortDescription =
      safeString(interfaceRecord.shortDescription) ||
      safeString(manifest.description) ||
      entry.description;
    const longDescription = safeString(interfaceRecord.longDescription);
    const description = shortDescription || longDescription;
    const manifestUrl = this.getManifestUrlForEntry(entry);
    const enrichedEntry: PluginMarketEntry = {
      ...entry,
      name,
      displayName,
      description,
      version: safeString(manifest.version) ?? entry.version,
      author: normalizeAuthor(manifest.author) ?? entry.author,
      category: entry.category ?? safeString(interfaceRecord.category),
      inventory,
      classification,
    };
    return {
      entry: enrichedEntry,
      displayName,
      description,
      longDescription,
      version: enrichedEntry.version,
      author: enrichedEntry.author,
      category: enrichedEntry.category,
      inventory,
      classification,
      tags: safeStringArray(manifest.keywords),
      homepage:
        safeString(manifest.homepage) || safeString(interfaceRecord.websiteURL),
      repository: safeString(manifest.repository) || entry.source.repository,
      codexDetailUrl: entry.codexDetailUrl,
      manifestUrl,
      canInstall: classification === "bundle",
      unsupportedReason: getPluginSemanticUnsupportedReason(classification),
      warnings: [],
    };
  }

  deletePlugin(id: string): PluginLibraryFile {
    const library = this.read();
    const deletedPlugin = library.plugins.find((plugin) => plugin.id === id);
    const nextPlugins = library.plugins.filter((plugin) => plugin.id !== id);
    if (nextPlugins.length === library.plugins.length) {
      throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${id}`);
    }
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: nextPlugins,
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    if (deletedPlugin?.managedPath) {
      this.deleteManagedPluginPath(deletedPlugin.managedPath);
    }
    return nextLibrary;
  }

  private deleteManagedPluginPath(targetPath: string): void {
    const pluginsDir = path.resolve(getManagedPluginsDir());
    const resolvedTarget = path.resolve(targetPath);
    if (
      resolvedTarget === pluginsDir ||
      !resolvedTarget.startsWith(`${pluginsDir}${path.sep}`)
    ) {
      return;
    }
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  }

  private async readMarketplace(
    source: PluginMarketSource,
  ): Promise<PluginMarketEntry[]> {
    const local = readLocalPromptHubMarketplace(source);
    const content = local ?? (await this.fetchText(source.rawJsonUrl));
    const marketplace = parseJsonObject(
      content,
      `${source.displayName} market`,
    );
    const marketplaceDisplayName = getMarketplaceDisplayName(
      marketplace,
      source,
    );
    const plugins = Array.isArray(marketplace.plugins)
      ? marketplace.plugins
      : [];
    return plugins
      .map((plugin) =>
        normalizeMarketEntry(plugin, source, marketplaceDisplayName),
      )
      .filter((plugin): plugin is PluginMarketEntry => plugin !== null);
  }

  private async readManifestForEntry(
    entry: PluginMarketEntry,
  ): Promise<RawRecord> {
    const manifestUrl = this.getManifestUrlForEntry(entry);
    const content = await this.fetchText(manifestUrl);
    return parseJsonObject(content, `${entry.displayName} manifest`);
  }

  private getManifestUrlForEntry(entry: PluginMarketEntry): string {
    if (!entry.source.manifestPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `${entry.displayName} 没有可定位的 Plugin manifest`,
      );
    }

    const marketSource = this.marketSources.find(
      (source) => source.id === entry.marketplaceId,
    );
    if (!marketSource) {
      throw new CorePluginError(
        "MISSING_SOURCE",
        `${entry.displayName} 的 marketplace source 不存在`,
      );
    }

    return buildRawPluginFileUrl(marketSource, entry.source.manifestPath);
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetchFn(url, {
      headers: { Accept: "application/json,text/plain,*/*" },
    });
    if (!response.ok) {
      throw new CorePluginError(
        "FETCH_FAILED",
        `读取 Plugin 资源失败 (${response.status} ${response.statusText}): ${url}`,
      );
    }
    return response.text();
  }
}

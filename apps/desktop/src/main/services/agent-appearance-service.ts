import fs from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import path from "node:path";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

import type {
  AgentAppearanceActionResult,
  AgentAppearanceOverview,
  AgentDesktopThemeSummary,
  AgentPetSummary,
  UpdateAgentPetInput,
} from "@prompthub/shared/types";

function requireAppearanceCapability(): void {
  if (!isAgentDepthCapabilityAvailable("codex", "appearance")) {
    throw new Error("AGENT_APPEARANCE_UNSUPPORTED");
  }
}

const DEFAULT_MAX_PET_IMAGE_BYTES = 20 * 1024 * 1024;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const bundledThemeSeedTasks = new Map<string, Promise<void>>();

interface AppearanceState {
  activeThemeId: string | null;
}

interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spriteVersionNumber: 1 | 2;
  spritesheetPath: string;
}

export interface DreamSkinThemeConfig extends Record<string, unknown> {
  schemaVersion: 1;
  id: string;
  name: string;
  image: string;
}

export interface DreamSkinThemePackage {
  schemaVersion: 1;
  id: string;
  name: string;
  directoryPath: string;
  imagePath: string;
  imageName: string;
  config: DreamSkinThemeConfig | Record<string, unknown>;
  configBytes: Buffer;
  imageBytes: Buffer;
  previewDataUrl: string;
}

export interface AgentAppearanceThemeEngine {
  version: string;
  sourceCommit: string;
  adapterLastVerifiedVersion?: string | null;
  getBundledThemeDirectories?(): string[];
  readThemePackage(directoryPath: string): Promise<DreamSkinThemePackage>;
  applyTheme(options: {
    theme: DreamSkinThemePackage;
    restartExisting: boolean;
  }): Promise<void>;
  restoreTheme(): Promise<void>;
}

export interface AgentAppearanceServiceOptions {
  dataRoot: string;
  codexRoot: string;
  engine: AgentAppearanceThemeEngine;
  maxPetImageBytes?: number;
}

interface ParsedPet {
  manifest: PetManifest;
  summary: AgentPetSummary;
  spritesheetPath: string;
}

function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(id) || id.includes("..")) {
    throw new Error(`Invalid ${label} id`);
  }
}

function ensureContained(root: string, candidate: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its managed root`);
  }
}

async function requireRegularFile(
  filename: string,
  label: string,
): Promise<Stats> {
  const stat = await fs.lstat(filename);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return stat;
}

function normalizePetManifest(value: unknown): PetManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pet manifest must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.displayName !== "string" ||
    typeof raw.spritesheetPath !== "string"
  ) {
    throw new Error("Pet manifest is missing required fields");
  }
  assertSafeId(raw.id, "Pet");
  const displayName = raw.displayName.trim();
  if (!displayName || displayName.length > 120) {
    throw new Error("Pet displayName is invalid");
  }
  const spritesheetPath = raw.spritesheetPath.trim();
  if (
    !spritesheetPath ||
    spritesheetPath !== path.basename(spritesheetPath) ||
    ![".png", ".webp"].includes(path.extname(spritesheetPath).toLowerCase())
  ) {
    throw new Error(
      "Pet spritesheetPath must reference a local PNG or WebP file",
    );
  }
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > 1_000) {
    throw new Error("Pet description is too long");
  }
  if (
    raw.spriteVersionNumber !== undefined &&
    raw.spriteVersionNumber !== 1 &&
    raw.spriteVersionNumber !== 2
  ) {
    throw new Error("Pet spriteVersionNumber must be 1 or 2");
  }
  return {
    id: raw.id,
    displayName,
    description,
    spriteVersionNumber: raw.spriteVersionNumber === 2 ? 2 : 1,
    spritesheetPath,
  };
}

async function writeJsonAtomic(
  filename: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, filename);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function pathExists(filename: string): Promise<boolean> {
  try {
    await fs.access(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class AgentAppearanceService {
  private readonly themeDir: string;
  private readonly petDir: string;
  private readonly statePath: string;
  private readonly maxPetImageBytes: number;

  constructor(private readonly options: AgentAppearanceServiceOptions) {
    this.themeDir = path.join(
      options.dataRoot,
      "agent-appearance",
      "themes",
      "codex",
    );
    this.petDir = path.join(options.codexRoot, "pets");
    this.statePath = path.join(
      options.dataRoot,
      "agent-appearance",
      "codex-state.json",
    );
    this.maxPetImageBytes =
      options.maxPetImageBytes ?? DEFAULT_MAX_PET_IMAGE_BYTES;
  }

  async getOverview(): Promise<AgentAppearanceOverview> {
    requireAppearanceCapability();
    await this.seedBundledThemes();
    const [themeResult, petResult, state] = await Promise.all([
      this.listThemes(),
      this.listPets(),
      this.readState(),
    ]);
    const activeThemeId = themeResult.items.some(
      (theme) => theme.id === state.activeThemeId,
    )
      ? state.activeThemeId
      : null;
    return {
      agentId: "codex",
      supported: true,
      engineVersion: this.options.engine.version,
      adapterLastVerifiedVersion:
        this.options.engine.adapterLastVerifiedVersion ?? null,
      activeThemeId,
      themeDirectoryPath: this.themeDir,
      petDirectoryPath: this.petDir,
      themes: themeResult.items,
      pets: petResult.items,
      invalidThemeCount: themeResult.invalidCount,
      invalidPetCount: petResult.invalidCount,
    };
  }

  async importTheme(sourcePath: string): Promise<AgentDesktopThemeSummary> {
    requireAppearanceCapability();
    const sourceStat = await fs.lstat(sourcePath);
    if (sourceStat.isSymbolicLink()) {
      throw new Error("Theme directory must not be a symlink");
    }
    if (!sourceStat.isDirectory()) {
      throw new Error("Dream Skin source must be a directory");
    }
    const source = await this.options.engine.readThemePackage(sourcePath);
    assertSafeId(source.id, "theme");
    await fs.mkdir(this.themeDir, { recursive: true });
    const targetPath = path.join(this.themeDir, source.id);
    ensureContained(this.themeDir, targetPath, "Theme directory");
    const staging = path.join(
      this.themeDir,
      `.import-${source.id}-${process.pid}-${Date.now()}`,
    );
    const backup = path.join(
      this.themeDir,
      `.backup-${source.id}-${process.pid}-${Date.now()}`,
    );
    let backedUp = false;
    try {
      await fs.mkdir(staging, { mode: 0o700 });
      await fs.writeFile(
        path.join(staging, source.imageName),
        source.imageBytes,
        {
          mode: 0o600,
          flag: "wx",
        },
      );
      await fs.writeFile(path.join(staging, "theme.json"), source.configBytes, {
        mode: 0o600,
        flag: "wx",
      });
      try {
        await fs.rename(targetPath, backup);
        backedUp = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await fs.rename(staging, targetPath);
      if (backedUp) await fs.rm(backup, { recursive: true, force: true });
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      if (backedUp) {
        await fs.rm(targetPath, { recursive: true, force: true });
        await fs.rename(backup, targetPath).catch(() => undefined);
      }
      throw error;
    }
    return this.parseTheme(targetPath);
  }

  async deleteTheme(themeId: string): Promise<void> {
    requireAppearanceCapability();
    const state = await this.readState();
    if (state.activeThemeId === themeId) {
      throw new Error("Restore the active theme before deleting it");
    }
    const theme = await this.requireTheme(themeId);
    ensureContained(this.themeDir, theme.directoryPath, "Theme directory");
    await fs.rm(theme.directoryPath, { recursive: true, force: true });
  }

  async exportTheme(themeId: string, destinationDir: string): Promise<string> {
    requireAppearanceCapability();
    const theme = await this.requireTheme(themeId);
    await fs.mkdir(destinationDir, { recursive: true });
    const targetPath = path.join(destinationDir, theme.id);
    ensureContained(destinationDir, targetPath, "Theme export");
    if (await pathExists(targetPath)) {
      throw new Error(`Theme export destination already contains ${theme.id}`);
    }
    const bundle = await this.options.engine.readThemePackage(
      theme.directoryPath,
    );
    await fs.mkdir(targetPath, { mode: 0o700 });
    try {
      await fs.writeFile(
        path.join(targetPath, bundle.imageName),
        bundle.imageBytes,
        { mode: 0o600, flag: "wx" },
      );
      await fs.writeFile(
        path.join(targetPath, "theme.json"),
        bundle.configBytes,
        {
          mode: 0o600,
          flag: "wx",
        },
      );
    } catch (error) {
      await fs.rm(targetPath, { recursive: true, force: true });
      throw error;
    }
    return targetPath;
  }

  async getThemePreview(themeId: string): Promise<string | null> {
    requireAppearanceCapability();
    const theme = await this.requireTheme(themeId);
    const bundle = await this.options.engine.readThemePackage(
      theme.directoryPath,
    );
    return bundle.previewDataUrl;
  }

  async applyTheme(
    themeId: string,
    restartExisting = false,
  ): Promise<AgentAppearanceActionResult> {
    requireAppearanceCapability();
    const theme = await this.requireTheme(themeId);
    const bundle = await this.options.engine.readThemePackage(
      theme.directoryPath,
    );
    await this.options.engine.applyTheme({
      theme: bundle,
      restartExisting,
    });
    try {
      await this.writeState({ activeThemeId: themeId });
    } catch (error) {
      await this.options.engine.restoreTheme().catch(() => undefined);
      throw error;
    }
    return { success: true, activeThemeId: themeId };
  }

  async restoreTheme(): Promise<AgentAppearanceActionResult> {
    requireAppearanceCapability();
    await this.options.engine.restoreTheme();
    await this.writeState({ activeThemeId: null });
    return { success: true, activeThemeId: null };
  }

  async importPet(sourceDir: string): Promise<AgentPetSummary> {
    requireAppearanceCapability();
    const sourceStat = await fs.lstat(sourceDir);
    if (sourceStat.isSymbolicLink()) {
      throw new Error("Pet directory must not be a symlink");
    }
    if (!sourceStat.isDirectory())
      throw new Error("Pet source must be a directory");
    const parsed = await this.parsePetDirectory(sourceDir);
    await fs.mkdir(this.petDir, { recursive: true });
    const targetDir = path.join(this.petDir, parsed.manifest.id);
    ensureContained(this.petDir, targetDir, "Pet directory");
    if (await pathExists(targetDir)) {
      throw new Error(`Pet ${parsed.manifest.id} is already installed`);
    }
    const staging = path.join(
      this.petDir,
      `.import-${parsed.manifest.id}-${process.pid}-${Date.now()}`,
    );
    await fs.mkdir(staging, { recursive: false });
    try {
      await fs.copyFile(
        path.join(sourceDir, "pet.json"),
        path.join(staging, "pet.json"),
      );
      await fs.copyFile(
        parsed.spritesheetPath,
        path.join(staging, parsed.manifest.spritesheetPath),
      );
      await fs.rename(staging, targetDir);
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
    return (await this.parsePetDirectory(targetDir)).summary;
  }

  async exportPet(petId: string, destinationDir: string): Promise<string> {
    requireAppearanceCapability();
    assertSafeId(petId, "Pet");
    const parsed = await this.requirePet(petId);
    const targetDir = path.join(destinationDir, petId);
    ensureContained(destinationDir, targetDir, "Pet export");
    await fs.mkdir(destinationDir, { recursive: true });
    if (await pathExists(targetDir)) {
      throw new Error(`Export destination already contains ${petId}`);
    }
    await fs.mkdir(targetDir, { recursive: false });
    try {
      await fs.copyFile(
        path.join(parsed.summary.directoryPath, "pet.json"),
        path.join(targetDir, "pet.json"),
      );
      await fs.copyFile(
        parsed.spritesheetPath,
        path.join(targetDir, parsed.manifest.spritesheetPath),
      );
    } catch (error) {
      await fs.rm(targetDir, { recursive: true, force: true });
      throw error;
    }
    return targetDir;
  }

  async updatePetMetadata(
    input: UpdateAgentPetInput,
  ): Promise<AgentPetSummary> {
    requireAppearanceCapability();
    if (input.agentId !== "codex") {
      throw new Error("Appearance is only supported for Codex");
    }
    assertSafeId(input.petId, "Pet");
    const parsed = await this.requirePet(input.petId);
    const manifestPath = path.join(parsed.summary.directoryPath, "pet.json");
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Pet manifest must be an object");
    }
    const updated = {
      ...(raw as Record<string, unknown>),
      displayName: input.name.trim(),
      description: input.description.trim(),
    };
    normalizePetManifest(updated);
    await writeJsonAtomic(manifestPath, updated);
    return (await this.requirePet(input.petId)).summary;
  }

  async deletePet(petId: string): Promise<void> {
    requireAppearanceCapability();
    assertSafeId(petId, "Pet");
    const parsed = await this.requirePet(petId);
    ensureContained(this.petDir, parsed.summary.directoryPath, "Pet directory");
    await fs.rm(parsed.summary.directoryPath, { recursive: true, force: true });
  }

  async getPetPreview(petId: string): Promise<string> {
    requireAppearanceCapability();
    assertSafeId(petId, "Pet");
    const parsed = await this.requirePet(petId);
    const bytes = await fs.readFile(parsed.spritesheetPath);
    const mime =
      path.extname(parsed.spritesheetPath).toLowerCase() === ".png"
        ? "image/png"
        : "image/webp";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }

  private async parseTheme(
    directoryPath: string,
  ): Promise<AgentDesktopThemeSummary> {
    const bundle = await this.options.engine.readThemePackage(directoryPath);
    assertSafeId(bundle.id, "theme");
    return {
      id: bundle.id,
      name: bundle.name,
      version: String(bundle.schemaVersion),
      directoryPath,
      compatibleTarget: true,
      lintWarningCount: 0,
    };
  }

  private async listThemes(): Promise<{
    items: AgentDesktopThemeSummary[];
    invalidCount: number;
  }> {
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(this.themeDir, { withFileTypes: true });
    } catch {
      return { items: [], invalidCount: 0 };
    }
    const items: AgentDesktopThemeSummary[] = [];
    let invalidCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        if (!entry.name.startsWith(".")) invalidCount += 1;
        continue;
      }
      try {
        const theme = await this.parseTheme(
          path.join(this.themeDir, entry.name),
        );
        if (theme.id !== entry.name) {
          throw new Error("Theme id does not match its managed directory");
        }
        items.push(theme);
      } catch {
        invalidCount += 1;
      }
    }
    items.sort((left, right) => left.name.localeCompare(right.name));
    return { items, invalidCount };
  }

  private async requireTheme(
    themeId: string,
  ): Promise<AgentDesktopThemeSummary> {
    const themes = await this.listThemes();
    const theme = themes.items.find((candidate) => candidate.id === themeId);
    if (!theme) throw new Error(`Unknown desktop theme: ${themeId}`);
    return theme;
  }

  private async seedBundledThemes(): Promise<void> {
    const seedKey = path.resolve(this.themeDir);
    const activeTask = bundledThemeSeedTasks.get(seedKey);
    if (activeTask) {
      await activeTask;
      return;
    }

    const task = this.seedBundledThemesOnce();
    bundledThemeSeedTasks.set(seedKey, task);
    try {
      await task;
    } finally {
      bundledThemeSeedTasks.delete(seedKey);
    }
  }

  private async seedBundledThemesOnce(): Promise<void> {
    const sources = this.options.engine.getBundledThemeDirectories?.() ?? [];
    if (!sources.length) return;
    const marker = path.join(this.themeDir, ".dream-skin-bundled-v1");
    if (await pathExists(marker)) return;
    await fs.mkdir(this.themeDir, { recursive: true, mode: 0o700 });
    for (const source of sources) {
      const bundle = await this.options.engine.readThemePackage(source);
      const target = path.join(this.themeDir, bundle.id);
      ensureContained(this.themeDir, target, "Bundled theme directory");
      if (!(await pathExists(target))) await this.importTheme(source);
    }
    await fs
      .writeFile(marker, "1\n", { mode: 0o600, flag: "wx" })
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      });
  }

  private async parsePetDirectory(directoryPath: string): Promise<ParsedPet> {
    const directoryStat = await fs.lstat(directoryPath);
    if (directoryStat.isSymbolicLink())
      throw new Error("Pet directory must not be a symlink");
    if (!directoryStat.isDirectory())
      throw new Error("Pet entry must be a directory");
    const manifestPath = path.join(directoryPath, "pet.json");
    await requireRegularFile(manifestPath, "Pet manifest");
    const manifest = normalizePetManifest(
      JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
    );
    const spritesheetPath = path.join(directoryPath, manifest.spritesheetPath);
    ensureContained(directoryPath, spritesheetPath, "Pet spritesheet");
    const spritesheetStat = await requireRegularFile(
      spritesheetPath,
      "Pet spritesheet",
    );
    if (
      spritesheetStat.size <= 0 ||
      spritesheetStat.size > this.maxPetImageBytes
    ) {
      throw new Error("Pet spritesheet exceeds the size limit");
    }
    return {
      manifest,
      spritesheetPath,
      summary: {
        id: manifest.id,
        name: manifest.displayName,
        description: manifest.description,
        directoryPath,
        spriteVersionNumber: manifest.spriteVersionNumber,
        spritesheetName: manifest.spritesheetPath,
        spritesheetBytes: spritesheetStat.size,
      },
    };
  }

  private async listPets(): Promise<{
    items: AgentPetSummary[];
    invalidCount: number;
  }> {
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(this.petDir, { withFileTypes: true });
    } catch {
      return { items: [], invalidCount: 0 };
    }
    const items: AgentPetSummary[] = [];
    let invalidCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        if (!entry.name.startsWith(".")) invalidCount += 1;
        continue;
      }
      try {
        const parsed = await this.parsePetDirectory(
          path.join(this.petDir, entry.name),
        );
        if (parsed.manifest.id !== entry.name)
          throw new Error("Pet id does not match directory");
        items.push(parsed.summary);
      } catch {
        invalidCount += 1;
      }
    }
    items.sort((left, right) => left.name.localeCompare(right.name));
    return { items, invalidCount };
  }

  private async requirePet(petId: string): Promise<ParsedPet> {
    const directoryPath = path.join(this.petDir, petId);
    ensureContained(this.petDir, directoryPath, "Pet directory");
    const parsed = await this.parsePetDirectory(directoryPath);
    if (parsed.manifest.id !== petId)
      throw new Error("Pet id does not match directory");
    return parsed;
  }

  private async readState(): Promise<AppearanceState> {
    try {
      const value = JSON.parse(
        await fs.readFile(this.statePath, "utf8"),
      ) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const activeThemeId = (value as Record<string, unknown>).activeThemeId;
        return {
          activeThemeId:
            typeof activeThemeId === "string" ? activeThemeId : null,
        };
      }
    } catch {
      // Missing or malformed advisory state is treated as no managed theme.
    }
    return { activeThemeId: null };
  }

  private writeState(state: AppearanceState): Promise<void> {
    return writeJsonAtomic(this.statePath, state);
  }
}

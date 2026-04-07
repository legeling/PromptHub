import * as nodeFs from "fs";
import * as fs from "fs/promises";
import * as dns from "dns/promises";
import * as http from "http";
import * as https from "https";
import * as nodeNet from "net";
import * as os from "os";
import * as path from "path";
import type {
  ScannedSkill,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillManifest,
} from "../../shared/types";
import { SkillDB } from "../database/skill";
import { parseSkillMd } from "./skill-validator";
import { getSkillsDir } from "../runtime-paths";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "../../shared/constants/platforms";
import {
  getPlatformSkillsDir,
  gitClone,
  resolvePlatformPath,
  validateMCPConfig,
} from "./skill-installer-utils";

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const REMOTE_FETCH_TIMEOUT_MS = 30_000;
const REMOTE_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const REMOTE_FETCH_MAX_REDIRECTS = 5;
interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeExistingPathSync(absolutePath: string): string {
  const resolvedPath = path.resolve(absolutePath);
  try {
    return nodeFs.realpathSync.native(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "localhost.localdomain" ||
    normalized.endsWith(".localdomain")
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedAddress = normalized.slice("::ffff:".length);
    return nodeNet.isIP(mappedAddress) === 4 && isPrivateIPv4(mappedAddress);
  }

  const firstHextet = normalized
    .split(":")
    .find((segment) => segment.length > 0);
  if (!firstHextet) {
    return false;
  }

  const value = Number.parseInt(firstHextet, 16);
  if (Number.isNaN(value)) {
    return false;
  }

  return (value & 0xfe00) === 0xfc00 || (value & 0xffc0) === 0xfe80;
}

function isPrivateAddress(address: string): boolean {
  const family = nodeNet.isIP(address);
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return isPrivateIPv6(address);
  }
  return false;
}

function toRequestPath(parsedUrl: URL): string {
  return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function getRequestModule(protocol: string): typeof http | typeof https {
  return protocol === "https:" ? https : http;
}

async function resolvePublicAddress(
  hostname: string,
): Promise<ResolvedAddress> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Access to local network addresses is not allowed");
  }

  if (nodeNet.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Access to internal network addresses is not allowed");
    }
    return { address: hostname, family: nodeNet.isIP(hostname) as 4 | 6 };
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Failed to resolve remote host");
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Access to internal network addresses is not allowed");
  }

  const firstAddress = addresses[0];
  return {
    address: firstAddress.address,
    family: firstAddress.family === 6 ? 6 : 4,
  };
}

async function fetchRemoteText(
  targetUrl: string,
  redirectCount = 0,
): Promise<string> {
  if (redirectCount > REMOTE_FETCH_MAX_REDIRECTS) {
    throw new Error("Too many redirects while fetching remote content");
  }

  const parsedUrl = new URL(targetUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }

  const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname);
  const requestModule = getRequestModule(parsedUrl.protocol);

  return new Promise((resolve, reject) => {
    const request = requestModule.request(
      {
        protocol: parsedUrl.protocol,
        hostname: resolvedAddress.address,
        family: resolvedAddress.family,
        servername: parsedUrl.hostname,
        port: parsedUrl.port
          ? Number(parsedUrl.port)
          : parsedUrl.protocol === "https:"
            ? 443
            : 80,
        path: toRequestPath(parsedUrl),
        method: "GET",
        headers: {
          Host: parsedUrl.host,
          "User-Agent": "PromptHub/remote-skill-fetch",
          Accept: "text/plain, application/json;q=0.9, */*;q=0.1",
        },
        timeout: REMOTE_FETCH_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          typeof location === "string"
        ) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          void fetchRemoteText(nextUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} fetching remote content`));
          return;
        }

        const contentLengthHeader = response.headers["content-length"];
        const contentLength = Array.isArray(contentLengthHeader)
          ? Number.parseInt(contentLengthHeader[0], 10)
          : Number.parseInt(contentLengthHeader ?? "", 10);
        if (
          Number.isFinite(contentLength) &&
          contentLength > REMOTE_FETCH_MAX_BYTES
        ) {
          response.resume();
          reject(new Error("Remote content exceeds size limit"));
          return;
        }

        let receivedBytes = 0;
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > REMOTE_FETCH_MAX_BYTES) {
            response.destroy(new Error("Remote content exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        response.on("error", (error) => reject(error));
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Remote content request timed out"));
    });
    request.on("error", (error) => reject(error));
    request.end();
  });
}

export class SkillInstaller {
  private static get skillsDir() {
    return getSkillsDir();
  }

  private static getDefaultScanEntries(): Array<{
    path: string;
    platformName: string;
  }> {
    const scanEntries: Array<{ path: string; platformName: string }> = [
      {
        path: this.skillsDir,
        platformName: "PromptHub",
      },
    ];

    for (const p of SKILL_PLATFORMS) {
      const resolved = getPlatformSkillsDir(p);
      if (!scanEntries.find((entry) => entry.path === resolved)) {
        scanEntries.push({ path: resolved, platformName: p.name });
      }
    }

    return scanEntries;
  }

  static isManagedRepoPath(absolutePath: string): boolean {
    const normalizedSkillsDir = normalizeExistingPathSync(this.skillsDir);
    const normalizedAbsolutePath = normalizeExistingPathSync(absolutePath);
    return isPathWithin(normalizedSkillsDir, normalizedAbsolutePath);
  }

  private static async resolveRepoBasePath(
    absoluteBasePath: string,
    options?: { ensureExists?: boolean },
  ): Promise<{ resolvedBasePath: string; realBasePath: string }> {
    const resolvedBasePath = path.resolve(absoluteBasePath);
    const resolvedSkillsDir = path.resolve(this.skillsDir);
    const realSkillsDir = await fs
      .realpath(resolvedSkillsDir)
      .catch(() => resolvedSkillsDir);
    // Also resolve the base path through realpath so symlinks on either side
    // don't cause a false-positive traversal detection.
    // 对 basePath 也执行 realpath，避免任一侧有符号链接时误报 path traversal。
    const realResolvedBasePath = await fs
      .realpath(resolvedBasePath)
      .catch(() => resolvedBasePath);

    if (
      !isPathWithin(resolvedSkillsDir, resolvedBasePath) &&
      !isPathWithin(realSkillsDir, resolvedBasePath) &&
      !isPathWithin(resolvedSkillsDir, realResolvedBasePath) &&
      !isPathWithin(realSkillsDir, realResolvedBasePath)
    ) {
      throw new Error(
        "Path traversal detected: base path is outside skills directory",
      );
    }

    if (options?.ensureExists) {
      await fs.mkdir(resolvedBasePath, { recursive: true });
    }

    const realBasePath = await fs
      .realpath(resolvedBasePath)
      .catch(() => resolvedBasePath);
    if (!isPathWithin(realSkillsDir, realBasePath)) {
      throw new Error("Managed repo path resolves outside skills directory");
    }

    return { resolvedBasePath, realBasePath };
  }

  private static async resolveRepoTargetPath(
    absoluteBasePath: string,
    relativePath: string,
    options?: { ensureBaseExists?: boolean },
  ): Promise<{ fullPath: string; realBasePath: string }> {
    this.validateRelativePath(relativePath);
    const { resolvedBasePath, realBasePath } = await this.resolveRepoBasePath(
      absoluteBasePath,
      { ensureExists: options?.ensureBaseExists },
    );
    const fullPath = path.resolve(resolvedBasePath, relativePath);
    // Also check against the realpath of fullPath in case of symlinks.
    // 对 fullPath 也执行 realpath 检查，避免路径含符号链接时误报。
    const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
    if (
      !isPathWithin(realBasePath, fullPath) &&
      !isPathWithin(realBasePath, realFullPath)
    ) {
      throw new Error("Path traversal detected: target path escapes repo root");
    }
    return { fullPath, realBasePath };
  }

  static async init() {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
    } catch (e) {
      console.error("Failed to create skills directory", e);
    }
  }

  static async installFromGithub(url: string, db: SkillDB): Promise<string> {
    await this.init();

    // Validate and extract owner/repo from GitHub URL
    // 校验并从 GitHub URL 中提取 owner/repo
    const matches = url.match(
      /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
    );
    if (!matches) {
      throw new Error(
        "Invalid GitHub URL: must be https://github.com/{owner}/{repo}",
      );
    }
    const userDir = matches[1];
    const repoName = matches[2];
    const installDir = path.join(this.skillsDir, `${userDir}-${repoName}`);

    // Validate installDir is inside skillsDir before writing to DB
    // 写入 DB 前校验 installDir 是否在 skillsDir 内
    const skillsDirResolved = path.resolve(this.skillsDir);
    const installDirResolved = path.resolve(installDir);
    const installRelative = path.relative(
      skillsDirResolved,
      installDirResolved,
    );
    if (installRelative.startsWith("..") || path.isAbsolute(installRelative)) {
      throw new Error(
        "Path traversal detected: installDir is outside skills directory",
      );
    }

    // Check if skill already installed (by directory existence)
    try {
      await fs.access(installDir);
      // If exists, maybe pull? For now, throw error or just update DB if missing
      // Let's assume re-install is not supported yet without delete
      throw new Error(
        `Skill ${userDir}/${repoName} already exists. Please delete it first.`,
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== "ENOENT") throw error;
    }

    try {
      console.log(`Cloning ${url} to ${installDir}`);
      await gitClone(url, installDir);

      // Parse metadata
      const manifest = await this.readManifest(installDir);

      // Load instructions from SKILL.md if not in manifest
      if (!manifest.instructions) {
        try {
          manifest.instructions = await fs.readFile(
            path.join(installDir, "SKILL.md"),
            "utf-8",
          );
        } catch (e) {
          console.error("Failed to read SKILL.md:", e);
        }
      }

      // If still no instructions, maybe README.md?
      if (!manifest.instructions) {
        try {
          manifest.instructions = await fs.readFile(
            path.join(installDir, "README.md"),
            "utf-8",
          );
        } catch (e) {
          console.error("Failed to read README.md:", e);
        }
      }

      // Create Skill in DB
      const skill = db.create({
        name: manifest.name || repoName,
        description: manifest.description || `Installed from ${url}`,
        version: manifest.version || "1.0.0",
        author: manifest.author || userDir,
        content: manifest.instructions || "",
        instructions: manifest.instructions || "",
        protocol_type: "skill",
        source_url: url,
        local_repo_path: installDir,
        is_favorite: false,
        tags: [],
        original_tags: manifest.tags || ["github"],
      });

      return skill.id;
    } catch (error) {
      console.error("Installation failed:", error);
      // Clean up
      try {
        await fs.rm(installDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to clean up install directory:", e);
      }
      throw error;
    }
  }

  static async installFromSource(
    source: string,
    db: SkillDB,
    options?: { name?: string },
  ): Promise<string> {
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      throw new Error("Skill source cannot be empty");
    }

    if (/^https?:\/\/github\.com\//i.test(trimmedSource)) {
      return this.installFromGithub(trimmedSource, db);
    }

    if (/^https:\/\//i.test(trimmedSource)) {
      const remoteContent = await this.fetchRemoteContent(trimmedSource);
      return this.installFromSkillContent(remoteContent, db, {
        name: options?.name,
        sourceUrl: trimmedSource,
      });
    }

    return this.installFromLocalPath(trimmedSource, db, options);
  }

  static async installFromLocalPath(
    sourcePath: string,
    db: SkillDB,
    options?: { name?: string },
  ): Promise<string> {
    const resolvedSourcePath = path.resolve(sourcePath);
    const sourceStat = await fs.stat(resolvedSourcePath).catch(() => null);

    if (!sourceStat) {
      throw new Error(`Skill source not found: ${resolvedSourcePath}`);
    }

    if (sourceStat.isDirectory()) {
      const skillMdPath = path.join(resolvedSourcePath, "SKILL.md");
      const skillMdExists = await this.fileExists(skillMdPath);

      if (!skillMdExists) {
        throw new Error(
          `SKILL.md not found in directory: ${resolvedSourcePath}`,
        );
      }

      const skillContent = await fs.readFile(skillMdPath, "utf-8");
      return this.installFromSkillContent(skillContent, db, {
        name: options?.name,
        sourceUrl: resolvedSourcePath,
        repoSourceDir: resolvedSourcePath,
      });
    }

    const extension = path.extname(resolvedSourcePath).toLowerCase();
    if (extension === ".json") {
      const jsonContent = await fs.readFile(resolvedSourcePath, "utf-8");
      return this.importFromJson(jsonContent, db);
    }

    const fileContent = await fs.readFile(resolvedSourcePath, "utf-8");
    return this.installFromSkillContent(fileContent, db, {
      name: options?.name,
      sourceUrl: resolvedSourcePath,
      repoSourceDir:
        path.basename(resolvedSourcePath).toLowerCase() === "skill.md"
          ? path.dirname(resolvedSourcePath)
          : undefined,
    });
  }

  static async installFromSkillContent(
    skillContent: string,
    db: SkillDB,
    options?: {
      name?: string;
      sourceUrl?: string;
      repoSourceDir?: string;
    },
  ): Promise<string> {
    const parsed = parseSkillMd(skillContent);
    const manifest = options?.repoSourceDir
      ? await this.readManifest(options.repoSourceDir)
      : {};
    const fallbackName = options?.repoSourceDir
      ? path.basename(options.repoSourceDir)
      : undefined;
    const skillName =
      options?.name?.trim() ||
      parsed?.frontmatter.name ||
      manifest.name ||
      fallbackName;

    if (!skillName || !skillName.trim()) {
      throw new Error(
        "Skill name is required; pass --name or add SKILL.md frontmatter",
      );
    }

    const sanitized = sanitizeImportedSkillDraft(
      {
        name: skillName,
        description: parsed?.frontmatter.description,
        fallbackDescription:
          manifest.description ||
          `Installed from ${options?.sourceUrl || "local source"}`,
        version: parsed?.frontmatter.version,
        fallbackVersion: manifest.version,
        author: parsed?.frontmatter.author,
        fallbackAuthor: manifest.author || "Local",
        tags: parsed?.frontmatter.tags,
        fallbackTags: manifest.tags,
        instructions: skillContent,
        source_url: options?.sourceUrl,
        local_repo_path: options?.repoSourceDir,
        protocol_type: "skill",
      },
      { defaultTags: [] },
    );

    const createdSkill = db.create({
      name: sanitized.name!,
      description: sanitized.description,
      instructions: sanitized.instructions,
      content: sanitized.instructions,
      protocol_type: sanitized.protocol_type,
      version: sanitized.version,
      author: sanitized.author,
      tags: [],
      original_tags: sanitized.tags,
      is_favorite: false,
      source_url: sanitized.source_url,
      local_repo_path: sanitized.local_repo_path,
    });

    let localRepoPath: string | undefined;
    if (options?.repoSourceDir) {
      try {
        localRepoPath = await this.saveToLocalRepo(
          skillName,
          options.repoSourceDir,
        );
      } catch (error) {
        console.warn(
          `Failed to copy local repo for skill "${skillName}":`,
          error,
        );
      }
    } else {
      localRepoPath = await this.saveContentToLocalRepo(
        skillName,
        skillContent,
      );
    }

    if (localRepoPath) {
      db.update(createdSkill.id, { local_repo_path: localRepoPath });
    }

    return createdSkill.id;
  }

  /**
   * Scan local SKILL.md files from various AI tool directories
   * 扫描本地各 AI 工具目录下的 SKILL.md 文件
   *
   * Note: This method only scans SKILL.md format skills, NOT MCP configurations
   * 注意：此方法只扫描 SKILL.md 格式的技能，不扫描 MCP 配置
   */
  static async scanLocal(db: SkillDB): Promise<number> {
    let count = 0;
    const scanPaths = this.getDefaultScanEntries().map((entry) => entry.path);

    for (const scanPath of scanPaths) {
      if (!(await this.fileExists(scanPath))) {
        console.log(`Scan path does not exist, skipping: ${scanPath}`);
        continue;
      }

      try {
        console.log(`Scanning path for skills: ${scanPath}`);
        const entries = await fs.readdir(scanPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFolderPath = path.join(scanPath, entry.name);
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");

            if (await this.fileExists(skillMdPath)) {
              try {
                const instructions = await fs.readFile(skillMdPath, "utf-8");
                const manifest = await this.readManifest(skillFolderPath);

                // Use the skill-validator to parse SKILL.md frontmatter
                // 使用 skill-validator 解析 SKILL.md frontmatter
                const parsed = parseSkillMd(instructions);

                const sanitized = sanitizeImportedSkillDraft(
                  {
                    name: parsed?.frontmatter.name,
                    fallbackName: manifest.name || entry.name,
                    description: parsed?.frontmatter.description,
                    fallbackDescription: manifest.description || `Local skill found in ${entry.name}`,
                    version: parsed?.frontmatter.version,
                    fallbackVersion: manifest.version,
                    author: parsed?.frontmatter.author,
                    fallbackAuthor: manifest.author || "Local",
                    tags: parsed?.frontmatter.tags,
                    fallbackTags: [],
                    instructions,
                    local_repo_path: skillFolderPath,
                    protocol_type: "skill",
                  },
                  { defaultTags: [] },
                );

                const name = sanitized.name;

                if (!name || name.trim().length === 0) {
                  console.warn(
                    `Skipping skill with empty name in: ${skillFolderPath}`,
                  );
                  continue;
                }

                db.create({
                  name,
                  description: sanitized.description,
                  version: sanitized.version,
                  author: sanitized.author,
                  instructions: sanitized.instructions,
                  content: sanitized.instructions,
                  protocol_type: sanitized.protocol_type,
                  is_favorite: false,
                  tags: [],
                  original_tags: sanitized.tags,
                  local_repo_path: sanitized.local_repo_path,
                });
                count++;
                console.log(
                  `Discovered local skill via SKILL.md: ${name} in ${entry.name}`,
                );
              } catch (error: unknown) {
                // 跳过重复名称等非致命错误
                console.warn(
                  `Failed to import skill "${name}":`,
                  getErrorMessage(error),
                );
              }
            }
          }
        }
      } catch (e) {
        console.error(`Failed to scan path: ${scanPath}`, e);
      }
    }

    return count;
  }

  /**
   * Scan local SKILL.md files and return them as a preview list (without importing)
   * 扫描本地 SKILL.md 文件并返回预览列表（不导入）
   *
   * @param customPaths - Additional directories to scan beyond the default platform paths
   *                      额外扫描目录（追加到默认平台路径之后）
   */
  static async scanLocalPreview(
    customPaths?: string[],
  ): Promise<ScannedSkill[]> {
    // Use a map keyed by skill folder path to deduplicate across platforms
    // 使用按技能文件夹路径为键的 map 来跨平台去重
    const skillMap = new Map<string, ScannedSkill>();
    const scanEntries = this.getDefaultScanEntries();

    // Append custom paths provided by the user
    // 追加用户自定义路径
    if (customPaths && customPaths.length > 0) {
      for (const cp of customPaths) {
        const resolved = resolvePlatformPath(cp.trim());
        if (resolved && !scanEntries.find((e) => e.path === resolved)) {
          scanEntries.push({ path: resolved, platformName: "Custom" });
        }
      }
    }

    for (const { path: scanPath, platformName } of scanEntries) {
      if (!(await this.fileExists(scanPath))) {
        continue;
      }

      try {
        const entries = await fs.readdir(scanPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFolderPath = path.join(scanPath, entry.name);
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");

            if (await this.fileExists(skillMdPath)) {
              try {
                const instructions = await fs.readFile(skillMdPath, "utf-8");
                const manifest = await this.readManifest(skillFolderPath);
                const parsed = parseSkillMd(instructions);

                const name =
                  parsed?.frontmatter.name || manifest.name || entry.name;

                if (!name || name.trim().length === 0) {
                  console.warn(
                    `Skipping skill with empty name in: ${skillFolderPath}`,
                  );
                  continue;
                }

                // Deduplicate by skill folder path (not name) so same skill in
                // multiple platforms only appears once, but different paths with
                // the same name can both show up.
                // 以文件夹路径为键去重，而非名称，避免误判"已安装"
                const existing = skillMap.get(skillFolderPath);
                if (existing) {
                  if (!existing.platforms.includes(platformName)) {
                    existing.platforms.push(platformName);
                  }
                } else {
                  const sanitized = sanitizeImportedSkillDraft(
                    {
                      name: parsed?.frontmatter.name,
                      fallbackName: manifest.name || entry.name,
                      description: parsed?.frontmatter.description,
                      fallbackDescription:
                        manifest.description ||
                        `Local skill found in ${entry.name}`,
                      version: parsed?.frontmatter.version,
                      fallbackVersion: manifest.version,
                      author: parsed?.frontmatter.author,
                      fallbackAuthor: manifest.author || "Local",
                      tags: parsed?.frontmatter.tags,
                      fallbackTags: [],
                      instructions,
                      local_repo_path: skillFolderPath,
                      protocol_type: "skill",
                    },
                    { defaultTags: [] },
                  );
                  skillMap.set(skillFolderPath, {
                    name: sanitized.name!,
                    description:
                      sanitized.description || `Local skill found in ${entry.name}`,
                    version: sanitized.version,
                    author: sanitized.author || "Local",
                    tags: sanitized.tags,
                    instructions: sanitized.instructions || instructions,
                    filePath: skillMdPath,
                    localPath: skillFolderPath,
                    platforms: [platformName],
                  });
                }
              } catch (err) {
                console.warn(`Failed to parse skill at ${skillMdPath}:`, err);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Failed to scan path: ${scanPath}`, e);
      }
    }

    return Array.from(skillMap.values());
  }

  static async installToPlatform(
    platform: "claude" | "cursor",
    name: string,
    mcpConfig: unknown,
  ): Promise<void> {
    if (platform !== "claude" && platform !== "cursor") {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    // Runtime validation of MCP config structure before writing to platform config
    validateMCPConfig(mcpConfig, name);

    const homeDir = os.homedir();
    const configPath =
      platform === "claude"
        ? path.join(
            homeDir,
            "Library/Application Support/Claude/claude_desktop_config.json",
          )
        : path.join(homeDir, ".cursor/mcp.json");

    if (!(await this.fileExists(configPath))) {
      // If file doesn't exist, create a basic one
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      const initialConfig = { mcpServers: {} };
      await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));
    }

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content) as Record<string, unknown>;

      // Handle different key variations
      if (!config.mcpServers && !config.mcp_servers && !config.servers) {
        config.mcpServers = {};
      }

      const serversKey = config.mcpServers
        ? "mcpServers"
        : config.mcp_servers
          ? "mcp_servers"
          : "servers";

      // Merge config
      // mcpConfig is expected to be { servers: { name: config } }
      const configObj = mcpConfig as Record<string, unknown>;
      const sourceServers =
        configObj.servers && typeof configObj.servers === "object"
          ? (configObj.servers as Record<string, unknown>)
          : { [name]: mcpConfig };
      const sourceServerEntries = Object.entries(sourceServers);
      if (
        sourceServerEntries.length !== 1 ||
        sourceServerEntries[0][0] !== name
      ) {
        throw new Error(
          "MCP config must contain exactly one server entry matching the skill name",
        );
      }
      await fs.copyFile(configPath, `${configPath}.bak`);
      config[serversKey] = {
        ...(config[serversKey] as Record<string, unknown>),
        [name]: sourceServerEntries[0][1],
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`Successfully installed skill ${name} to ${platform}`);
    } catch (error) {
      console.error(`Failed to install to ${platform}:`, error);
      throw error;
    }
  }

  static async uninstallFromPlatform(
    platform: "claude" | "cursor",
    name: string,
  ): Promise<void> {
    const homeDir = os.homedir();
    const configPath =
      platform === "claude"
        ? path.join(
            homeDir,
            "Library/Application Support/Claude/claude_desktop_config.json",
          )
        : path.join(homeDir, ".cursor/mcp.json");

    if (!(await this.fileExists(configPath))) return;

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      const serversKey = config.mcpServers
        ? "mcpServers"
        : config.mcp_servers
          ? "mcp_servers"
          : "servers";

      if (config[serversKey] && config[serversKey][name]) {
        delete config[serversKey][name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`Successfully uninstalled skill ${name} from ${platform}`);
      }
    } catch (e) {
      console.error(`Failed to uninstall from ${platform}:`, e);
      throw e;
    }
  }

  static async getPlatformStatus(
    name: string,
  ): Promise<Record<string, boolean>> {
    const homeDir = os.homedir();
    const status: Record<string, boolean> = { claude: false, cursor: false };

    const check = async (platform: "claude" | "cursor", configPath: string) => {
      if (!(await this.fileExists(configPath))) return;
      try {
        const content = await fs.readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        const servers =
          config.mcpServers || config.mcp_servers || config.servers || {};
        if (servers[name]) status[platform] = true;
      } catch (e) {
        console.error("Failed to read platform config:", e);
      }
    };

    await check(
      "claude",
      path.join(
        homeDir,
        "Library/Application Support/Claude/claude_desktop_config.json",
      ),
    );
    await check("cursor", path.join(homeDir, ".cursor/mcp.json"));

    return status;
  }

  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private static async readManifest(dir: string): Promise<SkillManifest> {
    try {
      const content = await fs.readFile(
        path.join(dir, "manifest.json"),
        "utf-8",
      );
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const sanitized = sanitizeImportedSkillDraft(
        {
          name: parsed.name,
          description: parsed.description,
          version: parsed.version,
          author: parsed.author,
          tags: parsed.tags,
          instructions: parsed.instructions,
        },
        { defaultTags: [] },
      );
      return {
        name: sanitized.name,
        description: sanitized.description,
        version: sanitized.version,
        author: sanitized.author,
        tags: sanitized.tags.length > 0 ? sanitized.tags : undefined,
        instructions: sanitized.instructions,
      };
    } catch {
      return {};
    }
  }

  // ==================== Local Repo Storage Layer ====================
  // ==================== 本地仓库存储层 ====================

  /** Maximum recursion depth for directory walking */
  private static readonly MAX_WALK_DEPTH = 5;
  /** Maximum number of file entries to collect */
  private static readonly MAX_WALK_FILES = 500;

  /**
   * Text file extensions recognized for content reading (all lowercase).
   * 可识别为文本文件的扩展名列表（全小写）。
   */
  private static readonly TEXT_EXTENSIONS = new Set([
    ".md",
    ".py",
    ".js",
    ".ts",
    ".json",
    ".yaml",
    ".yml",
    ".txt",
    ".sh",
    ".toml",
    ".cfg",
    ".ini",
    ".css",
    ".html",
    ".xml",
    ".sql",
    ".r",
    ".jl",
    ".lua",
    ".rb",
    ".go",
    ".java",
    ".kt",
    ".swift",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".rs",
  ]);

  /**
   * Validate a skill name for safety (prevent path traversal).
   * 校验 skill 名称安全性（防止目录遍历攻击）。
   *
   * Ensures the resolved path stays within the skills directory.
   */
  private static validateSkillName(skillName: string): void {
    if (!skillName || skillName.trim().length === 0) {
      throw new Error("Invalid skill name: must not be empty");
    }
    if (
      skillName.includes("..") ||
      skillName.includes("/") ||
      skillName.includes("\\")
    ) {
      throw new Error(
        `Invalid skill name: must not contain "..", "/" or "\\": ${skillName}`,
      );
    }
    // Reject absolute paths on Windows (e.g., C:\)
    if (/^[a-zA-Z]:/.test(skillName)) {
      throw new Error(
        `Invalid skill name: must not be an absolute path: ${skillName}`,
      );
    }
    // Final check: resolved path must be a direct child of skillsDir
    const resolved = path.resolve(this.skillsDir, skillName);
    if (path.dirname(resolved) !== path.resolve(this.skillsDir)) {
      throw new Error(
        `Invalid skill name: resolved path escapes skills directory: ${skillName}`,
      );
    }
  }

  /**
   * Validate a relative path for safety (prevent path traversal).
   * 校验相对路径安全性（防止目录遍历攻击）。
   */
  private static validateRelativePath(relativePath: string): void {
    if (relativePath.includes("..")) {
      throw new Error(
        `Invalid relative path: must not contain "..": ${relativePath}`,
      );
    }
    if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
      throw new Error(
        `Invalid relative path: must not start with "/" or "\\": ${relativePath}`,
      );
    }
    // Reject absolute paths on Windows (e.g., C:\)
    if (/^[a-zA-Z]:/.test(relativePath)) {
      throw new Error(
        `Invalid relative path: must not be an absolute path: ${relativePath}`,
      );
    }
  }

  /**
   * Copy an entire source directory into the local skill repo.
   * 将整个源目录递归复制到本地 skill 仓库。
   *
   * If the destination already exists it is removed first (update/overwrite).
   * 如果目标已存在则先清空再复制（更新覆盖）。
   *
   * @returns The absolute path of the destination directory.
   */
  static async saveToLocalRepo(
    skillName: string,
    sourceDir: string,
  ): Promise<string> {
    this.validateSkillName(skillName);
    // Validate sourceDir: must be an existing directory (prevent arbitrary path copy)
    // 校验 sourceDir：必须是已存在的目录（防止任意路径复制）
    try {
      const stat = await fs.stat(sourceDir);
      if (!stat.isDirectory()) {
        throw new Error(`Invalid sourceDir: not a directory: ${sourceDir}`);
      }
    } catch (error: unknown) {
      if (getErrorCode(error) === "ENOENT") {
        throw new Error(
          `Invalid sourceDir: directory does not exist: ${sourceDir}`,
        );
      }
      throw error;
    }

    await this.init();
    const destDir = path.join(this.skillsDir, skillName);

    // Remove existing destination if present
    if (await this.fileExists(destDir)) {
      await fs.rm(destDir, { recursive: true, force: true });
    }

    await fs.cp(sourceDir, destDir, { recursive: true });

    return destDir;
  }

  /**
   * Save a single SKILL.md content string into the local skill repo.
   * 将单个 SKILL.md 内容字符串写入本地 skill 仓库。
   *
   * @returns The absolute path of the destination directory.
   */
  static async saveContentToLocalRepo(
    skillName: string,
    content: string,
  ): Promise<string> {
    this.validateSkillName(skillName);
    await this.init();
    const destDir = path.join(this.skillsDir, skillName);

    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, "SKILL.md"), content, "utf-8");

    return destDir;
  }

  /**
   * Recursively read all files under the local skill repo directory.
   * 递归读取本地 skill 仓库目录下的所有文件。
   *
   * Text files are returned with their content; binary files have
   * content set to "[binary file]".
   */
  static async readLocalRepoFiles(
    skillName: string,
  ): Promise<{ path: string; content: string; isDirectory: boolean }[]> {
    this.validateSkillName(skillName);
    const baseDir = path.join(this.skillsDir, skillName);

    if (!(await this.fileExists(baseDir))) {
      return [];
    }

    const results: { path: string; content: string; isDirectory: boolean }[] =
      [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > SkillInstaller.MAX_WALK_DEPTH) return;
      if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          results.push({ path: relativePath, content: "", isDirectory: true });
          await walk(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let content: string;
          if (this.TEXT_EXTENSIONS.has(ext)) {
            // Limit file size to 1 MB to prevent memory issues
            // 限制文件大小为 1 MB，防止内存溢出
            const stat = await fs.stat(fullPath);
            if (stat.size > 1_048_576) {
              content = "[file too large]";
            } else {
              content = await fs.readFile(fullPath, "utf-8");
            }
          } else {
            content = "[binary file]";
          }
          results.push({ path: relativePath, content, isDirectory: false });
        }
      }
    };

    await walk(baseDir, 0);
    return results;
  }

  /**
   * Recursively read all files under an absolute directory path.
   * Same logic as readLocalRepoFiles but accepts an absolute path directly
   * instead of constructing the path from a skill name.
   * 与 readLocalRepoFiles 逻辑相同，但接受绝对路径而非通过 skillName 构建路径。
   */
  static async readLocalRepoFilesByPath(
    absolutePath: string,
  ): Promise<SkillLocalFileEntry[]> {
    const { realBasePath } = await this.resolveRepoBasePath(absolutePath);

    if (!(await this.fileExists(absolutePath))) {
      return [];
    }

    const baseDir = absolutePath;
    const results: SkillLocalFileEntry[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > SkillInstaller.MAX_WALK_DEPTH) return;
      if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

        const fullPath = path.join(dir, entry.name);
        const lstat = await fs.lstat(fullPath);
        if (lstat.isSymbolicLink()) {
          continue;
        }
        const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
        if (!isPathWithin(realBasePath, realFullPath)) {
          continue;
        }
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          results.push({ path: relativePath, content: "", isDirectory: true });
          await walk(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let content: string;
          if (this.TEXT_EXTENSIONS.has(ext)) {
            const stat = await fs.stat(fullPath);
            if (stat.size > 1_048_576) {
              content = "[file too large]";
            } else {
              content = await fs.readFile(fullPath, "utf-8");
            }
          } else {
            content = "[binary file]";
          }
          results.push({ path: relativePath, content, isDirectory: false });
        }
      }
    };

    await walk(baseDir, 0);
    return results;
  }

  static async listLocalRepoFiles(
    skillName: string,
  ): Promise<SkillLocalFileTreeEntry[]> {
    this.validateSkillName(skillName);
    await this.init();
    const absolutePath = path.join(this.skillsDir, skillName);
    return this.listLocalRepoFilesByPath(absolutePath);
  }

  static async listLocalRepoFilesByPath(
    absolutePath: string,
  ): Promise<SkillLocalFileTreeEntry[]> {
    const { realBasePath } = await this.resolveRepoBasePath(absolutePath);

    if (!(await this.fileExists(absolutePath))) {
      return [];
    }

    const baseDir = absolutePath;
    const results: SkillLocalFileTreeEntry[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > SkillInstaller.MAX_WALK_DEPTH) return;
      if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= SkillInstaller.MAX_WALK_FILES) return;

        const fullPath = path.join(dir, entry.name);
        const lstat = await fs.lstat(fullPath);
        if (lstat.isSymbolicLink()) {
          continue;
        }
        const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
        if (!isPathWithin(realBasePath, realFullPath)) {
          continue;
        }
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          results.push({ path: relativePath, isDirectory: true });
          await walk(fullPath, depth + 1);
        } else {
          const stat = await fs.stat(fullPath);
          results.push({
            path: relativePath,
            isDirectory: false,
            size: stat.size,
          });
        }
      }
    };

    await walk(baseDir, 0);
    return results;
  }

  static async readLocalRepoFile(
    skillName: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> {
    this.validateSkillName(skillName);
    await this.init();
    const absolutePath = path.join(this.skillsDir, skillName);
    return this.readLocalRepoFileByPath(absolutePath, relativePath);
  }

  static async readLocalRepoFileByPath(
    absoluteBasePath: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> {
    const { fullPath, realBasePath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      relativePath,
    );
    if (!(await this.fileExists(fullPath))) {
      return null;
    }

    const lstat = await fs.lstat(fullPath);
    if (lstat.isSymbolicLink()) {
      throw new Error("Symlinked files are not allowed in managed repos");
    }
    const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
    if (!isPathWithin(realBasePath, realFullPath)) {
      throw new Error("Repo file path resolves outside managed repo");
    }
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return { path: relativePath, content: "", isDirectory: true };
    }

    const ext = path.extname(relativePath).toLowerCase();
    let content: string;
    if (this.TEXT_EXTENSIONS.has(ext)) {
      if (stat.size > 1_048_576) {
        content = "[file too large]";
      } else {
        content = await fs.readFile(fullPath, "utf-8");
      }
    } else {
      content = "[binary file]";
    }

    return {
      path: relativePath,
      content,
      isDirectory: false,
    };
  }

  /**
   * 写入单个文件到本地 skill 仓库。
   *
   * Intermediate directories are created automatically.
   * 自动创建中间目录。
   */
  static async writeLocalRepoFile(
    skillName: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    this.validateRelativePath(relativePath);
    await this.init();

    const fullPath = path.join(this.skillsDir, skillName, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Write a single file using an absolute base directory path.
   * Mirrors writeLocalRepoFile but accepts the resolved repo path directly
   * (e.g. for skills with a custom local_repo_path).
   * 通过绝对基目录路径写入单个文件（供自定义 local_repo_path 的技能使用）。
   */
  static async writeLocalRepoFileByPath(
    absoluteBasePath: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    await this.init();
    const { fullPath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      relativePath,
      { ensureBaseExists: true },
    );
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Delete a single file from the local skill repo.
   * 从本地 skill 仓库删除单个文件。
   */
  static async deleteLocalRepoFile(
    skillName: string,
    relativePath: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    this.validateRelativePath(relativePath);

    const fullPath = path.join(this.skillsDir, skillName, relativePath);
    await fs.rm(fullPath, { force: true });
  }

  /**
   * Delete a single file using an absolute base directory path.
   * 通过绝对基目录路径删除单个文件。
   */
  static async deleteLocalRepoFileByPath(
    absoluteBasePath: string,
    relativePath: string,
  ): Promise<void> {
    const { fullPath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      relativePath,
    );
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  /**
   * Create a sub-directory inside the local skill repo.
   * 在本地 skill 仓库目录下创建子目录。
   */
  static async createLocalRepoDir(
    skillName: string,
    relativePath: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    this.validateRelativePath(relativePath);
    await this.init();

    const fullPath = path.join(this.skillsDir, skillName, relativePath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * Create a sub-directory using an absolute base directory path.
   * 通过绝对基目录路径创建子目录。
   */
  static async createLocalRepoDirByPath(
    absoluteBasePath: string,
    relativePath: string,
  ): Promise<void> {
    await this.init();
    const { fullPath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      relativePath,
      { ensureBaseExists: true },
    );
    await fs.mkdir(fullPath, { recursive: true });
  }

  static async renameLocalRepoPathByPath(
    absoluteBasePath: string,
    oldRelativePath: string,
    newRelativePath: string,
  ): Promise<void> {
    const { fullPath: oldFullPath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      oldRelativePath,
    );
    const { fullPath: newFullPath } = await this.resolveRepoTargetPath(
      absoluteBasePath,
      newRelativePath,
      { ensureBaseExists: true },
    );

    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    await fs.rename(oldFullPath, newFullPath);
  }

  /**
   * Return the absolute path of a skill's local repo directory.
   * 返回 skill 本地仓库目录的绝对路径。
   */
  static getLocalRepoPath(skillName: string): string {
    this.validateSkillName(skillName);
    return path.join(this.skillsDir, skillName);
  }

  static async renameManagedLocalRepo(
    oldSkillName: string,
    newSkillName: string,
    existingRepoPath?: string | null,
  ): Promise<string | null> {
    this.validateSkillName(oldSkillName);
    this.validateSkillName(newSkillName);
    await this.init();

    if (existingRepoPath && !this.isManagedRepoPath(existingRepoPath)) {
      return existingRepoPath;
    }

    const sourcePath = existingRepoPath
      ? path.resolve(existingRepoPath)
      : this.getLocalRepoPath(oldSkillName);
    const targetPath = this.getLocalRepoPath(newSkillName);

    if (sourcePath === targetPath) {
      return targetPath;
    }

    if (!(await this.fileExists(sourcePath))) {
      return targetPath;
    }

    if (await this.fileExists(targetPath)) {
      throw new Error(`Local repo already exists for skill: ${newSkillName}`);
    }

    await fs.rename(sourcePath, targetPath);
    return targetPath;
  }

  /**
   * Delete the local repo directory for a single skill.
   * 删除单个 skill 的本地仓库目录。
   *
   * If the directory does not exist, this method silently succeeds.
   * 如果目录不存在，则静默成功。
   */
  static async deleteLocalRepo(skillName: string): Promise<void> {
    this.validateSkillName(skillName);
    const dirPath = path.join(this.skillsDir, skillName);

    if (await this.fileExists(dirPath)) {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  }

  /**
   * Delete a local repo directory given its absolute path.
   * Applies path containment validation before deletion to prevent traversal.
   * 根据绝对路径删除本地仓库目录，删除前进行路径包含性校验，防止目录遍历攻击。
   *
   * If the directory does not exist, this method silently succeeds.
   * 如果目录不存在，则静默成功。
   */
  static async deleteRepoByPath(absolutePath: string): Promise<void> {
    const skillsDir = this.skillsDir;
    const resolved = path.resolve(absolutePath);
    const relative = path.relative(skillsDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      console.error(
        `[Security] Path traversal blocked on delete: ${absolutePath}`,
      );
      throw new Error(
        "Path traversal detected: path is outside skills directory",
      );
    }

    if (await this.fileExists(resolved)) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }

  /**
   * Delete all local repo directories and recreate an empty skills root.
   * 删除所有本地仓库目录并重新创建空的 skills 根目录。
   *
   * If the skills root does not exist, it is created.
   * 如果 skills 根目录不存在，则创建它。
   */
  static async deleteAllLocalRepos(): Promise<void> {
    const skillsRoot = this.skillsDir;

    if (await this.fileExists(skillsRoot)) {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }

    await fs.mkdir(skillsRoot, { recursive: true });
  }

  /**
   * Replace all files in a local repo using an absolute repo path.
   * Deletes the existing repo directory, recreates it, then writes the snapshot.
   * 使用绝对仓库路径完整替换本地仓库内容：先删除目录，再重建并写入快照。
   */
  static async replaceLocalRepoFilesByPath(
    absoluteBasePath: string,
    filesSnapshot: { relativePath: string; content: string }[],
  ): Promise<void> {
    const { resolvedBasePath } = await this.resolveRepoBasePath(
      absoluteBasePath,
      { ensureExists: true },
    );

    await fs.rm(resolvedBasePath, { recursive: true, force: true });
    await fs.mkdir(resolvedBasePath, { recursive: true });
    const realBasePath = await fs
      .realpath(resolvedBasePath)
      .catch(() => resolvedBasePath);

    for (const file of filesSnapshot) {
      this.validateRelativePath(file.relativePath);
      const fullPath = path.resolve(resolvedBasePath, file.relativePath);
      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      if (
        !isPathWithin(realBasePath, fullPath) &&
        !isPathWithin(realBasePath, realFullPath)
      ) {
        throw new Error("Path traversal detected while restoring repo files");
      }
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, "utf-8");
    }
  }

  /**
   * Export skill as SKILL.md format (Claude compatible)
   * 导出技能为 SKILL.md 格式（兼容 Claude）
   */
  static exportAsSkillMd(skill: {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    instructions?: string;
  }): string {
    const yamlStr = (v: string) =>
      /[:#\[\]{},\n\r]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
    // Build YAML frontmatter
    const frontmatter: string[] = ["---"];
    frontmatter.push(`name: ${yamlStr(skill.name)}`);
    if (skill.description) {
      frontmatter.push(`description: ${yamlStr(skill.description)}`);
    }
    if (skill.version) {
      frontmatter.push(`version: ${yamlStr(skill.version)}`);
    }
    if (skill.author) {
      frontmatter.push(`author: ${yamlStr(skill.author)}`);
    }
    if (skill.tags && skill.tags.length > 0) {
      frontmatter.push(`tags: [${skill.tags.map(yamlStr).join(", ")}]`);
    }
    frontmatter.push("compatibility: prompthub");
    frontmatter.push("---");
    frontmatter.push("");

    // Add instructions content
    const content = skill.instructions || "";

    return frontmatter.join("\n") + content;
  }

  /**
   * Export skill as JSON (for backup/sharing)
   * 导出技能为 JSON 格式（用于备份/分享）
   */
  static exportAsJson(skill: {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    instructions?: string;
    protocol_type?: string;
    icon_url?: string;
    icon_emoji?: string;
    icon_background?: string;
  }): string {
    const exportData = {
      name: skill.name,
      description: skill.description || "",
      version: skill.version || "1.0.0",
      author: skill.author || "",
      tags: skill.tags || [],
      instructions: skill.instructions || "",
      protocol_type: skill.protocol_type || "skill",
      icon_url: skill.icon_url || "",
      icon_emoji: skill.icon_emoji || "",
      icon_background: skill.icon_background || "",
      exported_at: new Date().toISOString(),
      format_version: "1.0",
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import skill from JSON
   * 从 JSON 导入技能
   */
  static async importFromJson(
    jsonContent: string,
    db: SkillDB,
  ): Promise<string> {
    try {
      const data = JSON.parse(jsonContent) as Record<string, unknown>;
      const sanitized = sanitizeImportedSkillDraft(
        {
          name: data.name,
          description: data.description,
          version: data.version,
          author: data.author,
          tags: data.tags,
          instructions: data.instructions,
          icon_url: data.icon_url,
          icon_emoji: data.icon_emoji,
          icon_background: data.icon_background,
          category: data.category,
          prerequisites: data.prerequisites,
          compatibility: data.compatibility,
          protocol_type: data.protocol_type,
        },
        { defaultTags: ["imported"] },
      );
      const name = sanitized.name?.trim();
      if (!name) {
        throw new Error("Invalid skill JSON: missing name");
      }

      const skill = db.create({
        name,
        description: sanitized.description,
        version: sanitized.version,
        author: sanitized.author,
        instructions: sanitized.instructions,
        content: sanitized.instructions,
        protocol_type: sanitized.protocol_type,
        tags: sanitized.tags,
        is_favorite: false,
        icon_url: sanitized.icon_url,
        icon_emoji: sanitized.icon_emoji,
        icon_background: sanitized.icon_background,
        category: sanitized.category,
        prerequisites: sanitized.prerequisites,
        compatibility: sanitized.compatibility,
      });

      return skill.id;
    } catch (error) {
      console.error("Failed to import skill from JSON:", error);
      throw error;
    }
  }

  // ==================== SKILL.md Multi-Platform Installation ====================
  // ==================== SKILL.md 多平台安装功能 ====================

  /**
   * Get list of supported platforms
   * 获取支持的平台列表
   */
  static getSupportedPlatforms(): SkillPlatform[] {
    return SKILL_PLATFORMS;
  }

  /**
   * Detect which AI tools are installed on the system
   * 检测系统上安装了哪些 AI 工具
   */
  static async detectInstalledPlatforms(): Promise<string[]> {
    const installed: string[] = [];

    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      // Check if the parent directory exists (e.g., ~/.claude exists means Claude Code is installed)
      // 检查父目录是否存在（如 ~/.claude 存在说明安装了 Claude Code）
      const parentDir = path.dirname(skillsDir);

      if (await this.fileExists(parentDir)) {
        installed.push(platform.id);
      }
    }

    return installed;
  }

  /**
   * Install SKILL.md to a specific platform
   * 安装 SKILL.md 到指定平台
   *
   * Also ensures the canonical copy in the local repo exists.
   * 同时确保本地仓库中的规范副本存在。
   */
  static async installSkillMd(
    skillName: string,
    skillMdContent: string,
    platformId: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    const platform = SKILL_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    // Ensure the canonical copy exists in local repo
    // 确保本地仓库中的规范副本存在
    await this.saveContentToLocalRepo(skillName, skillMdContent);

    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, skillName);

    try {
      // Create skill directory
      // 创建技能目录
      await fs.mkdir(skillDir, { recursive: true });

      // Write SKILL.md file
      // 写入 SKILL.md 文件
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        skillMdContent,
        "utf-8",
      );

      console.log(
        `Successfully installed SKILL.md for "${skillName}" to ${platform.name} at ${skillDir}`,
      );
    } catch (error) {
      console.error(`Failed to install SKILL.md to ${platform.name}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall SKILL.md from a specific platform
   * 从指定平台卸载 SKILL.md
   */
  static async uninstallSkillMd(
    skillName: string,
    platformId: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    const platform = SKILL_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, skillName);

    try {
      // Check if skill directory exists
      // 检查技能目录是否存在
      if (await this.fileExists(skillDir)) {
        await fs.rm(skillDir, { recursive: true, force: true });
        console.log(
          `Successfully uninstalled SKILL.md for "${skillName}" from ${platform.name}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to uninstall SKILL.md from ${platform.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get SKILL.md installation status across all platforms
   * 获取 SKILL.md 在所有平台的安装状态
   */
  static async getSkillMdInstallStatus(
    skillName: string,
  ): Promise<Record<string, boolean>> {
    this.validateSkillName(skillName);
    const status: Record<string, boolean> = {};

    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      const skillMdPath = path.join(skillsDir, skillName, "SKILL.md");

      status[platform.id] = await this.fileExists(skillMdPath);
    }

    return status;
  }

  /**
   * Install SKILL.md to a platform via symlink (soft install)
   * 通过符号链接安装 SKILL.md 到平台（软安装）
   *
   * Creates a symlink from the platform skills directory to the
   * central PromptHub skills directory, so all platforms share
   * the same source file and updates propagate automatically.
   */
  static async installSkillMdSymlink(
    skillName: string,
    skillMdContent: string,
    platformId: string,
  ): Promise<void> {
    this.validateSkillName(skillName);
    const platform = SKILL_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    await this.init();

    // 1. Write the canonical copy into PromptHub's own skills dir
    const canonicalDir = path.join(this.skillsDir, skillName);
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.writeFile(
      path.join(canonicalDir, "SKILL.md"),
      skillMdContent,
      "utf-8",
    );

    // 2. Create a symlink from the platform dir → canonical dir
    const platformSkillsDir = getPlatformSkillsDir(platform);
    const platformSkillDir = path.join(platformSkillsDir, skillName);

    try {
      // Ensure parent exists
      await fs.mkdir(platformSkillsDir, { recursive: true });

      // Remove existing target if present (file, dir, or broken symlink)
      try {
        const stat = await fs.lstat(platformSkillDir);
        if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
          await fs.rm(platformSkillDir, { recursive: true, force: true });
        }
      } catch (error: unknown) {
        if (getErrorCode(error) !== "ENOENT") throw error;
      }

      // Create directory symlink
      await fs.symlink(canonicalDir, platformSkillDir, "dir");
      console.log(
        `Symlinked "${skillName}" → ${platform.name}: ${canonicalDir} → ${platformSkillDir}`,
      );
    } catch (error) {
      console.error(
        `Failed to create symlink for "${skillName}" to ${platform.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch remote SKILL.md content from a URL
   * 从远程 URL 获取 SKILL.md 内容
   */
  static async fetchRemoteContent(url: string): Promise<string> {
    try {
      return await fetchRemoteText(url);
    } catch (error) {
      console.error("Failed to fetch remote content from remote URL:", error);
      throw error;
    }
  }
}

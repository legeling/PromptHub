import { materializePortablePlugins } from "./portable-plugin-snapshot";
import { materializePortableGenerations } from "./portable-generation-snapshot";
import { materializePortableRules } from "./portable-rule-snapshot";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  createPortableSnapshot,
  readPortableSnapshot,
  exportMcpStorageSnapshot,
  MCP_STORAGE_SNAPSHOT_FILE,
  mcpHistoryPath,
  readMcpHistoricalDocument,
  type PortableSnapshotGeneratedFile,
  type PortableSnapshotScope,
} from "@prompthub/core";
import {
  DatabaseAdapter,
  McpDB,
  createOwnedTemporaryDatabasePath,
  cleanupOwnedTemporaryDatabase,
} from "@prompthub/db";
import { Zip, ZipDeflate } from "fflate";
import { materializePortableAgentProviders } from "./portable-agent-provider-snapshot";

const STREAM_BUFFER_BYTES = 1024 * 1024;

export interface PortableZipScope {
  prompts: boolean;
  versions: boolean;
  images: boolean;
  videos?: boolean;
  skills: boolean;
  rules?: boolean;
  mcp?: boolean;
  plugins?: boolean;
  agents?: boolean;
  generations?: boolean;
  config: boolean;
  aiConfigJson?: string;
  settingsJson?: string;
  exportJson?: string;
}

export interface PortableZipSourcePaths {
  rootPath: string;
  cachePath: string;
  canonicalCheckpointPath?: string;
  promptsPath: string;
  versionsPath: string;
  skillsPath: string;
  rulesPath: string;
  ruleDatabasePath?: string;
  pluginsPath: string;
  pluginDatabasePath?: string;
  mcpPath?: string;
  mcpDatabasePath?: string;
  agentProviderDatabasePath?: string;
  generationDatabasePath?: string;
  imagesPath: string;
  videosPath: string;
}

export function isCompleteCanonicalPortableScope(
  scope: PortableZipScope,
): boolean {
  return Boolean(
    scope.prompts &&
    scope.versions &&
    scope.images &&
    scope.videos &&
    scope.skills &&
    scope.rules &&
    scope.mcp &&
    scope.plugins &&
    scope.agents &&
    scope.generations,
  );
}

function addScope(
  scopes: PortableSnapshotScope[],
  selected: boolean | undefined,
  id: string,
  sourcePath: string,
  archivePath: string,
): void {
  if (!selected || !fs.existsSync(sourcePath)) return;
  scopes.push({ id, sourcePath, archivePath });
}

function generatedFile(
  archivePath: string,
  content: string | undefined,
  scope: string,
): PortableSnapshotGeneratedFile | null {
  return typeof content === "string"
    ? { archivePath, content: Buffer.from(content, "utf8"), scope }
    : null;
}

function streamFileToZip(
  zip: Zip,
  archivePath: string,
  sourcePath: string,
): void {
  const file = new ZipDeflate(archivePath, { level: 1 });
  zip.add(file);
  const descriptor = fs.openSync(sourcePath, "r");
  const buffer = Buffer.allocUnsafe(STREAM_BUFFER_BYTES);
  try {
    let bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
    if (bytesRead === 0) {
      file.push(new Uint8Array(), true);
      return;
    }
    while (bytesRead > 0) {
      const chunk = Uint8Array.from(buffer.subarray(0, bytesRead));
      const nextBytesRead = fs.readSync(
        descriptor,
        buffer,
        0,
        buffer.length,
        null,
      );
      file.push(chunk, nextBytesRead === 0);
      bytesRead = nextBytesRead;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

async function writeSnapshotZip(
  snapshotPath: string,
  destinationPath: string,
): Promise<void> {
  const snapshot = readPortableSnapshot(snapshotPath);
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          if (chunk.length > 0) fs.writeSync(descriptor, chunk);
          if (final) resolve();
        } catch (writeError) {
          zip.terminate();
          reject(writeError);
        }
      });
      try {
        for (const entry of snapshot.manifest.entries) {
          streamFileToZip(
            zip,
            entry.path,
            path.join(snapshotPath, ...entry.path.split("/")),
          );
        }
        streamFileToZip(
          zip,
          "portable-manifest.json",
          path.join(snapshotPath, "portable-manifest.json"),
        );
        zip.end();
      } catch (error) {
        zip.terminate();
        reject(error);
      }
    });
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  fs.closeSync(descriptor);
  try {
    fs.rmSync(destinationPath, { force: true });
    fs.renameSync(temporaryPath, destinationPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export async function createPortableSnapshotZip(options: {
  destinationPath: string;
  sourcePaths: PortableZipSourcePaths;
  scope: PortableZipScope;
}): Promise<{ filePath: string; consistencyId: string }> {
  const scopes: PortableSnapshotScope[] = [];
  const includeCanonical = Boolean(options.sourcePaths.canonicalCheckpointPath);
  if (includeCanonical && !isCompleteCanonicalPortableScope(options.scope)) {
    throw new Error(
      "Canonical checkpoint can only be attached to a complete durable export",
    );
  }
  addScope(
    scopes,
    includeCanonical,
    "canonical",
    path.join(options.sourcePaths.canonicalCheckpointPath ?? "", "canonical"),
    "canonical",
  );
  addScope(
    scopes,
    options.scope.prompts,
    "prompts",
    options.sourcePaths.promptsPath,
    "data/prompts",
  );
  addScope(
    scopes,
    options.scope.versions,
    "versions",
    options.sourcePaths.versionsPath,
    "data/legacy-versions",
  );
  addScope(
    scopes,
    options.scope.skills,
    "skills",
    options.sourcePaths.skillsPath,
    "data/skills",
  );
  addScope(
    scopes,
    options.scope.mcp &&
      !options.sourcePaths.mcpDatabasePath &&
      !options.sourcePaths.canonicalCheckpointPath,
    "mcp",
    options.sourcePaths.mcpPath ?? "",
    "data/mcp",
  );
  addScope(
    scopes,
    options.scope.images,
    "images",
    options.sourcePaths.imagesPath,
    "data/assets/images",
  );
  addScope(
    scopes,
    options.scope.videos,
    "videos",
    options.sourcePaths.videosPath,
    "data/assets/videos",
  );
  const generatedFiles = [
    generatedFile(
      "canonical-checkpoint.json",
      includeCanonical
        ? fs.readFileSync(
            path.join(
              options.sourcePaths.canonicalCheckpointPath!,
              "checkpoint.json",
            ),
            "utf8",
          )
        : undefined,
      "canonical",
    ),
    generatedFile(
      "config/providers.json",
      options.scope.aiConfigJson,
      "configuration",
    ),
    generatedFile(
      "config/app.json",
      options.scope.settingsJson,
      "configuration",
    ),
    generatedFile(
      "import-with-prompthub.json",
      options.scope.exportJson,
      "logical",
    ),
  ].filter((entry): entry is PortableSnapshotGeneratedFile => entry !== null);
  const operationId = crypto.randomUUID();
  const snapshotPath = path.join(
    options.sourcePaths.cachePath,
    "portable-snapshots",
    operationId,
  );
  let ownedMcpSnapshot: string | null = null;
  const agentStagePath = `${snapshotPath}-agents`;
  const ruleStagePath = `${snapshotPath}-rules`;
  const pluginStagePath = `${snapshotPath}-plugins`;
  const generationStagePath = `${snapshotPath}-generations`;
  try {
    if (options.scope.plugins) {
      let source: string;
      if (options.sourcePaths.canonicalCheckpointPath) source = path.join(options.sourcePaths.canonicalCheckpointPath, "canonical", "plugins");
      else {
        if (!options.sourcePaths.pluginDatabasePath) throw new Error("Plugin export requires its authoritative SQLite database");
        materializePortablePlugins(options.sourcePaths.pluginDatabasePath, options.sourcePaths.rootPath, pluginStagePath);
        source = pluginStagePath;
      }
      addScope(scopes, true, "plugins", source, "data/plugins");
    }
    if (options.scope.generations) {
      let source: string;
      if (options.sourcePaths.canonicalCheckpointPath) source = path.join(options.sourcePaths.canonicalCheckpointPath, "canonical");
      else {
        if (!options.sourcePaths.generationDatabasePath) throw new Error("Generation export requires its authoritative SQLite database");
        materializePortableGenerations(options.sourcePaths.generationDatabasePath, options.sourcePaths.rootPath, generationStagePath);
        source = generationStagePath;
      }
      addScope(scopes, true, "generations", path.join(source, "generations"), "data/generations");
      addScope(scopes, true, "generation-objects", path.join(source, "assets", "objects"), "data/assets/objects");
    }
    if (options.scope.rules) {
      let rulePath: string;
      if (options.sourcePaths.canonicalCheckpointPath)
        rulePath = path.join(
          options.sourcePaths.canonicalCheckpointPath,
          "canonical",
          "rules",
        );
      else {
        if (!options.sourcePaths.ruleDatabasePath)
          throw new Error(
            "Rule export requires its authoritative SQLite database",
          );
        materializePortableRules(
          options.sourcePaths.ruleDatabasePath,
          ruleStagePath,
        );
        rulePath = ruleStagePath;
      }
      addScope(scopes, true, "rules", rulePath, "data/rules");
    }
    if (options.scope.agents) {
      let agentPath: string;
      if (options.sourcePaths.canonicalCheckpointPath) {
        agentPath = path.join(
          options.sourcePaths.canonicalCheckpointPath,
          "canonical",
          "agents",
        );
      } else {
        if (!options.sourcePaths.agentProviderDatabasePath)
          throw new Error(
            "Agent provider export requires its authoritative SQLite database",
          );
        materializePortableAgentProviders(
          options.sourcePaths.agentProviderDatabasePath,
          agentStagePath,
        );
        agentPath = agentStagePath;
      }
      addScope(scopes, true, "agents", agentPath, "data/agents");
    }
    const checkpointMcp = options.sourcePaths.canonicalCheckpointPath
      ? path.join(
          options.sourcePaths.canonicalCheckpointPath,
          "canonical",
          "mcp",
          MCP_STORAGE_SNAPSHOT_FILE,
        )
      : null;
    let mcpSnapshot =
      checkpointMcp && fs.existsSync(checkpointMcp) ? checkpointMcp : null;
    if (
      options.scope.mcp &&
      !mcpSnapshot &&
      options.sourcePaths.mcpDatabasePath
    ) {
      const parent = path.join(
        options.sourcePaths.cachePath,
        "portable-snapshots",
      );
      fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      ownedMcpSnapshot = createOwnedTemporaryDatabasePath(
        parent,
        "mcp-snapshot",
      );
      const database = new DatabaseAdapter(
        options.sourcePaths.mcpDatabasePath,
        { readOnly: true },
      );
      try {
        exportMcpStorageSnapshot(ownedMcpSnapshot, { database });
      } finally {
        database.close();
      }
      mcpSnapshot = ownedMcpSnapshot;
    }
    const mcpFiles = [];
    if (options.scope.mcp && mcpSnapshot) {
      const historyRoot =
        mcpSnapshot === checkpointMcp
          ? path.join(
              options.sourcePaths.canonicalCheckpointPath!,
              "canonical",
              "mcp",
            )
          : options.sourcePaths.mcpPath;
      if (!historyRoot)
        throw new Error("MCP snapshot history source is missing");
      const snapshotDatabase = new DatabaseAdapter(mcpSnapshot, {
        readOnly: true,
      });
      try {
        const records = new McpDB(snapshotDatabase);
        for (const meta of records.historicalContents()) {
          const version = records.version(meta.serverId, meta.version);
          if (!version)
            throw new Error("MCP snapshot version metadata is missing");
          readMcpHistoricalDocument(version, historyRoot);
          mcpFiles.push({
            sourcePath: mcpHistoryPath(meta.contentPath, historyRoot),
            archivePath: `data/mcp/${meta.contentPath}`,
            scope: "mcp",
          });
        }
      } finally {
        snapshotDatabase.close();
      }
      mcpFiles.push({
        sourcePath: mcpSnapshot,
        archivePath: `data/mcp/${MCP_STORAGE_SNAPSHOT_FILE}`,
        scope: "mcp",
      });
    }
    const snapshot = createPortableSnapshot({
      sourceRoot: options.sourcePaths.rootPath,
      destinationPath: snapshotPath,
      scopes,
      declaredScopes: [
        options.scope.prompts ? "prompts" : null,
        options.scope.versions ? "versions" : null,
        options.scope.images ? "images" : null,
        options.scope.videos ? "videos" : null,
        options.scope.skills ? "skills" : null,
        options.scope.rules ? "rules" : null,
        options.scope.mcp ? "mcp" : null,
        options.scope.plugins ? "plugins" : null,
        options.scope.agents ? "agents" : null,
        options.scope.generations ? "generations" : null,
      ].filter((scope): scope is string => scope !== null),
      generatedFiles,
      sourceFiles: mcpFiles,
      omissions: [
        "secrets",
        "device-bound-credentials",
        "cache",
        "logs",
        "browser-runtime",
        "recovery-artifacts",
      ],
      operationId,
    });
    await writeSnapshotZip(
      snapshot.path,
      path.resolve(options.destinationPath),
    );
    return {
      filePath: path.resolve(options.destinationPath),
      consistencyId: snapshot.manifest.consistencyId,
    };
  } finally {
    fs.rmSync(pluginStagePath, { recursive: true, force: true });
    fs.rmSync(generationStagePath, { recursive: true, force: true });
    fs.rmSync(ruleStagePath, { recursive: true, force: true });
    fs.rmSync(agentStagePath, { recursive: true, force: true });
    if (ownedMcpSnapshot) cleanupOwnedTemporaryDatabase(ownedMcpSnapshot);
    fs.rmSync(snapshotPath, { recursive: true, force: true });
  }
}

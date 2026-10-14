import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { McpDB } from "@prompthub/db";
import type { McpStoredVersion } from "@prompthub/shared/types/mcp-storage";
import { getDataDir } from "./runtime-paths";
import {
  computeMcpSemanticDigest,
  parseMcpVersionDocument,
  MCP_RESOURCE_MAX_DOCUMENT_BYTES,
  type McpServerVersionResourceDocument,
} from "./mcp-resource-schema";

export function mcpHistoryPath(
  relative: string,
  root = path.join(getDataDir(), "mcp"),
): string {
  if (
    !/^[^/\\\u0000-\u001f]+\/versions\/\d{6}(?:-[a-f0-9]{64})?\.json$/u.test(
      relative,
    ) ||
    relative.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("MCP historical content path is invalid");
  const destination = path.join(root, relative);
  for (
    let item = destination;
    item !== path.dirname(root);
    item = path.dirname(item)
  ) {
    if (fs.existsSync(item) && fs.lstatSync(item).isSymbolicLink())
      throw new Error("MCP historical content path contains a symlink");
  }
  return destination;
}
export function readMcpHistoricalDocument(
  meta: McpStoredVersion,
  historyRoot?: string,
): McpServerVersionResourceDocument {
  const filePath = mcpHistoryPath(meta.contentPath, historyRoot);
  if (
    !fs.statSync(filePath).isFile() ||
    fs.statSync(filePath).size > MCP_RESOURCE_MAX_DOCUMENT_BYTES
  )
    throw new Error("MCP historical content size or file type is invalid");
  const content = fs.readFileSync(filePath);
  if (createHash("sha256").update(content).digest("hex") !== meta.contentSha256)
    throw new Error("MCP historical content integrity check failed");
  let value: unknown;
  try {
    value = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("MCP historical content JSON is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("MCP historical content is invalid");
  const document = parseMcpVersionDocument(value as Record<string, unknown>); // JSON object checked at the file boundary.
  if (
    document.server.id !== meta.serverId ||
    document.version !== meta.version ||
    document.semanticDigest !== meta.semanticDigest ||
    computeMcpSemanticDigest(document.server, meta.secretReferences) !==
      meta.semanticDigest
  )
    throw new Error("MCP historical content does not match SQLite metadata");
  return {
    ...document,
    note: meta.note,
    restoredFromVersion: meta.restoredFromVersion,
  };
}

export function reconcileMcpHistoricalContents(
  records: McpDB,
  selectedIds?: ReadonlySet<string>,
  root = path.join(getDataDir(), "mcp"),
): void {
  if (!fs.existsSync(root)) return;
  let preservedUnknownContent = false;
  records.transaction(() => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || (selectedIds && !selectedIds.has(entry.name)))
        continue;
      const directory = path.join(root, entry.name),
        versions = path.join(directory, "versions");
      if (
        !fs.existsSync(versions) ||
        fs.existsSync(path.join(directory, "manifest.json"))
      )
        continue;
      for (const file of fs.readdirSync(versions)) {
        if (!/^\d{6}(?:-[a-f0-9]{64})?\.json$/u.test(file)) {
          preservedUnknownContent = true;
          continue;
        }
        const relative = `${entry.name}/versions/${file}`;
        const filePath = mcpHistoryPath(relative, root);
        if (records.hasContentPath(relative)) continue;
        if (!isOwnedHistoricalContent(filePath, entry.name, file)) {
          preservedUnknownContent = true;
          continue;
        }
        fs.unlinkSync(filePath);
      }
      if (fs.readdirSync(versions).length === 0) fs.rmdirSync(versions);
      if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
    }
  });
  if (preservedUnknownContent)
    console.warn(
      "MCP history cleanup preserved unrecognized unreferenced files",
    );
}

function isOwnedHistoricalContent(
  filePath: string,
  serverId: string,
  fileName: string,
): boolean {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > MCP_RESOURCE_MAX_DOCUMENT_BYTES)
    return false;
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const document = parseMcpVersionDocument(value as Record<string, unknown>); // Checked object at the historical file boundary.
    return (
      document.server.id === serverId &&
      fileName.startsWith(String(document.version).padStart(6, "0"))
    );
  } catch {
    // Ownership is not established for malformed content; keep it and report above.
    return false;
  }
}

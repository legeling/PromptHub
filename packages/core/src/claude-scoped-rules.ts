import fs from "node:fs";
import path from "node:path";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { CustomRuleFileId, RuleRecord } from "@prompthub/shared/types";
import type {
  ExtraGlobalRuleTemplate,
  RulesWorkspaceServiceDeps,
} from "./rules-workspace-support";

const PREFIX = "custom:claude-rule:";

export function claudeScopedRuleRelativePath(id: string): string | null {
  if (!id.startsWith(PREFIX)) return null;
  const encoded = id.slice(PREFIX.length);
  const relative = Buffer.from(encoded, "base64url").toString("utf8");
  if (
    Buffer.from(relative).toString("base64url") !== encoded ||
    !relative.endsWith(".md") ||
    relative.includes("\0") ||
    relative.includes("\\") ||
    path.isAbsolute(relative) ||
    relative
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error("Invalid Claude scoped Rule identity");
  return relative;
}

export function claudeScopedRuleTarget(
  id: string,
  deps: RulesWorkspaceServiceDeps,
): string | null {
  const relative = claudeScopedRuleRelativePath(id);
  if (!relative) return null;
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Claude platform is missing");
  const root = path.join(deps.getPlatformRootDir(platform), "rules");
  const target = path.join(root, relative);
  if (fs.existsSync(root)) {
    const realRoot = fs.realpathSync(root);
    let existing = target;
    while (!fs.existsSync(existing) && existing !== root)
      existing = path.dirname(existing);
    const realRelative = path.relative(realRoot, fs.realpathSync(existing));
    if (
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    )
      throw new Error("Claude scoped Rule escapes its directory");
  }
  return target;
}

export function claudeScopedRuleTemplate(
  id: CustomRuleFileId,
): ExtraGlobalRuleTemplate | null {
  const relative = claudeScopedRuleRelativePath(id);
  if (!relative) return null;
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Claude platform is missing");
  return {
    id,
    platformId: "claude",
    platformName: platform.name,
    platformIcon: platform.icon,
    platformDescription: "",
    name: `rules/${relative}`,
    description: "",
    group: "assistant",
  };
}

export function discoverClaudeScopedRules(
  deps: RulesWorkspaceServiceDeps,
  records: RuleRecord[],
): ExtraGlobalRuleTemplate[] {
  const platform = getPlatformById("claude");
  if (!platform) return [];
  const root = path.join(deps.getPlatformRootDir(platform), "rules");
  const ids = new Set<CustomRuleFileId>();
  for (const record of records) {
    if (record.id.startsWith(PREFIX)) {
      const relative = claudeScopedRuleRelativePath(record.id);
      if (relative)
        ids.add(`${PREFIX}${Buffer.from(relative).toString("base64url")}`);
    }
  }
  const directories = [root];
  while (directories.length) {
    const directory = directories.pop();
    if (!directory || !fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      // Do not traverse links into another user's configuration or create directories during discovery.
      if (entry.isDirectory()) directories.push(file);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const relative = path.relative(root, file).split(path.sep).join("/");
        ids.add(`${PREFIX}${Buffer.from(relative).toString("base64url")}`);
      }
    }
  }
  return [...ids]
    .map((id) => claudeScopedRuleTemplate(id))
    .filter(
      (template): template is ExtraGlobalRuleTemplate => template !== null,
    );
}

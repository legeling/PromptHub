import { applyEdits, modify } from "jsonc-parser";
import {
  getAgentExtensionCapability,
  type AgentExtensionCapability,
} from "@prompthub/shared/constants/agent-extension-capabilities";
import {
  extensionJsonObject as jsonObject,
  validateExtensionHooks,
  validateExtensionSubagent,
} from "./agent-extension-validation";
import type {
  AgentExtensionDocument,
  AgentExtensionTarget,
} from "@prompthub/shared/types";
import type {
  AgentConfigContext,
  AgentUserConfigFileService,
} from "./agent-user-config-files";

function capability(agentId: string): AgentExtensionCapability {
  const value = getAgentExtensionCapability(agentId);
  if (!value) throw new Error("AGENT_EXTENSION_UNSUPPORTED");
  return value;
}

function context(
  rootPath: string,
  target: AgentExtensionTarget,
): AgentConfigContext {
  const platform = capability(target.agentId);
  const parts = target.relativePath.split("/");
  const safe =
    !target.relativePath.includes("\0") &&
    !target.relativePath.includes("\\") &&
    parts.every((part) => part && part !== "." && part !== "..");
  const valid =
    target.kind === "hooks"
      ? platform.hooksPath !== null &&
        [
          platform.hooksPath,
          ...(platform.localHooks ? ["settings.local.json"] : []),
        ].includes(target.relativePath)
      : target.relativePath.startsWith("agents/") &&
        target.relativePath.endsWith(platform.subagentExtension);
  if (!safe || !valid) throw new Error("AGENT_EXTENSION_PATH_INVALID");
  return {
    agentId: target.agentId,
    rootPath,
    relativePaths: [target.relativePath],
  };
}

export interface AgentExtensionsService {
  list(rootPath: string, agentId: string): Promise<string[]>;
  read(
    rootPath: string,
    target: AgentExtensionTarget,
  ): Promise<AgentExtensionDocument>;
  write(
    rootPath: string,
    target: AgentExtensionTarget,
    content: string,
    revision?: string,
  ): Promise<AgentExtensionDocument>;
  remove(
    rootPath: string,
    target: AgentExtensionTarget,
    revision: string,
  ): Promise<void>;
}

export function createAgentExtensionsService(
  files: AgentUserConfigFileService,
): AgentExtensionsService {
  async function read(
    root: string,
    target: AgentExtensionTarget,
  ): Promise<AgentExtensionDocument> {
    const file = await files.read(context(root, target), target.relativePath);
    if (target.kind === "subagent")
      return (
        file ?? { path: target.relativePath, content: "", isDirectory: false }
      );
    const data = jsonObject(file?.content ?? "{}");
    return {
      ...file,
      path: target.relativePath,
      isDirectory: false,
      content: JSON.stringify(
        capability(target.agentId).hooksFormat === "antigravity"
          ? data
          : (data.hooks ?? {}),
        null,
        2,
      ),
    };
  }

  return {
    async list(rootPath: string, agentId: string): Promise<string[]> {
      const platform = capability(agentId);
      return (await files.list({ agentId, rootPath, relativePaths: [] }))
        .filter(
          (file) =>
            !file.isDirectory &&
            file.path.startsWith("agents/") &&
            file.path.endsWith(platform.subagentExtension),
        )
        .map((file) => file.path);
    },
    read,
    async write(
      root: string,
      target: AgentExtensionTarget,
      content: string,
      revision?: string,
    ): Promise<AgentExtensionDocument> {
      if (content.includes("\0"))
        throw new Error("AGENT_EXTENSION_CONTENT_INVALID");
      const config = context(root, target);
      let next = content;
      if (target.kind === "subagent")
        validateExtensionSubagent(target.agentId, content);
      else {
        const hooks = jsonObject(content);
        const platform = capability(target.agentId);
        validateExtensionHooks(hooks, platform.hooksFormat);
        const current = await files.read(config, target.relativePath);
        if (current?.revision !== revision)
          throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
        const original =
          current?.content ??
          (platform.hooksFormat === "cursor" ? '{"version":1}' : "{}");
        const data = jsonObject(original);
        if (
          platform.hooksFormat === "cursor" &&
          (!Number.isInteger(data.version) || Number(data.version) <= 0)
        )
          throw new Error("AGENT_HOOKS_INVALID");
        next = applyEdits(
          original,
          modify(
            original,
            platform.hooksFormat === "antigravity" ? [] : ["hooks"],
            hooks,
            {
              formattingOptions: { insertSpaces: true, tabSize: 2 },
            },
          ),
        );
      }
      await files.write(config, target.relativePath, next, revision);
      return read(root, target);
    },
    async remove(
      root: string,
      target: AgentExtensionTarget,
      revision: string,
    ): Promise<void> {
      if (target.kind !== "subagent")
        throw new Error("AGENT_EXTENSION_PATH_INVALID");
      await files.remove(context(root, target), target.relativePath, revision);
    },
  };
}

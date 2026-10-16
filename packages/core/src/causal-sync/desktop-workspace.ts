import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import type { CoreSettingsStore } from "../settings-store";
import { PluginStorage } from "../plugin-storage";
import { resolveRuntimeStorageContext } from "../runtime-storage-context";
import { composeCausalSyncWorkspace } from "./workspace";
import { PromptCausalSyncWorkspace } from "./prompt-workspace";
import { SkillCausalSyncWorkspace } from "./skill-workspace";
import { RuleCausalSyncWorkspace } from "./rule-workspace";
import { McpCausalSyncWorkspace } from "./mcp-workspace";
import { PluginCausalSyncWorkspace } from "./plugin-workspace";
import { GenerationCausalSyncWorkspace } from "./generation-workspace";
import { AgentProviderCausalSyncWorkspace } from "./agent-provider-workspace";
import { SettingsCausalSyncWorkspace } from "./settings-workspace";
import { MarketplaceCausalSyncWorkspace } from "./marketplace-workspace";
import type { CausalSyncWorkspace } from "./workflow";

/** Complete local desktop inventory. Device bindings and credentials remain local. */
export function createDesktopSyncWorkspace(
  database: DatabaseAdapter.Database,
  root: string,
  settings: CoreSettingsStore,
): CausalSyncWorkspace {
  const context = resolveRuntimeStorageContext(root);
  return composeCausalSyncWorkspace([
    {
      resourceTypes: [
        "prompt",
        "folder",
        "prompt-relation",
        "prompt-output-format",
        "image",
        "video",
      ],
      workspace: new PromptCausalSyncWorkspace(database, root),
    },
    {
      resourceTypes: ["skill"],
      workspace: new SkillCausalSyncWorkspace(database, root),
    },
    {
      resourceTypes: ["rule"],
      workspace: new RuleCausalSyncWorkspace(database, {
        rootPath: root,
        rulesRoot: path.join(context.dataPath, "rule-files"),
        ownerUserId: "",
      }),
    },
    {
      resourceTypes: ["mcp"],
      workspace: new McpCausalSyncWorkspace({
        database,
        storageContext: context,
      }),
    },
    {
      resourceTypes: ["plugin"],
      workspace: new PluginCausalSyncWorkspace(
        new PluginStorage(database, root),
      ),
    },
    {
      resourceTypes: ["generation"],
      workspace: new GenerationCausalSyncWorkspace(database, root),
    },
    {
      resourceTypes: ["agent-provider"],
      workspace: new AgentProviderCausalSyncWorkspace(database),
    },
    {
      resourceTypes: ["settings"],
      workspace: new SettingsCausalSyncWorkspace(settings),
    },
    {
      resourceTypes: ["marketplace-sources"],
      workspace: new MarketplaceCausalSyncWorkspace(database),
    },
  ]);
}

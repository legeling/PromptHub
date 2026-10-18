import type {
  PluginLibraryFile,
  PluginVersion,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import type { ManagedResourceMutation } from "@prompthub/shared/utils/managed-resource-schema";
import type { HostedPluginPackage } from "@prompthub/core/managed-resources/plugin-packages";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export interface HostedPluginBridge {
  exportDataFiles(): Promise<AgentAssetFileSnapshot[]>;
  restoreDataFiles(files: AgentAssetFileSnapshot[]): Promise<void>;
  versionGetAll(id: string): Promise<PluginVersion[]>;
  versionCreate(id: string, note?: string): Promise<PluginVersion>;
  versionRollback(
    id: string,
    version: number,
  ): Promise<PluginVersionRollbackResult>;
  versionDelete(id: string, versionId: string): Promise<boolean>;
}
export function createHostedPluginBridge(
  request: Request,
  mutate: (mutation: ManagedResourceMutation) => Promise<PluginLibraryFile>,
): HostedPluginBridge {
  async function resource(id: string): Promise<HostedPluginPackage> {
    const result = await request<{ resource: HostedPluginPackage }>(
      `/api/resource-libraries/plugins?plugin=${encodeURIComponent(id)}`,
    );
    return result.resource;
  }
  return {
    exportDataFiles: async () =>
      (
        await request<{ files: AgentAssetFileSnapshot[] }>(
          "/api/resource-libraries/plugins?export=1",
        )
      ).files,
    restoreDataFiles: async (files) => {
      await mutate({ action: "import-files", value: files });
    },
    versionGetAll: async (id) => (await resource(id)).versions,
    versionCreate: async (id, note) => {
      await mutate({ action: "create-version", id, note });
      const version = (await resource(id)).versions.at(-1);
      if (!version) throw new Error("Saved Plugin version is missing");
      return version;
    },
    versionRollback: async (id, version) => {
      const before = await resource(id);
      const restoredVersion = before.versions.find(
        (item) => item.version === version,
      );
      if (!restoredVersion) throw new Error("Plugin version not found");
      const library = await mutate({ action: "rollback", id, version });
      const after = await resource(id);
      const safetyVersion = after.versions.at(-1);
      if (!safetyVersion) throw new Error("Plugin recovery version is missing");
      return { plugin: after.plugin, library, restoredVersion, safetyVersion };
    },
    versionDelete: async (id, versionId) => {
      await mutate({ action: "delete-version", id, versionId });
      return true;
    },
  };
}

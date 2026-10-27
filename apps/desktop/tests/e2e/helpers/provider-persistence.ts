import Database from "@prompthub/db/adapter";
import { AgentProviderProfileDB } from "@prompthub/db/agent-provider-profile";
import { resolveRuntimeStorageContext } from "@prompthub/core/runtime-storage-context";
import type {
  AgentProviderProfile,
  AgentProviderModelMapping,
} from "@prompthub/shared";

interface PersistedProvider {
  profile: AgentProviderProfile | null;
  modelMappings: AgentProviderModelMapping[];
}

export function readPersistedProvider(
  root: string,
  id: string,
): PersistedProvider {
  const database = new Database(
    resolveRuntimeStorageContext(root).databasePath,
    {
      readOnly: true,
    },
  );
  try {
    const providers = new AgentProviderProfileDB(database);
    return {
      profile: providers.getProfileById(id),
      modelMappings: providers.listModelMappings(id),
    };
  } finally {
    database.close();
  }
}

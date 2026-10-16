import path from "node:path";
import fs from "node:fs";
import {
  encodeCanonicalResourceDirectory,
  readAgentProviderResourceBundle,
  materializeAgentProviderResourceBundle,
  type CanonicalAgentProviderShadowInput,
  type PortableLogicalEnvelope,
  type PortableSnapshotResult,
} from "@prompthub/core";
import { AgentProviderProfileDB, DatabaseAdapter } from "@prompthub/db";
import type { AgentProviderModelMapping } from "@prompthub/shared";

/** Full archives preserve mapping identities that the editable logical format omits. */
export function readPortableAgentProviderGraphs(
  snapshot: PortableSnapshotResult | null,
  envelope: PortableLogicalEnvelope,
): CanonicalAgentProviderShadowInput[] | undefined {
  if (!snapshot?.manifest.scopes.includes("agents") || !envelope.scope.agents)
    return undefined;
  const requested = envelope.payload.agentManagement?.providerProfiles ?? [];
  return requested.map((item) => {
    const resource = readAgentProviderResourceBundle(
      path.join(
        snapshot.path,
        "data",
        "agents",
        encodeCanonicalResourceDirectory(item.id),
      ),
    );
    return {
      profile: resource.profile,
      modelMappings: resource.modelMappings,
    };
  });
}

/** Export artifacts retain the established public bundle format; live state stays in SQL. */
export function materializePortableAgentProviders(
  databasePath: string,
  targetPath: string,
): void {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    const repository = new AgentProviderProfileDB(database);
    const profiles = repository.listProfiles({ includeArchived: true });
    const mappings = new Map<string, AgentProviderModelMapping[]>();
    for (const mapping of repository.listModelMappingsForProfiles(
      profiles.map((profile) => profile.id),
    )) {
      const group = mappings.get(mapping.providerProfileId) ?? [];
      group.push(mapping);
      mappings.set(mapping.providerProfileId, group);
    }
    fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    for (const profile of profiles) {
      materializeAgentProviderResourceBundle({
        bundlePath: path.join(
          targetPath,
          encodeCanonicalResourceDirectory(profile.id),
        ),
        profile,
        modelMappings: mappings.get(profile.id) ?? [],
      });
    }
  } finally {
    database.close();
  }
}

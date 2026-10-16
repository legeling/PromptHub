import { AgentProviderProfileDB, type DatabaseAdapter } from "@prompthub/db";
import type { AgentProviderModelMapping } from "@prompthub/shared";
import {
  AGENT_PROVIDER_RESOURCE_KIND,
  AGENT_PROVIDER_RESOURCE_SCHEMA_VERSION,
  parseAgentProviderResourceDocument,
} from "../agent-resource-schema";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

export class AgentProviderCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly repository: AgentProviderProfileDB;
  constructor(database: DatabaseAdapter.Database) {
    this.repository = new AgentProviderProfileDB(database);
  }

  capture(): CausalSyncPayload[] {
    const profiles = this.repository.listProfiles({ includeArchived: true });
    const mappings = new Map<string, AgentProviderModelMapping[]>();
    for (const mapping of this.repository.listModelMappingsForProfiles(
      profiles.map((profile) => profile.id),
    )) {
      const group = mappings.get(mapping.providerProfileId) ?? [];
      group.push(mapping);
      mappings.set(mapping.providerProfileId, group);
    }
    return profiles.map(({ secretRef, ...profile }) =>
      syncPayload(
        "agent-provider",
        profile.id,
        parseAgentProviderResourceDocument({
          kind: AGENT_PROVIDER_RESOURCE_KIND,
          schemaVersion: AGENT_PROVIDER_RESOURCE_SCHEMA_VERSION,
          profile,
          modelMappings: mappings.get(profile.id) ?? [],
          requiresSecret: Boolean(secretRef),
        }),
      ),
    );
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const accepted = new Set<string>(),
      mappingIds = new Set<string>();
    const profiles = this.repository.listProfiles({ includeArchived: true });
    const mappingOwners = new Map(
      this.repository
        .listModelMappingsForProfiles(profiles.map((profile) => profile.id))
        .map((mapping) => [mapping.id, mapping.providerProfileId]),
    );
    const incoming = resources.map((resource) => {
      const document = parseAgentProviderResourceDocument(
        syncPayloadRecord(resource),
      );
      if (
        resource.resourceType !== "agent-provider" ||
        resource.references.length ||
        document.profile.id !== resource.resourceId ||
        accepted.has(resource.resourceId) ||
        syncPayload("agent-provider", document.profile.id, document)
          .contentHash !== resource.contentHash
      )
        throw new Error("Invalid canonical Agent provider sync resource");
      accepted.add(resource.resourceId);
      for (const mapping of document.modelMappings) {
        if (mappingIds.has(mapping.id))
          throw new Error("Duplicate Agent provider mapping identity");
        if (
          mappingOwners.has(mapping.id) &&
          mappingOwners.get(mapping.id) !== document.profile.id
        )
          throw new Error(
            "Agent provider mapping identity belongs to another profile",
          );
        mappingIds.add(mapping.id);
      }
      return document;
    });
    const existing = new Map(profiles.map((profile) => [profile.id, profile]));
    return {
      entries: [],
      apply: () => {
        for (const id of existing.keys())
          if (!accepted.has(id)) this.repository.deleteProfile(id);
        for (const document of incoming) {
          const { profile, modelMappings, requiresSecret } = document;
          this.repository.replaceProfileGraphDirect(
            {
              ...profile,
              secretRef: requiresSecret
                ? (existing.get(profile.id)?.secretRef ??
                  `agent-provider:${profile.id}`)
                : null,
            },
            modelMappings,
          );
        }
      },
    };
  }
}

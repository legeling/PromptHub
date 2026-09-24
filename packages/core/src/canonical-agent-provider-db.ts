import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  AgentProviderProfileDB as BaseAgentProviderProfileDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  AgentManagementBackup,
  AgentProviderModelMapping,
  AgentProviderProfile,
  CreateAgentProviderModelMappingInput,
  CreateAgentProviderProfileInput,
  UpdateAgentProviderProfileInput,
  UpsertAgentProviderModelMappingInput,
} from "@prompthub/shared";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  isCanonicalCommitOutcomeError,
  CanonicalPostCommitError,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import {
  materializeAgentProviderResourceBundle,
  readAgentProviderResourceBundle,
} from "./agent-resource-schema";
import {
  getDataDir,
  getRuntimeStorageContext,
  getUserDataPath,
} from "./runtime-paths";

const OPERATION_KEY = "agent-provider-library";
const MAX_PROVIDER_PROFILES_PER_PUBLICATION = 5_000;

interface ProviderGraph {
  profile: AgentProviderProfile;
  mappings: AgentProviderModelMapping[];
}

function bundlePath(profileId: string): string {
  return path.join(
    getDataDir(),
    "agents",
    encodeCanonicalResourceDirectory(profileId),
  );
}

function sameGraph(resourcePath: string, graph: ProviderGraph | null): boolean {
  if (!graph) return !fs.existsSync(resourcePath);
  if (!fs.existsSync(resourcePath)) return false;
  const current = readAgentProviderResourceBundle(resourcePath);
  const comparableProfile = (profile: AgentProviderProfile) => ({
    ...profile,
    secretRef: Boolean(profile.secretRef),
  });
  const comparableMappings = (mappings: AgentProviderModelMapping[]) =>
    [...mappings].sort((left, right) =>
      left.routeKey.localeCompare(right.routeKey),
    );
  return (
    isDeepStrictEqual(
      comparableProfile(current.profile),
      comparableProfile(graph.profile),
    ) &&
    isDeepStrictEqual(
      comparableMappings(current.modelMappings),
      comparableMappings(graph.mappings),
    )
  );
}

function publishGraphs(
  beforeIds: ReadonlySet<string>,
  graphs: readonly ProviderGraph[],
): boolean {
  if (graphs.length > MAX_PROVIDER_PROFILES_PER_PUBLICATION) {
    throw new Error("Canonical Agent provider publication limit exceeded");
  }
  const graphById = new Map(
    graphs.map((graph) => [graph.profile.id, graph] as const),
  );
  const ids = new Set([...beforeIds, ...graphById.keys()]);
  const entries: CanonicalEntryMutation[] = [];
  for (const profileId of [...ids].sort()) {
    const graph = graphById.get(profileId) ?? null;
    const targetPath = bundlePath(profileId);
    if (sameGraph(targetPath, graph)) continue;
    if (!graph) {
      entries.push({ targetPath, delete: true });
      continue;
    }
    const currentRevision = fs.existsSync(targetPath)
      ? readAgentProviderResourceBundle(targetPath).bundleManifest.revision
      : 0;
    entries.push({
      targetPath,
      prepare(stagePath: string) {
        materializeAgentProviderResourceBundle({
          bundlePath: stagePath,
          profile: graph.profile,
          modelMappings: graph.mappings,
          writePolicy: {
            mode: "create",
            revision: currentRevision + 1,
          },
        });
      },
    });
  }
  if (entries.length === 0) return false;
  publishCanonicalEntries({
    rootPath: getUserDataPath(),
    operationKey: OPERATION_KEY,
    entries,
    verify() {
      for (const profileId of ids) {
        if (
          !sameGraph(bundlePath(profileId), graphById.get(profileId) ?? null)
        ) {
          throw new Error("Canonical Agent provider verification failed");
        }
      }
    },
  });
  return true;
}

export class CanonicalAgentProviderProfileDB extends BaseAgentProviderProfileDB {
  private mutationDepth = 0;

  constructor(db: DatabaseAdapter.Database) {
    super(db);
  }

  private canonical(): boolean {
    return getRuntimeStorageContext().localAuthority === "canonical-files";
  }

  private graph(profileId: string): ProviderGraph | null {
    const profile = super.getProfileById(profileId);
    return profile
      ? { profile, mappings: super.listModelMappings(profileId) }
      : null;
  }

  private allGraphs(): ProviderGraph[] {
    return super.listProfiles({ includeArchived: true }).map((profile) => ({
      profile,
      mappings: super.listModelMappings(profile.id),
    }));
  }

  private mutate<T>(profileId: string, operation: () => T): T {
    if (!this.canonical() || this.mutationDepth > 0) return operation();
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    const before = this.graph(profileId);
    let committed = false;
    this.mutationDepth += 1;
    try {
      return this.db.transaction(() => {
        const result = operation();
        const after = this.graph(profileId);
        committed = publishGraphs(
          new Set(before ? [profileId] : []),
          after ? [after] : [],
        );
        return result;
      })();
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) {
        this.db.invalidate(error);
        throw error;
      }
      if (committed) {
        const pending = new CanonicalPostCommitError(profileId, error);
        this.db.invalidate(pending);
        throw pending;
      }
      if (!sameGraph(bundlePath(profileId), before)) {
        publishGraphs(new Set([profileId]), before ? [before] : []);
      }
      throw error;
    } finally {
      this.mutationDepth -= 1;
    }
  }

  override createProfile(
    input: CreateAgentProviderProfileInput,
  ): AgentProviderProfile {
    if (!this.canonical() || this.mutationDepth > 0)
      return super.createProfile(input);
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    let profileId: string | null = null;
    let committed = false;
    this.mutationDepth += 1;
    try {
      return this.db.transaction(() => {
        const profile = super.createProfile(input);
        profileId = profile.id;
        committed = publishGraphs(new Set(), [this.graph(profile.id)!]);
        return profile;
      })();
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) {
        this.db.invalidate(error);
        throw error;
      }
      if (committed) {
        const pending = new CanonicalPostCommitError(
          profileId ?? "agent-create",
          error,
        );
        this.db.invalidate(pending);
        throw pending;
      }
      if (profileId && fs.existsSync(bundlePath(profileId))) {
        publishGraphs(new Set([profileId]), []);
      }
      throw error;
    } finally {
      this.mutationDepth -= 1;
    }
  }

  override createProfileWithMappings(
    input: CreateAgentProviderProfileInput,
    mappings: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile {
    if (!this.canonical() || this.mutationDepth > 0)
      return super.createProfileWithMappings(input, mappings);
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    let profileId: string | null = null;
    let committed = false;
    this.mutationDepth += 1;
    try {
      return this.db.transaction(() => {
        const profile = super.createProfileWithMappings(input, mappings);
        profileId = profile.id;
        committed = publishGraphs(new Set(), [this.graph(profile.id)!]);
        return profile;
      })();
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) {
        this.db.invalidate(error);
        throw error;
      }
      if (committed) {
        const pending = new CanonicalPostCommitError(
          profileId ?? "agent-create",
          error,
        );
        this.db.invalidate(pending);
        throw pending;
      }
      if (profileId && fs.existsSync(bundlePath(profileId))) {
        publishGraphs(new Set([profileId]), []);
      }
      throw error;
    } finally {
      this.mutationDepth -= 1;
    }
  }

  override updateProfile(
    id: string,
    input: UpdateAgentProviderProfileInput,
    expectedUpdatedAt: number,
  ): AgentProviderProfile {
    return this.mutate(id, () =>
      super.updateProfile(id, input, expectedUpdatedAt),
    );
  }

  override updateProfileWithMappings(
    id: string,
    input: UpdateAgentProviderProfileInput,
    expectedUpdatedAt: number,
    mappings?: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile {
    return this.mutate(id, () =>
      super.updateProfileWithMappings(id, input, expectedUpdatedAt, mappings),
    );
  }

  override archiveProfile(
    id: string,
    expectedUpdatedAt: number,
  ): AgentProviderProfile {
    return this.mutate(id, () => super.archiveProfile(id, expectedUpdatedAt));
  }

  override upsertModelMapping(
    input: UpsertAgentProviderModelMappingInput,
  ): AgentProviderModelMapping {
    return this.mutate(input.providerProfileId, () =>
      super.upsertModelMapping(input),
    );
  }

  override deleteProfile(id: string): boolean {
    return this.mutate(id, () => super.deleteProfile(id));
  }

  override replacePortableBackup(input: AgentManagementBackup): void {
    if (!this.canonical() || this.mutationDepth > 0)
      return super.replacePortableBackup(input);
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    const before = this.allGraphs();
    let committed = false;
    const beforeIds = new Set(before.map((graph) => graph.profile.id));
    this.mutationDepth += 1;
    try {
      this.db.transaction(() => {
        super.replacePortableBackup(input);
        committed = publishGraphs(beforeIds, this.allGraphs());
      })();
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) {
        this.db.invalidate(error);
        throw error;
      }
      if (committed) {
        const pending = new CanonicalPostCommitError("agent-restore", error);
        this.db.invalidate(pending);
        throw pending;
      }
      const currentIds = new Set(
        this.allGraphs().map((graph) => graph.profile.id),
      );
      if (
        [...new Set([...beforeIds, ...currentIds])].some(
          (id) =>
            !sameGraph(
              bundlePath(id),
              before.find((item) => item.profile.id === id) ?? null,
            ),
        )
      ) {
        publishGraphs(currentIds, before);
      }
      throw error;
    } finally {
      this.mutationDepth -= 1;
    }
  }

  recoverInterruptedPublication(): "none" | "rolled-back" | "committed" {
    return recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  }
}

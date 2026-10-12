import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
  AgentProviderProfileExport,
  AgentProviderProfilePublic,
  CreateAgentProviderModelMappingInput,
  CreateAgentProviderProfileInput,
  CreateAgentProviderProfileRequest,
  UpdateAgentProviderProfileInput,
  UpdateAgentProviderProfileRequest,
} from "@prompthub/shared";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

function requireSupportedProvider(platformId: string): void {
  if (!isAgentDepthCapabilityAvailable(platformId, "providerModel")) {
    throw new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  }
}

export interface AgentProviderProfileServiceStorage {
  createProfileWithMappings(
    input: CreateAgentProviderProfileInput,
    mappings: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile;
  getProfileById(id: string): AgentProviderProfile | null;
  listProfiles(options?: {
    platformId?: string;
    includeArchived?: boolean;
  }): AgentProviderProfile[];
  listModelMappings(profileId: string): AgentProviderModelMapping[];
  listModelMappingsForProfiles(
    profileIds: string[],
  ): AgentProviderModelMapping[];
  updateProfileWithMappings(
    id: string,
    input: UpdateAgentProviderProfileInput,
    expectedUpdatedAt: number,
    mappings?: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile;
  archiveProfile(id: string, expectedUpdatedAt: number): AgentProviderProfile;
  deleteProfile(id: string): boolean;
}

export interface AgentProviderProfileServiceSecretStore {
  read(ref: string): Promise<string | null>;
  write(ref: string, value: string): Promise<void>;
  clear(ref: string): Promise<void>;
  hasMany(refs: string[]): Promise<Set<string>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertProfileInput(value: unknown): void {
  if (
    !isPlainRecord(value) ||
    Object.prototype.hasOwnProperty.call(value, "secretRef")
  ) {
    throw new Error("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
  }
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
  }
  return value.trim();
}

function requireExpectedUpdatedAt(value: unknown): number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    Number(value) < 0
  ) {
    throw new Error("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
  }
  return Number(value);
}

function requireSecret(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
  }
  return value;
}

function secretRefForProfile(profileId: string): string {
  return `agent-provider:${profileId}`;
}

function restoreProfileInput(
  profile: AgentProviderProfile,
): UpdateAgentProviderProfileInput {
  return {
    name: profile.name,
    providerKind: profile.providerKind,
    protocol: profile.protocol,
    endpoint: profile.endpoint,
    config: profile.config,
    secretRef: profile.secretRef,
    source: profile.source,
  };
}

export class AgentProviderProfileService {
  constructor(
    private readonly storage: AgentProviderProfileServiceStorage,
    private readonly secrets: AgentProviderProfileServiceSecretStore,
  ) {}

  async list(
    options: {
      platformId?: string;
      includeArchived?: boolean;
    } = {},
  ): Promise<AgentProviderProfilePublic[]> {
    const profiles = this.storage.listProfiles(options);
    const mappings = this.storage.listModelMappingsForProfiles(
      profiles.map((profile) => profile.id),
    );
    const mappingGroups = new Map<string, AgentProviderModelMapping[]>();
    for (const mapping of mappings) {
      const group = mappingGroups.get(mapping.providerProfileId) ?? [];
      group.push(mapping);
      mappingGroups.set(mapping.providerProfileId, group);
    }
    const refs = profiles.flatMap((profile) =>
      profile.secretRef ? [profile.secretRef] : [],
    );
    const presentRefs = await this.secrets.hasMany(refs);
    return profiles.map((profile) =>
      this.toPublic(profile, mappingGroups.get(profile.id) ?? [], presentRefs),
    );
  }

  async create(
    request: CreateAgentProviderProfileRequest,
  ): Promise<AgentProviderProfilePublic> {
    assertProfileInput(request.profile);
    requireSupportedProvider(request.profile.platformId);
    const secret =
      request.secret === undefined || request.secret === null
        ? null
        : requireSecret(request.secret);
    let created: AgentProviderProfile | null = null;
    const mappings = request.modelMappings;
    try {
      created = this.storage.createProfileWithMappings(
        { ...request.profile, secretRef: null },
        mappings,
      );
      if (!secret) return this.publicRecord(created);

      const ref = secretRefForProfile(created.id);
      await this.secrets.write(ref, secret);
      created = this.storage.updateProfileWithMappings(
        created.id,
        { secretRef: ref },
        created.updatedAt,
        undefined,
      );
      return this.toPublic(
        created,
        this.storage.listModelMappings(created.id),
        new Set([ref]),
      );
    } catch {
      if (!created) throw new Error("AGENT_PROVIDER_PROFILE_CREATE_FAILED");
      const ref = secretRefForProfile(created.id);
      const cleanup = await Promise.allSettled([
        this.secrets.clear(ref),
        Promise.resolve().then(() => this.storage.deleteProfile(created!.id)),
      ]);
      if (
        cleanup.some(
          (result) =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && result.value === false),
        )
      ) {
        throw new Error("AGENT_PROVIDER_PROFILE_CREATE_ROLLBACK_FAILED");
      }
      throw new Error("AGENT_PROVIDER_PROFILE_CREATE_FAILED");
    }
  }

  async update(
    request: UpdateAgentProviderProfileRequest,
  ): Promise<AgentProviderProfilePublic> {
    const id = requireId(request.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(
      request.expectedUpdatedAt,
    );
    assertProfileInput(request.profile);
    if (!["preserve", "replace", "clear"].includes(request.secretAction)) {
      throw new Error("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
    }
    const existing = this.storage.getProfileById(id);
    if (!existing) throw new Error("AGENT_PROVIDER_PROFILE_NOT_FOUND");
    requireSupportedProvider(existing.platformId);
    const priorMappings = this.storage.listModelMappings(id);
    const priorRef = existing.secretRef;
    const priorSecret = priorRef ? await this.secrets.read(priorRef) : null;

    if (request.secretAction === "preserve") {
      if (request.secret !== undefined && request.secret !== null) {
        throw new Error("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
      }
      return this.publicRecord(
        this.storage.updateProfileWithMappings(
          id,
          request.profile,
          expectedUpdatedAt,
          request.modelMappings,
        ),
      );
    }

    if (request.secretAction === "replace") {
      const secret = requireSecret(request.secret);
      const nextRef = secretRefForProfile(id);
      await this.secrets.write(nextRef, secret);
      let updated: AgentProviderProfile;
      try {
        updated = this.storage.updateProfileWithMappings(
          id,
          { ...request.profile, secretRef: nextRef },
          expectedUpdatedAt,
          request.modelMappings,
        );
      } catch {
        await this.restoreSecret(nextRef, priorRef, priorSecret);
        throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");
      }
      if (priorRef && priorRef !== nextRef) {
        try {
          await this.secrets.clear(priorRef);
        } catch {
          await this.restoreCommittedReplacement({
            id,
            existing,
            updated,
            priorMappings,
            nextRef,
            priorRef,
            priorSecret,
          });
          throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");
        }
      }
      return this.toPublic(
        updated,
        this.storage.listModelMappings(id),
        new Set([nextRef]),
      );
    }

    if (request.secret !== undefined && request.secret !== null) {
      throw new Error("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
    }
    let updated: AgentProviderProfile;
    try {
      updated = this.storage.updateProfileWithMappings(
        id,
        { ...request.profile, secretRef: null },
        expectedUpdatedAt,
        request.modelMappings,
      );
    } catch {
      throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");
    }
    if (!priorRef) {
      return this.toPublic(
        updated,
        this.storage.listModelMappings(id),
        new Set(),
      );
    }
    try {
      await this.secrets.clear(priorRef);
    } catch {
      try {
        this.storage.updateProfileWithMappings(
          id,
          restoreProfileInput(existing),
          updated.updatedAt,
          priorMappings.map(({ routeKey, modelId, parameters }) => ({
            routeKey,
            modelId,
            parameters,
          })),
        );
      } catch {
        throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");
      }
      throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");
    }
    return this.toPublic(
      updated,
      this.storage.listModelMappings(id),
      new Set(),
    );
  }

  async archive(
    idInput: string,
    expectedUpdatedAtInput: number,
  ): Promise<AgentProviderProfilePublic> {
    const id = requireId(idInput);
    const expectedUpdatedAt = requireExpectedUpdatedAt(expectedUpdatedAtInput);
    const profile = this.storage.archiveProfile(id, expectedUpdatedAt);
    return this.publicRecord(profile);
  }

  async duplicate(
    idInput: string,
    nameInput: string,
  ): Promise<AgentProviderProfilePublic> {
    const id = requireId(idInput);
    const name = requireId(nameInput);
    const existing = this.storage.getProfileById(id);
    if (!existing) throw new Error("AGENT_PROVIDER_PROFILE_NOT_FOUND");
    const mappings = this.exportMappings(id);
    return this.create({
      profile: {
        platformId: existing.platformId,
        name,
        providerKind: existing.providerKind,
        protocol: existing.protocol,
        endpoint: existing.endpoint,
        config: existing.config,
        source: "manual",
      },
      modelMappings: mappings,
    });
  }

  export(idInput: string): AgentProviderProfileExport {
    const id = requireId(idInput);
    const existing = this.storage.getProfileById(id);
    if (!existing) throw new Error("AGENT_PROVIDER_PROFILE_NOT_FOUND");
    return {
      version: 1,
      profile: {
        platformId: existing.platformId,
        name: existing.name,
        providerKind: existing.providerKind,
        protocol: existing.protocol,
        endpoint: existing.endpoint,
        config: existing.config,
        source: existing.source,
      },
      modelMappings: this.exportMappings(id),
      requiresSecret: Boolean(existing.secretRef),
    };
  }

  async delete(idInput: string): Promise<void> {
    const id = requireId(idInput);
    const profile = this.storage.getProfileById(id);
    if (!profile) throw new Error("AGENT_PROVIDER_PROFILE_NOT_FOUND");
    const ref = profile.secretRef;
    const priorSecret = ref ? await this.secrets.read(ref) : null;
    if (ref) await this.secrets.clear(ref);
    try {
      if (!this.storage.deleteProfile(id)) {
        throw new Error("not deleted");
      }
    } catch {
      if (ref && priorSecret) {
        try {
          await this.secrets.write(ref, priorSecret);
        } catch {
          throw new Error("AGENT_PROVIDER_PROFILE_DELETE_ROLLBACK_FAILED");
        }
      }
      throw new Error("AGENT_PROVIDER_PROFILE_DELETE_FAILED");
    }
  }

  private async publicAfterUpdate(
    profile: AgentProviderProfile,
    mappings: AgentProviderModelMapping[],
  ): Promise<AgentProviderProfilePublic> {
    const refs = profile.secretRef ? [profile.secretRef] : [];
    return this.toPublic(profile, mappings, await this.secrets.hasMany(refs));
  }

  private async publicRecord(
    profile: AgentProviderProfile,
  ): Promise<AgentProviderProfilePublic> {
    return this.publicAfterUpdate(
      profile,
      this.storage.listModelMappings(profile.id),
    );
  }

  private exportMappings(
    profileId: string,
  ): CreateAgentProviderModelMappingInput[] {
    return this.storage
      .listModelMappings(profileId)
      .map(({ routeKey, modelId, parameters }) => ({
        routeKey,
        modelId,
        parameters,
      }));
  }

  private toPublic(
    profile: AgentProviderProfile,
    mappings: AgentProviderModelMapping[],
    presentRefs: Set<string>,
  ): AgentProviderProfilePublic {
    const { secretRef, ...publicProfile } = profile;
    return {
      ...publicProfile,
      modelMappings: mappings,
      secretState: !secretRef
        ? "none"
        : presentRefs.has(secretRef)
          ? "available"
          : "missing",
    };
  }

  private async restoreSecret(
    nextRef: string,
    priorRef: string | null,
    priorSecret: string | null,
  ): Promise<void> {
    try {
      if (priorRef === nextRef && priorSecret) {
        await this.secrets.write(nextRef, priorSecret);
        return;
      }
      await this.secrets.clear(nextRef);
      if (priorRef && priorSecret)
        await this.secrets.write(priorRef, priorSecret);
    } catch {
      throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");
    }
  }

  private async restoreCommittedReplacement(input: {
    id: string;
    existing: AgentProviderProfile;
    updated: AgentProviderProfile;
    priorMappings: AgentProviderModelMapping[];
    nextRef: string;
    priorRef: string | null;
    priorSecret: string | null;
  }): Promise<void> {
    try {
      this.storage.updateProfileWithMappings(
        input.id,
        restoreProfileInput(input.existing),
        input.updated.updatedAt,
        input.priorMappings.map(({ routeKey, modelId, parameters }) => ({
          routeKey,
          modelId,
          parameters,
        })),
      );
    } catch {
      throw new Error("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");
    }
    await this.restoreSecret(input.nextRef, input.priorRef, input.priorSecret);
  }
}

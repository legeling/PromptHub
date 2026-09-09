import type {
  RegistrySkill,
  RegistrySkillInstallOptions,
  RegistrySkillInstallResult,
  SkillPackageFileInput,
  SkillPackageSnapshot,
  SkillPackageOperationKind,
  SkillPackageOperationRequest,
  Skill,
  SkillStoreSource,
} from "@prompthub/shared/types";
import {
  computeSkillContentHash,
  findInstalledRegistrySkill,
  getRegistrySkillUpdateStatus,
  type RegistrySkillUpdateCheck,
} from "../../services/skill-store-update";
import {
  normalizeGitStoreSourceInput,
  validateStoreSourceInput,
} from "../../services/skill-store-source";
import { normalizeSkill } from "../../services/skill-normalize";
import {
  getCloudSkillMarkdown,
  getCloudStorePackage,
  isCloudRegistrySkill,
  normalizeSkillStoreSourceIdForRuntime,
} from "../../services/cloud-store";
import {
  buildSkillPackageOperationSource,
  resolveSkillPackageOperationResult,
} from "../../services/skill-package-operation";
import { computeSkillPackageFingerprintV1Sync } from "@prompthub/shared/utils/skill-source-update";
import { createTextSkillPackageSnapshot } from "../../services/skill-package-snapshot";
import { getErrorMessage, hasMeaningfulSkillBody } from "./skill-store-domain";
import {
  findInstalledSkillSourceCandidate,
  findRegistrySkillCandidateByKey,
  getLinkedLocalRemoteUpdateBlock,
  getSkillSourceStaleTargets,
  isDeferredSourceUpdateStatus,
  loadBuiltinSkillRegistry,
  clearSourceErrorAfterSuccessfulCheck,
  recordSourceUnavailableCheck,
  refreshRegistrySkillBaselineIfNeeded,
  resolveRegistrySkillContent,
  resolveRegistrySkillPackageSnapshot,
  resolveRemoteRegistryDirectoryFingerprint,
} from "./skill-source-update-workflow";
import type {
  RegistrySkillUpdateResult,
  SkillRegistrySlice,
  SkillStoreGet,
  SkillStoreSet,
} from "./skill-store-types";

function replaceRegistrySkillDirectoryFingerprint(
  skill: RegistrySkill,
  directoryFingerprint: string,
): RegistrySkill {
  return { ...skill, directory_fingerprint: directoryFingerprint };
}

function applyResolvedPackageDirectory(
  skill: RegistrySkill,
  snapshot: SkillPackageSnapshot,
): RegistrySkill {
  const resolvedDirectory = snapshot.resolvedDirectory?.trim();
  if (!resolvedDirectory) return skill;
  const canonicalSkillPath =
    resolvedDirectory === "."
      ? "SKILL.md"
      : `${resolvedDirectory.replace(/\/+$/u, "")}/SKILL.md`;
  return {
    ...skill,
    source_directory: resolvedDirectory,
    canonical_skill_path: canonicalSkillPath,
  };
}

async function resolveRegistrySkillRemoteState(
  registrySkill: RegistrySkill,
  installedSkill: Skill | null,
): Promise<{
  registrySkill: RegistrySkill;
  remoteContent: string;
  remotePackageSnapshot: SkillPackageSnapshot;
}> {
  const packageSnapshot =
    await resolveRegistrySkillPackageSnapshot(registrySkill);
  if (packageSnapshot) {
    const resolvedRegistrySkill = applyResolvedPackageDirectory(
      registrySkill,
      packageSnapshot,
    );
    return {
      registrySkill: replaceRegistrySkillDirectoryFingerprint(
        resolvedRegistrySkill,
        packageSnapshot.directoryFingerprint,
      ),
      remoteContent: packageSnapshot.content,
      remotePackageSnapshot: packageSnapshot,
    };
  }
  const cloudPackage = isCloudRegistrySkill(registrySkill)
    ? await getCloudStorePackage(registrySkill)
    : null;
  const remoteContent = cloudPackage
    ? getCloudSkillMarkdown(cloudPackage)
    : await resolveRegistrySkillContent(registrySkill);
  const remoteContentHash = await computeSkillContentHash(remoteContent);
  const directoryFingerprint = cloudPackage
    ? computeSkillPackageFingerprintV1Sync(
        cloudPackage.package.files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      ).fingerprint
    : await resolveRemoteRegistryDirectoryFingerprint(registrySkill, {
        remoteContentHash,
        installedSkill,
      });
  const remotePackageSnapshot = await createTextSkillPackageSnapshot({
    files: cloudPackage
      ? cloudPackage.package.files
      : [{ path: "SKILL.md", content: remoteContent }],
    directoryFingerprint,
    scope: cloudPackage ? "package" : "skill-md",
  });
  return {
    registrySkill: {
      ...replaceRegistrySkillDirectoryFingerprint(
        registrySkill,
        directoryFingerprint,
      ),
      ...(cloudPackage?.release.versionLabel
        ? { version: cloudPackage.release.versionLabel }
        : {}),
    },
    remoteContent,
    remotePackageSnapshot,
  };
}

async function resolveInstalledSkillPackageSnapshot(
  installedSkill: Skill | null,
): Promise<SkillPackageSnapshot | undefined> {
  if (!installedSkill) return undefined;
  if (installedSkill.local_repo_path?.trim()) {
    return window.api.skill.getLocalPackageSnapshot(
      installedSkill.local_repo_path.trim(),
    );
  }
  const content = installedSkill.content ?? installedSkill.instructions ?? "";
  const directoryFingerprint =
    installedSkill.directory_fingerprint ||
    installedSkill.installed_directory_fingerprint ||
    (await computeSkillContentHash(content));
  return createTextSkillPackageSnapshot({
    files: [{ path: "SKILL.md", content }],
    directoryFingerprint,
    scope: "package",
  });
}

async function finalizeRegistryUpdateCheck(
  get: SkillStoreGet,
  installedSkill: Skill | null,
  registrySkill: RegistrySkill,
  remoteContent: string,
  remotePackageSnapshot: SkillPackageSnapshot,
) {
  const staleTargets = installedSkill
    ? getSkillSourceStaleTargets(get(), installedSkill)
    : [];
  const localPackageSnapshot =
    await resolveInstalledSkillPackageSnapshot(installedSkill);
  const check = await getRegistrySkillUpdateStatus(
    installedSkill,
    registrySkill,
    remoteContent,
    {
      staleTargets,
      localPackageSnapshot,
      remotePackageSnapshot,
    },
  );
  const refreshedSkill = await refreshRegistrySkillBaselineIfNeeded(
    check,
    get().updateSkill,
  );
  if (!refreshedSkill) {
    await clearSourceErrorAfterSuccessfulCheck(check, get().updateSkill);
  }
  return check;
}

async function recordUnavailableRegistryCheck(
  get: SkillStoreGet,
  registrySkill: RegistrySkill,
  installedSkill: Skill | null,
  error: unknown,
) {
  return recordSourceUnavailableCheck({
    registrySkill,
    installedSkill,
    error,
    updateSkill: get().updateSkill,
    staleTargets: installedSkill
      ? getSkillSourceStaleTargets(get(), installedSkill)
      : [],
  });
}

async function getRegistrySkillUpdateCheck(
  get: SkillStoreGet,
  registrySkill: RegistrySkill,
): Promise<RegistrySkillUpdateCheck> {
  let installedSkill = findInstalledRegistrySkill(get().skills, registrySkill);
  try {
    const remote = await resolveRegistrySkillRemoteState(
      registrySkill,
      installedSkill,
    );
    installedSkill = findInstalledRegistrySkill(
      get().skills,
      remote.registrySkill,
    );
    return finalizeRegistryUpdateCheck(
      get,
      installedSkill,
      remote.registrySkill,
      remote.remoteContent,
      remote.remotePackageSnapshot,
    );
  } catch (error) {
    return recordUnavailableRegistryCheck(
      get,
      registrySkill,
      installedSkill,
      error,
    );
  }
}

async function getInstalledSkillSourceUpdateCheck(
  get: SkillStoreGet,
  skillId: string,
): Promise<RegistrySkillUpdateCheck | null> {
  let installedSkill = get().skills.find((skill) => skill.id === skillId);
  if (!installedSkill) return null;
  if (installedSkill.local_repo_path) {
    installedSkill =
      (await get().syncSkillFromRepo(installedSkill.id)) ?? installedSkill;
  }
  const registrySkill = findInstalledSkillSourceCandidate(
    get(),
    installedSkill,
  );
  if (!registrySkill) return null;
  try {
    const remote = await resolveRegistrySkillRemoteState(
      registrySkill,
      installedSkill,
    );
    return finalizeRegistryUpdateCheck(
      get,
      installedSkill,
      remote.registrySkill,
      remote.remoteContent,
      remote.remotePackageSnapshot,
    );
  } catch (error) {
    return recordUnavailableRegistryCheck(
      get,
      registrySkill,
      installedSkill,
      error,
    );
  }
}

function createRegistryLoadActions(set: SkillStoreSet) {
  return {
    loadRegistry: async () => {
      set({ isLoadingRegistry: true });
      try {
        const registrySkills = await loadBuiltinSkillRegistry();
        set({ registrySkills, isLoadingRegistry: false });
      } catch (error) {
        const message = getErrorMessage(error);
        set({ isLoadingRegistry: false, error: message });
        throw error instanceof Error ? error : new Error(message);
      }
    },
    computeRegistrySkillHash: computeSkillContentHash,
  } satisfies Pick<
    SkillRegistrySlice,
    "loadRegistry" | "computeRegistrySkillHash"
  >;
}

function createRegistryStatusActions(get: SkillStoreGet) {
  return {
    getRegistrySkillUpdateStatus: (skill) =>
      getRegistrySkillUpdateCheck(get, skill),
    getInstalledSkillSourceUpdateStatus: (skillId) =>
      getInstalledSkillSourceUpdateCheck(get, skillId),
  } satisfies Pick<
    SkillRegistrySlice,
    "getRegistrySkillUpdateStatus" | "getInstalledSkillSourceUpdateStatus"
  >;
}

function getDeferredUpdateResult(
  check: RegistrySkillUpdateCheck,
  allowBaselineReset: boolean,
): RegistrySkillUpdateResult | null {
  if (!check.installedSkill) {
    return {
      status: isDeferredSourceUpdateStatus(check.status)
        ? check.status
        : "not-installed",
      check,
    };
  }
  if (check.status === "baseline-missing" && allowBaselineReset) return null;
  if (isDeferredSourceUpdateStatus(check.status))
    return { status: check.status, check };
  return null;
}

function updateRegistrySkillInMemory(
  set: SkillStoreSet,
  updatedSkill: Skill,
): void {
  set((state) => ({
    skills: state.skills.map((skill) =>
      skill.id === updatedSkill.id ? normalizeSkill(updatedSkill) : skill,
    ),
  }));
}

type RegistryUpdateOptions = Parameters<
  SkillRegistrySlice["updateRegistrySkill"]
>[1];

type RegistryPackageOperationInput = {
  operation: SkillPackageOperationKind;
  skillId?: string;
  registrySkill: RegistrySkill;
  content: string;
  packageFiles?: SkillPackageFileInput[];
  markAsBuiltin?: boolean;
  note?: string;
};

async function runRegistryPackageOperation(
  input: RegistryPackageOperationInput,
) {
  const request: SkillPackageOperationRequest = {
    operation: input.operation,
    skillId: input.skillId,
    registrySkill: input.registrySkill,
    source: buildSkillPackageOperationSource(
      input.registrySkill,
      input.content,
      input.packageFiles,
    ),
    content: input.content,
    markAsBuiltin: input.markAsBuiltin,
    note: input.note,
  };
  const result = await window.api.skill.runPackageOperation(request);
  return resolveSkillPackageOperationResult(result);
}

async function applyCheckedRegistryUpdate(
  set: SkillStoreSet,
  get: SkillStoreGet,
  check: RegistrySkillUpdateCheck,
  registrySkill: RegistrySkill,
  options: RegistryUpdateOptions,
  notePrefix: string,
  markAsBuiltin: boolean,
): Promise<RegistrySkillUpdateResult | null> {
  const deferred = getDeferredUpdateResult(
    check,
    options?.overwriteLocalChanges === true,
  );
  if (deferred) return deferred;
  if (check.status === "up-to-date") {
    const skill = await refreshRegistrySkillBaselineIfNeeded(
      check,
      get().updateSkill,
    );
    return { status: "up-to-date", skill, check };
  }
  const linkedLocalBlock = getLinkedLocalRemoteUpdateBlock(
    check.installedSkill!,
    check,
  );
  if (linkedLocalBlock) return linkedLocalBlock;
  if (
    (check.status === "conflict" || check.status === "local-modified") &&
    !options?.overwriteLocalChanges
  ) {
    return { status: check.status, check };
  }
  return materializeRegistryUpdate(
    set,
    get,
    check,
    registrySkill,
    options,
    notePrefix,
    markAsBuiltin,
  );
}

async function materializeRegistryUpdate(
  set: SkillStoreSet,
  get: SkillStoreGet,
  check: RegistrySkillUpdateCheck,
  registrySkill: RegistrySkill,
  options: RegistryUpdateOptions,
  notePrefix: string,
  markAsBuiltin: boolean,
): Promise<RegistrySkillUpdateResult | null> {
  let cloudInstallId: string | null = null;
  try {
    const cloudPackage = isCloudRegistrySkill(registrySkill)
      ? await resolveCloudInstallPackage(registrySkill)
      : null;
    const operationSkill = cloudPackage?.registrySkill ?? check.registrySkill;
    const operationContent = cloudPackage?.content ?? check.remoteContent;
    if (cloudPackage) {
      cloudInstallId = await createCloudInstallIntent(
        operationSkill,
        cloudPackage.releaseId,
        cloudPackage.cloudFingerprint,
        "update",
      );
      await reportCloudInstallStatus(cloudInstallId, "started");
    }
    const result = await runRegistryPackageOperation({
      operation: "update",
      skillId: check.installedSkill!.id,
      registrySkill: operationSkill,
      content: operationContent,
      packageFiles: cloudPackage?.files,
      markAsBuiltin,
      note: `${notePrefix}: ${check.installedSkill!.version || "unknown"} -> ${operationSkill.version}`,
    });
    if (result.status === "review-required") {
      return { status: "safety-review-required", check, review: result.review };
    }
    if (result.status === "cancelled") return null;
    updateRegistrySkillInMemory(set, result.skill);
    await reportCloudInstallStatus(cloudInstallId, "succeeded");
    return { status: "updated", skill: result.skill, check };
  } catch (error) {
    await reportCloudInstallStatus(cloudInstallId, "failed", error);
    throw error;
  }
}

function createRegistryUpdateActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    updateRegistrySkill: async (sourceId, options) => {
      const registrySkill = findRegistrySkillCandidateByKey(get(), sourceId);
      if (!registrySkill) return null;
      const check = await get().getRegistrySkillUpdateStatus(registrySkill);
      return applyCheckedRegistryUpdate(
        set,
        get,
        check,
        registrySkill,
        options,
        "Store update",
        true,
      );
    },
    updateInstalledSkillFromSource: async (skillId, options) => {
      const check = await get().getInstalledSkillSourceUpdateStatus(skillId);
      if (!check) return null;
      return applyCheckedRegistryUpdate(
        set,
        get,
        check,
        check.registrySkill,
        options,
        "Source update",
        false,
      );
    },
  } satisfies Pick<
    SkillRegistrySlice,
    "updateRegistrySkill" | "updateInstalledSkillFromSource"
  >;
}

async function resolveInstallContent(
  registrySkill: RegistrySkill,
): Promise<string> {
  let content = registrySkill.content;
  try {
    content = await resolveRegistrySkillContent(registrySkill);
  } catch (error) {
    console.warn(
      `Failed to resolve latest SKILL.md for "${registrySkill.slug}", falling back to cached registry content:`,
      error,
    );
  }
  if (!hasMeaningfulSkillBody(content)) {
    throw new Error(
      `Unable to fetch the full SKILL.md for "${registrySkill.name}". The registry only has summary metadata right now, so installation was blocked to avoid creating an incomplete skill.`,
    );
  }
  return content;
}

async function resolveCloudInstallPackage(
  registrySkill: RegistrySkill,
): Promise<{
  registrySkill: RegistrySkill;
  content: string;
  releaseId: string;
  desktopFingerprint: string;
  cloudFingerprint: string;
  files: SkillPackageFileInput[];
}> {
  const packageResponse = await getCloudStorePackage(registrySkill);
  const content = getCloudSkillMarkdown(packageResponse);
  const desktopFingerprint = computeSkillPackageFingerprintV1Sync(
    packageResponse.package.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  ).fingerprint;
  return {
    registrySkill: {
      ...registrySkill,
      version: packageResponse.release.versionLabel || registrySkill.version,
      directory_fingerprint: desktopFingerprint,
    },
    content,
    releaseId: packageResponse.release.id,
    desktopFingerprint,
    cloudFingerprint: packageResponse.release.contentFingerprint,
    files: packageResponse.package.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  };
}

function getCloudInstallIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `desktop-${randomUuid}`;
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeCloudInstallFailure(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "Desktop installation failed";
  return raw
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|secret|password|key)=[^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 300);
}

async function createCloudInstallIntent(
  registrySkill: RegistrySkill,
  releaseId: string,
  cloudFingerprint: string,
  operation: "install" | "update",
  currentFingerprint?: string,
): Promise<string | null> {
  if (!isCloudRegistrySkill(registrySkill) || !window.api.cloud?.store)
    return null;
  const listingId = registrySkill.source_id?.slice("cloud:".length).trim();
  if (!listingId) return null;
  const result = await window.api.cloud.store.createInstallIntent({
    listingId,
    operation,
    idempotencyKey: getCloudInstallIdempotencyKey(),
    expectedReleaseId: releaseId,
    expectedFingerprint: cloudFingerprint,
    ...(currentFingerprint ? { currentFingerprint } : {}),
    target: "my-skills",
  });
  return result.install.id;
}

async function reportCloudInstallStatus(
  installId: string | null,
  status: "started" | "succeeded" | "failed",
  error?: unknown,
): Promise<void> {
  if (!installId || !window.api.cloud?.store) return;
  try {
    await window.api.cloud.store.updateInstallStatus(installId, {
      status,
      ...(status === "failed"
        ? {
            failureCode: "desktop_install_failed",
            failureSummary: sanitizeCloudInstallFailure(error),
          }
        : {}),
    });
  } catch (reportError) {
    console.warn(
      "Failed to report Cloud Store installation status:",
      reportError,
    );
  }
}

async function installRegistrySkill(
  get: SkillStoreGet,
  registrySkill: RegistrySkill,
  options?: RegistrySkillInstallOptions,
): Promise<RegistrySkillInstallResult | null> {
  let installRegistrySkill = registrySkill;
  let cloudInstallId: string | null = null;
  try {
    const cloudPackage = isCloudRegistrySkill(registrySkill)
      ? await resolveCloudInstallPackage(registrySkill)
      : null;
    if (cloudPackage) {
      installRegistrySkill = cloudPackage.registrySkill;
      cloudInstallId = await createCloudInstallIntent(
        installRegistrySkill,
        cloudPackage.releaseId,
        cloudPackage.cloudFingerprint,
        "install",
      );
    }
    await reportCloudInstallStatus(cloudInstallId, "started");
    const content =
      cloudPackage?.content ??
      (await resolveInstallContent(installRegistrySkill));
    const result = await runRegistryPackageOperation({
      operation: "install",
      registrySkill: installRegistrySkill,
      content,
      packageFiles: cloudPackage?.files,
      markAsBuiltin: true,
    });
    if (result.status === "review-required") {
      return { status: "safety-review-required", review: result.review };
    }
    if (result.status === "cancelled") return null;
    await reportCloudInstallStatus(cloudInstallId, "succeeded");
    await get().loadSkills();
    return { status: "installed", skill: result.skill };
  } catch (error) {
    await reportCloudInstallStatus(cloudInstallId, "failed", error);
    throw error;
  }
}

function createRegistryInstallActions(get: SkillStoreGet) {
  return {
    installRegistrySkill: (registrySkill, options) =>
      installRegistrySkill(get, registrySkill, options),
    installFromRegistry: (sourceId, options) => {
      const registrySkill = findRegistrySkillCandidateByKey(get(), sourceId);
      return registrySkill
        ? get().installRegistrySkill(registrySkill, options)
        : null;
    },
    uninstallRegistrySkill: async (sourceId) => {
      const registrySkill = findRegistrySkillCandidateByKey(get(), sourceId);
      const skill = registrySkill
        ? findInstalledRegistrySkill(get().skills, registrySkill)
        : get().skills.find((item) => item.source_id === sourceId);
      if (!skill) return false;
      try {
        const success = await window.api.skill.delete(skill.id);
        if (success) await get().loadSkills();
        return success;
      } catch (error) {
        console.error("Failed to uninstall registry skill:", error);
        return false;
      }
    },
  } satisfies Pick<
    SkillRegistrySlice,
    "installRegistrySkill" | "installFromRegistry" | "uninstallRegistrySkill"
  >;
}

function createRegistrySelectionActions(set: SkillStoreSet) {
  return {
    setStoreCategory: (storeCategory) => set({ storeCategory }),
    setStoreSearchQuery: (storeSearchQuery) => set({ storeSearchQuery }),
    selectRegistrySkill: (selectedRegistrySlug) =>
      set({ selectedRegistrySlug }),
    selectStoreSource: (requestedStoreSourceId) =>
      set({
        selectedStoreSourceId: normalizeSkillStoreSourceIdForRuntime(
          requestedStoreSourceId,
        ),
        selectedRegistrySlug: null,
        storeSearchQuery: "",
      }),
  } satisfies Pick<
    SkillRegistrySlice,
    | "setStoreCategory"
    | "setStoreSearchQuery"
    | "selectRegistrySkill"
    | "selectStoreSource"
  >;
}

function createRegistryMergeAction(set: SkillStoreSet) {
  return {
    upsertRegistrySkills: (incomingSkills) => {
      set((state) => {
        const registrySkills = [...state.registrySkills];
        const indexBySourceId = new Map(
          registrySkills.map((skill, index) => [skill.source_id, index]),
        );
        for (const incoming of incomingSkills) {
          const index = indexBySourceId.get(incoming.source_id);
          if (index === undefined) {
            indexBySourceId.set(incoming.source_id, registrySkills.length);
            registrySkills.push(incoming);
          } else {
            registrySkills[index] = { ...registrySkills[index], ...incoming };
          }
        }
        return { registrySkills };
      });
    },
  } satisfies Pick<SkillRegistrySlice, "upsertRegistrySkills">;
}

function createCustomSourceAddAction(set: SkillStoreSet) {
  return {
    addCustomStoreSource: (name, url, type = "marketplace-json", options) => {
      const trimmedName = name.trim();
      const gitSource =
        type === "git-repo"
          ? normalizeGitStoreSourceInput(
              url.trim(),
              options?.branch,
              options?.directory,
            )
          : null;
      const trimmedUrl = validateStoreSourceInput(url.trim(), type);
      if (!trimmedName || !trimmedUrl) return;
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      set((state) => ({
        customStoreSources: [
          {
            id,
            name: trimmedName,
            type,
            url: gitSource?.url ?? trimmedUrl,
            branch: gitSource?.branch,
            directory: gitSource?.directory,
            enabled: true,
            order: state.customStoreSources.length,
            createdAt: Date.now(),
          },
          ...state.customStoreSources,
        ],
        selectedStoreSourceId: id,
      }));
    },
  } satisfies Pick<SkillRegistrySlice, "addCustomStoreSource">;
}

function createCustomSourceStateActions(set: SkillStoreSet) {
  return {
    removeCustomStoreSource: (id) => {
      set((state) => {
        const remoteStoreEntries = { ...state.remoteStoreEntries };
        delete remoteStoreEntries[id];
        return {
          customStoreSources: state.customStoreSources.filter(
            (source) => source.id !== id,
          ),
          selectedStoreSourceId:
            state.selectedStoreSourceId === id
              ? "official"
              : state.selectedStoreSourceId,
          remoteStoreEntries,
        };
      });
    },
    toggleCustomStoreSource: (id) =>
      set((state) => ({
        customStoreSources: state.customStoreSources.map((source) =>
          source.id === id ? { ...source, enabled: !source.enabled } : source,
        ),
      })),
    setRemoteStoreEntry: (sourceId, entry) =>
      set((state) => ({
        remoteStoreEntries: { ...state.remoteStoreEntries, [sourceId]: entry },
      })),
  } satisfies Pick<
    SkillRegistrySlice,
    | "removeCustomStoreSource"
    | "toggleCustomStoreSource"
    | "setRemoteStoreEntry"
  >;
}

function createCustomSourceActions(set: SkillStoreSet) {
  return Object.assign(
    {},
    createCustomSourceAddAction(set),
    createCustomSourceStateActions(set),
  );
}

function filterRegistrySkills(
  registrySkills: RegistrySkill[],
  category: SkillRegistrySlice["storeCategory"],
  query: string,
): RegistrySkill[] {
  const byCategory =
    category === "all"
      ? registrySkills
      : registrySkills.filter((skill) => skill.category === category);
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return byCategory;
  return byCategory.filter(
    (skill) =>
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
  );
}

function createRegistryQueryActions(get: SkillStoreGet) {
  return {
    getInstalledSlugs: () =>
      get()
        .skills.filter((skill) => skill.source_id)
        .map((skill) => skill.source_id!),
    getRecommendedSkills: () => {
      const state = get();
      return state.registrySkills.filter(
        (registrySkill) =>
          !findInstalledRegistrySkill(state.skills, registrySkill),
      );
    },
    getFilteredRegistrySkills: () => {
      const state = get();
      const registrySkills = filterRegistrySkills(
        state.registrySkills,
        state.storeCategory,
        state.storeSearchQuery,
      );
      return {
        installed: registrySkills.filter((skill) =>
          findInstalledRegistrySkill(state.skills, skill),
        ),
        recommended: registrySkills.filter(
          (skill) => !findInstalledRegistrySkill(state.skills, skill),
        ),
      };
    },
  } satisfies Pick<
    SkillRegistrySlice,
    "getInstalledSlugs" | "getRecommendedSkills" | "getFilteredRegistrySkills"
  >;
}

type RegistryActionKeys = Exclude<
  keyof SkillRegistrySlice,
  | "registrySkills"
  | "isLoadingRegistry"
  | "storeCategory"
  | "storeSearchQuery"
  | "selectedRegistrySlug"
  | "customStoreSources"
  | "selectedStoreSourceId"
  | "remoteStoreEntries"
>;

export function createSkillRegistryActions(
  set: SkillStoreSet,
  get: SkillStoreGet,
): Pick<SkillRegistrySlice, RegistryActionKeys> {
  return Object.assign(
    {},
    createRegistryLoadActions(set),
    createRegistryStatusActions(get),
    createRegistryUpdateActions(set, get),
    createRegistryInstallActions(get),
    createRegistrySelectionActions(set),
    createRegistryMergeAction(set),
    createCustomSourceActions(set),
    createRegistryQueryActions(get),
  );
}

import type { RuleFileId, RuleVersionSnapshot } from "@prompthub/shared/types";
import {
  RULE_VERSION_LIMIT,
  encodeRuleId,
  hashContent,
} from "./rules-workspace-support";

interface BoundedRuleVersionCandidate {
  version: RuleVersionSnapshot;
  timestamp: number;
}

interface RuleVersionMergeState {
  merged: RuleVersionSnapshot[];
  seenContents: Set<string>;
  seenIds: Set<string>;
  protectedContents: Set<string>;
}

function boundedVersionTimestamp(
  savedAt: string,
  now: number,
  clampFuture: boolean,
): number {
  const parsed = Date.parse(savedAt);
  if (!Number.isFinite(parsed)) {
    return now;
  }
  return clampFuture && parsed > now ? now : parsed;
}

function normalizeBoundedRuleVersion(
  version: RuleVersionSnapshot,
  now: number,
  clampFuture: boolean,
): BoundedRuleVersionCandidate {
  const timestamp = boundedVersionTimestamp(version.savedAt, now, clampFuture);
  const parsedTimestamp = Date.parse(version.savedAt);
  const normalizedVersion =
    !Number.isFinite(parsedTimestamp) ||
    (clampFuture && timestamp !== parsedTimestamp)
      ? { ...version, savedAt: new Date(timestamp).toISOString() }
      : version;
  return { version: normalizedVersion, timestamp };
}

function insertBoundedRuleVersionCandidate(
  candidates: BoundedRuleVersionCandidate[],
  candidate: BoundedRuleVersionCandidate,
  limit: number,
): void {
  const insertionIndex = candidates.findIndex(
    (current) => candidate.timestamp > current.timestamp,
  );
  if (insertionIndex < 0) {
    candidates.push(candidate);
  } else {
    candidates.splice(insertionIndex, 0, candidate);
  }
  if (candidates.length > limit) {
    candidates.pop();
  }
}

function isNewerBoundedRuleCandidate(
  candidate: BoundedRuleVersionCandidate,
  existing: BoundedRuleVersionCandidate,
): boolean {
  return candidate.timestamp > existing.timestamp;
}

function selectBoundedRuleVersions(
  versions: RuleVersionSnapshot[],
  limit: number,
  clampFuture: boolean,
): RuleVersionSnapshot[] {
  const now = Date.now();
  const candidates: BoundedRuleVersionCandidate[] = [];
  for (const version of versions) {
    const candidate = normalizeBoundedRuleVersion(version, now, clampFuture);
    const duplicateIndex = candidates.findIndex(
      (current) => current.version.content === version.content,
    );
    if (duplicateIndex >= 0) {
      if (isNewerBoundedRuleCandidate(candidate, candidates[duplicateIndex])) {
        candidates.splice(duplicateIndex, 1);
        insertBoundedRuleVersionCandidate(candidates, candidate, limit);
      }
      continue;
    }
    insertBoundedRuleVersionCandidate(candidates, candidate, limit);
  }
  return candidates.map((candidate) => candidate.version);
}

function uniqueRuleVersionId(
  ruleId: RuleFileId,
  version: RuleVersionSnapshot,
  seenIds: Set<string>,
  imported: boolean,
): RuleVersionSnapshot {
  if (!seenIds.has(version.id)) {
    return version;
  }
  const suffix = imported ? "import" : "history";
  const digest = hashContent(`${ruleId}\n${version.content}`);
  const baseId = `${encodeRuleId(ruleId)}-${suffix}-${digest}`;
  let nextId = baseId;
  let collision = 1;
  while (seenIds.has(nextId)) {
    nextId = `${baseId}-${collision}`;
    collision += 1;
  }
  return { ...version, id: nextId };
}

function createRuleVersionMergeState(): RuleVersionMergeState {
  return {
    merged: [],
    seenContents: new Set<string>(),
    seenIds: new Set<string>(),
    protectedContents: new Set<string>(),
  };
}

function appendMergedRuleVersion(
  state: RuleVersionMergeState,
  ruleId: RuleFileId,
  version: RuleVersionSnapshot,
  imported: boolean,
): void {
  if (state.seenContents.has(version.content)) {
    return;
  }
  const uniqueVersion = uniqueRuleVersionId(
    ruleId,
    version,
    state.seenIds,
    imported,
  );
  state.seenContents.add(uniqueVersion.content);
  state.seenIds.add(uniqueVersion.id);
  state.merged.push(uniqueVersion);
}

function protectGeneratedRuleVersion(
  state: RuleVersionMergeState,
  ruleId: RuleFileId,
  content: string,
  suffix: string,
  savedAt: string,
): void {
  if (!content) {
    return;
  }
  state.protectedContents.add(content);
  if (state.seenContents.has(content)) {
    return;
  }
  appendMergedRuleVersion(
    state,
    ruleId,
    {
      id: `${encodeRuleId(ruleId)}-${suffix}-${hashContent(`${savedAt}\n${content}`).slice(0, 16)}`,
      savedAt,
      content,
      source: "manual-save",
    },
    false,
  );
}

function compareRuleVersionSnapshotsNewestFirst(
  left: RuleVersionSnapshot,
  right: RuleVersionSnapshot,
): number {
  return Date.parse(right.savedAt) - Date.parse(left.savedAt);
}

function limitMergedRuleVersions(
  state: RuleVersionMergeState,
): RuleVersionSnapshot[] {
  if (state.merged.length <= RULE_VERSION_LIMIT) {
    return state.merged;
  }
  const protectedVersions = state.merged.filter((version) =>
    state.protectedContents.has(version.content),
  );
  const unprotectedVersions = state.merged
    .filter((version) => !state.protectedContents.has(version.content))
    .sort(compareRuleVersionSnapshotsNewestFirst);
  return [
    ...unprotectedVersions.slice(
      0,
      RULE_VERSION_LIMIT - protectedVersions.length,
    ),
    ...protectedVersions,
  ];
}

export function mergeImportedRuleVersions(
  ruleId: RuleFileId,
  previousManagedContent: string,
  existingVersions: RuleVersionSnapshot[],
  importedVersions: RuleVersionSnapshot[],
  importedContent: string,
): RuleVersionSnapshot[] {
  const state = createRuleVersionMergeState();
  for (const version of selectBoundedRuleVersions(
    existingVersions,
    RULE_VERSION_LIMIT,
    false,
  )) {
    appendMergedRuleVersion(state, ruleId, version, false);
  }
  for (const version of selectBoundedRuleVersions(
    importedVersions,
    RULE_VERSION_LIMIT,
    true,
  )) {
    appendMergedRuleVersion(state, ruleId, version, true);
  }
  const generatedAt = Date.now();
  protectGeneratedRuleVersion(
    state,
    ruleId,
    previousManagedContent,
    "pre-import",
    new Date(generatedAt).toISOString(),
  );
  protectGeneratedRuleVersion(
    state,
    ruleId,
    importedContent,
    "import",
    new Date(generatedAt + 1).toISOString(),
  );
  return limitMergedRuleVersions(state);
}

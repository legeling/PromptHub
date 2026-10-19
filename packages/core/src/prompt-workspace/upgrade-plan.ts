import crypto from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared/types";
import type {
  PromptWorkspaceConflict,
  PromptWorkspaceRecordKind,
  PromptWorkspaceResolution,
  PromptWorkspaceReview,
  PromptWorkspaceSource,
} from "@prompthub/shared/types/prompt-workspace-recovery";
import type { PromptCanonicalGraphSnapshot } from "../prompt-canonical-export";
import {
  readLegacyPromptWorkspace,
  workspacePromptProjection,
  workspaceVersionProjection,
  type LegacyPromptWorkspaceFields,
} from "./legacy-reader";
import { PROMPT_WORKSPACE_SOURCES } from "./upgrade-files";

interface Candidate<T> {
  source: PromptWorkspaceSource;
  value: T | null;
  fields: ReadonlySet<string>;
  projection: Record<string, unknown>;
}
interface SourceGraph {
  source: PromptWorkspaceSource;
  graph: PromptCanonicalGraphSnapshot;
  fields?: LegacyPromptWorkspaceFields;
}
interface MergeContext {
  reappeared: boolean;
  choices: Map<string, PromptWorkspaceSource>;
  conflicts: PromptWorkspaceConflict[];
}

function observed<T>(candidate: Candidate<T>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(candidate.projection).filter(([key]) =>
      candidate.fields.has(key),
    ),
  );
}

function differingFields<T>(candidates: Candidate<T>[]): string[] {
  const result = new Set<string>();
  for (let index = 0; index < candidates.length; index += 1) {
    const left = candidates[index];
    for (const right of candidates.slice(index + 1)) {
      if (!left.value || !right.value) {
        result.add("record");
        continue;
      }
      for (const field of left.fields) {
        if (
          right.fields.has(field) &&
          !isDeepStrictEqual(left.projection[field], right.projection[field])
        )
          result.add(field);
      }
    }
  }
  return [...result].sort();
}

function mergeRepresentedFields<T extends { id: string }>(
  candidates: Candidate<T>[],
  selected?: Candidate<T>,
): T | null {
  if (selected && !selected.value) return null;
  const first = candidates.find((candidate) => candidate.value !== null);
  if (!first?.value) return null;
  const result = { ...first.value };
  const known = new Set(first.fields);
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    const fields = Object.entries(candidate.value).filter(
      ([key]) => candidate.fields.has(key) && !known.has(key),
    );
    Object.assign(result, Object.fromEntries(fields));
    for (const field of candidate.fields) known.add(field);
  }
  if (selected?.value) {
    Object.assign(
      result,
      Object.fromEntries(
        Object.entries(selected.value).filter(([key]) =>
          selected.fields.has(key),
        ),
      ),
    );
  }
  return result;
}

function titleOf(value: { id: string }): string {
  if ("title" in value && typeof value.title === "string") return value.title;
  if ("name" in value && typeof value.name === "string") return value.name;
  if ("promptId" in value && "version" in value)
    return `${value.promptId} / ${value.version}`;
  return value.id;
}

function chooseGroup<T extends { id: string }>(
  kind: PromptWorkspaceRecordKind,
  slot: string,
  candidates: Candidate<T>[],
  context: MergeContext,
): T | null {
  if (
    context.reappeared &&
    !candidates.some((candidate) => candidate.source === "database")
  )
    candidates.unshift({
      source: "database",
      value: null,
      fields: new Set(),
      projection: {},
    });
  const differences = differingFields(candidates);
  if (differences.length === 0) return mergeRepresentedFields(candidates);
  const first = candidates.find((candidate) => candidate.value !== null)?.value;
  if (!first) return null;
  const key = JSON.stringify([kind, slot]);
  context.conflicts.push({
    key,
    kind,
    id: first.id,
    title: titleOf(first),
    differingFields: differences,
    variants: candidates.map((candidate) => ({
      source: candidate.source,
      fields: candidate.value
        ? Object.fromEntries(
            Object.entries(observed(candidate)).map(([field, value]) => [
              field,
              JSON.stringify(value) ?? "null",
            ]),
          )
        : null,
    })),
  });
  const choice = context.choices.get(key);
  const selected = candidates.find((candidate) => candidate.source === choice);
  if (choice && !selected)
    throw new Error("Prompt workspace choice names an unavailable source");
  return mergeRepresentedFields(candidates, selected);
}

function mergeRecords<T extends { id: string }>(
  kind: PromptWorkspaceRecordKind,
  sources: SourceGraph[],
  entries: (source: SourceGraph) => T[],
  fields: (source: SourceGraph) => Map<string, ReadonlySet<string>> | undefined,
  projection: (value: T) => Record<string, unknown>,
  slot: (value: T) => string,
  context: MergeContext,
): T[] {
  const groups = new Map<string, Candidate<T>[]>();
  for (const source of sources) {
    for (const value of entries(source)) {
      const projected = projection(value);
      const key = slot(value);
      const group = groups.get(key) ?? [];
      if (group.some((candidate) => candidate.source === source.source))
        throw new Error(
          "Historical Prompt workspace contains a duplicate version slot",
        );
      group.push({
        source: source.source,
        value,
        projection: projected,
        fields:
          fields(source)?.get(value.id) ?? new Set(Object.keys(projected)),
      });
      groups.set(key, group);
    }
  }
  const result: T[] = [];
  for (const [key, candidates] of groups) {
    const selected = chooseGroup(kind, key, candidates, context);
    if (selected) result.push(selected);
  }
  return result;
}

function readSources(
  root: string,
  current: PromptCanonicalGraphSnapshot,
): SourceGraph[] {
  const result: SourceGraph[] = [{ source: "database", graph: current }];
  for (const source of PROMPT_WORKSPACE_SOURCES) {
    const fields: LegacyPromptWorkspaceFields = {
      prompts: new Map(),
      folders: new Map(),
      versions: new Map(),
    };
    result.push({
      source,
      graph: readLegacyPromptWorkspace(path.join(root, source), fields),
      fields,
    });
  }
  return result;
}

function currentBody(prompt: Prompt | PromptVersion): unknown {
  return {
    systemPrompt: prompt.systemPrompt?.trim() || null,
    userPrompt: prompt.userPrompt.trim(),
    systemPromptEn: prompt.systemPromptEn ?? null,
    userPromptEn: prompt.userPromptEn ?? null,
    variables: prompt.variables,
  };
}

/** Preserve every selected historical ID, then make the selected current body the newest snapshot. */
export function completePromptWorkspaceHistory(
  graph: PromptCanonicalGraphSnapshot,
): void {
  const byOwner = new Map<string, PromptVersion[]>();
  const owners = new Set(graph.prompts.map((prompt) => prompt.id));
  graph.promptVersions = graph.promptVersions.filter((version) =>
    owners.has(version.promptId),
  );
  for (const version of graph.promptVersions) {
    const versions = byOwner.get(version.promptId) ?? [];
    versions.push(version);
    byOwner.set(version.promptId, versions);
  }
  for (const prompt of graph.prompts) {
    const versions = byOwner.get(prompt.id) ?? [];
    const latest = versions.reduce<PromptVersion | undefined>(
      (best, value) => (!best || value.version > best.version ? value : best),
      undefined,
    );
    if (latest && isDeepStrictEqual(currentBody(latest), currentBody(prompt))) {
      prompt.currentVersion = latest.version;
    } else {
      prompt.currentVersion = latest
        ? latest.version + 1
        : Math.max(1, prompt.currentVersion);
      graph.promptVersions.push({
        id: `workspace-${crypto
          .createHash("sha256")
          .update(
            JSON.stringify([
              prompt.id,
              prompt.currentVersion,
              currentBody(prompt),
            ]),
          )
          .digest("hex")}`,
        promptId: prompt.id,
        version: prompt.currentVersion,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        systemPromptEn: prompt.systemPromptEn,
        userPromptEn: prompt.userPromptEn,
        variables: prompt.variables,
        note: null,
        aiResponse: null,
        createdAt: prompt.updatedAt,
      });
    }
    prompt.version = prompt.currentVersion;
  }
}

export function planPromptWorkspaceUpgrade(
  root: string,
  current: PromptCanonicalGraphSnapshot,
  review: Omit<PromptWorkspaceReview, "conflicts">,
  resolution?: PromptWorkspaceResolution,
): { graph: PromptCanonicalGraphSnapshot; review: PromptWorkspaceReview } {
  const sources = readSources(root, current);
  const context: MergeContext = {
    reappeared: review.reappeared,
    conflicts: [],
    choices: new Map(),
  };
  for (const choice of resolution?.choices ?? []) {
    if (context.choices.has(choice.key))
      throw new Error("Duplicate Prompt workspace choice");
    context.choices.set(choice.key, choice.source);
  }
  const graph = {
    ...current,
    prompts: mergeRecords<Prompt>(
      "prompt",
      sources,
      (source) => source.graph.prompts,
      (source) => source.fields?.prompts,
      workspacePromptProjection,
      (value) => value.id,
      context,
    ),
    folders: mergeRecords<Folder>(
      "folder",
      sources,
      (source) => source.graph.folders,
      (source) => source.fields?.folders,
      (value) => ({ ...value }),
      (value) => value.id,
      context,
    ),
    promptVersions: mergeRecords<PromptVersion>(
      "version",
      sources,
      (source) => source.graph.promptVersions,
      (source) => source.fields?.versions,
      workspaceVersionProjection,
      (value) => JSON.stringify([value.promptId, value.version]),
      context,
    ),
  };
  if (
    resolution &&
    (context.choices.size !== context.conflicts.length ||
      context.conflicts.some((conflict) => !context.choices.has(conflict.key)))
  )
    throw new Error(
      "Every Prompt workspace conflict needs one valid source choice",
    );
  return { graph, review: { ...review, conflicts: context.conflicts } };
}

import type { DatabaseAdapter } from "@prompthub/db";
import { isRuleFileId, isRulePlatformId } from "@prompthub/shared";
import type { RuleRecord } from "@prompthub/shared/types";
import {
  RuleStorageDB,
  getRuleManagedPath,
  type RuleStorageContext,
  type RuleStorageGraph,
} from "../rule-storage";
import { validateRuleVersionSnapshot } from "../rule-resource-schema";
import { hashContent } from "../rules-workspace-support";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

type PortableRule = Omit<
  RuleRecord,
  "managedPath" | "targetPath" | "projectRootPath" | "syncStatus"
>;

function portable(rule: RuleRecord): PortableRule {
  return {
    id: rule.id,
    scope: rule.scope,
    platformId: rule.platformId,
    platformName: rule.platformName,
    platformIcon: rule.platformIcon,
    platformDescription: rule.platformDescription,
    canonicalFileName: rule.canonicalFileName,
    description: rule.description,
    currentVersion: rule.currentVersion,
    contentHash: rule.contentHash,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function parseRule(value: unknown): PortableRule {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid sync Rule metadata");
  const record = value as Record<string, unknown>; // Shape is checked above; fields are validated below.
  if (
    typeof record.id !== "string" ||
    !isRuleFileId(record.id) ||
    typeof record.platformId !== "string" ||
    !isRulePlatformId(record.platformId) ||
    !["global", "project"].includes(String(record.scope))
  )
    throw new Error("Invalid sync Rule identity");
  if (record.id.startsWith("project:") !== (record.scope === "project"))
    throw new Error("Invalid sync Rule scope");
  for (const field of [
    "platformName",
    "platformIcon",
    "platformDescription",
    "canonicalFileName",
    "description",
    "contentHash",
    "createdAt",
    "updatedAt",
  ]) {
    if (typeof record[field] !== "string" || record[field].includes("\0"))
      throw new Error(`Invalid sync Rule ${field}`);
  }
  for (const field of ["createdAt", "updatedAt"]) {
    const date = new Date(String(record[field]));
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== record[field]
    )
      throw new Error("Invalid sync Rule timestamp");
  }
  if (
    !Number.isSafeInteger(record.currentVersion) ||
    Number(record.currentVersion) < 0
  )
    throw new Error("Invalid sync Rule currentVersion");
  return record as unknown as PortableRule; // Every portable field is validated before constructing the local Rule.
}

export class RuleCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly repository: RuleStorageDB;
  constructor(
    database: DatabaseAdapter.Database,
    private readonly context: RuleStorageContext,
  ) {
    this.repository = new RuleStorageDB(database, context);
  }

  capture(): CausalSyncPayload[] {
    return this.repository.getAll().map((rule) =>
      syncPayload("rule", rule.id, {
        rule: portable(rule),
        content:
          rule.contentHash === "" && rule.currentVersion === 0
            ? null
            : this.repository.readContent(rule),
        versions: this.repository.readVersions(rule.id).reverse(),
      }),
    );
  }

  private decode(resource: CausalSyncPayload): RuleStorageGraph {
    if (resource.resourceType !== "rule" || resource.references.length !== 0)
      throw new Error("Invalid sync Rule resource");
    const value = syncPayloadRecord(resource),
      metadata = parseRule(value.rule);
    if (
      !Array.isArray(value.versions) ||
      (typeof value.content !== "string" && value.content !== null)
    )
      throw new Error("Incomplete sync Rule content");
    const versions = value.versions.map(validateRuleVersionSnapshot);
    const content = typeof value.content === "string" ? value.content : null;
    if (
      new Set(versions.map((v) => v.id)).size !== versions.length ||
      versions.length > metadata.currentVersion
    )
      throw new Error("Invalid sync Rule history");
    if (
      content === null
        ? metadata.contentHash !== "" || metadata.currentVersion !== 0
        : hashContent(content) !== metadata.contentHash
    )
      throw new Error("Sync Rule content hash mismatch");
    const existing = this.repository.getById(metadata.id);
    const rule: RuleRecord = {
      ...metadata,
      managedPath: getRuleManagedPath(metadata, this.context.rulesRoot),
      targetPath: existing?.targetPath ?? "",
      projectRootPath: existing?.projectRootPath ?? null,
      syncStatus: existing?.targetPath ? "out-of-sync" : "target-missing",
    };
    const expected = syncPayload("rule", rule.id, {
      rule: portable(rule),
      content,
      versions,
    });
    if (
      resource.resourceId !== rule.id ||
      expected.contentHash !== resource.contentHash
    )
      throw new Error("Sync Rule payload does not match its metadata");
    return { rule, content, versions };
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const graphs = resources.map((resource) => this.decode(resource));
    const accepted = new Set(graphs.map((graph) => graph.rule.id));
    if (accepted.size !== graphs.length)
      throw new Error("Duplicate sync Rule identity");
    const current = new Map(
      this.capture().map((resource) => [
        resource.resourceId,
        resource.contentHash,
      ]),
    );
    const publication = this.repository.preparePublication(
      graphs.filter(
        (graph, index) =>
          current.get(graph.rule.id) !== resources[index].contentHash,
      ),
      this.repository
        .getAll()
        .filter((rule) => !accepted.has(rule.id))
        .map((rule) => rule.id),
    );
    return { entries: publication.entries, apply: publication.commit };
  }
}

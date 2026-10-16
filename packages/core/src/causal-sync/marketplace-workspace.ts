import type { DatabaseAdapter } from "@prompthub/db";
import {
  parseRendererAuxiliaryState,
  readRendererAuxiliaryState,
  writeRendererAuxiliaryState,
} from "../renderer-auxiliary-state";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

function portable(
  sources: ReturnType<typeof readRendererAuxiliaryState>["marketplaceSources"],
) {
  return {
    skill: sources.skill.filter((source) => source.type !== "local-dir"),
    mcp: sources.mcp.filter((source) => source.type !== "local-dir"),
    plugin: sources.plugin.filter((source) => source.type !== "local-dir"),
  };
}

export class MarketplaceCausalSyncWorkspace implements CausalSyncWorkspace {
  constructor(private readonly database: DatabaseAdapter.Database) {}
  capture(): CausalSyncPayload[] {
    return [
      syncPayload(
        "marketplace-sources",
        "library",
        portable(readRendererAuxiliaryState(this.database).marketplaceSources),
      ),
    ];
  }
  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const resource = resources[0];
    if (
      resources.length !== 1 ||
      resource.resourceType !== "marketplace-sources" ||
      resource.resourceId !== "library" ||
      resource.references.length
    )
      throw new Error("Invalid marketplace sync inventory");
    const value = syncPayloadRecord(resource);
    for (const domain of ["skill", "mcp", "plugin"])
      if (!Array.isArray(value[domain]))
        throw new Error("Incomplete marketplace sync inventory");
    const sources = portable(
      parseRendererAuxiliaryState({ marketplaceSources: value })
        .marketplaceSources,
    );
    if (
      syncPayload("marketplace-sources", "library", sources).contentHash !==
      resource.contentHash
    )
      throw new Error("Invalid marketplace sync payload");
    const current = readRendererAuxiliaryState(this.database);
    const next = parseRendererAuxiliaryState({
      ...current,
      marketplaceSources: {
        skill: [
          ...current.marketplaceSources.skill.filter(
            (source) => source.type === "local-dir",
          ),
          ...sources.skill,
        ],
        mcp: [
          ...current.marketplaceSources.mcp.filter(
            (source) => source.type === "local-dir",
          ),
          ...sources.mcp,
        ],
        plugin: [
          ...current.marketplaceSources.plugin.filter(
            (source) => source.type === "local-dir",
          ),
          ...sources.plugin,
        ],
      },
    });
    return {
      entries: [],
      apply: () => writeRendererAuxiliaryState(this.database, next),
    };
  }
}

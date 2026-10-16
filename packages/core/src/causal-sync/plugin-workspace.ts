import type { PluginStorage } from "../plugin-storage";
import { parsePluginResourceSnapshot } from "../plugin-resource-schema";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

export class PluginCausalSyncWorkspace implements CausalSyncWorkspace {
  constructor(private readonly storage: PluginStorage) {}

  capture(): CausalSyncPayload[] {
    return this.storage
      .capture()
      .map((snapshot) => syncPayload("plugin", snapshot.plugin.id, snapshot));
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const snapshots = resources.map((resource) => {
      const snapshot = parsePluginResourceSnapshot(syncPayloadRecord(resource));
      if (
        resource.resourceType !== "plugin" ||
        resource.references.length ||
        resource.resourceId !== snapshot.plugin.id ||
        resource.contentHash !==
          syncPayload("plugin", snapshot.plugin.id, snapshot).contentHash
      )
        throw new Error("Invalid canonical Plugin sync payload");
      return snapshot;
    });
    const prepared = this.storage.prepareSnapshots(snapshots);
    return { entries: prepared.entries, apply: prepared.commit };
  }
}

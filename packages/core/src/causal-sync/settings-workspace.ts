import type { CoreSettingsStore } from "../settings-store";
import {
  mergePortableRendererSettings,
  portableRendererSettings,
} from "../renderer-settings-codec";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

export class SettingsCausalSyncWorkspace implements CausalSyncWorkspace {
  constructor(private readonly store: CoreSettingsStore) {}

  capture(): CausalSyncPayload[] {
    return [
      syncPayload(
        "settings",
        "renderer",
        portableRendererSettings(this.store.read()),
      ),
    ];
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const resource = resources[0];
    if (
      resources.length !== 1 ||
      resource.resourceType !== "settings" ||
      resource.resourceId !== "renderer" ||
      resource.references.length
    )
      throw new Error("Invalid portable settings sync inventory");
    const value = syncPayloadRecord(resource),
      portable = portableRendererSettings(value);
    if (
      syncPayload("settings", "renderer", portable).contentHash !==
      resource.contentHash
    )
      throw new Error("Invalid portable settings payload");
    const prepared = this.store.prepareRendererSettingsReplacement(
      mergePortableRendererSettings(this.store.read(), portable),
    );
    return { entries: prepared.entries, apply: prepared.commit };
  }
}

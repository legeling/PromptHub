import { createSkillWorkspaceRefresh } from "./skill/skill-workspace-refresh";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSkillLibrarySlice } from "./skill/skill-library-slice";
import {
  mergePersistedSkillState,
  partializeSkillState,
} from "./skill/skill-store-persistence";
import { createSkillRegistrySlice } from "./skill/skill-registry-slice";
import { createSkillScanSlice } from "./skill/skill-scan-slice";
import { getProjectScanPaths } from "./skill/skill-store-domain";
import { createSkillTranslationSlice } from "./skill/skill-translation-slice";
import type { SkillState } from "./skill/skill-store-types";

export { getProjectScanPaths };
export type {
  AgentSkillScanState,
  ProjectSkillScanState,
  RegistrySkillUpdateResult,
  ScannedImportResult,
  SkillFilterType,
  SkillGalleryColumnMode,
  SkillSafetyBatchSummary,
  SkillStoreView,
  SkillViewMode,
} from "./skill/skill-store-types";

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      ...createSkillLibrarySlice(set, get),
      ...createSkillWorkspaceRefresh(set, get),
      ...createSkillScanSlice(set, get),
      ...createSkillRegistrySlice(set, get),
      ...createSkillTranslationSlice(set, get),
    }),
    {
      name: "skill-store",
      partialize: partializeSkillState,
      merge: mergePersistedSkillState,
    },
  ),
);

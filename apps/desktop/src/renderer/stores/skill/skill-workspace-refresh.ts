import type { PreparedWorkspaceRefresh } from "../../services/local-data-refresh";
import { normalizeSkills } from "../../services/skill-normalize";
import { useSettingsStore } from "../settings.store";
import { getProjectScanPaths } from "./skill-store-domain";
import type { SkillStoreGet, SkillStoreSet } from "./skill-store-types";

export function createSkillWorkspaceRefresh(
  set: SkillStoreSet,
  get: SkillStoreGet,
): {
  prepareWorkspaceRefresh: () => Promise<PreparedWorkspaceRefresh>;
} {
  return {
    prepareWorkspaceRefresh: async () => {
      const before = get();
      const projects = useSettingsStore.getState().skillProjects;
      const [skills, projectEntries, agentEntries] = await Promise.all([
        window.api.skill.getAll().then(normalizeSkills),
        Promise.all(
          projects.map(
            async (project) =>
              [
                project.id,
                {
                  scannedSkills: await window.api.skill.scanLocalPreview(
                    getProjectScanPaths(project),
                  ),
                  isScanning: false,
                  scannedAt: Date.now(),
                  error: null,
                },
              ] as const,
          ),
        ),
        Promise.all(
          Object.keys(before.agentScanState).map(
            async (platformId) =>
              [
                platformId,
                {
                  result: await window.api.skill.scanPlatformSkills(platformId),
                  isScanning: false,
                  scannedAt: Date.now(),
                  error: null,
                },
              ] as const,
          ),
        ),
      ]);
      const statuses = skills.length
        ? await window.api.skill.getMdInstallStatusBatch(
            skills.map((skill) => skill.id),
          )
        : {};
      if (skills.some((skill) => !statuses[skill.id]))
        throw new Error("Incomplete Skill installation status");
      const ids = new Set(skills.map((skill) => skill.id));
      return {
        isCurrent: () =>
          get().skills === before.skills &&
          get().selectedSkillId === before.selectedSkillId &&
          get().projectScanState === before.projectScanState &&
          get().agentScanState === before.agentScanState &&
          useSettingsStore.getState().skillProjects === projects,
        commit: () => {
          const state = get();
          const removed =
            !!state.selectedSkillId && !ids.has(state.selectedSkillId);
          set({
            skills,
            selectedSkillId: removed ? null : state.selectedSkillId,
            projectScanState: Object.fromEntries(projectEntries),
            agentScanState: Object.fromEntries(agentEntries),
            skillPlatformStatuses: statuses,
            deployedSkillNames: new Set(
              skills
                .filter((skill) =>
                  Object.values(statuses[skill.id]).some(Boolean),
                )
                .map((skill) => skill.id),
            ),
            distributionStatusError: null,
            error: null,
          });
          return removed;
        },
      };
    },
  };
}

import { useMemo } from "react";
import { filterVisiblePluginTargets } from "./plugin-detail-utils";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import {
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  SKILL_LIST_PAGE_SIZE_OPTIONS,
  useSettingsStore,
} from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { useUIStore } from "../../stores/ui.store";

function usePluginManagerSkillBindings() {
  const skills = useSkillStore((state) => state.skills);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const setSkillStoreView = useSkillStore((state) => state.setStoreView);
  const requestPluginChildSkillDeploy = useSkillStore(
    (state) => state.requestPluginChildSkillDeploy,
  );
  return {
    skills,
    loadSkills,
    scanLocalPreview,
    importScannedSkills,
    selectSkill,
    setSkillStoreView,
    requestPluginChildSkillDeploy,
  };
}

function usePluginManagerMcpBindings() {
  const loadMcp = useMcpStore((state) => state.load);
  const selectMcpServer = useMcpStore((state) => state.selectServer);
  const setMcpSelectedTab = useMcpStore((state) => state.setSelectedTab);
  const requestPluginChildMcpDeploy = useMcpStore(
    (state) => state.requestPluginChildMcpDeploy,
  );
  return {
    loadMcp,
    selectMcpServer,
    setMcpSelectedTab,
    requestPluginChildMcpDeploy,
  };
}

function usePluginManagerSettingsBindings() {
  const storedPluginPageSize = useSettingsStore(
    (state) => state.skillListPageSize,
  );
  const setPluginPageSize = useSettingsStore(
    (state) => state.setSkillListPageSize,
  );
  const pageSize = SKILL_LIST_PAGE_SIZE_OPTIONS.includes(
    storedPluginPageSize as (typeof SKILL_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? storedPluginPageSize
    : DEFAULT_SKILL_LIST_PAGE_SIZE;
  return { pageSize, setPluginPageSize };
}

export function usePluginManagerBindings() {
  const rawPluginStore = usePluginStore();
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );
  const targetMatrix = useMemo(() => {
    return filterVisiblePluginTargets(
      rawPluginStore.targetMatrix,
      rawPluginStore.deployablePlatformIds,
      disabledPlatformIds,
    );
  }, [
    disabledPlatformIds,
    rawPluginStore.deployablePlatformIds,
    rawPluginStore.targetMatrix,
  ]);
  const pluginStore = { ...rawPluginStore, targetMatrix };
  const skillBindings = usePluginManagerSkillBindings();
  const mcpBindings = usePluginManagerMcpBindings();
  const settingsBindings = usePluginManagerSettingsBindings();
  const setAppModule = useUIStore((state) => state.setAppModule);
  return {
    pluginStore,
    setAppModule,
    ...skillBindings,
    ...mcpBindings,
    ...settingsBindings,
  };
}

export type PluginManagerBindings = ReturnType<typeof usePluginManagerBindings>;

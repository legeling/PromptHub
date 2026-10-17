import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Skill } from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SkillPlatformPanel } from "./SkillPlatformPanel";
import {
  getProjectDeployTargets,
  useSkillProjectDistribution,
} from "./useSkillProjectDistribution";

export function SkillQuickProjectDistribution({
  skill,
  onClose,
  onBusyChange,
}: {
  skill: Skill;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const project = useSkillProjectDistribution(skill);
  const preferences = useSettingsStore(
    (s) => s.projectSkillImportPreferencesByProjectId,
  );
  const setPreferences = useSettingsStore(
    (s) => s.setProjectSkillImportPreferences,
  );
  useEffect(() => {
    onBusyChange(project.isDeploying || project.pendingRemoval !== null);
  }, [onBusyChange, project.isDeploying, project.pendingRemoval]);
  return (
    <>
      <SkillPlatformPanel
        distributionOnly
        availablePlatforms={[]}
        selectedSkill={skill}
        t={t}
        handleExport={() => undefined}
        installMode="copy"
        setInstallMode={() => undefined}
        selectedPlatforms={new Set()}
        skillMdInstallStatus={{}}
        installProgress={null}
        isBatchInstalling={false}
        selectAllPlatforms={() => undefined}
        deselectAllPlatforms={() => undefined}
        togglePlatformSelection={() => undefined}
        uninstallFromPlatform={() => undefined}
        uninstalledPlatforms={[]}
        onBatchInstall={() => undefined}
        projects={project.skillProjects}
        projectDeployMode={project.deployMode}
        setProjectDeployMode={project.setProjectDeployMode}
        isProjectDeploying={project.isDeploying}
        getProjectDeployTargets={getProjectDeployTargets}
        getProjectDeployedTargets={project.getDeployedTargets}
        onDeployToProjects={project.deployToProjects}
        onCreateProject={() => {
          onClose();
          project.openCreateProjectModal();
        }}
        onRemoveFromProjectTargets={project.requestRemove}
        projectSkillImportPreferencesByProjectId={preferences}
        setProjectSkillImportPreferences={setPreferences}
      />
      <ConfirmDialog
        isOpen={project.pendingRemoval !== null}
        onClose={project.cancelPendingRemoval}
        onConfirm={() => void project.confirmRemove()}
        variant="destructive"
        isLoading={project.isDeploying}
        title={t("skill.confirmProjectRemoveTitle")}
        confirmText={t("skill.removeFromProject")}
        message={
          <div className="space-y-2">
            <p>
              {t("skill.confirmProjectRemoveMessage", {
                name: skill.name,
                project: project.pendingRemoval?.project.name ?? "",
                count: project.pendingRemoval?.targets.length ?? 0,
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("skill.projectRemoveDistributionHint")}
            </p>
          </div>
        }
      />
    </>
  );
}

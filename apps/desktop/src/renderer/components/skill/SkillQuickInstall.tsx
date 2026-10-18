import {
  formatSkillPlatformError,
  getSkillPlatformFailureSeverity,
  getSkillPlatformErrorFeedback,
} from "../../services/skill-platform-error";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import type { Skill } from "@prompthub/shared/types";
import { Modal } from "../ui/Modal";
import {
  SkillDistributionControls,
  SkillDistributionFooter,
} from "./SkillDistributionControls";
import { SkillQuickProjectDistribution } from "./SkillQuickProjectDistribution";
import { useSkillPlatform, type SkillInstallMode } from "./use-skill-platform";

interface SkillQuickInstallProps {
  skill: Skill;
  onClose: () => void;
}

/**
 * Quick Install Modal for Skills
 * 技能快速安装弹窗
 */
export function SkillQuickInstall({ skill, onClose }: SkillQuickInstallProps) {
  const { t } = useTranslation();
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );
  const { showToast } = useToast();
  const [scope, setScope] = useState<"global" | "project">("global");
  const [isProjectBusy, setIsProjectBusy] = useState(false);
  const [isClosingSoon, setIsClosingSoon] = useState(false);
  const [isInstallPending, setIsInstallPending] = useState(false);
  const [installMode, setInstallMode] =
    useState<SkillInstallMode>(skillInstallMethod);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const installPendingRef = useRef(false);
  const {
    availablePlatforms,
    applyPlatformChanges,
    isLoading,
    platformError,
    installProgress,
    installStatus,
    installDetails,
    isBatchInstalling,
    selectedPlatforms,
    selectAllPlatforms,
    togglePlatformSelection,
  } = useSkillPlatform(skill, installMode);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  useEffect(() => {
    setInstallMode(skillInstallMethod);
  }, [skill.id, skillInstallMethod]);

  const handleInstall = async (redistribute = false) => {
    if (
      isLoading ||
      platformError ||
      isClosingSoon ||
      isBatchInstalling ||
      installPendingRef.current
    ) {
      return;
    }

    installPendingRef.current = true;
    setIsInstallPending(true);
    try {
      const result = await applyPlatformChanges(
        redistribute ? "redistribute" : "changes",
      );
      if (result.statusRefreshFailed)
        showToast(t("skill.platformStatusRefreshFailed"), "warning");
      if (result.successCount > 0) {
        showToast(
          `${t("skill.installSuccess", "Operation successful")} ${result.successCount}/${result.totalCount}`,
          "success",
        );
      }
      // Surface per-platform failures even if some platforms succeeded.
      // Previously a partial failure looked like a silent success because
      // this handler closed the modal after the success toast without ever
      // reading `result.failures` (review feedback on #124).
      if (result.failures.length > 0) {
        const details = result.failures
          .map((failure) => {
            const platform = availablePlatforms.find(
              (entry) => entry.id === failure.platformId,
            );
            const label = platform?.name ?? failure.platformId;
            return t("skill.installFailureRow", {
              platform: label,
              reason: failure.reason,
              defaultValue: "{{platform}}: {{reason}}",
            });
          })
          .join("\n");
        showToast(
          t("skill.platformChangesFailed", {
            details,
            defaultValue: "Some platform changes failed\n{{details}}",
          }),
          getSkillPlatformFailureSeverity(result.failures),
        );
      }
      // Only auto-close when every selected platform succeeded. Otherwise
      // keep the modal open so the user can retry or inspect the failures.
      if (
        result.successCount > 0 &&
        result.failures.length === 0 &&
        !result.statusRefreshFailed
      ) {
        setIsClosingSoon(true);
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          onClose();
        }, 1000);
      }
    } catch (error) {
      console.error("Install failed:", error);
      showToast(
        formatSkillPlatformError(error),
        getSkillPlatformErrorFeedback(error).severity,
      );
    } finally {
      installPendingRef.current = false;
      setIsInstallPending(false);
    }
  };

  const isInstalling = isBatchInstalling || isInstallPending || isClosingSoon;
  const isBusy = isInstalling || isProjectBusy;
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title={t("skill.distribution.dialogTitle")}
      subtitle={skill.name}
      size="lg"
      closeOnEscape={!isBusy}
      closeOnBackdrop={!isBusy}
      showCloseButton={!isBusy}
      footer={
        scope === "global" && !isLoading && !platformError ? (
          <SkillDistributionFooter
            availablePlatforms={availablePlatforms}
            installStatus={installStatus}
            selectedPlatforms={selectedPlatforms}
            isBusy={isInstalling}
            installProgress={installProgress}
            onApply={() => void handleInstall()}
            onRedistribute={() => void handleInstall(true)}
            onCancel={onClose}
            layout="grid"
          />
        ) : undefined
      }
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="mb-5 flex gap-1 rounded-lg bg-accent/50 p-1">
        {(["global", "project"] satisfies Array<"global" | "project">).map(
          (value) => (
            <button
              type="button"
              key={value}
              aria-pressed={scope === value}
              disabled={isBusy}
              onClick={() => setScope(value)}
              className={
                "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 " +
                (scope === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t(
                value === "global"
                  ? "skill.globalDistribution"
                  : "skill.projectDistribution",
              )}
            </button>
          ),
        )}
      </div>
      {scope === "project" ? (
        <SkillQuickProjectDistribution
          skill={skill}
          onClose={onClose}
          onBusyChange={setIsProjectBusy}
        />
      ) : platformError ? (
        <p role="alert" className="text-sm text-destructive">
          {platformError}
        </p>
      ) : isLoading ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <SkillDistributionControls
          availablePlatforms={availablePlatforms}
          skillName={skill.name}
          installMode={installMode}
          setInstallMode={setInstallMode}
          installStatus={installStatus}
          installDetails={installDetails}
          selectedPlatforms={selectedPlatforms}
          isBusy={isInstalling}
          installProgress={installProgress}
          onToggle={togglePlatformSelection}
          onSelectAll={selectAllPlatforms}
          onApply={() => void handleInstall()}
          onRedistribute={() => void handleInstall(true)}
          onCancel={onClose}
          layout="grid"
          hideFooter
        />
      )}
    </Modal>
  );
}

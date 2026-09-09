import type { TFunction } from "i18next";
import type {
  CloudStorePackageResponse,
  RegistrySkill,
  Skill,
  SkillUpdateSafetyReview,
} from "@prompthub/shared/types";
import type { RegistrySkillUpdateCheck } from "../../services/skill-store-update";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { SkillStoreInstallReviewDialog } from "./SkillStoreInstallReviewDialog";
import { SkillStoreUpdateReviewDialog } from "./SkillStoreUpdateReviewDialog";
import { SkillUpdateSafetyReviewDialog } from "./SkillUpdateSafetyReviewDialog";

interface PackageReviewProps {
  review: SkillUpdateSafetyReview | null;
  trustSource: boolean;
  isLoading: boolean;
  onTrustSourceChange: (trusted: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

interface SkillStoreDetailOverlaysProps {
  t: TFunction;
  deploySkill: Skill | null;
  onCloseDeploy: () => void;
  updateCheck: RegistrySkillUpdateCheck | null;
  updateCloudDiff?: CloudStorePackageResponse["release"]["diff"];
  overwriteLocalChanges: boolean;
  isUpdating: boolean;
  onCloseUpdatePreview: () => void;
  onConfirmUpdatePreview: () => void;
  installSkill: RegistrySkill | null;
  installContent: string;
  installCloudDiff?: CloudStorePackageResponse["release"]["diff"];
  isInstalling: boolean;
  onCloseInstallPreview: () => void;
  onConfirmInstallPreview: () => void;
  installPackageReview: PackageReviewProps;
  updatePackageReview: PackageReviewProps;
  showRetranslatePrompt: boolean;
  onCloseRetranslate: () => void;
  onConfirmRetranslate: () => void;
}

export function SkillStoreDetailOverlays(props: SkillStoreDetailOverlaysProps) {
  return (
    <>
      {props.deploySkill ? (
        <SkillQuickInstall
          skill={props.deploySkill}
          onClose={props.onCloseDeploy}
        />
      ) : null}
      <SkillStoreUpdateReviewDialog
        check={props.updateCheck}
        cloudDiff={props.updateCloudDiff}
        overwriteLocalChanges={props.overwriteLocalChanges}
        isLoading={props.isUpdating}
        t={props.t}
        onClose={props.onCloseUpdatePreview}
        onConfirm={props.onConfirmUpdatePreview}
      />
      <SkillStoreInstallReviewDialog
        skill={props.installSkill}
        content={props.installContent}
        cloudDiff={props.installCloudDiff}
        isLoading={props.isInstalling}
        t={props.t}
        onClose={props.onCloseInstallPreview}
        onConfirm={props.onConfirmInstallPreview}
      />
      <PackageReviewDialog
        operation="install"
        review={props.installPackageReview}
        t={props.t}
      />
      <PackageReviewDialog
        operation="update"
        review={props.updatePackageReview}
        t={props.t}
      />
      <ConfirmDialog
        isOpen={props.showRetranslatePrompt}
        onClose={props.onCloseRetranslate}
        onConfirm={props.onConfirmRetranslate}
        title={props.t(
          "skill.translationOutdatedTitle",
          "Saved translation is outdated",
        )}
        message={props.t(
          "skill.translationOutdatedMessage",
          "This skill's SKILL.md changed after the last translation. Retranslate now?",
        )}
        confirmText={props.t("skill.retranslateNow", "Retranslate now")}
        cancelText={props.t("common.cancel", "Cancel")}
      />
    </>
  );
}

function PackageReviewDialog({
  operation,
  review,
  t,
}: {
  operation: "install" | "update";
  review: PackageReviewProps;
  t: TFunction;
}) {
  return (
    <SkillUpdateSafetyReviewDialog
      operation={operation}
      review={review.review}
      trustSource={review.trustSource}
      isLoading={review.isLoading}
      t={t}
      onTrustSourceChange={review.onTrustSourceChange}
      onClose={review.onClose}
      onConfirm={review.onConfirm}
    />
  );
}

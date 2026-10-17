import {
  DatabaseIcon,
  ExternalLinkIcon,
  FolderSyncIcon,
  NetworkIcon,
} from "lucide-react";
import type { TFunction } from "i18next";

import type { Skill } from "@prompthub/shared/types";

import { isLinkedLocalSkill } from "../../services/skill-source-resolver";
import { getSkillSourceMeta } from "./detail-utils";

interface SkillAssetTopologyProps {
  onOpenLocalPath: (path: string) => void;
  selectedSkill: Skill;
  t: TFunction;
}

function PathButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="mt-2 flex min-w-0 items-center gap-1.5 text-left font-mono text-xs text-primary hover:underline"
      onClick={onClick}
      title={label}
    >
      <span className="min-w-0 break-all">{label}</span>
      <ExternalLinkIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
    </button>
  );
}

export function SkillAssetTopology({
  onOpenLocalPath,
  selectedSkill,
  t,
}: SkillAssetTopologyProps) {
  const upstreamMeta = selectedSkill.source_url
    ? getSkillSourceMeta({ ...selectedSkill, local_repo_path: undefined }, t)
    : null;
  const linkedExternal = isLinkedLocalSkill(selectedSkill);

  return (
    <section className="space-y-4" aria-labelledby="skill-asset-topology-title">
      <h3
        id="skill-asset-topology-title"
        className="text-xs font-bold uppercase tracking-normal text-muted-foreground"
      >
        {t("skill.assetTopology", "Asset topology")}
      </h3>
      <ol className="grid overflow-hidden rounded-lg border border-border app-wallpaper-surface lg:grid-cols-2 lg:divide-x lg:divide-border">
        <li className="min-w-0 border-b border-border p-4 lg:border-b-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <NetworkIcon aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("skill.topologyUpstream", "Upstream source")}
          </div>
          {upstreamMeta ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                {upstreamMeta.sourceLabel}
              </p>
              {upstreamMeta.kind === "local" ? (
                <PathButton
                  label={upstreamMeta.displayValue}
                  onClick={() => onOpenLocalPath(upstreamMeta.value)}
                />
              ) : (
                <a
                  className="mt-2 flex min-w-0 items-center gap-1.5 font-mono text-xs text-primary hover:underline"
                  href={upstreamMeta.value}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={upstreamMeta.displayValue}
                >
                  <span className="min-w-0 break-all">
                    {upstreamMeta.displayValue}
                  </span>
                  <ExternalLinkIcon
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0"
                  />
                </a>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("skill.topologyNoUpstream", "No upstream source recorded")}
            </p>
          )}
        </li>

        <li className="min-w-0 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {linkedExternal ? (
              <FolderSyncIcon
                aria-hidden="true"
                className="h-4 w-4 text-primary"
              />
            ) : (
              <DatabaseIcon
                aria-hidden="true"
                className="h-4 w-4 text-primary"
              />
            )}
            {linkedExternal
              ? t("skill.topologyLinkedPackage", "Linked external package")
              : selectedSkill.local_repo_path
                ? t("skill.topologyManagedPackage", "PromptHub managed package")
                : t("skill.topologyDatabaseOnly", "Database content only")}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {linkedExternal
              ? t(
                  "skill.topologyLinkedPackageDesc",
                  "Edits write directly to this external folder; PromptHub does not replace it with a managed copy.",
                )
              : selectedSkill.local_repo_path
                ? t(
                    "skill.topologyManagedPackageDesc",
                    "Edits are saved here. Importing or updating from upstream can overwrite this package.",
                  )
                : t(
                    "skill.topologyDatabaseOnlyDesc",
                    "This Skill has no editable package directory.",
                  )}
          </p>
          {selectedSkill.local_repo_path ? (
            <PathButton
              label={selectedSkill.local_repo_path}
              onClick={() => onOpenLocalPath(selectedSkill.local_repo_path!)}
            />
          ) : null}
        </li>
      </ol>
    </section>
  );
}

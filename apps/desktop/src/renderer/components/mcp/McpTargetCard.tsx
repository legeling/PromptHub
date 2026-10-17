import { getSharedMcpConfigPath } from "@prompthub/shared/utils/mcp-shared-targets";
import { CheckIcon, FolderIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactElement } from "react";
import type { McpTargetPreset } from "@prompthub/shared/types/mcp";
import { PlatformIcon } from "../ui/PlatformIcon";

interface McpTargetCardProps {
  preset: McpTargetPreset;
  enabled: boolean;
  isDistributed: boolean;
  isSelected: boolean;
  isBusy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

export function McpTargetCard(props: McpTargetCardProps): ReactElement {
  const { t } = useTranslation();
  const { preset, enabled, isDistributed, isSelected, isBusy } = props;
  const sharedPath = getSharedMcpConfigPath(preset);
  const label = sharedPath
    ? `${t("mcp.sharedConfig")} (${sharedPath})`
    : preset.label;
  const className = `flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
    isDistributed
      ? "border-primary bg-primary/5"
      : isSelected
        ? "border-primary bg-primary/10"
        : "border-border bg-accent/30 hover:bg-accent/50"
  } ${isBusy || (!enabled && !isDistributed) ? "opacity-70" : ""}`;
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center"
        >
          {sharedPath ? (
            <FolderIcon className="h-7 w-7 text-primary" />
          ) : (
            <PlatformIcon
              platformId={preset.platformId ?? preset.id}
              size={28}
            />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-foreground">
            {sharedPath ? t("mcp.sharedConfig") : preset.label}
          </h4>
          <p className="text-[10px] text-muted-foreground">
            {isDistributed
              ? t("mcp.distributed")
              : isSelected
                ? t("mcp.selected")
                : t("skill.clickToSelect")}
          </p>
          <p
            title={preset.path}
            className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground/80"
          >
            {preset.path}
          </p>
        </div>
      </div>
      {isBusy ? (
        <Loader2Icon
          className="h-4 w-4 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : isDistributed ? (
        <div className="flex shrink-0 items-center gap-2">
          <CheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
          <button
            type="button"
            onClick={props.onRemove}
            title={t("mcp.removeFromTarget")}
            aria-label={t("mcp.removeFromTarget")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}
        >
          {isSelected ? <CheckIcon className="h-3 w-3 text-white" /> : null}
        </span>
      )}
    </>
  );
  return isDistributed ? (
    <div className={className}>{content}</div>
  ) : (
    <button
      type="button"
      disabled={!enabled || isBusy}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={props.onToggle}
      className={className}
    >
      {content}
    </button>
  );
}

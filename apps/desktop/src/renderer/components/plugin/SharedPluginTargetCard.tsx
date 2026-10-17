import { CheckIcon, FolderIcon, Settings2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

interface SharedPluginTargetCardProps {
  selected: boolean;
  installed: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}

export function SharedPluginTargetCard(
  props: SharedPluginTargetCardProps,
): ReactElement {
  const { t } = useTranslation();
  const content = (
    <>
      <div className="flex items-center gap-3">
        <FolderIcon
          className="h-6 w-6 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span className="text-sm font-medium">
          {t("plugin.sharedDirectory")}
        </span>
        <span className="shrink-0 whitespace-nowrap rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
          {t("skill.distribution.experimental")}
        </span>
        <span
          aria-hidden="true"
          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${props.selected || props.installed ? "border-primary bg-primary" : "border-muted-foreground/30"}`}
        >
          {(props.selected || props.installed) && (
            <CheckIcon className="h-3 w-3 text-white" />
          )}
        </span>
      </div>
      <p className="break-all rounded-lg bg-accent/50 px-2 py-1 font-mono text-xs">
        ~/.agents/plugins/
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("plugin.sharedDirectoryHint")}
      </p>
    </>
  );
  const classes = `w-full space-y-3 rounded-xl border p-3 text-left ${props.selected || props.installed ? "border-primary bg-primary/5" : "border-border bg-accent/20"}`;
  return (
    <section
      aria-label={t("skill.distribution.advancedTargets")}
      className="space-y-3 border-t border-border pt-4"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Settings2Icon className="h-4 w-4" />
        {t("skill.distribution.advancedTargets")}
      </h4>
      {props.installed ? (
        <div className={classes}>
          {content}
          <div className="flex items-center justify-between text-xs text-primary">
            <span>{t("plugin.installed")}</span>
            {props.onRemove && (
              <button
                type="button"
                disabled={props.busy}
                onClick={props.onRemove}
                className="text-destructive hover:underline"
              >
                {t("common.delete")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={classes}
          disabled={props.busy}
          aria-label={t("plugin.sharedDirectory")}
          aria-pressed={props.selected}
          onClick={props.onToggle}
        >
          {content}
        </button>
      )}
    </section>
  );
}

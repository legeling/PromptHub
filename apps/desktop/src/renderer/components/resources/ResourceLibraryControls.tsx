import type { ReactElement } from "react";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GalleryColumnSelect } from "../ui/GalleryColumnSelect";
import type { SelectProps } from "../ui/Select";

interface Props {
  columnsLabel?: string;
  viewMode: "gallery" | "list";
  onViewModeChange: (mode: "gallery" | "list") => void;
  columns: SelectProps["value"];
  columnOptions: SelectProps["options"];
  onColumnsChange: SelectProps["onChange"];
}

export function ResourceLibraryControls(props: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex shrink-0 items-center rounded-lg bg-muted p-0.5">
        {(["gallery", "list"] as const).map((mode) => {
          const Icon = mode === "gallery" ? LayoutGridIcon : ListIcon;
          const label = t(
            mode === "gallery" ? "skill.galleryView" : "skill.listView",
          );
          return (
            <button
              key={mode}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={props.viewMode === mode}
              onClick={() => props.onViewModeChange(mode)}
              className={`rounded-md p-2 transition-colors ${props.viewMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      {props.viewMode === "gallery" && (
        <GalleryColumnSelect
          ariaLabel={props.columnsLabel ?? t("skill.galleryColumnsLabel")}
          value={props.columns}
          options={props.columnOptions}
          onChange={props.onColumnsChange}
        />
      )}
    </>
  );
}

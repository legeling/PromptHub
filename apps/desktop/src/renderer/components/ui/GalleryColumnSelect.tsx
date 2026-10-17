import type { ReactElement } from "react";
import { Columns3Icon, LayoutGridIcon } from "lucide-react";
import { Select, type SelectProps } from "./Select";

type GalleryColumnSelectProps = Pick<
  SelectProps,
  "ariaLabel" | "value" | "onChange" | "options"
>;

export function GalleryColumnSelect({
  options,
  ...props
}: GalleryColumnSelectProps): ReactElement {
  return (
    <Select
      {...props}
      options={options.map((option) => {
        const Icon = option.value === "auto" ? LayoutGridIcon : Columns3Icon;
        return {
          ...option,
          label: (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {option.label}
            </span>
          ),
        };
      })}
      dropdownWidth="trigger"
      presentation="compact"
      className="w-auto shrink-0"
      triggerClassName="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border app-wallpaper-surface px-3.5 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}

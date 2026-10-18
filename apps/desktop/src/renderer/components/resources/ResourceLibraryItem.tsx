import { forwardRef, type HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  view: "gallery" | "list";
  selected?: boolean;
}

/** Shared visual shell; resource adapters own content, identity and available actions. */
export const ResourceLibraryItem = forwardRef<HTMLDivElement, Props>(
  function ResourceLibraryItem(
    { view, selected, className = "", ...props },
    ref,
  ) {
    const shape =
      view === "gallery"
        ? "relative min-h-[220px] rounded-2xl border p-5 hover:border-primary/40 hover:shadow-md"
        : "flex min-h-[72px] items-center gap-3 border-b border-border/60 px-5 py-3";
    const state = selected
      ? "border-primary bg-primary/10"
      : "border-border bg-card hover:bg-primary/5";
    return (
      <div
        ref={ref}
        {...props}
        className={`group min-w-0 cursor-pointer transition-colors ${shape} ${state} ${className}`}
      />
    );
  },
);

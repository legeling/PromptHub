import type { ReactElement, ReactNode } from "react";

/** Shared responsive width, focus motion and background layers for toolbar searches. */
export function ToolbarSearchFrame({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div className="group/search relative flex min-w-0 w-full items-center rounded-lg titlebar-no-drag transition-[width,box-shadow] duration-smooth ease-emphasized md:w-[82%] lg:w-3/4 focus-within:ring-2 focus-within:ring-primary/30 md:focus-within:w-[92%] lg:focus-within:w-[85%]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-smooth ease-standard group-hover/search:opacity-40 group-focus-within/search:!opacity-100"
      >
        <div className="app-wallpaper-search h-full w-full rounded-lg border" />
      </div>
      {children}
    </div>
  );
}

import { useEffect, useRef, type ReactElement } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { searchSettings, type SettingsSearchResult } from "./settings-search";
import { ToolbarSearchFrame } from "../ui/ToolbarSearchFrame";

interface SettingsSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  menu: readonly { id: string; labelKey: string }[];
  webRuntime: boolean;
  onSelect: (result: SettingsSearchResult) => void;
}

export function SettingsSearch({
  query,
  onQueryChange,
  menu,
  webRuntime,
  onSelect,
}: SettingsSearchProps): ReactElement {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const results = searchSettings(query, menu, t, webRuntime);
  useEffect(() => {
    const focus = (): void => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("shortcut:search", focus);
    return () => window.removeEventListener("shortcut:search", focus);
  }, []);
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-center border-b border-border app-wallpaper-toolbar px-4 titlebar-drag">
      <ToolbarSearchFrame>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 z-20 h-4 w-4 text-muted-foreground transition-colors duration-quick group-focus-within/search:text-primary"
        />
        <input
          ref={input}
          type="search"
          aria-label={t("settingsSearch.placeholder")}
          placeholder={t("settingsSearch.placeholder")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onQueryChange("");
            }
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              onSelect(results[0]);
            }
          }}
          className="relative z-10 h-9 min-w-0 w-full rounded-lg border border-transparent bg-transparent pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label={t("header.clearSearch")}
            onClick={() => {
              onQueryChange("");
              input.current?.focus();
            }}
            className="absolute right-2 top-2 z-20 rounded p-0.5 text-muted-foreground transition-colors duration-base hover:bg-muted animate-in fade-in"
          >
            <XIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
        {query.trim() ? (
          <section
            aria-label={t("settingsSearch.results")}
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-top-1 duration-base ease-enter"
          >
            {results.length ? (
              results.map((result) => (
                <button
                  key={`${result.section}:${result.labelKey}`}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-quick hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span>{t(result.labelKey)}</span>
                  {result.sectionKey !== result.labelKey ? (
                    <span className="text-xs text-muted-foreground">
                      {t(result.sectionKey)}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <p
                role="status"
                className="px-3 py-4 text-sm text-muted-foreground"
              >
                {t("settingsSearch.empty")}
              </p>
            )}
          </section>
        ) : null}
      </ToolbarSearchFrame>
    </header>
  );
}

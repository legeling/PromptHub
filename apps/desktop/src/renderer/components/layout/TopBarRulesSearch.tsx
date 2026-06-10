import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useRulesStore } from "../../stores/rules.store";

interface TopBarRulesSearchProps {
  searchInputRef: RefObject<HTMLInputElement>;
}

export function TopBarRulesSearch({ searchInputRef }: TopBarRulesSearchProps) {
  const { t } = useTranslation();
  const rulesSearchQuery = useRulesStore((state) => state.searchQuery);
  const setRulesSearchQuery = useRulesStore((state) => state.setSearchQuery);
  const ruleFiles = useRulesStore((state) => state.files);
  const selectRule = useRulesStore((state) => state.selectRule);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  const ruleSearchResults = useMemo(() => {
    const query = rulesSearchQuery.trim().toLowerCase();
    if (!query) {
      return ruleFiles;
    }

    return ruleFiles.filter((file) => {
      const haystack = [
        file.platformName,
        file.platformDescription,
        file.name,
        file.description,
        file.path,
        file.projectRootPath || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [ruleFiles, rulesSearchQuery]);

  const searchResultCount = ruleSearchResults.length;

  const navigateResult = useCallback(
    (direction: "prev" | "next") => {
      if (searchResultCount === 0) return;

      const newIndex =
        direction === "next"
          ? (currentResultIndex + 1) % searchResultCount
          : (currentResultIndex - 1 + searchResultCount) % searchResultCount;
      setCurrentResultIndex(newIndex);

      const rule = ruleSearchResults[newIndex];
      if (rule) {
        void selectRule(rule.id);
      }
    },
    [currentResultIndex, ruleSearchResults, searchResultCount, selectRule],
  );

  useEffect(() => {
    setCurrentResultIndex(0);
    const firstRule = ruleSearchResults[0];
    if (firstRule) {
      void selectRule(firstRule.id);
    }
  }, [ruleSearchResults, rulesSearchQuery, selectRule]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "Tab" &&
      rulesSearchQuery &&
      searchResultCount > 0
    ) {
      event.preventDefault();
      navigateResult(event.shiftKey ? "prev" : "next");
      return;
    }

    if (event.key === "Escape") {
      setRulesSearchQuery("");
      searchInputRef.current?.blur();
      return;
    }

    if (event.key === "Enter" && searchResultCount > 0) {
      event.preventDefault();
      const rule = ruleSearchResults[currentResultIndex];
      if (rule) {
        void selectRule(rule.id);
      }
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className="w-full max-w-lg relative flex items-center">
      <div className="app-wallpaper-search absolute inset-0 rounded-lg border pointer-events-none" />
      <SearchIcon
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10"
      />
      <input
        ref={searchInputRef}
        type="text"
        aria-label={t(
          "rules.searchPlaceholder",
          "Search rule files...",
        )}
        placeholder={t("rules.searchPlaceholder", "Search rule files...")}
        value={rulesSearchQuery}
        onChange={(event) => setRulesSearchQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={false}
        className="relative z-10 w-full h-9 pl-9 pr-32 rounded-lg border border-transparent bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      />
      {rulesSearchQuery ? (
        <div
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span className="text-xs text-muted-foreground tabular-nums px-1">
            {searchResultCount > 0
              ? `${currentResultIndex + 1}/${searchResultCount}`
              : t("header.noResults", "No results")}
          </span>

          {searchResultCount > 1 ? (
            <>
              <button
                type="button"
                onClick={() => navigateResult("prev")}
                className="p-1 rounded hover:bg-accent/60 transition-colors"
                aria-label={t("header.prevResult", "上一个 (Shift+Tab)")}
                title={t("header.prevResult", "上一个 (Shift+Tab)")}
              >
                <ChevronUpIcon
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-muted-foreground"
                />
              </button>
              <button
                type="button"
                onClick={() => navigateResult("next")}
                className="p-1 rounded hover:bg-accent/60 transition-colors"
                aria-label={t("header.nextResult", "下一个 (Tab)")}
                title={t("header.nextResult", "下一个 (Tab)")}
              >
                <ChevronDownIcon
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-muted-foreground"
                />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setRulesSearchQuery("")}
            className="p-1 rounded hover:bg-accent/60 transition-colors"
            aria-label={t("header.clearSearch", "清除搜索")}
            title={t("header.clearSearch", "清除搜索")}
          >
            <XIcon
              aria-hidden="true"
              className="w-3.5 h-3.5 text-muted-foreground"
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}

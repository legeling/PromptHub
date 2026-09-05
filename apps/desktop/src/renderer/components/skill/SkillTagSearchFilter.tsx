import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  TagsIcon,
  XIcon,
} from "lucide-react";
import { filterSkillTagOptions } from "../../services/skill-tag-options";

interface SkillTagSearchFilterProps {
  /**
   * Candidate tags (unique, trimmed, sorted) to show in the dropdown.
   * Derived in the container (`SkillManager`) from the skill collection.
   */
  options: string[];
  /**
   * Tags currently active in the shared skill filter store.
   */
  selected: string[];
  /**
   * Inverse the active state of one tag (store `toggleFilterTag`).
   */
  onToggle: (tag: string) => void;
  /**
   * Clear every active tag filter (store `clearFilterTags`).
   */
  onClear: () => void;
}

/**
 * A searchable, multi-select "filter by tag" control for the My Skills
 * header. It is deliberately presentation-only: selection state lives in the
 * shared skill store (`filterTags`) already used by the sidebar tag panel, so
 * both entry points stay in sync without a second data source.
 *
 * Selection matches any selected tag (OR), which the shared
 * `filterVisibleSkills` already applies against `filterTags`.
 *
 * “我的 Skill”头部的可搜索多选“按标签过滤”控件。它纯粹用于展示：
 * 选中状态保存在侧栏标签面板共用的 skill store（`filterTags`），因此两个
 * 入口保持同步且不会引入第二个数据源。匹配命中任一选中标签（OR），由共用
 * `filterVisibleSkills` 对 `filterTags` 的现有语义保证。
 */
export function SkillTagSearchFilter({
  options,
  selected,
  onToggle,
  onClear,
}: SkillTagSearchFilterProps): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const hasSelection = selected.length > 0;
  const visibleOptions = filterSkillTagOptions(options, query);

  // Close when clicking outside or pressing Escape; focus the search box
  // whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const node = event.target as Node | null;
      if (rootRef.current && !rootRef.current.contains(node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /**
   * Shows the panel (and clears the in-panel search query) when triggered.
   */
  function toggleOpen() {
    setOpen((current) => !current);
    setQuery("");
  }

  const baseToggleLabel = t("skill.tagFilterTooltip", "Filter by tag");
  const toggleAriaLabel = hasSelection
    ? t("skill.tagFilterTooltipActive", {
        count: selected.length,
        defaultValue: "Filter by tag ({{count}} active)",
      })
    : baseToggleLabel;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={toggleAriaLabel}
        title={toggleAriaLabel}
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
          hasSelection
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
        }`}
      >
        <TagsIcon aria-hidden="true" className="h-4 w-4" />
        <span aria-hidden="true">{baseToggleLabel}</span>
        {hasSelection ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"
            aria-hidden="true"
          >
            {selected.length}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong p-1 shadow-xl">
          <div className="p-1.5">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm">
              <SearchIcon
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("skill.tagFilterSearch", "Search tags")}
                aria-label={t("skill.tagFilterSearch", "Search tags")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <div
            role="group"
            aria-label={t("skill.tagFilterOptions", "Tag options")}
            className="max-h-60 overflow-y-auto px-1 py-1"
          >
            {visibleOptions.length === 0 ? (
              <div className="px-2.5 py-2 text-sm text-muted-foreground">
                {t("skill.noTagMatches", "No matching tags")}
              </div>
            ) : (
              visibleOptions.map((tag) => {
                const isSelected = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => onToggle(tag)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border"
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected ? (
                        <CheckIcon aria-hidden="true" className="h-3 w-3" />
                      ) : null}
                    </span>
                    <span className="truncate">{tag}</span>
                  </button>
                );
              })
            )}
          </div>

          {hasSelection ? (
            <div className="border-t border-border p-1.5">
              <ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
                {selected.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => onToggle(tag)}
                      aria-label={t("skill.removeTagWithName", {
                        tag,
                        defaultValue: 'Remove tag "{{tag}}"',
                      })}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs"
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-full bg-primary/10 py-0.5 pl-2 pr-1 text-primary">
                        <span className="truncate">{tag}</span>
                        <span className="rounded-full bg-primary/15 p-0.5 text-primary group-hover:bg-primary/25">
                          <XIcon aria-hidden="true" className="h-3 w-3" />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onClear}
                className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {t("skill.clearTagFilters", "Clear all tag filters")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import type { TFunction } from "i18next";
import {
  CheckSquareIcon,
  CuboidIcon,
  LayoutGridIcon,
  ListIcon,
  RefreshCwIcon,
  SendIcon,
  SquareIcon,
  StarIcon,
  TagsIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import type {
  SkillFilterType,
  SkillGalleryColumnMode,
} from "../../stores/skill.store";
import { Select, type SelectOption } from "../ui/Select";
import { SkillTagSearchFilter } from "./SkillTagSearchFilter";

export interface SkillManagerFilterOption {
  count: number;
  icon: React.ReactNode;
  label: string;
  value: SkillFilterType;
}

interface SkillManagerLibraryHeaderProps {
  activeSourceFilterKey: string;
  allVisibleSelected: boolean;
  canDistribute: boolean;
  currentPage: number;
  distributionStatsLabel: string | null;
  effectiveFilterType: SkillFilterType;
  effectiveStoreView: string;
  filteredCount: number;
  galleryColumnOptions: SelectOption[];
  galleryColumns: SkillGalleryColumnMode;
  hasActiveSourceFilter: boolean;
  headerSubtitle: string;
  headerTitle: string;
  isDistributionView: boolean;
  isRefreshingLibrary: boolean;
  isSelectionMode: boolean;
  mySkillFilterOptions: SkillManagerFilterOption[];
  onBatchDelete: () => void;
  onBatchDeploy: () => void;
  onBatchFavorite: () => void;
  onBatchTags: () => void;
  onFilterChange: (filter: SkillFilterType) => void;
  onGalleryColumnsChange: (columns: SkillGalleryColumnMode) => void;
  onRefresh: () => void;
  onSelectAllVisible: () => void;
  onSourceFilterChange: (value: string) => void;
  onToggleSelectionMode: () => void;
  onViewModeChange: (mode: "gallery" | "list") => void;
  pageSize: number;
  selectedCount: number;
  selectedSkillsAreFavorites: boolean;
  skillActiveTags: string[];
  skillTagOptions: string[];
  onToggleSkillTag: (tag: string) => void;
  onClearSkillTags: () => void;
  sourceFilterOptions: SelectOption[];
  t: TFunction;
  totalPages: number;
  totalSkillCount: number;
  viewMode: "gallery" | "list";
  webSkillLibraryMode: boolean;
}

type HeaderProps = SkillManagerLibraryHeaderProps;

function LibraryHeaderSummary(props: HeaderProps) {
  const countLabel = props.isDistributionView
    ? props.distributionStatsLabel
    : `${props.filteredCount}${
        props.effectiveFilterType !== "all" ? ` / ${props.totalSkillCount}` : ""
      }`;
  const showPageSummary = props.filteredCount > 0 && props.totalPages > 1;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CuboidIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{props.headerTitle}</h2>
        </div>
        <span className="inline-flex items-center rounded-full border border-white/5 bg-accent/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {countLabel}
        </span>
        {showPageSummary ? (
          <span className="text-[11px] text-muted-foreground">
            {props.t("skill.paginationSummary", {
              start: (props.currentPage - 1) * props.pageSize + 1,
              end: Math.min(
                props.currentPage * props.pageSize,
                props.filteredCount,
              ),
              total: props.filteredCount,
              defaultValue: `${(props.currentPage - 1) * props.pageSize + 1}-${Math.min(
                props.currentPage * props.pageSize,
                props.filteredCount,
              )} / ${props.filteredCount}`,
            })}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {props.headerSubtitle}
      </p>
    </div>
  );
}

function SelectionModeButton(props: HeaderProps) {
  const label = props.t("skill.batchManage", "Batch Manage");
  return (
    <button
      type="button"
      onClick={props.onToggleSelectionMode}
      aria-pressed={props.isSelectionMode}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        props.isSelectionMode
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border app-wallpaper-surface text-foreground hover:border-primary/25 hover:bg-accent"
      }`}
      title={label}
      aria-label={label}
    >
      {props.isSelectionMode ? (
        <XIcon aria-hidden="true" className="h-4 w-4" />
      ) : (
        <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded-md p-2 transition-colors ${
        active
          ? "app-wallpaper-surface text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={label}
    >
      {icon}
    </button>
  );
}

function GalleryLayoutControls(props: HeaderProps) {
  const galleryLabel = props.t("skill.galleryView", "Gallery View");
  const listLabel = props.t("skill.listView", "List View");
  return (
    <>
      <div className="flex items-center rounded-lg bg-muted p-0.5">
        <ViewModeButton
          active={props.viewMode === "gallery"}
          icon={<LayoutGridIcon aria-hidden="true" className="h-4 w-4" />}
          label={galleryLabel}
          onClick={() => props.onViewModeChange("gallery")}
        />
        <ViewModeButton
          active={props.viewMode === "list"}
          icon={<ListIcon aria-hidden="true" className="h-4 w-4" />}
          label={listLabel}
          onClick={() => props.onViewModeChange("list")}
        />
      </div>
      {props.viewMode === "gallery" ? (
        <Select
          ariaLabel={props.t("skill.galleryColumnsLabel", "Skill card columns")}
          value={props.galleryColumns}
          onChange={(value) =>
            props.onGalleryColumnsChange(value as SkillGalleryColumnMode)
          }
          options={props.galleryColumnOptions}
          className="w-[118px]"
          triggerClassName="h-10 w-full rounded-lg border border-border app-wallpaper-surface px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2"
        />
      ) : null}
    </>
  );
}

function RefreshLibraryButton(props: HeaderProps) {
  const label = `${props.t("settings.refresh")} - ${props.t(
    "skill.refreshLibraryHint",
    "Reload the PromptHub Skill library and platform distribution status.",
  )}`;
  return (
    <button
      type="button"
      onClick={props.onRefresh}
      disabled={props.isRefreshingLibrary}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={label}
      title={label}
    >
      <RefreshCwIcon
        aria-hidden="true"
        className={`h-4 w-4 ${props.isRefreshingLibrary ? "animate-spin" : ""}`}
      />
    </button>
  );
}

function LibraryHeaderControls(props: HeaderProps) {
  return (
    <div className="flex items-center gap-2 self-start lg:self-center lg:justify-end">
      <SelectionModeButton {...props} />
      <GalleryLayoutControls {...props} />
      <div className="h-4 w-px bg-border" />
      <RefreshLibraryButton {...props} />
    </div>
  );
}

function LibraryFilterBar(props: HeaderProps) {
  if (props.effectiveStoreView !== "my-skills" || props.webSkillLibraryMode) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.mySkillFilterOptions.map((option) => {
        const isActive = props.effectiveFilterType === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onFilterChange(option.value)}
            aria-pressed={isActive}
            className={`inline-flex h-9 min-w-[8rem] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
            }`}
          >
            {option.icon}
            <span>{option.label}</span>
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
      {props.skillTagOptions.length > 0 || props.skillActiveTags.length > 0 ? (
        <SkillTagSearchFilter
          options={props.skillTagOptions}
          selected={props.skillActiveTags}
          onToggle={props.onToggleSkillTag}
          onClear={props.onClearSkillTags}
        />
      ) : null}
      <Select
        ariaLabel={props.t("skill.sourceFilterLabel", "Skill source")}
        value={props.activeSourceFilterKey}
        onChange={props.onSourceFilterChange}
        options={props.sourceFilterOptions}
        className="min-w-[13rem] flex-1 sm:flex-none"
        triggerClassName={`h-9 w-full rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 ${props.hasActiveSourceFilter ? "border-primary/30 bg-primary/10 text-primary" : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"}`}
      />
    </div>
  );
}

function BatchTextButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  className: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={label}
      aria-label={label}
    >
      {children}
      {label}
    </button>
  );
}

function SelectAllButton(props: HeaderProps) {
  const label = props.allVisibleSelected
    ? props.t("common.clear", "Clear")
    : props.t("common.selectAll", "Select All");
  return (
    <BatchTextButton
      className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent"
      disabled={false}
      label={label}
      onClick={props.onSelectAllVisible}
    >
      {props.allVisibleSelected ? (
        <CheckSquareIcon aria-hidden="true" className="h-4 w-4 text-primary" />
      ) : (
        <SquareIcon
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground"
        />
      )}
    </BatchTextButton>
  );
}

function BatchSelectionSummary(props: HeaderProps) {
  return (
    <div className="px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
        {props.t("skill.selectionMode", "Batch Mode")}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">
        {props.t("skill.selectedCount", {
          count: props.selectedCount,
          defaultValue: `${props.selectedCount} selected`,
        })}
      </div>
    </div>
  );
}

function BatchActions(props: HeaderProps) {
  if (!props.isSelectionMode) return null;
  const disabled = props.selectedCount === 0;
  const favoriteLabel = props.selectedSkillsAreFavorites
    ? props.t("skill.removeFavorite", "Remove Favorite")
    : props.t("skill.addFavorite", "Add Favorite");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/[0.06] p-2">
      <BatchSelectionSummary {...props} />
      <SelectAllButton {...props} />
      <BatchTextButton
        className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
        disabled={disabled}
        label={favoriteLabel}
        onClick={props.onBatchFavorite}
      >
        <StarIcon aria-hidden="true" className="h-4 w-4 text-amber-500" />
      </BatchTextButton>
      <BatchTextButton
        className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
        disabled={disabled}
        label={props.t("skill.batchTags", "Batch Tags")}
        onClick={props.onBatchTags}
      >
        <TagsIcon aria-hidden="true" className="h-4 w-4 text-primary" />
      </BatchTextButton>
      {props.canDistribute ? (
        <BatchTextButton
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          disabled={disabled}
          label={props.t("skill.batchDeploy", "Batch Deploy")}
          onClick={props.onBatchDeploy}
        >
          <SendIcon aria-hidden="true" className="h-4 w-4" />
        </BatchTextButton>
      ) : null}
      <BatchTextButton
        className="inline-flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
        disabled={disabled}
        label={props.t("common.delete", "Delete")}
        onClick={props.onBatchDelete}
      >
        <TrashIcon aria-hidden="true" className="h-4 w-4" />
      </BatchTextButton>
    </div>
  );
}

export function SkillManagerLibraryHeader(props: HeaderProps) {
  return (
    <div className="z-10 border-b border-border app-wallpaper-panel-strong px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <LibraryHeaderSummary {...props} />
          <LibraryHeaderControls {...props} />
        </div>
        <LibraryFilterBar {...props} />
        <BatchActions {...props} />
      </div>
    </div>
  );
}

import { lazy, Suspense } from "react";
import type { TFunction } from "i18next";
import { ChevronLeftIcon, ChevronRightIcon, CuboidIcon } from "lucide-react";
import type { Skill } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { SKILL_LIST_PAGE_SIZE_OPTIONS } from "../../stores/settings.store";
import { SkillGalleryCard } from "./SkillGalleryCard";
import { Spinner } from "../ui/Spinner";

const MAX_STAGGERED_CARDS = 10;
const CARD_STAGGER_MS = 50;
const SkillListView = lazy(() =>
  import("./SkillListView").then((module) => ({
    default: module.SkillListView,
  })),
);

interface SkillManagerLibraryContentProps {
  currentPage: number;
  distributedPlatformsBySkillId: Map<
    string,
    Array<Pick<SkillPlatform, "id" | "name">>
  >;
  emptyStateHint: string;
  emptyStateTitle: string;
  filteredSkills: Skill[];
  isSelectionMode: boolean;
  onAddTag: (skill: Skill, tag: string) => void;
  onContextMenu: (event: React.MouseEvent, skill: Skill) => void;
  onOpen: (skillId: string | null) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onQuickInstall: (skill: Skill | null) => void;
  onRequestDelete: (skillIds: string[], skillNames: string[]) => void;
  onToggleFavorite: (skillId: string) => void | Promise<void>;
  onToggleSelection: (skillId: string) => void;
  pageSize: number;
  selectedSkillIds: Set<string>;
  skillGalleryGridStyle: React.CSSProperties;
  skillsWithStoreUpdates: Set<string>;
  t: TFunction;
  totalPages: number;
  viewMode: "gallery" | "list";
  visiblePageNumbers: number[];
  visibleSkills: Skill[];
}

type LibraryListProps = Pick<
  SkillManagerLibraryContentProps,
  | "isSelectionMode"
  | "onAddTag"
  | "onContextMenu"
  | "onQuickInstall"
  | "onRequestDelete"
  | "onToggleSelection"
  | "selectedSkillIds"
  | "skillsWithStoreUpdates"
  | "visibleSkills"
>;

function SkillLibraryList(props: LibraryListProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SkillListView
        skills={props.visibleSkills}
        skillsWithStoreUpdates={props.skillsWithStoreUpdates}
        onContextMenu={props.onContextMenu}
        onDropTag={props.onAddTag}
        onQuickInstall={props.onQuickInstall}
        onRequestDelete={(id, name) => props.onRequestDelete([id], [name])}
        selectionMode={props.isSelectionMode}
        selectedSkillIds={props.selectedSkillIds}
        onToggleSelection={props.onToggleSelection}
      />
    </Suspense>
  );
}

type GalleryItemProps = Pick<
  SkillManagerLibraryContentProps,
  | "distributedPlatformsBySkillId"
  | "isSelectionMode"
  | "onAddTag"
  | "onContextMenu"
  | "onOpen"
  | "onQuickInstall"
  | "onRequestDelete"
  | "onToggleFavorite"
  | "onToggleSelection"
  | "selectedSkillIds"
  | "skillsWithStoreUpdates"
> & { index: number; skill: Skill };

function SkillGalleryItem({ index, skill, ...props }: GalleryItemProps) {
  return (
    <SkillGalleryCard
      animationDelayMs={Math.min(index, MAX_STAGGERED_CARDS) * CARD_STAGGER_MS}
      distributedPlatforms={props.distributedPlatformsBySkillId.get(skill.id)}
      hasStoreUpdate={props.skillsWithStoreUpdates.has(skill.id)}
      isSelected={props.selectedSkillIds.has(skill.id)}
      isSelectionMode={props.isSelectionMode}
      onDelete={(selected) =>
        props.onRequestDelete([selected.id], [selected.name])
      }
      onContextMenu={props.onContextMenu}
      onDropTag={props.onAddTag}
      onOpen={props.onOpen}
      onQuickInstall={props.onQuickInstall}
      onToggleFavorite={props.onToggleFavorite}
      onToggleSelection={props.onToggleSelection}
      skill={skill}
    />
  );
}

type GalleryProps = Pick<
  SkillManagerLibraryContentProps,
  | "distributedPlatformsBySkillId"
  | "emptyStateHint"
  | "emptyStateTitle"
  | "filteredSkills"
  | "isSelectionMode"
  | "onAddTag"
  | "onContextMenu"
  | "onOpen"
  | "onQuickInstall"
  | "onRequestDelete"
  | "onToggleFavorite"
  | "onToggleSelection"
  | "selectedSkillIds"
  | "skillGalleryGridStyle"
  | "skillsWithStoreUpdates"
  | "visibleSkills"
>;

function SkillLibraryEmptyState({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in zoom-in-95 duration-slow">
      <div className="relative mb-6 rounded-full bg-accent/30 p-8">
        <CuboidIcon className="h-20 w-20 opacity-20" />
        <div className="absolute inset-0 animate-pulse rounded-full border-4 border-primary/10" />
      </div>
      <h3 className="mb-2 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mb-8 max-w-sm text-center text-sm opacity-70">{hint}</p>
    </div>
  );
}

function SkillLibraryGallery({
  emptyStateHint,
  emptyStateTitle,
  filteredSkills,
  skillGalleryGridStyle,
  visibleSkills,
  ...itemProps
}: GalleryProps) {
  if (filteredSkills.length === 0) {
    return (
      <SkillLibraryEmptyState title={emptyStateTitle} hint={emptyStateHint} />
    );
  }
  return (
    <div className="grid gap-4" style={skillGalleryGridStyle}>
      {visibleSkills.map((skill, index) => (
        <SkillGalleryItem
          key={skill.id}
          {...itemProps}
          index={index}
          skill={skill}
        />
      ))}
    </div>
  );
}

type PaginationProps = Pick<
  SkillManagerLibraryContentProps,
  | "currentPage"
  | "filteredSkills"
  | "onPageChange"
  | "onPageSizeChange"
  | "pageSize"
  | "t"
  | "totalPages"
  | "visiblePageNumbers"
>;

function PaginationButtons({
  currentPage,
  onPageChange,
  t,
  totalPages,
  visiblePageNumbers,
}: Omit<PaginationProps, "filteredSkills" | "onPageSizeChange" | "pageSize">) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label={t("common.previous", "Previous")}
        className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        title={t("common.previous", "Previous")}
      >
        <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      {visiblePageNumbers.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          aria-current={currentPage === page ? "page" : undefined}
          className={`h-8 w-8 rounded-md text-sm transition-colors ${
            currentPage === page ? "bg-primary text-white" : "hover:bg-accent"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label={t("common.next", "Next")}
        className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        title={t("common.next", "Next")}
      >
        <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function SkillLibraryPagination(props: PaginationProps) {
  const { currentPage, filteredSkills, onPageSizeChange, pageSize, t } = props;
  if (filteredSkills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border app-wallpaper-panel-strong px-4 py-3">
      <div className="text-sm text-muted-foreground">
        {t("skill.paginationSummary", {
          start: (currentPage - 1) * pageSize + 1,
          end: Math.min(currentPage * pageSize, filteredSkills.length),
          total: filteredSkills.length,
          defaultValue: `${(currentPage - 1) * pageSize + 1}-${Math.min(
            currentPage * pageSize,
            filteredSkills.length,
          )} / ${filteredSkills.length}`,
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("prompt.pageSize", "每页")}
          </span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
          >
            {SKILL_LIST_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <PaginationButtons {...props} />
      </div>
    </div>
  );
}

export function SkillManagerLibraryContent(
  props: SkillManagerLibraryContentProps,
) {
  return (
    <>
      <div
        className={
          props.viewMode === "list"
            ? "flex-1 overflow-hidden scrollbar-hide app-wallpaper-panel"
            : "flex-1 overflow-y-auto scrollbar-hide"
        }
      >
        {props.viewMode === "list" ? (
          <SkillLibraryList {...props} />
        ) : (
          <div className="p-6">
            <SkillLibraryGallery {...props} />
          </div>
        )}
      </div>
      <SkillLibraryPagination {...props} />
    </>
  );
}

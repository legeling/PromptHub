import { useMemo, useState, useCallback, type DragEvent } from "react";
import {
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  GripVerticalIcon,
  HashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  CreateOutputFormatItemDTO,
  OutputFormatItem,
  Prompt,
} from "@prompthub/shared/types";

type OutputFormatViewItem = {
  key: string;
  item: OutputFormatItem;
  targetPrompt: Prompt | null;
  isSelf: boolean;
};

export interface PromptOutputFormatPanelProps {
  currentPrompt: Prompt;
  prompts: Prompt[];
  outputFormatItems: OutputFormatItem[];
  onCreateOutputFormatItem: (
    data: CreateOutputFormatItemDTO,
  ) => Promise<OutputFormatItem> | void;
  onDeleteOutputFormatItem: (id: string) => Promise<void> | void;
  onReorderOutputFormatItem: (
    sourcePromptId: string,
    itemId: string,
    newSortOrder: number,
  ) => Promise<void> | void;
  onSelectPrompt: (promptId: string) => void;
  disabled?: boolean;
  className?: string;
}

function createOutputFormatItems(
  currentPrompt: Prompt,
  prompts: Prompt[],
  outputFormatItems: OutputFormatItem[],
): OutputFormatViewItem[] {
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));

  return outputFormatItems
    .filter((item) => item.sourcePromptId === currentPrompt.id)
    .map((item) => ({
      key: `outputFormat:${item.id}`,
      item,
      targetPrompt: item.targetPromptId
        ? (promptById.get(item.targetPromptId) ?? null)
        : currentPrompt,
      isSelf: item.targetPromptId === null,
    }));
}

function usePromptOutputFormatPanelState({
  currentPrompt,
  prompts,
  outputFormatItems,
  onCreateOutputFormatItem,
  onDeleteOutputFormatItem,
  onReorderOutputFormatItem,
}: Pick<
  PromptOutputFormatPanelProps,
  | "currentPrompt"
  | "prompts"
  | "outputFormatItems"
  | "onCreateOutputFormatItem"
  | "onDeleteOutputFormatItem"
  | "onReorderOutputFormatItem"
>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const formatItems = useMemo(
    () => createOutputFormatItems(currentPrompt, prompts, outputFormatItems),
    [currentPrompt, prompts, outputFormatItems],
  );

  const existingTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of formatItems) {
      if (item.item.targetPromptId) {
        ids.add(item.item.targetPromptId);
      } else {
        ids.add(currentPrompt.id);
      }
    }
    return ids;
  }, [currentPrompt.id, formatItems]);

  const candidatePrompts = useMemo(
    () => prompts.filter((prompt) => !existingTargetIds.has(prompt.id)),
    [existingTargetIds, prompts],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return candidatePrompts.filter(
      (prompt) =>
        prompt.title.toLowerCase().includes(lowerQuery) ||
        prompt.description?.toLowerCase().includes(lowerQuery) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
    );
  }, [candidatePrompts, query]);

  const handleAddSelf = useCallback(async () => {
    if (savingTargetId) return;
    if (!currentPrompt.id) return;
    setSavingTargetId("self");
    try {
      await onCreateOutputFormatItem({
        sourcePromptId: currentPrompt.id,
        targetPromptId: null,
      });
    } finally {
      setSavingTargetId(null);
    }
  }, [currentPrompt.id, onCreateOutputFormatItem, savingTargetId]);

  const handleAddPrompt = useCallback(
    async (targetPromptId: string) => {
      if (savingTargetId) return;
      if (!currentPrompt.id || !targetPromptId) return;
      setSavingTargetId(targetPromptId);
      try {
        const hasSelf = existingTargetIds.has(currentPrompt.id);
        if (!hasSelf) {
          await onCreateOutputFormatItem({
            sourcePromptId: currentPrompt.id,
            targetPromptId: null,
          });
        }
        await onCreateOutputFormatItem({
          sourcePromptId: currentPrompt.id,
          targetPromptId,
        });
        setQuery("");
      } finally {
        setSavingTargetId(null);
      }
    },
    [
      currentPrompt.id,
      existingTargetIds,
      onCreateOutputFormatItem,
      savingTargetId,
    ],
  );

  const handleDelete = useCallback(
    async (itemId: string) => {
      if (deletingId) return;
      setDeletingId(itemId);
      try {
        await onDeleteOutputFormatItem(itemId);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, onDeleteOutputFormatItem],
  );

  const handleDragStart = useCallback((e: DragEvent, itemId: string) => {
    setDraggingId(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent, targetItemId: string) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetItemId) {
        setDraggingId(null);
        return;
      }

      const targetIndex = formatItems.findIndex(
        (item) => item.item.id === targetItemId,
      );
      if (targetIndex === -1) {
        setDraggingId(null);
        return;
      }

      await onReorderOutputFormatItem(
        currentPrompt.id,
        draggingId,
        targetIndex,
      );
      setDraggingId(null);
    },
    [currentPrompt.id, draggingId, formatItems, onReorderOutputFormatItem],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  return {
    t,
    query,
    setQuery,
    formatItems,
    searchResults,
    savingTargetId,
    deletingId,
    draggingId,
    handleAddSelf,
    handleAddPrompt,
    handleDelete,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}

function PanelHeader({
  count,
  t,
}: {
  count: number;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <HashIcon aria-hidden="true" className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t("prompt.customOutputFormat.title", "Custom Output Format")}
        </h3>
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function OutputFormatSearch({
  query,
  searchResults,
  savingTargetId,
  disabled,
  onQueryChange,
  onAdd,
  onAddSelf,
  t,
}: {
  query: string;
  searchResults: Prompt[];
  savingTargetId: string | null;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onAdd: (promptId: string) => void;
  onAddSelf: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const showResults = query.trim().length > 0;

  return (
    <div className="relative mb-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
        <SearchIcon
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t(
            "prompt.customOutputFormat.searchPlaceholder",
            "Search prompts to add…",
          )}
          aria-label={t(
            "prompt.customOutputFormat.searchPlaceholder",
            "Search prompts to add…",
          )}
          className="h-9 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      {showResults && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {searchResults.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("prompt.customOutputFormat.noMatches", "No matching prompts")}
            </p>
          ) : (
            searchResults.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                disabled={savingTargetId !== null}
                onClick={() => onAdd(prompt.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                />
                <span className="truncate">{prompt.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        disabled={disabled || savingTargetId === "self"}
        onClick={onAddSelf}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/70 bg-card px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-primary"
        />
        <span>{t("prompt.customOutputFormat.addSelf", "Add current prompt")}</span>
      </button>
    </div>
  );
}

function OutputFormatItemRow({
  item,
  isDeleting,
  isDragging,
  disabled,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelectPrompt,
  t,
}: {
  item: OutputFormatViewItem;
  isDeleting: boolean;
  isDragging: boolean;
  disabled: boolean;
  onDelete: (itemId: string) => void;
  onDragStart: (e: DragEvent, itemId: string) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, itemId: string) => void;
  onDragEnd: () => void;
  onSelectPrompt: (promptId: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const removeLabel = t("prompt.customOutputFormat.removeItem", {
    title: item.isSelf
      ? t("prompt.customOutputFormat.self", "Current")
      : item.targetPrompt?.title,
    defaultValue: `Remove item`,
  });

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.item.id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, item.item.id)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-2 transition-all ${
        isDragging ? "opacity-50" : ""
      } ${disabled ? "opacity-50" : ""}`}
    >
      <GripVerticalIcon
        aria-hidden="true"
        className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/55"
      />
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
        {item.item.sortOrder + 1}
      </span>
      <button
        type="button"
        onClick={() =>
          !item.isSelf && onSelectPrompt(item.item.targetPromptId!)
        }
        className="min-w-0 flex-1 text-left text-xs text-foreground truncate transition-colors hover:text-primary"
        disabled={item.isSelf}
      >
        {item.isSelf ? (
          <span className="flex items-center gap-1">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t("prompt.customOutputFormat.self", "Self")}
            </span>
            <span className="truncate">
              {item.targetPrompt?.title ||
                t("prompt.customOutputFormat.self", "Self")}
            </span>
          </span>
        ) : (
          item.targetPrompt?.title ||
          t("prompt.customOutputFormat.missing", "Missing")
        )}
      </button>
      <button
        type="button"
        disabled={disabled || isDeleting}
        onClick={() => onDelete(item.item.id)}
        aria-label={removeLabel}
        title={removeLabel}
        className="inline-flex w-7 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function OutputFormatList({
  formatItems,
  deletingId,
  draggingId,
  disabled,
  t,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelectPrompt,
}: {
  formatItems: OutputFormatViewItem[];
  deletingId: string | null;
  draggingId: string | null;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  onDelete: (itemId: string) => void;
  onDragStart: (e: DragEvent, itemId: string) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, itemId: string) => void;
  onDragEnd: () => void;
  onSelectPrompt: (promptId: string) => void;
}) {
  if (formatItems.length === 0) {
    return (
      <p className="mb-3 text-xs text-muted-foreground">
        {t(
          "prompt.customOutputFormat.empty",
          "No output format configured. Add prompts to create a custom output sequence.",
        )}
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-1">
      {formatItems.map((item) => (
        <OutputFormatItemRow
          key={item.key}
          item={item}
          isDeleting={deletingId === item.item.id}
          isDragging={draggingId === item.item.id}
          disabled={disabled}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onSelectPrompt={onSelectPrompt}
          t={t}
        />
      ))}
    </div>
  );
}

export function PromptOutputFormatPanel({
  currentPrompt,
  prompts,
  outputFormatItems,
  onCreateOutputFormatItem,
  onDeleteOutputFormatItem,
  onReorderOutputFormatItem,
  onSelectPrompt,
  disabled = false,
  className = "",
}: PromptOutputFormatPanelProps) {
  const state = usePromptOutputFormatPanelState({
    currentPrompt,
    prompts,
    outputFormatItems,
    onCreateOutputFormatItem,
    onDeleteOutputFormatItem,
    onReorderOutputFormatItem,
  });

  return (
    <section
      className={`mb-4 rounded-xl border border-border app-wallpaper-surface p-3 ${className}`}
    >
      <PanelHeader count={state.formatItems.length} t={state.t} />
      <OutputFormatSearch
        query={state.query}
        searchResults={state.searchResults}
        savingTargetId={state.savingTargetId}
        disabled={disabled}
        onQueryChange={state.setQuery}
        onAdd={(promptId) => void state.handleAddPrompt(promptId)}
        onAddSelf={() => void state.handleAddSelf()}
        t={state.t}
      />
      <OutputFormatList
        formatItems={state.formatItems}
        deletingId={state.deletingId}
        draggingId={state.draggingId}
        disabled={disabled}
        t={state.t}
        onDelete={(itemId) => void state.handleDelete(itemId)}
        onDragStart={state.handleDragStart}
        onDragOver={state.handleDragOver}
        onDrop={state.handleDrop}
        onDragEnd={state.handleDragEnd}
        onSelectPrompt={onSelectPrompt}
      />
    </section>
  );
}

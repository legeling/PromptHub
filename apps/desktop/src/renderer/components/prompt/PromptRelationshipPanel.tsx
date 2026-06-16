import { useMemo, useRef, useState } from "react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  GitBranchIcon,
  Link2Icon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptGraphRelationKind,
  PromptRelation,
} from "@prompthub/shared/types";
import {
  buildRelationSuggestions,
  searchRelationCandidates,
  type RelationSuggestion,
} from "./prompt-relation-suggestions";

type RelationViewItem = {
  key: string;
  relation: PromptRelation | null;
  targetPrompt: Prompt;
  labelKey: string;
  fallbackLabel: string;
  direction: "outgoing" | "incoming" | "neutral";
  isTreeRelation?: boolean;
};

type RelationLabel = Pick<
  RelationViewItem,
  "labelKey" | "fallbackLabel" | "direction"
>;

type RelationIcon = typeof ArrowDownLeftIcon;

type DirectionalLabel = {
  outgoing: RelationLabel;
  incoming: RelationLabel;
};

const RELATED_LABEL: RelationLabel = {
  labelKey: "prompt.relationships.relatedTo",
  fallbackLabel: "Related",
  direction: "neutral",
};

// Existing relations may still carry the older directional kinds, so we keep
// rendering their labels. New relations are always created as `related_to`.
const DIRECTIONAL_RELATION_LABELS: Record<
  Exclude<PromptGraphRelationKind, "related_to">,
  DirectionalLabel
> = {
  variant_of: {
    outgoing: {
      labelKey: "prompt.relationships.variantOf",
      fallbackLabel: "Variant of",
      direction: "outgoing",
    },
    incoming: {
      labelKey: "prompt.relationships.hasVariant",
      fallbackLabel: "Has variant",
      direction: "incoming",
    },
  },
  depends_on: {
    outgoing: {
      labelKey: "prompt.relationships.dependsOn",
      fallbackLabel: "Depends on",
      direction: "outgoing",
    },
    incoming: {
      labelKey: "prompt.relationships.requiredBy",
      fallbackLabel: "Required by",
      direction: "incoming",
    },
  },
  next_step: {
    outgoing: {
      labelKey: "prompt.relationships.nextStep",
      fallbackLabel: "Next step",
      direction: "outgoing",
    },
    incoming: {
      labelKey: "prompt.relationships.previousStep",
      fallbackLabel: "Previous step",
      direction: "incoming",
    },
  },
};

export interface PromptRelationshipPanelProps {
  currentPrompt: Prompt;
  prompts: Prompt[];
  relations: PromptRelation[];
  relationshipCount?: number;
  onCreateRelation: (data: CreatePromptRelationDTO) => Promise<void> | void;
  onDeleteRelation: (id: string) => Promise<void> | void;
  onSelectPrompt: (promptId: string) => void;
  disabled?: boolean;
  className?: string;
}

function getRelationLabel(
  relation: PromptRelation,
  currentPromptId: string,
): RelationLabel {
  if (relation.kind === "related_to") {
    return RELATED_LABEL;
  }

  const direction =
    relation.sourcePromptId === currentPromptId ? "outgoing" : "incoming";
  return DIRECTIONAL_RELATION_LABELS[relation.kind][direction];
}

function createRelationItems(
  currentPrompt: Prompt,
  prompts: Prompt[],
  relations: PromptRelation[],
): RelationViewItem[] {
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const parentPrompt = currentPrompt.parentId
    ? promptById.get(currentPrompt.parentId)
    : null;
  const treeItems: RelationViewItem[] = [];

  if (parentPrompt) {
    treeItems.push({
      key: `parent:${parentPrompt.id}`,
      relation: null,
      targetPrompt: parentPrompt,
      labelKey: "prompt.parentPrompt",
      fallbackLabel: "Parent",
      direction: "incoming",
      isTreeRelation: true,
    });
  }

  for (const prompt of prompts) {
    if (prompt.parentId === currentPrompt.id) {
      treeItems.push({
        key: `child:${prompt.id}`,
        relation: null,
        targetPrompt: prompt,
        labelKey: "prompt.childPrompts",
        fallbackLabel: "Child",
        direction: "outgoing",
        isTreeRelation: true,
      });
    }
  }

  const graphItems: Array<RelationViewItem | null> = relations
    .filter(
      (relation) =>
        relation.sourcePromptId === currentPrompt.id ||
        relation.targetPromptId === currentPrompt.id,
    )
    .map((relation) => {
      const otherPromptId =
        relation.sourcePromptId === currentPrompt.id
          ? relation.targetPromptId
          : relation.sourcePromptId;
      const targetPrompt = promptById.get(otherPromptId);

      if (!targetPrompt) {
        return null;
      }

      return {
        key: `relation:${relation.id}`,
        relation,
        targetPrompt,
        ...getRelationLabel(relation, currentPrompt.id),
      };
    })
    .filter((item): item is RelationViewItem => item !== null);

  return [...treeItems, ...graphItems];
}

function usePromptRelationshipPanelState({
  currentPrompt,
  prompts,
  relations,
  relationshipCount,
  onCreateRelation,
  onDeleteRelation,
}: Pick<
  PromptRelationshipPanelProps,
  | "currentPrompt"
  | "prompts"
  | "relations"
  | "relationshipCount"
  | "onCreateRelation"
  | "onDeleteRelation"
>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const relationItems = useMemo(
    () => createRelationItems(currentPrompt, prompts, relations),
    [currentPrompt, prompts, relations],
  );
  const effectiveRelationshipCount = relationshipCount ?? relationItems.length;

  // Prompts already connected (semantic or tree) are excluded from search and
  // suggestions so we never offer a duplicate link.
  const excludedIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(currentPrompt.id);
    for (const item of relationItems) {
      ids.add(item.targetPrompt.id);
    }
    if (currentPrompt.parentId) {
      ids.add(currentPrompt.parentId);
    }
    for (const prompt of prompts) {
      if (prompt.parentId === currentPrompt.id) {
        ids.add(prompt.id);
      }
    }
    return ids;
  }, [currentPrompt.id, currentPrompt.parentId, prompts, relationItems]);

  const candidatePrompts = useMemo(
    () => prompts.filter((prompt) => !excludedIds.has(prompt.id)),
    [excludedIds, prompts],
  );

  const searchResults = useMemo(
    () => searchRelationCandidates(query, candidatePrompts),
    [candidatePrompts, query],
  );

  const suggestions = useMemo(
    () => buildRelationSuggestions(currentPrompt, prompts, excludedIds),
    [currentPrompt, excludedIds, prompts],
  );

  const handleAddRelation = async (targetPromptId: string) => {
    if (savingTargetId) {
      return;
    }

    setSavingTargetId(targetPromptId);
    try {
      await onCreateRelation({
        sourcePromptId: currentPrompt.id,
        targetPromptId,
        kind: "related_to",
      });
      setQuery("");
    } finally {
      setSavingTargetId(null);
    }
  };

  const handleDelete = async (relation: PromptRelation) => {
    if (deletingId) {
      return;
    }

    setDeletingId(relation.id);
    try {
      await onDeleteRelation(relation.id);
    } finally {
      setDeletingId(null);
    }
  };

  return {
    t,
    query,
    setQuery,
    relationItems,
    relationshipCount: effectiveRelationshipCount,
    searchResults,
    suggestions,
    savingTargetId,
    deletingId,
    handleAddRelation,
    handleDelete,
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
        <GitBranchIcon aria-hidden="true" className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t("prompt.relationships.title", "Prompt relationships")}
        </h3>
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function RelationSearch({
  query,
  searchResults,
  savingTargetId,
  disabled,
  onQueryChange,
  onAdd,
  t,
}: {
  query: string;
  searchResults: Prompt[];
  savingTargetId: string | null;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onAdd: (promptId: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showResults = query.trim().length > 0;

  return (
    <div className="relative mb-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
        <SearchIcon
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t(
            "prompt.relationships.searchPlaceholder",
            "Search prompts to link…",
          )}
          aria-label={t(
            "prompt.relationships.searchPlaceholder",
            "Search prompts to link…",
          )}
          className="h-9 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      {showResults && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {searchResults.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("prompt.relationships.noMatches", "No matching prompts")}
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
    </div>
  );
}

function RelationChip({
  item,
  disabled,
  isDeleting,
  onDelete,
  onSelectPrompt,
  t,
}: {
  item: RelationViewItem;
  disabled: boolean;
  isDeleting: boolean;
  onDelete: (relation: PromptRelation) => void;
  onSelectPrompt: (promptId: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const Icon: RelationIcon =
    item.direction === "incoming"
      ? ArrowDownLeftIcon
      : item.direction === "outgoing"
        ? ArrowUpRightIcon
        : Link2Icon;
  const removeLabel = t("prompt.relationships.removeRelation", {
    title: item.targetPrompt.title,
    defaultValue: `Remove relation to ${item.targetPrompt.title}`,
  });
  const canDelete = item.relation !== null && !item.isTreeRelation;

  return (
    <span className="inline-flex max-w-full items-stretch overflow-hidden rounded-full border border-border/70 bg-card text-xs shadow-sm">
      <button
        type="button"
        onClick={() => onSelectPrompt(item.targetPrompt.id)}
        aria-label={t("prompt.relationships.openPrompt", {
          title: item.targetPrompt.title,
          defaultValue: `Open related prompt ${item.targetPrompt.title}`,
        })}
        className="inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 text-left text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="shrink-0 text-muted-foreground">
          {t(item.labelKey, item.fallbackLabel)}
        </span>
        <span className="max-w-[12rem] truncate">{item.targetPrompt.title}</span>
      </button>
      {canDelete && item.relation && (
        <button
          type="button"
          disabled={disabled || isDeleting}
          onClick={() => onDelete(item.relation)}
          aria-label={removeLabel}
          title={removeLabel}
          className="inline-flex w-7 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function RelationList({
  relationItems,
  deletingId,
  disabled,
  t,
  onDelete,
  onSelectPrompt,
}: {
  relationItems: RelationViewItem[];
  deletingId: string | null;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  onDelete: (relation: PromptRelation) => void;
  onSelectPrompt: (promptId: string) => void;
}) {
  if (relationItems.length === 0) {
    return (
      <p className="mb-3 text-xs text-muted-foreground">
        {t(
          "prompt.relationships.empty",
          "No semantic relationships yet. Tree grouping is still controlled by drag-and-drop in the list.",
        )}
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {relationItems.map((item) => (
        <RelationChip
          key={item.key}
          item={item}
          disabled={disabled}
          isDeleting={deletingId === item.relation?.id}
          onDelete={onDelete}
          onSelectPrompt={onSelectPrompt}
          t={t}
        />
      ))}
    </div>
  );
}

function getSuggestionReasonLabel(
  suggestion: RelationSuggestion,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (suggestion.reason === "same_tag") {
    return t("prompt.relationships.reasonSameTag", {
      tag: suggestion.sharedTag,
      defaultValue: `#${suggestion.sharedTag}`,
    });
  }
  if (suggestion.reason === "same_folder") {
    return t("prompt.relationships.reasonSameFolder", "Same folder");
  }
  return t("prompt.relationships.reasonSimilarTitle", "Similar title");
}

function RelationSuggestions({
  suggestions,
  savingTargetId,
  disabled,
  t,
  onAdd,
}: {
  suggestions: RelationSuggestion[];
  savingTargetId: string | null;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  onAdd: (promptId: string) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SparklesIcon aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
        {t("prompt.relationships.suggestionsTitle", "Suggested links")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.prompt.id}
            type="button"
            disabled={disabled || savingTargetId !== null}
            onClick={() => onAdd(suggestion.prompt.id)}
            aria-label={t("prompt.relationships.addSuggestion", {
              title: suggestion.prompt.title,
              defaultValue: `Link ${suggestion.prompt.title}`,
            })}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-card px-2.5 py-1 text-xs text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-primary"
            />
            <span className="max-w-[12rem] truncate">
              {suggestion.prompt.title}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {getSuggestionReasonLabel(suggestion, t)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PromptRelationshipPanel({
  currentPrompt,
  prompts,
  relations,
  relationshipCount,
  onCreateRelation,
  onDeleteRelation,
  onSelectPrompt,
  disabled = false,
  className = "",
}: PromptRelationshipPanelProps) {
  const state = usePromptRelationshipPanelState({
    currentPrompt,
    prompts,
    relations,
    relationshipCount,
    onCreateRelation,
    onDeleteRelation,
  });

  return (
    <section
      className={`mb-4 rounded-xl border border-border app-wallpaper-surface p-3 ${className}`}
    >
      <PanelHeader count={state.relationshipCount} t={state.t} />
      <RelationSearch
        query={state.query}
        searchResults={state.searchResults}
        savingTargetId={state.savingTargetId}
        disabled={disabled}
        onQueryChange={state.setQuery}
        onAdd={(promptId) => void state.handleAddRelation(promptId)}
        t={state.t}
      />
      <RelationList
        relationItems={state.relationItems}
        deletingId={state.deletingId}
        disabled={disabled}
        t={state.t}
        onDelete={(relation) => void state.handleDelete(relation)}
        onSelectPrompt={onSelectPrompt}
      />
      <RelationSuggestions
        suggestions={state.suggestions}
        savingTargetId={state.savingTargetId}
        disabled={disabled}
        t={state.t}
        onAdd={(promptId) => void state.handleAddRelation(promptId)}
      />
    </section>
  );
}

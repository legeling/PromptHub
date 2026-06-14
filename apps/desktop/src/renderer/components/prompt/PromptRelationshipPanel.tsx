import { useMemo, useState } from "react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  GitBranchIcon,
  Link2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptGraphRelationKind,
  PromptRelation,
} from "@prompthub/shared/types";

const RELATION_KINDS: PromptGraphRelationKind[] = [
  "related_to",
  "variant_of",
  "depends_on",
  "next_step",
];

type RelationViewItem = {
  relation: PromptRelation;
  targetPrompt: Prompt;
  labelKey: string;
  fallbackLabel: string;
  direction: "outgoing" | "incoming" | "neutral";
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
  onCreateRelation: (data: CreatePromptRelationDTO) => Promise<void> | void;
  onDeleteRelation: (id: string) => Promise<void> | void;
  onSelectPrompt: (promptId: string) => void;
  disabled?: boolean;
  className?: string;
}

interface PromptRelationshipPanelViewProps {
  relationItems: RelationViewItem[];
  candidatePrompts: Prompt[];
  relationKind: PromptGraphRelationKind;
  targetPromptId: string;
  canCreate: boolean;
  isSaving: boolean;
  deletingId: string | null;
  disabled: boolean;
  className: string;
  t: ReturnType<typeof useTranslation>["t"];
  onKindChange: (kind: PromptGraphRelationKind) => void;
  onTargetChange: (promptId: string) => void;
  onCreate: () => void;
  onDelete: (relation: PromptRelation) => void;
  onSelectPrompt: (promptId: string) => void;
}

interface RelationChipProps {
  item: RelationViewItem;
  disabled: boolean;
  isDeleting: boolean;
  onDelete: (relation: PromptRelation) => void;
  onSelectPrompt: (promptId: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}

interface RelationFormProps {
  relationKind: PromptGraphRelationKind;
  targetPromptId: string;
  candidatePrompts: Prompt[];
  canCreate: boolean;
  isSaving: boolean;
  disabled: boolean;
  onKindChange: (kind: PromptGraphRelationKind) => void;
  onTargetChange: (promptId: string) => void;
  onCreate: () => void;
  t: ReturnType<typeof useTranslation>["t"];
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

  return relations
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
        relation,
        targetPrompt,
        ...getRelationLabel(relation, currentPrompt.id),
      };
    })
    .filter((item): item is RelationViewItem => item !== null);
}

function usePromptRelationshipPanelState({
  currentPrompt,
  prompts,
  relations,
  onCreateRelation,
  onDeleteRelation,
}: Pick<
  PromptRelationshipPanelProps,
  | "currentPrompt"
  | "prompts"
  | "relations"
  | "onCreateRelation"
  | "onDeleteRelation"
>) {
  const { t } = useTranslation();
  const [relationKind, setRelationKind] =
    useState<PromptGraphRelationKind>("related_to");
  const [targetPromptId, setTargetPromptId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const relationItems = useMemo(
    () => createRelationItems(currentPrompt, prompts, relations),
    [currentPrompt, prompts, relations],
  );
  const candidatePrompts = useMemo(
    () =>
      prompts
        .filter((prompt) => prompt.id !== currentPrompt.id)
        .sort((left, right) => left.title.localeCompare(right.title)),
    [currentPrompt.id, prompts],
  );
  const canCreate = Boolean(targetPromptId) && !isSaving;

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }

    setIsSaving(true);
    try {
      await onCreateRelation({
        sourcePromptId: currentPrompt.id,
        targetPromptId,
        kind: relationKind,
      });
      setTargetPromptId("");
    } finally {
      setIsSaving(false);
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
    relationItems,
    candidatePrompts,
    relationKind,
    targetPromptId,
    canCreate,
    isSaving,
    deletingId,
    setRelationKind,
    setTargetPromptId,
    handleCreate,
    handleDelete,
  };
}

function RelationChip({
  item,
  disabled,
  isDeleting,
  onDelete,
  onSelectPrompt,
  t,
}: RelationChipProps) {
  return (
    <RelationChipActions
      item={item}
      disabled={disabled}
      isDeleting={isDeleting}
      onDelete={onDelete}
      onSelectPrompt={onSelectPrompt}
      t={t}
    />
  );
}

function RelationKindSelect({
  relationKind,
  disabled,
  isSaving,
  onKindChange,
  t,
}: Pick<
  RelationFormProps,
  "relationKind" | "disabled" | "isSaving" | "onKindChange" | "t"
>) {
  return (
    <>
      <label className="sr-only" htmlFor="prompt-relation-kind">
        {t("prompt.relationships.typeLabel", "Relation type")}
      </label>
      <select
        id="prompt-relation-kind"
        aria-label={t("prompt.relationships.typeLabel", "Relation type")}
        value={relationKind}
        disabled={disabled || isSaving}
        onChange={(event) => {
          onKindChange(event.target.value as PromptGraphRelationKind);
        }}
        className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      >
        {RELATION_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {t(`prompt.relationships.kind.${kind}`, kind)}
          </option>
        ))}
      </select>
    </>
  );
}

function RelationTargetSelect({
  targetPromptId,
  candidatePrompts,
  disabled,
  isSaving,
  onTargetChange,
  t,
}: Pick<
  RelationFormProps,
  | "targetPromptId"
  | "candidatePrompts"
  | "disabled"
  | "isSaving"
  | "onTargetChange"
  | "t"
>) {
  return (
    <>
      <label className="sr-only" htmlFor="prompt-relation-target">
        {t("prompt.relationships.targetLabel", "Target prompt")}
      </label>
      <select
        id="prompt-relation-target"
        aria-label={t("prompt.relationships.targetLabel", "Target prompt")}
        value={targetPromptId}
        disabled={disabled || isSaving || candidatePrompts.length === 0}
        onChange={(event) => onTargetChange(event.target.value)}
        className="h-8 min-w-0 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      >
        <option value="">
          {t("prompt.relationships.selectTarget", "Select a prompt")}
        </option>
        {candidatePrompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.title}
          </option>
        ))}
      </select>
    </>
  );
}

function RelationAddButton({
  canCreate,
  onCreate,
  t,
}: Pick<RelationFormProps, "canCreate" | "onCreate" | "t">) {
  return (
    <button
      type="button"
      disabled={!canCreate}
      onClick={onCreate}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <PlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
      {t("prompt.relationships.add", "Add relation")}
    </button>
  );
}

function RelationChipButton({
  item,
  Icon,
  onSelectPrompt,
  t,
}: {
  item: RelationViewItem;
  Icon: RelationIcon;
  onSelectPrompt: (promptId: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
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
  );
}

function RelationChipDeleteButton({
  disabled,
  isDeleting,
  removeLabel,
  onDelete,
  relation,
}: {
  disabled: boolean;
  isDeleting: boolean;
  removeLabel: string;
  onDelete: (relation: PromptRelation) => void;
  relation: PromptRelation;
}) {
  return (
    <button
      type="button"
      disabled={disabled || isDeleting}
      onClick={() => onDelete(relation)}
      aria-label={removeLabel}
      title={removeLabel}
      className="inline-flex w-7 items-center justify-center border-l border-border/70 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}

function RelationChipFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-stretch overflow-hidden rounded-full border border-border/70 bg-card text-xs shadow-sm">
      {children}
    </span>
  );
}

function RelationChipActions({
  disabled,
  isDeleting,
  item,
  onDelete,
  onSelectPrompt,
  t,
}: RelationChipProps) {
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

  return (
    <RelationChipFrame>
      <RelationChipButton
        item={item}
        Icon={Icon}
        onSelectPrompt={onSelectPrompt}
        t={t}
      />
      <RelationChipDeleteButton
        disabled={disabled}
        isDeleting={isDeleting}
        removeLabel={removeLabel}
        onDelete={onDelete}
        relation={item.relation}
      />
    </RelationChipFrame>
  );
}

function RelationForm({
  relationKind,
  targetPromptId,
  candidatePrompts,
  canCreate,
  isSaving,
  disabled,
  onKindChange,
  onTargetChange,
  onCreate,
  t,
}: RelationFormProps) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(8rem,0.75fr)_minmax(12rem,1.25fr)_auto]">
      <RelationKindSelect
        relationKind={relationKind}
        disabled={disabled}
        isSaving={isSaving}
        onKindChange={onKindChange}
        t={t}
      />
      <RelationTargetSelect
        targetPromptId={targetPromptId}
        candidatePrompts={candidatePrompts}
        disabled={disabled}
        isSaving={isSaving}
        onTargetChange={onTargetChange}
        t={t}
      />
      <RelationAddButton canCreate={canCreate} onCreate={onCreate} t={t} />
    </div>
  );
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

function RelationList({
  relationItems,
  deletingId,
  disabled,
  t,
  onDelete,
  onSelectPrompt,
}: Pick<
  PromptRelationshipPanelViewProps,
  | "relationItems"
  | "deletingId"
  | "disabled"
  | "t"
  | "onDelete"
  | "onSelectPrompt"
>) {
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
          key={item.relation.id}
          item={item}
          disabled={disabled}
          isDeleting={deletingId === item.relation.id}
          onDelete={(relation) => void onDelete(relation)}
          onSelectPrompt={onSelectPrompt}
          t={t}
        />
      ))}
    </div>
  );
}

function PromptRelationshipPanelView({
  relationItems,
  candidatePrompts,
  relationKind,
  targetPromptId,
  canCreate,
  isSaving,
  deletingId,
  disabled,
  className,
  t,
  onKindChange,
  onTargetChange,
  onCreate,
  onDelete,
  onSelectPrompt,
}: PromptRelationshipPanelViewProps) {
  return (
    <section
      className={`mb-4 rounded-xl border border-border app-wallpaper-surface p-3 ${className}`}
    >
      <PanelHeader count={relationItems.length} t={t} />
      <RelationList
        relationItems={relationItems}
        deletingId={deletingId}
        disabled={disabled}
        t={t}
        onDelete={onDelete}
        onSelectPrompt={onSelectPrompt}
      />
      <RelationForm
        relationKind={relationKind}
        targetPromptId={targetPromptId}
        candidatePrompts={candidatePrompts}
        canCreate={canCreate && !disabled}
        isSaving={isSaving}
        disabled={disabled}
        onKindChange={onKindChange}
        onTargetChange={onTargetChange}
        onCreate={() => void onCreate()}
        t={t}
      />
    </section>
  );
}

export function PromptRelationshipPanel({
  currentPrompt,
  prompts,
  relations,
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
    onCreateRelation,
    onDeleteRelation,
  });

  return (
    <PromptRelationshipPanelView
      relationItems={state.relationItems}
      candidatePrompts={state.candidatePrompts}
      relationKind={state.relationKind}
      targetPromptId={state.targetPromptId}
      canCreate={state.canCreate}
      isSaving={state.isSaving}
      deletingId={state.deletingId}
      disabled={disabled}
      className={className}
      t={state.t}
      onKindChange={state.setRelationKind}
      onTargetChange={state.setTargetPromptId}
      onCreate={state.handleCreate}
      onDelete={state.handleDelete}
      onSelectPrompt={onSelectPrompt}
    />
  );
}

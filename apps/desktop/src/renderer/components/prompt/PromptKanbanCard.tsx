import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Prompt, PromptSummary } from "@prompthub/shared/types";
import {
  BracesIcon,
  CopyIcon,
  EditIcon,
  FolderIcon,
  MaximizeIcon,
  MinimizeIcon,
  PinIcon,
  PlayIcon,
  SparklesIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { usePromptDetail } from "../../hooks/usePromptDetail";
import { parsePromptVariables } from "./prompt-modal-utils";

interface KanbanCardProps {
  prompt: PromptSummary;
  isPinned: boolean;
  isExpanded: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onAiTest: () => void;
  onToggleFavorite: () => void;
  onViewDetail: () => void;
  folderName: string;
}

function CardPinActions(props: KanbanCardProps) {
  const { t } = useTranslation();
  const expandLabel = t(props.isExpanded ? "common.collapse" : "common.expand");
  const pinLabel = t(props.isPinned ? "prompt.unpin" : "prompt.pin");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {props.isPinned && (
        <button
          type="button"
          onClick={props.isExpanded ? props.onCollapse : props.onExpand}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={expandLabel}
          aria-label={expandLabel}
          aria-expanded={props.isExpanded}
        >
          {props.isExpanded ? (
            <MinimizeIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <MaximizeIcon aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={props.isPinned ? props.onUnpin : props.onPin}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        title={pinLabel}
        aria-label={pinLabel}
      >
        {props.isPinned ? (
          <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <PinIcon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function CardHeader(props: KanbanCardProps) {
  const { t } = useTranslation();
  return (
    <div className="app-wallpaper-surface flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
      <h3 className="min-w-0 flex-1 text-sm font-semibold">
        <button
          type="button"
          className="block w-full truncate text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={props.onViewDetail}
          title={props.prompt.title}
          aria-label={`${t("prompt.viewDetail")}: ${props.prompt.title}`}
        >
          {props.prompt.title}
        </button>
      </h3>
      {props.prompt.isFavorite && (
        <StarIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400"
        />
      )}
      <CardPinActions {...props} />
    </div>
  );
}

function CardVariables({
  detail,
  isPinned,
}: {
  detail: Prompt | null;
  isPinned: boolean;
}) {
  const variables = useMemo(
    () => [
      ...new Set(
        [
          ...parsePromptVariables(detail?.systemPrompt ?? ""),
          ...parsePromptVariables(detail?.userPrompt ?? ""),
        ].map((variable) => variable.name),
      ),
    ],
    [detail],
  );
  const visibleVariables = variables.slice(0, isPinned ? 10 : 5);
  if (!variables.length) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <BracesIcon
        aria-hidden="true"
        className="h-3 w-3 text-muted-foreground"
      />
      {visibleVariables.map((variable) => (
        <span
          key={variable}
          className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-accent-foreground"
        >{`{{${variable}}}`}</span>
      ))}
      {variables.length > visibleVariables.length && (
        <span className="text-[10px] text-muted-foreground">
          +{variables.length - visibleVariables.length}
        </span>
      )}
    </div>
  );
}

function PreviewField({
  label,
  body,
  isSystem,
  isExpanded,
}: {
  label: string;
  body: string;
  isSystem?: boolean;
  isExpanded: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${isExpanded ? "shrink-0" : "min-h-0 flex-1"}`}>
      <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
        {isSystem && <SparklesIcon aria-hidden="true" className="h-3 w-3" />}
        {label}
      </div>
      <div
        className={`app-wallpaper-surface rounded-lg border border-border/70 p-2 text-xs leading-relaxed text-foreground/80 ${isExpanded ? "" : "min-h-0 overflow-hidden"}`}
      >
        <p
          className={`break-words whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-3"}`}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function CardLoadState({
  isLoading,
  hasError,
  reload,
}: {
  isLoading: boolean;
  hasError: boolean;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      {hasError ? (
        <>
          <span role="alert">{t("prompt.detailLoadFailed")}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded px-2 py-1 text-primary hover:bg-primary/10"
          >
            {t("common.retry")}
          </button>
        </>
      ) : (
        <span role="status">
          {isLoading ? t("common.loading") : t("prompt.noContent")}
        </span>
      )}
    </div>
  );
}

function CardPreview({
  detail,
  isExpanded,
  isLoading,
  hasError,
  reload,
}: {
  detail: Prompt | null;
  isExpanded: boolean;
  isLoading: boolean;
  hasError: boolean;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  if (!detail)
    return (
      <CardLoadState
        isLoading={isLoading}
        hasError={hasError}
        reload={reload}
      />
    );
  return (
    <div
      className={`flex flex-col gap-2 ${isExpanded ? "shrink-0" : "min-h-0 flex-1 overflow-hidden"}`}
    >
      {detail.systemPrompt && (
        <PreviewField
          label={t("prompt.systemPrompt")}
          body={detail.systemPrompt}
          isSystem
          isExpanded={isExpanded}
        />
      )}
      <PreviewField
        label={t("prompt.userPrompt")}
        body={detail.userPrompt || t("prompt.noContent")}
        isExpanded={isExpanded}
      />
    </div>
  );
}

function CardTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-1">
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
        >
          #{tag}
        </span>
      ))}
      {tags.length > 5 && (
        <span className="text-[10px] text-muted-foreground">
          +{tags.length - 5}
        </span>
      )}
    </div>
  );
}

function CardLocation({ prompt, folderName }: KanbanCardProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
      <FolderIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="max-w-[80px] truncate">{folderName}</span>
      <span>·</span>
      <span className="whitespace-nowrap">
        {new Date(prompt.updatedAt).toLocaleDateString()}
      </span>
    </div>
  );
}

function CardFooter(props: KanbanCardProps) {
  const { t } = useTranslation();
  const actions = [
    {
      id: "favorite",
      icon: StarIcon,
      label: t(
        props.prompt.isFavorite
          ? "prompt.removeFromFavorites"
          : "prompt.addToFavorites",
      ),
      onClick: props.onToggleFavorite,
      favorite: props.prompt.isFavorite,
    },
    { id: "copy", icon: CopyIcon, label: t("prompt.copy"), onClick: props.onCopy },
    { id: "edit", icon: EditIcon, label: t("prompt.edit"), onClick: props.onEdit },
    { id: "test", icon: PlayIcon, label: t("prompt.aiTest"), onClick: props.onAiTest },
  ];
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/50 bg-muted/20 px-3 py-2">
      <CardLocation {...props} />
      <div className="flex shrink-0 items-center gap-1">
        {actions.map(({ id, icon: Icon, label, onClick, favorite }) => (
          <button
            key={id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            className={`rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground ${favorite ? "text-yellow-400" : "text-muted-foreground"}`}
            title={label}
            aria-label={label}
            aria-pressed={
              Icon === StarIcon ? props.prompt.isFavorite : undefined
            }
          >
            <Icon
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export const KanbanCard = memo(function KanbanCard(props: KanbanCardProps) {
  const {
    prompt: detail,
    isLoading,
    hasError,
    reload,
  } = usePromptDetail(props.prompt.id);
  const heightClass = props.isExpanded
    ? "h-[500px]"
    : props.isPinned
      ? "h-[320px]"
      : "h-[var(--prompt-kanban-card-height)]";
  return (
    <article
      aria-label={props.prompt.title}
      className={`app-wallpaper-panel relative flex flex-col overflow-hidden rounded-xl border transition-colors duration-base ${heightClass} ${props.isPinned ? "border-primary/50 shadow-lg shadow-primary/10 ring-2 ring-primary/20" : "border-border hover:border-primary/30"}`}
    >
      <CardHeader {...props} />
      <div
        className={`flex min-h-0 flex-1 flex-col gap-2 p-3 ${props.isExpanded ? "overflow-y-auto" : "overflow-hidden"}`}
      >
        {props.prompt.description && (
          <p className="shrink-0 line-clamp-2 break-words text-xs text-muted-foreground">
            {props.prompt.description}
          </p>
        )}
        <CardVariables detail={detail} isPinned={props.isPinned} />
        <CardPreview
          detail={detail}
          isExpanded={props.isExpanded}
          isLoading={isLoading}
          hasError={hasError}
          reload={reload}
        />
        <CardTags tags={props.prompt.tags} />
      </div>
      <CardFooter {...props} />
    </article>
  );
});

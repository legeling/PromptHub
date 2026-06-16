import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, TagsIcon } from "lucide-react";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import { Modal } from "../ui";
import {
  collectMcpTags,
  updateMcpTags,
  type McpBatchTagMode,
} from "./batch-utils";

interface McpBatchTagDialogProps {
  servers: McpServerConfig[];
  onClose: () => void;
  onSubmit: (tag: string, mode: McpBatchTagMode) => Promise<void>;
}

export function McpBatchTagDialog({
  servers,
  onClose,
  onSubmit,
}: McpBatchTagDialogProps) {
  const { t } = useTranslation();
  const tagInputId = useId();
  const [mode, setMode] = useState<McpBatchTagMode>("add");
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestedTags = useMemo(() => collectMcpTags(servers), [servers]);
  const affectedCount = useMemo(() => {
    const normalized = tagInput.trim().toLowerCase();
    if (!normalized) {
      return 0;
    }
    return servers.filter((server) => {
      const nextTags = updateMcpTags(server.tags, normalized, mode);
      return JSON.stringify(nextTags) !== JSON.stringify(server.tags || []);
    }).length;
  }, [mode, servers, tagInput]);

  const handleSubmit = async () => {
    if (!tagInput.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(tagInput, mode);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("mcp.batchTags", "Batch Tags")}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TagsIcon aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("mcp.batchTagsHint", {
              count: servers.length,
              defaultValue: `Add or remove tags across ${servers.length} selected MCP server(s).`,
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["add", t("mcp.addTag", "Add tag")],
              ["remove", t("mcp.removeTag", "Remove tag")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-label={
                value === "add"
                  ? t("mcp.addTagMode", "Add tag mode")
                  : t("mcp.removeTagMode", "Remove tag mode")
              }
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                mode === value
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "border-border app-wallpaper-surface hover:border-primary/25"
              }`}
            >
              <div className="text-sm font-medium">{label}</div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label
            htmlFor={tagInputId}
            className="text-sm font-medium text-foreground"
          >
            {t("mcp.tag", "Tag")}
          </label>
          <input
            id={tagInputId}
            type="text"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && tagInput.trim() && !isSubmitting) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={t("mcp.enterTagHint", "Enter new tag and press Enter")}
            className="h-11 w-full rounded-xl border border-border app-wallpaper-surface px-3 text-sm outline-none transition-colors focus:border-primary/40"
          />
          <div className="text-xs text-muted-foreground">
            {t("mcp.batchTagAffected", {
              count: affectedCount,
              defaultValue: `${affectedCount} MCP server(s) will be updated`,
            })}
          </div>
        </div>

        {suggestedTags.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("mcp.existingTags", "Existing tags")}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.slice(0, 20).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagInput(tag)}
                  className="rounded-full border border-border app-wallpaper-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !tagInput.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
                {t("common.saving", "Saving")}
              </>
            ) : mode === "add" ? (
              t("mcp.addTag", "Add tag")
            ) : (
              t("mcp.removeTag", "Remove tag")
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

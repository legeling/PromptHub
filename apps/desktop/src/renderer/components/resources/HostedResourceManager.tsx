import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  EditIcon,
  HistoryIcon,
  SaveIcon,
  RefreshCwIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { HostedPluginBackup } from "./HostedPluginBackup";
import { PluginVersionHistoryModal } from "../plugin/PluginVersionHistoryModal";
import { McpServerForm } from "../mcp/McpServerForm";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Spinner } from "../ui/Spinner";
import {
  useHostedLibrary,
  isMcp,
  toggleFavorite,
  deleteResource,
  type Kind,
} from "./use-hosted-library";

function PluginNotes({
  plugin,
  onBack,
  onSave,
}: {
  plugin: PluginLibraryEntry;
  onBack(): void;
  onSave(notes: string, tags: string[]): Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(plugin.userNotes ?? "");
  const [tags, setTags] = useState((plugin.userTags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-5 p-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="h-4 w-4" />
        {t("common.back")}
      </Button>
      <h2 className="text-xl font-semibold">{plugin.displayName}</h2>
      <p className="whitespace-pre-wrap break-words text-muted-foreground">
        {plugin.description}
      </p>
      <label className="block space-y-2">
        <span>{t("nav.tags")}</span>
        <input
          className="w-full rounded-lg border border-border bg-background p-3"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </label>
      <label className="block space-y-2">
        <span>{t("hostedResources.notes")}</span>
        <textarea
          className="min-h-48 w-full rounded-lg border border-border bg-background p-3"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <Button
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void onSave(
            notes,
            tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ).finally(() => setSaving(false));
        }}
      >
        {t("common.save")}
      </Button>
    </div>
  );
}

/** One hosted library surface; adapters own each domain's supported operations. */
export function HostedResourceManager({ kind }: { kind: Kind }): JSX.Element {
  const { t } = useTranslation();
  const [history, setHistory] = useState<PluginLibraryEntry | null>(null);
  const {
    items,
    error,
    loading,
    busy,
    selected,
    setSelected,
    deleting,
    setDeleting,
    favorites,
    setFavorites,
    reload,
    run,
    visible,
  } = useHostedLibrary(kind);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p>{t("hostedResources.operationFailed")}</p>
          <p className="break-words">{error}</p>
        </div>
      )}
      {selected === "new" || (selected && isMcp(selected)) ? (
        <McpServerForm
          selectedServer={selected === "new" ? null : selected}
          distributedTargetCount={0}
          onBack={() => setSelected(null)}
          onDelete={async () => {
            if (selected !== "new") setDeleting(selected);
          }}
          onSave={async (id, draft) => {
            const success = await run(async () => {
              if (id) await window.api.mcp.updateServer(id, draft);
              else await window.api.mcp.createServer(draft);
            });
            if (success) setSelected(null);
            else throw new Error("Unable to save MCP definition");
          }}
        />
      ) : selected && !isMcp(selected) ? (
        <PluginNotes
          key={selected.id}
          plugin={selected}
          onBack={() => setSelected(null)}
          onSave={async (notes, tags) => {
            if (
              await run(async () => {
                await window.api.plugin.updatePluginMetadata(selected.id, {
                  userNotes: notes,
                  userTags: tags,
                });
              })
            )
              setSelected(null);
          }}
        />
      ) : (
        <>
          <div className="space-y-4 border-b border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold">
                {t(kind === "mcp" ? "mcp.myMcp" : "plugin.myPlugins")}{" "}
                <span className="text-muted-foreground">{items.length}</span>
              </h1>
              <Button
                variant="secondary"
                disabled={loading || busy}
                onClick={() => void reload()}
              >
                <RefreshCwIcon className="h-4 w-4" />
                {t("common.refresh")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("hostedResources.description")}
            </p>
            {kind === "plugin" && (
              <HostedPluginBackup busy={busy || loading} run={run} />
            )}
            <div className="flex gap-2">
              <Button
                variant={!favorites ? "primary" : "secondary"}
                onClick={() => setFavorites(false)}
              >
                {t("filter.all")}
              </Button>
              <Button
                variant={favorites ? "primary" : "secondary"}
                onClick={() => setFavorites(true)}
              >
                <StarIcon className="h-4 w-4" />
                {t("nav.favorites")}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {loading && !items.length ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 rounded-2xl border border-border bg-card p-5"
                  >
                    <h2 className="truncate text-lg font-semibold">
                      {item.displayName || item.name}
                    </h2>
                    <p className="mt-2 line-clamp-3 break-words text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <div className="mt-4 flex justify-end gap-1">
                      {!isMcp(item) && (
                        <>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            aria-label={t("plugin.createSnapshot")}
                            onClick={() =>
                              void run(async () => {
                                await window.api.plugin.versionCreate(item.id);
                              })
                            }
                          >
                            <SaveIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            aria-label={t("plugin.versionHistory")}
                            onClick={() => setHistory(item)}
                          >
                            <HistoryIcon className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        disabled={busy}
                        aria-label={t("common.edit")}
                        onClick={() => setSelected(item)}
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        aria-label={t("nav.favorites")}
                        onClick={() => void run(() => toggleFavorite(item))}
                      >
                        <StarIcon
                          className={`h-4 w-4 ${item.isFavorite ? "fill-primary text-primary" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        aria-label={t("common.delete")}
                        onClick={() => setDeleting(item)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!loading && !visible.length && (
              <p className="py-12 text-center text-muted-foreground">
                {t("hostedResources.empty")}
              </p>
            )}
          </div>
        </>
      )}
      {history && (
        <PluginVersionHistoryModal
          isOpen
          plugin={history}
          onClose={() => {
            setHistory(null);
            void reload();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        isLoading={busy}
        variant="destructive"
        message={t("hostedResources.deleteConfirm", {
          name: deleting?.displayName,
        })}
        onConfirm={() => {
          if (deleting)
            void run(() => deleteResource(deleting)).then((success) => {
              if (success) {
                setDeleting(null);
                setSelected(null);
              }
            });
        }}
      />
    </div>
  );
}

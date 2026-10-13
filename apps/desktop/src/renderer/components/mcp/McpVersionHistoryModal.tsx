import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  McpVersionComparison,
  McpVersionDetail,
  McpVersionPage,
} from "@prompthub/shared/types/mcp";
import { MCP_VERSION_PAGE_SIZE } from "@prompthub/shared/types/mcp";
import { Modal } from "../ui/Modal";
import { requestConfirmation } from "../ui/confirmation";
import { useMcpStore } from "../../stores/mcp.store";

function trapHistoryFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey)
    return;
  const dialog = event.currentTarget;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>(
      "button, textarea",
    ),
  ).filter(
    (control) => !control.disabled && !control.hidden && control.tabIndex >= 0,
  );
  const first = controls[0],
    last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = dialog.ownerDocument.activeElement;
  if (
    active === dialog ||
    (event.shiftKey && active === first) ||
    (!event.shiftKey && active === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

export function McpVersionHistoryModal({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [page, setPage] = useState<McpVersionPage | null>(null);
  const [detail, setDetail] = useState<McpVersionDetail | null>(null);
  const [comparison, setComparison] = useState<McpVersionComparison | null>(
    null,
  );
  const [offset, setOffset] = useState(0),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const document = content.ownerDocument;
    // Disabling the active action during a mutation moves Chromium focus to body.
    if (document.activeElement === document.body)
      content
        .closest<HTMLElement>('[role="dialog"]')
        ?.focus({ preventScroll: true });
  }, [busy]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    setDetail(null);
    setComparison(null);
    void window.api.mcp
      .listVersions(serverId, { offset, limit: MCP_VERSION_PAGE_SIZE })
      .then(async (result) => {
        const first = result.items[0];
        const selected = first
          ? await window.api.mcp.getVersion(serverId, first.version)
          : null;
        if (active) {
          setPage(result);
          setDetail(selected);
          setNote(selected?.note ?? "");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [serverId, offset, revision]);
  const execute = useCallback(
    async (operation: () => Promise<unknown>, reload = false) => {
      setBusy(true);
      setError(null);
      try {
        await operation();
        if (reload) {
          await useMcpStore.getState().load();
          setRevision((v) => v + 1);
        }
      } catch (reason) {
        setError(String(reason));
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  const select = (version: number) =>
    execute(async () => {
      const value = await window.api.mcp.getVersion(serverId, version);
      setDetail(value);
      setNote(value.note ?? "");
      setComparison(null);
    });
  const confirmed = async (action: "restore" | "delete"): Promise<void> => {
    if (!detail) return;
    const accepted = await requestConfirmation({
      title: t(`mcp.history.${action}`),
      message: t(`mcp.history.${action}Confirm`, { version: detail.version }),
      variant: action === "delete" ? "destructive" : "default",
    });
    if (!accepted) return;
    await execute(async () => {
      if (action === "restore")
        await window.api.mcp.restoreVersion(serverId, detail.version);
      else await window.api.mcp.deleteVersion(serverId, detail.version);
      await useMcpStore.getState().load();
      setOffset(0);
      setRevision((v) => v + 1);
    });
  };
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t("mcp.history.title")}
      size="2xl"
      onKeyDown={trapHistoryFocus}
    >
      <div
        ref={contentRef}
        className="space-y-4 p-5"
        data-testid="mcp-version-history"
      >
        <p className="text-sm text-muted-foreground">{t("mcp.history.help")}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {error && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
            className="rounded border border-border px-3 py-2 text-sm"
          >
            {t("common.retry")}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void execute(() => window.api.mcp.createVersion(serverId), true)
          }
          className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {t("mcp.history.create")}
        </button>
        {busy && <p role="status">{t("common.loading")}</p>}
        <div className="grid min-h-0 gap-4 md:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            {page?.items.map((item) => (
              <button
                key={item.version}
                type="button"
                aria-pressed={detail?.version === item.version}
                disabled={busy}
                onClick={() => void select(item.version)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                v{item.version}
                {item.isCurrent ? ` · ${t("mcp.history.current")}` : ""}
                <span className="block text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
            {page && page.total === 0 && <p>{t("mcp.history.empty")}</p>}
            <div className="flex justify-between gap-2">
              <button
                disabled={busy || offset === 0}
                onClick={() =>
                  setOffset(Math.max(0, offset - MCP_VERSION_PAGE_SIZE))
                }
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                {t("common.previous")}
              </button>
              <button
                disabled={busy || !page || offset + page.limit >= page.total}
                onClick={() => setOffset(offset + MCP_VERSION_PAGE_SIZE)}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
          {detail && (
            <div className="min-w-0 space-y-3">
              <h3 className="font-medium">
                v{detail.version}
                {detail.restoredFromVersion
                  ? ` · ${t("mcp.history.restoredFrom", { version: detail.restoredFromVersion })}`
                  : ""}
              </h3>
              <label className="block text-sm">
                {t("mcp.history.note")}
                <textarea
                  aria-label={t("mcp.history.note")}
                  disabled={busy}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    void execute(
                      () =>
                        window.api.mcp.updateVersionNote(
                          serverId,
                          detail.version,
                          note,
                        ),
                      true,
                    )
                  }
                  className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {t("mcp.history.saveNote")}
                </button>
                <button
                  disabled={busy || !page}
                  onClick={() =>
                    void execute(async () => {
                      if (page)
                        setComparison(
                          await window.api.mcp.compareVersions(
                            serverId,
                            detail.version,
                            page.currentVersion,
                          ),
                        );
                    })
                  }
                  className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {t("mcp.history.compare")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void confirmed("restore")}
                  className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {t("mcp.history.restore")}
                </button>
                <button
                  disabled={busy || detail.isCurrent}
                  onClick={() => void confirmed("delete")}
                  className="rounded border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50"
                >
                  {t("mcp.history.delete")}
                </button>
              </div>
              <pre
                className="max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 text-xs"
                aria-label={t("mcp.history.definition")}
              >
                {JSON.stringify(detail.server, null, 2)}
              </pre>
              {comparison && (
                <section aria-label={t("mcp.history.compare")}>
                  <h4>{t("mcp.history.compare")}</h4>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
                    {comparison.changes.length
                      ? JSON.stringify(comparison.changes, null, 2)
                      : t("mcp.history.noChanges")}
                  </pre>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

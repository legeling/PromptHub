import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileJsonIcon, PencilIcon, SaveIcon, WrapTextIcon } from "lucide-react";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import {
  buildMcpEditableJson,
  McpJsonEditError,
  parseMcpEditableJson,
} from "@prompthub/shared/utils/mcp-json-editor";
import { useMcpStore } from "../../stores/mcp.store";
import { SkillCodeEditor } from "../skill/SkillCodeEditor";
import "../skill/SkillFileEditor.css";

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-accent/50 px-3 py-2 text-xs hover:bg-accent disabled:opacity-50";

export function McpJsonEditor({
  server,
}: {
  server: McpServerConfig;
}): JSX.Element {
  const { t } = useTranslation();
  const updateServer = useMcpStore((state) => state.updateServer);
  const [draft, setDraft] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const content = buildMcpEditableJson(server);
  const stale = draft !== null && baseline !== JSON.stringify(server);
  const start = (): void => {
    setDraft(content);
    setBaseline(JSON.stringify(server));
    setError("");
    setSaved(false);
  };
  const validate = (): boolean => {
    try {
      parseMcpEditableJson(draft ?? content, server);
      setError("");
      return true;
    } catch (reason) {
      setError(
        t(
          `mcp.jsonErrors.${reason instanceof McpJsonEditError ? reason.code : "save"}`,
        ),
      );
      return false;
    }
  };
  const save = async (): Promise<void> => {
    if (stale || !validate()) return;
    setBusy(true);
    try {
      await updateServer(
        server.id,
        parseMcpEditableJson(draft ?? content, server),
      );
      setDraft(null);
      setSaved(true);
    } catch {
      setError(t("mcp.jsonErrors.save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="mcp-json-editor"
      className="flex h-full min-h-0 min-w-0 bg-card"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (draft !== null && !busy && !stale) void save();
        }
      }}
    >
      <aside
        className="flex w-40 shrink-0 flex-col border-r border-border bg-muted/30 lg:w-60"
        aria-label={t("skill.files")}
      >
        <div className="px-3 py-3 text-xs font-semibold text-muted-foreground">
          {t("skill.fileEditor")}
        </div>
        <button
          type="button"
          aria-current="page"
          className="flex w-full items-center gap-2 bg-accent px-3 py-2 text-left text-sm"
        >
          <FileJsonIcon
            className="h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          mcp.json
          {draft !== null && draft !== content && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <FileJsonIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            mcp.json
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draft === null ? (
              <button type="button" className={buttonClass} onClick={start}>
                <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {t("prompt.edit")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    if (validate())
                      setDraft(JSON.stringify(JSON.parse(draft), null, 2));
                  }}
                >
                  <WrapTextIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("mcp.formatJson")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setError("");
                  }}
                >
                  {t("common.cancel")}
                </button>
              </>
            )}
            <button
              type="button"
              className={buttonClass}
              aria-label={t("common.save")}
              disabled={draft === null || busy || stale}
              onClick={() => void save()}
            >
              <SaveIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {draft !== null && (
          <p className="shrink-0 border-b border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
            {t("mcp.jsonEditHint")}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="shrink-0 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {stale && (
          <p
            role="alert"
            className="shrink-0 px-3 py-2 text-sm text-destructive"
          >
            {t("mcp.jsonErrors.stale")}
          </p>
        )}
        {saved && (
          <p role="status" className="shrink-0 px-3 py-2 text-xs text-primary">
            {t("mcp.jsonSaved")}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SkillCodeEditor
            path="mcp.json"
            value={draft ?? content}
            editable={draft !== null && !busy}
            ariaLabel={t("mcp.jsonConfigLabel")}
            testId="mcp-file-code-editor"
            onChange={(value) => {
              setDraft(value);
              setError("");
            }}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          <span>mcp.json</span>
          <span>UTF-8 · JSON</span>
        </div>
      </div>
    </section>
  );
}

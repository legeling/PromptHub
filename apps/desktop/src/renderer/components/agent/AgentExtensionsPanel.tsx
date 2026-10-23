import { useEffect, useRef, useState, type ReactElement } from "react";
import { getAgentExtensionCapability } from "@prompthub/shared/constants/agent-extension-capabilities";
import { useTranslation } from "react-i18next";
import {
  Bot,
  FileCode2,
  Info,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow,
} from "lucide-react";
import type {
  AgentExtensionDocument,
  AgentExtensionRequest,
  AgentExtensionScope,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import { Button, ConfirmDialog, Input, Select } from "../ui";

const EXTENSION_KINDS = ["subagent", "hooks"] as const;
const SELECT_TRIGGER_CLASS =
  "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

export function AgentExtensionsPanel({
  agentId,
}: {
  agentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const capability = getAgentExtensionCapability(agentId)!;
  const projects = useSettingsStore((state) => state.skillProjects);
  const [scope, setScope] = useState<AgentExtensionScope["scope"]>("user");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [kind, setKind] = useState<"subagent" | "hooks">("subagent");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [filename, setFilename] = useState("");
  const [document, setDocument] = useState<AgentExtensionDocument | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<"save" | "delete" | "discard" | null>(
    null,
  );
  const dirty = document !== null && content !== document.content;
  const unavailable = scope !== "user" && !projectId;
  const pluginHooks = kind === "hooks" && capability.hooksFormat === "plugin";
  const relativePath =
    kind === "hooks"
      ? scope === "local"
        ? "settings.local.json"
        : (capability.hooksPath ?? "")
      : selected;
  const request: AgentExtensionRequest = {
    agentId,
    scope,
    ...(scope !== "user" ? { projectId } : {}),
    kind,
    relativePath,
  };

  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setContent("");
    setError("");
    setSaved(false);
    if (unavailable) return;
    setBusy(true);
    const selection = {
      agentId,
      scope,
      ...(scope !== "user" ? { projectId } : {}),
    };
    void Promise.all([
      window.api.agent.listAgentExtensions(selection),
      relativePath
        ? window.api.agent.readAgentExtension({
            ...selection,
            kind,
            relativePath,
          })
        : Promise.resolve(null),
    ])
      .then(([files, next]) => {
        if (cancelled) return;
        setPaths(files);
        setDocument(next);
        setContent(next?.content ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("loadFailed");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, scope, projectId, kind, relativePath, unavailable, refresh]);

  async function apply(): Promise<void> {
    if (confirm === "discard") {
      setConfirm(null);
      setRefresh((value) => value + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (confirm === "delete" && document?.revision) {
        await window.api.agent.deleteAgentExtension({
          ...request,
          expectedRevision: document.revision,
        });
        setSelected("");
        setDocument(null);
        setContent("");
      } else {
        const next = await window.api.agent.writeAgentExtension({
          ...request,
          content,
          expectedRevision: document?.revision,
        });
        setDocument(next);
        setContent(next.content);
        setSaved(true);
      }
      setPaths(await window.api.agent.listAgentExtensions(request));
      setConfirm(null);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(
        message.includes("CONCURRENT_CHANGE")
          ? "conflict"
          : message.includes("INVALID")
            ? "invalid"
            : "saveFailed",
      );
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function create(): void {
    if (!filename.trim()) return;
    const name = filename.trim();
    setSelected(
      `agents/${name.endsWith(capability.subagentExtension) ? name : name + capability.subagentExtension}`,
    );
    setFilename("");
  }

  function selectKind(value: "subagent" | "hooks"): void {
    setKind(value);
    setSelected("");
    if (value === "subagent" && scope === "local") setScope("project");
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-card">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-2">
        <div
          role="tablist"
          aria-label={t("agents.agentExtensions.title")}
          className="flex items-center gap-4"
        >
          {EXTENSION_KINDS.map((value) => {
            const Icon = value === "subagent" ? Bot : Workflow;
            return (
              <button
                key={value}
                ref={(element) => {
                  if (element) tabRefs.current.set(value, element);
                  else tabRefs.current.delete(value);
                }}
                id={`agent-extension-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={kind === value}
                aria-controls="agent-extension-panel"
                tabIndex={kind === value ? 0 : -1}
                disabled={dirty}
                aria-disabled={busy || dirty}
                onClick={() => {
                  if (!busy) selectKind(value);
                }}
                onKeyDown={(event) => {
                  if (busy || dirty) return;
                  let next: "subagent" | "hooks";
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft")
                    next = value === "subagent" ? "hooks" : "subagent";
                  else if (event.key === "Home") next = "subagent";
                  else if (event.key === "End") next = "hooks";
                  else return;
                  event.preventDefault();
                  selectKind(next);
                  tabRefs.current.get(next)?.focus();
                }}
                className={`inline-flex items-center gap-2 border-b-2 px-1 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${kind === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {t(`agents.agentExtensions.${value}`)}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("agents.agentExtensions.scope")}
          </span>
          <Select
            className="w-32"
            ariaLabel={t("agents.agentExtensions.scope")}
            presentation="form"
            dropdownWidth="trigger"
            triggerClassName={SELECT_TRIGGER_CLASS}
            value={scope}
            disabled={busy || dirty}
            options={[
              { value: "user", label: t("agents.definitionsPanel.scope.user") },
              {
                value: "project",
                label: t("agents.definitionsPanel.scope.project"),
              },
              ...(kind === "hooks" && capability.localHooks
                ? [
                    {
                      value: "local",
                      label: t("agents.agentExtensions.local"),
                    },
                  ]
                : []),
            ]}
            onChange={(value) => {
              if (
                value === "user" ||
                value === "project" ||
                value === "local"
              ) {
                setScope(value);
                setSelected("");
              }
            }}
          />
          {scope !== "user" && (
            <Select
              className="w-44"
              ariaLabel={t("agents.definitionsPanel.project")}
              presentation="form"
              dropdownWidth="trigger"
              triggerClassName={SELECT_TRIGGER_CLASS}
              value={projectId}
              disabled={busy || dirty || !projects.length}
              placeholder={t("agents.definitionsPanel.noProjects")}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              onChange={(value) => {
                setProjectId(value);
                setSelected("");
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-8 !px-0"
            aria-label={t("agents.definitionsPanel.refresh")}
            title={t("agents.definitionsPanel.refresh")}
            disabled={busy}
            onClick={() =>
              dirty ? setConfirm("discard") : setRefresh((value) => value + 1)
            }
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
          </Button>
        </div>
      </header>
      <div className="flex shrink-0 items-start gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{t("agents.agentExtensions.notice")}</p>
          {agentId === "codex" && kind === "hooks" && (
            <p>{t("agents.agentExtensions.codexHooksNotice")}</p>
          )}
          <a
            href={
              kind === "hooks" ? capability.hooksUrl : capability.subagentsUrl
            }
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {t("agents.agentExtensions.documentation")}
          </a>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {t(`agents.agentExtensions.${error}`)}
        </p>
      )}
      {saved && (
        <p role="status" className="px-4 py-2 text-sm">
          {t("common.success")}
        </p>
      )}
      {busy && (
        <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      )}
      <div
        id="agent-extension-panel"
        role="tabpanel"
        aria-labelledby={`agent-extension-tab-${kind}`}
        className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row"
      >
        {kind === "subagent" && (
          <aside className="w-full shrink-0 space-y-3 overflow-y-auto border-b border-border bg-muted/20 p-3 lg:w-56 lg:border-b-0 lg:border-r">
            <label
              className="block text-xs text-muted-foreground"
              htmlFor="agent-extension-filename"
            >
              {t("agents.agentExtensions.filename", {
                extension: capability.subagentExtension,
              })}
            </label>
            <Input
              id="agent-extension-filename"
              className="!h-8 !rounded-md !border !border-border !bg-card !text-xs"
              value={filename}
              disabled={busy || dirty || unavailable}
              onChange={(event) => setFilename(event.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={busy || dirty || unavailable || !filename.trim()}
              onClick={create}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              {t("common.add")}
            </Button>
            <nav
              aria-label={t("agents.agentExtensions.subagent")}
              className="space-y-1"
            >
              {paths.map((file) => (
                <button
                  key={file}
                  disabled={busy || dirty}
                  aria-current={selected === file ? "page" : undefined}
                  className={`block w-full break-all rounded-md border p-2.5 text-left text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${selected === file ? "border-primary/20 bg-primary/10 text-primary" : "border-transparent text-muted-foreground"}`}
                  onClick={() => setSelected(file)}
                >
                  {file}
                </button>
              ))}
              {!paths.length && (
                <p className="py-3 text-sm text-muted-foreground">
                  {t("agents.agentExtensions.empty")}
                </p>
              )}
            </nav>
          </aside>
        )}
        {pluginHooks ? (
          <p className="max-w-2xl p-6 text-sm leading-6 text-muted-foreground">
            {t("agents.agentExtensions.pluginHooks")}
          </p>
        ) : document ? (
          <div className="flex min-h-80 min-w-0 flex-1 flex-col bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <label
                htmlFor="agent-extension-content"
                className="flex min-w-0 items-center gap-2 text-sm font-medium"
              >
                <FileCode2
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="sr-only">
                  {t("agents.agentExtensions.content")}
                </span>
                <span className="break-all font-mono text-xs text-muted-foreground">
                  {relativePath}
                </span>
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy || !dirty}
                  onClick={() => setConfirm("save")}
                >
                  <Save aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("common.save")}
                </Button>
                {kind === "subagent" && document.revision && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("common.delete")}
                  </Button>
                )}
              </div>
            </div>
            <textarea
              id="agent-extension-content"
              aria-label={t("agents.agentExtensions.content")}
              spellCheck={false}
              disabled={busy}
              className="min-h-56 w-full flex-1 resize-none border-0 bg-card p-4 font-mono text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setSaved(false);
              }}
            />
          </div>
        ) : (
          !busy && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <Bot aria-hidden="true" className="h-8 w-8 opacity-50" />
              <p>
                {unavailable
                  ? t("agents.definitionsPanel.noProjects")
                  : t("agents.agentExtensions.select")}
              </p>
            </div>
          )
        )}
      </div>
      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void apply()}
        isLoading={busy}
        variant={confirm === "delete" ? "destructive" : "default"}
        message={t(
          `agents.agentExtensions.${confirm === "delete" ? "deleteConfirm" : confirm === "discard" ? "discardConfirm" : "saveConfirm"}`,
        )}
      />
    </section>
  );
}

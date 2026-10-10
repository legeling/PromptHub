import { requestConfirmation } from "../ui/confirmation";
import { useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  DownloadIcon,
  FolderOpenIcon,
  ImageIcon,
  LoaderCircleIcon,
  Paintbrush2Icon,
  PawPrintIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentAppearanceOverview,
  AgentDesktopThemeSummary,
  ManagedAgentSummary,
  UpdateAgentPetInput,
} from "@prompthub/shared/types";
import { AgentAppearancePreview } from "./AgentAppearancePreview";
import { AgentPetWorkspace } from "./AgentPetWorkspace";
import { useAgentAppearance } from "./use-agent-appearance";

type AppearanceSection = "skins" | "pets";

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45";

function AppearanceNavigation({
  section,
  themeCount,
  petCount,
  onChange,
}: {
  section: AppearanceSection;
  themeCount: number;
  petCount: number;
  onChange: (section: AppearanceSection) => void;
}) {
  const { t } = useTranslation();
  const items = [
    {
      id: "pets" as const,
      label: t("agents.appearance.petsTitle"),
      count: petCount,
      icon: <PawPrintIcon className="h-5 w-5" />,
    },
    {
      id: "skins" as const,
      label: t("agents.appearance.skinsTitle"),
      count: themeCount,
      icon: <Paintbrush2Icon className="h-5 w-5" />,
    },
  ];

  return (
    <aside className="flex w-[6.5rem] shrink-0 flex-col gap-2 border-r border-border bg-card p-3">
      {items.map((item) => {
        const selected = item.id === section;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${item.label} ${item.count}`}
            onClick={() => onChange(item.id)}
            className={`relative flex h-[5.25rem] w-full flex-col items-center justify-center gap-2 rounded-md border text-xs font-medium transition-colors ${
              selected
                ? "border-primary/35 bg-primary/[0.09] text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
            }`}
          >
            {item.icon}
            <span className="max-w-full truncate px-1">{item.label}</span>
            <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold text-muted-foreground">
              {item.count}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function AppearanceToolbar({
  section,
  busy,
  activeThemeId,
  onImport,
  onRefresh,
}: {
  section: AppearanceSection;
  busy: boolean;
  activeThemeId: string | null;
  onImport: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const isSkins = section === "skins";
  return (
    <div className="flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t("agents.appearance.title")}
        </h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {isSkins
            ? activeThemeId || t("agents.appearance.native")
            : t("agents.appearance.petsDesc")}
        </p>
      </div>
      {isSkins ? (
        <button
          type="button"
          onClick={onImport}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          <UploadIcon className="h-4 w-4" />
          {t("agents.appearance.importSkin")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        aria-label={t("agents.refresh")}
        title={t("agents.refresh")}
        className={iconButton}
      >
        <RefreshCwIcon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.08] text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
}

function NativeAppearanceSection({
  activeThemeId,
  disabled,
  onRestore,
}: {
  activeThemeId: string | null;
  disabled: boolean;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <SectionHeading
        icon={<Paintbrush2Icon className="h-4 w-4" />}
        title={t("agents.appearance.nativeTitle")}
        description={t("agents.appearance.nativeDesc")}
        action={
          <button
            type="button"
            onClick={onRestore}
            disabled={disabled || !activeThemeId}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcwIcon className="h-4 w-4" />
            {t("agents.appearance.restoreNative")}
          </button>
        }
      />
      <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3">
        <StatusMetric
          label={t("agents.appearance.runtime")}
          value={t("agents.appearance.loopbackRuntime")}
        />
        <StatusMetric
          label={t("agents.appearance.activeSkin")}
          value={activeThemeId || t("agents.appearance.native")}
        />
        <StatusMetric
          label={t("agents.appearance.safety")}
          value={t("agents.appearance.bundleUntouched")}
        />
      </div>
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0 text-xs">
      <span className="block font-medium text-muted-foreground">{label}</span>
      <span className="mt-1 block truncate font-semibold text-foreground">
        {value}
      </span>
    </p>
  );
}

function ThemeCard({
  agentId,
  theme,
  active,
  busy,
  onApply,
  onExport,
  onDelete,
}: {
  agentId: string;
  theme: AgentDesktopThemeSummary;
  active: boolean;
  busy: boolean;
  onApply: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="overflow-hidden rounded-md border border-border/80 bg-card shadow-sm transition-colors hover:border-primary/35 md:flex">
      <AgentAppearancePreview
        agentId={agentId}
        assetId={theme.id}
        kind="theme"
        alt={theme.name}
        className="md:w-72 md:shrink-0 md:border-b-0 md:border-r lg:w-80"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {theme.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              v{theme.version}
            </p>
          </div>
          {active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheckIcon className="h-3 w-3" />
              {t("agents.appearance.active")}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <IconAction
            label={t("agents.appearance.exportTheme", { name: theme.name })}
            disabled={busy}
            onClick={onExport}
            icon={<DownloadIcon className="h-4 w-4" />}
          />
          <button
            type="button"
            onClick={onApply}
            disabled={busy || active}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <SparklesIcon className="h-4 w-4" />
            {active
              ? t("agents.appearance.applied")
              : t("agents.appearance.apply")}
          </button>
          <IconAction
            label={t("agents.appearance.deleteTheme", { name: theme.name })}
            disabled={busy || active}
            onClick={onDelete}
            icon={<Trash2Icon className="h-4 w-4" />}
          />
        </div>
      </div>
    </article>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={iconButton}
    >
      {icon}
    </button>
  );
}

function AppearanceNotice({ count }: { count: number }) {
  const { t } = useTranslation();
  if (!count) return null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <AlertTriangleIcon className="h-4 w-4" />
      </span>
      <span className="font-medium">
        {t("agents.appearance.invalidItems", { count })}
      </span>
    </div>
  );
}

function RestartToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-10 items-center gap-2.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/25"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

function OpenDirectoryButton({ path, label }: { path: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void window.electron?.openPath?.(path)}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
    >
      <FolderOpenIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

interface SkinsWorkspaceProps {
  agentId: string;
  overview: AgentAppearanceOverview;
  busy: boolean;
  restartExisting: boolean;
  error: string | null;
  onRestartChange: (value: boolean) => void;
  onApply: (themeId: string) => void;
  onExport: (themeId: string) => void;
  onDelete: (themeId: string) => void;
  onRestore: () => void;
}

function SkinsWorkspace(props: SkinsWorkspaceProps) {
  const { t } = useTranslation();
  const { overview } = props;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-6xl space-y-5">
        {props.error ? <AppearanceError message={props.error} /> : null}
        <AppearanceNotice count={overview.invalidThemeCount} />
        <NativeAppearanceSection
          activeThemeId={overview.activeThemeId}
          disabled={props.busy}
          onRestore={props.onRestore}
        />
        <section>
          <SectionHeading
            icon={<SparklesIcon className="h-4 w-4" />}
            title={t("agents.appearance.skinsTitle")}
            description={t("agents.appearance.skinsDesc", {
              version: overview.engineVersion || "-",
            })}
            action={
              <RestartToggle
                checked={props.restartExisting}
                disabled={props.busy}
                label={t("agents.appearance.allowRestart")}
                onChange={props.onRestartChange}
              />
            }
          />
          {overview.themes.length ? (
            <div className="mt-4 grid gap-4">
              {overview.themes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  agentId={props.agentId}
                  theme={theme}
                  active={overview.activeThemeId === theme.id}
                  busy={props.busy}
                  onApply={() => props.onApply(theme.id)}
                  onExport={() => props.onExport(theme.id)}
                  onDelete={() => props.onDelete(theme.id)}
                />
              ))}
            </div>
          ) : (
            <AppearanceEmpty
              icon={<ImageIcon className="h-7 w-7" />}
              text={t("agents.appearance.noSkins")}
            />
          )}
        </section>
        <div className="border-t border-border/70 pt-4">
          <OpenDirectoryButton
            path={overview.themeDirectoryPath}
            label={t("agents.appearance.openSkinFolder")}
          />
        </div>
      </div>
    </div>
  );
}

export function AgentAppearancePanel({
  agent,
}: {
  agent: ManagedAgentSummary;
}) {
  const { t } = useTranslation();
  const { overview, activeAction, error, refresh, run } = useAgentAppearance(
    agent.id,
  );
  const [section, setSection] = useState<AppearanceSection>("skins");
  const [restartExisting, setRestartExisting] = useState(false);
  const busy = activeAction !== null;

  if (!overview && activeAction === "refresh") {
    return <AppearanceLoading />;
  }
  if (!overview) {
    return (
      <AppearanceError message={error || t("agents.appearance.loadFailed")} />
    );
  }

  const importSelected = () =>
    section === "skins"
      ? run("import-theme", () =>
          window.api.agent.importAppearanceTheme(agent.id),
        )
      : run("import-pet", () => window.api.agent.importAgentPet(agent.id));
  const confirmDelete = async (
    message: string,
    operation: () => Promise<unknown>,
  ) => {
    if (!(await requestConfirmation({
      message: message,
      variant: "destructive",
      confirmText: t("common.delete"),
    }))) return;
    void operation();
  };

  return (
    <div className="flex h-full min-h-0">
      <AppearanceNavigation
        section={section}
        themeCount={overview.themes.length}
        petCount={overview.pets.length}
        onChange={setSection}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppearanceToolbar
          section={section}
          busy={busy}
          activeThemeId={overview.activeThemeId}
          onImport={() => void importSelected()}
          onRefresh={() => void refresh()}
        />
        {section === "skins" ? (
          <SkinsWorkspace
            agentId={agent.id}
            overview={overview}
            busy={busy}
            restartExisting={restartExisting}
            error={error}
            onRestartChange={setRestartExisting}
            onApply={(themeId) =>
              void run("apply-theme", () =>
                window.api.agent.applyAppearanceTheme({
                  agentId: agent.id,
                  themeId,
                  restartExisting,
                }),
              )
            }
            onExport={(themeId) =>
              void run("export-theme", () =>
                window.api.agent.exportAppearanceTheme(agent.id, themeId),
              )
            }
            onDelete={(themeId) =>
              confirmDelete(t("agents.appearance.deleteThemeConfirm"), () =>
                run("delete-theme", () =>
                  window.api.agent.deleteAppearanceTheme(agent.id, themeId),
                ),
              )
            }
            onRestore={() =>
              void run("restore-theme", () =>
                window.api.agent.restoreAppearanceTheme(agent.id),
              )
            }
          />
        ) : (
          <AgentPetWorkspace
            agentId={agent.id}
            overview={overview}
            busy={busy}
            error={error}
            onImport={() =>
              void run("import-pet", () =>
                window.api.agent.importAgentPet(agent.id),
              )
            }
            onUpdate={async (input: UpdateAgentPetInput) =>
              (await run("update-pet", () =>
                window.api.agent.updateAppearancePet(input),
              )) !== null
            }
            onInstall={async (petId) =>
              (await run("install-store-pet", () =>
                window.api.agent.installAppearancePetFromStore(agent.id, petId),
              )) !== null
            }
            onExport={(petId) =>
              void run("export-pet", () =>
                window.api.agent.exportAgentPet(agent.id, petId),
              )
            }
            onDelete={(petId) =>
              confirmDelete(t("agents.appearance.deletePetConfirm"), () =>
                run("delete-pet", () =>
                  window.api.agent.deleteAgentPet(agent.id, petId),
                ),
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function AppearanceLoading() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
      <LoaderCircleIcon className="h-6 w-6 animate-spin" />
    </div>
  );
}

function AppearanceError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function AppearanceEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mt-5 flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/15 px-4 text-sm text-muted-foreground">
      <span className="text-muted-foreground/55">{icon}</span>
      {text}
    </div>
  );
}

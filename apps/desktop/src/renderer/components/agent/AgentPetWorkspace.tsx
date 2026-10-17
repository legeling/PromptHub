import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PencilIcon,
  SearchIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AgentAppearanceOverview,
  AgentPetStoreItem,
  AgentPetStorePage,
  AgentPetSummary,
  UpdateAgentPetInput,
} from "@prompthub/shared/types";
import { Modal } from "../ui/Modal";
import {
  AgentAssetActionButton,
  AgentAssetCard,
} from "./AgentAssetManagementSurface";
import { AgentAppearancePreview } from "./AgentAppearancePreview";

type PetView = "installed" | "store";

interface AgentPetWorkspaceProps {
  agentId: string;
  overview: AgentAppearanceOverview;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onUpdate: (input: UpdateAgentPetInput) => Promise<boolean>;
  onInstall: (petId: string) => Promise<boolean>;
  onExport: (petId: string) => void;
  onDelete: (petId: string) => void;
}

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45";
const MAX_PREVIEW_MEMORY_ENTRIES = 96;

function rememberPreview(
  current: Record<string, string>,
  id: string,
  value: string,
): Record<string, string> {
  const next = { ...current };
  delete next[id];
  next[id] = value;
  const overflow = Object.keys(next).length - MAX_PREVIEW_MEMORY_ENTRIES;
  if (overflow > 0) {
    Object.keys(next)
      .slice(0, overflow)
      .forEach((key) => delete next[key]);
  }
  return next;
}

function VersionBadge({ version }: { version: 1 | 2 }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border bg-muted/50 px-2 text-[11px] font-semibold text-muted-foreground">
      v{version}
    </span>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={iconButton}
    >
      {children}
    </button>
  );
}

function PetMetadataChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center truncate rounded-full border border-border px-2 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function PetAssetCardContent({
  preview,
  previewTestId,
  title,
  status,
  description,
  metadata,
}: {
  preview: ReactNode;
  previewTestId: string;
  title: ReactNode;
  status: ReactNode;
  description: ReactNode;
  metadata: ReactNode;
}) {
  return (
    <div className="grid h-full min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 overflow-hidden">
      <div
        data-testid={previewTestId}
        className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/20"
      >
        {preview}
      </div>
      <div className="flex h-28 min-w-0 flex-col overflow-hidden py-1">
        <div className="flex h-7 min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {title}
          </span>
          <span className="shrink-0">{status}</span>
        </div>
        <div
          data-testid={`${previewTestId}-description`}
          className="mt-1.5 line-clamp-2 break-words overflow-hidden text-sm leading-5 text-muted-foreground"
        >
          {description}
        </div>
        <div className="mt-auto flex h-6 flex-nowrap gap-1.5 overflow-hidden">
          {metadata}
        </div>
      </div>
    </div>
  );
}

function InstalledPetCard({
  agentId,
  pet,
  busy,
  onEdit,
  onExport,
  onDelete,
}: {
  agentId: string;
  pet: AgentPetSummary;
  busy: boolean;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AgentAssetCard
      testId="installed-pet-card"
      actionsTestId="installed-pet-card-actions"
      openLabel={t("agents.appearance.editPet", { name: pet.name })}
      onOpen={onEdit}
      actions={
        <>
          <AgentAssetActionButton
            aria-label={t("agents.appearance.openPetPath", { name: pet.name })}
            title={t("agents.appearance.openPetPath", { name: pet.name })}
            onClick={() => void window.electron?.openPath?.(pet.directoryPath)}
          >
            <FolderOpenIcon className="h-4 w-4" />
          </AgentAssetActionButton>
          <AgentAssetActionButton
            aria-label={t("agents.appearance.editPet", { name: pet.name })}
            title={t("agents.appearance.editPet", { name: pet.name })}
            disabled={busy}
            onClick={onEdit}
          >
            <PencilIcon className="h-4 w-4" />
          </AgentAssetActionButton>
          <AgentAssetActionButton
            aria-label={t("agents.appearance.exportPet", { name: pet.name })}
            title={t("agents.appearance.exportPet", { name: pet.name })}
            disabled={busy}
            onClick={onExport}
          >
            <DownloadIcon className="h-4 w-4" />
          </AgentAssetActionButton>
          <AgentAssetActionButton
            variant="destructive"
            aria-label={t("agents.appearance.deletePet", { name: pet.name })}
            title={t("agents.appearance.deletePet", { name: pet.name })}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2Icon className="h-4 w-4" />
          </AgentAssetActionButton>
        </>
      }
    >
      <PetAssetCardContent
        preview={
          <AgentAppearancePreview
            agentId={agentId}
            assetId={pet.id}
            kind="pet"
            alt={pet.name}
            spriteVersionNumber={pet.spriteVersionNumber}
            className="h-full w-full border-0"
          />
        }
        previewTestId="installed-pet-preview"
        title={pet.name}
        status={<VersionBadge version={pet.spriteVersionNumber} />}
        description={pet.description || pet.id}
        metadata={
          <PetMetadataChip>
            {(pet.spritesheetBytes / 1024 / 1024).toFixed(1)} MB
          </PetMetadataChip>
        }
      />
    </AgentAssetCard>
  );
}

function StorePetIcon({ source, name }: { source?: string; name: string }) {
  if (!source) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">
        <ShoppingBagIcon className="h-7 w-7 opacity-55" />
      </span>
    );
  }
  return (
    <img
      src={source}
      alt={name}
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}

function StorePetCard({
  item,
  preview,
  busy,
  onInstall,
}: {
  item: AgentPetStoreItem;
  preview?: string;
  busy: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const name = item.localizedName || item.name;
  return (
    <AgentAssetCard
      testId="store-pet-card"
      actionsTestId="store-pet-card-actions"
      openLabel={t("agents.appearance.installPet")}
      onOpen={() => {
        if (!busy && !item.installed) onInstall();
      }}
      actions={
        <AgentAssetActionButton
          variant="primary"
          aria-label={
            item.installed
              ? t("agents.appearance.petInstalled")
              : t("agents.appearance.installPet")
          }
          title={
            item.installed
              ? t("agents.appearance.petInstalled")
              : t("agents.appearance.installPet")
          }
          disabled={busy || item.installed}
          onClick={onInstall}
        >
          {busy ? (
            <LoaderCircleIcon className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadIcon className="h-4 w-4" />
          )}
        </AgentAssetActionButton>
      }
    >
      <PetAssetCardContent
        preview={<StorePetIcon source={preview} name={name} />}
        previewTestId="store-pet-preview"
        title={name}
        status={<VersionBadge version={item.spriteVersionNumber} />}
        description={
          item.description || t("agents.appearance.petStoreDescription")
        }
        metadata={
          <>
            {item.author ? (
              <PetMetadataChip>
                @{item.authorHandle || item.author}
              </PetMetadataChip>
            ) : null}
            {item.category ? (
              <PetMetadataChip>{item.category}</PetMetadataChip>
            ) : null}
            {item.license ? (
              <PetMetadataChip>{item.license}</PetMetadataChip>
            ) : null}
          </>
        }
      />
    </AgentAssetCard>
  );
}

function PetEditModal({
  pet,
  open,
  busy,
  onClose,
  onSave,
}: {
  pet: AgentPetSummary | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setName(pet?.name ?? "");
    setDescription(pet?.description ?? "");
  }, [pet]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("agents.appearance.editPetTitle")}
      subtitle={pet?.id}
      size="md"
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-foreground">
          {t("agents.appearance.petName")}
          <input
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          {t("agents.appearance.petDescription")}
          <textarea
            value={description}
            maxLength={1_000}
            rows={5}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onSave(name.trim(), description.trim())}
            className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

async function loadPreviews(
  agentId: string,
  items: AgentPetStoreItem[],
  onPreview: (id: string, value: string) => void,
): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      try {
        const value = await window.api.agent.getAppearancePetStorePreview(
          agentId,
          item.id,
        );
        onPreview(item.id, value);
      } catch {
        // A missing preview must not block catalog browsing or installation.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
}

export function AgentPetWorkspace(props: AgentPetWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<PetView>("installed");
  const [editingPet, setEditingPet] = useState<AgentPetSummary | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [store, setStore] = useState<AgentPetStorePage | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);
  const storeRequestId = useRef(0);
  const previewValues = useRef<Record<string, string>>({});
  const previewRequests = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadStore = useCallback(
    async (refresh = false) => {
      const requestId = ++storeRequestId.current;
      setStoreLoading(true);
      setStoreError(null);
      try {
        const result = await window.api.agent.listAppearancePetStore({
          agentId: props.agentId,
          search,
          locale: i18n.resolvedLanguage || i18n.language,
          page,
          pageSize: 12,
          refresh,
        });
        if (requestId === storeRequestId.current) setStore(result);
      } catch (cause) {
        if (requestId === storeRequestId.current) {
          setStoreError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (requestId === storeRequestId.current) setStoreLoading(false);
      }
    },
    [i18n.language, i18n.resolvedLanguage, page, props.agentId, search],
  );

  useEffect(() => {
    if (view !== "store") return;
    void loadStore();
  }, [loadStore, searchRevision, view]);

  useEffect(() => {
    if (!store?.items.length) return;
    const pending = store.items.filter(
      (item) =>
        !previewValues.current[item.id] &&
        !previewRequests.current.has(item.id),
    );
    if (!pending.length) return;
    pending.forEach((item) => previewRequests.current.add(item.id));
    void loadPreviews(props.agentId, pending, (id, value) => {
      previewValues.current = rememberPreview(previewValues.current, id, value);
      if (mounted.current) setPreviews(previewValues.current);
    }).finally(() => {
      pending.forEach((item) => previewRequests.current.delete(item.id));
    });
  }, [props.agentId, store?.items]);

  const emptyStore = useMemo(
    () => !storeLoading && !storeError && store?.items.length === 0,
    [store?.items.length, storeError, storeLoading],
  );

  const install = async (petId: string) => {
    setInstallingId(petId);
    const completed = await props.onInstall(petId);
    setInstallingId(null);
    if (completed) void loadStore(true);
  };

  const submitStoreSearch = () => {
    setSearch(searchDraft.trim());
    setPage(1);
    setSearchRevision((value) => value + 1);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/15 px-5 py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        {props.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-sm text-destructive">
            {props.error}
          </div>
        ) : null}
        {props.overview.invalidPetCount ? (
          <div className="flex items-center gap-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <AlertTriangleIcon className="h-4 w-4" />
            </span>
            <span className="font-medium">
              {t("agents.appearance.invalidItems", {
                count: props.overview.invalidPetCount,
              })}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3 shadow-sm">
          <div className="inline-flex rounded-md bg-muted p-1">
            {(["installed", "store"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={view === item}
                onClick={() => setView(item)}
                className={`h-8 rounded px-3 text-sm font-medium transition-colors ${
                  view === item
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item === "installed"
                  ? t("agents.appearance.installedPets", {
                      count: props.overview.pets.length,
                    })
                  : t("agents.appearance.petStore")}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onImport}
              disabled={props.busy}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-45"
            >
              <DownloadIcon className="h-4 w-4" />
              {t("agents.appearance.importPet")}
            </button>
            <IconAction
              label={t("agents.appearance.openPetFolder")}
              onClick={() =>
                void window.electron?.openPath?.(
                  props.overview.petDirectoryPath,
                )
              }
            >
              <FolderOpenIcon className="h-4 w-4" />
            </IconAction>
          </div>
        </div>

        {view === "installed" ? (
          props.overview.pets.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {props.overview.pets.map((pet) => (
                <InstalledPetCard
                  key={pet.id}
                  agentId={props.agentId}
                  pet={pet}
                  busy={props.busy}
                  onEdit={() => setEditingPet(pet)}
                  onExport={() => props.onExport(pet.id)}
                  onDelete={() => props.onDelete(pet.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
              <ShoppingBagIcon className="h-7 w-7 opacity-50" />
              {t("agents.appearance.noPets")}
            </div>
          )
        ) : (
          <section className="space-y-4">
            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitStoreSearch();
              }}
            >
              <label className="relative min-w-56 flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    submitStoreSearch();
                  }}
                  placeholder={t("agents.appearance.searchPets")}
                  className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                aria-label={t("agents.appearance.searchPetsAction")}
                title={t("agents.appearance.searchPetsAction")}
                className={iconButton}
              >
                <SearchIcon className="h-4 w-4" />
              </button>
              <IconAction
                label={t("agents.refresh")}
                disabled={storeLoading}
                onClick={() => void loadStore(true)}
              >
                <LoaderCircleIcon
                  className={`h-4 w-4 ${storeLoading ? "animate-spin" : ""}`}
                />
              </IconAction>
            </form>
            {storeError ? (
              <div className="rounded-md border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive">
                {t("agents.appearance.petStoreLoadFailed")}:{" "}
                {storeError.includes("PET_STORE_REQUEST_TIMEOUT")
                  ? t("agents.appearance.petStoreTimeout")
                  : storeError}
              </div>
            ) : null}
            {storeLoading && !store ? (
              <div className="flex min-h-48 items-center justify-center text-muted-foreground">
                <LoaderCircleIcon className="h-6 w-6 animate-spin" />
              </div>
            ) : null}
            {store?.items.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {store.items.map((item) => (
                  <StorePetCard
                    key={item.id}
                    item={item}
                    preview={previews[item.id]}
                    busy={props.busy || installingId === item.id}
                    onInstall={() => void install(item.id)}
                  />
                ))}
              </div>
            ) : null}
            {emptyStore ? (
              <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
                {t("agents.appearance.noStorePets")}
              </div>
            ) : null}
            {store && store.total > store.pageSize ? (
              <div className="flex items-center justify-center gap-3 pt-2">
                <IconAction
                  label={t("agents.appearance.previousPage")}
                  disabled={page <= 1 || storeLoading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </IconAction>
                <span className="text-xs text-muted-foreground">
                  {t("agents.appearance.petStorePage", {
                    page: store.page,
                    total: Math.ceil(store.total / store.pageSize),
                  })}
                </span>
                <IconAction
                  label={t("agents.appearance.nextPage")}
                  disabled={!store.hasMore || storeLoading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </IconAction>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <PetEditModal
        pet={editingPet}
        open={editingPet !== null}
        busy={props.busy}
        onClose={() => setEditingPet(null)}
        onSave={(name, description) => {
          if (!editingPet) return;
          void props
            .onUpdate({
              agentId: props.agentId,
              petId: editingPet.id,
              name,
              description,
            })
            .then((completed) => {
              if (completed) setEditingPet(null);
            });
        }}
      />
    </div>
  );
}

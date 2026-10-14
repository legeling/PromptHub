import { DatabaseIcon, GlobeIcon, Settings2Icon } from "lucide-react";
import type { TFunction } from "i18next";
import type {
  McpMarketSource,
  McpMarketTemplate,
  McpMarketUpdateCheck,
  McpMarketUpdateResult,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import type {
  CustomStoreSource,
  CustomStoreSourceType,
} from "../../services/custom-store-source";
import { SkillStoreSourceForm } from "../skill/SkillStoreSourceForm";
import { McpMarketView } from "./McpMarketView";
import type { McpMarketScrollPosition } from "./McpMarketView";
import type { MutableRefObject } from "react";
import { McpViewTransition } from "./mcp-manager-utils";

export const MCP_CUSTOM_SOURCE_TYPE_OPTIONS = [
  {
    value: "marketplace-json" as const,
    icon: <DatabaseIcon className="h-4 w-4" />,
  },
  {
    value: "git-repo" as const,
    icon: <GlobeIcon className="h-4 w-4" />,
  },
];

interface McpStoreWorkspaceProps {
  error?: string | null;
  hasMore: boolean;
  installedServers: McpServerConfig[];
  isLoading: boolean;
  isLoadingMore: boolean;
  remoteTemplates: McpMarketTemplate[];
  searchQuery: string;
  scrollPosition: MutableRefObject<McpMarketScrollPosition | null>;
  selectedCustomSource: CustomStoreSource | null;
  selectedSourceId: string;
  sourceBranch: string;
  sourceDirectory: string;
  sourceName: string;
  sources: McpMarketSource[];
  sourceType: CustomStoreSourceType;
  sourceUrl: string;
  t: TFunction;
  templates: McpMarketTemplate[];
  totalCount?: number;
  totalCountIsLowerBound?: boolean;
  onAddCustomSource: () => void;
  onChangeSourceBranch: (branch: string) => void;
  onChangeSourceDirectory: (directory: string) => void;
  onChangeSourceName: (name: string) => void;
  onChangeSourceType: (type: CustomStoreSourceType) => void;
  onChangeSourceUrl: (url: string) => void;
  onEditCustomSource: (sourceId: string) => void;
  onInstall: (templateId: string) => Promise<void>;
  onCheckUpdate: (
    identifier: string,
    template: McpMarketTemplate,
  ) => Promise<McpMarketUpdateCheck>;
  onUpdate: (
    identifier: string,
    template: McpMarketTemplate,
    force?: boolean,
  ) => Promise<McpMarketUpdateResult>;
  onLoadMore: () => void;
  onRefresh: () => void;
  onSearchChange: (query: string) => void;
}

export function McpStoreWorkspace({
  error,
  hasMore,
  installedServers,
  isLoading,
  isLoadingMore,
  remoteTemplates,
  searchQuery,
  scrollPosition,
  selectedCustomSource,
  selectedSourceId,
  sourceBranch,
  sourceDirectory,
  sourceName,
  sources,
  sourceType,
  sourceUrl,
  t,
  templates,
  totalCount,
  totalCountIsLowerBound,
  onAddCustomSource,
  onChangeSourceBranch,
  onChangeSourceDirectory,
  onChangeSourceName,
  onChangeSourceType,
  onChangeSourceUrl,
  onEditCustomSource,
  onInstall,
  onCheckUpdate,
  onUpdate,
  onLoadMore,
  onRefresh,
  onSearchChange,
}: McpStoreWorkspaceProps) {
  return (
    <McpViewTransition viewKey="store">
      {selectedSourceId === "new-custom" ? (
        <div className="h-full overflow-y-auto app-wallpaper-section p-6">
          <SkillStoreSourceForm
            branch={sourceBranch}
            directory={sourceDirectory}
            handleAddSource={onAddCustomSource}
            setBranch={onChangeSourceBranch}
            setDirectory={onChangeSourceDirectory}
            setSourceName={onChangeSourceName}
            setSourceType={onChangeSourceType}
            setSourceUrl={onChangeSourceUrl}
            sourceName={sourceName}
            sourceType={sourceType}
            sourceUrl={sourceUrl}
            t={t}
            typeOptions={MCP_CUSTOM_SOURCE_TYPE_OPTIONS}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {selectedCustomSource ? (
            <div className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-2 text-right">
              <button
                type="button"
                onClick={() => onEditCustomSource(selectedCustomSource.id)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Settings2Icon aria-hidden="true" className="h-4 w-4" />
                {t("common.edit", "Edit")}
              </button>
            </div>
          ) : null}
          <McpMarketView
            templates={templates}
            remoteTemplates={remoteTemplates}
            sources={sources}
            selectedSourceId={selectedSourceId}
            searchQuery={searchQuery}
            scrollPosition={scrollPosition}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            error={error}
            totalCount={totalCount}
            totalCountIsLowerBound={totalCountIsLowerBound}
            installedServers={installedServers}
            onLoadMore={onLoadMore}
            onRefresh={onRefresh}
            onSearchChange={onSearchChange}
            onInstall={onInstall}
            onCheckUpdate={onCheckUpdate}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </McpViewTransition>
  );
}

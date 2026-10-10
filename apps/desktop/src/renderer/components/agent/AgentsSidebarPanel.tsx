import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRightIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { filterManagedAgents } from "../../services/managed-agents";
import { useAgentStore } from "../../stores/agent.store";
import { isWebRuntime } from "../../runtime";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useConfirmLeaveDirtySkillEditor } from "../skill/useConfirmLeaveDirtySkillEditor";

const AGENT_ROW_HEIGHT = 80;

function statusClass(status: "installed" | "configured" | "not-detected") {
  if (status === "installed") return "bg-emerald-500";
  if (status === "configured") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function AgentsSidebarPanel() {
  const { t } = useTranslation();
  const agents = useAgentStore((state) => state.agents);
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const searchQuery = useAgentStore((state) => state.searchQuery);
  const isLoading = useAgentStore((state) => state.isLoading);
  const ensureLoaded = useAgentStore((state) => state.ensureLoaded);
  const refresh = useAgentStore((state) => state.refresh);
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const setSearchQuery = useAgentStore((state) => state.setSearchQuery);
  const togglePinned = useAgentStore((state) => state.togglePinned);
  const confirmLeaveDirtySkillEditor = useConfirmLeaveDirtySkillEditor();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const installedAgents = useMemo(
    () => filterManagedAgents(agents, "", "installed"),
    [agents],
  );
  const listedAgents = isWebRuntime() ? agents : installedAgents;
  const visibleAgents = useMemo(
    () => filterManagedAgents(listedAgents, searchQuery, "all"),
    [listedAgents, searchQuery],
  );
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleAgents.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => AGENT_ROW_HEIGHT,
    overscan: 6,
    getItemKey: (index) => visibleAgents[index].id,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar-background/35">
      <div className="border-b border-border/70 px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {t("agents.title", "Agents")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("agents.agentCount", "{{count}} available", {
                count: listedAgents.length,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label={t("agents.refresh", "Refresh")}
            title={t("agents.refresh", "Refresh")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <label className="relative block">
          <SearchIcon
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("agents.searchPlaceholder", "Search Agents")}
            className="h-10 w-full rounded-md border border-border bg-background/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
      </div>

      <div ref={scrollParentRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {visibleAgents.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("agents.noAgentsFound", "No Agents match this view.")}
          </div>
        ) : (
          <div
            role="list"
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualRows.map((virtualRow) => {
              const agent = visibleAgents[virtualRow.index];
              const selected = selectedAgentId === agent.id;
              return (
                <div
                  key={agent.id}
                  data-index={virtualRow.index}
                  role="listitem"
                  aria-posinset={virtualRow.index + 1}
                  aria-setsize={visibleAgents.length}
                  className="absolute left-0 top-0 w-full pb-2"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className={`group relative h-full overflow-hidden rounded-md border transition-colors ${
                      selected
                        ? "border-primary/70 bg-primary/10 shadow-sm"
                        : "border-border/70 bg-background/45 hover:border-border hover:bg-accent/45"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={agent.name}
                      onClick={async () => {
                        if (agent.id === selectedAgentId) return;
                        if (!(await confirmLeaveDirtySkillEditor())) return;
                        selectAgent(agent.id);
                      }}
                      className="flex h-full w-full items-center gap-3 px-3 py-2.5 pr-14 text-left"
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/60">
                        <PlatformIcon
                          platformId={agent.displayIconId || agent.id}
                          size={34}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block min-w-0 truncate text-sm font-semibold text-foreground">
                          {agent.name}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${statusClass(agent.status)}`}
                          />
                          {t(`agents.${agent.status}`, agent.status)}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground/75">
                          {agent.paths.root}
                        </span>
                      </span>
                      <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground/60"}`}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={
                        agent.isPinned
                          ? t("agents.unpin", "Unpin")
                          : t("agents.pin", "Pin")
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePinned(agent.id);
                      }}
                      className={`absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-accent ${
                        agent.isPinned
                          ? "text-primary"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                      }`}
                    >
                      <PinIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

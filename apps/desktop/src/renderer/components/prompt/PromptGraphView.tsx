import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import {
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
} from "react-force-graph-2d";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import {
  buildNeighborIndex,
  buildPromptGraphData,
  getLinkEndpointId,
  getNodeVal,
  shouldShowNodeLabel,
  type PromptGraphLink,
  type PromptGraphNode,
} from "./prompt-graph-layout";

interface PromptGraphViewProps {
  prompts: Prompt[];
  relations: PromptRelation[];
  selectedPromptId: string | null;
  onSelectPrompt: (promptId: string) => void;
}

interface GraphThemeColors {
  background: string;
  nodeIsolated: string;
  nodeConnected: string;
  nodeAccent: string;
  nodeSelected: string;
  nodeDimmed: string;
  nodeSelectedRing: string;
  link: string;
  linkActive: string;
  linkSelected: string;
  label: string;
  labelActive: string;
  labelHalo: string;
}

const GRAPH_THEME: { dark: GraphThemeColors; light: GraphThemeColors } = {
  dark: {
    background: "#1a1a1a",
    nodeIsolated: "#9aa0a8",
    nodeConnected: "#c2c8d2",
    nodeAccent: "#e2e7ef",
    nodeSelected: "#4c8dff",
    nodeDimmed: "rgba(150, 156, 166, 0.28)",
    nodeSelectedRing: "rgba(76, 141, 255, 0.4)",
    link: "rgba(190, 196, 208, 0.22)",
    linkActive: "rgba(96, 160, 255, 0.9)",
    linkSelected: "rgba(76, 141, 255, 0.6)",
    label: "rgba(214, 220, 230, 0.92)",
    labelActive: "#ffffff",
    labelHalo: "#1a1a1a",
  },
  light: {
    background: "#fafafa",
    nodeIsolated: "#9298a2",
    nodeConnected: "#6f7682",
    nodeAccent: "#454c58",
    nodeSelected: "#2f7bf6",
    nodeDimmed: "rgba(110, 118, 130, 0.22)",
    nodeSelectedRing: "rgba(47, 123, 246, 0.35)",
    link: "rgba(60, 66, 78, 0.28)",
    linkActive: "rgba(47, 123, 246, 0.9)",
    linkSelected: "rgba(47, 123, 246, 0.55)",
    label: "rgba(42, 48, 58, 0.95)",
    labelActive: "#10151f",
    labelHalo: "#fafafa",
  },
};

const ZOOM_STEP = 1.35;

type ForceGraphRef = ForceGraphMethods<PromptGraphNode, PromptGraphLink>;

function useContainerSize(): [
  React.RefObject<HTMLDivElement>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function PromptGraphView({
  prompts,
  relations,
  selectedPromptId,
  onSelectPrompt,
}: PromptGraphViewProps) {
  const { t } = useTranslation();
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const theme = isDarkMode ? GRAPH_THEME.dark : GRAPH_THEME.light;

  const graphRef = useRef<ForceGraphRef | undefined>(undefined);
  const [containerRef, size] = useContainerSize();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const graphData = useMemo(
    () => buildPromptGraphData(prompts, relations),
    [prompts, relations],
  );
  const neighborIndex = useMemo(
    () => buildNeighborIndex(graphData.links),
    [graphData.links],
  );

  const highlightedId = hoveredId ?? selectedPromptId;
  const activeNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!highlightedId) {
      return ids;
    }
    ids.add(highlightedId);
    for (const neighbor of neighborIndex.get(highlightedId) ?? []) {
      ids.add(neighbor);
    }
    return ids;
  }, [highlightedId, neighborIndex]);

  // Tune the library's built-in d3-force for a stable, compact Obsidian-style
  // layout. The key is forceX/forceY: they give every node a pull toward the
  // centre, which balances the repulsion into a tight equilibrium. forceCenter
  // alone only recentres the centroid, so nodes would drift apart forever and
  // "explode" whenever the simulation reheated on drag.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    // Moderate repulsion with a capped range so distant nodes don't keep
    // pushing each other outward.
    graph.d3Force(
      "charge",
      forceManyBody<PromptGraphNode>().strength(-90).distanceMax(260),
    );

    // Collision keeps each node's label-sized disc from overlapping neighbours.
    graph.d3Force(
      "collide",
      forceCollide<PromptGraphNode>()
        .radius((node) => Math.sqrt(getNodeVal(node)) * 3.2 + 14)
        .strength(0.85)
        .iterations(2),
    );

    const link = graph.d3Force("link");
    link
      ?.distance((edge: PromptGraphLink) => (edge.isHierarchy ? 36 : 52))
      .strength((edge: PromptGraphLink) => {
        const source = edge.source as PromptGraphNode;
        const target = edge.target as PromptGraphNode;
        const minDegree = Math.min(
          (source.degree ?? 0) + 1,
          (target.degree ?? 0) + 1,
        );
        return 1 / minDegree;
      });

    // Per-node centering force — this is what holds the layout compact and
    // stable instead of expanding without bound. forceCenter is removed.
    graph.d3Force("center", null);
    graph.d3Force("x", forceX<PromptGraphNode>(0).strength(0.06));
    graph.d3Force("y", forceY<PromptGraphNode>(0).strength(0.06));
    graph.d3ReheatSimulation();
  }, [graphData]);

  // Motion preference: "off" freezes after warmup (no live animation),
  // "reduced" settles fast, "standard" gets the full planetary drift then rests.
  // cooldownTicks is finite so the simulation actually stops — an always-on
  // sim keeps drifting and balloons on every interaction.
  const motionConfig = useMemo(() => {
    if (motionPreference === "off") {
      return { warmupTicks: 200, cooldownTicks: 0, alphaDecay: 0.1 };
    }
    if (motionPreference === "reduced") {
      return { warmupTicks: 40, cooldownTicks: 60, alphaDecay: 0.06 };
    }
    return { warmupTicks: 0, cooldownTicks: 200, alphaDecay: 0.0228 };
  }, [motionPreference]);

  const handleZoom = useCallback((transform: { k: number }) => {
    setZoomLevel(transform.k);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    graph.zoom(graph.zoom() * factor, 220);
  }, []);

  const fitView = useCallback(() => {
    graphRef.current?.zoomToFit(420, 60);
  }, []);

  const resetView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    graph.zoom(1, 220);
    graph.centerAt(0, 0, 220);
    graph.d3ReheatSimulation();
  }, []);

  const nodeColor = useCallback(
    (node: NodeObject<PromptGraphNode>) => {
      if (activeNodeIds.size > 0 && !activeNodeIds.has(node.id)) {
        return theme.nodeDimmed;
      }
      if (node.id === selectedPromptId) {
        return theme.nodeSelected;
      }
      if (node.id === highlightedId || activeNodeIds.has(node.id)) {
        return theme.nodeAccent;
      }
      return node.degree > 0 ? theme.nodeConnected : theme.nodeIsolated;
    },
    [activeNodeIds, highlightedId, selectedPromptId, theme],
  );

  const linkColor = useCallback(
    (link: PromptGraphLink) => {
      const sourceId = getLinkEndpointId(link.source);
      const targetId = getLinkEndpointId(link.target);
      if (
        highlightedId &&
        (sourceId === highlightedId || targetId === highlightedId)
      ) {
        return theme.linkActive;
      }
      if (
        selectedPromptId &&
        (sourceId === selectedPromptId || targetId === selectedPromptId)
      ) {
        return theme.linkSelected;
      }
      return theme.link;
    },
    [highlightedId, selectedPromptId, theme],
  );

  const linkWidth = useCallback(
    (link: PromptGraphLink) => {
      const sourceId = getLinkEndpointId(link.source);
      const targetId = getLinkEndpointId(link.target);
      const focused =
        highlightedId &&
        (sourceId === highlightedId || targetId === highlightedId);
      return focused ? 2 : 1;
    },
    [highlightedId],
  );

  // Custom node renderer: filled dot sized by degree, blue ring on selection,
  // and a label that fades in by zoom/hover — Obsidian's exact behaviour.
  const paintNode = useCallback(
    (
      node: NodeObject<PromptGraphNode>,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = Math.sqrt(getNodeVal(node)) * 3.2;
      const isSelected = node.id === selectedPromptId;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.nodeSelectedRing;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();

      const showLabel = shouldShowNodeLabel(
        node,
        prompts.length,
        highlightedId,
        activeNodeIds,
        globalScale,
      );
      if (!showLabel) {
        return;
      }

      const isHighlighted =
        node.id === highlightedId || activeNodeIds.has(node.id);
      // Clamp font so labels stay readable when zoomed far out: as globalScale
      // shrinks, 1/globalScale grows, but we cap it so text never balloons.
      const fontSize = Math.min(
        (isHighlighted ? 13 : 12) / globalScale,
        isHighlighted ? 15 : 13,
      );
      const label =
        node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title;

      ctx.font = `${isHighlighted ? 600 : 500} ${fontSize}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelY = y + radius + 4 / globalScale;

      ctx.lineWidth = 3.5 / globalScale;
      ctx.strokeStyle = theme.labelHalo;
      ctx.lineJoin = "round";
      ctx.strokeText(label, x, labelY);

      ctx.fillStyle = isHighlighted ? theme.labelActive : theme.label;
      ctx.fillText(label, x, labelY);
    },
    [
      activeNodeIds,
      highlightedId,
      nodeColor,
      prompts.length,
      selectedPromptId,
      theme,
    ],
  );

  const handleNodeClick = useCallback(
    (node: NodeObject<PromptGraphNode>) => {
      onSelectPrompt(node.id);
    },
    [onSelectPrompt],
  );

  const handleNodeHover = useCallback(
    (node: NodeObject<PromptGraphNode> | null) => {
      setHoveredId(node?.id ?? null);
    },
    [],
  );

  const zoomPercent = `${Math.round(zoomLevel * 100)}%`;

  if (graphData.nodes.length === 0) {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        style={{ backgroundColor: theme.background }}
      >
        <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
          {t("prompt.graph.empty")}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      style={{ backgroundColor: theme.background }}
    >
      <h2 className="sr-only">{t("prompt.graph.title")}</h2>
      <div
        ref={containerRef}
        className="relative min-h-[420px] flex-1 overflow-hidden"
        data-testid="prompt-graph-content"
      >
        <GraphControls
          zoomPercent={zoomPercent}
          t={t}
          isDarkMode={isDarkMode}
          onZoomIn={() => zoomBy(ZOOM_STEP)}
          onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
          onFit={fitView}
          onReset={resetView}
        />
        <ForceGraph2D<PromptGraphNode, PromptGraphLink>
          ref={graphRef}
          width={size.width || 800}
          height={size.height || 600}
          graphData={graphData}
            backgroundColor={theme.background}
            nodeId="id"
            nodeVal={getNodeVal}
            nodeColor={nodeColor}
            nodeCanvasObject={paintNode}
            nodeCanvasObjectMode={() => "replace"}
            nodeLabel={() => ""}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkLineDash={(link: PromptGraphLink) =>
              link.isHierarchy ? null : [4, 4]
            }
            warmupTicks={motionConfig.warmupTicks}
            cooldownTicks={motionConfig.cooldownTicks}
            d3AlphaDecay={motionConfig.alphaDecay}
            d3VelocityDecay={0.32}
            enableNodeDrag
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onZoom={handleZoom}
        />
      </div>
    </div>
  );
}

function GraphControls({
  zoomPercent,
  t,
  isDarkMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  zoomPercent: string;
  t: ReturnType<typeof useTranslation>["t"];
  isDarkMode: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className={`absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1 rounded-lg p-1 text-xs shadow-lg backdrop-blur ${
        isDarkMode
          ? "bg-[#242424]/80 text-zinc-400 shadow-black/30 ring-1 ring-white/5"
          : "bg-white/85 text-zinc-500 shadow-black/10 ring-1 ring-black/5"
      }`}
    >
      <GraphControlButton
        label={t("prompt.graph.fitView", "Fit graph to screen")}
        isDarkMode={isDarkMode}
        onClick={onFit}
      >
        <Maximize2Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <GraphControlButton
        label={t("prompt.graph.zoomOut", "Zoom out graph")}
        isDarkMode={isDarkMode}
        onClick={onZoomOut}
      >
        <MinusIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <span
        className={`min-w-10 rounded-md px-1 py-0.5 text-center font-medium tabular-nums ${
          isDarkMode ? "text-zinc-500" : "text-zinc-400"
        }`}
      >
        {zoomPercent}
      </span>
      <GraphControlButton
        label={t("prompt.graph.zoomIn", "Zoom in graph")}
        isDarkMode={isDarkMode}
        onClick={onZoomIn}
      >
        <PlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <GraphControlButton
        label={t("prompt.graph.resetView", "Reset graph view")}
        isDarkMode={isDarkMode}
        onClick={onReset}
      >
        <RotateCcwIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
    </div>
  );
}

function GraphControlButton({
  label,
  children,
  isDarkMode,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        isDarkMode
          ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          : "text-zinc-500 hover:bg-black/5 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { PromptSummary, PromptRelation } from "@prompthub/shared/types";
import { usePromptGraphTheme } from "./prompt-graph-theme";
import { PROMPT_GRAPH_SIMULATION } from "./prompt-graph-motion";
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
  prompts: PromptSummary[];
  relations: PromptRelation[];
  selectedPromptId: string | null;
  onSelectPrompt: (promptId: string) => void;
}

const ZOOM_STEP = 1.35;

type ForceGraphRef = ForceGraphMethods<PromptGraphNode, PromptGraphLink>;

function useContainerSize(
  hasNodes: boolean,
): [React.RefObject<HTMLDivElement>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNodes]);

  return [ref, size];
}

export function PromptGraphView({
  prompts,
  relations,
  selectedPromptId,
  onSelectPrompt,
}: PromptGraphViewProps) {
  const { t } = useTranslation();
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const theme = usePromptGraphTheme();

  const graphRef = useRef<ForceGraphRef | undefined>(undefined);
  const isDragging = useRef(false);
  const [containerRef, size] = useContainerSize(prompts.length > 0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPointerInside, setIsPointerInside] = useState(false);

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
  // Configure forces during commit, before the library's deferred warmup.
  // A passive effect can otherwise replace the forces after the first paint.
  useLayoutEffect(() => {
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
        .iterations(graphData.nodes.length > 64 ? 1 : 2),
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
  }, [graphData]);

  const motionConfig = PROMPT_GRAPH_SIMULATION.motion[motionPreference];

  const handleNodeDrag = useCallback(() => {
    if (isDragging.current) return;
    isDragging.current = true;
    // The library resets its clock on drag but cannot tick a cooled engine
    // below alphaMin. Reheat once per gesture, not on every pointer move.
    if (motionPreference !== "off") graphRef.current?.d3ReheatSimulation();
  }, [motionPreference]);

  const handleNodeDragEnd = useCallback(() => {
    isDragging.current = false;
    if (motionPreference !== "off") graphRef.current?.d3ReheatSimulation();
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
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
          {t("prompt.graph.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <h2 className="sr-only">{t("prompt.graph.title")}</h2>
      <div
        ref={containerRef}
        className="relative min-h-[420px] flex-1 overflow-hidden"
        data-testid="prompt-graph-content"
        onPointerEnter={() => setIsPointerInside(true)}
        onPointerLeave={() => {
          setIsPointerInside(false);
          setHoveredId(null);
        }}
      >
        <GraphControls
          zoomPercent={zoomPercent}
          t={t}
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
          cooldownTime={PROMPT_GRAPH_SIMULATION.cooldownTimeMs}
          d3AlphaMin={PROMPT_GRAPH_SIMULATION.alphaMin}
          d3AlphaDecay={motionConfig.alphaDecay}
          d3VelocityDecay={PROMPT_GRAPH_SIMULATION.velocityDecay}
          enableNodeDrag={isPointerInside}
          enablePointerInteraction={isPointerInside}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          onZoom={handleZoom}
        />
      </div>
    </div>
  );
}

function GraphControls({
  zoomPercent,
  t,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  zoomPercent: string;
  t: ReturnType<typeof useTranslation>["t"];
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1 rounded-lg border border-border bg-popover/90 p-1 text-xs text-muted-foreground shadow-lg backdrop-blur">
      <GraphControlButton
        label={t("prompt.graph.fitView", "Fit graph to screen")}
        onClick={onFit}
      >
        <Maximize2Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <GraphControlButton
        label={t("prompt.graph.zoomOut", "Zoom out graph")}
        onClick={onZoomOut}
      >
        <MinusIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <span className="min-w-10 rounded-md px-1 py-0.5 text-center font-medium tabular-nums text-muted-foreground">
        {zoomPercent}
      </span>
      <GraphControlButton
        label={t("prompt.graph.zoomIn", "Zoom in graph")}
        onClick={onZoomIn}
      >
        <PlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </GraphControlButton>
      <GraphControlButton
        label={t("prompt.graph.resetView", "Reset graph view")}
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
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

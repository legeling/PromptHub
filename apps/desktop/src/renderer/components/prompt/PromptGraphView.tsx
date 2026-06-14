import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  GitBranchIcon,
  ImageIcon,
  Link2Icon,
  Maximize2Icon,
  MessageSquareTextIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";
import {
  DEFAULT_VIEWPORT,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  ZOOM_STEP,
  createPromptGraphEdges,
  createPromptGraphNodes,
  fitViewportToNodes,
  getNodePosition,
  getNodeRadius,
  getSvgDelta,
  getSvgPoint,
  shouldShowEdgeLabel,
  shouldShowNodeLabel,
  zoomViewport,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphNode,
  type GraphPoint,
  type GraphViewport,
} from "./prompt-graph-layout";

interface PromptGraphViewProps {
  prompts: Prompt[];
  relations: PromptRelation[];
  selectedPromptId: string | null;
  onSelectPrompt: (promptId: string) => void;
}

interface DragState {
  mode: "canvas" | "node";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewport: GraphViewport;
  nodeId?: string;
  startNode?: GraphPoint;
  moved: boolean;
}

function getGraphEdgeLabel(
  t: ReturnType<typeof useTranslation>["t"],
  kind: GraphEdgeKind,
) {
  if (kind === "grouped_under") {
    return t("prompt.graph.groupedUnder");
  }

  return t(`prompt.relationships.kind.${kind}`);
}

function getNodeColorClass(node: GraphNode, isSelected: boolean) {
  if (isSelected) {
    return "fill-primary stroke-primary";
  }

  if (node.hasSemanticRelation) {
    return "fill-amber-500/90 stroke-amber-600/70";
  }

  if (node.hasHierarchy) {
    return "fill-blue-500/90 stroke-primary/70";
  }

  if (node.prompt.promptType === "image") {
    return "fill-sky-400/70 stroke-sky-500/50";
  }

  return "fill-muted-foreground/45 stroke-muted-foreground/40";
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
    <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
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
      <span className="min-w-12 px-1 text-center font-medium tabular-nums text-foreground">
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function GraphLegend({ t }: { t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
      <span className="inline-flex items-center gap-1">
        <GitBranchIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 text-primary"
        />
        {t("prompt.graph.groupedUnder")}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span className="inline-flex items-center gap-1">
        <Link2Icon aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" />
        {t("prompt.relationships.kind.related_to")}
      </span>
    </div>
  );
}

function EmptyGraph({ t }: { t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
      {t("prompt.graph.empty")}
    </div>
  );
}

export function PromptGraphView({
  prompts,
  relations,
  selectedPromptId,
  onSelectPrompt,
}: PromptGraphViewProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [viewport, setViewport] = useState<GraphViewport>(DEFAULT_VIEWPORT);
  const [nodeOverrides, setNodeOverrides] = useState<Map<string, GraphPoint>>(
    () => new Map(),
  );

  const edges = useMemo(
    () => createPromptGraphEdges(prompts, relations),
    [prompts, relations],
  );
  const baseNodes = useMemo(
    () => createPromptGraphNodes(prompts, edges, selectedPromptId),
    [edges, prompts, selectedPromptId],
  );
  const nodeById = useMemo(
    () => new Map(baseNodes.map((node) => [node.prompt.id, node])),
    [baseNodes],
  );
  const zoomPercent = `${Math.round(viewport.scale * 100)}%`;

  const zoomAtCenter = useCallback((nextScale: number) => {
    setViewport((current) =>
      zoomViewport(current, nextScale, {
        x: GRAPH_WIDTH / 2,
        y: GRAPH_HEIGHT / 2,
      }),
    );
  }, []);

  const fitGraph = useCallback(() => {
    setViewport(fitViewportToNodes(baseNodes));
  }, [baseNodes]);

  const resetGraph = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT);
    setNodeOverrides(new Map());
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const anchor = getSvgPoint(svgRef.current, event.clientX, event.clientY);
    setViewport((current) =>
      zoomViewport(current, current.scale * zoomFactor, anchor),
    );
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragStateRef.current = {
        mode: "canvas",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: viewport,
        moved: false,
      };
    },
    [viewport],
  );

  const handleNodePointerDown = useCallback(
    (node: GraphNode, event: ReactPointerEvent<SVGGElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      const position = getNodePosition(node, nodeOverrides);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragStateRef.current = {
        mode: "node",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: viewport,
        nodeId: node.prompt.id,
        startNode: position,
        moved: false,
      };
    },
    [nodeOverrides, viewport],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - dragState.startClientX;
      const dy = event.clientY - dragState.startClientY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        dragState.moved = true;
      }

      const delta = getSvgDelta(svgRef.current, dx, dy);
      if (dragState.mode === "canvas") {
        setViewport({
          ...dragState.startViewport,
          x: dragState.startViewport.x + delta.x,
          y: dragState.startViewport.y + delta.y,
        });
        return;
      }

      if (!dragState.nodeId || !dragState.startNode) {
        return;
      }

      const nodeId = dragState.nodeId;
      const startNode = dragState.startNode;
      const startScale = dragState.startViewport.scale;
      setNodeOverrides((current) => {
        const next = new Map(current);
        next.set(nodeId, {
          x: startNode.x + delta.x / startScale,
          y: startNode.y + delta.y / startScale,
        });
        return next;
      });
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      suppressClickRef.current = dragState.mode === "node" && dragState.moved;
      dragStateRef.current = null;
    },
    [],
  );

  const handleNodeClick = useCallback(
    (promptId: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      onSelectPrompt(promptId);
    },
    [onSelectPrompt],
  );

  const handleNodeKeyDown = useCallback(
    (promptId: string, event: ReactKeyboardEvent<SVGGElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onSelectPrompt(promptId);
    },
    [onSelectPrompt],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border app-wallpaper-toolbar px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t("prompt.graph.title")}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-2.5 py-1">
            {t("prompt.graph.promptCount", { count: prompts.length })}
          </span>
          <span className="rounded-full border border-border bg-card px-2.5 py-1">
            {t("prompt.graph.relationCount", { count: edges.length })}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {baseNodes.length === 0 ? (
          <EmptyGraph t={t} />
        ) : (
          <div className="relative h-full min-h-[420px] overflow-hidden bg-muted/20">
            <GraphControls
              zoomPercent={zoomPercent}
              t={t}
              onZoomIn={() => zoomAtCenter(viewport.scale * ZOOM_STEP)}
              onZoomOut={() => zoomAtCenter(viewport.scale / ZOOM_STEP)}
              onFit={fitGraph}
              onReset={resetGraph}
            />
            <GraphLegend t={t} />
            <svg
              ref={svgRef}
              aria-label={t(
                "prompt.graph.canvasLabel",
                "Prompt relationship graph canvas",
              )}
              className="absolute inset-0 h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
              viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              onWheel={handleWheel}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <pattern
                  id="prompt-graph-grid"
                  width="48"
                  height="48"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 48 0 L 0 0 0 48"
                    className="stroke-border/60"
                    fill="none"
                    strokeWidth="1"
                  />
                </pattern>
                <marker
                  id="prompt-graph-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    className="fill-muted-foreground/55"
                  />
                </marker>
              </defs>
              <rect
                width={GRAPH_WIDTH}
                height={GRAPH_HEIGHT}
                fill="url(#prompt-graph-grid)"
              />
              <g
                data-testid="prompt-graph-content"
                transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
              >
                <GraphEdges
                  edges={edges}
                  edgeCount={edges.length}
                  nodeById={nodeById}
                  nodeOverrides={nodeOverrides}
                  selectedPromptId={selectedPromptId}
                  scale={viewport.scale}
                  t={t}
                />
                <GraphNodes
                  nodes={baseNodes}
                  nodeOverrides={nodeOverrides}
                  promptCount={prompts.length}
                  selectedPromptId={selectedPromptId}
                  scale={viewport.scale}
                  t={t}
                  onNodeClick={handleNodeClick}
                  onNodeKeyDown={handleNodeKeyDown}
                  onNodePointerDown={handleNodePointerDown}
                />
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function GraphEdges({
  edges,
  edgeCount,
  nodeById,
  nodeOverrides,
  selectedPromptId,
  scale,
  t,
}: {
  edges: GraphEdge[];
  edgeCount: number;
  nodeById: Map<string, GraphNode>;
  nodeOverrides: Map<string, GraphPoint>;
  selectedPromptId: string | null;
  scale: number;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <g>
      {edges.map((edge) => {
        const source = nodeById.get(edge.sourceId);
        const target = nodeById.get(edge.targetId);
        if (!source || !target) {
          return null;
        }

        const sourcePoint = getNodePosition(source, nodeOverrides);
        const targetPoint = getNodePosition(target, nodeOverrides);
        const labelX = (sourcePoint.x + targetPoint.x) / 2;
        const labelY = (sourcePoint.y + targetPoint.y) / 2 - 8;
        const showLabel = shouldShowEdgeLabel(
          edge,
          edgeCount,
          selectedPromptId,
          scale,
        );

        return (
          <g key={edge.id}>
            <line
              x1={sourcePoint.x}
              y1={sourcePoint.y}
              x2={targetPoint.x}
              y2={targetPoint.y}
              className={
                edge.isHierarchy ? "stroke-primary/70" : "stroke-amber-500/60"
              }
              strokeWidth={edge.isHierarchy ? 2.25 : 1.65}
              strokeDasharray={edge.isHierarchy ? undefined : "6 7"}
              markerEnd="url(#prompt-graph-arrow)"
            />
            {showLabel && (
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                paintOrder="stroke"
                className="fill-muted-foreground stroke-background stroke-[4px] text-[11px]"
              >
                {getGraphEdgeLabel(t, edge.kind)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function GraphNodes({
  nodes,
  nodeOverrides,
  promptCount,
  selectedPromptId,
  scale,
  t,
  onNodeClick,
  onNodeKeyDown,
  onNodePointerDown,
}: {
  nodes: GraphNode[];
  nodeOverrides: Map<string, GraphPoint>;
  promptCount: number;
  selectedPromptId: string | null;
  scale: number;
  t: ReturnType<typeof useTranslation>["t"];
  onNodeClick: (promptId: string) => void;
  onNodeKeyDown: (
    promptId: string,
    event: ReactKeyboardEvent<SVGGElement>,
  ) => void;
  onNodePointerDown: (
    node: GraphNode,
    event: ReactPointerEvent<SVGGElement>,
  ) => void;
}) {
  return (
    <g>
      {nodes.map((node) => {
        const point = getNodePosition(node, nodeOverrides);
        const isSelected = node.prompt.id === selectedPromptId;
        const radius = getNodeRadius(node, isSelected);
        const showLabel = shouldShowNodeLabel(
          node,
          promptCount,
          selectedPromptId,
          scale,
        );

        return (
          <g
            key={node.prompt.id}
            role="button"
            tabIndex={0}
            aria-label={t("prompt.graph.openPrompt", {
              title: node.prompt.title,
            })}
            className="cursor-pointer outline-none"
            transform={`translate(${point.x} ${point.y})`}
            onClick={() => onNodeClick(node.prompt.id)}
            onKeyDown={(event) => onNodeKeyDown(node.prompt.id, event)}
            onPointerDown={(event) => onNodePointerDown(node, event)}
          >
            <circle
              r={radius + 5}
              className={isSelected ? "fill-primary/15" : "fill-transparent"}
            />
            <circle
              r={radius}
              className={`${getNodeColorClass(node, isSelected)} transition-colors`}
              strokeWidth={isSelected ? 3 : 1.5}
            />
            {node.prompt.promptType === "image" && (
              <ImageIcon
                aria-hidden="true"
                className="pointer-events-none text-background"
                x={-4}
                y={-4}
                width={8}
                height={8}
                strokeWidth={2.8}
              />
            )}
            {node.degree > 0 && (
              <circle
                r={radius + 3.5}
                className="fill-none stroke-foreground/10"
                strokeWidth="1"
              />
            )}
            {showLabel && (
              <GraphNodeLabel node={node} isSelected={isSelected} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function GraphNodeLabel({
  node,
  isSelected,
}: {
  node: GraphNode;
  isSelected: boolean;
}) {
  return (
    <g transform="translate(12 -13)" className="pointer-events-none">
      <rect
        x="0"
        y="0"
        width={Math.min(178, Math.max(56, node.prompt.title.length * 7 + 34))}
        height="26"
        rx="7"
        className={
          isSelected
            ? "fill-primary stroke-primary"
            : "fill-card/95 stroke-border"
        }
        strokeWidth="1"
      />
      {node.prompt.promptType === "image" ? (
        <ImageIcon
          aria-hidden="true"
          className={isSelected ? "text-white/85" : "text-blue-500"}
          x="8"
          y="7"
          width="12"
          height="12"
        />
      ) : (
        <MessageSquareTextIcon
          aria-hidden="true"
          className={isSelected ? "text-white/85" : "text-primary"}
          x="8"
          y="7"
          width="12"
          height="12"
        />
      )}
      <text
        x="26"
        y="17"
        className={
          isSelected
            ? "fill-white text-[12px] font-medium"
            : "fill-foreground text-[12px] font-medium"
        }
      >
        {node.prompt.title.length > 21
          ? `${node.prompt.title.slice(0, 20)}...`
          : node.prompt.title}
      </text>
    </g>
  );
}

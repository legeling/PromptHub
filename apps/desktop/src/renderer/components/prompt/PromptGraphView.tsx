import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Maximize2Icon,
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
  getNodeRadius,
  getSvgDelta,
  getSvgPoint,
  shouldShowNodeLabel,
  tickPromptGraph,
  zoomViewport,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphNode,
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
  startNodeX?: number;
  startNodeY?: number;
  nodeId?: string;
  moved: boolean;
}

function cloneGraphNode(node: GraphNode): GraphNode {
  return { ...node };
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

function getGraphEdgeAriaLabel(
  t: ReturnType<typeof useTranslation>["t"],
  kind: GraphEdgeKind,
) {
  return t("prompt.graph.edgeAriaLabel", {
    defaultValue: "{{relation}} relationship",
    relation: getGraphEdgeLabel(t, kind),
  });
}

function getNodeColorClass(
  node: GraphNode,
  isSelected: boolean,
  isActive: boolean,
) {
  if (isSelected) {
    return "fill-sky-300 stroke-sky-100";
  }

  if (isActive) {
    return "fill-sky-400 stroke-sky-100/90";
  }

  if (node.hasSemanticRelation) {
    return "fill-blue-400/80 stroke-blue-200/50";
  }

  if (node.hasHierarchy) {
    return "fill-indigo-300/75 stroke-indigo-100/45";
  }

  if (node.prompt.promptType === "image") {
    return "fill-cyan-300/60 stroke-cyan-100/35";
  }

  return "fill-zinc-500/55 stroke-zinc-300/25";
}

function createActiveNodeIds(
  edges: GraphEdge[],
  highlightedPromptId: string | null,
) {
  const activeNodeIds = new Set<string>();

  if (!highlightedPromptId) {
    return activeNodeIds;
  }

  activeNodeIds.add(highlightedPromptId);
  for (const edge of edges) {
    if (edge.sourceId === highlightedPromptId) {
      activeNodeIds.add(edge.targetId);
    }

    if (edge.targetId === highlightedPromptId) {
      activeNodeIds.add(edge.sourceId);
    }
  }

  return activeNodeIds;
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
    <div className="absolute right-5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-xl bg-[#1f1f1f]/35 p-1.5 text-xs text-zinc-400 backdrop-blur">
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
      <span className="min-w-10 rounded-md px-1 py-0.5 text-center font-medium tabular-nums text-zinc-500">
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {children}
    </button>
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
  const animationFrameRef = useRef<number | null>(null);
  const alphaRef = useRef(0.85);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const selectedPromptIdRef = useRef(selectedPromptId);
  const pinnedNodeIdRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState<GraphViewport>(DEFAULT_VIEWPORT);
  const [animatedNodes, setAnimatedNodes] = useState<GraphNode[]>([]);
  const [hoveredPromptId, setHoveredPromptId] = useState<string | null>(null);

  const edges = useMemo(
    () => createPromptGraphEdges(prompts, relations),
    [prompts, relations],
  );
  const baseNodes = useMemo(
    () => createPromptGraphNodes(prompts, edges, selectedPromptId),
    [edges, prompts, selectedPromptId],
  );
  const nodeById = useMemo(
    () => new Map(animatedNodes.map((node) => [node.prompt.id, node])),
    [animatedNodes],
  );
  const highlightedPromptId = hoveredPromptId ?? selectedPromptId;
  const activeNodeIds = useMemo(
    () => createActiveNodeIds(edges, highlightedPromptId),
    [edges, highlightedPromptId],
  );
  const zoomPercent = `${Math.round(viewport.scale * 100)}%`;

  const startGraphAnimation = useCallback((nextAlpha = 0.75) => {
    alphaRef.current = Math.max(alphaRef.current, nextAlpha);
    if (animationFrameRef.current !== null) {
      return;
    }

    const step = () => {
      const maxVelocity = tickPromptGraph(nodesRef.current, edgesRef.current, {
        alpha: alphaRef.current,
        selectedPromptId: selectedPromptIdRef.current,
        pinnedNodeId: pinnedNodeIdRef.current,
      });

      setAnimatedNodes(nodesRef.current.map(cloneGraphNode));
      alphaRef.current *= pinnedNodeIdRef.current ? 0.985 : 0.94;

      if (
        pinnedNodeIdRef.current ||
        alphaRef.current > 0.014 ||
        maxVelocity > 0.03
      ) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = null;
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    selectedPromptIdRef.current = selectedPromptId;
    alphaRef.current = Math.max(alphaRef.current, 0.52);
    startGraphAnimation(0.52);
  }, [selectedPromptId, startGraphAnimation]);

  useEffect(() => {
    const previousById = new Map(
      nodesRef.current.map((node) => [node.prompt.id, node]),
    );
    const nextNodes = baseNodes.map((node) => {
      const previous = previousById.get(node.prompt.id);
      if (!previous) {
        return cloneGraphNode(node);
      }

      return {
        ...node,
        x: previous.x,
        y: previous.y,
        vx: previous.vx,
        vy: previous.vy,
      };
    });

    nodesRef.current = nextNodes;
    setAnimatedNodes(nextNodes.map(cloneGraphNode));
    startGraphAnimation(0.85);
  }, [baseNodes, startGraphAnimation]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

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
    const nextNodes = baseNodes.map(cloneGraphNode);
    nodesRef.current = nextNodes;
    setAnimatedNodes(nextNodes.map(cloneGraphNode));
    pinnedNodeIdRef.current = null;
    startGraphAnimation(0.9);
  }, [baseNodes, startGraphAnimation]);

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
      event.currentTarget.setPointerCapture?.(event.pointerId);
      pinnedNodeIdRef.current = node.prompt.id;
      setHoveredPromptId(node.prompt.id);
      alphaRef.current = 0.95;
      dragStateRef.current = {
        mode: "node",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: viewport,
        nodeId: node.prompt.id,
        startNodeX: node.x,
        startNodeY: node.y,
        moved: false,
      };
      startGraphAnimation(0.95);
    },
    [startGraphAnimation, viewport],
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

      if (
        !dragState.nodeId ||
        dragState.startNodeX === undefined ||
        dragState.startNodeY === undefined
      ) {
        return;
      }

      const nodeId = dragState.nodeId;
      const startScale = dragState.startViewport.scale;
      const nextX = dragState.startNodeX + delta.x / startScale;
      const nextY = dragState.startNodeY + delta.y / startScale;
      const draggedNode = nodesRef.current.find(
        (node) => node.prompt.id === nodeId,
      );
      if (!draggedNode) {
        return;
      }

      draggedNode.x = nextX;
      draggedNode.y = nextY;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      alphaRef.current = 0.95;
      setAnimatedNodes(nodesRef.current.map(cloneGraphNode));
      startGraphAnimation(0.95);
    },
    [startGraphAnimation],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      if (dragState.mode === "node") {
        pinnedNodeIdRef.current = null;
        setHoveredPromptId(null);
        alphaRef.current = Math.max(alphaRef.current, 0.62);
        startGraphAnimation(0.62);
      }

      suppressClickRef.current = dragState.mode === "node" && dragState.moved;
      dragStateRef.current = null;
    },
    [startGraphAnimation],
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
    <div className="flex h-full min-h-0 flex-col bg-[#1f1f1f]">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {animatedNodes.length === 0 ? (
          <EmptyGraph t={t} />
        ) : (
          <div className="relative h-full min-h-[420px] overflow-hidden bg-[#1f1f1f]">
            <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center">
              <h2 className="rounded-full bg-[#1f1f1f]/65 px-3 py-1 text-sm font-semibold text-zinc-100 backdrop-blur">
                {t("prompt.graph.title")}
              </h2>
            </div>
            <GraphControls
              zoomPercent={zoomPercent}
              t={t}
              onZoomIn={() => zoomAtCenter(viewport.scale * ZOOM_STEP)}
              onZoomOut={() => zoomAtCenter(viewport.scale / ZOOM_STEP)}
              onFit={fitGraph}
              onReset={resetGraph}
            />
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
                <radialGradient
                  id="prompt-graph-backdrop"
                  cx="50%"
                  cy="48%"
                  r="72%"
                >
                  <stop offset="0%" stopColor="#242424" />
                  <stop offset="60%" stopColor="#1f1f1f" />
                  <stop offset="100%" stopColor="#191919" />
                </radialGradient>
              </defs>
              <rect
                width={GRAPH_WIDTH}
                height={GRAPH_HEIGHT}
                fill="url(#prompt-graph-backdrop)"
              />
              <g
                data-testid="prompt-graph-content"
                transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
              >
                <GraphEdges
                  edges={edges}
                  nodeById={nodeById}
                  highlightedPromptId={highlightedPromptId}
                  selectedPromptId={selectedPromptId}
                  t={t}
                />
                <GraphNodes
                  activeNodeIds={activeNodeIds}
                  nodes={animatedNodes}
                  promptCount={prompts.length}
                  selectedPromptId={selectedPromptId}
                  scale={viewport.scale}
                  t={t}
                  onNodeClick={handleNodeClick}
                  onNodeKeyDown={handleNodeKeyDown}
                  onNodePointerDown={handleNodePointerDown}
                  onNodePointerEnter={setHoveredPromptId}
                  onNodePointerLeave={() => setHoveredPromptId(null)}
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
  nodeById,
  highlightedPromptId,
  selectedPromptId,
  t,
}: {
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
  highlightedPromptId: string | null;
  selectedPromptId: string | null;
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

        const isFocused = Boolean(
          highlightedPromptId &&
            (edge.sourceId === highlightedPromptId ||
              edge.targetId === highlightedPromptId),
        );
        const isSelectedEdge = Boolean(
          selectedPromptId &&
            (edge.sourceId === selectedPromptId ||
              edge.targetId === selectedPromptId),
        );
        return (
          <g key={edge.id}>
            <line
              aria-label={getGraphEdgeAriaLabel(t, edge.kind)}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              className={
                isFocused
                  ? "stroke-sky-300/85"
                  : isSelectedEdge
                    ? "stroke-sky-400/42"
                  : edge.isHierarchy
                    ? "stroke-sky-300/18"
                    : "stroke-zinc-500/14"
              }
              strokeLinecap="round"
              strokeWidth={isFocused ? 1.9 : 0.95}
              strokeDasharray={edge.isHierarchy ? undefined : "4 8"}
            />
          </g>
        );
      })}
    </g>
  );
}

function GraphNodes({
  activeNodeIds,
  nodes,
  promptCount,
  selectedPromptId,
  scale,
  t,
  onNodeClick,
  onNodeKeyDown,
  onNodePointerDown,
  onNodePointerEnter,
  onNodePointerLeave,
}: {
  activeNodeIds: Set<string>;
  nodes: GraphNode[];
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
  onNodePointerEnter: (promptId: string) => void;
  onNodePointerLeave: () => void;
}) {
  return (
    <g>
      {nodes.map((node) => {
        const isSelected = node.prompt.id === selectedPromptId;
        const isActive = activeNodeIds.has(node.prompt.id);
        const isDimmed = activeNodeIds.size > 0 && !isActive;
        const radius = getNodeRadius(node, isSelected);
        const showLabel = shouldShowNodeLabel(
          node,
          promptCount,
          selectedPromptId,
          scale,
          activeNodeIds,
        );

        return (
          <g
            key={node.prompt.id}
            role="button"
            tabIndex={0}
            aria-label={t("prompt.graph.openPrompt", {
              title: node.prompt.title,
            })}
            className={`cursor-grab outline-none transition-opacity active:cursor-grabbing ${
              isDimmed ? "opacity-30" : "opacity-100"
            }`}
            transform={`translate(${node.x} ${node.y})`}
            onClick={() => onNodeClick(node.prompt.id)}
            onKeyDown={(event) => onNodeKeyDown(node.prompt.id, event)}
            onPointerDown={(event) => onNodePointerDown(node, event)}
            onPointerEnter={() => onNodePointerEnter(node.prompt.id)}
            onPointerLeave={onNodePointerLeave}
          >
            <circle
              r={radius + 12}
              className={isActive ? "fill-sky-400/8" : "fill-transparent"}
            />
            {isActive && (
              <circle
                r={radius + 6.5}
                className="fill-none stroke-sky-300/25"
                strokeWidth="1.2"
              />
            )}
            <circle
              r={radius}
              className={`${getNodeColorClass(
                node,
                isSelected,
                isActive,
              )} transition-colors`}
              strokeWidth={isSelected || isActive ? 1.8 : 1.1}
            />
            {node.degree > 0 && (
              <circle
                r={radius + 3.2}
                className="fill-none stroke-zinc-200/12"
                strokeWidth="0.9"
              />
            )}
            {showLabel && (
              <GraphNodeLabel
                node={node}
                isActive={isActive}
                isSelected={isSelected}
                radius={radius}
                scale={scale}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function GraphNodeLabel({
  node,
  isActive,
  isSelected,
  radius,
  scale,
}: {
  node: GraphNode;
  isActive: boolean;
  isSelected: boolean;
  radius: number;
  scale: number;
}) {
  const labelScale = Math.min(1.15, Math.max(0.48, 1 / scale));
  const label = node.prompt.title.length > 28
    ? `${node.prompt.title.slice(0, 27)}...`
    : node.prompt.title;

  return (
    <g
      transform={`translate(${radius + 7} 3) scale(${labelScale})`}
      className="pointer-events-none"
    >
      <text
        x="0"
        y="0"
        paintOrder="stroke"
        stroke="#111318"
        strokeLinejoin="round"
        strokeWidth={isSelected || isActive ? 4 : 3}
        className={
          isSelected
            ? "fill-sky-50 text-[11px] font-semibold"
            : isActive
              ? "fill-sky-100 text-[10.5px] font-medium"
              : "fill-zinc-300/85 text-[10px] font-medium"
        }
      >
        {label}
      </text>
    </g>
  );
}

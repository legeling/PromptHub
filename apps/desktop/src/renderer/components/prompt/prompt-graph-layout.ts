import type { Prompt, PromptRelation } from "@prompthub/shared/types";

export type GraphEdgeKind = PromptRelation["kind"] | "grouped_under";

export interface GraphNode {
  prompt: Prompt;
  x: number;
  y: number;
  degree: number;
  hasHierarchy: boolean;
  hasSemanticRelation: boolean;
}

interface LayoutNode extends GraphNode {
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  isHierarchy: boolean;
}

export interface GraphViewport {
  x: number;
  y: number;
  scale: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

interface NodeMetrics {
  degree: number;
  hasHierarchy: boolean;
  hasSemanticRelation: boolean;
}

export const GRAPH_WIDTH = 1200;
export const GRAPH_HEIGHT = 760;
export const GRAPH_PADDING = 72;
export const DEFAULT_VIEWPORT: GraphViewport = { x: 0, y: 0, scale: 1 };
export const ZOOM_STEP = 1.2;

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.8;
const LABEL_DENSE_GRAPH_THRESHOLD = 48;
const ISOLATED_LABEL_ZOOM = 1.7;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createPromptGraphEdges(
  prompts: Prompt[],
  relations: PromptRelation[],
): GraphEdge[] {
  const promptIds = new Set(prompts.map((prompt) => prompt.id));
  const hierarchyEdges = prompts.flatMap((prompt): GraphEdge[] => {
    if (!prompt.parentId || !promptIds.has(prompt.parentId)) {
      return [];
    }

    return [
      {
        id: `hierarchy:${prompt.parentId}:${prompt.id}`,
        sourceId: prompt.parentId,
        targetId: prompt.id,
        kind: "grouped_under",
        isHierarchy: true,
      },
    ];
  });

  const semanticEdges = relations
    .filter(
      (relation) =>
        promptIds.has(relation.sourcePromptId) &&
        promptIds.has(relation.targetPromptId),
    )
    .map(
      (relation): GraphEdge => ({
        id: relation.id,
        sourceId: relation.sourcePromptId,
        targetId: relation.targetPromptId,
        kind: relation.kind,
        isHierarchy: false,
      }),
    );

  return [...hierarchyEdges, ...semanticEdges];
}

export function createPromptGraphNodes(
  prompts: Prompt[],
  edges: GraphEdge[],
  selectedPromptId: string | null,
): GraphNode[] {
  if (prompts.length === 0) {
    return [];
  }

  const metrics = createNodeMetrics(prompts, edges);
  const layoutNodes = createInitialLayoutNodes(
    prompts,
    metrics,
    selectedPromptId,
  );
  return runForceLayout(layoutNodes, edges).map(
    ({ prompt, x, y, degree, hasHierarchy, hasSemanticRelation }) => ({
      prompt,
      x,
      y,
      degree,
      hasHierarchy,
      hasSemanticRelation,
    }),
  );
}

function createNodeMetrics(prompts: Prompt[], edges: GraphEdge[]) {
  const metrics = new Map<string, NodeMetrics>();

  for (const prompt of prompts) {
    metrics.set(prompt.id, {
      degree: 0,
      hasHierarchy: false,
      hasSemanticRelation: false,
    });
  }

  for (const edge of edges) {
    for (const id of [edge.sourceId, edge.targetId]) {
      const metric = metrics.get(id);
      if (!metric) {
        continue;
      }

      metric.degree += 1;
      metric.hasHierarchy ||= edge.isHierarchy;
      metric.hasSemanticRelation ||= !edge.isHierarchy;
    }
  }

  return metrics;
}

function createInitialLayoutNodes(
  prompts: Prompt[],
  metrics: Map<string, NodeMetrics>,
  selectedPromptId: string | null,
): LayoutNode[] {
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  let connectedIndex = 0;
  let isolatedIndex = 0;

  return prompts.map((prompt, index) => {
    const metric = metrics.get(prompt.id) ?? {
      degree: 0,
      hasHierarchy: false,
      hasSemanticRelation: false,
    };
    const isSelected = prompt.id === selectedPromptId;
    const isConnected = metric.degree > 0;
    const rank = isConnected ? connectedIndex++ : isolatedIndex++;
    const angle = (index + 1) * GOLDEN_ANGLE - Math.PI / 2;
    const radius = isSelected
      ? 0
      : isConnected
        ? 88 + Math.sqrt(rank) * 64
        : 220 + Math.sqrt(rank) * 35;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius * 0.72;

    return {
      prompt,
      x,
      y,
      vx: 0,
      vy: 0,
      homeX: x,
      homeY: y,
      degree: metric.degree,
      hasHierarchy: metric.hasHierarchy,
      hasSemanticRelation: metric.hasSemanticRelation,
    };
  });
}

function runForceLayout(nodes: LayoutNode[], edges: GraphEdge[]) {
  if (nodes.length <= 1) {
    return nodes;
  }

  const nodeById = new Map(nodes.map((node) => [node.prompt.id, node]));
  const iterations = nodes.length > 180 ? 82 : 132;
  const enableFullRepulsion = nodes.length <= 240;

  for (let step = 0; step < iterations; step += 1) {
    const alpha = 1 - step / iterations;

    if (enableFullRepulsion) {
      applyNodeRepulsion(nodes, alpha);
    }

    applyEdgeSprings(edges, nodeById, alpha);
    applyCenterGravity(nodes, alpha);
    settleNodes(nodes);
  }

  return nodes;
}

function applyNodeRepulsion(nodes: LayoutNode[], alpha: number) {
  for (let index = 0; index < nodes.length; index += 1) {
    const source = nodes[index];
    for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
      const target = nodes[nextIndex];
      const dx = source.x - target.x || 0.01;
      const dy = source.y - target.y || 0.01;
      const distanceSquared = Math.max(dx * dx + dy * dy, 64);
      const distance = Math.sqrt(distanceSquared);
      const force =
        ((source.degree > 0 || target.degree > 0 ? 780 : 390) /
          distanceSquared) *
        alpha;
      const offsetX = (dx / distance) * force;
      const offsetY = (dy / distance) * force;

      source.vx += offsetX;
      source.vy += offsetY;
      target.vx -= offsetX;
      target.vy -= offsetY;
    }
  }
}

function applyEdgeSprings(
  edges: GraphEdge[],
  nodeById: Map<string, LayoutNode>,
  alpha: number,
) {
  for (const edge of edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) {
      continue;
    }

    const dx = target.x - source.x || 0.01;
    const dy = target.y - source.y || 0.01;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const targetDistance = edge.isHierarchy ? 150 : 128;
    const force = ((distance - targetDistance) / distance) * 0.034 * alpha;
    const offsetX = dx * force;
    const offsetY = dy * force;

    source.vx += offsetX;
    source.vy += offsetY;
    target.vx -= offsetX;
    target.vy -= offsetY;
  }
}

function applyCenterGravity(nodes: LayoutNode[], alpha: number) {
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;

  for (const node of nodes) {
    const connectedGravity = node.degree > 0 ? 0.008 : 0.002;
    const homeGravity = node.degree > 0 ? 0.0015 : 0.006;

    node.vx += (centerX - node.x) * connectedGravity * alpha;
    node.vy += (centerY - node.y) * connectedGravity * alpha;
    node.vx += (node.homeX - node.x) * homeGravity * alpha;
    node.vy += (node.homeY - node.y) * homeGravity * alpha;
  }
}

function settleNodes(nodes: LayoutNode[]) {
  for (const node of nodes) {
    node.x = clamp(
      node.x + node.vx,
      GRAPH_PADDING,
      GRAPH_WIDTH - GRAPH_PADDING,
    );
    node.y = clamp(
      node.y + node.vy,
      GRAPH_PADDING,
      GRAPH_HEIGHT - GRAPH_PADDING,
    );
    node.vx *= 0.72;
    node.vy *= 0.72;
  }
}

export function getSvgPoint(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): GraphPoint {
  const rect = svg?.getBoundingClientRect();
  const width = rect?.width || GRAPH_WIDTH;
  const height = rect?.height || GRAPH_HEIGHT;
  const left = rect?.left || 0;
  const top = rect?.top || 0;

  return {
    x: ((clientX - left) / width) * GRAPH_WIDTH,
    y: ((clientY - top) / height) * GRAPH_HEIGHT,
  };
}

export function getSvgDelta(
  svg: SVGSVGElement | null,
  dx: number,
  dy: number,
): GraphPoint {
  const rect = svg?.getBoundingClientRect();
  const width = rect?.width || GRAPH_WIDTH;
  const height = rect?.height || GRAPH_HEIGHT;

  return {
    x: (dx / width) * GRAPH_WIDTH,
    y: (dy / height) * GRAPH_HEIGHT,
  };
}

export function zoomViewport(
  viewport: GraphViewport,
  nextScale: number,
  anchor: GraphPoint,
): GraphViewport {
  const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
  const contentX = (anchor.x - viewport.x) / viewport.scale;
  const contentY = (anchor.y - viewport.y) / viewport.scale;

  return {
    x: anchor.x - contentX * scale,
    y: anchor.y - contentY * scale,
    scale,
  };
}

export function fitViewportToNodes(nodes: GraphNode[]): GraphViewport {
  if (nodes.length === 0) {
    return DEFAULT_VIEWPORT;
  }

  const bounds = nodes.reduce(
    (current, node) => ({
      minX: Math.min(current.minX, node.x),
      minY: Math.min(current.minY, node.y),
      maxX: Math.max(current.maxX, node.x),
      maxY: Math.max(current.maxY, node.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = clamp(
    Math.min(
      (GRAPH_WIDTH - GRAPH_PADDING * 2) / width,
      (GRAPH_HEIGHT - GRAPH_PADDING * 2) / height,
    ),
    MIN_ZOOM,
    1.5,
  );

  return {
    x: GRAPH_WIDTH / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    y: GRAPH_HEIGHT / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
    scale,
  };
}

export function getNodeRadius(node: GraphNode, isSelected: boolean) {
  if (isSelected) {
    return 10;
  }

  if (node.degree > 0) {
    return 8;
  }

  return node.prompt.promptType === "image" ? 6 : 5.25;
}

export function shouldShowNodeLabel(
  node: GraphNode,
  promptCount: number,
  selectedPromptId: string | null,
  scale: number,
) {
  return (
    promptCount <= LABEL_DENSE_GRAPH_THRESHOLD ||
    node.prompt.id === selectedPromptId ||
    node.degree > 0 ||
    scale >= ISOLATED_LABEL_ZOOM
  );
}

export function shouldShowEdgeLabel(
  edge: GraphEdge,
  edgeCount: number,
  selectedPromptId: string | null,
  scale: number,
) {
  return (
    edgeCount <= 16 ||
    scale >= 1.15 ||
    edge.sourceId === selectedPromptId ||
    edge.targetId === selectedPromptId
  );
}

export function getNodePosition(
  node: GraphNode,
  overrides: Map<string, GraphPoint>,
): GraphPoint {
  return overrides.get(node.prompt.id) ?? node;
}

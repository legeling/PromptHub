import type { Prompt, PromptRelation } from "@prompthub/shared/types";

export type GraphEdgeKind = PromptRelation["kind"] | "grouped_under";

// Node shape handed to react-force-graph-2d. The library mutates x/y/vx/vy and
// fx/fy in place while running its internal d3-force simulation, so those are
// optional and owned by the library — we never set them by hand.
export interface PromptGraphNode {
  id: string;
  title: string;
  promptType: Prompt["promptType"];
  degree: number;
  hasHierarchy: boolean;
  hasSemanticRelation: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface PromptGraphLink {
  id: string;
  // react-force-graph resolves string ids to node references in place, so after
  // the first tick source/target become PromptGraphNode objects.
  source: string | PromptGraphNode;
  target: string | PromptGraphNode;
  kind: GraphEdgeKind;
  isHierarchy: boolean;
}

export interface PromptGraphData {
  nodes: PromptGraphNode[];
  links: PromptGraphLink[];
}

interface NodeMetrics {
  degree: number;
  hasHierarchy: boolean;
  hasSemanticRelation: boolean;
}

const NODE_BASE_VAL = 1.2;
const NODE_DEGREE_VAL_STEP = 0.7;
const NODE_MAX_DEGREE = 16;
const DENSE_GRAPH_THRESHOLD = 32;
// On dense graphs labels stay hidden until you zoom in, so the default view is
// clean dots. Connected nodes reveal their label earlier than isolated ones.
const CONNECTED_LABEL_ZOOM = 2;
const ISOLATED_LABEL_ZOOM = 2.8;

function linkEndpointId(endpoint: string | PromptGraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function createNodeMetrics(
  prompts: Prompt[],
  relations: PromptRelation[],
): Map<string, NodeMetrics> {
  const metrics = new Map<string, NodeMetrics>();
  const promptIds = new Set(prompts.map((prompt) => prompt.id));

  for (const prompt of prompts) {
    metrics.set(prompt.id, {
      degree: 0,
      hasHierarchy: false,
      hasSemanticRelation: false,
    });
  }

  const bump = (id: string, hierarchy: boolean) => {
    const metric = metrics.get(id);
    if (!metric) {
      return;
    }
    metric.degree += 1;
    metric.hasHierarchy ||= hierarchy;
    metric.hasSemanticRelation ||= !hierarchy;
  };

  for (const prompt of prompts) {
    if (prompt.parentId && promptIds.has(prompt.parentId)) {
      bump(prompt.id, true);
      bump(prompt.parentId, true);
    }
  }

  for (const relation of relations) {
    if (
      promptIds.has(relation.sourcePromptId) &&
      promptIds.has(relation.targetPromptId)
    ) {
      bump(relation.sourcePromptId, false);
      bump(relation.targetPromptId, false);
    }
  }

  return metrics;
}

export function createPromptGraphLinks(
  prompts: Prompt[],
  relations: PromptRelation[],
): PromptGraphLink[] {
  const promptIds = new Set(prompts.map((prompt) => prompt.id));

  const hierarchyLinks = prompts.flatMap((prompt): PromptGraphLink[] => {
    if (!prompt.parentId || !promptIds.has(prompt.parentId)) {
      return [];
    }

    return [
      {
        id: `hierarchy:${prompt.parentId}:${prompt.id}`,
        source: prompt.parentId,
        target: prompt.id,
        kind: "grouped_under",
        isHierarchy: true,
      },
    ];
  });

  const semanticLinks = relations
    .filter(
      (relation) =>
        promptIds.has(relation.sourcePromptId) &&
        promptIds.has(relation.targetPromptId),
    )
    .map(
      (relation): PromptGraphLink => ({
        id: relation.id,
        source: relation.sourcePromptId,
        target: relation.targetPromptId,
        kind: relation.kind,
        isHierarchy: false,
      }),
    );

  return [...hierarchyLinks, ...semanticLinks];
}

export function buildPromptGraphData(
  prompts: Prompt[],
  relations: PromptRelation[],
): PromptGraphData {
  if (prompts.length === 0) {
    return { nodes: [], links: [] };
  }

  const metrics = createNodeMetrics(prompts, relations);
  const nodes: PromptGraphNode[] = prompts.map((prompt) => {
    const metric = metrics.get(prompt.id) ?? {
      degree: 0,
      hasHierarchy: false,
      hasSemanticRelation: false,
    };

    return {
      id: prompt.id,
      title: prompt.title,
      promptType: prompt.promptType,
      degree: metric.degree,
      hasHierarchy: metric.hasHierarchy,
      hasSemanticRelation: metric.hasSemanticRelation,
    };
  });

  return { nodes, links: createPromptGraphLinks(prompts, relations) };
}

// nodeVal feeds the library's area-based sizing (radius ≈ sqrt(val) * relSize),
// so a hub with many links renders noticeably larger, like Obsidian.
export function getNodeVal(node: PromptGraphNode): number {
  return (
    NODE_BASE_VAL +
    Math.min(node.degree, NODE_MAX_DEGREE) * NODE_DEGREE_VAL_STEP
  );
}

export function buildNeighborIndex(links: PromptGraphLink[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  const connect = (a: string, b: string) => {
    const set = index.get(a) ?? new Set<string>();
    set.add(b);
    index.set(a, set);
  };

  for (const link of links) {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);
    connect(source, target);
    connect(target, source);
  }

  return index;
}

export function getLinkEndpointId(endpoint: string | PromptGraphNode): string {
  return linkEndpointId(endpoint);
}

export function shouldShowNodeLabel(
  node: PromptGraphNode,
  promptCount: number,
  highlightedId: string | null,
  activeNodeIds: Set<string>,
  globalScale: number,
): boolean {
  if (node.id === highlightedId || activeNodeIds.has(node.id)) {
    return true;
  }

  if (promptCount <= DENSE_GRAPH_THRESHOLD) {
    return true;
  }

  if (node.degree > 0) {
    return globalScale >= CONNECTED_LABEL_ZOOM;
  }

  return globalScale >= ISOLATED_LABEL_ZOOM;
}

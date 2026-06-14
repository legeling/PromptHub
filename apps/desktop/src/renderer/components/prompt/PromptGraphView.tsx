import { useMemo } from "react";
import { GitBranchIcon, ImageIcon, Link2Icon, MessageSquareTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

interface PromptGraphViewProps {
  prompts: Prompt[];
  relations: PromptRelation[];
  selectedPromptId: string | null;
  onSelectPrompt: (promptId: string) => void;
}

type GraphEdgeKind = PromptRelation["kind"] | "grouped_under";

interface GraphNode {
  prompt: Prompt;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  isHierarchy: boolean;
}

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 560;
const NODE_WIDTH = 168;

function createPromptGraphNodes(prompts: Prompt[]): GraphNode[] {
  if (prompts.length === 0) {
    return [];
  }

  if (prompts.length === 1) {
    return [{ prompt: prompts[0], x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }];
  }

  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radiusX = Math.min(340, 140 + prompts.length * 18);
  const radiusY = Math.min(210, 110 + prompts.length * 10);

  return prompts.map((prompt, index) => {
    const angle = (Math.PI * 2 * index) / prompts.length - Math.PI / 2;
    return {
      prompt,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function createPromptGraphEdges(
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

function getGraphEdgeLabel(
  t: ReturnType<typeof useTranslation>["t"],
  kind: GraphEdgeKind,
) {
  if (kind === "grouped_under") {
    return t("prompt.graph.groupedUnder");
  }

  return t(`prompt.relationships.kind.${kind}`);
}

export function PromptGraphView({
  prompts,
  relations,
  selectedPromptId,
  onSelectPrompt,
}: PromptGraphViewProps) {
  const { t } = useTranslation();
  const nodes = useMemo(() => createPromptGraphNodes(prompts), [prompts]);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.prompt.id, node])),
    [nodes],
  );
  const edges = useMemo(
    () => createPromptGraphEdges(prompts, relations),
    [prompts, relations],
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
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            {t("prompt.graph.empty")}
          </div>
        ) : (
          <div className="relative h-full min-h-[420px] overflow-hidden">
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker
                  id="prompt-graph-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/50" />
                </marker>
              </defs>

              {edges.map((edge, index) => {
                const source = nodeById.get(edge.sourceId);
                const target = nodeById.get(edge.targetId);
                if (!source || !target) {
                  return null;
                }

                const labelX = (source.x + target.x) / 2;
                const labelY = (source.y + target.y) / 2 - 8 - (index % 2) * 10;

                return (
                  <g key={edge.id}>
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      className={
                        edge.isHierarchy
                          ? "stroke-primary/55"
                          : "stroke-muted-foreground/45"
                      }
                      strokeWidth={edge.isHierarchy ? 2.4 : 1.7}
                      strokeDasharray={edge.isHierarchy ? undefined : "7 6"}
                      markerEnd="url(#prompt-graph-arrow)"
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {getGraphEdgeLabel(t, edge.kind)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {nodes.map((node) => {
              const promptType = node.prompt.promptType || "text";
              const isSelected = node.prompt.id === selectedPromptId;
              const left = `${(node.x / GRAPH_WIDTH) * 100}%`;
              const top = `${(node.y / GRAPH_HEIGHT) * 100}%`;

              return (
                <button
                  key={node.prompt.id}
                  type="button"
                  onClick={() => onSelectPrompt(node.prompt.id)}
                  aria-label={t("prompt.graph.openPrompt", {
                    title: node.prompt.title,
                  })}
                  className={`absolute flex max-w-[168px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-left shadow-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card/95 text-foreground hover:border-primary/50 hover:bg-accent"
                  }`}
                  style={{ left, top, width: NODE_WIDTH }}
                >
                  {promptType === "image" ? (
                    <ImageIcon
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 ${isSelected ? "text-white/85" : "text-blue-500"}`}
                    />
                  ) : (
                    <MessageSquareTextIcon
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 ${isSelected ? "text-white/85" : "text-primary"}`}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {node.prompt.title}
                  </span>
                  {relations.some(
                    (relation) =>
                      relation.sourcePromptId === node.prompt.id ||
                      relation.targetPromptId === node.prompt.id,
                  ) && (
                    <Link2Icon
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-white/75" : "text-muted-foreground"}`}
                    />
                  )}
                  {prompts.some((prompt) => prompt.parentId === node.prompt.id) && (
                    <GitBranchIcon
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-white/75" : "text-muted-foreground"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

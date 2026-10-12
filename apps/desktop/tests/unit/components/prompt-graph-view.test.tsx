import { fireEvent, screen } from "@testing-library/react";
import { forwardRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import { PromptGraphView } from "../../../src/renderer/components/prompt/PromptGraphView";
import { PROMPT_GRAPH_SIMULATION } from "../../../src/renderer/components/prompt/prompt-graph-motion";
import {
  buildPromptGraphData,
  createPromptGraphLinks,
  getNodeVal,
  shouldShowNodeLabel,
  type PromptGraphNode,
} from "../../../src/renderer/components/prompt/prompt-graph-layout";
import { renderWithI18n } from "../../helpers/i18n";

// react-force-graph-2d renders to a real <canvas> via an internal WebGL/2D
// kapsule that jsdom cannot drive. We replace it with a DOM stub that captures
// the props we hand it, so the tests can assert the data contract and the React
// glue (selection callback, node count) without a live canvas.
const graphProps = vi.hoisted(() => ({ current: null as any }));

vi.mock("react-force-graph-2d", () => ({
  __esModule: true,
  default: forwardRef((props: any, _ref) => {
    graphProps.current = props;
    return (
      <div
        data-testid="force-graph-mock"
        data-node-count={props.graphData.nodes.length}
        data-link-count={props.graphData.links.length}
        data-pointer-interaction={String(props.enablePointerInteraction)}
      >
        {props.graphData.nodes.map((node: PromptGraphNode) => (
          <button
            key={node.id}
            type="button"
            data-testid={`graph-node-${node.id}`}
            onClick={() => props.onNodeClick?.(node)}
          >
            {node.title}
          </button>
        ))}
      </div>
    );
  }),
}));

const basePrompt: Prompt = {
  id: "prompt-parent",
  title: "Parent prompt",
  description: "Top level prompt",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "Parent body",
  variables: [],
  tags: [],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function createPrompt(id: string, title: string, parentId?: string): Prompt {
  return { ...basePrompt, id, title, parentId };
}

const parentPrompt = basePrompt;
const childPrompt = createPrompt(
  "prompt-child",
  "Child prompt",
  parentPrompt.id,
);
const relatedPrompt = createPrompt("prompt-related", "Related prompt");

const relation: PromptRelation = {
  id: "relation-1",
  sourcePromptId: childPrompt.id,
  targetPromptId: relatedPrompt.id,
  kind: "depends_on",
  note: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("PromptGraphView", () => {
  it("feeds every prompt and both relation kinds into the force graph", async () => {
    const onSelectPrompt = vi.fn();

    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={onSelectPrompt}
      />,
      { language: "en" },
    );

    const mock = screen.getByTestId("force-graph-mock");
    expect(mock.getAttribute("data-node-count")).toBe("3");
    // 1 hierarchy link (parent → child) + 1 semantic link (child → related).
    expect(mock.getAttribute("data-link-count")).toBe("2");
    const standardMotion = PROMPT_GRAPH_SIMULATION.motion.standard;
    expect(graphProps.current.warmupTicks).toBe(standardMotion.warmupTicks);
    expect(graphProps.current.cooldownTicks).toBe(standardMotion.cooldownTicks);
    expect(graphProps.current.cooldownTime).toBe(
      PROMPT_GRAPH_SIMULATION.cooldownTimeMs,
    );
    expect(graphProps.current.d3AlphaDecay).toBe(standardMotion.alphaDecay);
    expect(graphProps.current.d3AlphaMin).toBe(
      PROMPT_GRAPH_SIMULATION.alphaMin,
    );

    fireEvent.click(screen.getByTestId("graph-node-prompt-child"));
    expect(onSelectPrompt).toHaveBeenCalledWith(childPrompt.id);
  });

  it("only enables canvas hit testing while the pointer is inside the graph", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    const content = screen.getByTestId("prompt-graph-content");
    expect(graphProps.current.enablePointerInteraction).toBe(false);

    fireEvent.pointerEnter(content);
    expect(graphProps.current.enablePointerInteraction).toBe(true);

    fireEvent.pointerLeave(content);
    expect(graphProps.current.enablePointerInteraction).toBe(false);
  });

  it("exposes zoom and view controls in the graph workspace", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: "Zoom in graph" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom out graph" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit graph to screen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset graph view" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state without relying on filters", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[]}
        relations={[]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByText("No prompts to map yet")).toBeInTheDocument();
  });
});

describe("prompt graph data model", () => {
  it("creates hierarchy and semantic links between matching prompts", () => {
    const links = createPromptGraphLinks(
      [parentPrompt, childPrompt, relatedPrompt],
      [relation],
    );

    const hierarchy = links.find((link) => link.isHierarchy);
    const semantic = links.find((link) => !link.isHierarchy);

    expect(hierarchy).toMatchObject({
      source: parentPrompt.id,
      target: childPrompt.id,
      kind: "grouped_under",
    });
    expect(semantic).toMatchObject({
      source: childPrompt.id,
      target: relatedPrompt.id,
      kind: "depends_on",
    });
  });

  it("counts node degree so hubs render larger", () => {
    const { nodes } = buildPromptGraphData(
      [parentPrompt, childPrompt, relatedPrompt],
      [relation],
    );

    const child = nodes.find((node) => node.id === childPrompt.id);
    const related = nodes.find((node) => node.id === relatedPrompt.id);

    // Child has two connections (parent hierarchy + related semantic).
    expect(child?.degree).toBe(2);
    expect(related?.degree).toBe(1);
    expect(getNodeVal(child!)).toBeGreaterThan(getNodeVal(related!));
  });

  it("seeds finite distinct node positions before the force engine starts", () => {
    const { nodes } = buildPromptGraphData(
      [parentPrompt, childPrompt, relatedPrompt],
      [relation],
    );

    expect(nodes.every((node) => Number.isFinite(node.x))).toBe(true);
    expect(nodes.every((node) => Number.isFinite(node.y))).toBe(true);
    expect(new Set(nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(
      nodes.length,
    );
  });

  it("hides isolated labels until zoomed in on dense graphs", () => {
    const isolated: PromptGraphNode = {
      id: "isolated",
      title: "Isolated",
      promptType: "text",
      degree: 0,
      hasHierarchy: false,
      hasSemanticRelation: false,
    };

    // Below the isolated-label zoom threshold, dense-graph isolated labels hide.
    expect(shouldShowNodeLabel(isolated, 80, null, new Set(), 1)).toBe(false);
    // Once zoomed past the threshold they appear.
    expect(shouldShowNodeLabel(isolated, 80, null, new Set(), 3)).toBe(true);
    // Always visible on small graphs regardless of zoom.
    expect(shouldShowNodeLabel(isolated, 10, null, new Set(), 0.3)).toBe(true);
  });

  it("always shows labels for the highlighted node and its neighbours", () => {
    const connected: PromptGraphNode = {
      id: "connected",
      title: "Connected",
      promptType: "text",
      degree: 3,
      hasHierarchy: false,
      hasSemanticRelation: true,
    };

    expect(
      shouldShowNodeLabel(connected, 200, "connected", new Set(), 0.4),
    ).toBe(true);
    expect(
      shouldShowNodeLabel(connected, 200, "other", new Set(["connected"]), 0.4),
    ).toBe(true);
  });
});

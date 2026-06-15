import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import { PromptGraphView } from "../../../src/renderer/components/prompt/PromptGraphView";
import {
  createPromptGraphEdges,
  createPromptGraphNodes,
  tickPromptGraph,
} from "../../../src/renderer/components/prompt/prompt-graph-layout";
import { renderWithI18n } from "../../helpers/i18n";

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
  return {
    ...basePrompt,
    id,
    title,
    parentId,
  };
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
  it("renders all prompt nodes with hierarchy and semantic relation edges", async () => {
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

    expect(screen.getByText("Relationship Graph")).toBeInTheDocument();
    expect(screen.getByText("Parent prompt")).toBeInTheDocument();
    expect(screen.getByText("Child prompt")).toBeInTheDocument();
    expect(screen.getByText("Related prompt")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Grouped under relationship"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Depends on relationship"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open graph prompt Child prompt" }),
    );

    expect(onSelectPrompt).toHaveBeenCalledWith(childPrompt.id);
  });

  it("supports zoom controls without leaving the graph workspace", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in graph" }));
    expect(screen.getByText("120%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom out graph" }));
    expect(screen.getByText("100%")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Fit graph to screen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset graph view" }),
    ).toBeInTheDocument();
  });

  it("pans the graph canvas by dragging the workspace background", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    const canvas = screen.getByLabelText("Prompt relationship graph canvas");
    const graphContent = screen.getByTestId("prompt-graph-content");
    const initialTransform = graphContent.getAttribute("transform");

    fireEvent.pointerDown(canvas, { clientX: 320, clientY: 240, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 420, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 420, clientY: 300, pointerId: 1 });

    expect(graphContent.getAttribute("transform")).not.toBe(initialTransform);
  });

  it("drags graph nodes without opening the prompt detail", async () => {
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

    const canvas = screen.getByLabelText("Prompt relationship graph canvas");
    const childNode = screen.getByRole("button", {
      name: "Open graph prompt Child prompt",
    });
    const initialTransform = childNode.getAttribute("transform");

    fireEvent.pointerDown(childNode, {
      button: 0,
      clientX: 320,
      clientY: 240,
      pointerId: 2,
    });
    fireEvent.pointerMove(canvas, {
      buttons: 1,
      clientX: 470,
      clientY: 320,
      pointerId: 2,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 470,
      clientY: 320,
      pointerId: 2,
    });
    fireEvent.click(childNode);

    expect(childNode.getAttribute("transform")).not.toBe(initialTransform);
    expect(onSelectPrompt).not.toHaveBeenCalled();
  });

  it("pulls connected nodes while a dragged node is pinned in the force graph", () => {
    const prompts = [parentPrompt, childPrompt, relatedPrompt];
    const edges = createPromptGraphEdges(prompts, [relation]);
    const nodes = createPromptGraphNodes(prompts, edges, childPrompt.id);
    const parentNode = nodes.find((node) => node.prompt.id === parentPrompt.id);
    const childNode = nodes.find((node) => node.prompt.id === childPrompt.id);

    if (!parentNode || !childNode) {
      throw new Error("Expected graph nodes to be created");
    }

    const parentStartX = parentNode.x;
    const parentStartY = parentNode.y;
    childNode.x += 220;
    childNode.y += 120;

    tickPromptGraph(nodes, edges, {
      alpha: 1,
      selectedPromptId: childPrompt.id,
      pinnedNodeId: childPrompt.id,
    });

    expect(Math.abs(parentNode.x - parentStartX)).toBeGreaterThan(0.01);
    expect(Math.abs(parentNode.y - parentStartY)).toBeGreaterThan(0.01);
  });

  it("keeps large sparse graphs readable by hiding isolated labels until zoomed", async () => {
    const isolatedPrompts = Array.from({ length: 70 }, (_, index) =>
      createPrompt(`isolated-${index}`, `Isolated ${index}`),
    );

    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt, ...isolatedPrompts]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByText("Child prompt")).toBeInTheDocument();
    expect(screen.getByText("Related prompt")).toBeInTheDocument();
    expect(screen.queryByText("Isolated 42")).not.toBeInTheDocument();

    const zoomIn = screen.getByRole("button", { name: "Zoom in graph" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);

    expect(screen.getByText("Isolated 42")).toBeInTheDocument();
  });

  it("shows an empty graph state without relying on filters", async () => {
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

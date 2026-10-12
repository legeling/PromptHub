import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, screen } from "@testing-library/react";
import { forwardRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptSummary } from "@prompthub/shared/types";
import { PromptGraphView } from "../../../src/renderer/components/prompt/PromptGraphView";
import type {
  PromptGraphNode,
  PromptGraphLink,
} from "../../../src/renderer/components/prompt/prompt-graph-layout";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

interface GraphCapture {
  backgroundColor: string;
  nodeColor: (node: PromptGraphNode) => string;
  linkColor: (link: PromptGraphLink) => string;
  graphData: { nodes: PromptGraphNode[]; links: PromptGraphLink[] };
}
const capture = vi.hoisted(() => {
  const value: { current: GraphCapture | null } = { current: null };
  return value;
});
vi.mock("react-force-graph-2d", () => ({
  default: forwardRef<unknown, GraphCapture>((props, _ref) => {
    capture.current = props;
    return <div data-testid="graph-theme-canvas" />;
  }),
}));
const stylesheet = readFileSync(
  resolve(__dirname, "../../../src/renderer/styles/globals.css"),
  "utf8",
);
const prompt: PromptSummary = {
  id: "theme-prompt",
  title: "Theme prompt",
  promptType: "text",
  description: "",
  tags: [],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
function graph(): GraphCapture {
  if (!capture.current) throw new Error("Graph props were not captured");
  return capture.current;
}
function applyCssMode(dark: boolean): void {
  const selector = dark
    ? /\.dark \{([\s\S]*?)\n  \}/
    : /:root \{([\s\S]*?)\n  \}/;
  const block = stylesheet.match(selector)?.[1];
  if (!block) throw new Error("Theme stylesheet block missing");
  for (const declaration of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    document.documentElement.style.setProperty(
      declaration[1],
      declaration[2].trim(),
    );
  }
  const { themeHue, themeSaturation } = useSettingsStore.getState();
  document.documentElement.style.setProperty("--theme-hue", String(themeHue));
  document.documentElement.style.setProperty(
    "--theme-saturation",
    String(themeSaturation),
  );
}
function token(name: string, alpha?: number): string {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return `hsl(${value}${alpha === undefined ? "" : ` / ${alpha}`})`;
}
async function openGraph(
  selectedPromptId: string | null = null,
): Promise<void> {
  await renderWithI18n(
    <PromptGraphView
      prompts={[prompt]}
      relations={[]}
      selectedPromptId={selectedPromptId}
      onSelectPrompt={vi.fn()}
    />,
    { language: "en" },
  );
}

describe("Prompt graph theme integration", () => {
  let rootStyle = "";
  let rootClass = "";
  let settings = useSettingsStore.getState();
  beforeEach(() => {
    rootStyle = document.documentElement.style.cssText;
    rootClass = document.documentElement.className;
    settings = useSettingsStore.getState();
    capture.current = null;
    // jsdom does not resolve nested CSS custom properties. Resolve them at the
    // computed-style boundary using the actual stylesheet and settings owner.
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = getComputedStyle(element);
      const read = style.getPropertyValue.bind(style);
      style.getPropertyValue = (name) =>
        read(name).replace(/var\((--[\w-]+)\)/g, (_match, variable: string) =>
          read(variable),
        );
      return style;
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.style.cssText = rootStyle;
    document.documentElement.className = rootClass;
    useSettingsStore.setState(settings);
  });
  it.each([true, false])(
    "uses application surface and node tokens in dark=%s",
    async (dark) => {
      useSettingsStore.setState({ isDarkMode: dark });
      applyCssMode(dark);
      await openGraph();
      expect(graph().backgroundColor).toBe(token("--background"));
      expect(graph().nodeColor(graph().graphData.nodes[0])).toBe(
        token("--muted-foreground"),
      );
      expect(
        screen.getByRole("button", { name: "Zoom in graph" }),
      ).toBeVisible();
    },
  );
  it("updates the canvas palette when the application changes light/dark mode", async () => {
    useSettingsStore.setState({ isDarkMode: true });
    applyCssMode(true);
    await openGraph();
    const previous = graph().backgroundColor;
    act(() => {
      applyCssMode(false);
      useSettingsStore.getState().setDarkMode(false);
    });
    expect(graph().backgroundColor).toBe(token("--background"));
    expect(graph().backgroundColor).not.toBe(previous);
  });
  it("uses the selected theme color rather than a separate graph blue", async () => {
    useSettingsStore.setState({ isDarkMode: true });
    applyCssMode(true);
    await openGraph(prompt.id);
    const previous = graph().nodeColor(graph().graphData.nodes[0]);
    act(() => useSettingsStore.getState().setCustomThemeHex("#a855f7"));
    expect(graph().nodeColor(graph().graphData.nodes[0])).toBe(
      token("--primary"),
    );
    expect(graph().nodeColor(graph().graphData.nodes[0])).not.toBe(previous);
  });
});

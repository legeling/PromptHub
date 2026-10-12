import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { cleanup } from "@testing-library/react";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ForceGraphMethods } from "react-force-graph-2d";
import type { PromptSummary } from "@prompthub/shared/types";
import { PromptGraphView } from "../../../src/renderer/components/prompt/PromptGraphView";
import { PROMPT_GRAPH_SIMULATION } from "../../../src/renderer/components/prompt/prompt-graph-motion";
import type {
  PromptGraphData,
  PromptGraphLink,
  PromptGraphNode,
} from "../../../src/renderer/components/prompt/prompt-graph-layout";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { DESKTOP_TEST_TIMEOUT_MS } from "../../helpers/test-config";

type GraphMethods = Pick<
  ForceGraphMethods<PromptGraphNode, PromptGraphLink>,
  "d3Force" | "d3ReheatSimulation"
>;

// The installed library's internal canvas engine has no declaration file.
// Only canvas painting is replaced; force calculation and stop/reheat are real.
interface CanvasEngine extends GraphMethods {
  (context: unknown): CanvasEngine;
  graphData(data: PromptGraphData): CanvasEngine;
  warmupTicks(value: number): CanvasEngine;
  cooldownTicks(value: number): CanvasEngine;
  cooldownTime(value: number): CanvasEngine;
  d3AlphaDecay(value: number): CanvasEngine;
  d3AlphaMin(value: number): CanvasEngine;
  d3AlphaTarget(value: number): CanvasEngine;
  d3VelocityDecay(value: number): CanvasEngine;
  nodeVisibility(value: boolean): CanvasEngine;
  linkVisibility(value: boolean): CanvasEngine;
  onEngineTick(callback: () => void): CanvasEngine;
  onFinishUpdate(callback: () => void): CanvasEngine;
  resetCountdown(): CanvasEngine;
  tickFrame(): CanvasEngine;
  isEngineRunning(): boolean;
}

interface GraphProps {
  width: number;
  height: number;
  graphData: PromptGraphData;
  warmupTicks: number;
  cooldownTicks: number;
  cooldownTime: number;
  d3AlphaMin: number;
  d3AlphaDecay: number;
  d3VelocityDecay: number;
  onNodeDrag: () => void;
  onNodeDragEnd: () => void;
}

const bridge = vi.hoisted(() => {
  const value: {
    factory: (() => CanvasEngine) | null;
    engine: CanvasEngine | null;
    props: GraphProps | null;
    ready: Promise<void>;
    finish: () => void;
    ticks: number;
    reheats: number;
  } = {
    factory: null,
    engine: null,
    props: null,
    ready: Promise.resolve(),
    finish: () => {},
    ticks: 0,
    reheats: 0,
  };
  return value;
});

vi.mock("react-force-graph-2d", () => ({
  default: forwardRef<GraphMethods, GraphProps>((props, ref) => {
    const engine = useMemo(() => {
      if (!bridge.factory) throw new Error("Canvas engine was not loaded");
      return bridge.factory();
    }, []);
    const previousData = useRef<PromptGraphData | null>(null);
    bridge.engine = engine;
    bridge.props = props;
    engine
      .warmupTicks(props.warmupTicks)
      .cooldownTicks(props.cooldownTicks)
      .cooldownTime(props.cooldownTime)
      .d3AlphaMin(props.d3AlphaMin)
      .d3AlphaDecay(props.d3AlphaDecay)
      .d3VelocityDecay(props.d3VelocityDecay)
      .nodeVisibility(false)
      .linkVisibility(false)
      .onEngineTick(() => bridge.ticks++)
      .onFinishUpdate(() => bridge.finish());
    if (previousData.current !== props.graphData) {
      previousData.current = props.graphData;
      engine.graphData(props.graphData);
    }
    useLayoutEffect(() => {
      const context = new Proxy({}, { get: () => () => {} });
      engine(context);
    }, [engine]);
    useImperativeHandle(
      ref,
      () => ({
        d3Force: engine.d3Force.bind(engine),
        d3ReheatSimulation: () => {
          bridge.reheats++;
          return engine.d3ReheatSimulation();
        },
      }),
      [engine],
    );
    return <div data-testid="real-graph-engine" />;
  }),
}));

async function loadCanvasEngine(): Promise<() => CanvasEngine> {
  const require = createRequire(import.meta.url);
  const graphRequire = createRequire(require.resolve("react-force-graph-2d"));
  const entry = resolve(
    dirname(graphRequire.resolve("force-graph")),
    "../src/canvas-force-graph.js",
  );
  // esbuild requires Node's typed-array realm; jsdom deliberately owns a
  // different realm. Bundle in a bounded Node child without changing globals.
  const bundleMaxBytes = 1024 * 1024;
  const script = `
    const { createRequire } = require("node:module");
    const bundler = createRequire(${JSON.stringify(require.resolve("vite"))})("esbuild");
    console.error("Graph engine bundler PID: " + process.pid);
    bundler.build({ entryPoints: [${JSON.stringify(entry)}], bundle: true,
      platform: "node", format: "esm", write: false, logLevel: "silent" })
      .then(result => process.stdout.write(result.outputFiles[0].text))
      .finally(() => bundler.stop());
  `;
  const bundle = execFileSync(process.execPath, ["-e", script], {
    timeout: DESKTOP_TEST_TIMEOUT_MS,
    maxBuffer: bundleMaxBytes,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const module: { default: () => CanvasEngine } = await import(
    /* @vite-ignore */
    `data:text/javascript;base64,${bundle.toString("base64")}`
  );
  return module.default;
}

function createPrompts(count = 2): PromptSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `motion-${index}`,
    title: `Motion ${index}`,
    promptType: "text",
    parentId: index === 1 ? "motion-0" : null,
    tags: [],
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  }));
}

async function openGraph(
  preference: "standard" | "reduced" | "off",
  count = 2,
): Promise<CanvasEngine> {
  useSettingsStore.setState({ motionPreference: preference });
  await renderWithI18n(
    <PromptGraphView
      prompts={createPrompts(count)}
      relations={[]}
      selectedPromptId={null}
      onSelectPrompt={() => {}}
    />,
    { language: "en" },
  );
  await bridge.ready;
  if (!bridge.engine) throw new Error("Graph did not mount");
  return bridge.engine;
}

function graphProps(): GraphProps {
  if (!bridge.props) throw new Error("Graph props were not captured");
  return bridge.props;
}

function settle(engine: CanvasEngine): void {
  const maxFrames = graphProps().cooldownTicks + 1;
  for (let frame = 0; engine.isEngineRunning() && frame <= maxFrames; frame++)
    engine.tickFrame();
  expect(engine.isEngineRunning()).toBe(false);
}

function drag(engine: CanvasEngine): PromptGraphNode {
  const node = graphProps().graphData.nodes[0];
  node.fx = node.x = (node.x ?? 0) + 200;
  node.fy = node.y = (node.y ?? 0) + 70;
  engine.d3AlphaTarget(0.3).resetCountdown();
  graphProps().onNodeDrag();
  return node;
}

function release(engine: CanvasEngine, node: PromptGraphNode): void {
  delete node.fx;
  delete node.fy;
  engine.d3AlphaTarget(0).resetCountdown();
  graphProps().onNodeDragEnd();
}

describe("Prompt graph motion through the component and real force engine", () => {
  let preference = useSettingsStore.getState().motionPreference;
  beforeAll(async () => {
    bridge.factory = await loadCanvasEngine();
  });
  beforeEach(() => {
    preference = useSettingsStore.getState().motionPreference;
    bridge.props = null;
    bridge.engine = null;
    bridge.ticks = bridge.reheats = 0;
    bridge.ready = new Promise<void>((finish) => {
      bridge.finish = finish;
    });
  });
  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ motionPreference: preference });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("measures the real container when prompts arrive after an empty mount", async () => {
    const width = 960;
    const height = 540;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
      width,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
      height,
    );
    const view = await renderWithI18n(
      <PromptGraphView
        prompts={[]}
        relations={[]}
        selectedPromptId={null}
        onSelectPrompt={() => {}}
      />,
      { language: "en" },
    );
    view.rerender(
      <PromptGraphView
        prompts={createPrompts()}
        relations={[]}
        selectedPromptId={null}
        onSelectPrompt={() => {}}
      />,
    );
    await bridge.ready;
    expect(graphProps().width).toBe(width);
    expect(graphProps().height).toBe(height);
  });

  it("prepares the standard layout before the first visible frame without an entrance burst", async () => {
    const engine = await openGraph("standard");
    const nodes = graphProps().graphData.nodes;
    const before = nodes.map(({ x, y }) => ({ x, y }));
    settle(engine);
    expect(bridge.reheats).toBe(0);
    expect(bridge.ticks).toBe(0);
    expect(nodes.map(({ x, y }) => ({ x, y }))).toEqual(before);
  });

  it.each<"standard" | "reduced">(["standard", "reduced"])(
    "restores neighbor movement after cooling and on repeated %s drags",
    async (mode) => {
      const engine = await openGraph(mode);
      settle(engine);
      for (const gesture of ["first", "second"]) {
        const neighbor = graphProps().graphData.nodes[1];
        const before = { x: neighbor.x, y: neighbor.y };
        const ticksBefore = bridge.ticks;
        const node = drag(engine);
        engine.tickFrame();
        expect(bridge.ticks, gesture).toBeGreaterThan(ticksBefore);
        expect({ x: neighbor.x, y: neighbor.y }, gesture).not.toEqual(before);
        const reheats = bridge.reheats;
        graphProps().onNodeDrag();
        expect(bridge.reheats).toBe(reheats);
        release(engine, node);
        const releaseTicks = bridge.ticks;
        engine.tickFrame();
        expect(bridge.ticks).toBeGreaterThan(releaseTicks);
        settle(engine);
        const idleTicks = bridge.ticks;
        engine.tickFrame();
        expect(bridge.ticks).toBe(idleTicks);
      }
    },
  );

  it("keeps direct dragging available with animation off without moving neighbors", async () => {
    const engine = await openGraph("off");
    settle(engine);
    const neighbor = graphProps().graphData.nodes[1];
    const before = { x: neighbor.x, y: neighbor.y };
    const node = drag(engine);
    const draggedPosition = { x: node.x, y: node.y };
    engine.tickFrame();
    release(engine, node);
    engine.tickFrame();
    expect(bridge.reheats).toBe(0);
    expect(bridge.ticks).toBe(0);
    expect({ x: node.x, y: node.y }).toEqual(draggedPosition);
    expect({ x: neighbor.x, y: neighbor.y }).toEqual(before);
  });

  it("stops a reheated simulation at the existing wall-clock budget", async () => {
    const engine = await openGraph("standard");
    settle(engine);
    vi.useFakeTimers({ toFake: ["Date"] });
    const node = drag(engine);
    vi.setSystemTime(Date.now() + PROMPT_GRAPH_SIMULATION.cooldownTimeMs + 1);
    engine.tickFrame();
    expect(engine.isEngineRunning()).toBe(false);
    release(engine, node);
  });

  it("measures startup and one bounded drag for the reported 118-node scale", async () => {
    const nodeCount = 118;
    const started = performance.now();
    const engine = await openGraph("standard", nodeCount);
    const startupMs = performance.now() - started;
    settle(engine);
    const initialTicks = bridge.ticks;
    const dragStarted = performance.now();
    const node = drag(engine);
    engine.tickFrame();
    release(engine, node);
    settle(engine);
    const dragMs = performance.now() - dragStarted;
    const dragTicks = bridge.ticks - initialTicks;
    expect(graphProps().graphData.nodes).toHaveLength(nodeCount);
    expect(dragTicks).toBeGreaterThan(0);
    expect(dragTicks).toBeLessThanOrEqual(
      1 + PROMPT_GRAPH_SIMULATION.motion.standard.cooldownTicks,
    );
    expect(engine.isEngineRunning()).toBe(false);
    console.info(JSON.stringify({ nodeCount, startupMs, dragMs, dragTicks }));
  });
});

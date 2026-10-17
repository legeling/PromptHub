import type { Rectangle } from "electron";
import { SettingsDB, type DatabaseAdapter } from "@prompthub/db";

const STATE_KEY = "desktopWindowState";
export interface WindowState {
  version: 1;
  bounds: Rectangle;
  maximized: boolean;
}
interface WindowTarget {
  getNormalBounds(): Rectangle;
  isDestroyed(): boolean;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  maximize(): void;
  on(event: string, callback: () => void): unknown;
  once(event: string, callback: () => void): unknown;
  removeListener(event: string, callback: () => void): unknown;
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== "object" || value === null) return false;
  return (
    "x" in value &&
    Number.isSafeInteger(value.x) &&
    "y" in value &&
    Number.isSafeInteger(value.y) &&
    "width" in value &&
    typeof value.width === "number" &&
    Number.isSafeInteger(value.width) &&
    value.width > 0 &&
    "height" in value &&
    typeof value.height === "number" &&
    Number.isSafeInteger(value.height) &&
    value.height > 0
  );
}

function parseState(value: unknown): WindowState | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("bounds" in value) ||
    !isRectangle(value.bounds) ||
    !("maximized" in value) ||
    typeof value.maximized !== "boolean"
  )
    return null;
  return { version: 1, bounds: value.bounds, maximized: value.maximized };
}

function overlap(a: Rectangle, b: Rectangle): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

function fitBounds(
  bounds: Rectangle | undefined,
  areas: Rectangle[],
): Rectangle {
  const primary = areas[0] ?? { x: 0, y: 0, width: 1200, height: 800 };
  const area = bounds
    ? areas.reduce(
        (best, item) =>
          overlap(bounds, item) > overlap(bounds, best) ? item : best,
        primary,
      )
    : primary;
  const width = Math.min(area.width, Math.max(800, bounds?.width ?? 1200));
  const height = Math.min(area.height, Math.max(600, bounds?.height ?? 800));
  const visible = bounds && overlap(bounds, area) > 0;
  return {
    width,
    height,
    x: visible
      ? Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))
      : Math.round(area.x + (area.width - width) / 2),
    y: visible
      ? Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
      : Math.round(area.y + (area.height - height) / 2),
  };
}

export function readWindowState(
  db: DatabaseAdapter.Database | null,
  areas: Rectangle[],
): WindowState {
  let saved: WindowState | null = null;
  try {
    const value = db ? new SettingsDB(db).get(STATE_KEY) : undefined;
    saved = parseState(value);
    if (value !== undefined && !saved)
      console.warn("Invalid desktop window preference; using defaults");
  } catch (error) {
    console.error("Failed to read desktop window preference:", error);
  }
  return {
    version: 1,
    bounds: fitBounds(saved?.bounds, areas),
    maximized: saved?.maximized ?? false,
  };
}

/** Native events stay together so shutdown can flush and remove every listener. */
export function bindWindowState(
  window: WindowTarget,
  getDatabase: () => DatabaseAdapter.Database | null,
  initial: WindowState,
): () => void {
  let state = initial;
  let restoreMaximized = initial.maximized;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const capture = (): void => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen())
      return;
    const bounds = window.getNormalBounds();
    if (isRectangle(bounds))
      state = {
        version: 1,
        bounds,
        maximized: restoreMaximized || window.isMaximized(),
      };
  };
  const flush = (): void => {
    clearTimeout(timer);
    capture();
    try {
      const db = getDatabase();
      if (db) new SettingsDB(db).set({ [STATE_KEY]: state });
    } catch (error) {
      console.error("Failed to save desktop window preference:", error);
    }
  };
  const schedule = (): void => {
    capture();
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  };
  const restore = (): void => {
    if (restoreMaximized) window.maximize();
    restoreMaximized = false;
  };
  const events = [
    "resize",
    "move",
    "maximize",
    "unmaximize",
    "leave-full-screen",
  ];
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    flush();
    events.forEach((event) => window.removeListener(event, schedule));
    window.removeListener("close", flush);
    window.removeListener("closed", dispose);
    window.removeListener("show", restore);
  };
  events.forEach((event) => window.on(event, schedule));
  window.on("close", flush);
  window.once("closed", dispose);
  window.once("show", restore);
  return dispose;
}

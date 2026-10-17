/** @vitest-environment node */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter, SettingsDB } from "@prompthub/db";
import {
  bindWindowState,
  readWindowState,
} from "../../../src/main/window-state";

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
class TestWindow extends EventEmitter {
  bounds = { x: 160, y: 80, width: 1360, height: 900 };
  maximized = false;
  minimized = false;
  fullscreen = false;
  isDestroyed = () => false;
  isMaximized = () => this.maximized;
  isMinimized = () => this.minimized;
  isFullScreen = () => this.fullscreen;
  getNormalBounds = () => this.bounds;
  maximize = vi.fn(() => {
    this.maximized = true;
    this.emit("maximize");
  });
}

describe("main window preferences", () => {
  let root: string;
  let db: DatabaseAdapter.Database;
  let dispose: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-window-state-"));
    db = new DatabaseAdapter(path.join(root, "state.db"));
    db.exec(
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
  });
  it("persists resize/move through SQLite close/reopen and restores normal bounds when maximized", () => {
    const win = new TestWindow();
    dispose = bindWindowState(win, () => db, readWindowState(db, [workArea]));
    win.emit("resize");
    win.emit("move");
    vi.advanceTimersByTime(300);
    win.maximized = true;
    win.emit("maximize");
    dispose();
    dispose = undefined;
    db.close();
    db = new DatabaseAdapter(path.join(root, "state.db"));
    expect(readWindowState(db, [workArea])).toMatchObject({
      bounds: win.bounds,
      maximized: true,
    });
  });
  it("keeps hidden startup hidden and restores maximization only on first show", () => {
    const win = new TestWindow();
    dispose = bindWindowState(win, () => db, {
      version: 1,
      bounds: win.bounds,
      maximized: true,
    });
    expect(win.maximize).not.toHaveBeenCalled();
    win.emit("show");
    expect(win.maximize).toHaveBeenCalledTimes(1);
    win.maximized = false;
    win.emit("unmaximize");
    win.emit("show");
    expect(win.maximize).toHaveBeenCalledTimes(1);
  });
  it("flushes before close and does not save minimized or fullscreen dimensions", () => {
    const win = new TestWindow();
    dispose = bindWindowState(win, () => db, readWindowState(db, [workArea]));
    win.emit("resize");
    win.emit("close");
    const saved = readWindowState(db, [workArea]);
    win.minimized = true;
    win.bounds = { x: -32000, y: -32000, width: 1, height: 1 };
    win.emit("resize");
    vi.advanceTimersByTime(300);
    expect(readWindowState(db, [workArea])).toEqual(saved);
    win.minimized = false;
    win.fullscreen = true;
    dispose();
    expect(readWindowState(db, [workArea])).toEqual(saved);
  });
  it("recovers an offscreen window and shrinks it to a smaller display", () => {
    new SettingsDB(db).set({
      desktopWindowState: {
        version: 1,
        bounds: { x: 2000, y: 20, width: 1600, height: 900 },
        maximized: false,
      },
    });
    expect(
      readWindowState(db, [{ x: 0, y: 0, width: 1024, height: 700 }]).bounds,
    ).toEqual({ x: 0, y: 0, width: 1024, height: 700 });
  });
  it("preserves valid positions on monitors to the left of the primary", () => {
    const bounds = { x: -1500, y: 100, width: 1000, height: 700 };
    new SettingsDB(db).set({
      desktopWindowState: { version: 1, bounds, maximized: false },
    });
    expect(
      readWindowState(db, [
        workArea,
        { x: -1920, y: 0, width: 1920, height: 1080 },
      ]).bounds,
    ).toEqual(bounds);
  });
  it("falls back on corrupt state and preserves the last state when writing fails", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.prepare("INSERT INTO settings VALUES (?, ?)").run(
      "desktopWindowState",
      "invalid-json",
    );
    const initial = readWindowState(db, [workArea]);
    expect(initial.bounds).toMatchObject({ width: 1200, height: 800 });
    new SettingsDB(db).set({ desktopWindowState: initial });
    db.exec(
      "CREATE TRIGGER reject_window BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );
    dispose = bindWindowState(new TestWindow(), () => db, initial);
    dispose();
    expect(readWindowState(db, [workArea])).toEqual(initial);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

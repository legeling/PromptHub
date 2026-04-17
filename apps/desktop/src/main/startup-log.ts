import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";

import { getLogsDir } from "./runtime-paths";

/**
 * Startup diagnostic logger.
 *
 * 启动阶段诊断日志。
 *
 * Writes key startup events to `<userData>/logs/startup.log`. This is
 * intentionally independent of the main process console and persists across
 * relaunches so we can diagnose issues like the v0.5.2 Windows infinite-restart
 * bug from user-shared logs.
 *
 * 将关键启动事件写入 `<userData>/logs/startup.log`。此日志独立于主进程控制台，
 * 并跨重启持久化，便于从用户反馈的日志中诊断问题（如 v0.5.2 Windows 无限重启）。
 *
 * Log rotation: keeps the file under 512KB by truncating oldest half when
 * exceeded. Each entry is a single JSON line for easy parsing.
 *
 * 日志轮转：超过 512KB 时截断最早一半，保持文件大小可控。每条记录为单行 JSON。
 */

const MAX_LOG_SIZE_BYTES = 512 * 1024;

function getLogFilePath(): string {
  return path.join(getLogsDir(), "startup.log");
}

function ensureLogDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function rotateIfTooLarge(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size <= MAX_LOG_SIZE_BYTES) return;
    // Keep only the latter half of the file to preserve recent context
    // 仅保留文件后半部分，保留最近的上下文
    const buf = fs.readFileSync(filePath);
    const halfStart = Math.floor(buf.length / 2);
    // Align to next newline so we don't split a record
    // 对齐到下一个换行符，避免切断单条记录
    const nl = buf.indexOf(0x0a, halfStart);
    const sliceStart = nl >= 0 ? nl + 1 : halfStart;
    fs.writeFileSync(filePath, buf.subarray(sliceStart));
  } catch {
    // Best-effort; ignore rotation errors
    // 尽力而为；忽略轮转错误
  }
}

export interface StartupLogEntry {
  event: string;
  [key: string]: unknown;
}

/**
 * Replace the user's home directory prefix in a path with `~` to avoid leaking
 * the OS username (PII) into diagnostic logs shared by users for support.
 * Returns the input unchanged for non-string values or when homedir cannot be
 * resolved. Case-insensitive on Windows/macOS to match filesystem semantics.
 *
 * 将路径中的用户主目录替换为 `~`，避免日志中泄露用户名（PII）。
 * 在 Windows/macOS 上大小写不敏感以匹配文件系统语义。
 */
export function scrubPath(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  try {
    const home = os.homedir();
    if (!home) return value;
    const caseInsensitive =
      process.platform === "win32" || process.platform === "darwin";
    const candidate = caseInsensitive ? value.toLowerCase() : value;
    const target = caseInsensitive ? home.toLowerCase() : home;
    if (candidate.startsWith(target)) {
      return "~" + value.slice(home.length);
    }
    return value;
  } catch {
    return value;
  }
}

/**
 * Append a startup event to the log file. Failures are swallowed to avoid
 * turning a diagnostic helper into a crash source.
 *
 * 向日志文件追加一条启动事件。失败时静默处理，避免诊断工具本身成为崩溃源。
 */
export function logStartupEvent(entry: StartupLogEntry): void {
  try {
    const filePath = getLogFilePath();
    ensureLogDir(filePath);
    rotateIfTooLarge(filePath);
    const record = {
      ts: new Date().toISOString(),
      pid: process.pid,
      version: app.getVersion(),
      platform: process.platform,
      ...entry,
    };
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // Swallow — diagnostic logger must not break startup
    // 静默处理 — 诊断日志不能影响启动
  }
}

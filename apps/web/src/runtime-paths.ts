import path from 'node:path';
import { config } from './config.js';

/**
 * Web 端运行时路径解析器。
 *
 * 所有磁盘位置均派生自 `DATA_ROOT`（来自环境变量 / config.rootDir），布局
 * 与桌面端保持一致（见 `apps/desktop/src/main/runtime-paths.ts`）：
 *
 * ```text
 * <DATA_ROOT>/
 *   data/
 *     prompthub.db          SQLite 数据库
 *     prompts/              Prompt 文件树（<slug>.md + _folder.json + .versions/<id>/NNNN.md）
 *     skills/               Skill 目录（skill.json + SKILL.md + versions/）
 *     assets/<userId>/{images,videos}/   用户媒体
 *   config/
 *     settings/<userId>.json   用户设置镜像
 *     devices/<userId>.json    设备注册表
 *   logs/                   日志（预留）
 *   backups/                升级/手动备份（预留）
 * ```
 *
 * 本模块是**纯派生**的——没有 legacy fallback、没有自动迁移，因为 Web
 * 服务进程独占文件系统，用户不会手动动这些文件。兼容旧路径的工作由
 * 运维侧的卷挂载迁移完成（参考 README / docker-compose）。
 */

export type MediaKind = 'images' | 'videos';

export function getRootDir(): string {
  return config.rootDir;
}

export function getDataDir(): string {
  return path.join(getRootDir(), 'data');
}

export function getConfigDir(): string {
  return path.join(getRootDir(), 'config');
}

export function getLogsDir(): string {
  return path.join(getRootDir(), 'logs');
}

export function getBackupsDir(): string {
  return path.join(getRootDir(), 'backups');
}

export function getDatabasePath(): string {
  return path.join(getDataDir(), 'prompthub.db');
}

export function getPromptsDir(): string {
  return path.join(getDataDir(), 'prompts');
}

export function getSkillsDir(): string {
  return path.join(getDataDir(), 'skills');
}

export function getAssetsDir(): string {
  return path.join(getDataDir(), 'assets');
}

export function getMediaDir(userId: string, kind: MediaKind): string {
  return path.join(getAssetsDir(), userId, kind);
}

export function getSettingsDir(): string {
  return path.join(getConfigDir(), 'settings');
}

export function getDevicesDir(): string {
  return path.join(getConfigDir(), 'devices');
}

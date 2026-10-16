import path from 'node:path';
import { config } from './config.js';

/**
 * Web 端运行时路径解析器。
 *
 * 所有磁盘位置均派生自 `DATA_ROOT`（来自环境变量 / config.rootDir），布局
 * 与桌面端共享逻辑域，但物理拓扑保持 self-hosted 多用户边界：
 *
 * ```text
 * <DATA_ROOT>/
 *   data/
 *     prompthub.db          SQLite 数据库
 *     prompts/              历史升级输入，由启动迁移保全后退役
 *     skill-files/          Skill 实际包，元数据和归属在 SQLite
 *     skills/               历史镜像，启动迁移后退役
 *     rule-files/<userId>/  用户隔离的 Rule 正文与历史（元数据在 SQLite）
 *     assets/<userId>/{images,videos}/   用户媒体
 *   cache/prompt-workspace/  显式导出的 Prompt Markdown，不参与启动或 CRUD
 *   config/
 *     settings/<userId>.json   历史设置迁移输入，完成后退役
 *     devices/<userId>.json    设备注册表
 *   logs/                   日志（预留）
 *   backups/                升级/手动备份（预留）
 * ```
 *
 * 本模块只派生当前路径。历史 Prompt Markdown 的一次性迁移由数据库
 * 初始化调用 Core 迁移执行；缓存导出不参与启动读取。
 */

export type MediaKind = 'images' | 'videos';

function assertIdentitySegment(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

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

export function getPromptWorkspaceExportDir(): string {
  return path.join(getRootDir(), "cache", "prompt-workspace");
}

export function getSkillsDir(): string {
  return path.join(getDataDir(), 'skill-files');
}

export function getRulesDir(): string {
  return path.join(getDataDir(), 'rule-files');
}

export function getAssetsDir(): string {
  return path.join(getDataDir(), 'assets');
}

export function getMediaDir(userId: string, kind: MediaKind): string {
  return path.join(
    getAssetsDir(),
    assertIdentitySegment(userId, 'storage user id'),
    kind,
  );
}

export function getSettingsDir(): string {
  return path.join(getConfigDir(), 'settings');
}

export function getDevicesDir(): string {
  return path.join(getConfigDir(), 'devices');
}

export function getUserRulesDir(userId: string): string {
  return path.join(
    getRulesDir(),
    assertIdentitySegment(userId, 'storage user id'),
  );
}

export function getUserSettingsPath(userId: string): string {
  return path.join(
    getSettingsDir(),
    `${assertIdentitySegment(userId, 'storage user id')}.json`,
  );
}

export function getUserDevicesPath(userId: string): string {
  return path.join(
    getDevicesDir(),
    `${assertIdentitySegment(userId, 'storage user id')}.json`,
  );
}

export function getWebStorageTopology(userId: string) {
  return {
    kind: 'self-hosted-multi-user' as const,
    databasePath: getDatabasePath(),
    shared: {
      promptWorkspaceExportPath: getPromptWorkspaceExportDir(),
      skillsPath: getSkillsDir(),
    },
    user: {
      rulesPath: getUserRulesDir(userId),
      imagesPath: getMediaDir(userId, 'images'),
      videosPath: getMediaDir(userId, 'videos'),
      devicesPath: getUserDevicesPath(userId),
    },
  };
}

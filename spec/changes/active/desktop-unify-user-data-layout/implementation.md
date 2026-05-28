# Implementation

## Shipped

- 在 `apps/desktop/src/main/runtime-paths.ts` 收紧数据库选路逻辑：
  - `getLegacyDatabasePath()` 仍指向旧布局 `userData/prompthub.db`
  - `getDatabasePath()` 不再按“`data/prompthub.db` 存在就优先读”选路
  - 只有迁移 marker 明确写入 `dbLayoutVersion: "0.5.7"` 时才切换到 `userData/data/prompthub.db`
  - 老用户在 root DB 与残留 `data/prompthub.db` 并存时，启动继续保守读取 root DB
- `apps/desktop/src/main/database/index.ts` 改为统一使用新数据库路径解析函数初始化数据库。
- 旧数据布局迁移现在会把根目录 `prompthub.db` 迁移到 `data/prompthub.db`，并继续复用现有 migration marker 与升级快照机制。
- `apps/desktop/src/main/services/data-layout-migration.ts` 新增数据库迁移状态字段：
  - marker 增加 `dbLayoutVersion`
  - 旧 marker 缺少 `dbLayoutVersion` 时，可继续增量补跑 root DB 迁移
  - 当 root `prompthub.db` 与 `data/prompthub.db` 内容不同，视为冲突并拒绝静默覆盖
- `data-path` 检测逻辑更新为优先识别 `data/prompthub.db`，使“完整数据目录”语义与用户认知一致。
- recovery / preview / upgrade-backup-restore 已兼容新旧两种数据库位置：
  - 目录候选预览会优先读取 `data/prompthub.db`
  - 恢复逻辑会根据目标目录当前状态决定写入 legacy 根 DB 或 unified `data/prompthub.db`
  - restore 完成后会把 legacy 根 DB 自动收拢到 `data/prompthub.db`
- `apps/desktop/src/main/database/index.ts` 的恢复候选扫描已兼容统一布局目录，可发现 `candidate/data/prompthub.db`
- `apps/desktop/src/preload/index.ts` 已真正暴露 `window.electron.getRuntimePaths()`；设置页路径展示改为读取主进程真实 runtime paths，而不是 renderer 本地拼接
- `apps/desktop/src/renderer/i18n/locales/*` 已补 `settings.databaseFile` 与 `settings.promptsData` 多语言键
- `apps/desktop/src/main/services/upgrade-backup.ts` 已收紧 upgrade snapshot 策略：
  - 自动只保留最新 5 个 snapshot
  - snapshot 时排除 `prompthub.db.backup-*`、`prompthub.db.lock`、`prompthub.db-wal/shm/journal` 等瞬时数据库文件
- `apps/desktop/src/main/services/upgrade-backup-restore.ts` 在 restore 成功后会再次裁剪 snapshot，但会保护“被恢复的 snapshot + 当前状态保险 snapshot”不被误删

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/runtime-paths.test.ts tests/unit/main/data-layout-migration.test.ts tests/unit/main/data-recovery.test.ts tests/unit/main/prompt-workspace.test.ts`
  - 结果：通过（57/57）
- `pnpm --filter @prompthub/desktop lint`
  - 结果：通过

## Test Coverage Added

- `apps/desktop/tests/unit/main/runtime-paths.test.ts`
  - 覆盖 root DB only / root DB + stale `data/prompthub.db` / unified DB only 三种数据库选路状态
- `apps/desktop/tests/unit/main/data-layout-migration.test.ts`
  - 覆盖旧 marker 缺 `dbLayoutVersion` 时继续补迁移 root DB
  - 覆盖 root/data 双 DB 冲突时拒绝切换并继续保留 root DB
  - 覆盖带 `skills` / `skill_versions` 的 legacy root DB 在迁移后仍可通过真实 `SkillDB` 读回版本数据
- `apps/desktop/tests/unit/main/data-recovery.test.ts`
  - 覆盖恢复候选扫描发现统一布局 `data/prompthub.db`
- `apps/desktop/tests/unit/main/prompt-workspace.test.ts`
  - 保持 prompt workspace 父子文件夹乱序导入回归通过，确认本轮数据迁移修复未破坏 prompt 启动 bootstrap
- `apps/desktop/tests/unit/main/upgrade-backup.test.ts`
  - 覆盖 upgrade snapshot 排除瞬时 DB 备份/锁文件
  - 覆盖自动只保留最新 5 个 snapshot
- `apps/desktop/tests/unit/main/upgrade-backup-restore.test.ts`
  - 覆盖 restore 后保留“源 snapshot + 保险 snapshot”的裁剪行为

## Synced Docs

- `spec/changes/active/desktop-unify-user-data-layout/proposal.md`
- `spec/changes/active/desktop-unify-user-data-layout/specs/desktop/spec.md`
- `spec/changes/active/desktop-unify-user-data-layout/design.md`
- `spec/changes/active/desktop-unify-user-data-layout/tasks.md`

## Follow-ups

- 后续可继续把 upgrade backup manifest / 相关用户文案同步更新为“完整数据目录 = data/”的新语义。
- 若后续决定彻底淘汰 legacy 根 DB，可在一个后续版本中删掉旧路径回退逻辑。
- 发布前如需再提高把握，可增加“通过主进程 initDatabase 启动完整升级目录”的更高层集成测试，但当前核心误切/恢复/skill 版本保留风险已被单元回归锁住。
- 当前 snapshot 仍然是目录拷贝而不是压缩包；若后续要统一备份产品形态，可考虑把“升级回滚 snapshot”和“用户导出备份”在展示层明确区分，或逐步收敛到单一容器格式。

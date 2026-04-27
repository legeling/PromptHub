# Web 数据布局迁移 TODO

> 目标：把 `apps/web` 完整迁移到和桌面端一致的新数据布局（`data/` + `config/` + `backups/` + `logs/`），采用新文件格式：`<slug>.md` + 每文件夹 `_folder.json` + `.versions/<promptId>/NNNN.md`。
>
> 范围约束：只搬新文件格式，**不搬**桌面端专属的 `.trash/`、冲突裁决、restore marker、四象限 bootstrap、EXDEV 降级。Web 进程独占 FS，数据安全由 Docker 卷 + `.phub.gz` 备份兜底。

相关文档：`spec/architecture/data-layout-v0.5.5-zh.md`

## 约束与原则

- Web "现在没用户"，直接按新格式落地，**丢弃所有旧→新迁移代码**（legacy folders.json / legacy prompt dir / legacy media 全删）。
- 必须保留 Web 独有的多租户字段 `ownerUserId` + `visibility`（写入 Prompt frontmatter、`_folder.json`、`skill.json`）；保留 `resolveOwnerUserId` / `updateFolderOwnership` / `updatePromptOwnership` / `updateSkillOwnership`。
- Web Prompt frontmatter 还要额外带 `usageCount` / `lastAiResponse`（桌面端无）。
- Web Skill 目录命名保持现状 `${slug}__${id}/`，格式 `skill.json + SKILL.md + versions/` 不变。
- Web 同步用推土机式 `rmSync(promptsDir) + 重写`（无 `.trash/` 保护需要）。
- 一步到位不分阶段；防数据丢失优先。
- Web 测试命令：`pnpm --filter @prompthub/web test`。

## 已完成 ✅

1. ✅ `apps/web/src/runtime-paths.ts` 新建（纯派生，无 legacy fallback；导出 `getRootDir/getDataDir/getConfigDir/getLogsDir/getBackupsDir/getDatabasePath/getPromptsDir/getSkillsDir/getAssetsDir/getMediaDir/getSettingsDir/getDevicesDir` + `MediaKind`）
2. ✅ `apps/web/src/config.ts`：env `DATA_DIR` → `DATA_ROOT`（默认 `'./'`）；`Config` 加 `rootDir`；`dataDir` = `path.join(rootDir, 'data')` 保留兼容
3. ✅ `apps/web/src/database.ts` 改用 `getDatabasePath()`
4. ✅ `apps/web/src/services/prompt-workspace.ts` 完整重写：新格式 `<slug>.md` + `_folder.json` + `<promptsDir>/.versions/<promptId>/NNNN.md`；保留 Web 特有字段（`ownerUserId`/`visibility`/`usageCount`/`lastAiResponse`）；推土机式 rmSync；删全部 legacy 分支；调 `getPromptsDir()`
5. ✅ `apps/web/src/services/skill-workspace.ts`：删 `getWorkspaceDir`/`getSkillsWorkspaceDir`，改调 `getSkillsDir()`；目录命名 `${slug}__${id}/` 不变；格式不变

## 待做 ❌（按顺序）

6. ❌ `apps/web/src/services/settings.service.ts` → 调 `getSettingsDir()`
7. ❌ `apps/web/src/services/device.service.ts` → 调 `getDevicesDir()`
8. ❌ `apps/web/src/services/media-workspace.ts`：删 `getLegacyMediaRoot` + `migrateLegacyMediaKindDir` + `migrateLegacyMediaWorkspace`，只留 `ensureMediaDir`；调 `getMediaDir()`；`MediaKind` 类型 re-export 或改从 runtime-paths 导入
9. ❌ `apps/web/src/app.ts`：移除 `migrateLegacyMediaWorkspace` import + 调用
10. ❌ 复核 `apps/web/src/services/backup.service.ts`（签名未变，应无需改，只需复核 export payload 版本 `'web-backup-v2'` + `mergeSkill` 逻辑）
11. ❌ 更新测试：
    - `apps/web/src/services/prompt-workspace.test.ts`（需覆盖 `<slug>.md` + `_folder.json` + `.versions/`；移除所有 `'workspace'` / `folders.json` / `prompt.md` 硬编码）
    - `apps/web/src/services/skill-workspace.test.ts`
    - `apps/web/src/services/settings.service.test.ts`
    - `apps/web/src/routes/media.test.ts`
12. ❌ 更新 `README.md`（第 248–265 行）、`apps/web/README.md`（第 195–219 行）、`apps/web/docker-compose*.yml` 卷挂载（`./data:/app/data` → `DATA_ROOT` 新挂载点）
13. ❌ 在 `spec/architecture/data-layout-v0.5.5-zh.md` 7.1 In Scope 给 Web 打钩
14. ❌ `pnpm --filter @prompthub/web test` + 根 `pnpm lint`
15. ❌ 等用户明确许可后再 commit

## 关键参考

### 桌面端新格式核心逻辑源（勿改）

- `apps/desktop/src/main/services/prompt-workspace.ts`
  - slugify/padVersion 146–158；frontmatter 160–202；body 204–241
  - `promptFrontmatter` 243–264（桌面无 `ownerUserId`/`visibility`/`usageCount`/`lastAiResponse`）
  - `writeFolderMetadataFiles` 360–389；`buildFolderSegments` 391–411
  - `getPromptFilePath` 426–463（`<slug>.md`，冲突降级 `<slug>-<id8>.md` → `<slug>-N.md`）
  - `collectPromptFiles` 465–520（跳 `.trash` / `.versions` / `versions` / `_folder.json`）
  - `getPromptVersionDir` 530–532；`parsePromptFile` 610–652；`parseVersionFile` 654–681
- `apps/desktop/src/main/runtime-paths.ts`（路径 API 模板）

### Web 多租户注意

DTO 不带 `ownerUserId`/`visibility`，必须用原始 SQL 合并：

```sql
SELECT id, owner_user_id, visibility FROM ...
```

### 路径决策

- 新增 env `DATA_ROOT` 默认 `./`
- `DATA_DIR` 已废弃删除
- `config.dataDir` 保留向后兼容 = `path.join(rootDir, 'data')`
- 新增 `config.rootDir`
- 媒体布局：`data/assets/<userId>/{images,videos}/`
- Settings：`config/settings/<userId>.json`
- Devices：`config/devices/<userId>.json`

## 下一步交接

**立即下一步**：改 `apps/web/src/services/settings.service.ts` 把路径解析切换到 `getSettingsDir()`，然后 `device.service.ts` → `getDevicesDir()`，再处理 `media-workspace.ts` 删 legacy 函数 + 调 `getMediaDir()`，最后 `app.ts` 移除 `migrateLegacyMediaWorkspace` 调用。随后更新测试和文档，跑 Web 测试 + lint，等用户许可再 commit。

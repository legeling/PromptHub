# PromptHub AGENTS Guide

本文件是 PromptHub 仓库的协作规则与快速索引，面向进入仓库工作的智能体与协作者。目标是先理解边界，再改代码，最后做回归。

---

## 1. 项目概览

- **技术栈**：Electron 33、React 18、TypeScript 5.6、Vite 6、Tailwind CSS 3.4、Zustand 5
- **数据库**：`node-sqlite3-wasm`（纯 WASM，零原生编译；通过 `src/main/database/sqlite.ts` 适配层兼容 better-sqlite3 API）
- **包管理器**：`pnpm`（禁止引入 npm/yarn 锁文件）
- **测试**：Vitest（单测）、Playwright（E2E）
- **国际化**：7 语言 — `zh`、`zh-TW`、`en`、`ja`、`es`、`de`、`fr`
- **文档目录**：`docs/`

---

## 2. 快速索引

### 代码主目录

| 目录                 | 职责                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `src/main/`          | Electron 主进程：数据库、IPC handler、窗口、更新、文件系统             |
| `src/preload/`       | 受限桥接层，向渲染进程暴露安全 API（`window.api` / `window.electron`） |
| `src/renderer/`      | React 前端                                                             |
| `src/shared/`        | 主进程与渲染进程共享：类型、常量、IPC channel 名称                     |
| `tests/unit/`        | Vitest 单元测试                                                        |
| `tests/e2e/`         | Playwright 端到端测试                                                  |
| `docs/architecture/` | 架构说明、结构治理、回归清单                                           |

### 重点文档

- `README.md`：项目总览与使用说明
- `CLAUDE.md`：Claude Code 项目级强制规则（函数 ≤50 行、文件 ≤500 行、禁用 any 等）
- `docs/architecture/code-structure-guidelines.md`：超长文件治理与拆分规范
- `docs/architecture/refactor-regression-checklist.md`：结构重构后的回归清单

---

## 3. 常用命令

```bash
pnpm install
pnpm electron:dev   # 等同于 pnpm dev
pnpm dev:web        # 纯浏览器模式（无 Electron）
pnpm build
pnpm lint           # ESLint（改完前端必跑）
pnpm typecheck
pnpm test:run       # Vitest
pnpm test:e2e       # Playwright
```

补充说明：

- 若只改局部逻辑，至少跑 `pnpm typecheck` + `pnpm lint` + 最近边界的测试
- 不要提交生成产物或临时文件（如 `*.tsbuildinfo`）

---

## 4. 硬性规则

- 未经用户明确要求，不要自动 `git commit/push`
- 提交时优先拆分为小批次、单主题 commit
- commit message 默认使用中英双语
- 不要在 `src/` 下随意新增说明文档，说明文档统一放到 `docs/`
- 不要用 mock、占位 TODO、空 `catch` 掩盖真实问题
- 禁用 `any`，TypeScript 用 `interface` 定义类型
- 涉及持久化结构、IPC 通道、共享类型时，**必须同步检查 `src/shared/`、`src/preload/`、`src/main/`、`src/renderer/` 四层**

---

## 5. 架构边界

### 四层模型（任何跨层改动必须全部同步）

```
src/shared/   ← 协议、类型、常量（不含业务逻辑）
     ↓
src/main/     ← 真实副作用：DB、FS、系统级逻辑
     ↓
src/preload/  ← 安全桥接，只做 ipcRenderer.invoke/on 封装，不塞业务
     ↓
src/renderer/ ← React UI，不直接接触 FS/DB，通过 window.api 调用
```

### Renderer 内部分层

| 目录/约定     | 职责                                                     |
| ------------- | -------------------------------------------------------- |
| `components/` | 页面容器和展示组件                                       |
| `use-*.ts`    | 有状态、可复用的行为逻辑（hooks）                        |
| `*-utils.ts`  | 纯函数、格式转换、派生逻辑                               |
| `services/`   | 副作用和流程编排                                         |
| `stores/`     | 状态存储与少量动作入口，不要把大型业务流程继续堆进 store |

---

## 6. IPC Channels 速查（共 53 个）

所有常量定义在 `src/shared/constants/ipc-channels.ts`，命名规则 `domain:action`。

### Prompt（7）

| 常量             | Channel         |
| ---------------- | --------------- |
| `PROMPT_CREATE`  | `prompt:create` |
| `PROMPT_GET`     | `prompt:get`    |
| `PROMPT_GET_ALL` | `prompt:getAll` |
| `PROMPT_UPDATE`  | `prompt:update` |
| `PROMPT_DELETE`  | `prompt:delete` |
| `PROMPT_SEARCH`  | `prompt:search` |
| `PROMPT_COPY`    | `prompt:copy`   |

### Version（4）

`version:getAll` / `version:create` / `version:rollback` / `version:diff`

### Folder（5）

`folder:create` / `folder:getAll` / `folder:update` / `folder:delete` / `folder:reorder`

### Settings（2）

`settings:get` / `settings:set`

### Import/Export（2）

`export:prompts` / `import:prompts`

### Security（4）

`security:setMasterPassword` / `security:unlock` / `security:status` / `security:lock`

### Skill CRUD（8）

`skill:create` / `skill:get` / `skill:getAll` / `skill:update` / `skill:delete` / `skill:search` / `skill:export` / `skill:import`

### Skill 扫描与平台安装（5）

`skill:scanLocal` / `skill:scanLocalPreview` / `skill:installToPlatform` / `skill:uninstallFromPlatform` / `skill:getPlatformStatus`

### Skill SKILL.md 多平台（8）

`skill:getSupportedPlatforms` / `skill:detectPlatforms` / `skill:installMd` / `skill:uninstallMd` / `skill:getMdInstallStatus` / `skill:getMdInstallStatusBatch` / `skill:installMdSymlink` / `skill:fetchRemoteContent`

### Skill 本地仓库文件（6）

`skill:readLocalFiles` / `skill:writeLocalFile` / `skill:deleteLocalFile` / `skill:createLocalDir` / `skill:saveToRepo` / `skill:getRepoPath`

### Skill 版本管理（5）

`skill:version:getAll` / `skill:version:create` / `skill:version:rollback` / `skill:deleteAll` / `skill:version:insertDirect`

> **高风险操作**：IPC channel 名称变更会同时影响 main handler 注册、preload 封装、renderer 调用三处，除非必要不要改。

---

## 7. 数据库结构（6 张表）

定义位置：`src/main/database/schema.ts`。

### 核心表

| 表名              | 主要字段                                                                                                                                                                                           | 备注                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `prompts`         | `id TEXT PK`, `title`, `user_prompt`, `system_prompt`, `prompt_type`, `folder_id FK`, `variables TEXT`, `tags TEXT`, `is_pinned`, `is_favorite`, `usage_count`, `created_at INT`, `updated_at INT` | `variables`/`tags`/`images` 为 JSON 字符串；有 FTS5 虚表                    |
| `prompt_versions` | `id TEXT PK`, `prompt_id FK`, `version INT`, `system_prompt`, `user_prompt`, `variables TEXT`                                                                                                      | `UNIQUE(prompt_id, version)`                                                |
| `folders`         | `id TEXT PK`, `name`, `icon`, `parent_id FK（自引用）`, `sort_order`, `is_private`                                                                                                                 | 最大嵌套深度 2（renderer 侧强制）                                           |
| `settings`        | `key TEXT PK`, `value TEXT`                                                                                                                                                                        | 所有设置键值对                                                              |
| `skills`          | `id TEXT PK`, `name`, `content`, `protocol_type DEFAULT 'mcp'`, `tags TEXT`, `is_favorite`, `current_version`, `created_at INT`, `updated_at INT`                                                  | `mcp_config` 字段为旧版，已弃用                                             |
| `skill_versions`  | `id TEXT PK`, `skill_id FK`, `version INT`, `content`, `files_snapshot TEXT`, `note`                                                                                                               | `UNIQUE(skill_id, version)`；`files_snapshot` 存 `SkillFileSnapshot[]` JSON |

### 索引（13 个）与 FTS

- `prompts_fts`：FTS5 虚表（索引 title、description、system_prompt、user_prompt、tags）
- 3 个同步触发器：`prompts_ai`（INSERT）、`prompts_ad`（DELETE）、`prompts_au`（UPDATE）
- 关键复合索引：`(folder_id, is_favorite)`、`(folder_id, updated_at DESC)`

---

## 8. 共享类型速查

定义位置：`src/shared/types/`

### Prompt

```typescript
interface Prompt {
  id: string;
  title: string;
  promptType?: "text" | "image" | "video";
  systemPrompt?: string;
  systemPromptEn?: string; // 双语字段
  userPrompt: string;
  userPromptEn?: string;
  variables: Variable[];
  tags: string[];
  folderId?: string;
  isFavorite: boolean;
  isPinned: boolean;
  version: number;
  currentVersion: number;
  usageCount: number;
  lastAiResponse?: string;
  notes?: string;
  source?: string;
  createdAt: string;
  updatedAt: string; // ISO 8601
}
type VariableType = "text" | "textarea" | "number" | "select";
```

### Skill

```typescript
interface Skill {
  id: string;
  name: string;
  content?: string;
  instructions?: string; // 两者均指 SKILL.md 内容
  protocol_type: "skill" | "mcp" | "claude-code"; // skill = SKILL.md 默认
  local_repo_path?: string; // 本地 clone 目录绝对路径
  is_builtin?: boolean;
  registry_slug?: string;
  tags?: string[];
  original_tags?: string[];
  icon_url?: string;
  icon_emoji?: string;
  category?: SkillCategory; // 10 个类别
  is_favorite: boolean;
  currentVersion?: number;
  created_at: number;
  updated_at: number;
}
type SkillCategory =
  | "general"
  | "office"
  | "dev"
  | "ai"
  | "data"
  | "management"
  | "deploy"
  | "design"
  | "security"
  | "meta";

interface SkillVersion {
  id: string;
  skillId: string;
  version: number;
  content?: string;
  filesSnapshot?: SkillFileSnapshot[]; // 多文件 skill
  note?: string;
  createdAt: string;
}
interface SkillFileSnapshot {
  relativePath: string;
  content: string;
}
interface SkillLocalFileEntry {
  path: string;
  content: string;
  isDirectory: boolean;
}

// 扫描结果（尚未导入）
interface ScannedSkill {
  name: string;
  description: string;
  instructions: string;
  filePath: string; // SKILL.md 绝对路径（用于去重和已安装判断）
  localPath: string; // skill 所在目录绝对路径
  platforms: string[];
}
```

---

## 9. Preload API 接口（`window.api`）

### `window.api.prompt`（7 个方法）

`create` / `get` / `getAll` / `update` / `delete` / `search` / `copy`

### `window.api.skill`（31 个方法）

- CRUD：`create` / `get` / `getAll` / `update` / `delete` / `export` / `import`
- 扫描：`scanLocal` / `scanLocalPreview(customPaths?)`
- MCP 平台安装：`installToPlatform` / `uninstallFromPlatform` / `getPlatformStatus`
- SKILL.md 多平台：`getSupportedPlatforms` / `detectPlatforms` / `installMd` / `uninstallMd` / `getMdInstallStatus` / `getMdInstallStatusBatch` / `installMdSymlink` / `fetchRemoteContent`
- 本地文件：`readLocalFiles(skillId)` / `writeLocalFile(skillId, relativePath, content)` / `deleteLocalFile(skillId, relativePath)` / `createLocalDir(skillId, relativePath)` / `saveToRepo(skillName, sourceDir)` / `getRepoPath(skillId)`
- 版本：`versionGetAll(skillId)` / `versionCreate(skillId, note?, filesSnapshot?)` / `versionRollback(skillId, version)`
- 备份恢复：`deleteAll` / `insertVersionDirect(version)`

### `window.api.security`

`status` / `setMasterPassword(password)` / `unlock(password)` / `lock`

### `window.api.version`（Prompt 版本）

`getAll(promptId)` / `create(promptId, note?)` / `rollback(promptId, version)` / `diff(id1, id2)`

### `window.api.folder`

`create` / `getAll` / `update` / `delete` / `reorder`

### `window.api.settings`

`get` / `set(key, value)`

### `window.api.io`

Prompt 导入/导出

### `window.api.on / off`（事件白名单）

`updater:status` / `shortcut:triggered` / `window:close-action` / `window:showCloseDialog`

### `window.electron`（独立 contextBridge）

窗口控制、全屏、自动启动、系统托盘、关闭对话框、图片（select/save/saveBuffer/download/open/list/getSize/readBase64/saveBase64/exists/clear）、视频（同图片）、WebDAV（testConnection/ensureDirectory/upload/download/stat）、快捷键（get/set/setMode/onTriggered/onUpdated）、更新器（check/download/install/openDownloadedUpdate/getVersion/getPlatform/openReleases/onStatus/offStatus）、数据目录（getDataPath/migrateData）

---

## 10. Renderer Stores

| Store              | 文件                | 行数       | 持久化字段                                                                                                                                           |
| ------------------ | ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePromptStore`   | `prompt.store.ts`   | 225        | `sortBy`, `sortOrder`, `viewMode`, `galleryImageSize`, `kanbanColumns`, `promptTypeFilter`                                                           |
| `useSkillStore`    | `skill.store.ts`    | **847** ⚠️ | `viewMode`, `filterType`, `translationCache`（TTL 7d，max 200 条）, `storeView`, `customStoreSources`, `selectedStoreSourceId`, `remoteStoreEntries` |
| `useFolderStore`   | `folder.store.ts`   | 349        | 无（非 persist）                                                                                                                                     |
| `useSettingsStore` | `settings.store.ts` | **764** ⚠️ | 几乎全部字段（语言、主题、字体、AI 配置、WebDAV、备份、Skill 安装方式等）                                                                            |
| `useUIStore`       | `ui.store.ts`       | 34         | `isSidebarCollapsed`（viewMode 启动时重置为 `prompt`）                                                                                               |

**注意**：

- `skill.store.ts` 和 `settings.store.ts` 均已超过 700 行，为结构热点，新增功能前优先考虑拆分
- `useFolderStore` 不使用 persist，folder 切换时会自动清除解锁状态
- 文件夹最大嵌套深度 `MAX_FOLDER_DEPTH = 2`（在 folder.store.ts 中强制）

---

## 11. 主进程关键服务

### `src/main/services/skill-installer.ts`（1389 行 — 结构热点）

`SkillInstaller` 类，涵盖：

- GitHub clone 安装（`installFromGithub`）
- 本地文件读写删除（`readLocalFiles` / `writeLocalFile` / `deleteLocalFile` / `createLocalDir`）
- SKILL.md 多平台安装/卸载（copy 或 symlink 两种方式）
- 本地目录扫描（`scanLocalSkills` / `scanLocalSkillsPreview`）
- 版本快照（多文件 `filesSnapshot`）
- 本地仓库路径管理（`getRepoPath`，基于 `app.getPath('userData')/skills/`）

> 1389 行，超出 1000 行阈值，**属于结构热点，任何新功能必须先考虑拆分，再叠加**。

### `src/main/services/skill-installer-utils.ts`（118 行）

- MCP config JSON 校验（`validateMCPConfig`）
- 平台路径解析（`resolvePlatformPath`）
- git clone 封装（`gitClone`）
- 技能目录获取（`getPlatformSkillsDir`）

### `src/main/services/skill-validator.ts`（367 行）

- SKILL.md YAML frontmatter 解析（`parseSkillMd`）
- Skill 名称校验（`validateSkillName`）
  - 规则：`/^[a-z0-9]+(-[a-z0-9]+)*$/`，长度 1–64
- 返回 `ScannedSkill` 结构

---

## 12. 组件目录速查

### `src/renderer/components/skill/`（17 个文件）

| 文件                          | 行数       | 状态       | 说明                                                                                                                            |
| ----------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `SkillManager.tsx`            | —          | 已提交     | Skill 主页面容器                                                                                                                |
| `SkillListView.tsx`           | —          | 已提交     | Skill 列表视图                                                                                                                  |
| `SkillDetailView.tsx`         | —          | 已提交     | Skill 详情侧边栏                                                                                                                |
| `SkillFullDetailPage.tsx`     | —          | 已提交     | Skill 全屏详情页                                                                                                                |
| `SkillStore.tsx`              | —          | 已提交     | Skill 商店页面                                                                                                                  |
| `SkillStoreDetail.tsx`        | —          | 已提交     | 商店 Skill 详情                                                                                                                 |
| `SkillQuickInstall.tsx`       | —          | 已提交     | 快速安装弹窗                                                                                                                    |
| `SkillIcon.tsx`               | —          | 已提交     | Skill 图标组件                                                                                                                  |
| `CreateSkillModal.tsx`        | —          | 已提交     | 创建 Skill 弹窗                                                                                                                 |
| `EditSkillModal.tsx`          | —          | 已提交     | 编辑 Skill 弹窗                                                                                                                 |
| `detail-utils.ts`             | —          | 已提交     | 详情页纯函数工具                                                                                                                |
| `index.ts`                    | —          | 已提交     | 导出入口                                                                                                                        |
| **`SkillFileEditor.tsx`**     | **915** ⚠️ | **未提交** | 多文件编辑器（文件树 + 代码编辑器，支持内嵌/弹窗两种模式），使用 `readLocalFiles/writeLocalFile/deleteLocalFile/createLocalDir` |
| **`SkillFileEditor.css`**     | 482        | **未提交** | 专属 CSS（无 Tailwind）                                                                                                         |
| **`SkillMarkdown.css`**       | 219        | **未提交** | `SkillFullDetailPage.tsx` 中 Markdown 渲染样式，使用 CSS 自定义属性                                                             |
| **`SkillScanPreview.tsx`**    | 421        | **未提交** | 本地扫描结果预览/导入 UI，按 `localPath` 去重（非 name）                                                                        |
| **`SkillVersionHistory.tsx`** | 639        | **未提交** | 版本历史弹窗（diff 视图、多文件快照浏览、回滚确认）                                                                             |

> `SkillFileEditor.tsx`（915 行）超出 700 行阈值，**属于结构热点**。

### `src/renderer/components/settings/`（已拆分，14 个文件）

`SettingsPage.tsx`（容器）+ 各设置子页：
`AISettings.tsx`（2663 行 ⚠️）、`DataSettings.tsx`（805 行 ⚠️）、`SecuritySettings.tsx`（250 行）、`AppearanceSettings.tsx`（223 行）、`SkillSettings.tsx`（200 行）、`ShortcutsSettings.tsx`（150 行）、`GeneralSettings.tsx`（88 行）、`NotificationsSettings.tsx`（42 行）、`LanguageSettings.tsx`（37 行）、`AboutSettings.tsx`（168 行）、`shared.tsx`（273 行）、`SettingsModal.tsx`（154 行）

> `AISettings.tsx`（2663 行）严重超标，属于**最高优先级结构热点**，任何新功能禁止继续堆入。

---

## 13. i18n 结构

基准文件：`src/renderer/i18n/locales/zh.json`（约 958 行），包含 16 个顶层 namespace：

`app`、`filter`、`nav`、`header`、`prompt`（~100 键）、`folder`（~35 键）、`settings`（~200 键）、`import`、`resources`、`common`、`skill`（~130 键）、`error`、`toast`、`closeDialog`、`quickAdd`

其他 6 个语言文件（`en.json`、`ja.json`、`zh-TW.json`、`de.json`、`es.json`、`fr.json`）须与 `zh.json` 保持 key 对齐，新增 i18n key 必须同步更新所有 7 个文件。

---

## 14. 结构治理规则

| 行数阈值  | 处置要求                                            |
| --------- | --------------------------------------------------- |
| > 400 行  | 新增功能前先看能否抽 `utils`、`hooks`、局部 section |
| > 700 行  | 默认应该按职责拆分                                  |
| > 1000 行 | 视为结构热点，**优先先拆再继续叠功能**              |

### 当前结构热点清单

| 文件                                                    | 行数     | 优先级  |
| ------------------------------------------------------- | -------- | ------- |
| `src/renderer/components/settings/AISettings.tsx`       | **2663** | 🔴 最高 |
| `src/main/services/skill-installer.ts`                  | **1389** | 🔴 最高 |
| `src/renderer/components/skill/SkillFileEditor.tsx`     | **915**  | 🟡 高   |
| `src/renderer/stores/skill.store.ts`                    | **847**  | 🟡 高   |
| `src/renderer/components/settings/DataSettings.tsx`     | **805**  | 🟡 高   |
| `src/renderer/stores/settings.store.ts`                 | **764**  | 🟡 高   |
| `src/renderer/components/skill/SkillVersionHistory.tsx` | **639**  | 🟠 关注 |

推荐拆分顺序：

1. 先抽纯函数 → `*-utils.ts`
2. 再抽共享 hook → `use-*.ts`
3. 再抽 section component
4. 最后清理容器组件

---

## 15. 修改约定

- UI 改动尽量保持 props 形状稳定
- 数据结构改动优先保持向后兼容
- IPC channel 名称变更属于高风险改动，除非必要不要改（需同步 main handler + preload + renderer 三处）
- 新增模块优先考虑单一职责，不要把新逻辑继续堆进现有热点文件
- 同一逻辑若在两个以上组件出现，优先提取共享层
- 新增 Skill 相关功能必须检查：`ScannedSkill` 去重逻辑基于 `localPath`（非 name），不要改成 name

---

## 16. 回归要求

结构重构后至少执行：

```bash
pnpm typecheck
pnpm lint
pnpm test:run
```

若改动范围较大，按 `docs/architecture/refactor-regression-checklist.md` 做手工验证，重点覆盖：

- Prompt 创建、编辑、导入、版本
- Skill 创建、导入、版本恢复、本地文件编辑（SkillFileEditor）、扫描导入（SkillScanPreview）
- Settings 各子页保存、备份、恢复（DataSettings）、AI 模型配置（AISettings）
- 启动初始化、侧边栏切换、更新提示

---

## 17. 当前协作偏好

- 先查边界，再改代码
- 优先做可验证的小步重构，而不是一次性大搬迁
- 如果工作区里已经有其他未提交改动，避免混入无关提交
- 涉及跨模块重构时，优先补回归测试再继续扩散
- 当前有大量未提交改动（见 `git status`），改动前务必确认当前工作上下文

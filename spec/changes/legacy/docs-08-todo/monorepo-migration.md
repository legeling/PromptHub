# Monorepo 改造 — 计划与进展

> 目标：将 PromptHub 从单体结构改造为 pnpm monorepo，为多产品线（desktop、web、web SaaS）做准备。

## 总体路线图

```
Phase 1: Monorepo 基础结构          ✅ 已完成
Phase 2: 提取 packages/db           ✅ 已完成
Phase 3: 新增 apps/web (Hono)       ❌ 待做
Phase 4: 私有仓库 prompthub-cloud   ⏳ 部分完成
Phase 5: CI/CD 验证 + 发布          ❌ 待做
```

---

## Phase 1: Monorepo 基础结构 ✅

**提交:** `1528d29` (2026-04-11)
**分支:** `main`

### 1.1 packages/shared 提取 ✅

- [x] 创建 `packages/shared/package.json` (`@prompthub/shared`, MIT, v0.1.0)
- [x] 创建 `packages/shared/tsconfig.json`
- [x] `src/shared/types/` → `packages/shared/types/` (6 文件: prompt, folder, skill, settings, ai, index)
- [x] `src/shared/constants/` → `packages/shared/constants/` (6 文件: ipc-channels, platforms, resources, skill-registry, skill-icons, index)
- [x] 全项目 139 处 import 路径替换 (`@shared/` → `@prompthub/shared`)

### 1.2 Desktop 搬迁到 apps/desktop/ ✅

- [x] `git mv` 搬迁所有 desktop 文件：src/, tests/, resources/, bin/, scripts/, 配置文件
- [x] 创建 `apps/desktop/package.json` (`@prompthub/desktop`)，包含全部依赖和 scripts
- [x] 精简根 `package.json` 为纯 workspace 根（scripts 通过 `pnpm --filter @prompthub/desktop` 代理）

### 1.3 配置文件路径更新 ✅

- [x] `tsconfig.json` — paths 和 include 改为 `../../packages/...`
- [x] `vite.config.ts` / `vite.cli.config.ts` / `vite.web.config.ts` / `vitest.config.ts` — alias 中 `@shared` 改为 `../../packages/shared`
- [x] `electron-builder.json` — extraResources 中 icon/CHANGELOG 路径改为 `../../...`
- [x] `updater.ts` — CHANGELOG 路径改为 `../../../../CHANGELOG.md`（Vite 构建后 `__dirname` 是 `apps/desktop/out/main/`）

### 1.4 CI/CD 更新 ✅

- [x] `release.yml` — build job 所有步骤加 `working-directory: apps/desktop`
- [x] `release.yml` — release job 脚本引用改为 `apps/desktop/scripts/...`
- [x] `release.yml` — upload-artifact path 改为 `apps/desktop/upload_dist/*`
- [x] `quality.yml` — 通过根 scripts 代理，基本无需改动

### 1.5 Workspace 配置 ✅

- [x] `pnpm-workspace.yaml` — `packages: ["packages/*", "apps/*"]`（移除了 `"."` 条目）
- [x] `pnpm install` 成功识别 3 个 workspace project

### 1.6 验证 ✅

- [x] `pnpm install` — Scope: all 3 workspace projects
- [x] `pnpm build` — renderer + main + preload + cli 四个 bundle 全部产出
- [x] `pnpm lint` — 0 errors
- [x] `npx vitest run` — 66 files, 801 tests, 0 failed

---

## Phase 2: 提取 packages/db ✅

**提交:** `19dc369` (2026-04-11)
**目标:** 将数据库层从 `apps/desktop/src/main/database/` 提取为独立包 `@prompthub/db`，使 desktop 和 server 可复用同一套数据访问层。

### 搬迁文件

| 来源 (apps/desktop)           | 目标 (packages/db/src) | 说明                        |
| ----------------------------- | ---------------------- | --------------------------- |
| `src/main/database/schema.ts` | `schema.ts`            | DDL 定义                    |
| `src/main/database/sqlite.ts` | `adapter.ts`           | DatabaseAdapter (WASM 封装) |
| `src/main/database/index.ts`  | `init.ts`              | 初始化 + migration (纯 DB)  |
| `src/main/database/prompt.ts` | `prompt.ts`            | PromptDB                    |
| `src/main/database/folder.ts` | `folder.ts`            | FolderDB                    |
| `src/main/database/skill.ts`  | `skill.ts`             | SkillDB                     |

### 已完成步骤

- [x] 创建 `packages/db/package.json` (`@prompthub/db`, MIT, v0.1.0)
- [x] 创建 `packages/db/tsconfig.json`
- [x] 搬迁 database 文件到 `packages/db/src/`
- [x] `index.ts` 拆分：纯 DB init/migration 进包 (`init.ts`)，数据恢复逻辑留 desktop
- [x] 通过 `InitDatabaseHooks.resolveSkillRepoPath` 回调注入文件系统扫描逻辑
- [x] desktop 中创建代理 re-export 文件（保持 13 个消费者 + 8 个测试文件 import 不变）
- [x] 更新 vite/vitest 配置添加 `@prompthub/db` alias
- [x] uuid 版本对齐到 `^13.0.0`
- [x] 更新 `bin-entry.test.ts` 的 dependencies 断言
- [x] 验证：lint 0 error, 66 test files, 801 tests all passed

### 设计决策

- **用 WASM 而非 native binding**：项目用 `node-sqlite3-wasm`，不是 `better-sqlite3`，避免了跨平台 native 编译问题
- **代理文件策略**：desktop 的 `database/` 目录保留薄代理文件 re-export from `@prompthub/db`，最小化消费者端改动
- **Hooks 解耦**：`initDatabase()` 接受 `InitDatabaseHooks` 参数，将 Electron 特定逻辑（路径解析、skill repo 扫描）通过回调注入
- **保持 raw SQL**：此阶段不引入 ORM，Phase 3 server 可根据需要选择 Drizzle

---

## Phase 3: 新增 apps/web (Hono) ❌

**目标:** 创建自部署后端服务，提供 REST API 供 web 客户端和第三方集成使用。

### 技术选型（已确定）

| 项目   | 选择                                | 理由                                     |
| ------ | ----------------------------------- | ---------------------------------------- |
| 框架   | Hono                                | 运行时无关（Node/Bun/Deno/CF Workers）   |
| ORM    | Drizzle                             | 类型安全、轻量、支持 SQLite + PostgreSQL |
| 数据库 | SQLite (自部署) / PostgreSQL (SaaS) | 自部署零依赖，SaaS 可扩展                |
| 认证   | 待定                                | 自部署可能用简单 token，SaaS 用 OAuth    |

### 步骤

- [ ] 创建 `apps/web/package.json` (`@prompthub/web`)
- [ ] 基础 Hono 项目脚手架
- [ ] 接入 `@prompthub/db`（或 `@prompthub/shared` 的类型）
- [ ] 实现 Prompt CRUD API
- [ ] 实现 Skill CRUD API
- [ ] 实现 Folder CRUD API
- [ ] 认证中间件
- [ ] Docker 部署配置

---

## Phase 4: 私有仓库 prompthub-cloud ⏳

**目标:** 在独立私有仓库中开发 SaaS 付费功能，通过 MIT 协议的共享包桥接。

### 已完成

- [x] 本地 git 初始化（commit `a89f82c`）
- [x] 基础目录结构规划

### 待完成

- [ ] 在 GitHub 创建私有仓库 `prompthub-cloud`
- [ ] 推送初始代码
- [ ] 配置 CI/CD
- [ ] 实现付费功能（Team collaboration, advanced AI features, etc.）

### 商业化架构

```
公开仓库 (AGPL-3.0)          私有仓库 (Proprietary)
┌────────────────────┐      ┌──────────────────────┐
│  apps/desktop      │      │  apps/web-saas       │
│  apps/web          │      │  apps/billing        │
│  packages/shared   │◄────►│  packages/pro-*      │
│  packages/db       │      │                      │
└────────────────────┘      └──────────────────────┘
        MIT 共享包桥接
```

### 产品路线

1. **Self-hosted** — 开源免费（当前 desktop + 未来 web）
2. **Demo 站点** — 引流，免费但有限制
3. **SaaS Pro/Team** — 付费，协作功能、高级 AI、云同步
4. **Enterprise** — 私有部署 + 商业支持

---

## Phase 5: CI/CD 验证 + 发布 ❌

**目标:** 确认 monorepo 改造后的 CI/CD pipeline 完全正常工作。

### 步骤

- [ ] 推送 monorepo commit 到 GitHub main 分支
- [ ] 确认 `quality.yml` workflow 通过（lint + test）
- [ ] 确认 `release.yml` 的 build matrix 能正常构建各平台包
- [ ] 测试打 tag `v0.6.0` 触发完整发布流程
- [ ] 验证各平台安装包（macOS dmg, Windows exe, Linux AppImage）正常工作
- [ ] 更新 Homebrew cask 等分发渠道

---

## 关键发现与踩坑记录

### 1. pnpm-workspace.yaml 不需要包含 `"."`

根 package.json 作为 workspace 根不需要被视为一个包。包含 `"."` 会导致 pnpm 将根目录也作为 workspace member 处理，引起混淆。

### 2. `__dirname` 路径深度变化

搬迁后 Vite 构建产物路径变深：

- 旧：`out/main/` → `../../CHANGELOG.md` 到达根
- 新：`apps/desktop/out/main/` → `../../../../CHANGELOG.md` 到达仓库根

### 3. CI/CD working-directory 注意事项

- `release.yml` build job：所有步骤需要 `working-directory: apps/desktop`
- `upload-artifact` 的 `path`：需要从仓库根算起 (`apps/desktop/upload_dist/*`)
- release job：不设 working-directory（在根运行），脚本路径改为 `apps/desktop/scripts/...`

### 4. pnpm test 参数传递

通过 `pnpm --filter` 代理时 `-- --run` 会被 pnpm 误解析。解决方案：在 desktop 的 package.json 中定义 `test:run` 脚本，根 package.json 中代理为 `pnpm --filter @prompthub/desktop test:run`。

### 5. electron-builder extraResources 路径

从 `apps/desktop/` 出发，需要用 `../../` 回到仓库根才能找到 `docs/imgs/icon.png` 和 `CHANGELOG.md`。

---

## 当前仓库结构

```
PromptHub/                           # workspace 根
├── package.json                     # scripts 通过 pnpm --filter 代理
├── pnpm-workspace.yaml              # packages: ["packages/*", "apps/*"]
├── pnpm-lock.yaml
├── CHANGELOG.md / LICENSE / README.md / AGENTS.md / CLAUDE.md
├── docs/                            # 文档（留在根目录）
├── .github/workflows/               # CI/CD（已更新）
│
├── packages/
│   ├── shared/                      # @prompthub/shared (MIT)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── types/                   # 共享类型定义
│   │   └── constants/               # 共享常量
│   │
│   └── db/                          # @prompthub/db (MIT)
│       ├── package.json             # deps: node-sqlite3-wasm, uuid
│       ├── tsconfig.json
│       └── src/
│           ├── adapter.ts           # DatabaseAdapter (WASM wrapper)
│           ├── schema.ts            # SCHEMA_TABLES, SCHEMA_INDEXES
│           ├── init.ts              # initDatabase(), getDatabase(), hooks
│           ├── prompt.ts            # PromptDB
│           ├── folder.ts            # FolderDB
│           ├── skill.ts             # SkillDB
│           └── index.ts             # barrel export
│
└── apps/
    └── desktop/                     # @prompthub/desktop (AGPL-3.0)
        ├── package.json             # deps: @prompthub/db, @prompthub/shared
        ├── src/
        │   └── main/database/       # 薄代理文件 re-export from @prompthub/db
        ├── tests/                   # unit/, integration/, e2e/
        ├── resources/               # icons, installer
        ├── scripts/                 # 构建脚本
        └── [配置文件]               # vite, vitest, tsconfig, electron-builder, etc.
```

---

_最后更新: 2026-04-11 — Phase 1 & 2 完成，项目结构整理完成_

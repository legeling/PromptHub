# PromptHub Web — 自部署网页版实施计划

> 目标：将 `apps/web` 落地为 **可自部署、可浏览器访问、具备完整 PromptHub 核心能力** 的网页版产品，而不是单纯的 API 服务。

---

## 1. 产品定义

`apps/web` 的最终形态应当是：

- 用户可部署到 VPS / NAS / Docker 环境
- 通过浏览器登录后直接管理 Prompt、Folder、Skill、设置与媒体资源
- 支持 AI 请求转发
- 支持作为 desktop 的同步源
- 不依赖 Electron / `window.api`
- 支持单用户优先，后续可扩展多用户

---

## 2. 当前现状

### 已完成

- monorepo 改造完成
- `packages/db` / `packages/shared` 已提取
- `apps/server` 已重命名为 `apps/web`
- `@prompthub/server` 已更名为 `@prompthub/web`
- auth API 已实现
- prompts API 已实现
- Prompt 数据层已补齐 `videos / systemPromptEn / userPromptEn / lastAiResponse`

### 未完成

- `apps/web` 目前只有后端 API，没有浏览器 UI
- server 启动仍有 `node-sqlite3-wasm` 运行时兼容问题待修
- folders / skills / settings / media / sync / ai / import-export 尚未完整实现
- Docker 部署配置未完成
- Web 前端状态管理、路由、页面壳子未开始

---

## 3. 总体实施路线

### Phase A — 让 `apps/web` 后端真正可运行

目标：先让后端可以稳定启动并对外提供 API。

#### A1. 修复运行时阻塞

- 修复 `node-sqlite3-wasm` 在 `apps/web` Node ESM 环境下的导出兼容问题
- 验证：`pnpm --filter @prompthub/web start` 可成功启动
- 增加最小健康检查 smoke

#### A2. 补齐核心 API

按优先级：

1. folders
2. skills
3. settings
4. ai proxy
5. media
6. sync
7. import/export

#### A3. 服务层整理

- `auth.service.ts`
- `prompt.service.ts`
- `folder.service.ts`
- `skill.service.ts`
- `settings.service.ts`
- `media.service.ts`
- `ai-proxy.service.ts`
- `sync.service.ts`

---

### Phase B — 建立 Web 前端壳子

目标：让 `apps/web` 不只是 API，而是一个浏览器可打开的应用。

#### B1. 技术方向

推荐默认方案：

- 保留 Hono 作为后端 API
- 在 `apps/web` 内新增 `src/client/` 或 `src/frontend/` 作为 React 前端
- 使用 Vite 构建浏览器端
- 与现有 `packages/shared` 复用类型

#### B2. 最小可用页面

第一批页面：

1. 登录页
2. App Layout（侧边栏 + 主内容区）
3. Prompt 列表页
4. Prompt 编辑页
5. Folder 管理页
6. Settings 页

#### B3. 前端基础设施

- React Router
- Zustand（可复用 desktop 的状态设计思路，但不能依赖 `window.api`）
- i18n 初始化（7 locale）
- API client 层（fetch 封装 + JWT）
- 错误提示 / loading / 空状态

---

### Phase C — 迁移 desktop 现有 UI 能力

目标：尽量复用已有交互与视觉，而不是重做一套陌生产品。

#### C1. 可复用的内容

- 组件结构与视觉风格
- i18n 文案 key
- Prompt / Skill / Folder 的业务交互模式
- Settings 页面结构

#### C2. 必须替换的内容

- 所有 `window.api.*`
- Electron 专属行为
- 本地文件系统访问
- 原生对话框 / 平台安装能力

#### C3. 推荐迁移顺序

1. Layout
2. Prompt list + editor
3. Folder tree
4. Settings
5. Skills
6. AI workbench

---

### Phase D — 自部署能力完善

目标：让用户能真正部署和使用。

#### D1. 交付物

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- 首次启动说明
- 数据目录规范

#### D2. 配置项

- `PORT`
- `HOST`
- `DATA_DIR`
- `JWT_SECRET`
- `ALLOW_REGISTRATION`
- 日志级别

#### D3. 部署验证

- 本地 Node 启动
- Docker 启动
- Docker 挂载卷持久化
- 浏览器访问与登录

---

### Phase E — 与 desktop 的同步闭环

目标：让 `apps/web` 真正成为云端同步源。

#### E1. 数据兼容

- 对齐 `BackupData`
- 对齐 `SyncManifest`
- 对齐 images / videos / versions / skills 数据格式

#### E2. 验证场景

1. desktop 上传到 web
2. web 下载到 desktop
3. manifest 变化检测
4. 冲突情况下 newer wins

---

## 4. 里程碑定义

### M1 — API 可运行

- `apps/web` 可启动
- auth / prompts / folders / skills / settings 可用
- typecheck + lint + tests 通过

### M2 — 浏览器最小可用

- 能登录
- 能看 Prompt 列表
- 能创建/编辑/删除 Prompt
- 能管理 Folder

### M3 — 核心功能对齐 desktop

- Skills 管理
- Settings 管理
- AI 请求转发
- Media 管理

### M4 — 可自部署交付

- Docker 一键启动
- 文档清晰
- 数据持久化 OK

### M5 — 可作为同步源

- desktop ↔ web 同步打通

---

## 5. 下一步执行建议（按顺序）

### Immediate Next

1. 修复 `apps/web` 启动问题（最高优先级）
2. 完成 `folders` API
3. 完成 `skills` API
4. 完成 `settings` API

### Then

5. 为 `apps/web` 增加 React 前端壳子
6. 先做登录页 + Prompt 列表页 + Prompt 编辑页
7. 再接 folders / settings / skills

### Finally

8. Docker 化
9. sync 打通
10. 端到端自部署验证

---

## 6. 风险与注意事项

### 风险 1：当前 `packages/db` 更偏 desktop 语义

需要继续确认：

- 是否还有 Electron 假设
- 是否还有 Node ESM 兼容问题
- 是否所有共享类型都适合 Web API 输出

### 风险 2：不要把 `apps/web` 再做成“纯 API 项目”

从现在开始，命名和实现都要围绕：

> `apps/web` = **自部署网页版 PromptHub**

而不是“server side helper”。

### 风险 3：前端复用不要直接复制 `window.api` 依赖

必须先抽离出 API client 层，再迁移页面逻辑。

---

## 7. Done 定义

`apps/web` 被认为“基本完成”，至少要满足：

- 浏览器可访问
- 可注册/登录
- Prompt / Folder / Skill / Settings 核心 CRUD 可用
- AI 请求可用
- Docker 可部署
- 能作为 desktop 同步源

在这之前，都只能叫“实施中”。

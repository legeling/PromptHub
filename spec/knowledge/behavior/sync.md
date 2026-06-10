# Sync Spec

## Purpose

本规范定义 PromptHub 的稳定同步语义，包括 WebDAV、自部署 Web 作为同步/恢复目标、以及内部同步契约边界。

## Stable Requirements

### 1. Sync Contract

- 同步必须围绕可恢复的数据对象或稳定数据布局进行，而不是依赖临时 UI 状态。
- 不同同步后端可以不同，但用户可见的同步语义必须保持一致：连接验证、上传、下载、恢复、周期同步。
- 同步 provider 稳定联合类型为：`manual | webdav | self-hosted | s3`。
- 桌面端可以同时启用多个备份目标用于手动上传、下载与恢复，但自动同步在任一时刻只能由一个 `syncProvider` 驱动，避免多源竞争写入。
- 桌面端数据设置中的云备份导航应使用 provider 导向命名，并直接显示每个 provider 是否已启用。
- 对 `webdav` push/pull 的编排必须通过路由/页面外的 orchestrator 服务完成，避免在入口层直接堆叠远端流程细节。

### 1.1 Stable Web Sync Response Shape

- Web `sync` 主操作接口（`PUT /sync/data`、`POST /sync/push`、`POST /sync/pull`）必须返回统一 `summary` 对象，包含：
	- `prompts`
	- `folders`
	- `rules`
	- `skills`
- 为保持兼容，可同时返回历史字段（例如 `promptsImported` / `promptsExported`），但 `summary` 作为统一消费入口。
- Web push/pull 失败路径必须走统一错误映射（当前为 `VALIDATION_ERROR`），并保留可诊断消息（例如连接失败 HTTP 状态、payload 非法原因）。
- WebDAV 结构化备份必须保持可恢复：`data.json`、`manifest.json`、以及被 Prompt 引用的媒体文件必须一起参与 push/pull；仅 `404` 可视为远端备份缺失并触发 legacy fallback，其他 HTTP 失败必须原样暴露为诊断错误。
- WebDAV structured push must upload referenced media before publishing `data.json` and `manifest.json`; pull must verify `data.json` and media bytes against the manifest hash/size before import can continue.

### 2. Desktop And Web Relationship

- 桌面端可以把自部署 Web 工作区作为备份与恢复目标。
- 面向用户的自部署说明在 `docs/web-self-hosted.md`，内部同步与布局事实在 `spec/`。

### 3. Stable Internal Sources

- Web 与数据布局演进的历史资料保存在 `spec/changes/legacy/docs-08-todo/`。
- 稳定数据布局事实见 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。

## Stable Scenarios

### Scenario: Contributor changes sync semantics

When sync semantics, backup format, or restore logic changes materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/sync/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Contributor adds sync route behavior

When web sync route behavior is changed:

- contributor keeps provider-specific IO in orchestrator service (`apps/web/src/services/sync-orchestrator.ts`)
- contributor preserves response compatibility while maintaining unified `summary`
- contributor validates route contract with unit/integration tests under `apps/web/src/routes/sync.test.ts`

### Scenario: Desktop has multiple backup targets configured

When desktop users enable more than one cloud backup target:

- manual backup, download, and restore actions can remain available for every enabled target
- startup sync, interval sync, and save-triggered sync run only for the selected `syncProvider`
- settings navigation keeps provider-oriented labels and shows which providers are enabled without entering each panel

### Scenario: User needs deployment-level sync guidance

When a user asks how desktop and self-hosted web interact:

- the public operational guide remains in `docs/web-self-hosted.md`
- deeper contracts and change history remain in `spec/`

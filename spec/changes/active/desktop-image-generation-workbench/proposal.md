# Desktop Image Generation Workbench Proposal

## Phase And Status

- Phase: analyze
- Status: ready-for-implementation
- Primary requirement: `FR-IGW-001`
- Exit condition: 产品待确认项已完成决策，且 `FR -> DES -> TEST -> T`
  追踪链通过实现前 Analyze。

## Why

PromptHub 已经支持 image Prompt、参考图、图片生成模型配置和单次生图测试，
但当前能力附着在 Prompt AI 测试抽屉或模型测试流程中。用户无法从一个独立入口
组织长时间、批量化的图片生产工作，也无法把几十张输出作为一个可恢复、可筛选、
可追溯的生成批次管理。

本变更面向已经拥有可复用生图 Prompt 的创作者。典型需求是选择一个已有 Prompt，
配置模型和参考图，一次请求生成几十张图片，在生成过程中持续查看结果，最后完成
筛选、收藏、继续变体和批量导出。

当前实现事实：

- `Prompt.promptType` 已支持 `image`，图片以 `Prompt.images` 文件名数组附着于
  Prompt。
- Prompt AI 测试当前以 `n: 1` 调用图片生成服务。
- 生成结果当前主要支持下载或添加回 Prompt，缺少独立的批次、输出和历史实体。
- 图片文件由 runtime path 下的本地 image assets 目录持有。

因此本次不是新增“能否生图”，而是把已有生图能力提升为独立、批量、持久化的
桌面创作工作流。

## Goals

- 在 Prompts 模块内提供不依赖 Prompt 测试抽屉的独立生图工作台入口。
- 允许用户复用已有 image Prompt 或临时输入 Prompt 发起生成。
- 将“生成几十张图片”表达为一个可观察、可取消、可重试的持久批次。
- 让成功输出在批次执行期间渐进出现，并在应用重开后仍可查看。
- 支持对大量输出进行快速筛选、收藏、复用和批量导出。
- 为每张输出保留足够的生成来源信息，避免 Prompt 后续修改导致历史失真。
- 保持 PromptHub 本地优先、多供应商和用户自带模型配置的产品边界。

## Scope

### In Scope

- Desktop Prompts 二级导航内的独立生图工作台。
- 单个批次生成 1 到几十张图片，并对供应商单请求上限进行内部拆分。
- Prompt、变量、参考图、模型和模型支持参数的配置。
- 持久任务状态、渐进结果、部分成功、取消剩余任务和失败重试。
- 本地作品历史、批次详情、单图详情、筛选、收藏、删除和批量导出。
- 从输出继续生成、用作参考图、复制 Prompt 或关联回 Prompt。
- 数据库、文件系统、IPC/preload/shared contract、备份/恢复和 Web 能力边界设计。

### Out Of Scope

- 公共作品社区、用户投稿、评论、关注、排行榜和推荐流。
- 模型、LoRA 或 ComfyUI 工作流商店。
- 模型训练、在线托管算力和 PromptHub 自营额度系统。
- Photoshop 类高级画布、图层、局部重绘和完整图片编辑器。
- 视频生成工作台。
- 在本轮把 Desktop 专属本地生成工作流伪装成 Web 已支持能力。

## Product Boundary

“工作台”指用户自己的本地创作和作品管理空间，不等同于公共“生图广场”。
公共灵感来源可作为以后独立 change 评估，不能扩大本变更的账户、审核、版权、
对象存储和推荐系统范围。

## Owning Surfaces And Current Sources Of Truth

- Owning app: `apps/desktop`。
- 现有 Prompt 真相源: Prompt workspace 文件；SQLite 提供索引和查询加速。
- 现有图片文件真相源: `packages/core/src/runtime-paths.ts` 解析的本地 image
  assets 目录。
- 现有模型配置真相源: AI workbench settings 与 image-generation route。
- 新批次 manifest 与输出文件位于 `data/` 并作为真相源；`packages/db` 只持有可重建
  索引，共享 contract 由 `packages/shared` 持有。

## Risks

- 数十张图片会快速放大本地磁盘、备份和同步 payload。
- 不同供应商对数量、尺寸、质量、参考图和并发限制不同，不能用一个固定参数表
  假装完全兼容。
- 应用退出、网络失败、限流或磁盘写入失败可能造成远端已生成但本地未持久化。
- 如果只保存 Prompt ID 而不保存执行快照，历史将无法解释或复用。
- 如果生成任务编排放进 React 组件，页面卸载或切换模块会破坏任务生命周期。
- 工作台复用 Prompts 模块现有二级导航，并与“收藏”“关系图谱”同级；不在 global
  left rail 增加新的一级模块。

## Rollback Thinking

- 新持久化记录必须通过可回滚的增量迁移加入，不改变现有 Prompt 图片字段语义。
- 旧 Prompt AI 生图测试在新工作台稳定前保持可用；接入复用只能在行为等价后进行。
- 迁移或工作台初始化失败时，现有 Prompt、图片和 AI 设置必须继续可读。
- 删除、取消或重试不得清理仍被其他 Prompt、批次或导出流程引用的文件。

## Decisions Already Confirmed

- 需要一个专门的生图工作台，而不是继续把生图只放在 Prompt 测试入口中。
- 核心场景包括用一个优质 Prompt 批量生成几十张图片。
- 本轮目标是个人创作工作台，不是公共社区产品。
- 工作台位于 Prompts 模块二级导航，与“关系图谱”同级；global left rail 不增加
  独立“生图”模块。Prompt 详情可以携带当前 Prompt 快照跳转到工作台。
- 生成批次和输出独立于源 Prompt 存续；删除源 Prompt 时解除实时关联，但保留执行
  快照和生成资产，除非用户另行显式删除批次或输出。
- 首版单批上限为 100 张，提供 1 / 4 / 8 / 16 / 32 常用选项和 1..100 自定义值。
- 首版一个批次只使用一个模型；跨模型尝试通过复制批次并切换模型完成。
- 首版生图批次、执行记录和生成原图是设备本地资产，不进入 WebDAV、S3、
  self-hosted 或 PromptHub 云端上传 payload。未来会员云空间必须在独立 change 中定义
  entitlement、配额、用户显式选择、删除和恢复语义。

## Product Decisions Pending Confirmation

- None. Future member cloud storage is explicitly out of scope rather than an unresolved
  first-release decision.

## Related Records

- Stable behavior: `spec/knowledge/behavior/desktop.md`
- Prompt boundary: `spec/knowledge/behavior/prompt-workspace.md`
- Data layout: `spec/knowledge/structure/storage-architecture.md`
- Navigation reference: `spec/changes/archive/2026/08/2026-08-18-app-shell-left-rail/`; this change does
  not add or alter a global-rail item.
- Current implementation:
  `apps/desktop/src/renderer/components/prompt/AiTestModal.tsx`,
  `apps/desktop/src/renderer/services/ai.ts`,
  `packages/shared/types/prompt.ts`, `packages/db/src/schema.ts`

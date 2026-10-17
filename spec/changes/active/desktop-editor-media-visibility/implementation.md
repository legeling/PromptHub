# Implementation: desktop-editor-media-visibility

## 实际落地
- 新增 `packages/shared/constants/media-limits.ts`：IMAGE_DOWNLOAD_TIMEOUT_MS/MAX_BYTES(10MB)/MAX_REDIRECTS、MEDIA_SAVE_MAX_BYTES(20MB)、扩展名白名单、MB 视图常量；`constants/index.ts` 导出。
- `apps/desktop/src/main/ipc/image.ipc.ts`：四个限制常量改为从 shared import（行为零变化，消除提示与强制值漂移可能）。
- `EditPromptModal`：文本类媒体区从 More Settings 展开块移到主流程末尾（用户提示词之后）；label 下新增限制 hint。
- `CreatePromptModal`：当前媒体区位于 `showAttributes` 条件块内，沿用 `spec/knowledge/behavior/desktop.md` 的现行信息层级；FR-MEDIA-001 已改为引用该稳定规范。
- i18n：`prompt.mediaLimitHint`（{{local}}/{{remote}} 插值自常量）× 7。

## 偏差
- 原设计"移到用户提示词之后、补充信息折叠组之前"——实际弹窗主区顺序为 基本信息→More Settings→双语→System→User，媒体落在主流程末尾（用户提示词区之后）为最小侵入位置；spec FR-MEDIA-001 已按"主流程内、不依赖 More Settings 展开"修正措辞。
- 既有结构测试 `keeps text prompt reference media inside more settings` 锁定旧行为，按新契约改写为 `shows ... in the main flow without expanding more settings`。

## 验证
- `edit-prompt-modal.test.tsx` 新增结构+hint 用例；弹窗三文件 19 全绿；image.ipc 常量迁移后 desktop typecheck 零错；全套基线对照零新增回归（image-ipc 环境失败与基线一致）。

## 选择图片无反馈修复

`usePromptMediaManager` 的卸载清理将 `isMountedRef` 设为 false，但 effect setup 未恢复它。开发模式 StrictMode 重放 effect 后，文件选择成功也被判定为组件已卸载而直接返回。setup 现在恢复 mounted 标记，真实关闭/卸载时仍拒绝迟到的结果。

验证命令与结果（仓库根目录）：

- `pnpm --dir apps/desktop exec vitest run --project unit tests/unit/hooks/prompt-media-strict-mode.test.ts tests/unit/hooks/use-prompt-media-manager.test.ts tests/unit/components/create-prompt-modal.test.tsx tests/unit/components/edit-prompt-modal.test.tsx --minWorkers=1 --maxWorkers=1`：媒体 hook 20 项通过；首次组件回归因未展开 More Settings 失败，调整操作步骤后用下条命令通过。另有两项既有系统提示词用例仍查找当前表单已移除的正文必填提示，聚合结果未全绿。
- `pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/create-prompt-modal.test.tsx -t StrictMode --minWorkers=1 --maxWorkers=1`：1 项通过，验证真实创建组件的选图预览及提交字段；文件选择/复制桥接使用 mock，不代表文件存储验收。
- `pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-reference-media.spec.ts`：1 项通过。隔离 Electron profile 中通过新建弹窗点击上传、加载预览、创建、刷新并读回图片记录；删除原始 fixture 后读取托管媒体协议，字节与原图一致。仅替换 OS 文件选择框返回值，preload、IPC、复制、预览协议和 Prompt 持久化均为真实实现；未自动操作系统原生选择框。
- 在临时 Vitest workspace 中仅移除 setup 的 mounted 恢复语句，StrictMode 回归出现 2 项预期失败（图片数组实际为空），退出码 1；未修改共享工作区源码，证明回归可捕捉原缺陷。
- `pnpm --dir apps/desktop typecheck`、`pnpm --dir apps/desktop build` 和本次四个源码/测试文件的定向 ESLint 通过。`pnpm --dir apps/desktop typecheck:tests` 仍被无关的 `prompt-batch-action-bar.test.tsx:129` 非法 `exact` 查询选项阻塞。本次测试文件无剩余类型错误。未运行全量发布门禁。

诊断日志与隔离变异配置位于 OS 临时目录 `prompthub-media-fix-8k9bud`，未向仓库根目录写入日志。

## 同类生命周期检查与参考图缩放

- 检查 desktop renderer 与 web client 的 mounted/unmounted、取消与清理标记。另有 6 个 Prompt 组件缺少 effect setup 恢复：`ImportPromptModal`、`QuickAddModal`、`ImagePromptReverseModal`、`PromptQuickRewriteDialog`、`EditPromptModal`、`PromptEditor`。均恢复 mounted 标记，原有关闭/卸载和 session 检查保留。其他已检查的 mounted ref 已在 setup 恢复，无需重复修改。
- `PromptReferenceImages` 复用新建、编辑及独立编辑器的缩略图、移除和预览入口；`ImagePreviewViewport` 为既有 `ImagePreviewModal` 增加 25%–400% 按钮/滚轮缩放、重置及拖动。gallery 顺序不变，切图/重开重置缩放。预览在 capture 阶段处理 Escape/方向键，防止下层表单同步关闭。新文案覆盖全部 7 种语言，不增加依赖或持久化状态。
- `ZoomControls`、`ImagePreviewViewport` 和 `PromptReferenceImages` 的声明式 JSX 保持在各自视图函数内，部分超过 50 行，便于统一检查控件语义与状态绑定；交互行为由 `image-preview-zoom.test.tsx`、`prompt-reference-images.test.tsx`、创建/编辑组件及 Electron 流程覆盖。Electron 用例保留同一创建、复制、刷新、编辑流程，避免拆成有顺序依赖的用例。
- 原创建/编辑测试的两条正文提示文本断言与当前界面不一致，已移除过时文案断言，仍验证空白正文禁用提交、合法正文保存及调用次数。Quick Add 迟到响应测试显式等待 deferred 结果完成后验证未创建，避免 user-event 计时等待掩盖生命周期结果。

本轮验收：

- 受影响组件套件：`pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/image-preview-modal.test.tsx tests/unit/components/image-preview-zoom.test.tsx tests/unit/components/prompt-reference-images.test.tsx tests/unit/components/create-prompt-modal.test.tsx tests/unit/components/edit-prompt-modal.test.tsx tests/unit/components/import-prompt-modal.test.tsx tests/unit/components/quick-add-modal.test.tsx tests/unit/components/image-prompt-reverse-modal.test.tsx tests/unit/components/prompt-quick-rewrite-dialog.test.tsx tests/unit/components/prompt-editor.test.tsx tests/unit/hooks/prompt-media-strict-mode.test.ts tests/unit/hooks/use-prompt-media-manager.test.ts --minWorkers=1 --maxWorkers=1`。最终 12 个文件、98 项全部通过；新增生图协议/替代文本参数回归后，预览相关 17 项再次通过。AI/存储桥接使用测试替身，只证明 renderer 交互、状态和提交合同。
- 临时 workspace 在加载时移除上述 6 处 mounted 恢复语句，6 项正常流程回归全部按预期失败，退出码 1；共享工作区源码未被还原。故障命中导入关闭、生成创建、图片选择、AI 草稿回显和编辑器预览断言。
- `pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-reference-media.spec.ts`：1 项通过。新增验证新建/编辑两个入口、浅色/深色、图片几何尺寸随缩放增大、滚轮、拖动滚动位置、缩小、重置、Escape 关闭后下层表单保留。原选图、托管复制、保存及刷新读回继续通过。OS 选择框仍由测试返回路径；没有调用真实 AI 服务。
- Desktop 源码与测试 TypeScript、全部本次触及的源码/测试定向 ESLint、七语言键检查和 `git diff --check` 通过；桌面生产构建通过。首次全套类型检查遇到的并行生图消费者接口差异已消除，最终复检退出码 0。
- 共享缩放视口接受可选的图片 URL resolver 与替代文本，兼容生图预览消费者；默认仍解析 Prompt 参考媒体。此处只验证协议选择和缩放状态，生图业务验收由其所属主题负责。
- Electron 截图使用普通页面捕获；此环境下禁用动画的截图会等待超时。最终截图在 Playwright 的 `apps/desktop/test-results/` 下，诊断日志与变异配置在 OS 临时目录 `prompthub-media-review-kZBh7X`。未运行全量发布门禁。

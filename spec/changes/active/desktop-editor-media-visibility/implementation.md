# Implementation: desktop-editor-media-visibility

## 实际落地
- 新增 `packages/shared/constants/media-limits.ts`：IMAGE_DOWNLOAD_TIMEOUT_MS/MAX_BYTES(10MB)/MAX_REDIRECTS、MEDIA_SAVE_MAX_BYTES(20MB)、扩展名白名单、MB 视图常量；`constants/index.ts` 导出。
- `apps/desktop/src/main/ipc/image.ipc.ts`：四个限制常量改为从 shared import（行为零变化，消除提示与强制值漂移可能）。
- `EditPromptModal`：文本类媒体区从 More Settings 展开块移到主流程末尾（用户提示词之后）；label 下新增限制 hint。
- `CreatePromptModal`：媒体区核查后确认本已在主流程（无需移动），仅加 hint。
- i18n：`prompt.mediaLimitHint`（{{local}}/{{remote}} 插值自常量）× 7。

## 偏差
- 原设计"移到用户提示词之后、补充信息折叠组之前"——实际弹窗主区顺序为 基本信息→More Settings→双语→System→User，媒体落在主流程末尾（用户提示词区之后）为最小侵入位置；spec FR-MEDIA-001 已按"主流程内、不依赖 More Settings 展开"修正措辞。
- 既有结构测试 `keeps text prompt reference media inside more settings` 锁定旧行为，按新契约改写为 `shows ... in the main flow without expanding more settings`。

## 验证
- `edit-prompt-modal.test.tsx` 新增结构+hint 用例；弹窗三文件 19 全绿；image.ipc 常量迁移后 desktop typecheck 零错；全套基线对照零新增回归（image-ipc 环境失败与基线一致）。

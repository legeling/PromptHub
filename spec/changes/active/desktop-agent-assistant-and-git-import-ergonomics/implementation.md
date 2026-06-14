# Implementation

## Shipped

- 记录了桌面端 `Agent Assistant` 需求边界：它应被设计为自然语言规划 + 受限动作执行的桌面能力，优先复用现有 Skill / Rules / MCP / Prompt 业务能力，而不是模拟点击 UI。
- 优化了 [apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx) 的 Git 仓库导入结果态：
  - Git 导入 modal 从 `max-w-4xl max-h-[90vh]` 扩大为更宽更高的 `w-[min(92vw,1100px)] max-h-[92vh]`
  - 扫描出结果后，不再保留双段大提示块，只保留更紧凑的 fallback 提示
  - 候选结果区改为更明确的主滚动区域，并设置更大的最小可视高度
  - 单个候选卡片压缩了图标尺寸、内边距和描述行数，提升同屏可见项数量
  - Git 仓库地址输入框旁新增了顶部扫描 / 重新扫描按钮，避免用户必须滚到底部才能对新地址重新发起扫描
  - 当仓库地址被修改时，旧扫描结果、旧选择状态和旧导入提示会立即失效，并显示“需要重新扫描”的提示
  - 返回后再次进入 Git 导入模式时，输入框与结果区会回到干净初始状态，不再残留上一次的扫描结果
  - GitHub HTTPS 限流报错会明确提示“稍后重试，或改用 SSH 仓库地址以避免匿名 API 限流”
- 修复了 [apps/desktop/src/main/services/skill-installer.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/services/skill-installer.ts) 的 SSH GitHub 扫描链路：
  - `git@github.com:owner/repo.git` 不再先打 `api.github.com/repos/...`
  - 扫描阶段改为 `git clone --depth 1` 到临时目录后本地解析 `SKILL.md`
  - 生成的 `source_url`、`source_branch`、`canonical_skill_path`、`directory_fingerprint` 继续保持与现有 Git 仓库导入模型兼容
- 更新了 [apps/desktop/tests/unit/components/create-skill-modal.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/create-skill-modal.test.tsx) 的回归测试，锁定新的 modal 尺寸、说明区收口和结果滚动区高度。
- 更新了 [apps/desktop/tests/unit/main/skill-installer.test.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-installer.test.ts) 的回归测试，锁定 SSH GitHub 扫描会走本地 clone 而不会触发远程 API 读取。
- 继续扩展了 [apps/desktop/tests/unit/components/create-skill-modal.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/create-skill-modal.test.tsx) 的回归覆盖，新增仓库地址变更后重新扫描、离开再进入模式重置、以及 HTTPS 限流提示带 SSH 建议的断言。
- 调整了 [apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx) 的当前版本标签展示：当内部 `currentVersion` 仍为 `0` 时，UI 统一按 `v1` 呈现，避免把内部初始计数直接暴露给用户。
- 更新了 [apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx) 和 [apps/desktop/tests/e2e/app.spec.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/e2e/app.spec.ts) 的断言，从 `Current Version v0` 收口到 `Current Version v1`。
- 优化了 [apps/desktop/src/renderer/components/skill/SkillFileEditor.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/components/skill/SkillFileEditor.tsx) 和 [apps/desktop/src/renderer/components/skill/SkillFileEditor.css](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/components/skill/SkillFileEditor.css) 的图片资源预览：
  - 鼠标滚轮在图片预览区内会执行放大/缩小，并阻止外层默认滚动
  - 图片预览区默认显示抓手光标，按住拖动会平移放大后的图片
  - 缩放控件从顶部文件工具栏移动到图片预览区右下角
  - 图片滚动视口与缩放控件浮层分离，拖拽平移图片时右下角控件不会跟随内容移动
  - 右下角百分比/全屏按钮会打开覆盖整个应用的大图预览；全屏预览支持滚轮缩放、抓手拖拽、放大、缩小、重置缩放、`Escape` 退出和关闭按钮退出
  - 顶部工具栏不再显示“Preview / 资源预览”状态文案
  - 图片缩放从 `transform: scale()` 改成调整图片舞台实际尺寸，放大后滚动区域会随图片变大
  - 图片本体不再带额外阴影、圆角或框感，避免带白边图片被渲染成空白卡片
- 更新了 [apps/desktop/tests/unit/components/skill-file-editor.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-file-editor.test.tsx) 的资源预览回归测试，覆盖点击缩放、滚轮缩放、阻止默认滚动、拖拽平移、浮层控件不在滚动视口内、全屏预览和移除 Preview 文案。
- 调整了 [apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx) 的顶部标题：
  - 标题视觉保持不变，但语义上改为按钮
  - 鼠标移动到标题上仍保持默认光标，不显示复制形态光标
  - 点击标题会复制 Skill 名称
  - 成功后显示现有 `Copied` toast，失败后显示复制失败提示
- 更新了 [apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx) 的回归测试，覆盖标题点击复制会写入剪贴板并触发成功反馈。

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/create-skill-modal.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts tests/unit/components/create-skill-modal.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-file-editor.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx -t "copies the skill title"`
- `pnpm --filter @prompthub/desktop exec tsc --noEmit`

## Synced Docs

- 新增 active change 文档：
  - `proposal.md`
  - `design.md`
  - `specs/desktop/spec.md`
  - `tasks.md`

## Follow-ups

- Agent Assistant 后续需要拆出独立执行 change，明确 action schema、IPC contract、会话状态和确认策略。

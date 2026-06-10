# Implementation

## Shipped

- 删除桌面首页旧版单栏切换，固定为新版双栏壳层。
- `App` 与 `Sidebar` 已联动桌面首页模块可见性，并在当前模块被隐藏时自动回退到首个可见模块。
- 修正 `Sidebar` 重新按常量顺序过滤模块导致的顺序回退问题，桌面首页 rail 现在会按用户拖拽后的顺序真实渲染。
- `settings.store` 的 zustand `merge` 现在会规范化同版本 persisted `desktopHomeModules`，
  避免未知模块、重复项或废弃 `desktopHomeLayout` 从 localStorage hydrate 回首页状态。
- 设置页在 `AppearanceSettings` 中改为模块显隐 + 直接拖拽排序，不再提供上移 / 下移按钮。
- 桌面背景图设置改为保留已选图片文件，并通过开启 / 关闭按钮控制桌面壳层是否实际应用背景图。
- 自定义商店主区已移除重复的选中卡片，停用 / 刷新 / 删除操作已收回到右上角编辑弹窗。
- 自定义商店选中态已移除主区重复标题/URL，并为 0 技能状态补充了明确空态提示与引导文案。
- Skill 商店搜索入口已统一到顶部搜索框，移除了商店页内部重复的搜索输入框。
- 商店页技能总数徽标已从右侧操作区移回标题旁，右侧区域只保留刷新 / 编辑等操作。
- `Project Skills` 相关界面已补齐缺失 i18n key，并收口中英混排文案（项目技能、我的技能、打开文件夹、分发等）。
- `Skills / Store / Web Library` 第二轮 i18n 已补齐 `ja / fr / de / es / zh-TW` 中缺失的 `skill.*` 与 `header.searchSkill` key，并清理商店区块、Web Library 区块及若干技能详情相关英文残留。
- 修复 Skill 商店搜索白屏：`SkillStore` 空结果态恢复正确导入 `SearchIcon`，避免 `SearchIcon is not defined` 直接导致渲染崩溃。
- 收口顶部 Skills 搜索交互：在 `my-skills / distribution / store` 视图中，顶部搜索只负责过滤和显示结果计数，不再通过 `Enter / Tab / 上下按钮` 直接打开或切换 Skill 详情；Prompt / Rules 搜索导航行为保持不变。
- 本地 Skill Source e2e 导入与更新回归已切换到真实落库校验，并修正了安装后弹层遮挡导致的后续交互失败。
- desktop Skill 安全扫描已继续收口为 AI-only：`skill-safety-scan` 现在把来源 URL 预检作为真正的阻断前置条件，内部/受限地址会在模型调用前直接拒绝；其余来源与仓库上下文则作为 preflight metadata 提供给 AI 审阅。
- `skill-safety-scan` 的 AI system prompt 已补 canonical finding codes 约束，减少模型输出 code 漂移，保证桌面端安全报告维度统计与 finding 标题本地化继续稳定。
- 修复 `exportAsSkillMd()` 在仅含 frontmatter 且正文为空时错误回退原始 `instructions` 的问题，避免导出时把 frontmatter 再次写入正文。
- `SkillStoreDetail` 的高风险安装测试已对齐当前真实行为：高风险结果先弹确认，再允许用户显式选择继续安装。
- desktop 安全扫描相关 i18n 已移除残留 `static` 文案，并统一改成 “AI 审阅 + 来源预检 + 仓库结构上下文” 语义；新增 blocked source 的用户提示文案。
- web 端安全扫描也已与 desktop 对齐：`scanSkillContentWithAI()` 新增 canonical finding codes 提示、来源 URL 预检、blocked source 早退逻辑；legacy `POST /api/skills/:id/safety-scan` 不再走旧静态扫描，而是复用 skill 记录组装 AI-only 扫描输入，并兼容空 body 返回 `AI_NOT_CONFIGURED`。

## Verification

- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-desktop-workspace.test.ts tests/unit/components/appearance-settings.test.tsx tests/unit/components/settings-page.test.tsx tests/unit/components/sidebar.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-desktop-workspace.test.ts -t "same-version persisted desktop module"` first reproduced the hydrate leak, then passed after the merge normalization.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-desktop-workspace.test.ts -t "sidebar tag section heights"` first reproduced the same-version height hydrate bug, then passed after normalization.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-desktop-workspace.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/sidebar.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-desktop-workspace.test.ts spec/changes/active/desktop-home-layout-controls spec/issues/active/quality.md`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-background-image.test.ts tests/unit/components/appearance-settings.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx tests/unit/components/top-bar.test.tsx tests/unit/components/skill-store-custom-sources.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx tests/unit/components/skill-store-custom-sources.test.tsx tests/unit/components/skill-store-remote.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/skill-safety-scan.test.ts tests/unit/main/skill-installer-export.test.ts tests/unit/main/skill-installer.test.ts tests/unit/components/skill-store-remote.test.tsx --run`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/web test -- src/services/skill-content.service.test.ts src/routes/skills.test.ts src/client/api/endpoints.test.ts --run`
- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/desktop build`
- `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/local-store-source.spec.ts`

## Synced Docs

- 当前 active change 已同步到最终实现。

## Follow-ups

- 继续观察是否需要把新版双栏桌面首页模块配置同步进稳定 `spec/knowledge/behavior/desktop.md`。
- 继续清理非本轮范围内的其他历史英文残留，避免 locale 文件出现跨语言混排。

## 2026-06-10 same-version sidebar tag height hydration

- 发现：`Sidebar` 直接用 `tagsSectionHeight` / `skillTagsSectionHeight` 生成 CSS
  pixel height；拖拽路径会按最小高度夹住，但 current-version localStorage hydrate 不会触发
  旧 `migrate`，且旧迁移只修正了 prompt 标签区低值。坏快照中的负数、非数字或字符串会让
  Prompt / Skill 标签区不可见或产生异常布局。
- 处理：
  - 新增 `normalizeTagsSectionHeight()` 与 `normalizeSidebarTagSectionHeights()`。
  - `setTagsSectionHeight()` / `setSkillTagsSectionHeight()`、zustand `merge` 与 `migrate`
    都复用同一最小高度规范化。
  - 非有限、非数字或小于默认最小高度的值回退到 `DEFAULT_TAGS_SECTION_HEIGHT`。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-desktop-workspace.test.ts -t "sidebar tag section heights"`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-desktop-workspace.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/sidebar.test.tsx`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-desktop-workspace.test.ts apps/desktop/tests/unit/components/sidebar.test.tsx spec/changes/active/desktop-home-layout-controls spec/issues/active/quality.md`

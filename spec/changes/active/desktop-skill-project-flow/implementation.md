# Implementation

## Implemented

- 更新 `apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx`，统一左侧项目栏与右侧项目头部的最小高度，让三栏切换时头部线条保持对齐。
- 调整项目创建弹窗：优先选择项目根目录，根目录变化时自动推导项目名称，并把 `scanPaths` 明确为“额外扫描路径”。
- 新增项目创建后的自动选择与自动扫描流程，创建成功后立即触发 `scanProjectSkills(...)`，减少手动刷新步骤。
- 为项目列表卡片和项目详情头部增加首字母 avatar，在没有真实图标资源时仍能提供稳定识别。
- 更新 `apps/desktop/src/renderer/stores/settings.store.ts`，归一化 `skillProjects.scanPaths`，避免把 `rootPath` 重复保存到额外扫描路径中。
- 更新 `apps/desktop/tests/unit/components/skill-projects-view.test.tsx` 与 `apps/desktop/tests/unit/stores/skill.store.test.ts`，覆盖自动填名、自动扫描与 scan path 归一化行为。
- 同步补齐桌面端 7 个 locale 中与项目流程相关的新文案，避免仅 `en` / `zh` 生效。
- 调整项目级 Skill 详情页：预览态右栏不再复用 `SkillCodePane` 显示 `SKILL.md` 原文，而是改为项目专用操作区；未收录时突出“导入到我的 Skills”，已收录时直接切回正常平台分发面板。
- 保留已收录项目 Skill 在卡片视图中的 `Open in My Skills` / `Distribute` 快捷动作，同时为项目专用右栏与平台分发面板补充标题 fallback，确保测试 mock 环境下也能稳定识别分发态。
- 进一步统一项目 Skills 三栏头部高度与分割线位置，约束项目卡为纵向弹性布局，让底部动作按钮在不同卡片内容长度下保持同一基线；同时把项目详情右栏标题与卡片内容拆开，修正“平台集成”卡片视觉偏高的问题。
- 为项目视图增加静默首扫恢复：首次进入某个项目且当前会话还没有扫描状态时自动触发扫描，不再要求每次手动点击刷新；已缓存的项目扫描结果会保存在 skill store 持久化状态中，并以轻量字段恢复列表与计数。
- 修复 Skills 导航残留详情的问题：切换 `storeView` 时清空 `selectedSkillId`，Sidebar 返回 `我的 Skills` / `项目 Skills` / `收藏` / `待分发` / `商店` 时也会主动清空当前选中；TopBar 只在用户实际输入搜索词时才自动定位第一个结果，不再因为空搜索把页面直接带进首个 skill 详情。
- 修复 Skills 搜索回归：`filterVisibleScannedSkills(...)` 现在会容忍扫描结果中的空文本字段，不再因为 `undefined.toLowerCase()` 崩溃；同时 TopBar 在 Skills 模块下输入搜索词时不再自动跳转并选中首个 skill，避免“搜索把页面带跑”的突兀交互。
- 修复 Skill 商店顶部搜索与商店页主体搜索状态脱节的问题：当 `storeView` 为 `store` 时，TopBar 现在直接读写 `storeSearchQuery`，并基于当前选中的远程源与分类过滤商店条目；`distribution` 则继续沿用本地 Skills 的 `searchQuery`，避免把“分发管理页”错误当成远程商店目录处理。
- 继续补强搜索回归测试：新增 TopBar 对 `my-skills`、`store`、Prompt 搜索导航的覆盖，并新增 SkillStore 搜索框对 `storeSearchQuery` 的绑定测试，避免未来再次出现“输入后自动跳详情”或“顶部搜索与主体列表脱节”的回归。
- 进一步补齐 `distribution` 视图搜索分流测试，确认其仍走本地 Skills 搜索；同时为 Rules 顶部搜索补上 `Tab` 结果导航测试，覆盖 `Enter` 之外的另一条关键键盘路径。
- 同步更新桌面端 About 页面 7 个 locale 的项目说明文案，并刷新中英法德西日繁 README 顶部定位描述，使产品表述统一为 Prompt、Skill 与 Agent 资产的一站式 AI 工具箱，同时继续强调云同步、备份恢复、版本管理与本地优先。
- 修复本地文件夹 Skill Source 的导入/更新链路：`installFromRegistry(...)` 不再只查内置 `registrySkills`，而是统一从 `getRegistrySkillCandidates(...)` 中查找候选项，因此自定义本地 Source 的 “Import to My Skills” 可以真正导入。
- 为本地 Source 新增内容解析分流：当 `RegistrySkill.content_url` / `source_url` 指向本地路径时，安装与更新不再调用仅支持 `http/https` 的 `fetchRemoteContent(...)`，而是直接通过 `readLocalFileByPath(source_url, "SKILL.md")` 读取磁盘最新内容，避免 `invalid URL` / `only allows http/https` 报错。
- 调整 `SkillStoreDetail` 的详情内容优先级：对于本地 Source，详情预览优先显示当前 source 扫描到的最新内容，而不是默认退回已安装副本中的旧 `instructions/content`，从而避免“重加 source 仍看到旧版本”的感知错乱。
- 补充本地 Source 回归测试：新增 store 层测试覆盖“从 cached local source 安装”和“从 cached local source 更新时读取最新本地文件”；新增组件测试覆盖“本地 source 详情优先展示 source 内容而非已安装旧内容”。
- 调整项目导入链路：`从我的技能导入` 弹窗的高级导入设置新增 `复制 / 软连接` 模式选择，并将该模式透传到 `copyRepoByPathToDirectory(...)`；项目内导入我的技能仍保持显式 `Copy Import / Symlink Import`，而 `导入到我的技能` 默认继续使用复制语义。
- 扩展 `skill-installer-repo.copyRepoByPathToDirectory(...)`、preload API 与 IPC 校验，使项目目标目录支持目录软链接导入；同时补充项目页与主进程回归测试，锁住 `mode: "copy" | "symlink"` 的行为。
- 为项目级“从我的技能导入”弹窗补充偏好记忆：全局记住最近一次 `copy / symlink` 选择，并按 `project.id` 记住目标目录与自定义目录；同时为该持久化链路增加幂等保护，避免关闭弹窗时把已保存偏好重置为空值。

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-projects-view.test.tsx tests/unit/stores/skill.store.test.ts`
  - 结果：通过（33/33）
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skill-locale-regression.test.ts tests/unit/components/skill-detail-utils.test.ts tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/services/i18n-init.test.ts tests/unit/stores/settings-language.test.ts`
  - 结果：通过（35/35）
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-projects-view.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/top-bar.test.tsx tests/unit/stores/skill.store.test.ts`
  - 结果：通过（48/48）
- `pnpm --filter @prompthub/desktop lint`
  - 结果：通过
- `pnpm --filter @prompthub/desktop typecheck`
  - 结果：失败（受现有 `src/renderer/components/settings/AISettings.tsx` 与 `src/renderer/services/database-backup.ts` 的类型错误阻塞，非本次改动引入）
- `pnpm --filter @prompthub/desktop build`
  - 结果：通过
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts`
  - 结果：通过（141/141）
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-projects-view.test.tsx`
  - 结果：通过（15/15）
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/services/skill-filter.test.ts --run`
  - 结果：通过（36/36）
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/skill.store.test.ts tests/unit/components/skill-store-remote.test.tsx --run`
  - 结果：通过（47/47）

## Notes

- 聚焦测试中的既有 store 用例会输出两条预期 stderr：一个是 registry 拉取失败时回退缓存，另一个是 `loadSkills` mock 未返回数组时的已知日志。这两条日志未导致测试失败，也不是本次项目流程改动引入的回归。

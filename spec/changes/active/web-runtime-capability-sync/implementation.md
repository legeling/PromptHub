# Implementation

## Status

Complete for the current active checklist.

## Shipped

- `apps/web/src/client/desktop/install-bridge.ts` 已补齐 Prompt 标签桥接方法：`getAllTags()`、`renameTag()`、`deleteTag()`。
- `apps/web/src/client/desktop/install-bridge.ts` 已补齐 `window.api.rules` 的 Web bridge，实现 `list` / `scan` / `read` / `save` / `rewrite` / `addProject` / `removeProject` / `importRecords` / `deleteVersion` 的最小调用面。
- `apps/web/src/routes/rules.ts`、`apps/web/src/services/rule.service.ts`、`apps/web/src/services/rule-workspace.ts` 已补充 project rule 创建/删除接口，打通 Web Rules 主工作台的最小项目规则管理链路。
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx` 已在 Web runtime 隐藏 `Add Project Directory`，避免暴露依赖本地目录选择的 desktop-only Rules 操作。
- `apps/web/src/client/pages/DesktopWorkspace.tsx` 已把 `installDesktopBridge()` 提前到桌面 App 元素创建前同步执行，避免首屏按 desktop runtime 初始化导致 Web 页面入口/能力状态滞后。
- `apps/web/src/client/pages/DesktopWorkspace.test.tsx` 覆盖 Web bridge 必须在复用 desktop renderer 首次渲染前完成安装。
- `apps/web/src/services/skill-content.service.test.ts` 已 mock DNS 解析，分别稳定覆盖公网非可信 source 和内网 blocked source，避免安全扫描单测依赖外部 DNS 状态。
- `apps/desktop/src/renderer/runtime.ts` 已让 Web runtime 保持桌面版 Skill 工作区入口可见，包括 Skill 商店、项目 Skill、Agent Skill、分发状态、平台安装状态和文件页签；Web 仅继续隐藏真正桌面专属的应用更新、数据恢复和窗口控制。
- `apps/web/src/client/desktop/install-bridge.ts` 已补齐 Web 下 agent/platform 相关 bridge 的受限实现，保证桌面同款页面可打开且不会因为浏览器无本地文件系统能力而崩溃。
- `apps/web/src/client/index.css` 不再定义全局 `:root`、`body`、基础字号和通用表单样式，避免覆盖桌面版主题 token 和页面视觉。
- `apps/web/src/client/main.tsx` 已先加载桌面全局样式，再加载 Web 登录/初始化页样式；进入工作区后由桌面 renderer 的样式主导。
- `apps/web/src/client/desktop-runtime-capabilities.test.ts` 覆盖 Web runtime 的桌面页面入口必须保持可见。
- `apps/web/vite.config.ts` 与 `apps/web/vitest.config.ts` 已补齐 `@prompthub/shared/constants` alias，避免 Web 复用 shared constants 时只解析到 types 子目录。
- `apps/web/src/client/pages/Login.tsx`、`apps/web/src/client/pages/Setup.tsx`、`apps/web/src/client/index.css` 已优化验证码区域布局：图片框固定高度、缩小 padding、刷新按钮更紧凑、验证码输入框使用独立轻量样式。
- Web 工作区产品边界已补充为“备份 / 临时浏览工作区”，不承诺替代桌面端本机 Skill / Rules / Agent 分发、软链接或平台配置替换能力。
- `apps/web/src/client/desktop/install-bridge.ts` 已把 Prompt/Folder/Version direct restore bridge 从空实现改为真实 Web API 调用，覆盖 `folder.insertDirect`、`prompt.insertDirect`、`version.insertDirect`、`version.delete`、`prompt.syncWorkspace`。
- `apps/web/src/routes/prompts.ts`、`apps/web/src/routes/folders.ts`、`apps/web/src/services/prompt.service.ts`、`apps/web/src/services/folder.service.ts` 已补充受认证保护的 direct restore 端点，写入 Web SQLite 并同步 Prompt workspace。
- `apps/web/src/client/desktop/install-bridge.test.ts` 已覆盖桌面兼容恢复 bridge 必须映射到真实 Web endpoint。
- `apps/web/src/routes/prompts.test.ts` 已覆盖 direct restore 能恢复 folder、prompt、version，并能删除恢复出的 version。
- `apps/web-cloudflare/src/worker.ts`、`apps/web-cloudflare/src/web-data.ts` 已补齐 Cloudflare Worker 对 `folder.insertDirect`、`prompt.insertDirect`、`version.insertDirect`、`version.delete`、`prompt.syncWorkspace` 的同名 API 兼容。Worker 形态没有本机 workspace，`prompt.syncWorkspace` 为受认证 no-op；direct restore 和 version delete 会真实更新 D1 snapshot。
- `apps/web-cloudflare/tests/web-data-direct-restore.test.ts` 已覆盖 Cloudflare Worker 的 direct restore 数据写入、读取、version 删除和 workspace sync no-op。
- `apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx` 已优化项目 Skill 列表视觉约束：顶部工具区使用固定主操作按钮和图标按钮，列表卡片使用固定内容列 / 操作列，卡片描述区保留稳定高度，并将单列断点收窄到 760px。列表卡片内的打开、查看、导入、分发、删除操作统一为 40px 图标按钮并固定在右下角，避免文字按钮撑乱布局。
- `apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx` 已在打开/返回项目 Skill 详情时显式保持 `projects` 视图并清空旧 `selectedSkillId`，避免从收藏等筛选状态进入后返回到错误页签。
- `apps/desktop/tests/unit/components/skill-projects-view.test.tsx` 已补充项目 Skill 卡片布局断言，锁定固定卡片栅格、操作列对齐和主要按钮尺寸；同时覆盖旧收藏状态下打开/返回项目 Skill 详情仍停留在项目 Skill 视图。
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx` 已移除我的 Skill 顶部旧“扫描本地”图标入口，避免它与库刷新按钮并列造成语义混淆；顶部现在只保留库刷新按钮，用于重新加载 PromptHub Skill 库和平台分发状态，并使用独立 `isRefreshingLibrary` 状态和成功 / 失败 toast，避免被全局 `isLoading` 误触发成无限旋转。
- 本地 Skill 导入统一进入新建 Skill 的“扫描本地”分流：从 Agent 导入跳转 Agent Skill 管理页；选择路径并导入必须先由用户选定 `xxx/skills` 根目录，再执行 `scanLocalPreview([path])`。导入预览弹窗内重扫保留 30 秒超时和错误提示，避免底层路径访问卡住时无限转圈。
- `apps/desktop/src/renderer/components/skill/SkillScanPreview.tsx` 已让重扫结果显式区分成功/失败：成功后清空选择，失败时保留当前选择并停止加载。
- `apps/desktop/src/renderer/i18n/locales/*.json` 已补齐扫描失败、扫描超时、刷新语义说明的 7 语言翻译 key。
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx` 的批量管理按钮在批量模式下保持原位显示，并支持再次点击退出批量模式；批量工具条不再依赖单独的取消按钮作为唯一退出入口。
- `apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx` 已将 Agent Skill 卡片改为更大的信息卡，展示名称、描述、路径、安装方式和标签，并补齐右下角图标操作：打开文件夹、打开已托管的我的 Skill、直接卸载 Agent 目录中的 Skill。
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx` 已在 Agent Skill 入口显示检测到的 Agent 数量，并通过 `filterDetectedPlatforms` 复用平台禁用过滤规则。
- `apps/desktop/src/renderer/components/skill/SkillLibraryImportModal.tsx` 抽取了项目 Skill “从我的 Skill 导入”弹窗；`SkillProjectsView` 继续使用带高级目标设置的版本，`SkillAgentsView` 复用同一弹窗但固定目标为当前 Agent skill 目录，并仅展示复制 / 软链接安装模式。
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx` 与 `SkillAgentsView.tsx` 已为本地扫描、库刷新、Agent 刷新和 Agent skill 扫描补齐成功 toast；失败路径继续走原有错误 toast。
- `apps/desktop/src/renderer/i18n/locales/*.json` 已补齐新增 Agent 导入、Agent 扫描、库刷新和本地扫描成功反馈的 7 语言翻译 key。
- `apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx` 已对齐 Project Skill 与 Agent Skill 的外部 Skill 详情页顶部操作：项目内已追踪 Skill 现在也会显示“在我的 Skill 中打开”，并提供打开来源目录和从项目移除的顶部快捷入口。
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx` 不再把已分发 / 待分发作为 Skill 一级导航入口；它们现在归入我的 Skill 的状态筛选。
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx` 已在我的 Skill 头部增加全部、收藏、已分发、待分发筛选按钮和计数；旧的 `distribution` storeView 会映射为我的 Skill + 已分发筛选，避免升级后状态丢失或空白。
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx` 已继续移除 Skill 左侧的收藏一级入口；收藏现在与已分发 / 待分发一样归入我的 Skill 顶部筛选。
- `apps/desktop/src/main/shell-open-path.ts` 已抽出 `shell:openPath` 打开目录逻辑。普通目录继续直接打开；软链接目录改为在父目录中定位链接本身，避免 Agent Skill 显示 `.cline/skills/...` 却被 Finder 跳转到我的 Skill 仓库真实目标。
- `apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx`、`AgentSkillPreviewSidebar.tsx`、`SkillFullDetailPage.tsx` 已为未托管的 Agent Skill 增加导入到我的 Skill 的卡片操作、详情顶部操作和详情侧栏操作，默认按 copy 导入并复用 `importScannedSkills` 导入边界。
- `apps/desktop/src/renderer/components/skill/AgentSkillDetailActions.tsx` 已抽出 Agent 详情顶部操作，避免继续膨胀已经超过 2,000 行的 `SkillFullDetailPage.tsx`。
- `apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx` 与 `CreateSkillScanSourceChooser.tsx` 已把“扫描本地”拆为两个明确入口：从 Agent 导入会关闭弹窗并进入 Agent Skill 管理页；选择路径并导入会先打开目录选择器，只对用户选择的 `xxx/skills` 根目录执行 `scanLocalPreview([path])`。
- `apps/desktop/src/renderer/runtime.ts` 与 `SkillManager.tsx` 已保持 Web runtime 下 Skill 商店、项目/Agent Skill、分发与文件编辑等 Skill 页面入口的可见能力标记，避免 Web 页面被旧能力守卫强制降级到我的 Skill。
- `apps/desktop/tests/unit/components/skill-agents-view.test.tsx` 已覆盖 Agent Skill 大卡片布局、卡片级快速卸载、复用项目式导入弹窗安装我的 Skill，以及手动刷新 / 扫描 toast。
- `apps/desktop/tests/unit/components/sidebar.test.tsx` 已覆盖 Agent Skill 入口数量显示，并验证禁用平台不会计入数量。
- `apps/desktop/tests/unit/components/skill-projects-view.test.tsx` 已覆盖项目内已追踪 Skill 在详情页可直接打开我的 Skill。
- `apps/desktop/tests/unit/components/sidebar.test.tsx` 已覆盖已分发 / 待分发不再出现在左侧一级 Skill 导航。
- `apps/desktop/tests/unit/components/sidebar.test.tsx` 已覆盖收藏也不再作为 Skill 左侧一级导航出现。
- `apps/desktop/tests/unit/main/shell-open-path.test.ts` 已覆盖软链接目录使用 `showItemInFolder` 定位链接本身，普通目录打开和非目录拒绝路径。
- `apps/desktop/tests/unit/components/skill-agents-view.test.tsx` 已覆盖未托管 Agent Skill 可从卡片导入到我的 Skill，并断言导入使用扫描到的完整 Skill 文件夹路径和 copy 模式。
- `apps/desktop/tests/unit/components/create-skill-modal.test.tsx` 已覆盖本地扫描入口必须先展示 Agent 导入 / 选择路径导入两种选择，Agent 导入会切到 Agent Skill，选择路径导入只扫描用户选择的目录。
- `apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx` 已覆盖批量管理二次点击收起、旧工具栏本地扫描入口已移除、库刷新使用独立 loading 和 toast、我的 Skill 顶部已分发 / 待分发筛选、预览弹窗重扫超时后保留选择和当前 Web runtime 下 Skill 页面入口不再被强制切回我的 Skill。
- `apps/web/src/services/sync-snapshot.ts` 已增加同步 / 导入快照版本兼容 guard：继续接受当前 `web-backup-v2`、历史 `desktop-backup-v1` 和旧数字 `1`，拒绝未来未声明兼容的版本，避免旧 Web 对新版桌面备份做破坏性“尽力导入”。
- `apps/web/src/routes/import-export.test.ts` 已补充旧 Web 读取新桌面快照的前向兼容回归：未知字段会被忽略并导入可理解数据，未知枚举会被 422 拒绝且不污染现有数据；桌面 ZIP 中不支持的快照版本会在写入媒体和记录前被拒绝。
- `apps/web/src/client/desktop/install-bridge.ts` 已修复 Web runtime
  `electron.openPath` fallback：浏览器环境只对严格解析后的 `http:` /
  `https:` 目标调用 `window.open(..., "noopener,noreferrer")` 并返回成功；
  本地路径、`javascript:` 等不支持目标会返回明确失败，避免桌面复用页面误以为本地目录已经打开。
- `apps/web/src/client/desktop/install-bridge.ts` 已修复 Web runtime
  隐藏文件选择器在 `input.click()` 被浏览器或测试环境阻止时的失败边界：
  `selectImage()` / `selectVideo()` 现在会移除临时 file input，并按用户取消处理为空数组，
  不再把底层 click 异常泄漏到桌面兼容 bridge。

## Verification

- `pnpm --filter @prompthub/web exec vitest run src/client/pages/DesktopWorkspace.test.tsx src/client/desktop/install-bridge.test.ts` passed: 2 files, 4 tests.
- `pnpm --filter @prompthub/web exec vitest run src/client/desktop-runtime-capabilities.test.ts src/client/pages/DesktopWorkspace.test.tsx src/client/desktop/install-bridge.test.ts` passed: 3 files, 6 tests.
- `pnpm --filter @prompthub/web exec vitest run src/services/skill-content.service.test.ts` passed: 1 file, 9 tests.
- `pnpm --filter @prompthub/web lint` passed.
- `pnpm --filter @prompthub/web typecheck` passed.
- `pnpm --filter @prompthub/web build` passed.
- `pnpm --filter @prompthub/web exec vitest run src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx` passed: 2 files, 9 tests.
- `pnpm --filter @prompthub/web exec vitest run tests/integration/docker-runtime-deps.integration.test.ts` passed with network access for npm registry.
- `pnpm verify:web` passed with network access for npm registry: 37 test files, 177 tests, plus production client/server build.
- `pnpm --filter @prompthub/web exec vitest run src/client/desktop/install-bridge.test.ts src/routes/prompts.test.ts` passed: 2 files, 10 tests.
- `pnpm --filter @prompthub/web typecheck` passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run` passed: 1 file, 9 tests.
- `pnpm exec playwright test tests/e2e/self-hosted-sync.spec.ts --reporter=line` passed from `apps/desktop`: 2 tests.
- `pnpm --filter @prompthub/web-cloudflare test` passed: 5 files, 7 tests.
- `pnpm --filter @prompthub/web-cloudflare typecheck` passed.
- `pnpm --filter @prompthub/web-cloudflare lint` passed.
- `pnpm --filter @prompthub/web build` passed and regenerated `apps/web/dist/client`, which is the asset directory referenced by `apps/web-cloudflare/wrangler.jsonc`.
- `pnpm test -- tests/unit/components/skill-projects-view.test.tsx --run` passed from `apps/desktop`: 1 file, 17 tests.
- `pnpm test -- tests/unit/components/skill-agents-view.test.tsx --run` passed from `apps/desktop`: 1 file, 9 tests.
- `pnpm test -- tests/unit/components/create-skill-modal.test.tsx --run` passed from `apps/desktop`: 1 file, 10 tests.
- `pnpm test -- tests/unit/components/skill-i18n-smoke.test.tsx --run` passed from `apps/desktop`: 1 file, 22 tests.
- `pnpm test -- tests/unit/components/sidebar.test.tsx --run` passed from `apps/desktop`: 1 file, 21 tests.
- `pnpm test -- tests/unit/main/shell-open-path.test.ts --run` passed from `apps/desktop`: 1 file, 3 tests.
- `pnpm typecheck` passed from `apps/desktop`.
- `pnpm --filter @prompthub/web test -- src/client/desktop-runtime-capabilities.test.ts src/client/desktop/install-bridge.test.ts` passed: 2 files, 6 tests.
- `pnpm --filter @prompthub/web typecheck` passed.
- `git diff --check` passed.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx` passed: 1 file, 21 tests.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/create-skill-modal.test.tsx` passed: 1 file, 10 tests.
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts` passed: 1 file, 21 tests.
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts` passed: 1 file, 20 tests.
- Failure-first:
  `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "unsupported openPath"`
  initially failed because `openPath("/tmp/project")` returned `{ success: true }`
  while opening nothing in the browser runtime.
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts` passed: 1 file, 8 tests.
- `pnpm --filter @prompthub/web typecheck` passed.
- Failure-first:
  `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "cleans up hidden file inputs"`
  initially failed because a blocked `input.click()` rejected `selectImage()`
  instead of behaving like a canceled file picker and cleaning up the hidden
  input.
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts` passed: 1 file, 9 tests.

## Boundary Update

- Self-hosted Web is documented as a backup / temporary browsing workspace. It may expose Prompt, Skill, Rules, Agent, and settings data for visibility, but desktop-local platform writes, symlink management, local AI tool distribution, and replacement flows remain desktop responsibilities.
- Desktop disaster recovery should treat the user data root as the durable snapshot boundary. The current unified data layout centers on `<userData>/data`, while legacy roots such as `prompthub.db`, `skills`, `workspace`, `images`, and `videos` still need compatibility handling.
- Web sync snapshots remain schema payloads, not raw directory mirrors. Cross-version imports are now bounded by explicit snapshot versions; unknown fields are tolerated by schema parsing, while unknown enums and unsupported future snapshot versions are rejected before media or record writes.

## Synced Docs

- None for this active checklist.

## Follow-ups

- Pending.

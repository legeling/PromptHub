# Agent 与资产管理：非 GUI 验收与修复

状态：2026-10-09 tests-only 组合批次新增 14 个不同用例，分批 13 pass / 1 fail；Plugin 子 Skill 正常导入失败，正确断言保留。定向类型、lint、格式通过。此前 48、152、87、692 项为历史证据，不重复累计。完整发布/GUI/真实客户端尚未验收。

## 六项现有功能组合测试（2026-10-09，tests-only）

本轮只新增五个本组 integration 文件并更新本报告，没有修改产品源码、既有测试、共享 helper/config、存储权威或加密实现。以下后缀均以 `release-acceptance-agents-assets-` 开头。

| 文件后缀 | 不同用例 | 实际结果与边界 |
| --- | ---: | --- |
| provider-activation.test.ts | 2 | pass：真实 CoreAIConfigService 文件来源→source/profile/activation preload 与注册 IPC→真实 Codex adapter/DB；首次 backfill 明确 use-profile 后激活；stale 拒绝；实际应用后的 audit 写故障触发真实 rollback，原生字节恢复并重开。未覆盖迁移完成后的 renderer AI 来源选择；keychain 为 synthetic 替身，未联网 |
| mcp-sync.test.ts | 2 | pass：env 选择/缺失项 skipped/运输去敏；JSON/TOML 双目标 needs-sync→一处更新/一处 conflict 保全→重开；settingsApi 持久 skillProjects→preset 推导→项目原生配置及绑定重开。真实 vault，OS keychain 为 synthetic 替身，不启动服务 |
| rule-aliases.test.ts | 3 | pass：built-in 同根不同文件隔离、同 native 文件双身份冲突/use-target、错误策略拒绝及重开；custom 同根按现行合同拒绝并保全记录。使用真实 startup/DB 重开，避免通用 helper 重写 overrides 掩盖持久化 |
| appearance-files.test.ts | 3 | pass：真实 parser/engine/service/IPC 的主题导入/预览/导出字节/apply/restore/delete 重开，命令失败保留 activeThemeId；pet 修改/导出/重复及软链接拒绝/删除重开；坏主题保全。picker 仅选临时目录，native runner 不执行脚本，内置主题为合法 fixture；未验实际发行资源和原生效果 |
| skill-combinations.test.tsx | 4 | 3 pass / 1 fail：真实 preload exposure、stores/actions；商店来源订阅持久化→真实刷新→实际 SkillStore 批量选择/安装回调与 2-success toast→两包完整字节→清空 browser cache/DB 重开；来源失效无新增半成品、既有包和配置保全；package-only create 拒绝保全 Skill/Plugin。Plugin child 正常入口失败 |

当前实现仍有 canonical-files hydration，不表示 foundation 的 SQLite 转换已交付。数据为一个 Provider、两个 MCP 目标/Rule 身份、两个小 Skill、一个完整 Plugin 和各一个 theme/pet，扫描/inventory 为 O(n)，没有新增业务限制、并发或重试。部分生命周期用例超过 50 行以保持操作→字节→重开的因果链；新文件均低于 1,000 行，辅助函数低于 50 行。

### Plugin child Skill 正常入口缺陷

合法完整多能力 Plugin（manifest、child Skill、command、嵌套二进制）导入/扫描成功，但 `usePluginManagerChildAssetActions` → `skill-library-actions.importScannedSkill` 仍先调用 `window.api.skill.create` 并带 `local_repo_path`。当前 Core `createLibrarySkill` 正确拒绝：`Package imports must use the package lifecycle`。正常 `importedCount=1` 在 skill-combinations 第 203 行失败，实际为 0。

正常断言和后续独立包/字节/父包删除/重开断言保留，不 skip、不 expected-failure、不放宽 create 验证。后续修复应使既有 renderer 操作调用现有 package lifecycle；本轮没有修源码。另一个负向用例验证 content-only 创建带包路径时拒绝，既有 Skill/Plugin/来源字节及记录重开保全；它不证明不可达的 copy 阶段回滚。正常导入尚失败，独立库/去重/父包删除后存活断言未运行到。

### 分批命令证据

Vitest 基础命令均为 `pnpm --filter @prompthub/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1`。`-t` 未匹配项只是筛除，不计 pass 或功能 skip；14 为不同用例数，不累计运行次数。

| batch / PID | 结果 |
| --- | --- |
| six-first / 63795 | 五文件首轮 12 fail，均为 fixture/配置前置，非产品红测 |
| six-second / 65900 | 五文件 13 项：9 pass / 4 fixture fail；Provider 2、appearance 3、Rules 前两项、MCP project、商店 unavailable 通过 |
| six-third / 66358 | MCP + skill-combinations，`-t 'imports selected env\|imports Plugin child\|reports a child\|persists local store'`：2 pass / 2 fail / 2 筛除；MCP env/两包商店通过，Plugin 正常正确红测；删除 canonical payload 的原异常 fixture 被替换，不计回滚证据 |
| six-fourth / 68076 | Rules + MCP + skill-combinations，`-t 'same native file\|derives a registered\|rejects content-only'`：3 pass / 6 筛除，同 native 路径、持久项目配置闭环、package-only guard 通过 |
| six-batch-ui / 68667 | skill-combinations，`-t 'persists local store'`：1 pass / 3 筛除；实际组件批量回调、2-success toast、包/重开 |
| six-renderer-final / 68776 | skill-combinations 无筛选：3 pass / 1 正确 fail / 0 筛除，5.99 秒 |
| six-types-accepted / 69048 | Desktop `tsc --noEmit -p <独占临时 config>`：0 诊断；extends 正式 tsconfig.test，include 五文件及正式 vite/global/rehype ambient，复用既有 node_modules symlink |
| six-lint-final / 68953 | Desktop ESLint：最后修改的 MCP/Rules/skill-combinations 0 错误；Provider/appearance 未再修改，沿用此前 0 诊断 |
| six-format-final / 69129 | 五文件 Prettier check 全通过 |

集中修正的测试前置：首次 Provider backfill 需显式字段确认；MCP env 需 synthetic keychain，公开 env 使用去敏占位符、未提供的选择项为 skipped；真实 engine 列表会 seed 内置主题；custom 重根按 identity 合同拒绝，改测 supported built-in alias；Node 24 的 browser cache 使用显式隔离 fixture，cleanup 加 finally；完整 Plugin fixture 补 command；包清单只排除唯一内部 `.canonical-bundle-hash`，并验证其 64 位 hash 形状。初始类型 config 漏项目 ambient、create fixture 漏必填 `is_favorite`，最终补齐（false 明确原默认值，不改变已验语义）；lint 改用正式 Desktop config，hook fixture 改名 `usePluginActions`。不新增源码 shim、不把这些前置错误当产品缺陷。

### 最终指纹与资源

| 测试文件后缀 | SHA-256 |
| --- | --- |
| provider-activation.test.ts | 50851d909b10b2881a75cb937cf2797a596a9be1960902c32595db9310bb7ff9 |
| mcp-sync.test.ts | 10b31f14f5fa9cd83df1e3b05d0283c2b6f31f0c4b9b4dcfef8793091b777901 |
| rule-aliases.test.ts | f755ddd5b1ade93d9958c7df0b2e12abf06ad3037f2668d800caf4977c2314d7 |
| appearance-files.test.ts | d7e1c6a19bbccaf83698ee7ef4218d8dca4821415345e5acc66b14b6d71f36a1 |
| skill-combinations.test.tsx | 814a7ee745ab2f060e5dcc2409b491548f692c11617e340824f7dcd02eb08ecb |

关键未修改源码：skill-library-actions `a7fac42a0a457e4b4ff6a8d1622f0ef28b77bcba3dd4127be92285196b215146`；usePluginManagerChildAssetActions `3e609a76312f7637360cc5a9c2e038d58ebfec6ab22d12c79e521e507df3d525`；Core skills/library-commands `a3f1ffb612515e63924b397f72aff936c586c4852377c242855cfc7bdc720e9f`；SkillStore `dbe25f52c64a7a43a589567063732670af5cda63b99416d896caa4c62a5ef9f4`；共享 skill-runtime `d6725ad2384d80f7db8ef9e36af1f1ce893289fc5bb7c5c9a22d4b58d7b88384`（既有他人改动，本组未编辑）。全量门禁/源码修复由主协调持有。

资源：独占 `prompthub-agent-six-tests-YUruKc`，每条 180 秒/5 MiB 上限，一次一个检查/worker，未使用监听器或 GUI。2026-10-09T06:05:41.606Z 核对 14 个记录进程组均退出后删除整个根目录（1,434 项，包括初始 cleanup 失败留下的两个本组 profile、日志、临时 config、Node cache）；路径不存在，node_modules symlink 未被跟随，用户既有依赖保留。没有遗留服务或端口。五个测试与本报告的所有权释放给主协调，本批不再修改或启动检查。

## Rule 重开、会话操作与 MCP 静态诊断（2026-10-09）

- Rule 所有权：`packages/core/src/canonical-rule-db.ts`、新增 `packages/core/tests/canonical-rule-detached.test.ts` 与 Rules 稳定主题。空 `targetPath` 和 null 项目根是当前 writer 的未部署配对；读取保留身份，先读规范 managed 目录，再考虑历史绑定，找到明确未部署状态即停止。非字符串、null byte、空目标配非空根继续拒绝。无 schema、迁移或新业务兼容模式；扫描 O(n)、仅复用原绑定清单。
- 正式 Core `initDatabase`、bundle writer 与磁盘 SQLite 验证：两次关闭重开后列表/当前正文/两版历史保全，删除及重复删除后不复活；旧绑定分别排在规范目录前后仍不恢复旧部署路径，外部原文件保全；六类非法 placement 启动失败后 bundle 与 workspace 字节保全。首轮新 fixture 缺全域空 catalog，8 项未进入业务；改为正式 shadow writer 后通过。此 fixture 错误不算产品红测。多步正常测试保留同一重开/消费/删除链，长度由该数据生命周期断言需要决定。
- 会话真实入口：agentApi → 注册 conversation/index IPC → 生产 Codex JSONL 分页 reader、AgentConversationService、真实 SQLite。241 条可见消息跨页导出，JSON/Markdown 独立预期与完整磁盘字节一致，工具/system 隐藏记录不导出；token/API_KEY/PASSWORD/secret 字段名保全并屏蔽值，HOME 路径脱敏。preview 使用同一投影；未知 token、错误 digest、篡改 payload 拒绝且无 handoff 行。合法确认的 unavailable/direct-failure/launch-failure 保留 planned→failed 状态及 digest/身份，重开后源 transcript、annotation 和已提交 handoff 一致。
- 保存边界：测试注入的 `saveExport` callback 选择任务临时文件并执行真实 fs 写入，导出内容来自生产服务；main 原生 save dialog/其 writer closure 没有执行。可执行路径解析、OS launch、clipboard、native agent launcher 为显式替身，没有运行真实客户端。当前测试不覆盖 TTL 随时间过期、成功启动、批量/partial 导出、取消或原生写入失败。
- MCP：新增 mcpApi → 注册 IPC → Core health 静态检查；验证命令存在、缺命令、缺 cwd、未解析环境引用、未知 server 拒绝，以及检查不改变记录/文件且重开一致。无效 URL 在规范 create 写入处拒绝并零残留，不向持久库写非法值以测试 health。命令 fixture 为不可执行文件；未执行 stdio 或协议握手。
- 正确产品红测：首轮 JSON 和 Markdown 预期完整 Buffer 均失败，实际分别比预期少 3 字节；`redactText` 的非捕获组却使用 `$1=[REDACTED]`，将 `token` 写成字面 `$1`。源 transcript/metadata 保全断言仍执行。主协调独占 `agent-conversation-service.ts` 改为捕获现有字段名；本组只补回归并复测，不修改该源文件。两格式均转绿，未降低脱敏或精确字节断言。
- Rule 优先顺序的失败能力：任务临时 Vitest transform 仅移除规范目录优先块，`aaa-stale` 在真实 startup 后的 `targetPath: "" / projectRootPath: null` 断言失败（exit 1）；正常源码同用例通过。共享工作树没有回退或变异源码。
- 文档边界：FR-AGENT-071 的版本化导出、顺序和脱敏约定被本批现行入口验证；supporting DES-AGENT-086 中更丰富的 schemaVersion/source/conversation/messages/YAML、partial/batch 设计与当前 flat version/entries 格式仍有差距，已向主协调报告。本批不改导出 schema，不宣称整个支持设计完成。

| 检查 | PID | UTC 起止 | exit | 实际结果 |
| --- | --- | --- | --- | --- |
| Core 首轮 | 41394 | 03:50:47.069–03:50:50.715 | 1 | 已有 3 pass；新 fixture 8 fail，缺 catalog |
| detached fixture 修正 | 41563 | 03:51:29.613–03:51:35.371 | 0 | 8 pass |
| Core scoped types | 41711 | 03:51:52.881–03:51:55.161 | 0 | 0 诊断 |
| 会话与 MCP 首轮 | 41936 | 03:52:04.956–03:52:41.674 | 1 | 33 pass / 3 fail：导出 2 产品红测，health 1 fixture |
| Desktop scoped types | 44265 | 03:58:38.607–03:58:40.637 | 0 | 0 诊断 |
| MCP health 修正 | 44397 | 03:58:53.898–03:58:56.977 | 0 | 1 pass；27 preset 被 -t 筛除，沿用首轮 pass |
| scoped lint | 44501 | 03:59:16.930–03:59:18.447 | 0 | 4 个源码/测试文件 |
| Rule 规范目录优先最终 | 45446 | 04:02:18.492–04:02:24.928 | 0 | 2 文件 12 pass，无 skip |
| 会话最终 | 45571 | 04:02:35.248–04:02:42.709 | 0 | 1 文件 8 pass，无 skip |
| Core scoped types 最终 | 46002 | 04:03:26.815–04:03:28.287 | 0 | 0 诊断 |
| Desktop scoped types 最终 | 46033 | 04:03:28.324–04:03:30.061 | 0 | 0 诊断 |
| scoped lint 最终 | 46063 | 04:03:30.098–04:03:31.100 | 0 | 4 文件 0 错误 |
| 规范优先块变异 | 46138 | 04:04:10.960–04:04:12.294 | 1 | 1 正确业务断言失败 / 8 筛除 |

精确重跑命令（仓库根执行，复用已安装依赖；JSON reporter/outputFile 仅保存检查产物）：

```sh
pnpm --dir packages/core exec vitest run --minWorkers=1 --maxWorkers=1 tests/canonical-rule-db.test.ts tests/canonical-rule-detached.test.ts
pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 tests/integration/release-acceptance-agents-assets-conversation-actions.test.ts tests/integration/release-acceptance-agents-assets-mcp.test.ts
pnpm exec eslint --config apps/desktop/eslint.config.mjs packages/core/src/canonical-rule-db.ts packages/core/tests/canonical-rule-detached.test.ts apps/desktop/tests/integration/release-acceptance-agents-assets-conversation-actions.test.ts apps/desktop/tests/integration/release-acceptance-agents-assets-mcp.test.ts --max-warnings 0
```

最终 tsc 命令为 `pnpm --dir packages/core exec tsc --noEmit -p <owned-temp>/core.json` 及 Desktop 对应 `desktop.json`。Core scope extends 现有 core tsconfig，明确包含 source 与两个 Rule 测试；Desktop scope extends tsconfig.test，明确包含两新增 integration、renderer globals 和传递依赖。未跑全量 types/build/harness；此前 152 项未重复执行。

| 最终文件 | SHA-256 |
| --- | --- |
| packages/core/src/canonical-rule-db.ts | 366a315bbfdc1b0bdc94fabaf578ced27e0367aace6d2091f245c09aa9c98a48 |
| packages/core/tests/canonical-rule-detached.test.ts | 4da6acf02d556fa50887dde18a18524c7dced3b990f98ffb51a1ee324dff107d |
| apps/desktop/tests/integration/release-acceptance-agents-assets-conversation-actions.test.ts | 064ad91de8cbb3af6f9b58ab748c7b46a420214f48744c1c8dffab44b0778fd4 |
| apps/desktop/tests/integration/release-acceptance-agents-assets-mcp.test.ts | b738293d96c184e0437b4230c95eac0eb2e878be231935f7da4292baa0a940d8 |
| spec/knowledge/behavior/rules-workspace.md | cfd724c9efa80ced926d1555f7edffb49867fdff325f64ac7d12f35bd99aca73 |

主协调的导出修复源 hash 为 `f2f82299feb025348b36f86c7e7f0c52e737607785ebae178c64064f7eec4d6b`。Data D5 的完整恢复 4/4 已由主协调计划合并，使用此前 Rule hash `781c1a0e...`；该证据不声称后来规范目录优先源 hash 已执行完整 ZIP。本组不重复数据组范围；最终组合候选门禁由主协调持有。

资源：唯一任务根 `prompthub-agent-oct9-uXkMm1`，每个检查由前台父进程限定 300 秒、单 worker、记录 PID/退出码，TMPDIR 隔离，HOME 未改，无端口/常驻服务。2026-10-09T04:07:27.412Z 确认 13 个 runner 子进程组均无存活成员，删除任务根全部 39 个产物（日志、JSON、临时配置、缓存及依赖软链接），未跟随链接删除真实依赖。四个 TS 文件最终 Prettier 与 git diff --check 通过；主协调导出源与本组 Rule 源 hash 在收尾未变。未提交、推送、修改用户环境或遗留测试进程。

## 真实入口补齐：Provider、会话索引、Plugin 子 MCP（2026-10-04）

本批只新增三个本组 integration 测试，扩展独占授权的 skill-runtime Electron 运输替身，并修正一个既有组件用例标题及本报告；没有修改产品服务、存储合同、其他组共享文件或提交 Git。正式测试由 Desktop integration project 自动发现。

- Provider：agentApi → registerAgentProviderProfileIPC → 生产 createAgentProviderRuntime/profileService → 当前真实 DB/文件；验证创建、mapping 替换、复制独立身份、归档过滤、无密钥导出、删除及两次重开。过期 updatedAt、非法 mapping 输入失败后，唯一已提交 Profile 和 mapping 完整保留。未调用供应商或原生客户端。
- 会话：agentApi → registered conversation/index IPC → 生产 reader/index service → 临时 Claude JSONL 与真实 SQLite；验证未启用时只读、不落索引，启用扫描、原文读取、索引搜索、metadata 修改/重开，以及删除后的原文、metadata 和 index 一致性。扫描第一个 progress 事件通过 cancel IPC 中止第二轮；旧索引与扫描状态均不变，解除订阅后重试成功，重开仍有两条记录。无 sleep、扫描 mock 或 DB mock。
- Plugin：pluginApi 注册入口导入完整多能力包，子 MCP handler 使用生产 createDesktopMcpLibraryService；嵌套正常配置导入、无效空白 command 进入 failedFiles、重复名称进入 skipped。通过 mcpApi 写入临时 Cursor 原生配置，核对正文、稳定 ID、重开消费和删除，源完整包 inventory 不变。该本地导入流程未复现数据组 D5 ZIP 恢复中的 Plugin bundle ID/目录编码冲突，不表示 D5 已修复；未触碰 canonical-plugin-library.ts 或其测试。
- 隔离运输：固定 sender id，真实 EventEmitter 提供 send/on/once/removeListener；invoke 携带 sender，双向 payload structuredClone。reopen/dispose 发 destroyed、清空 sender/renderer listeners 和 handlers；home 隔离断言、canonical startup、真实 DB/文件均保留。safeStorage 禁用加密，意外 encrypt/decrypt 立即报错。会话用例仅在当前测试期间清空 CLAUDE_CONFIG_DIR，结束恢复。
- 五条用例是顺序生命周期验收，单个用例长于 50 行以保留同一资源从创建到重开/失败/删除的因果关系；辅助函数均小于 50 行，新文件均小于 1,000 行。数据量为 2 条会话、2 个 Provider 和 1 个小型 Plugin；文件 inventory 与扫描为线性，未加入并发/重试或业务限制。

### 最终验证

新增 5/5；旧集成 147/147，本批最终合计 152 条用例，重跑不重复累计。共享 helper 的所有现有直接消费者（14 文件）均纳入；这是 helper 影响范围验证，不重复上一批 60 文件单元检查。最终 scoped TypeScript 使用四个改动 TS 文件、renderer 声明和传递依赖，0 诊断；ESLint max-warnings=0、Prettier check、git diff --check 通过。没有运行全局 typecheck、build、release harness、GUI 或真实账户/付费模型。

| 检查 | UTC 开始 → 结束 | exit |
| --- | --- | --- |
| new-tests | 2026-10-04T10:27:36.946Z → 2026-10-04T10:27:47.739Z | 1 |
| scoped-types | 2026-10-04T10:27:38.165Z → 2026-10-04T10:27:48.467Z | 2 |
| scoped-lint | 2026-10-04T10:27:39.410Z → 2026-10-04T10:27:44.821Z | 0 |
| new-tests-imports | 2026-10-04T10:28:07.742Z → 2026-10-04T10:28:29.086Z | 1 |
| scoped-types-imports | 2026-10-04T10:28:08.998Z → 2026-10-04T10:28:20.335Z | 0 |
| plugin-fixture | 2026-10-04T10:29:04.431Z → 2026-10-04T10:29:12.434Z | 1 |
| lint-final | 2026-10-04T10:29:05.840Z → 2026-10-04T10:29:08.821Z | 0 |
| plugin-contract | 2026-10-04T10:30:05.717Z → 2026-10-04T10:30:11.328Z | 0 |
| types-final | 2026-10-04T10:30:36.830Z → 2026-10-04T10:30:43.989Z | 0 |
| plugin-lint-final | 2026-10-04T10:30:38.031Z → 2026-10-04T10:30:42.334Z | 0 |
| helper-regressions | 2026-10-04T10:27:54.430Z → 2026-10-04T10:32:07.262Z | 0 |

执行命令：

`pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 <列出的测试文件> --reporter=json --outputFile=<临时结果文件>`

`pnpm --dir apps/desktop exec tsc --noEmit -p <临时 scoped tsconfig>`

`pnpm exec eslint --config apps/desktop/eslint.config.mjs <本批四个 TS 文件> --max-warnings=0`

`pnpm exec prettier --check <本批四个 TS 文件>`

| 旧集成文件 | 最终 pass/total |
| --- | --- |
| agent-settings-workflow.test.ts | 3/3 |
| antigravity-skill-migration.test.ts | 8/8 |
| prompt-preferences-workflow.test.ts | 2/2 |
| release-acceptance-agents-assets-custom-agents.test.ts | 2/2 |
| release-acceptance-agents-assets-git.test.ts | 1/1 |
| release-acceptance-agents-assets-mcp.test.ts | 27/27 |
| release-acceptance-agents-assets-packages.test.ts | 3/3 |
| release-acceptance-agents-assets-platforms.test.ts | 35/35 |
| release-acceptance-agents-assets-plugins.test.ts | 1/1 |
| release-acceptance-agents-assets-rule-removal.test.ts | 7/7 |
| release-acceptance-agents-assets-rules.test.ts | 23/23 |
| release-acceptance-desktop-release-settings.test.ts | 3/3 |
| release-acceptance-prompts-ai-workflow.test.ts | 15/15 |
| skill-public-workflow.test.ts | 17/17 |

新增用例完整标题：

- persists provider CRUD, mappings, duplication, archive and export through registered IPC and reopen
- rejects a stale provider revision and invalid mappings without losing the committed profile
- reads real transcripts and persists metadata and searchable opt-in index across reopen and deletion
- cancels on real scan progress without committing partial records and retries with subscriptions released
- imports plugin child MCP via IPC, skips duplicate names, reports invalid config and persists native distribution

### 验证中暴露的 fixture 问题和证据边界

1. 初次三个文件的相对 import 多一级，导致 suite 未加载（0 用例），并缺少索引分页 offset；一次性修正后定向类型通过，Provider/会话 4 条通过。此前 ESLint 通过不构成功能证据。
2. Plugin 初始 fixture 只有 manifest/MCP，不满足当前多能力包 inventory；补上 Skill/command 后才进入业务流程。随后未闭合 TOML 字符串被现行宽松解析器当作无可导入 server，未产生预期 failedFiles；最终错误路径使用当前验证合同明确拒绝的空白 command（合法 JSON/MCP 形状）。没有把格式损坏 TOML 的报错处理算作通过，没有为之新增产品兼容。
3. malformed JSON 在识别阶段排除，因此当前断言明确扫描清单只含有效 MCP 形状与无效服务定义；不声称所有损坏 JSON 都进入 failedFiles。若产品要求报告不可识别配置，需要另行确认发现/解析合同。
4. 类型批次的 custom source 计数用例只覆盖当前 `{ skills: [] }`；本批只修正标题和报告，未重复执行。缺 skills 的旧输入、持久化迁移均不被这项通过结论覆盖。

| 本批 TS 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| apps/desktop/tests/integration/helpers/skill-runtime.ts | 217 | d6725ad2384d80f7db8ef9e36af1f1ce893289fc5bb7c5c9a22d4b58d7b88384 |
| apps/desktop/tests/integration/release-acceptance-agents-assets-providers.test.ts | 132 | 543efaffbcb82c66c4a04c165cce029416f1c77b1af5ce91aaf08a15cc06ea64 |
| apps/desktop/tests/integration/release-acceptance-agents-assets-sessions.test.ts | 198 | 7a8f1794d4f30a2848fd22ba477a895f30dfaa0e3ea9952e1695a9438f9d8b7e |
| apps/desktop/tests/integration/release-acceptance-agents-assets-plugin-mcp.test.ts | 113 | a53fe1125cfcdaf666ac3b3dc10d9e00554f732328070d79c650cb412d614567 |

资源：所有检查使用已安装 pnpm/Node 依赖；本任务 wrapper 每条命令 300 秒 deadline、单 Vitest worker、临时目录 prompthub-agent-entrypoints-PSkip9，可追踪 PID/exit；没有监听端口或常驻服务。全部任务命令已退出；2026-10-04T10:32:50.811Z 已删除该临时目录（日志、临时 tsconfig、依赖软链接、Node 编译缓存和 suite 加载失败遗留的 3 个 worker fixture 目录），未删除真实依赖或其他组资源。

## 测试类型合同修复批次（2026-10-04，A1/A2 后续）

主协调已接受 A1/A2 的本地修复边界并复用 87 项结果。本批只修改分配的 60 个既有 Desktop 测试文件，消除原集中日志中 143 项 Agent/Skill/MCP/Plugin/Rule 诊断；没有修改生产接口、共享 helper/config 或新增兼容逻辑。原 Copilot/Kiro/platform-detection fixture 所有权保持，未无理由重复测试。

- 最终合并结果：60 个文件、692 条用例通过，无 skip/todo；其中首轮 681 pass / 11 fail，集中修正后 8 文件 108/108，最后一个 fixture 字段补齐后单文件 6/6。重跑不重复累计。UI 单元用例只证明组件/Mock 合同，不能替代现有真实 IPC/SQLite/完整包验收。
- 定向 TypeScript 最终 0 诊断：临时 tsconfig extends Desktop tsconfig.test.json，include 明确为本批 60 个文件、renderer 声明及传递依赖。未运行全量 Desktop typecheck/build/release harness。
- 本批 60 文件 ESLint 通过；后续仅重跑受影响 8 文件及最后 1 文件，均通过。git diff --check 通过。移除无关格式化差异，没有扩大格式治理范围。
- 覆盖范围修正：skill-store-custom-source-forms 的计数 fixture 已改为当前合同 `{ skills: [] }`，用例名同步改为现行空列表计数；它不再覆盖缺少 skills 字段的旧缓存输入，不能声称该 legacy 场景原样保留。本批未确认此旧缓存存在正式持久化迁移；如需验证旧数据，须在其正式升级/导入迁移边界测试，不向组件添加兼容 props。仅标题和本报告改动，不重复运行该文件。
- Mock 使用生产方法签名和 vi.mocked；废弃字段替换成当前 shared 类型，保留业务断言；翻译测试使用既有 createTestI18n。私有 readManifest spy 改为临时 clone 中的真实 SKILL.md；IPC concrete service fixture 构造真实实例后替换公共方法，未强转服务类。conversation IPC setup 保持集中声明式 fixture（含具体类必要依赖），长于 50 行是为了把同一个运输契约的输入/输出放在一处，由本文件 5 个 IPC 用例覆盖。
- settings-agent-roots 显式测试 legacy localStorage：每例拷贝 settings bridge，删除 rendererPersistence，仅限本例，afterEach 恢复原 bridge；没有改变 canonical 行为或全局默认。
- 首轮 11 条行为失败属于 fixture：AgentSessionsPanel 9 条缺少异步 listConversationMetadata 默认结果或 ToastProvider；AgentsWorkspace 1 条同样缺少异步 metadata；Provider store 1 条由本批误加的 nativeConfig 断言引入，已还原原断言。未发现需要扩大生产修改的失败。
- 检查工具自身的问题单独计入：一次编辑漏逗号导致语法检查失败，随后修正；首次临时 tsconfig 的 typeRoots 使 Vitest/jest-dom 类型无法解析，改用已安装依赖的绝对 types 路径后执行正常类型检查。后续残余 8 条与 1 条 fixture 诊断集中修复，没有压制错误或放宽合同。
- 资源规模：692 条已有单测、临时数据库/KB 级文件，串行单 worker；每个检查由本任务父进程限定 300 秒，日志仅写入任务临时目录，不开端口，不改 HOME，不调用 GUI、真实 Agent/账号/模型。所有检查进程均已正常退出。任务临时目录 prompthub-agent-types-thQqyv（含日志、临时 tsconfig、依赖软链接及 Node 编译缓存）已于 2026-10-04T10:20:41.576Z 清理；清理前无 fixture 残留或任务子进程。

### 类型批次命令证据

| 检查 | UTC 起止 | exit | 结果 |
| --- | --- | --- | --- |
| types-initial | 2026-10-04T10:14:02.171Z → 2026-10-04T10:14:03.909Z | 2 | 1 diagnostics |
| types-batch | 2026-10-04T10:14:26.450Z → 2026-10-04T10:14:28.192Z | 2 | 2 diagnostics |
| types-scoped | 2026-10-04T10:14:59.123Z → 2026-10-04T10:15:10.393Z | 2 | 8 diagnostics |
| types-fixed | 2026-10-04T10:17:24.621Z → 2026-10-04T10:17:38.630Z | 2 | 1 diagnostics |
| types-final | 2026-10-04T10:18:28.997Z → 2026-10-04T10:18:41.014Z | 0 | 0 diagnostics |
| tests-batch | 2026-10-04T10:14:44.375Z → 2026-10-04T10:15:52.567Z | 1 | 60 files / 681 pass / 11 fail |
| tests-fixed | 2026-10-04T10:17:26.065Z → 2026-10-04T10:17:50.796Z | 0 | 8 files / 108 pass / 0 fail |
| tests-final | 2026-10-04T10:18:30.319Z → 2026-10-04T10:18:32.402Z | 0 | 1 files / 6 pass / 0 fail |
| lint-batch | 2026-10-04T10:14:27.682Z → 2026-10-04T10:14:29.279Z | 0 | 0 errors |
| lint-fixed | 2026-10-04T10:17:27.304Z → 2026-10-04T10:17:29.564Z | 0 | 0 errors |
| lint-final | 2026-10-04T10:18:31.625Z → 2026-10-04T10:18:32.975Z | 0 | 0 errors |

工作目录：Desktop tests/tsc 使用仓库 apps/desktop；ESLint 使用仓库根目录。

`pnpm exec vitest run --project unit --minWorkers=1 --maxWorkers=1 <下列文件或受影响子集> --reporter=json --outputFile=<任务临时目录>/tests-*.json`

`pnpm exec tsc --project <任务临时目录>/tsconfig.json --pretty false`

`pnpm exec eslint --config apps/desktop/eslint.config.mjs <apps/desktop/下列文件或受影响子集> --max-warnings 0`

本批文件（均在 apps/desktop/tests/unit/，最终文件清单与 SHA-256 行序合并校验：`a7341210ec5914ee385fe1cb2d1d42da00d10c221e4046018e85db07e907f454`）：

- components: `agent-sessions-panel.test.tsx`, `agents-workspace.test.tsx`, `mcp-batch-deploy-dialog.test.tsx`, `mcp-manager-store.test.tsx`, `plugin-install-error.test.ts`, `plugin-manager-detail.test.tsx`, `plugin-manager-distribution.test.tsx`, `plugin-manager-library.test.tsx`, `plugin-manager-store.test.tsx`, `sidebar-mcp-shell-tags.test.tsx`, `sidebar-skills.test.tsx`, `skill-detail-utils.test.ts`, `skill-file-tree.test.tsx`, `skill-full-detail-async-actions.test.tsx`, `skill-i18n-runtime-export.test.tsx`, `skill-projects-view-import.test.tsx`, `skill-projects-view-overview.test.tsx`, `skill-projects-view-targets.test.tsx`, `skill-safety-i18n.test.ts`, `skill-store-custom-source-forms.test.tsx`, `skill-store-empty-source.test.tsx`, `skill-store-remote-catalog-actions.test.tsx`, `use-agent-session-index.test.tsx`
- main: `agent-codex-provider-migration-service.test.ts`, `agent-config-ipc.test.ts`, `agent-conversation-db.test.ts`, `agent-conversation-ipc.test.ts`, `agent-gemini-provider-adapter.test.ts`, `agent-kimi-provider-adapter-boundaries.test.ts`, `agent-model-provider-adapter.test.ts`, `agent-pi-current-provider-import.test.ts`, `agent-provider-activation-ipc.test.ts`, `agent-provider-migration-ipc.test.ts`, `agent-provider-profile-ipc.test.ts`, `agent-provider-source-service.test.ts`, `agent-qwen-provider-adapter-boundaries.test.ts`, `agent-session-index-ipc.test.ts`, `agent-usage-antigravity-local.test.ts`, `kimi-oauth-token-service.test.ts`, `plugin-library-marketplace.test.ts`, `skill-canonical-file-ipc.test.ts`, `skill-crud-ipc.test.ts`, `skill-installer-install-sources.test.ts`, `skill-installer-platform.test.ts`, `skill-package-lifecycle-canonical.test.ts`, `skill-package-lifecycle.test.ts`
- renderer: `agent-root-paths.test.ts`
- services: `agent-asset-domain-adapters.test.ts`, `agent-rule-platform-coverage.test.ts`, `agent-terminal-launcher.test.ts`, `rule-platform-order.test.ts`, `skill-safety-policy.test.ts`, `skill-scan-status.test.ts`, `skill-source-resolver.test.ts`, `skill-source-update-reconciliation.test.ts`
- stores: `agent-provider.store.test.ts`, `skill-library-crud.test.ts`, `skill-store-install-baselines.test.ts`, `skill-store-source-update-failures.test.ts`, `settings-agent-roots.test.ts`

### 后续真实入口的最小 fixture 方案（历史方案，现已实施）

| 流程 | 真实入口与断言 | 最小隔离设施与需要的所有权 |
| --- | --- | --- |
| Provider Profile | preload agentApi → registerAgentProviderProfileIPC → createAgentProviderRuntime.profileService → 当前 Profile DB；新建/修改 mappings/重复/归档/导出/删除后重开核对数量、字段与 optimistic updatedAt 冲突保全；失败后旧值不变 | 复用已有 skill-runtime 的 startup/DB/home/平台 roots，新增本组专属 integration 文件；Provider runtime 显式传入 encryption，因此无凭据基础 CRUD 可用禁用加密（意外读写直接报错），不必改共享 helper；真实密钥保险库不在此证明范围 |
| session metadata / index / cancel | preload agentApi → conversation/index 已注册 IPC → 实际 AgentConversationDB、AgentSessionIndexDB、原生 transcript reader；临时 Claude JSONL 完成 metadata/edit/search/read/reopen；收到真实 scan progress 时通过 cancel endpoint 取消，核对未提交部分扫描，重试后可重开 | 共享 helper 当前 invoke 使用空 event，缺少 sender 与 renderer on/removeListener。最小新增仅为可复用运输 fixture：独立 EventEmitter sender（id/send/once/removeListener），ipcRenderer on/removeListener 和 dispose 清理；不替换业务服务、扫描、SQLite。需要主协调分配 helper 的这段所有权，或允许本组独立 transport helper；暂不改现有 skill-runtime。CLAUDE_CONFIG_DIR 在用例中清空/恢复，根必须仍为临时目录 |
| Plugin child MCP | preload pluginApi 导入本地完整 Plugin → registered child-MCP handler → createDesktopMcpLibraryService → MCP preload apply target；含嵌套合法配置、一个格式错误配置，核对 imported/skipped/failedFiles、重复导入身份、原生目标文件正文及 reopen | 本组专属 integration 文件；现有隔离 helper 的 Electron mock 需要 safeStorage 形状（禁用加密、意外加解密直接失败），并保留 plugin/mcp 的真实服务。只用无秘密 MCP fixture 与已支持临时目标，检验 secret-free 主路径；需要主协调分配这一最小 Electron mock 扩展，不绕过 canonical startup 或 MCP secret store |

上述三项已在后续真实入口批次补齐；原方案保留用于解释新增测试范围，helper 扩展已获主协调独占授权。完整真实客户端、GUI、真实账户/供应商和发布门禁仍未获得本批验收证据。

## 基线与边界

- 日期：2026-10-04，Asia/Shanghai；实际检查时间见命令记录（UTC，加 8 小时为本地时间）。开始调查约 17:21。
- HEAD：108f375bcd2c3e94c20d93dd619d641b6386b352；Node v26.7.0、pnpm 9.15.0、Vitest 2.1.9，复用已有依赖。
- 第一轮仅交付测试与报告；随后按用户授权修改本组分配的三个 Rules 产品文件及对应测试/稳定文档。未改共享配置、其他报告或他人既有改动；未提交、推送、部署、构建或运行全仓门禁。
- 主机 macOS；不启动 Electron、Playwright、浏览器、原生 Agent，不访问真实用户 profile、Agent 配置、云盘、账号或付费模型。Electron IPC transport/home 是替身，业务处理器、SQLite、包文件操作是真实执行。
- 每批一个 Vitest 进程、单 worker，受任务父进程 180 秒 deadline 管理；临时目录 /tmp/prompthub-assets-acceptance-l54gdC；TMPDIR 仅传给本任务子进程，HOME 未改变。无新增监听端口。
- 读取的契约：AGENTS、README、desktop/core package 与 Vitest 配置、testing-standards、document-routing-rules、总计划、skills/rules-workspace/plugins/cli-agent-management 主题、平台注册/capability 与 Plugin target matrix、foundation FR-FOUNDATION-003。
- 数据所有权：Agent settings 当前 SQLite；Skill/Plugin 包字节位于文件系统。foundation 已要求 SQLite 作为结构化业务真源，但明确记录转换待实施；Rules/Plugin 稳定主题及当前代码仍有 canonical-files/缓存 hydration。下文测试如实记录当前实现，不将旧文件权威解释为目标契约已达成。
- 测试规模：数十个平台注册目标、KB 级完整包、既有 1,200/2,000 文件包和大会话分页 fixture。目标循环为 O(平台数 × 包文件数)，串行执行；没有新建下载、缓存或并发策略。

## 修复批次 A1/A2（2026-10-04）

本批实际执行 9 个测试文件，87 条不同用例均通过。原 A1 红测及 A2 三条失败均转绿，未删断言、skip 或标记预期失败；全局门禁由主协调持有，本批没有重跑全量 typecheck。

### 实际修改

- canonical-rule-db.ts、rules-workspace.ts、经主协调追加授权的 rules-workspace-import.ts：create/hydrate/import 失败清理共用稳定项目 ID 路径函数；已有名称前缀缓存按 _rule.json.id 和实际 managedPath 校验身份，不按目录名猜测。新建时拒绝重复项目 ID，防止覆盖另一目标的绑定。
- 删除集合包括全部已验证属于该 Rule 的缓存、版本及 canonical bundle，复用既有 rule-library publication journal；提交前失败恢复文件与 DB 行，显式重试可成功。外部文件、其他 Rule ID 及无绑定目录不在删除集合。Cursor prompthub.mdc 与 AGENTS.md 使用各自已声明文件名。
- 三个 Agent fixture 初始化/关闭真实隔离 SQLite，未恢复 settings fallback；Copilot/Kiro fixture 同步 archived、providerProfileId 和 adapter.apply 的当前共享合同，去除已不存在的字段。
- 两份既有 Rule 工作区测试更新统一路径预期，故障注入对准 journal 的 rename 边界；设置全部平台的临时根，避免全局扫描访问真实 Agent 目录。原公开规则红测保持不变。
- 稳定主题 rules-workspace.md 补充路径、绑定、重复 ID、删除事务、失败恢复与回滚说明。没有 schema 变化，不改变基础存储重构的权威决策，不新增限流/重试或配置。项目元数据扫描为 O(n)，删除集合与该 Rule 已验证绑定数线性相关。

新增持久测试：

| 文件 | 用例及真实边界 | 结果 |
| --- | --- | --- |
| release-acceptance-agents-assets-rule-removal.test.ts | 7 条：重复 ID 拒绝、历史多绑定及无绑定目录/相似名称保全、Cursor 路径与删除、篡改绑定零副作用、部分删除失败恢复及重试、导入失败清理、missing-project 选择性清理与版本删除重开 | pass |
| release-acceptance-agents-assets-custom-agents.test.ts | 2 条：Settings preload→注册 IPC→SQLite 的自定义 Agent 新建/编辑/禁用/删除，Rules consumer 跟随新根路径且保全旧目标；重复 ID/路径穿越/空字节拒绝后配置及重开保全 | pass |

原 6 个测试文件仍在，新增文件总数现为 8，合计 99 条持久验收用例；本批仅重测受影响部分，没有重复执行不受影响的 Skill/Git/MCP/Plugin 矩阵。当前 87 条修复批次用例由 52 条既有 Rule/Agent 单元测试、23 条原规则集成、7 条新删除集成、3 条 core canonical Rule 测试和 2 条 custom Agent 集成组成，重跑不重复计数。

### 命令与结果

以下命令均由可追踪父进程限定 180 秒执行窗口，Vitest 为单 worker；UTC 加 8 小时为本地时间。首次新回归因 helper 导入顺序导致 home 隔离断言失败，业务未执行；修正为先加载现有隔离 helper 后只重跑该文件，未绕过隔离校验。定向类型检查先暴露 7 处本组诊断，集中修正后为 0。

| 检查 | UTC 起止 | exit | 结果 |
| --- | --- | --- | --- |
| rules-agent-fix | 2026-10-04T09:56:30.062Z → 2026-10-04T09:58:18.292Z | 1 | 75 pass；6 条新增回归因隔离 helper 加载顺序未执行；原 A1 和 A2 已通过 |
| rules-removal-recheck | 2026-10-04T09:59:16.200Z → 2026-10-04T09:59:31.903Z | 0 | 7/7 pass，包含新增重复 ID 回归 |
| canonical-rule-check | 2026-10-04T09:59:45.663Z → 2026-10-04T09:59:47.381Z | 0 | 3/3 pass |
| custom-agents | 2026-10-04T10:00:52.949Z → 2026-10-04T10:00:57.830Z | 0 | 2/2 pass |
| scoped-types | 2026-10-04T10:01:59.406Z → 2026-10-04T10:02:01.489Z | 2 | 7 处诊断，均在本组文件；后续已修正 |
| scoped-types-recheck | 2026-10-04T10:03:43.949Z → 2026-10-04T10:03:45.915Z | 0 | 0 诊断 |
| model-fixture-recheck | 2026-10-04T10:03:58.608Z → 2026-10-04T10:04:03.590Z | 0 | 9/9 pass；按当前类型合同修正 fixture 后复测 |
| scoped-lint | 2026-10-04T10:04:41.876Z → 2026-10-04T10:04:43.134Z | 0 | 10 个本批修改的源码/测试通过 |

实际命令（工作目录与参数）：

```text
rules-agent-fix: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm exec vitest run tests/integration/release-acceptance-agents-assets-rules.test.ts tests/integration/release-acceptance-agents-assets-rule-removal.test.ts tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-workspace-import.test.ts tests/unit/main/agent-platform-detection.test.ts tests/unit/main/agent-copilot-model-config.test.ts tests/unit/main/agent-model-config-kiro.test.ts --minWorkers 1 --maxWorkers 1 --reporter=default --reporter=json --outputFile=/tmp/prompthub-agents-fix-ZNoOqL/rules-agent-fix.vitest.json
rules-removal-recheck: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm test:integration tests/integration/release-acceptance-agents-assets-rule-removal.test.ts --reporter=default --reporter=json --outputFile=/tmp/prompthub-agents-fix-ZNoOqL/rules-removal-recheck.vitest.json
canonical-rule-check: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/packages/core
pnpm exec vitest run tests/canonical-rule-db.test.ts --minWorkers 1 --maxWorkers 1 --reporter=default --reporter=json --outputFile=/tmp/prompthub-agents-fix-ZNoOqL/canonical-rule-check.vitest.json
custom-agents: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm test:integration tests/integration/release-acceptance-agents-assets-custom-agents.test.ts --reporter=default --reporter=json --outputFile=/tmp/prompthub-agents-fix-ZNoOqL/custom-agents.vitest.json
scoped-types: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm exec tsc --noEmit -p /tmp/prompthub-agents-fix-ZNoOqL/tsconfig.json
scoped-types-recheck: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm exec tsc --noEmit -p /tmp/prompthub-agents-fix-ZNoOqL/tsconfig.json
model-fixture-recheck: cwd=/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop
pnpm exec vitest run tests/unit/main/agent-copilot-model-config.test.ts tests/unit/main/agent-model-config-kiro.test.ts --minWorkers 1 --maxWorkers 1 --reporter=default --reporter=json --outputFile=/tmp/prompthub-agents-fix-ZNoOqL/model-fixture-recheck.vitest.json
scoped-lint: cwd=/Users/lingxiaotian/Programs/personal/PromptHub
pnpm exec eslint --config apps/desktop/eslint.config.mjs packages/core/src/canonical-rule-db.ts packages/core/src/rules-workspace.ts packages/core/src/rules-workspace-import.ts apps/desktop/tests/unit/main/rules-workspace.test.ts apps/desktop/tests/unit/main/rules-workspace-import.test.ts apps/desktop/tests/unit/main/agent-platform-detection.test.ts apps/desktop/tests/unit/main/agent-copilot-model-config.test.ts apps/desktop/tests/unit/main/agent-model-config-kiro.test.ts apps/desktop/tests/integration/release-acceptance-agents-assets-rule-removal.test.ts apps/desktop/tests/integration/release-acceptance-agents-assets-custom-agents.test.ts --report-unused-disable-directives --max-warnings 0
```

定向 tsc 使用临时 tsconfig extends apps/desktop/tsconfig.test.json，include 仅本批修改的 10 个 TS 文件、src/**/*.d.ts 及其实际 import 依赖；未修改共享配置。下表也是其 root-file 清单。类型检查覆盖其他导入模块，但不等同于全局测试类型门禁。

| 最终文件 | SHA-256 |
| --- | --- |
| packages/core/src/canonical-rule-db.ts | ae6713a3a13d5ebbbf36c66637cb3a7c2513613ace01010d61dc00ae466b4b73 |
| packages/core/src/rules-workspace.ts | f49fd9a467b6c9e008ffe61aa485e6d290fdc2cd08242a8d742532e3b2433d04 |
| packages/core/src/rules-workspace-import.ts | 44937af9bc085a45d30582a7967868a90280c843eef56b3c660e3a3716a1ba36 |
| apps/desktop/tests/unit/main/rules-workspace.test.ts | d078b9572a945ab43e8e10c09702f22e3541509495fd19c5929f2ddc4a48ba18 |
| apps/desktop/tests/unit/main/rules-workspace-import.test.ts | 3966671a72b1707b984d5f9cf0a037c6159ee9cfd104b3f3439cd64fc999e88c |
| apps/desktop/tests/unit/main/agent-platform-detection.test.ts | 78b425f80372b4accc1f764f44e516bc240d37bdaaba82fb93ebc4a638caa4d1 |
| apps/desktop/tests/unit/main/agent-copilot-model-config.test.ts | 94c2d0fc0ef0ada15a2b7e91a0e936003daf5f53b92fbbd1caffc28310c2f380 |
| apps/desktop/tests/unit/main/agent-model-config-kiro.test.ts | 7be323c313129bfaec1d45c66704f4c3ee26195bcff51b9beddc575d825b1241 |
| apps/desktop/tests/integration/release-acceptance-agents-assets-rule-removal.test.ts | 9747021a42718b59ac4e8196f24fb76ec2c84687fcfbdd8e55fbdb5b6f83fbda |
| apps/desktop/tests/integration/release-acceptance-agents-assets-custom-agents.test.ts | ecea198a6a1d7ad2a45901629f4d865ac81dcc43cef54f04b791714da5e32cf5 |

### 本批资源与交付

2026-10-04 18:06:38（Asia/Shanghai）：本批父进程记录的检查均已退出；临时根 /tmp/prompthub-agents-fix-ZNoOqL 已删除，清理前无残留 fixture 子目录。仅临时 node_modules 符号链接被删除，真实依赖未动。无新增端口/后台服务/浏览器，未修改 HOME 或用户配置，未提交或推送。10 个修改的 TS 文件 Prettier 检查与 git diff --check 均通过。

### 修复批次后的边界（历史建议已完成）

Rules import 失败保全、missing-project cleanup、版本删除、自定义 Agent CRUD，以及随后建议的 Provider CRUD、会话 metadata/index/cancel 与 Plugin child MCP 闭环均已完成本地验证。当前仍未覆盖内容只以“当前剩余覆盖缺口”表为准；不把这些通过结果扩大为 GUI、真实客户端或发布批准。

本批新增测试文件均小于 1,000 行；既有 rules-workspace.ts 净减少代码行。自定义 Agent 生命周期测试保留单用例的 create/edit/disable/delete/reopen 顺序，使同一资产身份及旧外部目标保全断言可被连续观察。

## 第一轮交付与验证结果（修复前历史）

新增 6 个持久测试文件共 90 项，89 pass、1 fail、0 skipped，现有 test:integration 入口实际选中全部六个文件。A1 的 list 和 reopen 两处断言都失败，外部目标正文保全断言通过。未修产品代码，红测未跳过或标成预期失败。

既有 58 文件共 616 项，613 pass、3 fail（A2）；新增 6 文件 90 项，89 pass、1 fail（A1）。两批合计 64 个不同测试文件、706 项用例，702 pass、4 fail；临时脚本重跑次数不加入总数。此分母仅是已执行用例，不是完整功能覆盖率。

功能清单以业务边界计共 37 行：pass=26、unsupported=1、fail=2、not-run=5、blocked=3；每个 pass 仍受该行 mock/未测边界限制。平台注册分母为 37，目录 Skill 本轮覆盖 35，Cherry Studio 独立 fixture 覆盖，Harness 目录 Skill unsupported；MCP preset 27，Rules global entry 21，Plugin target 15。真实原生客户端、GUI、网络账号和完整发布门禁未验收，不能发布。

| 检查 | UTC 起止 | 退出码 | 结果 |
| --- | --- | --- | --- |
| persistent-tests | 2026-10-04T09:41:00.955Z → 2026-10-04T09:42:51.228Z | 1 | 89 pass / 1 fail；约 109 秒 |
| persistent-lint | 2026-10-04T09:43:07.883Z → 2026-10-04T09:43:09.048Z | 0 | 六个新文件通过 |
| persistent-typecheck | 2026-10-04T09:43:16.120Z → 2026-10-04T09:43:33.558Z | 2 | fail；298 诊断、107 文件；本组六个文件无诊断 |

复跑业务用例（repository root）：

```sh
pnpm --dir apps/desktop test:integration release-acceptance-agents-assets
```

只复现 A1：

```sh
pnpm --dir apps/desktop test:integration tests/integration/release-acceptance-agents-assets-rules.test.ts -t 'Rules project'
```

静态检查实际命令：

```sh
pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-agents-assets-git.test.ts tests/integration/release-acceptance-agents-assets-mcp.test.ts tests/integration/release-acceptance-agents-assets-packages.test.ts tests/integration/release-acceptance-agents-assets-platforms.test.ts tests/integration/release-acceptance-agents-assets-plugins.test.ts tests/integration/release-acceptance-agents-assets-rules.test.ts --report-unused-disable-directives --max-warnings 0
pnpm --dir apps/desktop typecheck:tests
```

测试类型检查未通过，不能称为绿色门禁。298 条诊断位于 107 个范围外文件，包含 tests/helpers/window.ts:536（API mock 缺方法）、tests/unit/components/agent-sessions-panel.test.tsx:1299/1303（空 tuple/request 可能 undefined）、tests/unit/stores/settings-ai-models.test.ts（缺 rendererPersistence/apiProtocol），以及当时并行新增 tests/integration/release-acceptance-prompts-ai-workflow.test.ts:251（GenerationErrorSummary 类型）。这些文件不归本组修改，结果是 09:43:33 UTC 的共享工作区快照；未为消除范围外错误重复执行。

本组六个测试的执行后 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| release-acceptance-agents-assets-git.test.ts | 3b6ac20f7bdfd53f391bd643bd0471d67f28ac41f74a6136eae82ee761696ede |
| release-acceptance-agents-assets-mcp.test.ts | f67c06a762ccc468401270c450257b88309706ab76db8e22d2086f902c6d775e |
| release-acceptance-agents-assets-packages.test.ts | 7de8f701eb6b571082bca5b6b66fa5bdf9a16faa4c5d1968aadf0a4342f19b67 |
| release-acceptance-agents-assets-platforms.test.ts | f7a5defaeac7d3cb50e6bf00a4b807bbcfacefcf92d04a655b49c9e88105b992 |
| release-acceptance-agents-assets-plugins.test.ts | b6b1e30cead8e160fc1d973874199a8fd64bee330f42ff65d399e905c7d3362b |
| release-acceptance-agents-assets-rules.test.ts | 4206698d106165392d7075347aef6519e7ddd7db84b876e3b301c6431bf3c52c |

## 结论与缺陷

### A1：项目 Rule 移除后复活（已修复，以下为原始失败证据）

真实入口：rulesApi → 注册 Rules IPC → workspace service → CanonicalRuleDB/真实文件。临时新 profile 正常创建项目、保存、外部修改、use-target 冲突解决、关闭重开均成功；随后 removeProject 返回成功，但 list 和再次 reopen 都重新出现项目。

期望：移除 PromptHub 项目 Rule 记录、托管正文及版本；保留外部项目 AGENTS.md；重扫/重开不恢复记录。

实际：移除后 SQLite 行为 null、data/rules/project%3Aacceptance-project 的文件清单为空，但 cache/rules-workspace/projects/acceptance-project__acceptance-project/AGENTS.md 与 _rule.json 遗留。list 后该项目返回 exists=true、syncStatus=synced，reopen 后仍存在；外部正文仍为 '# External\n'。未观察到外部文件丢失。

复现：apps/desktop/tests/integration/release-acceptance-agents-assets-rules.test.ts 的 'Rules project conflict resolution and detach retain target'。原始与补充诊断运行均失败；第二次增加了删除后 SQLite/文件清单、list/reopen 读回，未改变预期。可用该文件定向 -t 'Rules project' 重跑。

候选原因：packages/core/src/rules-workspace.ts createProjectRule 使用 slug__id 缓存目录；packages/core/src/canonical-rule-db.ts managedPath 使用 id 目录。关闭重开后两种缓存位置共存，removeProjectRule/CanonicalRuleDB.delete 未清完同一已登记项目的旧缓存，扫描重新导入。需要统一当前路径和显式清理受信旧绑定，不能按模糊名称删除用户目录。第一轮未修复；后续修复见本报告前部。

已纳入真实注册 IPC profile 回归；覆盖 create/save/reopen/remove/list/reopen、SQLite 行、canonical bundle、全部已登记缓存路径和外部目标保全。原 rules-workspace.test.ts 的删除用例没有 canonical startup + reopen 组合，不能覆盖本触发条件。

### A2：三个既有用例数据库前置缺失（已修复，以下为原始失败证据）

均报 Database not initialized → readBuiltinAgentOverridesFromSettings → getDatabase：

- apps/desktop/tests/unit/main/agent-platform-detection.test.ts：detects plugin Harness agents by CLI even before the profile root exists。
- apps/desktop/tests/unit/main/agent-copilot-model-config.test.ts：declares the current root and user-owned asset paths。
- apps/desktop/tests/unit/main/agent-model-config-kiro.test.ts：declares current root, assets, config, launch, and partial adapters。

这些用例直接调用现在依赖 SQLite Agent settings 的路径解析，但未初始化数据库；不能直接判断为产品检测失败。补充测试在真实初始化 profile 下调用 detectInstalledPlatforms、隔离文件检测和受控 dsh resolver，成功发现 Harness。Copilot/Kiro 同文件的实际临时配置读写用例通过。建议修复 fixture 前置，保留当前单一设置真源；不能恢复旧 settings fallback 使测试变绿。

### 测试脚本自身修正记录（不计产品缺陷）

- 临时目录直接 pnpm exec 首次因缺少 package manifest 退出，未执行测试；改从现有 desktop package 运行临时 config/workspace，未安装依赖。
- matrix 初版 registry fixture 缺必填 version，62 项在 beforeAll 后跳过；补齐版本后执行。
- matrix JSON 目标读回误把原始字符串传给对象解析 helper，25 个断言失败；原生 JSON 文件本身正确。修正 JSON.parse 后只重跑 MCP 子集，27/27 通过；不重跑已通过的 35 个 Skill 平台。
- supplemental 初版未创建代表已安装 Agent 的空根目录，21 个全局规则 descriptor 按契约不展示；补齐前置目录后 21/21 通过。Plugin rollback 参数误用 id，改为接口规定的数字 version 后通过。项目移除失败未被放宽。

## 功能入口与当前状态

当前主矩阵共 46 项证据边界：pass 39、fail 1、not-run 0、blocked 4、unsupported 2。原六项本地组合现为五项限定边界 pass、Plugin child Skill fail；MCP 握手仍单列 unsupported，P28/D5 采用主协调已合并的数据组证据。分母是业务证据边界，不计算发布通过率。

此表合并各批次已接受结果，替代首轮状态；原始红测和命令保留在历史章节。pass 仅指证据列指定层；not-run 是可继续本地验证的缺口，blocked 是当前 GUI/原生/外部授权或环境边界。152 项结果对应上方源文件指纹和执行时间；随后 Data 组 Plugin 路径迁移的正确性由其迁移验证负责，本次静态核对不构成迁移后重跑。

| 功能 | 真实入口/用例 | 状态 | 证据与未测边界 |
| --- | --- | --- | --- |
| Skill 手工创建、metadata/file 编辑、版本、删除重开 | skill-public-workflow | pass | preload/IPC/SQLite/完整文件；组件交互 blocked |
| 本地完整包安装/更新/二进制保全 | runPackageOperation | pass | inventory、字节、source untouched、reopen |
| 非法名字/路径/空字节/元数据、缺源/缺入口/过期指纹 | 同公开入口 | pass | 失败后文件、版本、DB、重开保全 |
| 35 个目录平台 copy/link/status/uninstall | release-acceptance-agents-assets-platforms | pass | 每个平台实际落盘、symlink realpath、重开、原源字节 |
| Cherry Studio 目录与 SQLite 注册 | cherry-studio-skill-platform | pass | 隔离数据库现代/旧 schema；原生客户端 blocked |
| Harness Skill/MCP/Rules | capability registry | unsupported | 归 Harness Plugin 管理，不是目录型资产 |
| Skill ZIP 导出 | release-acceptance-agents-assets-packages | pass | 解压全 inventory 与精确二进制字节 |
| Skill snapshot rollback | release-acceptance-agents-assets-packages | pass | 修改/新增文件后回滚并重开全清单 |
| 项目 Skill copy/link/冲突 | copyRepoByPathToDirectory | pass | 冲突不改变既有目录，source 保留；项目 GUI blocked |
| 自定义 Git/Gitea 包 | skill-installer-remote-git-package | pass | 本地真实 Git clone 注入 transport；完整嵌套文本/二进制；真 Gitea 鉴权 blocked |
| Skill discovery/断链/目录递归 | skill-installer-discovery | pass | 真实临时目录、断链不隐藏有效包 |
| 来源类型/三方 B-L-R/项目配置规范化 | renderer 纯服务 tests | pass | 纯函数或 mock 边界，非 store/UI 业务验收 |
| Agent settings | agent-settings-workflow | pass | 注册 IPC、SQLite read connection、清空重开 |
| 七个 supported provider adapters | claude/codex/gemini/kimi/grok/qwen/opencode | pass | 临时原生配置读写、错误保全；网络 probe 回调替身 |
| model-only adapters | expanded/pi/kiro/copilot/model-config | pass | 原生文件 fixture；Copilot/Kiro 的 A2 DB 前置已修复并通过 |
| Agent 安装检测用例 | agent-platform-detection + 持久 Rules integration | pass | A2 DB 前置已修复，真实初始化 profile 与受控 resolver 通过；真实本机安装探测仍未验 |
| 全部 supported/partial session adapters | 20 个 session 文件 | pass | 89 cases，临时 transcript/SQLite、列表搜索分页；OpenCode runner 替身 |
| 会话 metadata/index/cancel | agentApi 已注册 IPC | pass | 新批次真实 Claude JSONL、DB/search/read/delete/reopen、进度触发取消保全与重试通过；handoff/resume、实际 launch 和 UI 仍未验 |
| 7 个 usage adapters | usage service/provider/local tests | pass | 纯 mock 网络/文件/keychain/helper，不证明账号实际用量 |
| 原生用量、登录、账号切换、付费 probe | agentApi | blocked | 未获真实账号/付费调用授权 |
| MCP CRUD/市场模板值导入/冲突/部分失败 | CoreMcpLibraryService | pass | 真实文件及库；失败保全；无 MCP 服务进程 |
| 27 个 MCP global presets | release-acceptance-agents-assets-mcp | pass | 每个 apply→原生 JSON/TOML 读回→服务重建→remove |
| MCP workspace/custom scopes | persistence-targets/custom fixture + 新 MCP sync integration | pass | custom 目标及 skillProjects 持久设置→路径推导→项目配置/绑定重开通过，GUI blocked |
| MCP 静态健康诊断 | mcpApi.checkServer/checkAllServers → Core createMcpHealthResult | pass | 真实 IPC 路径/环境诊断与非法 URL 写入拒绝、原记录/文件保全及重开通过；不执行命令或握手 |
| MCP stdio 启动/协议握手 | 当前 Core health 入口无此实现 | unsupported | 不属于既有健康检查合同，不新增握手功能，也不以静态 ok 声称连接成功 |
| 实际远端市场/Gitea/外部 MCP 服务 | 远端导入、鉴权与网络客户端 | blocked | 缺对应外部服务/账户及运行验收证据；本地 fixture 不证明线上兼容或授权成功 |
| 21 个全局 Rule entries | release-acceptance-agents-assets-rules | pass | 注册 IPC、SQLite target metadata、真实正文、reopen |
| 项目 Rule save/conflict/reopen | release-acceptance-agents-assets-rules | pass | 外部更改经 use-target 保留 |
| 项目 Rule remove/失败恢复 | 持久 rules + rule-removal integration | pass | A1 已修复；删除/list/reopen 不复活，受信旧绑定清理、失败回滚/重试、外部目标及无关目录保全 |
| Plugin 本地导入/版本/源更新/回滚/卸载 | release-acceptance-agents-assets-plugins | pass | 完整包字节、重开、source 保全；服务层 |
| Plugin 15 个目标分发合同 | 持久 Plugin integration + distribution tests | pass | 3 enabled 生成/链接/移除；12 disabled 拒绝且无目标写入 |
| Plugin Git source/update | plugin-source-reconciliation | pass | 真实临时 Git 仓库与 command-only 更新；真 SSH/HTTPS blocked |
| Plugin native inventory | plugin-target-inventory | pass | Codex/Claude/Cursor/Gemini/Kiro/Copilot/OMP 等临时原生包扫描 |
| Harness profiles/插件 metadata | deepseek-harness-service | pass | 隔离目录与受控命令 runner；真实 install/update blocked |
| 自定义 Agent CRUD/provider profile CRUD | 已注册 settings/agent IPC | pass | 自定义 Agent 创建/修改根/禁用/删除，Provider CRUD/mappings/复制/归档/导出/过期拒绝及重开通过；appearance/CLI maintenance 仍未验 |
| 会话导出/handoff preview 与拒绝恢复 | agentApi.exportConversation/previewConversationHandoff/continueConversationInAgent | pass | 真实分页 transcript/metadata DB→临时导出精确字节，未知 token/错误 digest/篡改拒绝、planned→failed 及重开保全通过；native save/launch/clipboard 为替身，TTL/成功启动/批量/partial 未验 |
| Provider source/native import 与 activation IPC 组合 | importProviderSource/importCurrentProvider/previewProviderActivation/activateProvider | pass | 文件 owner 来源、真实 runtime/adapter/IPC 计划及确认应用、stale 拒绝、实际 audit 故障 rollback 与重开；renderer 迁移后 AI 来源分支、真实 keychain/联网另未验 |
| MCP 环境导入/target sync/项目 scope 组合 | mcpApi.importEnv/checkTargetSync/syncTargets/apply | pass | synthetic keychain、真实 vault/env/JSON/TOML，双目标变更/冲突/同步重开及持久项目路径闭环 |
| Plugin 内 Skill 导入到独立库 | usePluginManagerChildAssetActions → importScannedSkills → Skill 包入口 | fail | 完整 Plugin 导入/扫描成功；child 操作带包路径 create 被 lifecycle 合同拒绝，count 0≠1；独立包/去重/父包删除重开未运行到 |
| appearance 主题/宠物文件工作流 | agentApi import/export/apply/restoreAppearanceTheme 与 pet 方法 | pass | 真实 parser/服务/IPC 文件字节、错误保全和重开；picker/native runner 为替身，真实生效/发行资源未验 |
| Rules 多 Agent 根路径别名冲突 | rulesApi.list/scan/save/resolveConflict + builtinAgentOverrides | pass | built-in 同根及同 native 文件多身份冲突/解决/重开；custom 重根按现行合同拒绝且保全 |
| Skill 商店/批量/源配置持久工作流组合 | 实际 stores/SkillStore + 临时源/API | pass | 来源持久化→刷新→实际组件批量回调/2-success toast→完整包/清空 cache 重开；unavailable 保全，jsdom 不证明原生 UI |
| Skill 商店/标签收藏/文件树编辑 GUI | renderer 页面 | blocked | 组件与服务用例不替代实际界面交互，当前无 GUI 控制授权 |
| Plugin child MCP 导入闭环 | pluginApi/importChildMcpServers + mcpApi | pass | 完整父包→子 MCP 库→Cursor 临时原生目标→重开→删除通过；Plugin 内 Skill 经既有 Skill 包入口提取的跨库组合及 ZIP 恢复路径不在此结果中；没有独立 child-Skill preload 方法 |
| portable ZIP 完整恢复/跨实体迁移（关联 P28/D5） | downloadSelectiveExport/restoreFromFile + 两次 startup/正常 consumer | pass | Data D5 完整 4/4 及主协调计划已合并，见数据组第五轮；本组未重复执行。当前本组 Rule 规范优先新增源 hash 的完整 ZIP 尚未运行，不覆盖非空 Agent/Generation 或整体 D3 转换 |
| macOS/Windows/Linux 原生 Agent 消费及 GUI | 所有平台 | blocked | 本轮只有 macOS Node fixture；无原生进程/GUI 授权 |

## 当前剩余覆盖缺口

2026-10-05 历史范围纠正：此前将 MCP health 描述为可运行握手是错误判断。主协调复核且本批再次读取 Core 源码确认只有静态诊断；握手单列 unsupported。当时新增诊断入口和会话操作尚未执行，2026-10-09 实跑结果与当前状态见上方。

2026-10-05 报告校准：仅修改本报告，未修改源码、测试、共享或他人文件，未运行测试/构建。152 项及此前批次为已接受的历史实跑证据，本次没有产生新的运行结论。

### 原六项本地组合的当前结果

| 缺口 | 最低有效验证与实际边界 |
| --- | --- |
| Provider source/native import、activation preview/apply/rollback 的 IPC 组合 | 当前文件来源/本地 runtime 边界已通过；真实 keychain/联网和 renderer 迁移后的来源分支另未验 |
| MCP importEnv/target sync、项目 scope 路径闭环 | 双目标同步/冲突和持久项目路径/重开已通过，不执行服务进程 |
| Skill 源配置/批量及项目设置组合 | 本地目录来源保存→刷新→实际 SkillStore 批量回调→完整包/重开已通过；远端/真实客户端/原生 UI 未验 |
| Plugin 包内 Skill 导入组合 | 正常业务入口有正确红测；下一轮源码修复后继续独立包/去重/父包删除/重开断言 |
| appearance 文件工作流 | 临时主题/宠物文件和状态已通过；native 生效、系统选择器、发行 bundled 资源另验 |
| Rules 根路径别名冲突 | built-in 同 native 路径多身份/冲突解决/重开通过，custom 重根拒绝为现行合同 |

上述五项限定边界通过，Plugin 子 Skill 缺陷仍需修复；不批准新的兼容、重试或策略改动。Data 组负责 backup/跨实体恢复/Plugin 路径迁移，完整 build/typecheck/release harness 由主协调统一执行。

### 跨组状态与 P41/P28 边界

P41 已由主协调确认 unsupported：无 window.api.io 消费者，残留 ioApi 缺 main handler，VERSION_DIFF 仅常量且未暴露；不作为本组可推进缺口，不新增 handler，不删除公共 bridge。P41 属 Prompt/AI 的 42 项分母，不重复加入本组计数。P28 的 downloadSelectiveExport/restoreFromFile 完整 portable ZIP 链使用 Data D5 第五轮 4/4 与主协调计划合并证据，当前本组矩阵采用该限定边界的 pass，不从局部包测试或源码修复推断整体迁移完成。

### 当前 GUI、原生和外部边界

- GUI：实际 Electron 页面、商店/详情/编辑器、焦点/弹窗、文件选择器与拖放；当前请求未授权 GUI 自动化。组件单测不等于界面验收。
- 原生：37 平台真实安装检测/加载产物、会话 resume/handoff launch、Harness 实际 install/update、Agent CLI 升级、macOS/Windows/Linux 安装包与原生行为；当前只实跑 macOS Node fixtures，未启动这些客户端。
- 外部：真实登录/账户切换/keychain/供应商用量、付费模型 probe、实际 Git/Gitea/市场/外部 MCP 服务连接；需要对应可用环境及明确授权。公开无凭据网络读取与付费/账户操作不能混为同一权限，本批均未作为线上验收执行。

### Plugin 编码路径变更后的静态核对

已检查本组全部 11 个 integration 文件与 shared helper。没有硬拼 raw local: 或 agent-codex: bundle 目录；plugins 与 plugin-mcp 使用服务返回的 localPackagePath，目标目录使用独立临时平台路径。完整 inventory/二进制字节、稳定 ID、源包保全与重开断言保留；无需替换为 encodeCanonicalResourceDirectory，也没有弱化为存在性检查。本次仅报告调整，不重复 152 项检查；Data 组新编码路径及版本迁移不在本次静态结论中。

## 每个平台的能力声明与证据

以下直接由 packages/shared/constants 的运行值生成。S=supported，P=partial，L=planned，U=unsupported；这是产品声明，不是验收状态。L 的实际功能记 not-run/尚未实现，U 记 unsupported；每个平台真实原生客户端验收均 blocked。
installationPath、configFiles、backupExportImport、secretRuntimeExclusion 对普通平台全部 P；Harness 的 configFiles=L，其余三项 P。所有平台的 backup 真业务由数据组负责；不能从 P 推断已通过。

| 平台 | provider/model | Skill | MCP | Rules | Plugin | Sessions | Usage | Appearance | Launch | CLI | Skill 文件检查 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude | S | P | P | P | P | S | S | U | S | P | pass：copy/link/reopen |
| deepseek-harness | L | U | U | U | P | L | L | U | L | P | unsupported |
| copilot | P | P | P | P | P | P | S | U | L | L | pass：copy/link/reopen |
| cursor | L | P | P | P | P | P | L | U | S | L | pass：copy/link/reopen |
| cherry-studio | L | P | L | L | L | P | L | U | S | L | pass：专用 SQLite fixture |
| doubao | L | P | L | L | L | L | L | U | S | L | pass：copy/link/reopen |
| windsurf | L | P | P | P | L | P | L | U | S | L | pass：copy/link/reopen |
| kiro | P | P | P | P | P | P | L | U | S | L | pass：copy/link/reopen |
| gemini | S | P | P | P | P | S | S | U | L | L | pass：copy/link/reopen |
| antigravity | P | P | P | P | P | P | S | U | S | L | pass：copy/link/reopen |
| trae | L | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| trae-cn | L | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| trae-work | L | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| trae-work-cn | L | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| opencode | S | P | P | P | L | S | L | U | L | P | pass：copy/link/reopen |
| pi | P | P | P | P | P | S | L | U | L | P | pass：copy/link/reopen |
| oh-my-pi | P | P | P | P | P | S | L | U | L | P | pass：copy/link/reopen |
| cline | L | P | P | P | L | P | L | U | L | L | pass：copy/link/reopen |
| codex | S | P | P | P | P | S | S | S | S | P | pass：copy/link/reopen |
| kimi | S | P | P | P | P | S | S | U | L | P | pass：copy/link/reopen |
| reasonix | L | P | P | L | L | S | L | U | L | L | pass：copy/link/reopen |
| augment | L | P | P | P | L | S | L | U | L | L | pass：copy/link/reopen |
| zcode | L | P | P | P | L | L | L | U | L | L | pass：copy/link/reopen |
| grok | S | P | P | P | P | S | S | U | L | L | pass：copy/link/reopen |
| qwen | S | P | P | P | P | S | L | U | L | P | pass：copy/link/reopen |
| kilo | L | P | P | P | L | S | L | U | L | L | pass：copy/link/reopen |
| amp | U | P | P | P | L | L | L | U | L | L | pass：copy/link/reopen |
| openclaw | P | P | P | P | L | S | L | U | L | P | pass：copy/link/reopen |
| copaw | P | P | L | L | L | S | L | U | L | L | pass：copy/link/reopen |
| autoclaw | P | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| nanoclaw | L | P | L | L | L | S | L | U | L | L | pass：copy/link/reopen |
| qclaw | P | P | L | P | L | L | L | U | L | L | pass：copy/link/reopen |
| qoder | P | P | P | P | L | S | L | U | L | L | pass：copy/link/reopen |
| qoderwork | L | P | L | L | L | L | L | U | L | L | pass：copy/link/reopen |
| hermes | P | P | L | P | L | S | L | U | L | L | pass：copy/link/reopen |
| codebuddy | L | P | P | P | L | L | L | U | L | L | pass：copy/link/reopen |
| workbuddy | L | P | P | L | L | L | L | U | L | L | pass：copy/link/reopen |

MCP 预设实际覆盖（27/27 pass）：claude、codex、grok、openclaw、qoder、antigravity、kimi、augment、amp、qwen、pi-shared、pi-agents、pi-agents-nested、pi、oh-my-pi、gemini、opencode、zcode、kilo、cursor、claude-desktop、vscode、windsurf、kiro、cline、workbuddy、codebuddy。registry 的路径声明与可用 MCP preset 不完全相同，未在 preset 的平台不能借用其它平台结果。

全局 Rules 实测 21 个 template；Antigravity 默认与 Gemini 共用 GEMINI.md，不另造 template。自定义覆盖根路径的别名冲突另为 not-run。

| Plugin 目标 | 分类 | 可分发 | 首轮结果 |
| --- | --- | --- | --- |
| codex | native | true | pass：文件生成/链接/移除，native load blocked |
| claude-code | adapter | true | pass：文件生成/链接/移除，native load blocked |
| cursor | adapter | false | unsupported：直接分发；拒绝无写入 pass |
| gemini-cli | adapter | true | pass：文件生成/链接/移除，native load blocked |
| kiro | adapter | false | unsupported：直接分发；拒绝无写入 pass |
| github-copilot | adapter | false | unsupported：直接分发；拒绝无写入 pass |
| qwen | native | false | unsupported：直接分发；拒绝无写入 pass |
| oh-my-pi | native | false | unsupported：直接分发；拒绝无写入 pass |
| opencode | runtime-only | false | unsupported：直接分发；拒绝无写入 pass |
| cline | runtime-only | false | unsupported：直接分发；拒绝无写入 pass |
| windsurf | composite | false | unsupported：直接分发；拒绝无写入 pass |
| roo-code | composite | false | unsupported：直接分发；拒绝无写入 pass |
| cherry-studio | composite | false | unsupported：直接分发；拒绝无写入 pass |
| amp | pending | false | unsupported：直接分发；拒绝无写入 pass |
| zcode | pending | false | unsupported：直接分发；拒绝无写入 pass |

## 实际命令、时间和退出码

以下全部从项目 desktop package 运行；统一 wrapper 与脚本正文见附录。聚合失败不会被局部绿色覆盖。

### public

UTC 2026-10-04T09:24:19.523Z → 2026-10-04T09:24:46.216Z；PID 72010；exit 0；signal null。

```sh
pnpm exec vitest run --project integration tests/integration/skill-public-workflow.test.ts tests/integration/agent-settings-workflow.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  24.90s (transform 899ms, setup 56ms, collect 1.54s, tests 22.71s, environment 0ms, prepare 251ms)

### assets

UTC 2026-10-04T09:25:31.275Z → 2026-10-04T09:25:37.055Z；PID 73197；exit 0；signal null。

```sh
pnpm exec vitest run --project unit tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/main/plugin-library-distribution-import.test.ts tests/unit/main/mcp-library-persistence-targets.test.ts tests/unit/main/agent-model-config-expanded-platforms.test.ts tests/unit/main/skill-installer-export.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  5 passed (5)
      Tests  90 passed (90)
   Duration  4.77s (transform 1.07s, setup 404ms, collect 1.89s, tests 1.35s, environment 482ms, prepare 235ms)

### providers

UTC 2026-10-04T09:28:31.826Z → 2026-10-04T09:28:59.656Z；PID 76776；exit 1；signal null。

```sh
pnpm exec vitest run --project unit tests/unit/main/agent-claude-provider-adapter.test.ts tests/unit/main/agent-codex-provider-adapter.test.ts tests/unit/main/agent-gemini-provider-adapter.test.ts tests/unit/main/agent-kimi-provider-adapter.test.ts tests/unit/main/agent-grok-provider-adapter.test.ts tests/unit/main/agent-qwen-provider-adapter.test.ts tests/unit/main/agent-opencode-provider-adapter.test.ts tests/unit/main/agent-model-provider-adapter.test.ts tests/unit/main/agent-user-config-files.test.ts tests/unit/main/agent-platform-detection.test.ts tests/unit/services/agent-platform-capabilities.test.ts tests/unit/main/cherry-studio-skill-platform.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 149 passed (150)
   Duration  26.14s (transform 2.85s, setup 3.29s, collect 9.49s, tests 7.52s, environment 966ms, prepare 928ms)

### sessions

UTC 2026-10-04T09:29:12.465Z → 2026-10-04T09:29:31.492Z；PID 77118；exit 0；signal null。

```sh
pnpm exec vitest run --project unit tests/unit/main/agent-session-service.test.ts tests/unit/main/agent-session-major-adapters.test.ts tests/unit/main/agent-session-pi.test.ts tests/unit/main/agent-session-oh-my-pi.test.ts tests/unit/main/agent-session-cursor.test.ts tests/unit/main/agent-session-windsurf.test.ts tests/unit/main/agent-session-kiro.test.ts tests/unit/main/agent-session-cline.test.ts tests/unit/main/agent-session-antigravity.test.ts tests/unit/main/agent-session-copilot.test.ts tests/unit/main/agent-session-cherry-studio.test.ts tests/unit/main/agent-session-reasonix.test.ts tests/unit/main/agent-session-augment.test.ts tests/unit/main/agent-session-qwen-pagination.test.ts tests/unit/main/agent-session-kilo.test.ts tests/unit/main/agent-session-copaw.test.ts tests/unit/main/agent-session-nanoclaw.test.ts tests/unit/main/agent-session-qoder.test.ts tests/unit/main/agent-session-hermes.test.ts tests/unit/main/agent-session-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  20 passed (20)
      Tests  89 passed (89)
   Duration  17.88s (transform 751ms, setup 2.15s, collect 1.72s, tests 5.57s, environment 5.22s, prepare 875ms)

### usage-models

UTC 2026-10-04T09:33:03.154Z → 2026-10-04T09:33:11.024Z；PID 78650；exit 1；signal null。

```sh
pnpm exec vitest run --project unit tests/unit/main/agent-usage-service.test.ts tests/unit/main/agent-usage-service-codex.test.ts tests/unit/main/agent-usage-service-providers.test.ts tests/unit/main/agent-usage-service-grok.test.ts tests/unit/main/agent-usage-antigravity-local.test.ts tests/unit/main/agent-usage-contract.test.ts tests/unit/main/agent-model-config-pi.test.ts tests/unit/main/agent-model-config-kiro.test.ts tests/unit/main/agent-copilot-model-config.test.ts tests/unit/main/agent-model-config.test.ts tests/unit/main/agent-deepseek-harness-service.test.ts tests/unit/main/skill-installer-discovery.test.ts tests/unit/services/skill-store-source.test.ts tests/unit/services/skill-source-update-reconciliation.test.ts tests/unit/services/skill-source-resolver.test.ts tests/unit/services/skill-project-settings.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  2 failed | 14 passed (16)
      Tests  2 failed | 223 passed (225)
   Duration  6.99s (transform 666ms, setup 993ms, collect 1.84s, tests 300ms, environment 2.40s, prepare 336ms)

### plugin-extra

UTC 2026-10-04T09:34:06.381Z → 2026-10-04T09:34:09.410Z；PID 79305；exit 0；signal null。

```sh
pnpm exec vitest run --project unit tests/unit/main/plugin-source-reconciliation.test.ts tests/unit/main/plugin-library-validation-versions.test.ts tests/unit/main/plugin-target-inventory.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  3 passed (3)
      Tests  42 passed (42)
   Duration  2.14s (transform 618ms, setup 312ms, collect 1.06s, tests 422ms, environment 0ms, prepare 110ms)

### matrix

UTC 2026-10-04T09:26:26.921Z → 2026-10-04T09:26:27.352Z；PID 74585；exit 1；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --minWorkers 1 --maxWorkers 1 --reporter verbose
```



### matrix-run

UTC 2026-10-04T09:26:41.984Z → 2026-10-04T09:26:44.740Z；PID 75232；exit 1；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  1 failed (1)
      Tests  62 skipped (62)
   Duration  1.82s (transform 752ms, setup 0ms, collect 1.07s, tests 638ms, environment 0ms, prepare 26ms)

### matrix-valid

UTC 2026-10-04T09:27:17.286Z → 2026-10-04T09:27:46.745Z；PID 75837；exit 1；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  1 failed (1)
      Tests  25 failed | 37 passed (62)
   Duration  27.87s (transform 1.23s, setup 0ms, collect 1.87s, tests 25.80s, environment 0ms, prepare 107ms)

### matrix-mcp

UTC 2026-10-04T09:28:08.668Z → 2026-10-04T09:28:20.094Z；PID 76495；exit 0；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts --minWorkers 1 --maxWorkers 1 --reporter verbose -t MCP every
```

 Test Files  1 passed (1)
      Tests  27 passed | 35 skipped (62)
   Duration  10.69s (transform 867ms, setup 0ms, collect 1.21s, tests 9.26s, environment 0ms, prepare 93ms)

### supplemental

UTC 2026-10-04T09:30:14.138Z → 2026-10-04T09:31:19.230Z；PID 77767；exit 1；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts supplemental.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  1 failed (1)
      Tests  23 failed | 4 passed (27)
   Duration  63.61s (transform 774ms, setup 0ms, collect 1.61s, tests 61.73s, environment 0ms, prepare 151ms)

### supplemental-corrected

UTC 2026-10-04T09:32:17.303Z → 2026-10-04T09:32:48.984Z；PID 78437；exit 1；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts supplemental.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose -t Rules|Plugin
```

 Test Files  1 failed (1)
      Tests  1 failed | 22 passed | 4 skipped (27)
   Duration  30.89s (transform 648ms, setup 0ms, collect 919ms, tests 29.86s, environment 0ms, prepare 26ms)

### git-public

UTC 2026-10-04T09:35:04.676Z → 2026-10-04T09:35:08.457Z；PID 80446；exit 0；signal null。

```sh
pnpm exec vitest run --config /tmp/prompthub-assets-acceptance-l54gdC/vitest.config.mts --workspace /tmp/prompthub-assets-acceptance-l54gdC/workspace.mts git-public.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  2.99s (transform 707ms, setup 0ms, collect 1.01s, tests 1.87s, environment 0ms, prepare 26ms)

## 完整入口盘点与未覆盖边界

以下是实际 preload API 方法清单。上文未明确关联的操作一律 not-run，GUI 一律 blocked；API 存在本身不是通过。owner 为 apps/desktop main/preload/renderer，通用工作流 core，存储 db，共享合同 shared。

- skill.ts（64 个声明项）：create、get、getAll、update、delete、scanLocal、scanLocalPreview、scanSafety、saveSafetyReport、installToPlatform、uninstallFromPlatform、getPlatformStatus、export、exportZip、import、getSupportedPlatforms、detectPlatforms、scanPlatformSkills、uninstallPlatformSkill、installMd、uninstallMd、getMdInstallStatus、getMdInstallStatusBatch、getMdInstallStatusDetails、installMdSymlink、fetchRemoteContent、fetchRemoteContentBytes、scanRemoteGithub、listRemoteBranches、saveToRepo、saveRemoteGitToRepo、saveRemoteZipToRepo、runPackageOperation、getRemoteGitPackageFingerprint、getRemoteGitPackageSnapshot、getRemoteZipPackageSnapshot、getLocalPackageFingerprint、getLocalPackageSnapshot、listLocalFiles、readLocalFile、readLocalFiles、readFilesSnapshot、replaceFilesSnapshot、renameLocalPath、writeLocalFile、deleteLocalFile、deleteLocalFileByPath、getLocalPathStatus、createLocalDir、listLocalFilesByPath、readLocalFileByPath、renameLocalPathByPath、writeLocalFileByPath、writeLocalFileBufferByPath、createLocalDirByPath、copyRepoByPathToDirectory、getRepoPath、syncFromRepo、versionGetAll、versionCreate、versionRollback、versionDelete、deleteAll、insertVersionDirect。

- agent.ts（79 个声明项）：listHarnessProfiles、readHarnessProfile、mutateHarnessPlugin、launch、listConfigFiles、readConfigFile、writeConfigFile、listDefinitions、openDefinition、getModelConfig、setModelConfig、addPiProvider、importCurrentPiProvider、updatePiProvider、removePiProvider、addPiModel、updatePiModel、removePiModel、testPiModel、setPiCredential、listSessions、readSession、listConversationMetadata、updateConversationMetadata、deleteConversation、resumeConversation、previewConversationHandoff、continueConversationInAgent、exportConversation、getSessionIndexState、setSessionIndexEnabled、refreshSessionIndex、cancelSessionIndex、onSessionIndexProgress、getUsage、listCodexAccounts、saveCurrentCodexAccount、importCodexAccount、activateCodexAccount、deleteCodexAccount、listProviderProfiles、listProviderSources、importProviderSource、importPiProviderSource、ensureOfficialProviderProfile、getProviderCurrentState、createProviderProfile、updateProviderProfile、archiveProviderProfile、duplicateProviderProfile、exportProviderProfile、deleteProviderProfile、exportManagementBackup、restoreManagementBackup、previewProviderMigration、migrateProviderProfiles、importCurrentProvider、testProviderConnection、testCurrentProviderConnection、testCurrentProviderModel、testProviderModel、cancelProviderModelTest、previewProviderActivation、activateProvider、getAppearance、importAppearanceTheme、applyAppearanceTheme、restoreAppearanceTheme、deleteAppearanceTheme、exportAppearanceTheme、getAppearanceThemePreview、importAgentPet、exportAgentPet、deleteAgentPet、getAgentPetPreview、updateAppearancePet、listAppearancePetStore、installAppearancePetFromStore、getAppearancePetStorePreview。

- mcp.ts（28 个声明项）：getLibrary、replaceLibrary、exportDataFiles、restoreDataFiles、listMarket、listMarketSources、replaceMarketSources、fetchRemoteContent、getTargetPresets、createServer、createFromSource、updateServer、deleteServer、installTemplate、installMarketTemplate、checkMarketUpdate、applyMarketUpdate、preview、apply、remove、removeNames、getTargetStatus、importFile、checkServer、checkAllServers、importEnv、checkTargetSync、syncTargets。

- rules.ts（11 个声明项）：list、scan、read、save、resolveConflict、rewrite、addProject、removeProject、removeMissingProjects、importRecords、deleteVersion。

- plugin.ts（25 个声明项）：getLibrary、exportLibrarySnapshot、restoreLibrarySnapshot、exportDataFiles、restoreDataFiles、listMarket、listMarketSources、previewMarketPlugin、installMarketPlugin、importLocalPluginPackage、previewSourcePlugin、importSourcePlugin、getPluginSourceUpdateStatus、updatePluginFromSource、updatePluginMetadata、distributePlugin、removePluginDistribution、importChildMcpServers、checkInstalledPluginPackage、versionGetAll、versionCreate、versionRollback、versionDelete、deletePlugin、getTargetMatrix。

项目/工作区补充入口：renderer skill-project-settings、SkillProjectsView/ProjectSkillPreviewSidebar；Agent builtinAgentOverrides/customAgents。当前已覆盖自定义 Agent 根路径修改/禁用/删除与重开、项目 Rule 生命周期及公开 Skill copy/link；项目 Skill 设置→发现→部署→重开的完整组合仍 not-run，实际 GUI blocked。

## 持久测试交付与有效性审计（当前）

11 个本组持久测试文件位于 apps/desktop/tests/integration/，统一前缀 release-acceptance-agents-assets-；后续已获授权扩展 helpers/skill-runtime.ts 事件运输及禁用加密接口。A1/A2 修复源码及测试范围见对应批次，测试配置未改。以下为当前文件清单，早期临时脚本和红测命令保留为历史。

| 文件后缀 | 弥补的缺口与业务断言 | Mock / 未测边界 |
| --- | --- | --- |
| platforms.test.ts | 35 个目录平台独立 profile；copy/link 完整清单和二进制、状态、重开、卸载与源包保全 | Electron transport / home；不启动原生客户端 |
| packages.test.ts | ZIP 解压精确文件清单、整包版本回滚后重开、项目 copy/link 与重复冲突保全 | Electron transport / home |
| git.test.ts | 同仓两个多级目录 Skill 精确身份；仅资源更新不串改另一包；缺失目录更新后包与版本保持 | 仅将 Git 远端传输重定向到真实本地 Git，未验 Gitea 鉴权 |
| rules.test.ts | 21 个全局入口正文/metadata/重开；已初始化 profile 的 Harness 检测；项目移除后列表及重开不得复活（原 A1 红测现已通过） | transport/home/受控 CLI resolver |
| mcp.test.ts | 27 个全局 preset apply、真实原生文件读回、运行时关闭重开、移除与库删除 | 服务层；未启动 MCP server/native Agent |
| plugins.test.ts | 本地全包导入/版本/重开/资源更新/回滚/删除；15 目标 enabled 分发、disabled 不写文件 | 服务层；原生消费未验 |
| rule-removal.test.ts | 7 条删除/可信旧绑定/回滚/重试/import 失败/版本清理回归 | 真实 DB/文件；故障注入在文件操作边界 |
| custom-agents.test.ts | 注册 settings IPC 自定义根路径 CRUD/禁用/重开和非法输入拒绝 | Electron transport/home |
| providers.test.ts | 生产 Provider runtime 注册 IPC；2 条完整生命周期及过期/非法输入保全 | 禁用加密，无真实凭据/供应商 |
| sessions.test.ts | 2 条 metadata/index/read/search/delete/reopen、实际扫描事件取消保全与重试 | 原生执行/桌面保存边界 fail-fast，不启动客户端 |
| plugin-mcp.test.ts | 父包→子库→临时原生目标→重开/删除、重复跳过及无效服务错误 | 真实已注册服务；无原生消费/远端服务 |

既有用例审计：skill-public-workflow 和 agent-settings-workflow 已连接 preload、注册处理器、真实磁盘 SQLite 与 reopen，保留复用。remote-git-package 原测试验证解析器和本地包，但缺公开安装更新后的身份与另一包保全，新增 git 流程补齐。rules-workspace 删除测试缺 canonical startup/reopen，新增完整触发链捕获 A1。usage 类测试替换网络、keychain 或本地 runner，只证明适配器合同，不能升格为真实账号用量验收。三个 Agent registry 用例原缺 DB 前置（A2），后续授权修复 fixture 并验证通过，历史失败不再作为当前状态。

断言有效性：文件 inventory 与 fixture 原始字节相等可捕获漏文件/改字节；realpath 和 lstat 可捕获误用复制；两个 Git 包的独立读回可捕获身份串改；失败前后版本与文件清单相等可捕获部分写入；A1 直接以删除后列表、重开列表和外部文件读回判断，不接受当前错误行为。没有通过 mock 预写待测结果；未进行额外变异实验，不能声称已获得除 A1 以外的故障变异证据。

Git 和 Plugin 两条长用例保持单一生命周期叙事，跨步骤必须使用同一用户资产，拆成互相依赖测试会隐藏 reopen/update/rollback 关系；文件均小于 1,000 行。其余 fixture 和用例按领域隔离。每个平台注册用例独立创建、关闭和清理 profile，避免运行顺序依赖。

入口核对：vitest.workspace.ts 的 integration include 覆盖 tests/integration/**/*.{test,spec}.{ts,tsx}；desktop test:integration 被 test:run 与 root harness desktop-integration 使用；tsconfig.test.json 包含 tests/**/*；ESLint 匹配 **/*.{ts,tsx,mts}。各批次均执行定向入口；当前最终证据为新 5 条及受影响旧 147 条通过、scoped typecheck/lint 通过。首轮 90 项与全量 typecheck 范围外失败保留在历史记录，不是当前新批次结论；完整全仓门禁仍由主协调负责。

## 首轮资源清理与交付边界（历史记录）

2026-10-04 17:45（Asia/Shanghai）结束检查：各测试通过 afterEach/dispose 关闭数据库并清理独立 profile；所有任务检查子进程已退出，父进程记录的 PID 85192、86722、86853 均不存在。未启动长期服务、监听器、Electron、浏览器或 MCP server。任务临时根 /tmp/prompthub-assets-acceptance-l54gdC 已删除，包含日志、临时配置、Git fixture、node_modules 符号链接及中间脚本；没有删除真实依赖目录。HOME、用户 Agent/PromptHub 配置和既有进程未改动。仓库仅交付本报告及六个独占测试文件，产品源码和其他对话改动保留；未提交、推送或构建。

新增测试 Prettier 检查通过，git diff --check 退出 0。全量 release harness、GUI、真实客户端和跨系统包验收未运行。本轮可交付测试证据，不能交付发布批准。

### 既有用例执行清单

只保存用例标题与路径，不保存服务日志、密钥或认证内容。

<details><summary>public</summary>

```text
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > creates, edits metadata and files, versions, reopens and deletes a manual Skill 1610ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > clears instructions through update while preserving the package and previous version 1294ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > imports a full directory, distributes copy and symlink, renames, updates and removes it 2037ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a null create payload' and preserves saved data after reopen 1123ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a traversal name' and preserves saved data after reopen 1166ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a numeric description' and preserves saved data after reopen 1147ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a null byte in a name' and preserves saved data after reopen 999ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects relocating a package through …' and preserves saved data after reopen 932ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a string deletion flag' and preserves saved data after reopen 1009ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a parent traversal file write' and preserves saved data after reopen 1243ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a absolute native path file w…' and preserves saved data after reopen 1313ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a absolute Windows path file …' and preserves saved data after reopen 1159ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box write validation > 'rejects a null byte path file write' and preserves saved data after reopen 947ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box package update validation > rejects 'missing source directory' without partial publication 950ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box package update validation > rejects 'traversal package entry' without partial publication 1283ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box package update validation > rejects 'missing SKILL.md' without partial publication 1387ms
 ✓ |integration| tests/integration/skill-public-workflow.test.ts > Skill public functional workflows (real services and persistent storage) > black-box package update validation > rejects 'stale source fingerprint' without partial publication 1074ms
 ✓ |integration| tests/integration/agent-settings-workflow.test.ts > Agent settings public IPC workflow > shares explicit changes with CLI repository and installer, then clears and reopens 755ms
 ✓ |integration| tests/integration/agent-settings-workflow.test.ts > Agent settings public IPC workflow > rejects retired keys and malformed current inputs without altering the persisted target 607ms
 ✓ |integration| tests/integration/agent-settings-workflow.test.ts > Agent settings public IPC workflow > converts a legacy renderer snapshot through registered migration IPC before acknowledging cleanup 673ms
```

</details>

<details><summary>assets</summary>

```text
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > copies installed plugin packages to resolved Agent Plugin targets
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > removes a distributed plugin package from a specific Agent target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > refuses to overwrite existing Agent config files during distribution
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > refuses to remove non-plugin Agent config files during undistribution
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > generates target-native Agent Plugin markers for adapter targets
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > preserves a target-specific native manifest in a multi-manifest package
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects a malformed target-native manifest without replacing the target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects direct Kiro distribution before resolving or writing a target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects direct Copilot distribution before resolving or writing a target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects direct Cursor distribution before resolving or writing a target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects composite Windsurf distribution before resolving or writing a target
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > materializes adapter targets as generated copies even when symlink mode is requested
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > persists Plugin personal metadata without touching package files
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > keeps distributed plugin packages by default and removes them when requested
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > imports target-native Agent plugin packages into My Plugins by copying the package
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > isolates a malformed secondary native manifest from valid targets
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > uses the first valid manifest when the highest-priority marker is malformed
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects traversal paths declared by a secondary native manifest
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects oversized secondary native manifests before reading their content
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > imports HTTPS Git plugin sources with branch and package path metadata
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > previews HTTPS Git plugin sources without mutating the library
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > imports SSH plugin sources through the injected source materializer
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > allows the same source URL and package path on different branches
 ✓ |unit| tests/unit/main/plugin-library-distribution-import.test.ts > CorePluginLibraryService > rejects single-skill direct plugin sources without mutating the library
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > persists created servers in the PromptHub data directory
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > migrates legacy config MCP library files to data on first read
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > prefers the data MCP library when both data and legacy config files exist
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > preconfigures real MCP store channels without third-party static templates
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > installs remote MCP store templates by value instead of requiring a built-in id
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > tracks and applies upstream MCP template updates without losing user-owned values
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > requires review for legacy or locally modified MCP market entries
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > drops legacy Roo target bindings when reading the MCP library
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > updates and deletes library servers without mutating unrelated records
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > persists MCP favorite state through reads and updates
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > leaves the library unchanged when a legacy built-in template id is no longer available
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > applies JSON targets without leaving a backup and preserves unrelated keys
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > applies OpenClaw and Grok targets through their verified native schemas
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > round-trips Antigravity serverUrl entries without exposing secrets
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > does not write target files or bindings when applying only disabled servers
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > does not modify an invalid JSON target when apply validation fails
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > rejects same-name external target conflicts unless force is set
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > allows reapplying PromptHub-managed target entries without force
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > does not replace an unchanged target file when reapplying the same projection
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > restores the exact existing target when binding persistence fails
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > removes a newly created target when binding persistence fails
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > cleans the temporary projection file when atomic replacement fails
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > syncs stale managed targets without returning secret-bearing content
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > detects target-side JSON entry fields that PromptHub does not project
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > skips external modifications and disabled platforms during sync
 ✓ |unit| tests/unit/main/mcp-library-persistence-targets.test.ts > CoreMcpLibraryService > classifies missing, parse-error, disabled, and legacy sync states
 ✓ |unit| tests/unit/main/skill-installer-export.test.ts > skill-installer-export > does not duplicate frontmatter when instructions already contain a full SKILL.md
 ✓ |unit| tests/unit/main/skill-installer-export.test.ts > skill-installer-export > keeps an empty body empty when instructions only contain frontmatter
 ✓ |unit| tests/unit/main/skill-installer-export.test.ts > skill-installer-export > serializes allowed-tools, metadata, and multiline descriptions as valid YAML
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > never invokes supplied content scanners during Git materialization
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > copies the full custom Git/Gitea skill package into the managed repo
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > installs a complete public HTTPS package through HTTP when Git is absent
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > uses a real local git clone fixture and excludes internal dirs and symlinks
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > fingerprints a real Git package with deeply nested templates
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > rejects 'path traversal directory' and removes the temporary clone
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > rejects 'missing SKILL.md in requested directo…' and removes the temporary clone
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > rejects ambiguous repositories when no skill directory is specified
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > selects a matching skill by SKILL.md frontmatter when the package directory is omitted
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > discovers a matching skills.sh package below repository category folders
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > uses the explicit catalog selector instead of a temporary display name
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > rejects an explicit catalog selector that does not match the repository's only Skill
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > copies a large package inventory without dropping nested files
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > copies a large package inventory without dropping nested files
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > copies the full remote zip skill package into the managed repo
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > rejects unsafe remote zip packages and removes the temporary extract directory
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > does not block structurally valid ZIP content based on optional assessment
 ✓ |unit| tests/unit/main/skill-installer-remote-git-package.test.ts > SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId > keeps the previous managed repo when remote git copy fails mid-apply
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > detects both create and update races before native replacement
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > declares verified missing states and keeps NanoClaw target-bound
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > inspects and updates Antigravity without replacing unrelated CLI settings
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > keeps an empty Antigravity settings file editable
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > sanitizes Qoder custom-model metadata and preserves literal credentials
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > distinguishes Qoder built-in and credential-missing custom models
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > keeps AutoClaw credentials private while updating its top-level model
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > keeps an empty AutoClaw config editable without inventing a provider
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > uses QClaw's own root with its verified OpenClaw-compatible model shape
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > updates Hermes YAML model.default while preserving routing configuration
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > preserves Hermes scalar model shape and rolls back a failed replacement
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > rolls Hermes back when semantic re-read does not observe the model
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > keeps empty Hermes config editable and rejects a non-string model shape
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > rejects malformed Qoder and Hermes files without exposing their content
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > resolves and updates only CoPaw's active Agent workspace
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > rejects a CoPaw active workspace that escapes the platform root
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > creates CoPaw's canonical active Agent config and rolls back write failure
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > rejects an invalid CoPaw active Agent identity
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > handles incomplete CoPaw active_model state without inventing a provider
 ✓ |unit| tests/unit/main/agent-model-config-expanded-platforms.test.ts > expanded native model configuration adapters > rejects a CoPaw workspace symlink that escapes the platform root
```

</details>

<details><summary>providers</summary>

```text
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > imports the active native provider without exposing inline credentials
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > imports the active native provider without exposing inline credentials
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > round-trips Codex reasoning effort and context window with the primary model
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > round-trips Codex reasoning effort and context window with the primary model
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > plans all Codex provider fields without returning a secret reference
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > tests the selected Profile in isolation without touching config.toml
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > tests the selected Profile in isolation without touching config.toml
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > fails closed for unsupported connection profiles and resolves environment credentials
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > fails closed for unsupported connection profiles and resolves environment credentials
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > routes an official model test through the native Codex probe
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > routes an official model test through the native Codex probe
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > does not trust a baseline produced by an older adapter contract
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > normalizes incomplete native files and rejects invalid contexts and TOML
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > blocks every malformed Codex Profile field before native writes
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > atomically activates and verifies a managed provider while preserving unrelated config
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > atomically activates and verifies a managed provider while preserving unrelated config
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > projects an environment credential without reading or retaining a managed token
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > projects an environment credential without reading or retaining a managed token
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > activates the native OpenAI profile and removes a newly created config on rollback
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > rejects stale or tampered activation contracts and reports rollback failures
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > fails closed for invalid profiles, stale writes, symlinks, and missing secrets
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > fails closed for invalid profiles, stale writes, symlinks, and missing secrets
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > restores the original config when post-write verification fails
 ✓ |unit| tests/unit/main/agent-codex-provider-adapter.test.ts > Codex unified Provider Profile adapter > restores when a syntactically valid post-write edit changes the desired provider
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > round-trips Claude role models and clears stale managed routes
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > imports settings.json without exposing native credentials or unknown fields
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > plans and applies an API-key profile while preserving unrelated JSON
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > plans and applies an API-key profile while preserving unrelated JSON
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > supports explicit bearer-token profiles and official platform-owned auth
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > tests a Profile in isolation using the selected Anthropic auth kind
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > fails closed for unsafe profiles, malformed native files, and stale writes
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > fails closed for unsafe profiles, malformed native files, and stale writes
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > restores the exact prior file after post-write verification failure
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > restores the exact prior file after post-write verification failure
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > imports supported native provider modes as read-only or credential-safe profiles
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > imports supported native provider modes as read-only or credential-safe profiles 445ms
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > reports every invalid profile boundary without reading credentials into public state
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > returns explicit isolation statuses for native, unavailable, and mismatched test targets
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > uses the official endpoint for direct API profiles and validates apply plans
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > distinguishes missing secrets from other invalid profiles during apply
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > reports failed verification and all rollback outcomes
 ✓ |unit| tests/unit/main/agent-claude-provider-adapter.test.ts > Claude Code unified Provider Profile adapter > reports failed verification and all rollback outcomes
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > imports paid API settings without exposing native credentials
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > updates both native files, preserves unrelated content, and rolls back exactly
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > updates both native files, preserves unrelated content, and rolls back exactly
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > preserves external OAuth, Vertex, ADC, Cloud Shell, and gateway authentication
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > preserves external OAuth, Vertex, ADC, Cloud Shell, and gateway authentication
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > tests paid API profiles in isolation and refuses native credential borrowing
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > fails closed for invalid profiles, malformed files, symlinks, and stale plans
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > covers empty installs, environment auth fallbacks, and malformed native values
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > blocks every unsupported profile shape and reports isolated test failures safely
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > rejects tampered activation inputs and returns stable verification and rollback failures
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > rejects tampered activation inputs and returns stable verification and rollback failures
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > writes a platform-native profile without creating an empty managed environment
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > writes a platform-native profile without creating an empty managed environment
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > restores both files after partial write or verification failure
 ✓ |unit| tests/unit/main/agent-gemini-provider-adapter.test.ts > Gemini CLI unified Provider Profile adapter > reports blocked native profiles and missing encryption without leaking errors
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > does not report installed when a skill folder exists without Cherry Studio DB registration
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > copies the whole skill package and registers agent_global_skill with safe SQL parameters
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > copy mode dereferences a symlinked source directory
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > copy mode dereferences a symlinked source directory
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > uses the current Cherry Studio Data/agents.db schema when present
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > closes the database when capability probing throws
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > prefers the current Data/cherrystudio.sqlite registry over a compatible legacy database
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > registers symlink installs in Cherry Studio DB and uninstalls only the link
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > updates an existing Cherry Studio row in place so agent enablement keeps the same skill id
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > updates an existing symlink install to the new source while preserving the DB row
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > switches an existing copied install to a symlink without deleting the new source
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > switches an existing copied install to a symlink without deleting the new source 456ms
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > switches an existing symlink install back to a copy without deleting the source
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > switches an existing symlink install back to a copy without deleting the source
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > uninstalls the registry row, copied folder, and enabled agent symlink 523ms
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > uninstalls current Cherry Studio skills from agents.db and agent_skills
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > uninstalls current Cherry Studio skills from agents.db and agent_skills 543ms
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > rejects uninstalling Cherry Studio built-in skills and leaves data intact
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > reports current Cherry Studio source=builtin skills as platform built-ins
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > reports current Cherry Studio Data/agent.db builtin skills as platform built-ins
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > rejects uninstalling current Cherry Studio source=builtin skills and leaves data intact
 ✓ |unit| tests/unit/main/cherry-studio-skill-platform.test.ts > cherry-studio-skill-platform > rejects platform-skill uninstall paths outside Cherry Studio skills dir
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > inspects and imports a redacted Claude model profile
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > plans supported model routes and reports unknown routes
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > blocks provider endpoints, secrets, and non-native protocols it cannot project
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > applies, verifies, and rolls back a real Claude settings file
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > supports OpenCode primary and secondary model mappings
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > blocks missing mappings, invalid configs, and cross-platform contexts
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > blocks duplicate routes, parameters, unsupported and read-only native configs
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > rejects unavailable imports and represents an empty native profile without inventing models
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > rejects unsupported factories, profile mismatches, and every stale apply boundary
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > reports verification mismatches without leaking adapter state
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > rolls back a newly created file and fails closed for bad backup or target paths
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > reports a rollback digest mismatch
 ✓ |unit| tests/unit/main/agent-model-provider-adapter.test.ts > Agent model Provider Profile adapter > uses the current primary model when only an OpenCode secondary route is applied
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > imports direct provider metadata without exposing native credentials
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > projects a direct provider and model while preserving unrelated semantic fields
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > dispatches kimi connection and streaming tests through the existing openai-chat probe
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > dispatches openai connection and streaming tests through the existing openai-chat probe
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > dispatches openai_responses connection and streaming tests through the existing openai-responses probe
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > dispatches anthropic connection and streaming tests through the existing anthropic-messages probe
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > dispatches google-genai connection and streaming tests through the existing google-generative-ai probe
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > keeps managed OAuth credentials platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > keeps provider env credentials platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > keeps custom headers credentials platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > keeps Vertex ADC credentials platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > allows a native profile only to select its existing provider/model entry
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > fails closed for invalid metadata, missing secrets, and native provider collisions
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > rejects malformed, oversized, symlinked, and concurrently changed config
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > restores exact bytes after native validation or semantic verification failure
 ✓ |unit| tests/unit/main/agent-kimi-provider-adapter.test.ts > Kimi Code unified Provider Profile adapter > uses an encrypted null-file bundle so creation can be rolled back to absence
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > imports the current bare-array provider model without exposing credentials
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > projects a direct provider to settings plus dotenv and preserves unrelated data
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > maps a custom provider id to its official protocol
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > dispatches openai connection and streaming tests through the existing probe
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > dispatches anthropic connection and streaming tests through the existing probe
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > dispatches gemini connection and streaming tests through the existing probe
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > keeps Vertex ADC authentication platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > keeps legacy Qwen OAuth authentication platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > keeps automatic Coding Plan authentication platform-owned and read-only
 ✓ |unit| tests/unit/main/agent-qwen-provider-adapter.test.ts > Qwen Code unified Provider Profile adapter > fails closed for malformed profiles, unsafe files, races, and partial writes
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > resolves the native XDG auth path without exposing it to renderer context
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > imports native API and OAuth state without exposing any credential
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > writes a documented custom provider plus API auth and restores both files exactly
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > dispatches openai-chat tests through the existing bounded OpenAI probe
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > dispatches openai-responses tests through the existing bounded OpenAI probe
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > fails closed for v2 config, native custom headers, missing secrets, and stale plans
 ✓ |unit| tests/unit/main/agent-opencode-provider-adapter.test.ts > OpenCode unified Provider Profile adapter > restores both native files after a partial write failure
 ✓ |unit| tests/unit/main/agent-grok-provider-adapter.test.ts > Grok Build Provider Profile adapter > imports the documented environment-owned model without exposing credentials
 ✓ |unit| tests/unit/main/agent-grok-provider-adapter.test.ts > Grok Build Provider Profile adapter > activates an env-owned provider with encrypted backup and rollback
 ✓ |unit| tests/unit/main/agent-grok-provider-adapter.test.ts > Grok Build Provider Profile adapter > keeps native and inline-secret authentication redacted and read-only
 ✓ |unit| tests/unit/main/agent-grok-provider-adapter.test.ts > Grok Build Provider Profile adapter > resolves env credentials only inside main-process probes
 ✓ |unit| tests/unit/main/agent-grok-provider-adapter.test.ts > Grok Build Provider Profile adapter > rejects unsafe roots, malformed files, symlinks, and stale plans
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > discovers safe user files and declared missing files while excluding runtime state
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > redacts embedded secrets before IPC and preserves them on save
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects stale writes without overwriting external changes
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects invalid structured content and raw secret mutations
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects unknown and duplicated redaction placeholders
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > validates TOML and YAML while preserving their redacted secrets
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rolls back exact bytes when post-write verification fails
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > removes a newly-created file when verification fails
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > does not write when encrypted backup storage is unavailable
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects traversal, excluded files, symlinks, and arbitrary missing files
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects existing files outside the declared and discovered inventory
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > keeps bounded discovered files readable without declaring each path
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > bounds cached source inventories and rediscovers an evicted root
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > creates a declared missing file through the validated atomic path
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects unsafe content and revision state for a missing file
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > serializes same-file writes and rejects the stale queued mutation
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > detects an external mutation between backup and atomic replacement
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > bounds discovered files and ignores unsafe declared targets
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > lists declared files when the user-level Agent root is missing
 ✓ |unit| tests/unit/main/agent-user-config-files.test.ts > Agent user config files > rejects a symlinked Agent root
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > declares depth-adapter evidence for every built-in platform exactly once
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > keeps the requested local Claw platforms as independent identities
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > provides a status and evidence for every capability on every platform
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > matches the adapters that are currently implemented and verified
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > keeps Grok Build rooted in its documented environment override
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > models DeepSeek Harness as profile plugins instead of generic asset paths
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > derives path-owned capabilities without claiming missing protocols
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > exposes Cursor verified read-only Agent transcripts
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > derives CLI maintenance only from canonical platform descriptors
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > uses the documented OpenCode update and exact rollback contract
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > uses the documented OpenClaw CLI version contract
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > keeps Cherry Studio depth bounded to the verified Agent session database
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports Kilo history after verifying its native local JSON store
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports Hermes history after verifying its official state database
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports Reasonix history after verifying its current event-log store
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports NanoClaw history from its current two-database session store
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports CoPaw history from its current SafeJSONSession workspaces
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > reports Qoder history from its documented transcript JSONL store
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > keeps Windsurf deep capabilities bounded to public transcript history
 ✓ |unit| tests/unit/services/agent-platform-capabilities.test.ts > Agent platform capability inventory > keeps Kiro bounded to model settings and read-only local sessions
 × |unit| tests/unit/main/agent-platform-detection.test.ts > Agent platform detection > detects plugin Harness agents by CLI even before the profile root exists
```

</details>

<details><summary>sessions</summary>

```text
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > uses Qwen's bounded JSONL session index and reads only the selected transcript
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > rejects Qwen transcript symlinks that escape the runtime root
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > indexes and reads Claude JSONL lazily with malformed rows isolated
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > uses OpenCode's global bounded database projection and sanitized export
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > treats an empty OpenCode session list as no local history
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > pages OpenCode metadata without exporting transcript bodies
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > indexes Gemini project sessions and returns a bounded transcript
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > keeps Gemini cache labels when project markers are unsafe
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > reads current Kimi Code sessions from its bounded index and rejects escaped roots
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > reads the newest Kimi session from the bounded tail of an oversized index
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > fails closed when a Kimi session directory escapes through a symlink
 ✓ |unit| tests/unit/main/agent-session-service.test.ts > Agent session service > fails closed for unsupported Agents, missing commands and unsafe ids
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > lists active and archived Codex sessions once and renders only visible messages 300ms
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > reads current Codex response-item messages without exposing private records
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > paginates visible Codex messages beyond a large hidden runtime prefix
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > continues Codex detail pagination after the per-page scan budget
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > reads bounded Grok Build summary and chat history without runtime artifacts
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > uses a valid Codex thread name after an oversized partial index record
 ✓ |unit| tests/unit/main/agent-session-major-adapters.test.ts > major Agent session adapters > reads OpenClaw indexed transcripts and rejects paths outside its root
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > lists local agent transcripts and searches visible turn text
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > fails closed for ambiguous and symlink-only encoded projects
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > bounds project resolution and accepts the exact home project
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > bounds project resolution and accepts the exact home project
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > reads bounded visible messages and hides tool records
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > skips symlinked transcript sources and does not create a missing root
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > isolates missing, malformed, unsafe, and non-file transcript entries
 ✓ |unit| tests/unit/main/agent-session-cursor.test.ts > Cursor session adapter > uses id order for equal timestamps, tolerates metadata read races, and rejects unknown sessions
 ✓ |unit| tests/unit/main/agent-session-cherry-studio.test.ts > Cherry Studio Agent session adapter > prefers the current official database and exposes only visible text parts
 ✓ |unit| tests/unit/main/agent-session-cherry-studio.test.ts > Cherry Studio Agent session adapter > lists, searches and cursor-pages visible Agent messages read-only
 ✓ |unit| tests/unit/main/agent-session-cherry-studio.test.ts > Cherry Studio Agent session adapter > returns an empty list for a missing store and fails closed on invalid stores
 ✓ |unit| tests/unit/main/agent-session-cherry-studio.test.ts > Cherry Studio Agent session adapter > closes the opened store when schema validation fails
 ✓ |unit| tests/unit/main/agent-session-kiro.test.ts > Kiro CLI read-only sessions > lists metadata and reads only visible prompt and assistant text
 ✓ |unit| tests/unit/main/agent-session-kiro.test.ts > Kiro CLI read-only sessions > skips mismatched, linked, and unsafe sessions while bounding text
 ✓ |unit| tests/unit/main/agent-session-kiro.test.ts > Kiro CLI read-only sessions > fails closed for damaged metadata and incomplete transcripts
 ✓ |unit| tests/unit/main/agent-session-kiro.test.ts > Kiro CLI read-only sessions > honors absolute KIRO_HOME and rejects a relative environment root
 ✓ |unit| tests/unit/main/agent-session-qoder.test.ts > Qoder session adapter > lists, body-searches and cursor-pages the current official transcript
 ✓ |unit| tests/unit/main/agent-session-qoder.test.ts > Qoder session adapter > paginates the full inventory instead of hiding older sessions
 ✓ |unit| tests/unit/main/agent-session-qoder.test.ts > Qoder session adapter > skips oversized records without hiding later readable messages
 ✓ |unit| tests/unit/main/agent-session-qoder.test.ts > Qoder session adapter > fails closed for malformed, mismatched, symlinked and stale sources
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > validates bounded public inputs and the complete delete registry
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > derives known multi-file and directory ownership without renderer paths
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > rejects unbounded Kilo companion inventories
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > requires a truthful size and preserves supplied logical database bytes
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > bounds directory measurement and counts contained links without following them
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > handles Cline companion metadata failures and absolute contained paths
 ✓ |unit| tests/unit/main/agent-session-storage.test.ts > Agent session storage lifecycle > validates every target before deleting files or directories
 ✓ |unit| tests/unit/main/agent-session-hermes.test.ts > Hermes session adapter > lists and body-searches every readable session from the official store
 ✓ |unit| tests/unit/main/agent-session-hermes.test.ts > Hermes session adapter > cursor-pages only active user and assistant text
 ✓ |unit| tests/unit/main/agent-session-hermes.test.ts > Hermes session adapter > fails closed for missing, malformed and symlinked stores
 ✓ |unit| tests/unit/main/agent-session-hermes.test.ts > Hermes session adapter > closes the opened store when schema validation fails
 ✓ |unit| tests/unit/main/agent-session-kilo.test.ts > Kilo session adapter > lists, body-searches, cursor-pages and resumes visible Kilo messages 1141ms
 ✓ |unit| tests/unit/main/agent-session-kilo.test.ts > Kilo session adapter > handles missing roots and rejects malformed, symlinked or unsafe sources
 ✓ |unit| tests/unit/main/agent-session-kilo.test.ts > Kilo session adapter > paginates beyond the legacy 2,000-session window
 ✓ |unit| tests/unit/main/agent-session-kilo.test.ts > Kilo session adapter > paginates beyond the legacy 2,000-session window 494ms
 ✓ |unit| tests/unit/main/agent-session-copilot.test.ts > GitHub Copilot session adapter > lists and reads the native read-only session store without exposing runtime tables 1168ms
 ✓ |unit| tests/unit/main/agent-session-copilot.test.ts > GitHub Copilot session adapter > returns an explicit empty result when Copilot has no local store
 ✓ |unit| tests/unit/main/agent-session-copilot.test.ts > GitHub Copilot session adapter > fails closed for a symlinked native store
 ✓ |unit| tests/unit/main/agent-session-copilot.test.ts > GitHub Copilot session adapter > marks oversized turn fields as truncated while keeping the read bounded
 ✓ |unit| tests/unit/main/agent-session-qwen-pagination.test.ts > Qwen session deep-page continuity > opens a listed session beyond row 200 with bounded metadata retention
 ✓ |unit| tests/unit/main/agent-session-qwen-pagination.test.ts > Qwen session deep-page continuity > revalidates a cached transcript path before reading
 ✓ |unit| tests/unit/main/agent-session-qwen-pagination.test.ts > Qwen session deep-page continuity > contains malformed native rows and projects only visible transcript roles
 ✓ |unit| tests/unit/main/agent-session-qwen-pagination.test.ts > Qwen session deep-page continuity > fails closed when the Qwen executable or requested session is absent
 ✓ |unit| tests/unit/main/agent-session-antigravity.test.ts > Antigravity CLI conversation sessions > lists, searches and reads the CLI-owned visible transcript projection
 ✓ |unit| tests/unit/main/agent-session-antigravity.test.ts > Antigravity CLI conversation sessions > keeps database-only conversations resumable without inventing body text
 ✓ |unit| tests/unit/main/agent-session-antigravity.test.ts > Antigravity CLI conversation sessions > rejects unsafe sources, hides legacy protobuf and bounds visible text
 ✓ |unit| tests/unit/main/agent-session-reasonix.test.ts > Reasonix session adapter > lists and body-searches project sessions from the current event-log store
 ✓ |unit| tests/unit/main/agent-session-reasonix.test.ts > Reasonix session adapter > cursor-pages only visible user and assistant messages
 ✓ |unit| tests/unit/main/agent-session-reasonix.test.ts > Reasonix session adapter > fails closed for future schemas, malformed checkpoints, and symlinks
 ✓ |unit| tests/unit/main/agent-session-copaw.test.ts > CoPaw session adapter > reads current QwenPaw workspaces and filters model-only context
 ✓ |unit| tests/unit/main/agent-session-copaw.test.ts > CoPaw session adapter > reads the legacy memory shape still supported by current QwenPaw
 ✓ |unit| tests/unit/main/agent-session-copaw.test.ts > CoPaw session adapter > ignores malformed snapshots and symlinked workspace roots
 ✓ |unit| tests/unit/main/agent-session-oh-my-pi.test.ts > Oh My Pi session adapter > indexes cwd-scoped JSONL sessions and reads visible messages lazily
 ✓ |unit| tests/unit/main/agent-session-oh-my-pi.test.ts > Oh My Pi session adapter > ignores nested subagent transcripts, unsafe ids, and symlinks
 ✓ |unit| tests/unit/main/agent-session-oh-my-pi.test.ts > Oh My Pi session adapter > falls back to the first user message and message model when metadata is absent
 ✓ |unit| tests/unit/main/agent-session-pi.test.ts > Pi session adapter > reads only Pi sessions and preserves upstream model metadata
 ✓ |unit| tests/unit/main/agent-session-pi.test.ts > Pi session adapter > cursor-pages the complete Pi transcript instead of stopping at a bounded preview
 ✓ |unit| tests/unit/main/agent-session-pi.test.ts > Pi session adapter > rejects unsafe Pi session ids
 ✓ |unit| tests/unit/main/agent-session-pi.test.ts > Pi session adapter > falls back to provider-qualified message metadata
 ✓ |unit| tests/unit/main/agent-session-windsurf.test.ts > Windsurf public transcript sessions > lists and reads only visible user and planner response text
 ✓ |unit| tests/unit/main/agent-session-windsurf.test.ts > Windsurf public transcript sessions > skips unsafe files and bounds transcript content
 ✓ |unit| tests/unit/main/agent-session-nanoclaw.test.ts > NanoClaw session adapter > merges the current inbound and outbound databases by sequence
 ✓ |unit| tests/unit/main/agent-session-nanoclaw.test.ts > NanoClaw session adapter > closes inbound when the paired outbound database cannot open
 ✓ |unit| tests/unit/main/agent-session-nanoclaw.test.ts > NanoClaw session adapter > pages visible user and assistant messages without dropping large replies
 ✓ |unit| tests/unit/main/agent-session-nanoclaw.test.ts > NanoClaw session adapter > ignores malformed stores and symlinked session directories
 ✓ |unit| tests/unit/main/agent-session-augment.test.ts > Augment CLI conversation sessions > lists, searches, paginates and resumes native Auggie sessions
 ✓ |unit| tests/unit/main/agent-session-augment.test.ts > Augment CLI conversation sessions > rejects malformed sessions and cursors without exposing private agent state
 ✓ |unit| tests/unit/main/agent-session-cline.test.ts > Cline session adapter > honors an absolute CLINE_DATA_DIR without creating the default root
 ✓ |unit| tests/unit/main/agent-session-cline.test.ts > Cline session adapter > lists and reads native snapshots while searching visible turns
 ✓ |unit| tests/unit/main/agent-session-cline.test.ts > Cline session adapter > falls back to legacy task histories and keeps malformed records bounded
 ✓ |unit| tests/unit/main/agent-session-cline.test.ts > Cline session adapter > does not follow symlinked snapshots or create a missing Cline root
 ✓ |unit| tests/unit/main/agent-session-cline.test.ts > Cline session adapter > reads bounded external message artifacts only when they stay inside the Cline root
```

</details>

<details><summary>usage-models</summary>

```text
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > queries quota with an access token renewed by the current Kimi credential service
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > keeps Kimi renewal failures explicit and sanitized
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > forces one token renewal and retries usage after an accepted token returns 401
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > returns no-credentials without a network call when no credential file exists
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > returns no-credentials for malformed credential JSON
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > returns no-credentials when access_token is blank
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > falls back to json files under the oauth directory
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > short-circuits to expired when expires_at is in the past, without a network call
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > credential resolution > accepts expires_at as epoch seconds
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > request and response mapping > requests the usages endpoint with a Bearer header
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > request and response mapping > maps the live usage shape to weekly and rolling metrics plus plan
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > request and response mapping > keeps compatibility with Kimi payloads that report used amounts and plain time units
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > request and response mapping > omits amounts and reports zero utilization when the weekly limit is 0
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > request and response mapping > keeps incomplete Kimi quota rows unknown instead of inventing values
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > error mapping and secret isolation > maps HTTP 401 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > error mapping and secret isolation > maps HTTP 403 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > error mapping and secret isolation > maps HTTP 500 to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > error mapping and secret isolation > maps a rejected fetch to network-error and an abort to timeout
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Kimi adapter) > error mapping and secret isolation > never exposes the token in returned quotas
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > does not probe an Agent whose configured root is not detected
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > prefers the running Antigravity desktop session over stale stored tokens
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > keeps the open-app fallback when the local helper is unavailable for a renewable session
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > uses the current Antigravity macOS Keychain session before stale legacy files
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > continues past an expired legacy token to a valid shared credential
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > falls back when the Keychain item is malformed instead of claiming the session expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > returns no-credentials without a network call when the token file is missing
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > returns no-credentials for a token file without token.access_token
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > short-circuits to expired when the token expiry has passed, without a network call
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > falls back to the shared Gemini credential file for Antigravity 2.0 installs
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > credential resolution > returns no-credentials when both the Antigravity token and the shared Gemini file are missing
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > request and response mapping > calls loadCodeAssist then fetchAvailableModels with Bearer auth
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > request and response mapping > maps the models dict to per-model quota metrics and the tier to plan
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > request and response mapping > accepts a project object and a models list defensively
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > error mapping and secret isolation > maps a 401 from loadCodeAssist to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > error mapping and secret isolation > maps an HTTP 500 from fetchAvailableModels to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Antigravity adapter) > error mapping and secret isolation > maps a rejected fetch to network-error and an abort to timeout
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > credential resolution > returns no-credentials without a network call when oauth_creds.json is missing
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > credential resolution > returns no-credentials for malformed oauth_creds.json
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > credential resolution > short-circuits to expired when expiry_date is in the past, without a network call
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > request and response mapping > calls loadCodeAssist with an empty body then retrieveUserQuota
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > request and response mapping > maps buckets to per-model quota metrics and the tier to plan
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > error mapping and secret isolation > maps a 403 from loadCodeAssist to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > error mapping and secret isolation > maps an HTTP 500 from retrieveUserQuota to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Gemini CLI adapter) > error mapping and secret isolation > maps a rejected fetch to network-error and an abort to timeout
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > credential resolution > returns no-credentials without a network call when neither store exists
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > credential resolution > reads the token from gh hosts.yml first
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > credential resolution > falls back to github-copilot hosts.json when hosts.yml has no token
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > credential resolution > returns no-credentials when hosts.json is malformed
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > request and response mapping > sends the GitHub API headers including the token auth scheme
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > request and response mapping > maps premium and chat snapshots, reset date, and plan
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > request and response mapping > derives utilization from entitlement and remaining when percent_used is absent
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > request and response mapping > preserves snapshots marked unlimited
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > request and response mapping > returns ok with empty metrics when no snapshots are reported
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > error mapping and secret isolation > maps HTTP 401 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > error mapping and secret isolation > maps HTTP 403 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > error mapping and secret isolation > maps HTTP 500 to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > error mapping and secret isolation > maps a rejected fetch to network-error and an abort to timeout
 ✓ |unit| tests/unit/main/agent-usage-service-providers.test.ts > Agent usage service (Copilot adapter) > error mapping and secret isolation > never exposes the token in returned quotas
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > rejects symbolic-link model configuration files
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > reports Qwen's verified adapter even before settings.json exists
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > inspects and updates Qwen settings without exposing provider secrets
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > inspects and updates Claude without exposing or overwriting credentials
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > supports Gemini, OpenCode JSONC and OpenClaw model fields
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > parses and safely rewrites Codex TOML while preserving semantic fields
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > inspects and updates current Kimi Code TOML without exposing provider secrets
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > inspects and updates Oh My Pi YAML model routing without exposing provider data
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > uses config.yaml fallback and rejects malformed or oversized Oh My Pi YAML
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > reports Oh My Pi OAuth and missing-key readiness without returning auth metadata
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > bounds and filters malformed Oh My Pi catalog entries
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > creates a missing Oh My Pi config without inventing provider credentials
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > rolls back Oh My Pi model writes when the optional provider catalog is invalid
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > restores Kimi Code TOML when native validation fails
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > reports missing, unsupported and malformed configurations without leaking content
 ✓ |unit| tests/unit/main/agent-model-config.test.ts > Agent model configuration adapters > creates a missing declared config and returns stable errors for invalid TOML
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > uses the legacy keychain entry when it yields credentials
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > falls back to the hashed keychain variant when the legacy lookup fails
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > computes the hashed service name as sha256(expandedRoot).slice(0, 8)
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > falls back to the credentials file when every keychain lookup fails
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > returns no-credentials without a network call when every source is missing
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > skips the keychain entirely when the security binary cannot be resolved
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential resolution order > does not consult the keychain on non-macOS platforms
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential parsing > treats malformed keychain JSON as a miss and continues the fallback chain
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential parsing > returns no-credentials when no source exposes a usable token
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential parsing > accepts a top-level accessToken when claudeAiOauth is absent
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > credential parsing > short-circuits to expired when expiresAt is in the past, without a network call
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > usage response mapping > maps windows, plan, and timestamps from a 200 response
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > usage response mapping > maps missing windows to null instead of fabricating values
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > error mapping > maps HTTP 401 to expired
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > error mapping > maps HTTP 500 to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > error mapping > maps a rejected fetch to unavailable with network-error
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > error mapping > maps an abort to unavailable with timeout
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > result cache > serves a cached result within 60 seconds without a second request
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > result cache > refetches once the cache entry is older than 60 seconds
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > result cache > bypasses the cache when forceRefresh is set
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > agent id validation > rejects a non-string or empty agentId
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > agent id validation > rejects an unregistered agent id before any credential lookup
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > agent id validation > returns unsupported-agent for registered agents without a usage adapter
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > secret isolation > never exposes the token in returned quotas across every status
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > secret isolation > never exposes the token when credential lookups fail
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > custom gateway short-circuit > returns custom-provider-active without network or keychain access when ANTHROPIC_BASE_URL is set
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > custom gateway short-circuit > returns custom-provider-active when a cloud provider flag is set
 ✓ |unit| tests/unit/main/agent-usage-service.test.ts > Agent usage service > custom gateway short-circuit > proceeds with the official flow when settings.json is missing or has no gateway
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > accepts only Antigravity language-server processes with a bounded CSRF token
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > extracts only valid loopback listening ports
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > uses only the installed macOS application as a background helper
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > recognizes the current Antigravity 2.x language-server command without a declared port
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > keeps plan identity but ignores legacy credit counters
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > maps each Antigravity model group to semantic weekly and five-hour quotas
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > queries the first responsive loopback port from the running desktop session
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > uses a temporary native helper when no trusted desktop process exists
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > uses the temporary helper when process discovery is unavailable
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > queries quota through a bounded temporary helper and always stops it
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > retries the quota request while the background helper is still initializing
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > does not spawn an unverified helper and classifies startup failures
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > stops the helper when quota retrieval fails
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > force kills a helper that ignores graceful termination
 ✓ |unit| tests/unit/main/agent-usage-antigravity-local.test.ts > Antigravity local usage adapter > never includes the CSRF token in an unavailable result
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > credential resolution > returns no-credentials without a network call when auth.json is missing
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > credential resolution > returns no-credentials when auth.json has no tokens object
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > credential resolution > returns no-credentials when the access token is blank
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > credential resolution > returns no-credentials for malformed auth.json
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > request headers > sends Bearer and ChatGPT-Account-Id headers when account_id is present
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > request headers > omits ChatGPT-Account-Id when account_id is absent
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > usage response mapping > maps plan_type and both windows from a 200 response
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > usage response mapping > classifies windows by limit_window_seconds, not by slot order
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > usage response mapping > keeps the larger window when both slots share a classification
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > usage response mapping > maps a missing plan_type and missing windows to null
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > usage response mapping > maps a non-numeric reset_at to a null resetsAt
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > error mapping > maps HTTP 401 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > error mapping > maps HTTP 403 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > error mapping > maps HTTP 500 to unavailable with http-error
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > error mapping > maps a rejected fetch to unavailable with network-error
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > error mapping > maps an abort to unavailable with timeout
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > custom model_provider short-circuit > returns custom-provider-active without any network call for a third-party provider
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > custom model_provider short-circuit > queries normally when model_provider is openai
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > custom model_provider short-circuit > queries normally when config.toml has no model_provider key
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > custom model_provider short-circuit > queries normally when config.toml does not exist
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > custom model_provider short-circuit > queries normally when config.toml cannot be parsed
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > result cache > serves a cached result within 60 seconds without a second request
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > result cache > refetches once the cache entry is older than 60 seconds
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > result cache > bypasses the cache when forceRefresh is set
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > agent id routing > still returns unsupported-agent for registered agents without an adapter
 ✓ |unit| tests/unit/main/agent-usage-service-codex.test.ts > Agent usage service (Codex adapter) > secret isolation > never exposes the token in returned quotas across every status
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > exposes only the v1 source status values
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'no source metadata'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'source unavailable with no remote sna…'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'baseline missing when local and remot…'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'initializes a missing baseline when l…'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'up to date'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'update available'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'local modified'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > classifies 'conflict'
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > keeps stale downstream targets as auxiliary distribution data
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > chooses silent legacy upgrade only when old entry hashes match remote
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > blocks direct remote overwrite for linked local folders in v1
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > computes skill-package-sha256-v1 fingerprints with shared ignore rules
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > keeps raw content-url package fingerprint equal to content hash
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > treats null algorithm rows with package fingerprints as legacy snapshots
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > does not report an update when legacy entry content and current v1 packages match
 ✓ |unit| tests/unit/services/skill-source-update-reconciliation.test.ts > skill source update reconciliation > keeps legacy stable text algorithm separate from sha256 package fingerprints
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > classifies remote zip, git package, raw content URL, linked local, and managed copy sources
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > derives package directories from explicit source directory before canonical skill path
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > returns a diagnostic reference for each supported source kind
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > does not treat a raw content URL as a package even when the registry carries a stale directory fingerprint
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > resolves a private Gitea Skill page as a Git package without relying on its raw URL
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > carries a skills.sh selector when the catalog does not know the package directory
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > recovers Git transport from a legacy Gitea raw URL without source metadata
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > preserves private Gitea clone credentials while canonicalizing a raw content URL
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > removes SKILL.md when a Gitea source page points at the file
 ✓ |unit| tests/unit/services/skill-source-resolver.test.ts > skill source resolver > decodes a GitHub blob branch and directory without retaining SKILL.md
 ✓ |unit| tests/unit/main/agent-deepseek-harness-service.test.ts > DeepSeek Harness profile plugin service > projects bounded profile and plugin metadata without script bodies
 ✓ |unit| tests/unit/main/agent-deepseek-harness-service.test.ts > DeepSeek Harness profile plugin service > keeps unsafe profiles, oversized manifests, and escaping packages out of the readable inventory
 ✓ |unit| tests/unit/main/agent-deepseek-harness-service.test.ts > DeepSeek Harness profile plugin service > delegates acknowledged mutations to exact shell-free dsh plugin commands and serializes one profile
 ✓ |unit| tests/unit/main/agent-deepseek-harness-service.test.ts > DeepSeek Harness profile plugin service > rejects unsafe sources and built-in bundle removal, then redacts command failures
 × |unit| tests/unit/main/agent-copilot-model-config.test.ts > GitHub Copilot CLI native model boundary > declares the current root and user-owned asset paths
 ✓ |unit| tests/unit/main/agent-copilot-model-config.test.ts > GitHub Copilot CLI native model boundary > inspects and updates only the JSONC model preference
 ✓ |unit| tests/unit/main/agent-copilot-model-config.test.ts > GitHub Copilot CLI native model boundary > creates a missing settings file without claiming BYOK ownership
 ✓ |unit| tests/unit/main/agent-copilot-model-config.test.ts > GitHub Copilot CLI native model boundary > fails closed for malformed, oversized, and symlinked settings
 ✓ |unit| tests/unit/main/agent-copilot-model-config.test.ts > GitHub Copilot CLI native model boundary > applies, verifies, rolls back, and rejects environment-only BYOK fields
 × |unit| tests/unit/main/agent-model-config-kiro.test.ts > Kiro CLI model-only boundary > declares current root, assets, config, launch, and partial adapters
 ✓ |unit| tests/unit/main/agent-model-config-kiro.test.ts > Kiro CLI model-only boundary > activates and rolls back the nested settings path
 ✓ |unit| tests/unit/main/agent-model-config-kiro.test.ts > Kiro CLI model-only boundary > inspects and updates only chat.defaultModel in JSONC settings
 ✓ |unit| tests/unit/main/agent-model-config-kiro.test.ts > Kiro CLI model-only boundary > creates missing settings and fails closed for invalid or linked files
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > returns no-credentials for missing, malformed, oversized, or unofficial auth
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > short-circuits an expired official credential
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > maps the official subscription and weekly billing period
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > keeps weekly usage when subscription metadata is unavailable
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > keeps the plan but reports unavailable when billing fails
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > maps rejected billing HTTP 401 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > maps rejected billing HTTP 403 to expired
 ✓ |unit| tests/unit/main/agent-usage-service-grok.test.ts > Agent usage service (Grok Build adapter) > maps malformed billing values to an empty but successful provider report
 ✓ |unit| tests/unit/main/agent-model-config-pi.test.ts > Pi model configuration > registers Pi as a separate model-provider target
 ✓ |unit| tests/unit/main/agent-model-config-pi.test.ts > Pi model configuration > inspects and atomically updates defaultProvider/defaultModel
 ✓ |unit| tests/unit/main/agent-model-config-pi.test.ts > Pi model configuration > preserves the configured provider for an unqualified model update
 ✓ |unit| tests/unit/main/agent-model-config-pi.test.ts > Pi model configuration > keeps missing and malformed Pi settings bounded
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > discovers nested local skills once when a symlink points back into the tree
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > silently skips a broken local symlink without hiding valid skills
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > retains a diagnostic for non-missing symlink resolution failures
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > does not discover remote packages through symlinks or ignored generated directories
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > discovers supported hidden Agent Skill containers without entering Git internals
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > prefers any hidden Agent skills container over an unrelated duplicate example
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > does not scan remote packages beyond the depth boundary
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > prefers an exact frontmatter match in a standard Skill container over unrelated examples
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > preserves Unicode letters while matching a repository Skill selector
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > rejects equally ranked duplicate frontmatter names instead of choosing arbitrarily
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > rejects repositories that exceed the discovery directory budget
 ✓ |unit| tests/unit/main/skill-installer-discovery.test.ts > skill installer discovery > rejects repositories that exceed the discovery directory budget
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > normalizes used and remaining percentages into a bounded remaining value
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > rejects non-finite percentages instead of leaking invalid UI values
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > normalizes amount quotas from used and remaining values
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > marks invalid amount quotas unknown
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > bounds provider inventories before they reach the renderer
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > bounds dynamic text before provider data reaches the renderer
 ✓ |unit| tests/unit/main/agent-usage-contract.test.ts > agent usage contract normalization > supplies bounded fallbacks when provider text contains only whitespace
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > accepts local directory paths for local-dir and git-repo sources
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > keeps HTTP catalogs blocked unless the owning product explicitly allows LAN sources
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > normalizes file URLs into local filesystem paths
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > accepts hosted and self-hosted git repo URLs plus local paths
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > normalizes github tree urls into structured git source fields
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > lets explicit branch and directory override parsed tree url values
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > accepts marketplace JSON documents with direct skills
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > accepts marketplace JSON documents with nested registry references
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > rejects empty marketplace JSON documents
 ✓ |unit| tests/unit/services/skill-store-source.test.ts > skill-store-source > rejects malformed marketplace JSON responses
 ✓ |unit| tests/unit/services/skill-project-settings.test.ts > Skill project settings normalization > adds the default project deploy target and removes duplicate paths
 ✓ |unit| tests/unit/services/skill-project-settings.test.ts > Skill project settings normalization > rejects malformed projects and normalizes durable path fields
```

</details>

<details><summary>plugin-extra</summary>

```text
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > rejects unsupported plugin distribution targets without mutating the library
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > keeps listing healthy marketplaces when another source fails
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > rejects single-skill and runtime-module sources without mutating the library
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > rejects plugin manifests that reference child assets outside the package
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > rejects plugin packages containing symlinks that escape the package root
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > does not execute plugin package scripts during local import
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > checks installed plugin package health without mutating the library
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > reports missing installed plugin manifest in package health checks
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > reports unsafe installed plugin packages in package health checks
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > exports and restores managed plugin package snapshots
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > creates plugin package versions starting from v1
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > rolls back plugin metadata and package files while preserving the current state as a new version
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > deletes plugin versions without mutating the plugin library
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > classifies only multi-capability inventory as bundle plugins
 ✓ |unit| tests/unit/main/plugin-library-validation-versions.test.ts > CorePluginLibraryService > shows unsupported runtime-only and composite targets as disabled
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads Codex plugin cache packages
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads Claude installed_plugins registry and manual root plugin packages
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads the official Oh My Pi user plugin registry from the sibling plugin data root
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > ignores Oh My Pi project installs, duplicate paths, and packages outside its plugin data root
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > rejects Oh My Pi registry package symlinks that escape its plugin data root
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > rejects malformed and oversized Oh My Pi registries without reading credentials
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads markerless multi-capability Claude bundles without package.json
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > rejects weak markerless Claude package signals
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > rejects markerless Claude capabilities that resolve outside the Agent root
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > rejects Claude marker and package metadata symlinks outside the package root
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads Cursor plugin packages from plugin roots
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads Gemini CLI extension packages
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > discovers Qwen extensions as parent-owned bundles
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads Kiro Power packages
 ✓ |unit| tests/unit/main/plugin-target-inventory.test.ts > Agent Plugin target inventory scan > reads GitHub Copilot plugin packages
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > detects child-file-only changes in a Git-backed Plugin source
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > checks and applies a content-only update through a real local Git repository
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > checks and applies updates from the original local Plugin folder
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > skips marketplace package materialization without a complete source location
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > rejects and cleans a marketplace package without a Plugin manifest
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > does not report a legacy package as up to date when its baseline is missing
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > derives the same source identity after HTTP credentials rotate
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > redacts credentials from Git source failures
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > does not override the proxy mode selected by the desktop settings
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > terminates a stalled Git source clone
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > uses equal local and remote packages as a safe legacy baseline
 ✓ |unit| tests/unit/main/plugin-source-reconciliation.test.ts > Plugin source reconciliation > falls back to manifest changes when a source has no package snapshot
```

</details>

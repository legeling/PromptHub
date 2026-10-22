# Remaining Open Issues Roadmap

## Record

- ID: `ISS-20260809-001`
- Status: open
- Last triage update: 2026-10-19
- Source: [remote open snapshot](github-open.md), 36 open / 181 closed / 217 total; the original 42 open report bodies were reviewed, then six issues were closed.
- Delivery authority: [local overlay](local-github-status.md); behavior and design stay in their existing domain records.
- Scope: published 0.6.0 review, authorized issue follow-up, local repairs and the later explicitly authorized split commits/push. Release and tag creation remain outside scope. Historical sections retain their original verification boundaries.

## Provider follow-up — 2026-10-22

### Current seven-issue acceptance and submission

The scoped follow-up covers six bugs (#246/#244/#209/#190/#185/#141) and
provider deletion #245. GitHub readback after closing #209/#190 reports 30 open and
190 closed issues. No push, deployment or release was performed.

| Issue | Current evidence and action |
| --- | --- |
| #245 | `aedff96e` includes `Closes #245`; isolated Model Services create/cancel/delete/Toast/restart acceptance passed. Remote remains open because the commit is local. |
| #246 | `f2326479` references #246. Five real Claude CLI/controlled-gateway integration cases plus adapter/import/UI component regressions pass. Original Windows/gateway login behavior remains unverified, so no closure keyword. |
| #244 | Runtime/config fixes were already committed, pushed and included in replacement 0.6.1. Current macOS native Codex lifecycle and real GUI distribution/restart pass. Original Windows Store-only GUI remains open, not a missing local commit. |
| #209 | Existing storage fixes and startup regression pass. Real Electron close → external CLAUDE.md edit → reopen preserves external bytes and presents a conflict; explicitly accepting the external copy survives another reopen. Closed remotely at 2026-10-22T09:38:48Z. |
| #190 | Existing `3607c4c3` dual-manifest repair accepted: the exact ayghri/i-have-adhd URL imports (0.4.1) and exposes both native Codex/Claude targets. A harmless dual-native fixture also installs to both and survives restart. Initial Git attempts lacked the existing proxy variables; inheriting the same routing resolved download without product changes. Closed remotely; original Windows and execution of upstream hooks are not claimed. |
| #185 | The new real Electron/live Web test found binary snapshots rejected with HTTP 422. `c4369236` fixes the route and includes `Closes #185`. Upload, local removal, three restore/restart cycles preserve binary package bytes and history. Remote remains open; matching corrected Web deployment is required. |
| #141 | Original URL and name reproduced in real GUI: anthropics/skills loads 20 current entries and unchanged cache survives full restart. A separate source-switch loading race was fixed in `f51eee2f` with `Refs #141`; original 15-count/empty-list state remains unconfirmed. Keep open pending its exact saved state. |

Verification on this checkout:

- Desktop focused batch: 17 files / 171 tests passed (provider CRUD/auth,
  Rules startup, Plugin import/native/overlay, self-hosted service and remote
  source loading). After the loading repair, the affected file passed 20 tests.
- Core native Codex/runtime batch: 2 files / 6 tests passed. Real CLI processes
  and isolated native configuration were used, not production accounts.
- Web initial sync batch: 5 files / 33 tests passed. Binary backup follow-up:
  3 files / 24 tests passed, including validation and failure preservation.
- Headed Electron `plugin-operation-feedback.spec.ts`: passed; progress and
  success Toast, automatic picker close, horizontal repeat actions, light/dark.
- Headed Electron `self-hosted-skill-roundtrip.spec.ts`: passed against a real
  local Web process. Reporter deployment and Windows are unavailable.
- Production build, Desktop source typecheck, Web typecheck and focused ESLint
  passed. Whole Desktop test typecheck is blocked by a concurrent unrelated
  `workspace-refresh-controller.test.ts` import of missing
  `createWorkspaceRefreshController`; it is not reported as passing.
- Runtime-only fixtures use isolated HOME/profile roots. No daily Agent files,
  credentials, installed app or unrelated processes were modified.
- Final file-size gate, seven spec governance tests, generated index and
  traceability checks passed; Web server production build passed. Test app/server
  processes were closed and disposable profiles removed. Acceptance screenshots
  remain under the task's OS temporary evidence directory, not the repository.

- [#245](https://github.com/legeling/PromptHub/issues/245): Desktop 0.6.1 cannot
  delete an extra custom provider. The user confirmed Settings → AI Configuration
  on 2026-10-22; the issue itself has no screenshot. Before repair, Model Services
  had no provider delete control, and store deletion detached rather than removed
  associated models, allowing the provider group to reappear. The local repair follows the
  [Desktop contract](../../knowledge/behavior/desktop.md#model-services-provider-crud-245).
  Agent provider profiles are independent records with existing CRUD and must
  be verified separately, not deleted as a side effect.
- [#246](https://github.com/legeling/PromptHub/issues/246): Windows x64 / 0.6.1;
  a custom Anthropic-compatible gateway configured in Claude settings with an
  API key and a non-Claude model still requests `/login`. The report's claim
  that `ANTHROPIC_API_KEY` is obsolete is not established: official docs describe
  both API-key and Bearer-token authentication. Record official contracts and
  implementation gaps in the existing Claude capability research. The subsequent
  request authorizes implementation and isolated native acceptance, starting with
  import authentication selection and model precedence (FR-AGENT-122). Daily
  account/configuration changes and paid third-party requests remain out of scope.

The subsequent issue audit authorizes scoped commits and closure of verified
resolved issues. Push and release remain outside scope. The user authorized
isolated macOS GUI acceptance; no original Windows or self-hosted environment is
available.

### #245 local verification

- Added a destructive confirmation with provider name/model count and seven-locale
  copy. Provider deletion removes its models and stale defaults in one persisted
  settings write; model-derived groups use the same removal operation. Failed
  writes leave renderer state unchanged. Editing a provider no longer overwrites
  model display names or issues duplicate per-model writes.
- `apps/desktop/tests/integration/model-services-provider-crud.test.ts`: **3 passed**.
  The lifecycle case covers create/read/edit/delete, two same-endpoint providers
  with distinct IDs, unrelated-record preservation, route cleanup and final empty
  state after real SQLite close/reopen. The other cases cover failed-write
  preservation/retry and one-write model-derived removal. The lifecycle case
  intentionally exceeds 50 lines to keep one profile's successive reopen states
  together. Electron transport, renderer cache and unrelated shell APIs are
  substituted; initialization, registered settings IPC, persistence and hydration
  are real. Empty credentials avoid OS-keychain or external-provider claims.
- `apps/desktop/tests/unit/components/ai-settings-prototype.test.tsx`: **38 passed**,
  including `confirms provider deletion`, `deletes a model-derived provider`, and
  `reports failed provider deletion`. These exercise confirmation/cancellation
  and notifications with a mocked store, not native Electron acceptance.
- Related unit suites: `tests/unit/stores/settings-ai-models.test.ts` **11 passed**,
  `tests/unit/components/ai-workbench-endpoints-section.test.tsx` **1 passed**,
  `tests/unit/services/ai-workbench-locales.test.ts` **8 passed** (desktop-relative).
  Independent Agent provider CRUD: existing
  `apps/desktop/tests/integration/release-acceptance-agents-assets-providers.test.ts`
  **2 passed**, without changing that feature.
- Regression sensitivity: an isolated Vitest transform loaded the original
  `HEAD` version of `EndpointsSection.tsx` without changing the checkout. Filtering
  `confirms provider deletion` exited **1**, because the `Delete provider` button
  was absent (one failed case, 37 excluded), not because of compilation/setup.
- Production build, test-inclusive typecheck, scoped ESLint and file-size checks
  passed. `pnpm spec:test` passed seven governance cases, index validation and
  traceability for 13 changes. New integration tests are included by the normal desktop integration
  glob and root `desktop-integration` gate. The full release harness was not run.
- Work is linear in providers, models and route references, with one settings
  publication per group removal and no external model request. No new dependency,
  schema, compatibility parser or production configuration is introduced.
- Authorized macOS Electron acceptance passed on 2026-10-22: create an empty
  provider through Model Services, cancel deletion and retain it, confirm deletion
  with success Toast, then close/reopen and verify the provider list remains empty.
  The profile and HOME were isolated. Windows GUI is not covered.

Reproduce from the repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project integration tests/integration/model-services-provider-crud.test.ts tests/integration/release-acceptance-agents-assets-providers.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/ai-settings-prototype.test.tsx tests/unit/stores/settings-ai-models.test.ts tests/unit/components/ai-workbench-endpoints-section.test.tsx tests/unit/services/ai-workbench-locales.test.ts --minWorkers=1 --maxWorkers=1
pnpm typecheck:tests
pnpm lint:file-size
pnpm build
pnpm spec:test
```

## Split Submission — 2026-10-19

The authorized main-branch push contains independent commits:

| Commit | Scope | Issue boundary |
| --- | --- | --- |
| `f1faa73f` | Keep same-platform Rules visible and selectable | Closes #196; remote closure verified at 07:18 UTC. Not released. |
| `2da40ad6` | Historical backup import and removal of redundant ordinary-export snapshots | Refs #221; original-profile and Windows acceptance remain open. |
| `96528645` | Ordered Prompt workspace migration and recovery-only startup | Refs #221; native Windows/report-specific acceptance remains open. |
| `e4461bce` | Initial Agent scan and installation readiness | Refs #240; native Electron/Linux acceptance remains open. |
| `63189663` | Claude Git and Antigravity ZIP marketplaces | Refs #242/#243; native GUI/Agent loading remains open. |

The previously committed updater change `64aea2b1` was included without rewriting
it. Source/test/build evidence remains in the sections below and commit bodies.
After these changes, the two #209/#236 integration regressions passed again
through real initialization, preload/IPC and reopen; 15 unrelated cases were
excluded by the name filter. No original Windows crash claim follows from this.
The refreshed GitHub snapshot contains 36 open and 181 closed issues. Generated
diagnostic output and installed test artifacts under `output/` are excluded
from source commits and retained locally. No tag, binary upload or release.

## Release Baseline

GitHub confirms [v0.6.0](https://github.com/legeling/PromptHub/releases/tag/v0.6.0)
was published at `2026-10-18T06:15:03Z`, stable and not Draft. The remote annotated
tag `408d2f412a2b99d4f86cb31e25aff5115d047e15` points to
`36401160d6370320cbc98e3421ff3be580aa0a9b`.
[Tag CI run 39093101574](https://github.com/legeling/PromptHub/actions/runs/39093101574)
is successful at that same commit. Detailed platform boundaries remain in the
[release record](../../releases/0.6.0.md).

The local tag still points to `46c4d1ff`; it was not changed by this review.
All release inclusion checks below use the remote commit SHA, not the stale local
tag or current main. In particular, `c99f5079` cross-client resource changes and
their later failing CI are **post-release**, not the contents of these binaries.

The initial seven-fix source review was refined by real Electron reproduction:
**#241, #216, #210, #191 and #188** were confirmed and closed with 0.6.0 comments.
**#196 is not fully fixed in 0.6.0**: discovery works, but platform-keyed sidebar
ordering loses sibling rules. **#239 remains open** pending native Windows
verification; the safe local identity passed macOS IPC/persistence/reopen.
The other 35 are 17 partial/support items, 6 needing exact reproduction and
12 unmet requests or confirmed gaps. The later priority diagnosis below confirms
#240's cold-entry selection defect without changing product code.
#205's workflow adoption and #139/#71's guidance can be answered as support or
maintenance items, not additional product fixes.

## Per-Issue Review — 2026-10-19

This table retains all 42 originally reviewed reports; six rows are now closed.

| Issue | 0.6.0 结论 | 原问题 | 发布版证据与范围 | 剩余验收 / 处理建议 |
| --- | --- | --- | --- | --- |
| [#243](https://github.com/legeling/PromptHub/issues/243) | 0.6.0 未解决；本地已修复 | 第三方 Claude/Antigravity 插件市场 | 发布版只取对象 `source.path` 并推导 Codex manifest；本地已补目录/外部 Git/ref/sha 与 Claude manifest，真实上游安装与重开通过。 | 未发布；原生 GUI/Agent 加载未验收，Git 预览数量限 manifest 声明；详见下方修复验证。 |
| [#242](https://github.com/legeling/PromptHub/issues/242) | 0.6.0 未解决；本地已修复 | Antigravity 官方 ZIP 市场 | 本地已补 `source.type=archive`、SHA-256、安全解包与整包安装；真实官方 gdocs 安装和重开通过。 | 未发布；保留归档完整性/失败保全独立验收，不等于原生 Agent 加载成功。 |
| [#241](https://github.com/legeling/PromptHub/issues/241) | 已关闭（0.6.0） | Skill 首屏计数/角标不一致 | `4192754b` 将 `skillPlatformStatuses` 与 `deployedSkillNames` 在同次扫描发布，列表/画廊共享；已有首次加载与重开组件回归（E2）。 | 已真实 Electron 复测并按授权关闭，具体范围见下方 Follow-up verification；报告者原 profile/未测平台不作扩大结论。 |
| [#240](https://github.com/legeling/PromptHub/issues/240) | 0.6.0 确认缺陷；本地已修复 | 空 Agent 的安装弹窗无法勾选 | 首次自动选择未扫描导致空目标目录；本地已补扫描编排、未就绪/失败状态，原组件红测及失败恢复通过。 | 未发布；组件 IPC 模拟，真实 Electron/Linux 安装尚未验收。 |
| [#239](https://github.com/legeling/PromptHub/issues/239) | 修复已发布 | Windows MCP 市场目录含冒号 | `811c3cb0` 的 `installMcpTemplate` 用 `createId("mcp")` 生成本地 ID，市场 ID 仅留在 source；E1 覆盖冒号、斜杠、CON、历史、重开和失败回滚。 | 原新安装路径缺陷可按 0.6.0 复测；既有非法 ID 数据迁移、报告者 Windows 安装并未在本轮重做。 |
| [#236](https://github.com/legeling/PromptHub/issues/236) | 用户复测通过 | Windows 新建 Prompt 崩溃 | 2026-10-19 用户明确反馈 Windows 新建 Prompt 不再崩溃；此前 preload/IPC 创建、编辑和重开检查也通过。 | 非本轮 Agent 原生 Windows 验收；本轮未授权关闭，不直接归并备份或升级问题。 |
| [#221](https://github.com/legeling/PromptHub/issues/221) | 旧 ZIP 本地已修复 | 备份/导入失败及新建失败 | 导出 DB 重绑已修复；2026-10-19 旧 ZIP 显式转换器已通过预览、非空 ZIP/JSON/gzip 恢复、重开、重复导入和发布失败回滚；普通完整导出不再重复创建安全快照。 | 未提交或发布。合成历史格式 fixture 不代表报告者原包或 Windows GUI；覆盖安装启动报错仍须独立定位。详见 backup-connection-rebind 记录。 |
| [#216](https://github.com/legeling/PromptHub/issues/216) | 已关闭（0.6.0） | 升级 Loading / renderer snapshot 超限 | 发布版 `collectLegacyRendererPersistence` 只迁移用户来源配置，不携带可重建市场缓存；E3 覆盖大缓存、真实发布/重开和失败保全。 | 已真实 Electron 复测并按授权关闭，具体范围见下方 Follow-up verification；报告者原 profile/未测平台不作扩大结论。 |
| [#215](https://github.com/legeling/PromptHub/issues/215) | 本地完成，未发布 | partial clone / sparse checkout | 2026-10-20 已知目录的 Skill 预览、安装、检查和更新使用 Core 稀疏获取；根目录与未知目录保留既有发现流程。 | [合同与验证](../../knowledge/behavior/skills.md#git-directory-acquisition-215)：237 项回归通过；真实 GitHub 同提交完整包一致、磁盘占用减少，本次耗时增加，不宣称普遍提速；Windows/GUI 未验收。 |
| [#212](https://github.com/legeling/PromptHub/issues/212) | 部分完成 | Instructions 与 Scoped Rules 拆分 | 发布版已支持 Claude 用户级 scoped 文件，但 UI/领域仍为 Rules，未交付请求中的独立 Instructions/Scoped Rules 模块。 | 与 #197 分开记录；命名、数据迁移与作用域需要明确产品方案。 |
| [#210](https://github.com/legeling/PromptHub/issues/210) | 已关闭（0.6.0） | 恢复覆盖外部规则及丢历史 | `f63d92f3` / `05d99f25` 和当前导入边界仅恢复管理副本，外部目标不写；E4 检查历史合并、目标不变与失败回滚。 | 已真实 Electron 复测并按授权关闭，具体范围见下方 Follow-up verification；报告者原 profile/未测平台不作扩大结论。 |
| [#209](https://github.com/legeling/PromptHub/issues/209) | 待复现 | 重开自动覆盖手改 CLAUDE.md | #210 导入写外部目标已修；仍缺“关闭→vim→重开”原触发链的确定复现。 | 对启动恢复/自动同步路径补隔离重开验证，不先合并为 duplicate。 |
| [#205](https://github.com/legeling/PromptHub/issues/205) | 部分完成 | 第三方 PR 安全扫描建议 | `1df96686` 已合并 PR #206，`440c5845` 校验报告并使用 pnpm；`.github/workflows/threatcrush-scan.yml` 已纳入 tag。 | 提议已经采纳，可按维护事项回复；扫描器成功运行/SARIF 上传须另核，不把流程接入称为安全无漏洞。 |
| [#204](https://github.com/legeling/PromptHub/issues/204) | 未解决 | 迁移 npx skills 配置 | 已有本地目录完整包导入，但没有该工具配置/版本/来源元数据的专门迁移合同。 | 确认上游实际结构和版本，再定义冲突、增量及来源更新；不能照 issue 中猜测路径实现。 |
| [#203](https://github.com/legeling/PromptHub/issues/203) | 部分完成 | 集中管理所有辅助/备份文件 | MCP SQLite 历史、派生配置、legacy sidecar 预览清理已经实现；原 issue 覆盖所有域和所有临时/适配文件。 | 完成跨域文件清单、保留策略与三平台迁移验收后再判整体完成。 |
| [#198](https://github.com/legeling/PromptHub/issues/198) | 未解决 | 手动刷新整个工作区 | 领域内部刷新不等于跨 Prompt/Skill/Rules 的一致刷新与草稿保护；现有 active change 仍是设计。 | 验证外部 CLI 写入、列表/详情/计数/筛选及未保存草稿共同刷新。 |
| [#197](https://github.com/legeling/PromptHub/issues/197) | 部分完成 | 跨 Agent 规则目录矩阵 | Claude 用户级 `rules/**/*.md` 已支持；其他主要平台、项目级目录和原生优先级实测矩阵不完整。 | 沿用 `rules-agent-source-matrix`；不要把 #196 单平台交付扩大为全部平台。 |
| [#196](https://github.com/legeling/PromptHub/issues/196) | 已提交并关闭，未发布 | Claude 用户级 Rules 扫描与显示 | `1382d9aa` 扫描已发布；真实 Electron 能读 4 个文件而侧栏仅列 1 个，根因是 platformId 覆盖。`f1faa73f` 修复分组并已推送。 | 定向回归及真实 Electron 搜索/选择/重扫/重开通过，远端自动关闭已核实；不宣称已在 0.6.0 完整修复。 |
| [#195](https://github.com/legeling/PromptHub/issues/195) | 未解决 | 导出每张 Prompt 参考图片 | 已有生成结果下载，但 `PromptReferenceImages`/预览没有等价的逐张参考媒体导出验收。 | 明确从托管原文件复制到用户选择位置并验字节；不要拿生成图下载代替。 |
| [#194](https://github.com/legeling/PromptHub/issues/194) | 部分完成 | 共享 ~/.agents/skills | 实验共享目标、所有权/卸载和重复风险说明已存在；原 issue 要求的多 Agent 原生消费与三平台兼容矩阵仍未齐。 | 保留实验范围，补实际兼容矩阵；专属目录与共享目录语义不能合并。 |
| [#191](https://github.com/legeling/PromptHub/issues/191) | 已关闭（0.6.0） | safetyReport.scanMethod 拒绝备份 | `98594215` / `45f70a81` 等统一 provenance；当前 ai/preflight 保留，legacy static 归一；E6 覆盖备份 codec→SQLite 重开→展示。 | 已真实 Electron 复测并按授权关闭，具体范围见下方 Follow-up verification；报告者原 profile/未测平台不作扩大结论。 |
| [#190](https://github.com/legeling/PromptHub/issues/190) | 部分完成 | 原生 Claude Plugin 未识别 | `37a20820` 等补齐本地 Claude/Codex manifest 和包/原生生命周期；既有隔离 CLI 验收在适配审计。 | 原 Windows + ayghri/i-have-adhd 报告仍需精准复测；与 #242/#243 远端市场解析缺陷分开。 |
| [#188](https://github.com/legeling/PromptHub/issues/188) | 已关闭（0.6.0） | 我的 Skill 标签搜索 | `SkillTagSearchFilter`、统一候选/过滤及 frontmatter 设置均在 tag；E7 覆盖搜索、多选、清空、陈旧标签和共享语义。 | 已真实 Electron 复测并按授权关闭，具体范围见下方 Follow-up verification；报告者原 profile/未测平台不作扩大结论。 |
| [#185](https://github.com/legeling/PromptHub/issues/185) | 部分完成 | 自部署 Skill 反复恢复/本地 URL 失败 | source_url 清理、稳定身份/文件/历史映射及自部署 schema 修复均在 tag；已有 scoped sync 测试。 | 原真实服务器的连续 push/pull/重开和部署镜像仍需确认，不以桌面 release 证明其服务已更新。 |
| [#177](https://github.com/legeling/PromptHub/issues/177) | 未解决 | SkillHub 集成 | 已有市场框架不等于 skillhub.cn 协议适配；仍是 marketplace-expansion 的待实现项。 | 确认正式来源/API/包授权及安装更新合同。 |
| [#145](https://github.com/legeling/PromptHub/issues/145) | 部分完成 | 标签管理界面改进 | 用量、排序、Prompt 标签跳转已进入 tag，TagManagerModal 测试存在；issue 主要以截图描述。 | 确认截图诉求是否全部覆盖，再作整体关闭判断；不凭标题推定完整范围。 |
| [#141](https://github.com/legeling/PromptHub/issues/141) | 待精准复现 | 自定义 Skill 商店无结果 | 原截图实际包含 `https://github.com/anthropics/skills`、商店名 `my` 和 15 条计数；此前“没有 URL”的判断有误。当前 15 条自定义缓存渲染及重新水合回归通过。 | 已另行复现并修复远端源切换时加载状态丢失，不把它推定为原截图空列表的同一根因。 |
| [#139](https://github.com/legeling/PromptHub/issues/139) | 部分完成 | 导出/导入迁移经验 | 这是经验/支持条目；备份迁移说明卡与 ZIP 导入引导已发布，并非一个仍待实现的明确 bug。 | 可作为文档已覆盖的支持答复；不能保证所有旧版本数据恢复。 |
| [#132](https://github.com/legeling/PromptHub/issues/132) | 未解决 | Prompt 商店 | Skill/Plugin 商店不是 Prompt 模板商店；marketplace-expansion 未交付本需求。 | 定义模板来源、浏览、导入及授权，不能用其他商店替代。 |
| [#107](https://github.com/legeling/PromptHub/issues/107) | 部分完成 | Docker HTTP 图片上传/粘贴 | 发布版 Web bridge 有 randomUUID 不可用回退及对应测试；文件选择器走上传入口。 | 评论另报告局域网图床；真实 HTTP 浏览器文件选择和私网 URL 策略未验收，不能把粘贴单测当全部解决。 |
| [#106](https://github.com/legeling/PromptHub/issues/106) | 部分完成 | 云部署多用户共享/私有 | 自部署 Web 已有用户鉴权、owner/visibility 和共享记录权限；不是完整团队协作合同。 | 确认用户所指分享/协作边界，部署与并发协作另验；不是“完全没有多用户”。 |
| [#98](https://github.com/legeling/PromptHub/issues/98) | 待复现 | 0.5.2 中间 Prompt 历史丢失 | 历史迁移/完整版本保全有相关 fixture，但没有报告者丢失的中间版本样本。 | 按历史备份核对有序版本和恢复读回；当前全量通过不能恢复已丢失数据。 |
| [#97](https://github.com/legeling/PromptHub/issues/97) | 待复现 | 0.5.1 备份无法用于 0.5.2 | 发布版已有旧数据恢复/迁移说明，但该具体旧备份格式与失败信息缺失。 | 区分 portable backup 与 upgrade snapshot；需旧样本和前后数量/字段验证。 |
| [#92](https://github.com/legeling/PromptHub/issues/92) | 未解决 | Windows Smart App Control 阻止安装 | Windows 打包/两次启动 smoke 通过不等于 Authenticode 信誉或 Smart App Control 放行。 | 签名/发行信誉与干净 Windows 验收单列，不能用 macOS 签名结果代替。 |
| [#89](https://github.com/legeling/PromptHub/issues/89) | 待复现 | Windows 升级后数据不可见 | 0.6.0 有旧路径/历史恢复与数据安全门禁，但原机具体路径、旧 DB 内容和升级版本不全。 | 只读定位原数据和匹配历史路径 fixture；不保证消失数据已经找回。 |
| [#79](https://github.com/legeling/PromptHub/issues/79) | 部分完成 | Skill WebDAV 同步 | 快照携带 Skill、版本及完整文件；手动同步计数/历史可观测性已发布。 | 仍需报告者真实 WebDAV 的包字节与重复恢复验收，不能只验 SQLite 数量。 |
| [#74](https://github.com/legeling/PromptHub/issues/74) | 部分完成 | 启动时隐藏指定文件夹 | 上次/固定文件夹启动模式已发布，但不是每个文件夹是否加入启动列表的设置。 | 澄清隐藏范围和入口，不按 startup-folder restore 已有实现关闭。 |
| [#71](https://github.com/legeling/PromptHub/issues/71) | 部分完成 | 无登录换设备如何保留数据 | 本地存储、完整备份/恢复和迁移说明已存在，属于支持问题，不需要凭空加账号依赖。 | 可说明无登录也可备份迁移；设备路径/凭据重新配置与真实跨设备验收分开。 |
| [#64](https://github.com/legeling/PromptHub/issues/64) | 部分完成 | 旧版安全密钥、图片上传及入口 | 安全错误本地化和媒体入口改善已发布，但未知密钥错误及原 Windows 上传失败缺少日志。 | 拆分已交付体验改进与未定根因的失败，不能全项标解决。 |
| [#44](https://github.com/legeling/PromptHub/issues/44) | 部分完成 | Windows 自启最小化及附加建议 | 发布版 main 读取 --hidden/wasOpenedAsHidden/持久化最小化设置；system Prompt 复制存在。 | 真实 Windows 登录启动未在本轮重测，附加多轮消息编辑不是同一缺陷，仍需单独验收。 |
| [#27](https://github.com/legeling/PromptHub/issues/27) | 未解决 | GitHub/Gitee 数据备份 | WebDAV/S3 和 Git Skill 来源不是 Git 远端备份传输；git-backup-transports 仍为设计。 | 明确加密快照、凭据及远端读写合同后实施。 |
| [#15](https://github.com/legeling/PromptHub/issues/15) | 未解决 | 可分发 Android/iOS 客户端 | 仓库有 Mobile 代码和测试，但本次稳定 release 的 20 项资产没有 APK/IPA。 | 设备、WebDAV、签名与分发验收未齐；源码存在不等于移动端产品交付。 |

## Targeted Evidence

Paths below are repository-relative and exist in `36401160`. Existing CI and
historical results are attributed to their records; this review does not rename
them as newly executed GUI or Windows tests.

| Evidence | Exact regression / observable assertion |
| --- | --- |
| E1 / #239 | `packages/core/tests/mcp-market-installation.test.ts`: colon/slash/reserved market IDs install under a separate local ID; original source, version files, SQLite reopen, updates/rollback and existing bindings are preserved. |
| E2 / #241 | `apps/desktop/tests/unit/stores/skill-distribution-status.test.ts` publishes counts/icons together; `apps/desktop/tests/unit/components/skill-distribution-loading.test.tsx` observes no false “Not distributed” during pending lookup and real component icons after lookup/reopen. IPC is mocked; not an Electron acceptance. |
| E3 / #216 | `apps/desktop/tests/unit/services/renderer-persistence.test.ts`, `apps/desktop/tests/unit/main/settings-renderer-persistence-ipc.test.ts`: cache-heavy legacy input, persisted source config, failure and retry; transport substitution is explicit. |
| E4 / #210 | `apps/desktop/tests/unit/main/rules-workspace-import.test.ts`: actual filesystem targets/history and import failure preservation; details in `spec/changes/active/rules-managed-copies/implementation.md`. |
| E5 / #196 | `apps/desktop/tests/unit/main/claude-scoped-rules.test.ts`: native directory discovery, file content/reopen, external changes, missing files and path safety. |
| E6 / #191 | `apps/desktop/tests/unit/components/skill-safety-provenance-roundtrip.test.tsx`: actual codec, SQLite close/reopen, renderer normalization and report labels; not a remote upload. |
| E7 / #188 | `apps/desktop/tests/unit/components/skill-tag-search-filter.test.tsx` plus existing `skill-filter`, `skill-stats` and `skill-i18n-manager` suites cover normalized tag selection/filtering and stale selection cleanup. |

### Initial unit execution — 2026-10-19

A `git archive` of `36401160` was tested in an isolated OS temporary directory,
reusing installed dependencies with workspace links directed at that snapshot.
No source or test was patched, no dependencies installed and no user profile used.

Run from that snapshot's repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/services/renderer-persistence.test.ts \
  tests/unit/main/settings-renderer-persistence-ipc.test.ts \
  tests/unit/main/rules-workspace-import.test.ts \
  tests/unit/main/claude-scoped-rules.test.ts \
  tests/unit/components/skill-safety-provenance-roundtrip.test.tsx \
  tests/unit/components/skill-tag-search-filter.test.tsx \
  tests/unit/components/skill-distribution-loading.test.tsx \
  tests/unit/stores/skill-distribution-status.test.ts \
  --minWorkers=1 --maxWorkers=1

pnpm --filter @prompthub/core exec vitest run \
  tests/mcp-market-installation.test.ts --minWorkers=1 --maxWorkers=1
```

- Desktop: **8 files / 61 tests passed**, exit 0, 19.28 seconds.
- Core: **1 file / 5 tests passed**, exit 0, 2.70 seconds.
- Total: **66 passed**, no skipped cases. Execution used Node 26.11.1 and pnpm
  9.15.0 on macOS; these timings are not cross-platform performance guarantees.
- React `act(...)` warnings occurred in the distribution loading component test;
  the assertions passed. An injected scan-failure log is expected by the recovery
  test, not a real scan failure. No warning or assertion was suppressed.
- No new defect mutation, real Electron/browser session, native Windows run,
  reporter profile, live remote sync or full release-harness rerun was performed.
  The successful release CI is separately attributed above.
- Documentation checks: `pnpm --config.verify-deps-before-run=false spec:test`
  passed all five governance tests, index validation and 16 opted-in change
  traceability checks; `git diff --check` passed. A structural check confirms
  the 42/175 disjoint snapshot partition, exactly 42 review rows, complete open
  overlay coverage, 12 cited commit ancestors and all nine release test paths.
- Only the five issue documentation files were updated. The owned release
  snapshot was moved to Trash (recoverable), all test commands exited, and
  unrelated `output/` is preserved.


## Follow-up verification — 2026-10-19

Published commit `36401160` was built with existing dependencies and exercised
through real Electron/preload/IPC with an isolated HOME/profile/keyring:

- #241: first visit after restart showed Distributed 1 / Pending 2, the Codex
  icon, and the matching one-item filtered list before opening any detail.
- #188: tag search, two-tag OR selection, and clear returned 1 / 2 / 3 cards.
- #216: 12,583,815 UTF-8 bytes of synthetic legacy cache exceeded the existing
  8 MiB snapshot limit; startup migration preserved source settings and a second
  full restart succeeded. This was not the reporter's historical profile.
- #210: divergent and empty imports preserved external rule bytes and the two
  prior histories. Full logical restore/restart retained all three merged
  histories and exposed the conflict choice instead of overwriting the target.
- #191: `ai`, `preflight`, and restored legacy `static` records were uploaded by
  the actual backup button to an isolated same-version Web server;
  `POST /api/backups/desktop` returned 201 with three Skills. Raw restored legacy
  data may retain `static`; the remote snapshot boundary accepts/normalizes it.
- #239: the reported colon-bearing market ID installed under a separate local
  ID, preserving source identity, version file and data after restart on macOS.
  Native Windows remains unverified, so the issue stays open.
- #196: discovery/read/reopen returned four Claude files, but the sidebar showed
  one. Nested filename search could open the hidden file. The published release
  therefore does not satisfy complete directory management.

The five confirmed issues were commented on with the release, exact regression
commands and evidence boundaries, then closed. GitHub confirmed 37 open / 180
closed. Test processes were stopped; disposable profiles/builds were removed.

### Local #196 follow-up (unpublished)

The renderer ordering owner now groups files by platform without collapsing
Rule IDs, preserves inventory order within each platform, and leaves project
rules separate. It adds no state, schema, dependency, I/O or migration. Time and
space remain O(n + p) for n files and p platform-order entries. Reverting this
selector change restores prior display behavior without changing stored data.

Regression additions are in `apps/desktop/tests/unit/services/rule-platform-order.test.ts`,
`apps/desktop/tests/unit/components/rules-sidebar-panel.test.tsx` and
`apps/desktop/tests/unit/stores/rules.store.test.ts`. They cover same-platform
siblings, same filename/different path, preferred order, project separation,
selection, nested search, no-match and clear. Component/store transport is mocked;
these do not by themselves prove native GUI or filesystem acceptance.

Verification used an isolated archive of `342ea876` plus only the four owned
source/test files, excluding concurrent updater/release changes:

```sh
pnpm --filter @prompthub/desktop exec vitest run \
  tests/unit/services/rule-platform-order.test.ts \
  tests/unit/components/rules-sidebar-panel.test.tsx \
  tests/unit/stores/rules.store.test.ts \
  tests/unit/components/rules-manager.test.tsx \
  tests/unit/main/claude-scoped-rules.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec tsc --noEmit -p tsconfig.test.json
pnpm --filter @prompthub/desktop build
```

- Five files / 35 tests passed. Scoped ESLint passed. Type checking initially
  found two widened fixture IDs; explicit `RuleFileDescriptor` annotations fixed
  them, and the full source/test type check passed. The affected two component
  tests and lint were rerun successfully; runtime source was unchanged.
- Restoring only the pre-fix selector in the temporary copy made all three
  targeted new regression assertions fail with exit 1 (missing files in the
  selector, store and component). The fixed selector was restored afterwards.
- Production build passed, with existing Vite deprecation/chunking warnings.
- Real isolated macOS Electron displayed all four Claude entries; clicking the
  nested rule showed its content. Nested-path search returned one, no-match zero,
  clearing/rescanning four, and closing/reopening four. Light/dark views were
  captured; original YAML frontmatter remained unchanged.
- `spec:test` passed five governance tests, index and 16 traceability checks.
  Native Windows and the complete release harness were not rerun.

No commit, push, publication or #196 closure. Test processes are stopped and
temporary build/profile data removed; scoped screenshots remain as diagnostics.

## Priority Bug Diagnosis — 2026-10-19

Diagnosis uses isolated main `342ea876` with existing dependencies and synthetic
profiles. Concurrent updater/UI changes are excluded. No product fix, GUI
automation, Windows execution, remote comment or issue closure is part of this
diagnosis. Test additions preserve the expected behavior rather than accepting
the observed defect.

- **#240 confirmed:** `loadPlatforms()` selects the first Agent but does not scan
  it; scanning occurs only through explicit selection/refresh/install follow-up.
  `fixedTargetDirs` therefore stays empty, and `toggleSkill()` returns without
  changing selection. `skill-agents-view.test.tsx` now covers cold entry and the
  explicit-selection control. The cold-entry assertion remains red
  (`aria-pressed=false`, expected `true`); the control passes. Existing tests
  prefilled `agentScanState`, masking this entry condition. Scanning/selection
  production files are identical to `36401160`. The stable requirement already
  requires scanning on first entry; this is an implementation gap, not a new
  requirement. No package installation or native Linux interaction is proven.
- **#209 not reproduced at the storage/startup boundary:**
  `rules-external-edit-startup.test.ts` saves a managed Claude rule, closes the
  real database, externally edits the target, then reopens through actual
  storage initialization, bootstraps and scans. Two reopen cycles preserve
  external bytes; the managed body stays separate and reads `out-of-sync` with
  both versions. Electron transport/HOME are substituted, not storage. Native
  app lifecycle, legacy reporter profile and automatic remote sync remain open.
- **#236 not reproduced through preload/IPC:** the added test in
  `release-acceptance-prompts-ai-workflow.test.ts` creates a Prompt, reopens the
  runtime, creates/edits another, reopens again, then reads both bodies and IDs.
  SQLite, initialization and handlers are real; Electron transport is replaced.
  This does not exercise the renderer editor or Windows crash. The issue has no
  crash stack or follow-up diagnostic data, so root cause remains unknown.
- **#221 incomplete reporter evidence:** two portable export lifecycle tests
  pass (dependency-injected close/reopen/rebind), and two selected actual
  database recovery tests pass (business IDs/versions/files plus partial-write
  rollback and retry). These do not reproduce the original 0.5.9 backup or the
  ambiguous `6.0.12` version. Subsequent white-box investigation confirmed and
  locally repaired the separate historical ZIP layout incompatibility; current
  evidence and remaining Windows/report-specific limits are recorded in
  `ISS-20261014-001-backup-connection-rebind.md` and the table above.
- **#107 split by failure:** the missing-browser-UUID paste case passes; all
  14 media route tests and 27 remote HTTP tests pass. File picker cleanup is a
  simulated DOM check, not an actual browser picker. Remote URL import requires
  HTTPS and rejects private/loopback destinations; that explains the LAN URL
  rejection class, not the reporter's unspecified URL. Do not remove the SSRF
  boundary to make LAN import pass. The broader Web run is **not green**:
  55 pass / 1 fail because an existing Skill-file test expects an unsupported
  operation after main added hosted file writes. That unrelated expectation
  drift is left unchanged and is not an image-upload failure.

Reproduction commands from the repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/components/skill-agents-view.test.tsx -t '#240' \
  --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/rules-external-edit-startup.test.ts \
  tests/integration/release-acceptance-prompts-ai-workflow.test.ts \
  -t '#209|#236' --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/canonical-portable-export.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/release-acceptance-data-recovery-restore.test.ts \
  -t 'restores IDs|rolls back a real partial publication' \
  --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/web exec vitest run \
  src/client/desktop/install-bridge.test.ts src/routes/media.test.ts \
  src/utils/remote-http.test.ts --minWorkers=1 --maxWorkers=1
```

Name-filtered cases outside this scope were not run, not waived release gates.
The first diagnostic draft captured a detached loading button; it was corrected
to query the current rendered button before obtaining the #240 selection red
assertion. No product change was used to produce either result.

The saved regression batch selected four tests: **three passed / one failed**
(#240), with 30 unrelated cases excluded by the name filter. Desktop source/test
TypeScript and scoped ESLint passed. Diagnostic additions touch tests and issue
records only; the known failing regression intentionally remains in the regular
test entrypoint until its product fix. Temporary profiles and the isolated
snapshot are removed after diagnosis; no server or native app is retained.

## Local Repair Verification — 2026-10-19

- #240: the initial Agent selection starts one uncached scan. Pending scans and
  failures cannot open the install picker; failures are not empty inventories.
  Cache reuse and explicit refresh remain supported. The complete
  `skill-agents-view.test.tsx` suite passes 19 cases with mocked IPC.
- #242/#243: eight initial marketplace regression cases failed on the original
  implementation. The completed 10-case Core suite passes relative and external
  Claude sources, pinned real-Git root/subdirectory checkout, exact binary bytes,
  archive install/reopen, digest/path/duplicate/manifest rejection, and SQL
  publication rollback followed by retry. Four real SQLite ownership/lifecycle
  tests also pass. Source metadata survives normalization and reopen.
- Real upstream check used an isolated disposable profile: Claude official
  `code-review` and pinned `supabase` previews, Antigravity official `gdocs`
  0.0.6 preview, real remote Git and verified ZIP installation, then SQLite
  close/reopen with complete package trees (6 and 18 entries respectively).
  No plugin code, Agent registration, account authorization or GUI ran.
  Installed conventional-directory counts have a separate real-Git regression;
  remote Git previews still only establish manifest-derived inventory.
- Across 11 focused test files, 127 distinct cases pass: 19 Skill Agent
  component cases, 94 marketplace/source/distribution/version/UI/i18n cases,
  and 14 Core package/storage cases. Initial macOS symlink-temp-path fixture
  failures were repaired by canonicalizing the test directory, without relaxing
  product path validation; an incomplete materializer mock now contains a real
  manifest. Only affected failed files were rerun after fixture correction.
- Core and Desktop source/test TypeScript checks, scoped ESLint, file-line limits and Desktop
  renderer/main/preload production build pass. The first Core lint invocation
  was outside ESLint's base path; the repository-root invocation checked the
  files successfully. Full release gates, packaged Windows/Linux, GUI and native
  Agent loading are not claimed. No commit, publication or remote issue change.

## Marketplace and Windows Follow-up — 2026-10-20

The maintainer removed the 0.6.1 release and intends to publish it again. This
verification does not publish a replacement, change tags, or close issues.

- #242: the live Antigravity marketplace's `gdocs` 0.0.6 successfully previews,
  downloads with digest verification, installs its complete 18-entry tree and
  survives a real SQLite close/reopen in an isolated profile.
- #243: the live Claude official marketplace's `code-review` successfully
  previews, clones and installs its complete 6-entry tree, then survives SQLite
  close/reopen. The existing fix accepts Claude relative paths and uses the
  Claude manifest. These live checks use the shared library entrypoint; they
  do not claim GUI source-entry acceptance or native execution of these packages.
- #244: both current code and the withdrawn candidate already include the
  `plugin` command prefix. Confirmed defects were direct `execFile` invocation
  of Windows `.cmd` shims, absent Windows bundled-runtime discovery, and errors
  that hid the native failure phase/code. The local fix shares `cross-spawn`
  between command execution and Codex configuration RPC, recognizes Windows
  `Path` casing, discovers the registered Store package and active default VS
  Code extension, and reports sanitized operation/exit codes. Store package ACL
  failures are not bypassed.
- Verification: 39 selected checks pass (24 Core regressions, 11 Desktop unit
  cases, 2 real upstream cases, 1 native Codex lifecycle, 1 native Codex/Claude
  distribution lifecycle). The Windows shim case is skipped on macOS; two
  unrelated native integration cases are excluded by the selected test name.
  Core source and Desktop source/test TypeScript, scoped ESLint and Desktop
  renderer/main/preload production build pass. The initial Desktop failure was
  the macOS `/var` symlink test root; canonicalizing the fixture fixed it without
  relaxing production validation.
- Windows 11 end-to-end acceptance remains open because no Windows machine is
  available. Local macOS native tests use disposable homes and harmless fixtures;
  no account login, model call, MCP call or hook execution is included. Test
  profiles and processes are cleaned up.

Reproduce upstream checks with `PROMPTHUB_UPSTREAM_PLUGIN_TESTS=1 pnpm --filter
@prompthub/core exec vitest run tests/plugin-upstream-marketplace.test.ts`.
If the environment requires its configured HTTP proxy for Node fetch, also set
`NODE_USE_ENV_PROXY=1`. Native checks remain opt-in via
`PROMPTHUB_NATIVE_AGENT_TESTS=1`; use an OS temporary path with canonical parents.

Submission and remote follow-up (2026-10-20): the maintainer subsequently
authorized scoped commits and issue closure without pushing. Local commits
`58199ef6` and `54575191` separate Codex native management from the Windows
runtime fix. #242 and #243 were closed with report-specific verification
comments and their CLOSED state was read back; #244 remains OPEN with the
Windows acceptance gap. The refreshed remote snapshot has 35 open / 183 closed
issues. None of these actions establishes a replacement 0.6.1 release.

## Four-report recheck — 2026-10-20

GitHub readback confirms #240, #239, #236 and #221 remain open, with no
additional reporter diagnostics. Current checkout `00488b9d` includes the
earlier fixes and unrelated uncommitted Plugin work; it is not a frozen release
candidate. The recheck itself made no commit, push, release or remote issue mutation.
After reviewing the macOS results and remaining platform limits, the maintainer
authorized separate local commits with automatic closure of all four reports
when subsequently pushed to the default branch. This is an explicit closure
decision based on the bounded evidence below, not new Windows/Linux acceptance
or confirmation of an unknown original crash cause/private archive.
No push or replacement release is included in the local submission.

The existing commands above selected 48 passing cases: all 19
`skill-agents-view` cases, both export lifecycle cases, five Core
`mcp-market-installation` cases, the single `#236` preload/IPC/reopen case,
and all 21 cases in `legacy-backup-zip-compatibility` plus
`release-acceptance-data-recovery-portable`. The other 15 Prompt/AI cases
were excluded by the explicit issue filter, not treated as passed.

No new product failure reproduced at those boundaries. Added regression
coverage passed: seven picker cases and six MCP cases, bringing this recheck
to 56 distinct passing cases in seven files. Test-inclusive Desktop TypeScript,
scoped ESLint and spec governance passed. No application code was changed.

- #240 TC-2/TC-3: `skill-library-import-modal.test.tsx` uses real picker
  selection/count/disabled state and checks the submitted IDs, target and mode.
  It covers multiple selections across Copy/Symlink changes and an already
  installed Skill alongside an available Skill. The modal shell and submission
  callback are substituted, so this does not prove installation.
- #239: `mcp-market-installation.test.ts` includes the exact reported
  `modelcontextprotocol:io-github-54yyyu-zotero-mcp` identifier alongside
  colon/slash/reserved-name cases. Real SQLite/files/version update/restore/reopen
  assertions remain unchanged; no remote MCP command is executed.

Run the added coverage from the repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/components/skill-library-import-modal.test.tsx \
  --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/core exec vitest run \
  tests/mcp-market-installation.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/components/skill-agents-view.test.tsx \
  tests/unit/main/canonical-portable-export.test.ts \
  --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/release-acceptance-prompts-ai-workflow.test.ts \
  -t '#236' --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/legacy-backup-zip-compatibility.test.ts \
  tests/integration/release-acceptance-data-recovery-portable.test.ts \
  --minWorkers=1 --maxWorkers=1
```

Native Windows/Linux and original private-profile acceptance remain open.
This recheck does not diagnose an unspecified Windows crash or assert that
synthetic historical backups reproduce the reporter's private archive.
The user subsequently authorized isolated Electron UI automation on 2026-10-20.
The new `#240` case in `apps/desktop/tests/e2e/agent-skill-lifecycle.spec.ts`
covers cold empty Agent entry, multi-selection, Copy/Symlink installation,
already-installed selection state, exact nested text/binary bytes and restart.
The new `#236` case in `apps/desktop/tests/e2e/app.spec.ts` creates two Prompts
through the real editor across two complete restarts and checks visible/readback
content. Both files are selected by the existing release E2E smoke entrypoint.
Their continuous install/restart/cleanup test bodies can exceed 50 lines to keep
the same temporary profile and its lifecycle in one failure-safe scope.
Existing `prompt-lifecycle`, `prompt-backup-continuity` and
`backup-settings-flow` tests cover editor changes and real backup UI/IPC flows.
All five selected macOS Electron flows passed: the four existing/new Prompt
and backup cases passed in the first run; #240 passed separately after correcting
its fixture. The first Skill fixture incorrectly supplied `files` to
`skill:create`, which correctly rejects package import; the fixture now uses
the real `skill:runPackageOperation` local-directory entrypoint. No product
code changed. This setup failure is not a reproduced selection defect.
Test-inclusive TypeScript, scoped ESLint and the production build passed.
The screenshot capture waits for the modal's opacity transition to finish.
Temporary profiles and owned Electron processes are removed; the existing
personal app remains untouched. Parallel Plugin commits advanced HEAD during
this scoped verification; these results are not a frozen full-release gate.

```sh
pnpm build
PROMPTHUB_E2E_HEADED=0 pnpm --filter @prompthub/desktop exec playwright test \
  tests/e2e/app.spec.ts tests/e2e/agent-skill-lifecycle.spec.ts \
  tests/e2e/prompt-lifecycle.spec.ts \
  tests/e2e/prompt-backup-continuity.spec.ts \
  tests/e2e/backup-settings-flow.spec.ts \
  --grep '#236|#240|creates a folder and prompt|keeps prompt writes available|exports a native ZIP from Settings'
```

## Follow-up Priority

1. Complete native/reporter acceptance of the local #240 repair when authorized. Keep #209 open pending its remaining boundaries. The maintainer-approved closure references for #240/#239/#236/#221 await a later default-branch push; their remaining platform and original-profile evidence gaps remain as recorded above. Do not equate a successful general smoke with their original trigger.
2. Complete native GUI/Agent acceptance and publication of the local #242/#243 repair when authorized. The shared marketplace owner and separate archive-integrity tests define the current local boundary.
3. For the seven published fixes, review the remaining machine-specific boundary and decide public follow-up separately; this audit does not close issues.
4. Keep broad contracts (#197/#194/#203/#212), real remote sync (#185/#79), and product backlog distinct from small bug fixes.

## Existing Ownership

- Storage and upgrade: `foundation-integrity-redesign` is authoritative for the
  SQLite/actual-files boundary; `legacy-upgrade-recovery-audit` supplies historical
  evidence. Old file-authority assumptions cannot override the accepted foundation.
- #209/#210: `rules-managed-copies`.
- #185, #190–#194, #203: preserve their existing active changes and tests as listed
  in the local overlay; do not merge them into a generic issue implementation.
- #188: `skills-my-skills-tag-search` (shipped in 0.6.0); #145: `desktop-tag-manager-usability`.
- #74: review the scope gap in `desktop-startup-folder-restore` against the
  report before treating its pinned/last-folder feature as complete coverage.
- #198: retained `desktop-workspace-live-refresh` design.
- #196/#197: retained `rules-agent-source-matrix` design.
- #195 and #44's secondary suggestions: retained `prompt-workspace-completion`.

## Deferred Dependency Backlog

| Program | Issues | Retained design | Required evidence |
| --- | --- | --- | --- |
| Windows trust and signing | #92 | windows-code-signing-and-reputation | Certificate/provider access and clean Windows verification |
| Mobile WebDAV distribution | #15 | mobile-webdav-distribution | Android/iOS packaging and secure device validation |
| Collaborative Prompt sharing | #106 | cloud-collaborative-prompt-sharing | Server-owned ACL, audit and conflict contract |
| Marketplace expansion | #132, #177 | marketplace-expansion | Verified external catalogs and import contracts |
| Git backup transports | #27 | git-backup-transports | Credentials, encryption and provider integration evidence |

These are accepted backlog designs, not evidence implementation has started.

## Shared Decisions And Acceptance

1. Use the accepted foundation ownership, existing domain owner and current
   contracts. Do not add competing storage or protocol implementations.
2. Keep version history, backup, live sync, target recovery and upgrade recovery
   distinct; validate package bytes and relationships, not only row counts.
3. Use isolated fixtures, actual public entrypoints and close/reopen checks where
   persistence is involved. GUI automation requires explicit user authorization.
4. New platform paths/protocols need official or versioned executable evidence.
5. Follow `spec/rules/document-routing-rules.md` and
   `spec/rules/testing-standards.md`; documentation depth follows actual risk,
   without requiring a new multi-file change for every defect.
6. Record real commands, assertions, replaced boundaries and remaining acceptance
   in the owning topic. Keep remote snapshots separate from local delivery.
7. Do not commit, push, publish or close remote issues without authorization and
   applicable submission/release gates.

## Non-Goals

- Closing an issue because a plan, patch or prerelease tag exists.
- Treating all reporter environments as fixed by one synthetic fixture.
- Replacing existing owners or combining all issues into one inseparable change.
- Installing external scanners, changing credentials or deleting live user data
  as part of triage.

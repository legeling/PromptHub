# Prompt 与 AI：现有功能验收与修复

Status: local-fixes-verified; coordinator-accepted; release-not-verified

本批修复、测试契约与分层验证证据已由主协调接受；整体发布仍待综合门禁。以下当前覆盖矩阵反映已完成修复，首轮失败仅作为历史缺陷与命令证据保留。

## 2026-10-09 现有导入覆盖补齐

新增 `apps/desktop/tests/integration/release-acceptance-prompts-ai-import.test.tsx`，测试入口为当前App的focus事件→合成clipboard readText→App自身JSON解析/字段判断→EditPromptModal→真实Zustand createPrompt→renderer database service→preload→注册Prompt IPC→磁盘SQLite及正常关闭重开。只替换系统clipboard/窗口能力、与本场景无关的工作区shell和启动IndexedDB/renderer偏好迁移；业务表单、store动作、注册handler和持久化均不替换。ImportPromptModal无App运行时调用，不另建伪造解析链，既有组件测试保留。

新增五个场景覆盖text/image正常导入完整字段及初始历史、损坏JSON与非Prompt JSON不打开表单且旧数据保持、null byte正文拒绝后表单仍开及旧记录/历史保持、重开后有效导入成功。最终5/5通过，8.45s，PID60997/session38076、退出0；本次补充证据待主协调复核。顺序集成测试为保持操作→读回→重开→失败保全在同一场景中可审阅，超过50行时保留相邻操作与断言；不添加业务层抽象。

正常路径明确核对title、description、promptType、system/user及英文正文、tags、source、列表摘要和重开后的完整记录/初始版本。非法JSON由App自身拒绝，不打开表单；非法正文经实际表单提交在DB校验边界拒绝，表单仍可操作且不误关，重开后只剩原记录、原历史且版本表总数为1。随后再次通过App剪贴板导入有效正文，重开核对新旧两条完整记录。系统clipboard读取为合成bridge响应，未调用原生剪贴板或GUI。

复跑命令从仓库根使用已有固定pnpm9.15.0，并保留已有Node PATH：

```sh
/Users/lingxiaotian/Library/pnpm/.tools/pnpm/9.15.0/bin/pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 tests/integration/release-acceptance-prompts-ai-import.test.tsx --cache=false
/Users/lingxiaotian/Library/pnpm/.tools/pnpm/9.15.0/bin/pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-prompts-ai-import.test.tsx --max-warnings 0
```

命令经本组180秒deadline runner执行，单worker并限制工具输出，原始日志保存在本组临时根直至提取证据后删除。首轮PID60612的5项在缺失jsdom matchMedia处失败，尚未操作导入；补齐该能力后PID60721为2 pass/3 fail，原因是无关shell fixture未转交App的overlayContent。修正shell透传真实弹窗后PID60865为5/5，但有act警告；PID60914仍5/5，嵌套waitFor造成act环境警告。最终按实际clipboard读取事件等待并settle启动effect，PID60997为5/5且无act警告。未修改业务断言、产品或共享helper，没有发现本批产品失败；这些fixture修正结果不重复累加测试数量。

最终scoped types PID61043/session7209退出0、无诊断；ESLint PID61198退出0、无输出；Prettier check通过。临时tsconfig继承desktop/tsconfig.test，只include新增文件与三个现有ambient d.ts，按真实导入解析其依赖，未降低compilerOptions；执行 `pnpm --dir apps/desktop exec tsc --project <本组临时目录>/tsconfig.json --pretty false`。首次types PID60641及lint PID60688同样通过，但最终声明只对应完成后的状态；完整typecheck/build/harness仍由主协调处理。

运行前后App、EditPromptModal、prompt.store、Prompt IPC、packages/db Prompt和共享skill-runtime helper六个相关文件SHA-256均一致。新增测试321行；本批只新增该integration文件并更新本报告，旧测试、共享helper、产品和全局配置无本组改动。25个隔离profile均已销毁，9个记录PID已退出，测试清理恢复store、clipboard、matchMedia与window bridge，DB/临时Agent根释放。本组临时runner、config和日志在报告提取后清理；没有启动HTTP端口、后台服务、真实provider、云账号或付费模型，也未build/Git/GUI或创建会话。

P37源码核对：AiTestModal的关闭按钮/Escape只调用onClose，session guard忽略关闭/重开后的晚到结果，cancelSingleStreamRafs仅取消requestAnimationFrame；preload aiApi只暴露request/requestStream及finally移除监听，没有网络cancel IPC。现有 `ai-test-workbench.test.tsx` 的关闭后晚到single/compare/image结果用例继续作为局部组件证据。当前未提供网络停止操作，因此本轮不新增取消功能，也不将网络取消列为可补的本地功能缺口。

## 测试契约补齐（2026-10-04）

主协调分配的14个既有测试文件已按当前生产类型补齐，未修改产品源码、共享window helper或构建配置，未删用例或放宽业务断言：

- components/ai-settings-prototype.test.tsx：复用AIModelConfig/AIProviderConfig；DOM节点使用实际类型守卫。
- components/ai-workbench-base-fields.test.tsx：表单fixture使用ModelFormState。
- components/available-models-list.test.tsx：去掉组件已不接收的modelForm属性及其无用fixture，保留选择和分组断言。
- components/folder-modal.test.tsx：overlay使用HTMLElement类型守卫。
- components/image-prompt-reverse-modal.test.tsx：列表fixture遵循PromptSummary，不携带正文；补齐必填元数据。
- components/prompt-card-layout.test.tsx：补齐onDoubleClick事件属性。
- components/prompt-detail-metadata.test.tsx：用真实i18next实例提供TFunction，保留相同测试文案及关系按钮断言。
- components/prompt-modal-structure.test.tsx、components/prompt-quick-rewrite-dialog.test.tsx、services/ai-transport.test.ts：使用vi.mocked访问类型化IPC mock。
- components/quick-add-utils.test.ts、services/ai.test.ts：补齐现行必填协议字段，后者使用类型化request mock。
- stores/prompt-save-sync.test.ts：复用真实promptToSummary投影与完整Prompt fixture。
- stores/settings-ai-models.test.ts：每例安装完整bridge，只在两条localStorage hydration场景移除rendererPersistence；settings覆盖保留其余API，补齐协议字段。

以上路径均相对于 `apps/desktop/tests/unit/`。额外收紧 `tests/integration/release-acceptance-prompts-ai-workflow.test.ts` 的PA-02创建场景：必须以 `/null bytes/` 拒绝，重开后只有原记录、原版本且全表版本数为1，不再接受清洗或原样保存等多种结果。

### 验证边界与结果

| 检查 | PID / session | 结果 |
| --- | --- | --- |
| 14文件Vitest，单worker | 5284 / 67651 | 178/178通过，13.10s |
| scoped tsc首轮 | 5616 / 15223 | 仅本组两文件7项错误：4处全局aiApiProtocol缺失，3处空对象兜底使window.api字段可选 |
| 上述14文件与workflow的ESLint | 5883 / 96765 | 退出0，无输出 |
| workflow筛选PA-02 | 5964 / 87028 | 7通过、8未选中，8.36s；describe名称也含PA-02，实际同时覆盖PA-01/04，未重复全部24条 |
| 集中修正后的scoped tsc | 6571 / 72570 | 退出0，无诊断 |
| 最后改动的quick-add-utils/settings-ai-models | 6880 / 81723 | 21/21通过，1.33s；其余12文件未重复运行 |
| 最后两文件ESLint --max-warnings 0 | 7114 / 86108 | 退出0，无输出 |

Vitest命令为 `pnpm exec vitest run --project unit --maxWorkers=1 --minWorkers=1` 后接上述14个 `tests/unit/...` 路径。PA-02命令为 `pnpm exec vitest run --project integration --maxWorkers=1 --minWorkers=1 tests/integration/release-acceptance-prompts-ai-workflow.test.ts -t PA-02`。命令cwd为apps/desktop，通过本组180秒deadline runner执行。

局部类型检查使用临时tsconfig继承 `apps/desktop/tsconfig.test.json`，include仅14个测试及 `src/vite-env.d.ts`、`src/renderer/globals.d.ts`、`src/types/rehype-highlight.d.ts`；依赖由TypeScript按导入解析，未覆盖整个tests或src目录，也未放宽compilerOptions。执行 `pnpm exec tsc --project <临时目录>/tsconfig.json --pretty false`。这不替代完整typecheck/build/release harness。

启动环境记录：最初子目录 `pnpm exec node <runner> ...` 被环境选中的pnpm自动依赖同步阻断，错误为 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；该次未执行测试。仅临时设置verify-deps-before-run=warn后又遇到node不在PATH。最终将本命令PATH明确指向已有Codex Node runtime、/opt/homebrew/bin、/usr/bin、/bin，复用既有依赖成功运行；验证pnpm为9.15.0，与根packageManager一致，desktop无独立packageManager。没有设置CI、重装依赖或更改仓库配置。

本批次7个隔离profile均已销毁，所有记录PID已退出；临时runner、tsconfig与日志清理后不作为交付文件。没有GUI、真实供应商、构建或全量发布验收结论。

## 修复阶段当前结论（2026-10-04）

按更新后的修复责任表，PA-01–04 已在分配范围修复。原6条业务红测保留正确预期并转绿；新增安全可执行缺口后，正式integration共24条均有通过证据（分批结果如下）。另运行Core 18条、Desktop定向117条，均通过；11个涉及源码/测试文件的定向ESLint退出0。完整typecheck/build/release harness归主协调，本组未重复运行，不能据此宣称可发布。

### 实际修改与回归

| 缺陷 | 修复文件 | 行为与验证 |
| --- | --- | --- |
| PA-01 | packages/core/src/prompt-canonical-import.ts | 根级真实目录 `.trash`不进入活跃图清单；同名普通文件和符号链接仍拒绝。保留恢复文件，不改layout/runtime authority。删除后编辑、改名后创建、删除最后一条后startup均通过；恢复字节前后逐一核对 |
| PA-02 | packages/db/src/prompt.ts | 单一DB校验辅助函数用于create/update/createVersion/insertPromptDirect/insertVersionDirect，在写入前拒绝直接文本字段null byte，错误只带字段名；真实SQLite验证标题/正文/系统正文/翻译/备注/来源/AI响应/版本备注和直接恢复失败后记录、版本均不变 |
| PA-03 | apps/desktop/src/renderer/components/layout/usePromptWorkspaceTreeActions.ts；apps/desktop/src/renderer/services/database.ts | 根目录动作显式提交null，renderer更新保留null；未提供folderId的普通修改仍保留原文件夹；真实hook→renderer service→preload/IPC→重开确认 |
| PA-04 | apps/desktop/src/main/ipc/prompt.ipc.ts | replaceAll使用字面模板和回调值，变量名正则字符与值中的美元序列保持原文；复制仍计数且不修改源模板 |

正式integration文件沿用本报告下方三个路径，当前行数workflow 558、transport 358、batch 331。既有测试修改：

- packages/core/tests/prompt-canonical-export.test.ts：增加trash文件字节保全、空活跃图、拒绝同名普通文件/符号链接。
- apps/desktop/tests/unit/main/prompt-db.test.ts：增加9条输入完整性回归；把原先仅断言title“有定义”的null-byte测试加强为明确拒绝、无记录残留。
- apps/desktop/tests/unit/main/prompt-workspace.test.ts：补齐既有Prompt fixture的promptType/isFavorite/isPinned，修复第一轮暴露的本领域类型合同缺口。
- spec/knowledge/behavior/prompt-workspace.md：记录恢复目录边界、输入拒绝、null/undefined与字面复制合同。

没有修改shared reader、runtime-storage-context、Rule/WebDAV/settings、ai-client/rules-rewrite、共享helper/config或既有renderer-persistence脏文件。此处reader是Prompt专属 `prompt-canonical-import.ts`。

### 可执行缺口补齐与当前覆盖

| 首轮编号 | 新增真实证据 | 当前状态与限制 |
| --- | --- | --- |
| P02/P04/P07/P13/P38 | 原业务失败场景全部通过 | pass，仅本行已定义IPC/持久化边界 |
| P05 | 两个根文件夹排序、子目录删除后Prompt及版本保留、重开startup | pass |
| P08 | 多Prompt收藏、具体文件夹移动、连续删除；QuickTagModal真实renderer持久化添加/移除，夹入缺失Prompt验证partial failure和成功记录保全 | pass；标签用例把store写入口绑定真实renderer service，未声明自动同步/store全链验收 |
| P18 | 删除非当前历史版本，拒绝删除初始版本；重开保留当前正文、其余版本及正常startup | pass；补齐首轮仅UI mock的真实删除缺口 |
| P23 | registered VIDEO_*保存/读取base64、磁盘字节、大小、清单、非法输入/穿越拒绝、清理只作用于视频 | pass；fixture为文件字节，不声明真实视频解码、播放或GUI预览 |
| P27 | summary按需读取完整正文后复制副本并重开；share hook生成完整JSON并写入隔离clipboard | pass；native clipboard仍未测，未增加导入协议 |
| P28 | 选择性导入导出/附件完整包 | pass，复用Data D5最终4/4：真实ZIP→独立根恢复→两次正常启动/公开消费及源/附件字节保全；不重复执行、不扩大到GUI/全域升级 |
| P41 | 主协调核对无window.api.io消费者；残留ioApi无main handler，VERSION_DIFF仅常量且未暴露 | unsupported：无产品入口的残留内部API；不新增handler或顺手删除公共bridge，真正导入导出继续由P28公开ZIP链验收 |

按首轮同一42项分母更新：pass 37、fail 0、not-run 0、blocked 3、unsupported 2。Desktop GUI/原生剪贴板/平台安装包、真实付费供应商依旧未验收；P28复用数据组最终完整ZIP恢复证据，P26新增App组合5/5通过。P41已由主协调确认为不具产品入口的残留内部API，其unsupported判断不替代P28的真实恢复证据。以上计数不是发布通过率。

该42项矩阵已无not-run行；P26的App导入持久化组合已补齐，本组状态ready。各pass行仍只覆盖其声明的层级；组件到完整界面的差距归P22/P39，真实供应商与外部服务归P40，P41是残留内部API，P42是当前不支持的新协议。P37没有现行网络取消操作，不作为本地待实现项。完整build/typecheck/release harness另由主协调统一判定。

P28具体入口为 `database-backup.ts` 的 `downloadSelectiveExport/restoreFromFile` 与对应backup IPC。复用[数据组最终D5记录](data-recovery-results.md#d5-最终结果与清理)：2026-10-09 PID42704，UTC03:53:46.131–03:54:08.145，4/4、退出0。正常ZIP场景核对2 Prompt、1 Folder、3 Prompt histories、1关系、图片/视频字节及其他受支持资产样本；独立目标两次startup/init与公开consumer、FK/quick_check通过，源data完整hash与ZIP字节不变。其它三项覆盖选中/未选设置、目标秘密字节保全及EIO同一journal回滚。这是已有Data证据，本组未重复运行；不扩展为非空Agent/Generation全域联合ZIP、D2/D3/D4、旧Desktop连续升级、GUI/原生凭据/发行包或当前最终合并候选门禁通过。

### 本阶段命令与结果

所有命令从仓库根运行，经本任务180秒父进程deadline串行执行，Vitest单worker。版本HEAD仍为108f375bcd2c3e94c20d93dd619d641b6386b352；本组五个产品文件diff SHA-256为 `f0e58eb94c383b401767d40f33f4ae591ef01e6e4a492ed365d8c96e7b46a99c`。并行组仍在修改其他领域，最终候选统一门禁由主协调执行。

```sh
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai-workflow release-acceptance-prompts-ai-batch
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai-batch -t 'persists successful batch tags'
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai-workflow -t 'deletes a historical version|deleting one prompt'
pnpm --filter @prompthub/core run test tests/prompt-canonical-export.test.ts tests/canonical-prompt-graph-db.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/main/prompt-db.test.ts tests/unit/main/prompt-workspace.test.ts tests/unit/services/database.test.ts tests/unit/components/quick-tag-modal.test.tsx --minWorkers=1 --maxWorkers=1
```

| 批次 | 时间 / PID / session | 结果 |
| --- | --- | --- |
| integration三文件首跑 | 17:54:37 / 94902 / 44872 | 23条，18通过5失败；5失败均为新增fixture问题：四条受Node未提供browser storage的清理错误影响，一条错误地要求startup搬迁后原路径仍存在。原业务断言未放宽 |
| workflow+batch复查 | 17:56:12 / 96231 / 56501 | 18/18通过，退出0，69.81s；transport此前5/5未受fixture修改影响，不重复运行 |
| 标签添加/移除补齐 | 18:00:00 / 98165 / 20919 | 1通过，3未选中，退出0，3.73s；新补移除断言通过，其余测试此前已过 |
| 版本删除与删Prompt后删标签补齐 | 18:02:39 / 99388 / 71607 | 2通过，13未选中，退出0，3.52s；原恢复字节保全断言同时通过 |
| Core两文件 | 17:58:49 / 97581 / 14642 | 18/18通过，退出0，3.51s |
| Desktop四文件 | 17:59:29 / 97915 / 47028 | 117/117通过：PromptDB81、workspace22、QuickTag11、renderer database3；退出0，3.67s |
| 定向ESLint | PID98419 / session33180 | 上述5源码+6测试文件，退出0、0warning |

首次Core命令PID97418/session63322因pnpm test简写解析worker选项失败，0测试执行；改为上表的run test后正常执行。类型检查未再次全包运行；第一轮297项统计是历史结果，不能作为并行修复后的当前数字。

ESLint精确命令：

```sh
pnpm exec eslint --config apps/desktop/eslint.config.mjs packages/core/src/prompt-canonical-import.ts packages/db/src/prompt.ts apps/desktop/src/main/ipc/prompt.ipc.ts apps/desktop/src/renderer/components/layout/usePromptWorkspaceTreeActions.ts apps/desktop/src/renderer/services/database.ts packages/core/tests/prompt-canonical-export.test.ts apps/desktop/tests/unit/main/prompt-db.test.ts apps/desktop/tests/unit/main/prompt-workspace.test.ts apps/desktop/tests/integration/release-acceptance-prompts-ai-workflow.test.ts apps/desktop/tests/integration/release-acceptance-prompts-ai-transport.test.ts apps/desktop/tests/integration/release-acceptance-prompts-ai-batch.test.tsx --max-warnings 0
```

### 设计、恢复与剩余边界

文本校验只扫描本次写入的直接字符串，时间O(文本总长度)、不复制正文；trash在目录入口排除，避免读取恢复树。没有新依赖、重试/限流/超时产品策略或持久字段。现有较长DB写入函数只加同一校验调用；inventory遍历保持单一入口，避免拆出第二套扫描。较长顺序测试保留操作、读回、重开与保全断言在同一场景，可直接审阅实际业务路径。

没有schema或layout迁移；恢复文件校验前后字节相同。现有startup会把legacy `data/.trash/cache/prompt-workspace`搬到 `recovery/canonical-prompt-trash`，回归核对原位与既有恢复位置的完整文件字节集合；未修改该搬迁逻辑。旧版本已截断的后缀不能凭空重建，应从完整历史/备份恢复。回退本组源码无需数据迁移，但会重新暴露PA-01–04，不应作为修复后的发布方案。


### 本阶段资源与交付

最后修改的workflow文件单独ESLint复查：PID99867/session24575退出0。新增三文件格式检查与本组tracked diff空白检查均通过。日志中39个隔离profile根目录全部已清理，9个记录的任务PID均已退出；Core用例afterEach释放数据库与临时目录，transport afterAll关闭连接及临时HTTP端口。任务目录`/var/folders/mg/8kvpxvzs54g_ygxpmpzkzy1h0000gn/T/prompthub-prompts-ai-repair-47UXmo`已删除。未保留服务器、未触碰真实profile/账号/付费服务，未提交或推送。主协调可从本报告的精确命令复验最终候选。

## 第一轮持久测试交付（修复前历史证据）

2026-10-04 的补充要求已落实到所属 package 的实际文件。产品源码、既有测试、共享 helper/config 均未修改。本节与后续“第一轮”表格、临时脚本均是修复前历史证据，当前状态以上方修复阶段为准。

已新增 3 个正式 integration 文件，共 16 条用例。通过常用 `test:integration` 入口实际运行：**10 通过、6 红测，退出码 1**。六条红测对应 PA-01（3条）、PA-02（1条）、PA-03（1条）、PA-04（1条），没有 skip/todo，也没有把缺陷当作正确预期。已知缺陷继续阻断发布。

[release-acceptance-prompts-ai-workflow.test.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/integration/release-acceptance-prompts-ai-workflow.test.ts)

[release-acceptance-prompts-ai-transport.test.ts](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/integration/release-acceptance-prompts-ai-transport.test.ts)

[release-acceptance-prompts-ai-batch.test.tsx](/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/integration/release-acceptance-prompts-ai-batch.test.tsx)

根目录精确重跑命令：

```sh
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai
```

实际展开为 `vitest run --project integration --minWorkers=1 --maxWorkers=1 "release-acceptance-prompts-ai"`；2026-10-04 17:40:43 开始，17.91s，父进程 PID84820 / session21006，180秒 deadline，退出1。三个文件均标记为 `|integration|`，不是零用例或临时配置才会选中的测试。

### 每条正式用例与实际结果

文件名前缀均为 `apps/desktop/tests/integration/release-acceptance-prompts-ai-`。

| 文件 | 精确用例名 | 结果 | 关键业务断言/边界 |
| --- | --- | --- | --- |
| workflow.test.ts | persists prompt content, summaries, tags, favorites and usage through reopen | pass | 公开preload/IPC；读回正文、摘要字段、FTS结果、标签/收藏/置顶/次数；磁盘SQLite重开；正常startup状态 |
| workflow.test.ts | moves a subtree across folders and unlinks it without losing descendants | pass | 父/子/后代 folderId/parentId 及正文重开不丢；startup ready |
| workflow.test.ts | rejects a cyclic move and retains the stored graph after reopening | pass | 循环/非法order拒绝；原图节点ID集合、父子归属、正文保全 |
| workflow.test.ts | rolls back prompt content without deleting the newer stored version | pass | 当前正文回滚，较新历史仍存在，重开与startup ready |
| workflow.test.ts | retains generated image bytes and favorites while cancelling and retrying remaining slots | pass | 真PNG字节落盘/复制为Prompt媒体；成功项保留、失败项pending；favorite/reference/reopen/startup |
| workflow.test.ts | persists model-service provider, model and route via settings and the config file | pass | 真实settings handler写入；preload读回；config/ai-models.json内容；重开 |
| workflow.test.ts | PA-01: deleting one prompt permits editing another and preserves the edit after reopen | fail | 期望after deletion；实际before，更新AggregateError；startup recovery-required |
| workflow.test.ts | PA-01: renaming a folder permits creating a prompt in that folder | fail | 期望After rename正文记录；实际空列表，创建AggregateError；改名记录仍在 |
| workflow.test.ts | PA-01: deleting the last prompt leaves an empty profile ready for normal startup | fail | 已确认Prompt和版本为空；startup期望already-canonical，实际recovery-required |
| workflow.test.ts | PA-02: null-byte input cannot silently remove the content suffix | fail | 接受明确拒绝、完整保留、或仅去掉null字符，均要求后缀保留；实际before截断；无关记录keep未被修改 |
| workflow.test.ts | PA-04: copy treats dollar replacements as literal values and records usage | fail | $&→{{name}}，$$→$；源模板未改、usageCount=2重开保持 |
| batch.test.tsx | PA-03: moving selected prompts to root clears their folder after reopening | fail | 真React action hook→renderer service→preload/IPC/SQLite；folderId期望null，实际原ID，重开仍错误 |
| transport.test.ts | returns non-streaming and streaming content and releases event subscriptions | pass | 真HTTP socket；实际请求路径/消息、非流式和SSE正文、listener释放 |
| transport.test.ts | keeps another model's answer when one HTTP provider returns an authentication error | pass | 模型A真实返回answer，模型B HTTP401；结果分别为answer和具体鉴权错误 |
| transport.test.ts | returns the provider image bytes through the real OpenAI-compatible adapter | pass | 真实adapter/IPC/HTTP，模型与prompt入参，以及返回PNG字节 |
| transport.test.ts | persists media bytes and rejects traversal and invalid payloads without partial files | pass | 原图字节、文件清单、拒绝穿越/非法base64、不留半成品、不覆盖原文件 |

PA-01 用 `expect.soft` 收集失败后的正文与重开状态，而不是第一个异常后停止取证；最终正确预期仍为“成功写入正确正文、正常启动”，不会把错误结果写成绿色诊断测试。PA-02 的三个允许结果直接来自输入完整性与 null-byte strip/reject 规则；任何丢掉后缀的结果都会失败。

复用 `tests/integration/helpers/skill-runtime.ts` 的真实磁盘初始化及 native home 隔离，不修改它。它的 reopen 未检查 startup 返回状态，因此新 workflow 用例显式关闭数据库再检查实际 `ensureCanonicalStorageAuthorityOnStartup` 决策；不能仅凭数据库可重开就当作应用可正常启动。AI config 写入从注册 IPC 提交：现有 `Settings` shared type 没有 aiProviders/aiModels/modelRouteDefaults，实际 handler 接受这些字段；未用 `any`/断言掩盖该契约缺口。总协调可另分配 shared Settings 与真实handler的合同对齐。

### 现有关键用例有效性审计

“有效”只针对其所声明的测试层；不因没有发现新bug就认定无效。

| 既有文件/用例 | 分类 | 能拦截什么、漏检原因 | 本轮处理 |
| --- | --- | --- | --- |
| unit/main/prompt-db.test.ts：creates a prompt and returns it with generated id / 初始版本等 | 有效（SQL局部），完整业务缺失 | 有明确字段断言和真实SQLite；但内存库/手工schema，没有真实startup authority、registered IPC后的workspace同步 | 新workflow正常读写+删除后编辑+startup红测 |
| unit/main/prompt-workspace.test.ts：exports prompts, folders, and versions into workspace files | 有效（单个workspace操作），流程组合缺失 | 临时FS与内存库可拦截导出内容错误；没有新用户startup→IPC删除/改名→下一次写入/重开的组合 | PA-01三个正式红测 |
| unit/main/prompt-tag-references.test.ts：refuses deletion while any prompt still references the tag | 有效（引用语义） | 真实SQLite且拒绝后检查原数组；直接DB不含canonical发布和IPC错误映射 | 复用其局部证据；workflow经真实IPC补正常引用拒绝，不重复全SQL矩阵 |
| unit/components/prompt-batch-action-bar.test.tsx：routes a move to the root (no folder) through the folder menu | 断言不足（若当作业务验收） | 只证明onMove收到undefined，mock回调永远不调用DB，无法发现根目录动作没落库 | batch正式测试调用真实action/service/IPC，已命中folderId红测 |
| unit/components/prompt-copy-flow.test.tsx / prompt-copy-action-parity.test.tsx | 有效（映射与路由），端到端过度mock | callback/store/clipboard mock可以证明输出目标及使用归属；不会执行另一暴露入口prompt.copy | 保留既有用例；新增PA-04真实preload/IPC字面值红测；不误称当前UI全面失败 |
| unit/services/ai-transport.test.ts | 有效（协议请求形状），链路缺失 | window transport/fetch mock不能证明preload、handler、HTTP socket协作 | transport正式文件保留实际请求/响应及部分失败断言 |
| unit/services/generation-workbench-runner.test.ts | 有效（编排），持久化过度mock | generateImage和generation API同时mock，成功提交调用不能证明输出已经落盘 | workflow真实generation API+文件字节+SQLite重开 |
| unit/main/generation-library.test.ts：commits validated image bytes… / rejects missing or tampered… | 有效（真实FS+内存SQLite） | 有字节、manifest和异常后状态断言，可拦截缺文件/坏引用；不含完整preload重开链 | 已运行20条，复用；新增仅补preload/注册/磁盘重开组合 |
| unit/components/prompt-modal-structure.test.tsx / main-content-inline-edit.test.tsx | 有效（草稿/过期结果局部） | 能拦截草稿不清、晚到AI结果覆盖；store/AI mock不能替代原生保存和重启 | 已运行，不重复复制；GUI继续blocked |
| integration/prompt-preferences-workflow.test.ts | 有效（真实preload/SQLite重开） | 现有可复用模式；但其helper不返回startup decision，不能承诺启动正常 | 不改共享helper；新workflow显式检查startup决策 |
| null-byte通过Prompt公开写入后的当前/历史正文 | 缺失 | 本轮初始入口测试读到before，既有selected套件253条全绿 | PA-02正式红测，保留无关数据/历史断言 |
| preload/io.ts 的 export/import，VERSION_DIFF常量 | 当前暴露契约待核实 | 未找到main handler，当前UI走其它路径；未发现该API的集成覆盖 | 不发明兼容实现；交总协调确定死入口处置 |

没有发现上述25个已执行文件被 Vitest 排除；它们确实出现在运行输出。缺口主要是测试层和真实业务链不足，而不是把已有用例一律认定为无效。

### 常用入口、静态检查与范围

- `vitest.workspace.ts` integration include 为 `tests/integration/**/*.{test,spec}.{ts,tsx}`，实际三文件运行证明匹配。
- `package.json test:run` 首先执行 `test:integration`；根 `scripts/verification/checks.mts` 的 `desktop-integration` 也调用同一入口。因此新测试无需新增框架/配置即可被常用门禁选中。本轮没有运行整个root harness。
- `tsconfig.test.json` include 为 `src/**/*`、`tests/**/*`、配置和shared packages；ESLint `**/*.{ts,tsx,mts}` 未排除新目录。
- 定向 ESLint 已执行三文件，PID85980 / session19971，退出0。范围仅这三个新增文件。
- 类型复查退出2：新增三文件均被纳入且0项诊断；既有106文件合计297项错误。详见文末，不把Vitest转译或lint冒充TypeScript检查。
- workflow 447行、transport 299行、batch 90行，无文件超过1000行。个别顺序业务用例在格式化后超过50行，是为了在同一用例中看清操作→真实读回→重开→失败状态，不拆成隐藏断言的辅助层；入口与断言均在上表对应命令中验证。

## 第一轮结论与证据边界

2026-10-04 第一轮非 GUI 验收完成，发现 **4 组产品缺陷**，没有修改产品源码或既有测试。不能据此发布，也不能把单元测试全绿解释为业务全部通过。

- **P1 / PA-01**：删除 Prompt 或重命名文件夹会留下 canonical reader 不接受的 `.trash` 内容，后续创建/更新/标签删除失败，删除最后一条后实际启动服务返回 recovery-required。两个独立正常流程复现；失败更新回滚，已存正文可从重开后的 SQLite 读回。
- **P1 / PA-02**：正文包含 null byte 时创建返回成功，重开后 `before\0after` 变成 `before`，发生静默截断。
- **P2 / PA-03**：批量移动到根目录的实际 renderer 参数是 `folderId: undefined`，服务将其视为不更新；操作成功返回，重开后仍属于原文件夹。
- **P2 / PA-04**：公开 `prompt.copy` IPC 用字符串替换值处理 `$&`，复制结果是 `{{name}}` 而不是字面值 `$&`。现行 UI 主要使用另一条 renderer 复制流程；本缺陷的已证实边界是公开 preload/IPC，不能推断所有 UI 复制入口均失败。

25 个定向既有测试文件共 **253 条通过**。独立隔离脚本共有 18 条不同用例：10 条正常/错误处理验收通过，6 条期望业务行为断言失败，2 条诊断用例成功复现 PA-01 并确认失败后的数据保全。诊断用例“通过”不等于缺陷功能通过。早期脚本启动配置和一个生图字段错误均是临时用例问题，已单独记录和排除。

Electron 运输层替换为内存 handler registry，实际 preload、注册 handler、Core/DB 和文件操作保持真实。AI 使用只监听 `127.0.0.1` 的可控 HTTP fixture；模型推理本身是固定响应。没有启动 Electron、Playwright、浏览器或模拟器，没有触碰真实用户 profile、Agent 配置、云盘或付费模型。

## 基线、所有权与运行环境

- HEAD：`108f375bcd2c3e94c20d93dd619d641b6386b352`；清单版本 `0.6.0-beta.2`；macOS 本机 Node `v26.7.0`、pnpm `9.15.0`、Vitest `2.1.9`，复用现有依赖。
- 执行时间（Asia/Shanghai）：2026-10-04 17:25:53–17:33:25 为有效测试范围；另有先行只读盘点及后续报告/清理。
- 第一轮本组仅持有本文件；追加授权后新增本报告列出的3个正式测试。已有 `renderer-persistence.ts` 与其测试差异未修改；其他对话文档、索引、issue 快照未修改。
- 结束前 `git diff --binary -- apps packages | shasum -a 256`：`d9072a530542dbb1764e3330f05df7180f1e9a9dc9809ebf53e8e4b048c2bc4d`。这是 apps/packages 差异摘要，不是计划中的全仓初始 diff 摘要。实际产品源码脏项仍只有既有 renderer-persistence 变更。
- 没有安装、build、打包、全仓 harness、提交、推送、建分支、部署、发布或关闭 issue；没有创建 Subagent/其他对话，也没有向其他对话发消息。
- 每组至多一个检查进程，`--minWorkers 1 --maxWorkers 1`，父进程 deadline 180 秒，日志定向到唯一临时目录。单进程串行、小型 fixture；Prompt 量为个位数，过滤单元测试含 1000 条合成摘要，不能据此宣称大型真实库性能通过。

## 当前入口与契约核对

已读 `AGENTS.md`、README、根与 Desktop package 配置、pnpm workspace、Desktop Vitest config/workspace/setup-runtime、testing-standards、document-routing-rules、总计划；核对 `prompt-workspace.md`、`desktop.md`、图片工作台 active spec、Prompt batch active spec，以及实际 preload/IPC/renderer 入口。

所有权：`packages/db` 负责 SQLite，`packages/core` 负责 CanonicalPromptDB/FolderDB 和 AI config，Desktop main 负责 IPC、媒体与 GenerationLibrary；renderer 负责编辑草稿、复制输出管线、过滤与批量交互。入口清单补入原计划未逐项列出的：Prompt 父子层级/解绑、语义关系、输出格式映射、复制使用次数、置顶、正文按需加载、快捷改写/翻译及过期结果丢弃、JSON 分享、快速导入、生成输出复用为参考图/Prompt 媒体。

**契约冲突**：稳定 Prompt 文档指向 foundation 的 SQLite 结构化权威，但当前 `main/index.ts:1281` 仍调用 `ensureCanonicalStorageAuthorityOnStartup`，`main/database/index.ts` 导出 Core CanonicalPromptDB，`prompt-workspace.ts:968` 在每次 IPC 写入后执行 canonical publish 和 Markdown 同步。隔离 helper 使用的正是当前 startup 发布路径；没有手工创建业务表或伪造目标数据。PA-01 应由总协调与数据组共同核对既定所有权迁移，不能仅为测试通过另加 fallback/第二套 authority。

常量 `EXPORT_PROMPTS` / `IMPORT_PROMPTS` 的 preload `ioApi` 存在，但 main 未发现对应注册；当前 UI 分享走 JSON+clipboard，选择性导出走 `database-backup.ts`。`VERSION_DIFF` 常量同样未发现 main 注册，UI 比较在版本弹窗完成。不能仅凭这些常量宣布当前 UI 导入导出/版本比较不可用；它们是需协调核对的暴露 API 死入口。

## 当前覆盖矩阵（修复后）

状态按“本行明确列出的边界”计数，不把组件、mock或服务层的pass提升为GUI完整验收。`W`、`T`、`B`分别指当前正式integration的workflow、transport、batch文件，分批命令与结果见上方修复阶段；`U1/U2`为下方两组既有测试，类型修正涉及的重复用例沿用上方最新通过结果，不累加测试数量。所有Electron/native GUI均保留blocked，附录临时脚本只作首轮历史证据。

覆盖分母为42个明确边界项：pass 37，fail 0，not-run 0，blocked 3，unsupported 2。同一功能的下层pass与GUI blocked可以并存；本表不计算整体发布通过率。

| ID | 功能/平台 | 真实入口 | 操作、预期及证据 | 状态 | mock/未测边界 |
| --- | --- | --- | --- | --- | --- |
| P01 | Prompt 创建/读取/更新、收藏、置顶、备注 | promptApi → registered prompt IPC → SQLite | W CRUD：Unicode/Markdown正文读回、摘要无正文、重开后标签/收藏/使用次数保持 | pass | 完整 CRUD 末尾删除后的新写入由 P02 单独判定；GUI blocked |
| P02 | Prompt 删除后继续编辑/删除标签 | prompt.delete → prompt.update / deleteTag | W PA-01：删除后编辑成功、无引用标签删除成功、重开新正文保持；删除最后一条后startup为already-canonical，恢复文件字节保全 | pass | PA-01已修复；真实IPC/SQLite/文件与startup服务，未运行原生GUI |
| P03 | 文件夹创建、嵌套读取 | folderApi create/getAll | W文件夹流程：两个根文件夹及子文件夹创建；改名后重开名称与记录保持 | pass | 原生树UI未测 |
| P04 | 文件夹改名后的 Prompt 创建 | folder.update → prompt.create | W PA-01：改名后新建Prompt成功，重开后文件夹名、Prompt正文与归属保持，startup正常 | pass | PA-01已修复；排序/删除另见P05，GUI未测 |
| P05 | 文件夹排序/删除完整流程 | folder.reorder/delete | W文件夹流程：重开核对两个根目录order为0/1；删除含子目录的父文件夹后仅另一根目录保留，Prompt移至根且正文/版本保留，startup正常 | pass | 已验证该子树删除与顺序场景；原生树交互未测 |
| P06 | Prompt 子树跨文件夹移动/解除父关系 | prompt.move | W focused subtree：child/grand folder 与父一致；解绑保留正文/后代；重开检查 | pass | 拖拽和 reveal GUI 未测 |
| P07 | 批量移动到根目录 | usePromptBatchActions → batchMovePrompts → renderer.updatePrompt → preload/IPC | B PA-03：使用根菜单的undefined参数，经真实hook/service转换为null，重开后folderId=null且正文保持；未提供folderId的普通更新保留原归属 | pass | PA-03已修复；菜单参数另有组件证据，原生GUI未测 |
| P08 | 批量收藏/标签/删除/移至具体文件夹 | usePromptBatchActions / QuickTagModal → renderer service → preload/IPC | B：两条Prompt收藏并移入指定目录后重开，连续删除后重开为空；标签添加/移除重开保持，混入缺失ID报告partial failure且成功记录保全 | pass | 标签store写入口绑定真实service，未覆盖自动同步或完整store链；confirm/提示为隔离替身，GUI未测 |
| P09 | 标签精确引用、重命名 | prompt.deleteTag/renameTag | W CRUD：引用标签删除返回{deleted:false,referenced:1}；rename后重开；PA-01回归验证无引用标签删除成功 | pass | 无引用删除与恢复文件保全另见P02；GUI未测 |
| P10 | 全文多词/收藏过滤 | prompt.search | W CRUD：alpha gap beta 被 alpha beta + isFavorite 搜索命中 | pass | 其它 SQL 语法/分页边界本组未重复数据组检查 |
| P11 | 文件夹/标签/type 筛选、计数和排序 | renderer prompt-filter | U1 prompt-filter 6 条，含1000条合成摘要、置顶及直接子节点计数 | pass | 纯 selector；不是大型真实 SQLite 性能或 GUI |
| P12 | 普通变量替换、使用次数 | prompt.copy | W CRUD：name=世界 正确替换，usageCount=1 重开保持 | pass | 系统剪贴板未操作 |
| P13 | 复制变量字面值美元符号 | prompt.copy | W PA-04：$&与$$原样输出；变量名包含正则字符也按字面匹配，源模板不变、使用次数重开保持 | pass | PA-04已修复；证据为公开preload/IPC，不含系统剪贴板 |
| P14 | 输出格式映射及复制归属 | prompt outputFormat API / usePromptWorkspaceCopyFlow | W relations 持久映射顺序；U1 copy-flow 2条映射内容与源使用次数；U2 parity 1条 | pass | UI 的 clipboard/store mock，未做系统剪贴板端到端 |
| P15 | 语义关系 CRUD、描述引用与导航计划 | prompt relation API / reconcileDescriptionRelations / getPromptRevealPlan | W relation 创建更新删除/重开；U2 描述关系7条、导航5条 | pass | reveal/私密目录导航是纯计划函数，私密解锁由数据组负责 |
| P16 | 变量输入、默认值、缓存 | VariableInputModal / prompt-variable-cache | U1 11+3条；必填、文本输入、变量回用等局部行为 | pass | 组件/store mock；原生弹窗 GUI blocked |
| P17 | 版本创建、回滚、历史正文保全 | versionApi create/getAll/rollback | W version：changed body 历史仍在；rollback 后重开正文为初始值 | pass | 原生 UI 未测 |
| P18 | 版本比较/删除交互与数据保全 | VersionHistoryModal / versionApi.delete → registered IPC | U1版本弹窗6条覆盖比较与操作合同；W删除非当前历史版本、拒绝删除初始版本，重开保留当前正文/剩余版本，startup正常 | pass | 比较为组件mock证据，删除为真实IPC/SQLite；原生GUI未测 |
| P19 | 列表摘要与详情读取一致性 | prompt.getAllMeta + renderer prompt store | W 摘要无userPrompt；U1 prompt-read-consistency 10条 | pass | UI计数/缓存切换组件之外未测 |
| P20 | Markdown 内容与可见媒体渲染 | PromptMarkdownContent | U1 prompt-markdown-content 3条 | pass | jsdom；真实排版/点击链接/大图预览 blocked |
| P21 | 图片保存/读取/存在、非法路径与格式 | registered image IPC | T media：验证PNG落盘字节、base64读回；../escape和%%%拒绝且无越界文件 | pass | 调用真实handler；未经完整electron preload媒体桥、无系统选择器 |
| P22 | 原生图片选择/上传/粘贴/下载/打开 | image IPC / PromptEditor / image preview | U1 editor/image-ipc 可提供局部mock证据 | blocked | 系统文件选择器、真实远程下载、外部打开与GUI未授权 |
| P23 | 视频保存/读取/清理 | registered VIDEO_* IPC | T视频：保存/读取base64、文件字节/大小/清单核对，非法输入与穿越拒绝，清理后视频为空且图片字节保留 | pass | fixture是文件字节，不证明真实视频解码、播放、Prompt媒体预览或GUI；相关展示归P39 |
| P24 | 创建/编辑、放弃草稿、重开、行内编辑 | Create/EditPromptModal / MainContent inline edit | U2 prompt-modal-structure 12条、main-content-inline-edit 16条；U1 editor/edit 11条 | pass | 组件和mock store；实际界面及未保存提示完整流程 blocked |
| P25 | AI改写/翻译、undo、关闭后过期结果丢弃 | EditPromptModal / ai-content-workflows | U2 structure 覆盖 stale rewrite/双向翻译；U1 content-workflows | pass | AI和持久化mock，真实改写质量/供应商未测 |
| P26 | 快速添加解析与App剪贴板导入 | quick-add-utils；App focus→JSON判断→EditPromptModal→真实store/service→注册IPC/SQLite | 新增import integration 5/5：text/image字段/版本重开保持；损坏/非Prompt JSON不打开表单；null byte拒绝后原记录/历史保全及有效后续导入；原parser/组件证据保留 | pass | 系统clipboard与无关shell/启动迁移替换；实际App解析、表单、create动作与持久化真实。无原生clipboard/GUI验收；ImportPromptModal无App运行时调用，其单测不当主链证据 |
| P27 | JSON分享/复制副本 | usePromptShareAction / useDuplicatePromptAction | B：从summary按需读取完整Prompt，复制后重开核对正文/系统正文/译文/标签/备注；share hook写出完整JSON到隔离clipboard | pass | 原生剪贴板归P39；未新增分享导入协议，恢复往返见P28 |
| P28 | 选择性导入导出/附件完整包 | database-backup.ts / backup IPC | Data D5最终4/4：downloadSelectiveExport→真实完整ZIP→独立根restore→两次正常startup/consumer；核对2 Prompt/1 Folder/3 histories/1关系及图片/视频字节，源hash与ZIP字节保全 | pass | 复用Data证据、不重复运行；非空Agent/Generation全域联合ZIP、历史Desktop升级、OS秘密跨设备迁移及GUI未测，不证明D2/D3/D4或最终候选发布通过 |
| P29 | AI供应商/模型/默认路由配置重开 | settingsApi → Core AI config | W AI config：provider/model/mainText 重开读回，config/ai-models.json存在 | pass | 使用无凭据fixture；模型服务设置GUI及secret平台加密未验收 |
| P30 | 模型发现/连接测试/不同协议请求形状 | renderer ai transport | U1 ai-transport 23条、ai-ipc 6条 | pass | 远端fetch/transport mock；不代表所有供应商可用 |
| P31 | 文本单模型非流式/流式 | chatCompletion → aiApi → registered IPC → localhost HTTP | T chat：fixture answer/fixture stream 内容正确，stream listener释放 | pass | 固定本地协议响应；真实推理未运行 |
| P32 | 多模型比较成功/认证失败隔离 | multiModelCompare → localhost HTTP | T compare：working成功，broken HTTP401显示fixture unauthorized | pass | 只覆盖OpenAI-compatible本地fixture |
| P33 | 图片生成协议正常响应 | generateImage → aiApi → localhost HTTP | T image：/v1/images/generations真实请求，PNG base64结果匹配 | pass | 模型并未实际生成；真实供应商 blocked |
| P34 | 图片批次/输出/收藏/参考与Prompt媒体重开 | generationApi → GenerationLibrary → SQLite/files | W generation：PNG字节、favorite、copyToPromptMedia、读取reference、重开后保留 | pass | provider输出为fixture；真实生成质量与原生展示未测 |
| P35 | 生成取消、部分失败、重试与晚到结果 | generation.cancel/retryFailed + runner | W成功项保留/failed requeue；U1 library20条、runner11条含晚到拒绝及丢失/篡改引用 | pass | runner模型与api mock；library使用真实临时FS/内存SQLite；整个renderer生成批次端到端未测 |
| P36 | 生图作品墙、筛选、多选、下载交互 | ImageGenerationWorkbench | U1 workbench33条 | pass | runner、clipboard、window mock；原生展示和下载 blocked |
| P37 | AI测试抽屉模式、临时参考图、错误反馈及关闭后的晚到结果 | AiTestModal | U1 ai-test-workbench18条；含关闭/重开后single、compare与image结果忽略 | pass | 业务AI mock；关闭/Escape不是网络取消，现行API无网络停止操作，不新增取消功能；GUI及真实provider未测 |
| P38 | 文本输入数据完整性：null byte | prompt.create/update、version.create → SQLite → reopen | W PA-02：明确拒绝/null bytes/；创建失败后重开仅原记录及1个版本，更新/版本备注失败后正文与历史不变；DB定向回归补齐其它直接文本字段和恢复写入 | pass | PA-02已修复；不声称能自动重建旧版本已截断后缀，仍需完整备份/历史 |
| P39 | Desktop真实操作与重启 | Electron window / full preload bridge / native clipboard | 未运行 Electron/Playwright/E2E | blocked | 当前没有GUI授权；不同平台安装包同样未测 |
| P40 | 真实供应商、付费模型与外部图床 | 实际账号/网络服务 | 未调用任何真实provider | blocked | 没有真实账号/付费模型调用授权；本地fixture不可替代 |
| P41 | 无产品入口的残留内部IO/版本diff API | preload ioApi；VERSION_DIFF常量 | 主协调全仓核对：无window.api.io消费者；preload/index仅暴露ioApi，Web bridge为io:{}；EXPORT_PROMPTS/IMPORT_PROMPTS仅该preload引用且无main handler；VERSION_DIFF仅常量、versionApi未暴露，现有diff走其它路径 | unsupported | 不作为既有可见功能失败，不新增handler或删除公共bridge；真正导入导出仍由P28的database-backup/ZIP公开链判定，D5必须独立验收 |
| P42 | Structured Chat / multi-shot新增协议 | prompt-protocols-zh.md设计稿 | 当前类型只有text/image/video，文档为方案/开发计划 | unsupported | 不属于当前已有功能，不新增实现 |

## 历史缺陷详情与推荐回归（修复前）

本节保留首轮失败、原因与当时建议；PA-01–04当前均已有通过的修复回归，状态以当前覆盖矩阵为准。

### PA-01（P1）：正常删除/改名污染 canonical 清单，阻断后续写入

基线为本报告 HEAD。受影响边界是当前 Desktop registered IPC + Core canonical 发布 + Markdown workspace 同步。两条最小复现均在新建的隔离 profile 中执行，未读真实用户数据。

1. `prompt.create({title:'survivor', userPrompt:'old'})`；再创建另一条 Prompt；删除第二条；更新 survivor 为 `new`。
2. 或 `folder.create({name:'Original'})` → `folder.update(id,{name:'Renamed'})` → `prompt.create({folderId:id,title:'p',userPrompt:'body'})`。

期望：删除/改名后继续创建和编辑成功；删除后的无引用标签可以被删除。实际：下一次写入抛 `AggregateError: Prompt mutation failed and canonical reconciliation also failed`；删无引用标签的公开错误是 `PROMPT_TAG_DELETE_FAILED`。内部原因包含：

```text
canonical graph file inventory count mismatch: .trash/cache/prompt-workspace/a/nested/_folder.json
canonical graph file inventory count mismatch: .trash/<timestamp>/.versions/<promptId>/0001.md
```

真实后置状态：删除的 Prompt 已不存在；失败更新的 survivor 保持 `old`（实际样本为 `# Hello {{name}}\n\nalpha beta`），关闭重开后仍保持；改名已落盘，失败创建没有留下 Prompt。未推断所有其他实体可继续写。启动门禁的额外检查结果见后文。

候选责任点：`apps/desktop/src/main/services/prompt-workspace.ts:968` 及其 trash 路径、`packages/core/src/canonical-prompt-graph-db.ts:225`/`:267`、`packages/core/src/prompt-canonical-import.ts:320`；同时必须遵守现行 foundation 所有权目标。不是简单放宽 inventory 校验即可认定修复。回归应在 Desktop integration 经 preload/注册 IPC，覆盖删除→继续编辑、改名→新建、关闭重开、startup decision 及失败后原数据保全；不能只用裸内存 PromptDB。

### PA-02（P1）：合法入口没有阻止 null byte 静默截断

复现：`promptApi.create({title:'null fixture',userPrompt:'before\0after'})`，随后关闭重开并 `promptApi.get(id)`。创建未报错，实际正文 `before`，期望明确拒绝不写入，或完整保留原字符串。既有工程规则明确要求 strip/reject null byte 并测试；静默截断丢掉后缀不符合该规则。

候选责任点：`apps/desktop/src/main/ipc/prompt.ipc.ts:98` 的输入边界及 `packages/db/src/prompt.ts:87`/adapter 字符串处理。回归应覆盖 create/update、system/user 双语正文及相关版本快照；需检查失败不修改已有数据。当前证据仅确认 userPrompt 创建路径，未扩展声称所有字段均截断。

### PA-03（P2）：批量移到根目录成功返回但没有移动

界面路由证据：`PromptBatchActionBar` 根菜单把 `undefined` 传给 `onMove`；`usePromptWorkspaceTreeActions.ts:199` 的 `batchMovePrompts` 逐条执行 `updatePrompt(id,{folderId})`，随后 success toast。`services/database.ts:70` 把 null/undefined 都转成 undefined，更新 SQL 将其视为未提供字段。

复现：在 `Container` 文件夹新建 Prompt；把真实 preload API 注入该临时 renderer service 的 `window.api`；调用 `database.updatePrompt(id,{folderId:undefined})`（与根菜单相同参数）；关闭重开，folderId 仍等于原文件夹 ID，断言 `null` 失败。未启动 GUI，也未直接操纵真实页面。

期望：根目录动作明确清除 folderId 并重开保持；现有正文/版本不变。候选修复应统一“保持原值”和“移到根”的空值合同，在 `usePromptWorkspaceTreeActions`、renderer database、shared DTO 和 DB owner 间一致；不应静默接受多种不明语义。推荐回归是根菜单组件→真实 store/service→preload/IPC→临时 SQLite/reopen；既有 `prompt-batch-action-bar` 用例只断言回调参数，所以本轮全绿未捕获此缺陷。

### PA-04（P2）：公开 IPC 复制把 `$&` 当替换语法

复现：创建 `userPrompt:'{{name}}'`，调用 `promptApi.copy(id,{name:'$&'})`。期望 `$&`；实际 `{{name}}`。候选责任点 `apps/desktop/src/main/ipc/prompt.ipc.ts:183` 中 `String.replace(RegExp, value)`。推荐回归覆盖字面值 `$&`/`$$` 与非 ASCII，使用相同 API 验证结果和 usage count；变量名的正则字符另行定义并测试。当前 UI 的 `replacePromptVariables` 使用 replacement callback，其正常流程已有组件通过证据；不能将这里的失败扩大成 UI 全面不可复制。

## 第一轮运行命令、结果与测试错误区分（历史）

所有有效命令由附录 `run.mjs` 执行，格式为：

```sh
ACCEPTANCE_LOG=<日志名> pnpm exec node /tmp/prompthub-prompts-ai-fmimGv/run.mjs --filter @prompthub/desktop exec vitest run <以下参数> --minWorkers 1 --maxWorkers 1
```

路径是本次已清理的临时目录；可复现的重建步骤及完整脚本在后面。包装器只为本组 pnpm 进程组设置 180 秒 deadline，不改产品超时、重试或并发策略。

| 批次 | 额外参数 | PID / exec session | 退出码与证据 |
| --- | --- | --- | --- |
| W 初始公开流程 | `--workspace /tmp/prompthub-prompts-ai-fmimGv/workspace.mts`（当时只有 workflow.test.ts） | 73968 / 14759 | 1；9条：4通过、5失败；其中生图字段错误1条为用例问题，另4失败关联PA-01/02/04。17:25:53，16.70s |
| T 本地HTTP与媒体 | `--workspace /tmp/prompthub-prompts-ai-fmimGv/workspace.mts transport.test.ts` | 76402 / 41466 | 0；4/4通过；17:28:02，0.451s；端口53987 |
| W 生图修正及失败后状态 | `--workspace /tmp/prompthub-prompts-ai-fmimGv/workspace.mts workflow.test.ts -t 'generation bytes\|focused subtree\|diagnostic'`（正则为三个名称片段以竖线分隔） | 76653 / 52762 | 0；4运行通过、8跳过；其中2条断言已知失败及原数据保全。17:28:23，26.41s |
| U1 | 下面19个明确文件 | 77031 / 86411 | 0；19文件/202条通过；17:29:04，24.60s |
| W 根目录移动 | `--workspace /tmp/prompthub-prompts-ai-fmimGv/workspace.mts workflow.test.ts -t 'renderer move to root'` | 77900 / 69170 | 1；1失败、12跳过；17:30:29，6.81s |
| U2 | 下面6个明确文件 | 78072 / 47033 | 0；6文件/51条通过；17:31:00，15.04s |

U1 精确参数（仓库根运行，包装器前缀同上）：

```sh
tests/unit/services/ai-transport.test.ts tests/unit/services/ai-content-workflows.test.ts tests/unit/services/generation-workbench-runner.test.ts tests/unit/services/prompt-filter.test.ts tests/unit/services/prompt-variable-cache.test.ts tests/unit/components/prompt-editor.test.tsx tests/unit/components/edit-prompt-modal.test.tsx tests/unit/components/import-prompt-modal.test.tsx tests/unit/components/prompt-copy-flow.test.tsx tests/unit/components/prompt-version-history-modal.test.tsx tests/unit/components/prompt-batch-action-bar.test.tsx tests/unit/components/prompt-markdown-content.test.tsx tests/unit/components/variable-input-modal.test.tsx tests/unit/components/ai-test-workbench.test.tsx tests/unit/components/image-generation-workbench.test.tsx tests/unit/stores/prompt-read-consistency.test.ts tests/unit/main/ai-ipc.test.ts tests/unit/main/image-ipc.test.ts tests/unit/main/generation-library.test.ts
```

U2 精确参数：

```sh
tests/unit/components/prompt-modal-structure.test.tsx tests/unit/components/main-content-inline-edit.test.tsx tests/unit/components/quick-add-utils.test.ts tests/unit/components/prompt-copy-action-parity.test.tsx tests/unit/components/prompt-description-relation-sync.test.ts tests/unit/services/prompt-relationship-navigation.test.ts
```

未把全部测试重复运行。U2 补充盘点后发现的草稿/过期改写/翻译/导航缺口。W 后续筛选只用于修正临时用例字段、检查新暴露的失败后状态或新增根目录动作，不重复已经通过的普通版本/关系/config 场景。未跑 source typecheck/lint、全量单元、release harness 或 E2E，25文件253条仅声明运行时所覆盖边界。

临时脚本问题：最初 PID72980/73681 因 temp config import/workspace 入口及 node_modules 指向根目录而启动失败（0条业务执行，退出1），修正为 Desktop 既有依赖并使用 workspace 数组；T 的 PID76144 因临时 electron mock 少一个右括号而收集失败（0条），修正后4条通过。W 原生图测试把 `slotIndex/isFavorite` 错当成 `outputId/favorite`，产生 `Generation output not found`；按共享类型修正后同一业务用例通过。以上不是产品缺陷，源码与共享配置均未修改。

### PA-01 启动门禁补充证据

额外命令：`--workspace /tmp/prompthub-prompts-ai-fmimGv/workspace.mts workflow.test.ts -t 'startup readiness after deletion'`，PID78796 / session78416，退出1，1失败/13跳过；17:33:22，2.24s。输入为新库创建唯一Prompt→删除→closeDatabase→真实ensureCanonicalStorageAuthorityOnStartup。返回：

```json
{"status":"recovery-required","reason":"invalid-canonical-prompt-graph","error":"canonical graph file inventory count mismatch: .trash/<timestamp>/.versions/<id>/0001.md; automatic file repair failed: File-authoritative Prompt workspace contains no data"}
```

当前 main/index.ts 把该结果设置为 canonicalRecoveryRequired。此前 helper 的 reopen 会执行 startup，但没有断言其返回状态，因此先前的“重开读回”只能证明 SQLite 重开与数据保全，不能证明正常应用启动；本条专门核对了真实启动决策。正常空库在用户删除最后一条后不应进入恢复门禁。

## 仍需总协调安排

1. 去重并分配 PA-01/02/03/04 的修复所有权；PA-01 与数据权威迁移直接相关，禁止两个组同时改 storage owner。先保留对应 regression，再批量修复；本组未修改产品代码。
2. 在固定候选上把本附录公开入口用例迁入正式 Desktop integration（至少真实启动/删除/改名/根目录移动/null byte），接入常用测试入口；本附录不是现行自动门禁的一部分。
3. 获得明确 GUI 授权后，验证所有 Prompt 视图与右键菜单、文件夹拖拽、批量根目录移动、草稿保存/放弃、复制映射/语言/变量/实际剪贴板、JSON分享导入、Markdown/图片/视频、AI抽屉与生图工作台的正常/空/错误/取消/重开结果。
4. 数据组核对选择性导入导出、附件/关系/版本完整性、全量备份迁移恢复；本组仅记录入口，不复制其所有权。
5. 真实供应商协议/认证/流式中断、外部图床、原生 macOS/Windows/Linux 启动安装包、全仓发布门禁仍需单独证据。没有取得这些结果时不得宣称“全部功能已验收”。

## 第一轮临时复现存档（当前优先运行正式测试）

下面保存完整脚本，临时可执行文件已清理。它们仅用于隔离复现，不修改既有测试、产品源码或用户 profile。脚本硬编码的 repo 是本次用户指定 checkout；对其他 checkout 重放时同时替换该前缀。运行会故意得到缺陷断言失败，不能通过删断言使结果变绿。

从本仓库根目录创建唯一临时目录并提取以下附录文件：

```sh
acceptance_dir=$(mktemp -d /tmp/prompthub-prompts-ai-XXXXXX)
pnpm exec node --input-type=module - "$acceptance_dir" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
const text=fs.readFileSync('spec/changes/active/existing-feature-release-acceptance/prompts-ai-results.md','utf8');
const pattern=/<!-- replay-file: ([\w.-]+) -->\n```(?:ts|js)\n([\s\S]*?)\n```/g;
for(const match of text.matchAll(pattern)) fs.writeFileSync(path.join(root,match[1]),match[2].replaceAll('/tmp/prompthub-prompts-ai-fmimGv',root));
fs.symlinkSync('/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/node_modules',path.join(root,'node_modules'));
NODE
ACCEPTANCE_LOG=replay.log pnpm exec node "$acceptance_dir/run.mjs" --filter @prompthub/desktop exec vitest run --workspace "$acceptance_dir/workspace.mts" --minWorkers 1 --maxWorkers 1
```

需要单个最小复现时，在 `run` 后追加 `workflow.test.ts -t 'renderer move to root'` 或对应完整用例名称；T 用 `transport.test.ts`。读完 `replay.log`、保存必要证据并确认进程退出后，清理自己创建的 `$acceptance_dir`。不要清理其他 `prompthub-*` 目录。

<!-- replay-file: vitest.config.mts -->
```ts
import { defineConfig } from 'vitest/config';
const repo = '/Users/lingxiaotian/Programs/personal/PromptHub';
export default defineConfig({root:'/tmp/prompthub-prompts-ai-fmimGv', test:{environment:'node',include:['*.test.ts'],testTimeout:30000,hookTimeout:30000,minWorkers:1,maxWorkers:1},resolve:{alias:{'@prompthub/core':repo+'/packages/core/src','@prompthub/db':repo+'/packages/db/src','@prompthub/shared':repo+'/packages/shared','@shared':repo+'/packages/shared','@':repo+'/apps/desktop/src'}}});
```

<!-- replay-file: workspace.mts -->
```ts
export default ['/tmp/prompthub-prompts-ai-fmimGv/vitest.config.mts'];
```

<!-- replay-file: run.mjs -->
```js
import {spawn} from 'node:child_process';
import fs from 'node:fs';
const args=process.argv.slice(2);const log=fs.openSync('/tmp/prompthub-prompts-ai-fmimGv/'+process.env.ACCEPTANCE_LOG,'w');
const child=spawn('pnpm',args,{stdio:['ignore',log,log],detached:true});console.log('PID',child.pid,'args',JSON.stringify(args));
const timer=setTimeout(()=>{console.error('deadline 180s');process.kill(-child.pid,'SIGTERM');},180000);
child.on('exit',(code,signal)=>{clearTimeout(timer);fs.closeSync(log);console.log('EXIT',code,'SIGNAL',signal);process.exitCode=code??1;});
```

<!-- replay-file: workflow.test.ts -->
```ts
import fs from 'node:fs';
import path from 'node:path';
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {createSkillTestRuntime} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/integration/helpers/skill-runtime';
import {getDatabase, PromptDB, FolderDB} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/database';
import {registerPromptIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/prompt.ipc';
import {registerFolderIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/folder.ipc';
import {registerGenerationIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/generation.ipc';
import {registerSettingsIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/settings.ipc';
import {promptApi as p} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/prompt';
import {folderApi as f} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/folder';
import {versionApi as v} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/version';
import {generationApi as g} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/generation';
import {settingsApi as s} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/settings';
import {getImagesDir} from '@prompthub/core/runtime-paths';
let runtime: Awaited<ReturnType<typeof createSkillTestRuntime>>;
function register(){const db=getDatabase();const pd=new PromptDB(db);const fd=new FolderDB(db);registerPromptIPC(pd,fd,db);registerFolderIPC(fd,pd);registerGenerationIPC(db);registerSettingsIPC(db);}
async function reopen(){await runtime.reopen();register();}
beforeEach(async()=>{runtime=await createSkillTestRuntime();register();});
afterEach(()=>runtime?.dispose());
const input={title:'验收 Ω 🚀',userPrompt:'# Hello {{name}}\n\nalpha beta',tags:['tag_%','中文'],variables:[{name:'name',type:'text',required:true}]};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
describe('public Prompt and AI acceptance',()=>{
 it('CRUD summary details tags favorites FTS copy usage and reopen',async()=>{
  const folder=await f.create({name:'验收'});const a=await p.create({...input,folderId:folder.id});
  expect(await p.get(a.id)).toMatchObject(input);
  const summaries=await p.getAllMeta();expect(summaries.find(x=>x.id===a.id)).not.toHaveProperty('userPrompt');
  expect(await p.copy(a.id,{name:'世界'})).toBe('# Hello 世界\n\nalpha beta');
  await p.update(a.id,{isFavorite:true,isPinned:true,notes:'keep',userPrompt:'alpha gap beta'});
  expect((await p.search({keyword:'alpha beta',isFavorite:true})).map(x=>x.id)).toContain(a.id);
  expect(await p.deleteTag('tag_%')).toEqual({deleted:false,referenced:1});
  await p.renameTag('tag_%','renamed');await reopen();
  expect(await p.get(a.id)).toMatchObject({userPrompt:'alpha gap beta',isFavorite:true,isPinned:true,notes:'keep',usageCount:1,tags:['renamed','中文']});
  expect(getDatabase().prepare('SELECT user_prompt FROM prompts WHERE id = ?').get(a.id)).toEqual({user_prompt:'alpha gap beta'});
  await p.delete(a.id);await reopen();expect(await p.get(a.id)).toBeNull();expect(await p.deleteTag('renamed')).toEqual({deleted:true,referenced:0});
 });
 it('folder hierarchy reorder prompt subtree move and unlink survive reopen',async()=>{
  const a=await f.create({name:'A'}),b=await f.create({name:'B'});const nested=await f.create({name:'Nested',parentId:a.id});
  await f.reorder([b.id,a.id]);await f.update(nested.id,{name:'Renamed'});
  const parent=await p.create({...input,folderId:a.id});const child=await p.create({...input,title:'child',folderId:b.id});const grand=await p.create({...input,title:'grand',parentId:child.id,folderId:b.id});
  await p.move(child.id,parent.id,0);await reopen();
  expect(await p.get(child.id)).toMatchObject({parentId:parent.id,folderId:a.id});expect(await p.get(grand.id)).toMatchObject({parentId:child.id,folderId:a.id});
  expect((await f.getAll()).find(x=>x.id===nested.id)).toMatchObject({name:'Renamed',parentId:a.id});
  await p.move(child.id,null,0);await reopen();expect(await p.get(child.id)).toMatchObject({parentId:null,folderId:a.id});
  expect(await p.get(grand.id)).toMatchObject({parentId:child.id});await f.delete(b.id);expect((await f.getAll()).map(x=>x.id)).not.toContain(b.id);
 });
 it('version create rollback and reopen preserve historical bodies',async()=>{
  const a=await p.create(input);const first=(await v.getAll(a.id)).find(x=>x.userPrompt===input.userPrompt);expect(first).toBeDefined();
  await p.update(a.id,{userPrompt:'changed body'});await v.create(a.id,'checkpoint');
  expect((await v.getAll(a.id)).some(x=>x.userPrompt==='changed body')).toBe(true);
  await v.rollback(a.id,first.version);await reopen();expect(await p.get(a.id)).toMatchObject({userPrompt:input.userPrompt});
  expect((await v.getAll(a.id)).some(x=>x.userPrompt==='changed body')).toBe(true);
 });
 it('relations and output target ordering survive reopen and delete',async()=>{
  const a=await p.create(input),b=await p.create({...input,title:'target'});
  const rel=await p.createRelation({sourcePromptId:a.id,targetPromptId:b.id,kind:'related_to'});
  const target=await p.createOutputFormat({sourcePromptId:a.id,targetPromptId:b.id});
  await p.updateRelation(rel.id,{note:'verified'});await p.reorderOutputFormat(a.id,target.id,0);await reopen();
  expect(await p.listRelations({promptId:a.id})).toEqual([expect.objectContaining({id:rel.id,note:'verified'})]);
  expect(await p.listOutputFormat({sourcePromptId:a.id})).toEqual([expect.objectContaining({targetPromptId:b.id,sortOrder:0})]);
  await p.deleteRelation(rel.id);await p.deleteOutputFormat(target.id);expect(await p.listRelations({promptId:a.id})).toEqual([]);
 });
 it('generation bytes favorites references cancel retry and reopen',async()=>{
  const batch=await g.create({prompt:'one pixel',model:{id:'image-model',provider:'openai',model:'fixture'},targetCount:3});
  await g.markSlotRunning(batch.id,0);const committed=await g.commitOutput({batchId:batch.id,slotIndex:0,mimeType:'image/png',base64:png.toString('base64')});const outputId=committed.slots[0].output!.id;
  await g.setFavorite({batchId:batch.id,outputId,favorite:true});
  const file=await g.copyToPromptMedia({batchId:batch.id,outputId});expect(fs.readFileSync(path.join(getImagesDir(),file))).toEqual(png);
  await g.failSlot({batchId:batch.id,slotIndex:1,error:'fixture failure'});await g.cancel(batch.id);await reopen();
  let stored=await g.get(batch.id);expect(stored.slots.map(x=>x.status)).toEqual(['succeeded','failed','cancelled']);
  expect(stored.slots[0].output?.favorite).toBe(true);
  await g.retryFailed(batch.id);stored=await g.get(batch.id);expect(stored.slots[0].status).toBe('succeeded');expect(stored.slots[1].status).toBe('pending');
  const ref=await g.readOutputReference({batchId:batch.id,outputId});expect(ref.base64).toBe(png.toString('base64'));
 });
 it('AI config through settings persists provider model route on reopen',async()=>{
  const provider={id:'fixture-provider',name:'Fixture',provider:'openai',apiProtocol:'openai',apiKey:'',apiUrl:'http://127.0.0.1:1/v1'};
  const model={...provider,id:'fixture-model',providerId:provider.id,type:'chat',model:'fixture'};
  await s.set({aiProviders:[provider],aiModels:[model],modelRouteDefaults:{mainText:model.id}});await reopen();
  expect(await s.get()).toMatchObject({aiProviders:[expect.objectContaining({id:provider.id})],aiModels:[expect.objectContaining({id:model.id})],modelRouteDefaults:{mainText:model.id}});
  expect(fs.existsSync(path.join(runtime.profile,'config','ai-models.json'))).toBe(true);
 });
 it('invalid move rejects without mutating existing graph',async()=>{
  const a=await p.create(input),b=await p.create({...input,parentId:a.id});
  await expect(p.move(a.id,b.id,0)).rejects.toThrow();await expect(p.move(a.id,null,-1)).rejects.toThrow();
  await reopen();expect(await p.get(a.id)).toMatchObject({parentId:null,userPrompt:input.userPrompt});expect(await p.get(b.id)).toMatchObject({parentId:a.id});
 });
 it('copy preserves literal dollar variable replacement',async()=>{
  const a=await p.create({title:'Dollar value',userPrompt:'{{name}}'});expect(await p.copy(a.id,{name:'$&'})).toBe('$&');
 });
 it('null byte content is rejected or preserved without truncation',async()=>{
  let a;try{a=await p.create({title:'null fixture',userPrompt:'before\0after'});}catch(error){expect(String(error)).toMatch(/null|invalid/i);return;}
  await reopen();expect((await p.get(a.id)).userPrompt).toBe('before\0after');
 });
});
it('focused subtree move normal flow without folder rename',async()=>{
 const a=await f.create({name:'A'}),b=await f.create({name:'B'});
 const parent=await p.create({...input,folderId:a.id});const child=await p.create({...input,title:'child',folderId:b.id});const grand=await p.create({...input,title:'grand',parentId:child.id,folderId:b.id});
 await p.move(child.id,parent.id,0);await reopen();expect(await p.get(child.id)).toMatchObject({parentId:parent.id,folderId:a.id});expect(await p.get(grand.id)).toMatchObject({folderId:a.id});
 await p.move(child.id,null,0);await reopen();expect(await p.get(child.id)).toMatchObject({parentId:null,folderId:a.id});
});
it('diagnostic deletion follow-up write and failed-write data preservation',async()=>{
 const a=await p.create({...input,title:'survivor'}),b=await p.create({...input,title:'deleted'});await p.delete(b.id);
 const before=await p.get(a.id);let failure;try{await p.update(a.id,{userPrompt:'after delete'});}catch(e){failure=e;}
 console.log('DELETE_FOLLOWUP',JSON.stringify({error:String(failure),deleted:await p.get(b.id),survivor:await p.get(a.id),before}));
 expect(failure).toBeDefined();expect((await p.get(a.id)).userPrompt).toBe(before.userPrompt);
 await reopen();console.log('DELETE_REOPEN',JSON.stringify({deleted:await p.get(b.id),survivor:await p.get(a.id)}));expect((await p.get(a.id)).userPrompt).toBe(before.userPrompt);
});
it('diagnostic renamed folder survives but blocks subsequent creation',async()=>{
 const folder=await f.create({name:'Original'});await f.update(folder.id,{name:'Renamed'});
 let failure;try{await p.create({...input,folderId:folder.id});}catch(e){failure=e;}
 console.log('RENAME_FOLLOWUP',JSON.stringify({error:String(failure),folders:await f.getAll(),prompts:await p.getAll()}));expect(failure).toBeDefined();expect(await p.getAll()).toHaveLength(0);
 await reopen();expect((await f.getAll()).find(x=>x.id===folder.id)?.name).toBe('Renamed');expect(await p.getAll()).toHaveLength(0);
});
it('renderer move to root clears folder membership after reopen',async()=>{
 const folder=await f.create({name:'Container'});const a=await p.create({...input,folderId:folder.id});
 globalThis.window={api:{prompt:p,folder:f,version:v}};
 try{
  const renderer=await import('/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/services/database');
  await renderer.updatePrompt(a.id,{folderId:undefined});await reopen();
  console.log('ROOT_MOVE',JSON.stringify({id:a.id,folderId:(await p.get(a.id)).folderId,originalFolderId:folder.id}));
  expect((await p.get(a.id)).folderId).toBeNull();
 }finally{delete globalThis.window;}
});
it('startup readiness after deletion checks actual startup decision',async()=>{
 const a=await p.create(input);await p.delete(a.id);
 const {closeDatabase}=await import('/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/database');
 const {getDatabasePath}=await import('@prompthub/core/runtime-paths');
 const {ensureCanonicalStorageAuthorityOnStartup}=await import('/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/services/canonical-storage-startup');
 closeDatabase();const decision=await ensureCanonicalStorageAuthorityOnStartup({activeRoot:runtime.profile,sourceDatabasePath:getDatabasePath()});
 console.log('STARTUP_AFTER_DELETE',JSON.stringify(decision));expect(decision.status).not.toBe('recovery-required');
});
```

<!-- replay-file: transport.test.ts -->
```ts
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
const transport=vi.hoisted(()=>{const handlers=new Map();const listeners=new Map();return {handlers,listeners,async invoke(channel,...args){const handler=handlers.get(channel);if(!handler)throw new Error('unregistered '+channel);return structuredClone(await handler({sender:{send(c,payload){for(const fn of listeners.get(c)??[])fn({},payload)}}},...structuredClone(args)));}};});
vi.mock('electron',()=>({ipcMain:{handle(c,h){transport.handlers.set(c,h)}},ipcRenderer:{invoke:transport.invoke,on(c,fn){transport.listeners.set(c,[...(transport.listeners.get(c)??[]),fn])},removeListener(c,fn){transport.listeners.set(c,(transport.listeners.get(c)??[]).filter(x=>x!==fn))}},session:{defaultSession:{setProxy:async()=>{}}},BrowserWindow:{fromWebContents(){throw new Error('GUI forbidden')}},dialog:{showOpenDialog(){throw new Error('GUI forbidden')}},shell:{openPath(){throw new Error('GUI forbidden')}}}));
import {registerAIIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/ai.ipc';
import {registerImageIPC} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/main/ipc/image.ipc';
import {aiApi} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/preload/api/ai';
import {chatCompletion,generateImage,multiModelCompare} from '/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/src/renderer/services/ai';
import {configureRuntimePaths,resetRuntimePaths,getImagesDir} from '@prompthub/core/runtime-paths';
import {IPC_CHANNELS as C} from '@prompthub/shared/constants';
const mediaRoot='/tmp/prompthub-prompts-ai-fmimGv/media-profile';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=';
const requests=[];let server;let base='';
beforeAll(async()=>{
 fs.mkdirSync(mediaRoot,{recursive:true});configureRuntimePaths({userDataPath:mediaRoot});registerAIIPC();registerImageIPC();
 globalThis.window={api:{ai:aiApi}};
 server=http.createServer(async(req,res)=>{let text='';for await(const data of req)text+=data;const body=JSON.parse(text||'{}');requests.push({path:req.url,body});
 if(body.model==='broken'){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture unauthorized'}}));return;}
 if(req.url.endsWith('/images/generations')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({created:1,data:[{b64_json:png}]}));return;}
 if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"fixture stream"}}]}\n\ndata: [DONE]\n\n');return;}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'fixture answer'}}],usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}}));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/v1`;console.log('LOCAL_PORT',server.address().port);
});
afterAll(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));transport.handlers.clear();transport.listeners.clear();delete globalThis.window;resetRuntimePaths();fs.rmSync(mediaRoot,{recursive:true,force:true});});
function config(model='fixture'){return {id:model,type:'chat',provider:'openai',apiProtocol:'openai',apiKey:'fixture-only',apiUrl:base,model,chatParams:{stream:false}};}
it('local HTTP chat and streaming run via real renderer preload IPC transport',async()=>{
 expect(await chatCompletion(config(),[{role:'user',content:'hello'}],{stream:false})).toMatchObject({content:'fixture answer'});
 const chunks=[];expect(await chatCompletion(config(),[{role:'user',content:'stream'}],{stream:true,streamCallbacks:{onContent:c=>chunks.push(c)}})).toMatchObject({content:'fixture stream'});expect(chunks.join('')).toContain('fixture stream');
 expect([...transport.listeners.values()].every(x=>x.length===0)).toBe(true);
});
it('local HTTP multi-model comparison isolates HTTP failure',async()=>{
 const r=await multiModelCompare([config(),config('broken')],[{role:'user',content:'compare'}]);expect(r.results).toMatchObject([{success:true,response:'fixture answer'},{success:false,error:expect.stringContaining('fixture unauthorized')}]);
});
it('local HTTP image generation returns verified fixture bytes',async()=>{
 const response=await generateImage({...config(),type:'image',model:'gpt-image-1'},'one pixel');expect(response.data[0].b64_json).toBe(png);expect(requests.at(-1)).toMatchObject({path:'/v1/images/generations',body:{prompt:'one pixel'}});
});
it('registered media IPC saves reads lists and rejects traversal without writes outside root',async()=>{
 const invoke=transport.invoke;expect(await invoke(C.IMAGE_SAVE_BASE64,'fixture.png',png)).toBe(true);expect(fs.readFileSync(path.join(getImagesDir(),'fixture.png'))).toEqual(Buffer.from(png,'base64'));expect(await invoke(C.IMAGE_READ_BASE64,'fixture.png')).toBe(png);expect(await invoke(C.IMAGE_EXISTS,'fixture.png')).toBe(true);
 expect(await invoke(C.IMAGE_SAVE_BASE64,'../escape.png',png)).toBe(false);expect(fs.existsSync(path.join(path.dirname(getImagesDir()),'escape.png'))).toBe(false);expect(await invoke(C.IMAGE_SAVE_BASE64,'invalid.png','%%%')).toBe(false);expect(await invoke(C.IMAGE_READ_BASE64,'missing.png')).toBeNull();
});
```

## 正式测试静态检查补充与断言有效性

定向lint命令：

```sh
pnpm --filter @prompthub/desktop exec eslint tests/integration/release-acceptance-prompts-ai-workflow.test.ts tests/integration/release-acceptance-prompts-ai-transport.test.ts tests/integration/release-acceptance-prompts-ai-batch.test.tsx --max-warnings 0
```

类型检查命令：

```sh
pnpm --filter @prompthub/desktop typecheck:tests --listFiles
```

第一次类型检查 PID86217/session60580 退出2，完整收集298项诊断，其中本组1项：failSlot.error应为GenerationErrorSummary而非字符串。已修成 `{code,message,retryable}`，不是放宽类型或改产品。仅受影响的生图用例复测：

```sh
pnpm --filter @prompthub/desktop test:integration release-acceptance-prompts-ai-workflow -t 'retains generated image bytes'
```

PID87484/session53810，17:43:44，2.11s，退出0，1通过/10未选中；其余红测未跳过或修改，仅本次筛选未运行。原16条汇总仍保留6条已证实产品失败。

没有对共享产品代码做行为变异。已有四组缺陷提供真实业务红测；其余新增流程的独立预期可以直接审查：丢弃HTTP/SSE正文会不等于fixture answer/stream，省略媒体落盘会无法读到固定PNG字节，失败模型不能覆盖另一个模型的独立answer，取消/重试不得改变已有output字节和ID。已有GenerationLibrary坏引用/缺文件用例也已实际执行。故没有用编译错误或fixture损坏冒充测试有效性证据，也没有为了数量另加变异框架。

### 类型复查结论

PID87708 / session67355，退出2。`--listFiles` 明确包含本组三个正式文件，三文件没有类型诊断。剩余297项诊断全部位于106个既有测试/helper文件；未修复边界外文件，不能声明package类型门禁通过。已完整读取本轮诊断，主要示例：

| 既有位置 | 诊断数 | 代表性问题 |
| --- | ---: | --- |
| tests/helpers/window.ts:536 | 1 | TS2740：MockRecord缺少window.api的规范方法 |
| tests/unit/services/ai-transport.test.ts | 23 | 既有AI transport测试与当前类型合同不一致 |
| tests/unit/services/ai.test.ts | 16 | 既有AI测试与当前类型合同不一致 |
| tests/unit/components/prompt-modal-structure.test.tsx:282 | 5 | TS2339：真实函数类型没有mockResolvedValue/mockReturnValue |
| tests/unit/main/prompt-workspace.test.ts:666 | 1 | TS2345：Prompt fixture字段不满足当前Prompt类型 |
| 其余101个既有文件 | 251 | 既有fixture/mock/API类型不一致，属于package级静态门禁阻塞 |

诊断代码分布：TS2339=71、TS2345=67、TS2322=54、TS2741=22、TS2554=22、TS2352=19、TS2353=14、TS2493=7、TS18048=6、TS2739=6、TS2740=4、TS2367=3、TS2698=1、TS2769=1。

### 最终资源与文件核对

三份正式测试的 `prettier --check` 退出0。日志中提取的28个隔离SQLite/profile根目录均已不存在，transport媒体临时目录无残留；15个记录的任务PID均已退出，临时目录关联命令无残留，早期HTTP端口53987已关闭。正式transport的临时端口由afterAll关闭连接并等待server.close完成。

本任务临时目录 `/tmp/prompthub-prompts-ai-fmimGv` 已删除，必要的命令、失败断言、诊断统计与重放脚本已保存在本报告。没有保留服务。最终交付仅本报告和三份正式测试；产品源码、已有测试、共享helper/config及其他组文件未修改，未进行Git提交或推送。

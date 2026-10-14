# CLI / Web / Worker 验收结果

最新状态：D01–D05已修；第六轮新增13项现有功能测试12过/1失败，原Worker8项回归通过。新D06为Web Provider陈旧更新应返回409、实际500；数据和秘密文件保全通过，正确红测仍保留。Web/Worker清空与Web multipart视频上传的精确能力unsupported，不新增功能。当前覆盖与剩余边界见下方主矩阵；历史矩阵不代表当前全域或版本通过。

日期：2026-10-04（Asia/Shanghai）。首轮范围只含现有功能；首轮未修改产品源码、既有测试、共享配置或其他报告。后续获授权的修复及测试范围见对应轮次。

## 当前结论（2026-10-09）

- 本组 D01–D05 已修；D06冲突错误映射红测待修。第六轮唯一用例21项（含原Worker8项）20过/1失败，三app定向lint与scoped tsc通过。没有运行产品build或全仓门禁。
- 下表汇总本组截至第六轮的实际证据；并行组后续改动不能据此宣称统一候选版本或发布通过，重跑与筛选外用例不重复计数。
- Web/Worker用户清空入口为unsupported（P41）；视频清理API有独立通过证据。数据组D5已有最新完整portable恢复/两次启动通过；本组Web备份接收或Worker快照往返不替代、不重复该证据。

## 当前验收矩阵

pass只针对注明的入口和证据层；not-run也包括尚未完成整组验收但已取得部分子范围证据的场景；已通过子范围保留在证据列，不重复计数；blocked表示需要当前未授权或不可用的发行/真实外部环境，或缺少遵守本轮根目录隔离约束的正式入口。unsupported不属于待修缺陷。场景组计数不能代替endpoint覆盖率。

新增证据简称（完整命令、轮次、退出码和边界仍保留于后文）：

| 简称 | 持久测试文件 |
| --- | --- |
| CLI-P | apps/cli/tests/release-acceptance-cross-surface-process.test.ts |
| CLI-L | apps/cli/tests/release-acceptance-cross-surface-plugins.test.ts |
| WEB-P | apps/web/src/routes/release-acceptance-cross-surface-persistence.test.ts |
| WEB-R | apps/web/src/routes/release-acceptance-cross-surface-rewrite.test.ts |
| WORKER-R | apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts |
| WORKER-E | apps/web-cloudflare/src/release-acceptance-cross-surface-errors.test.ts |
| CLI-A | apps/cli/tests/release-acceptance-cross-surface-agents.test.ts |
| CLI-Q | apps/cli/tests/release-acceptance-cross-surface-cleanup.test.ts |
| WEB-A | apps/web/tests/release-acceptance-cross-surface-agents.test.ts |
| WEB-H | apps/web/tests/release-acceptance-cross-surface-http.test.ts |
| WORKER-S | apps/web-cloudflare/src/release-acceptance-cross-surface-sync.test.ts |
| UI-C | apps/desktop/tests/unit/components/release-acceptance-cross-surface-web-capabilities.test.tsx |

| ID / 功能 | 真实入口 / 操作与预期 | 证据 | 状态 | mock / 未测边界 |
| --- | --- | --- | --- | --- |
| C01 CLI 帮助/版本 | 源码 CLI 独立进程：root help/version 与除 doctor 外 10 个资源 help 返回0 | CLI 子进程首批 12 次正常返回 | pass | 不是打包 bin；doctor 另列 |
| C02 doctor 帮助 | doctor --help/-h退出0；help优先于recover且不改锁/DB；缺action仍退出2 | CLI-P；第二轮 D01 红转绿 | pass | 源码子进程；发行包另列 C20 |
| C03 README 免安装调用 | 修正为 pnpm --filter @prompthub/cli run dev 后接资源；真实临时库 prompt list 成功 | CLI-P；第二轮 D02 | pass | README skill scan 同步修正文法，未扫描真实 HOME；其业务缺口见 C13 |
| C04 CLI JSON/表格/quiet/退出码/路径 | 带空格中文 data-dir；JSON 无额外 stdout；table、quiet；错误2/3/5 | 独立子进程脚本；错误后原 Prompt 保留 | pass | PNPM exec 包装错误退出码与实际 child exit 分开 |
| C05 CLI Prompt CRUD/搜索/标签/复制 | CRUD、Unicode/换行/HTML/SQL字面值、tags/variables/favorite；copy精确占位符及dollar字面值，保存模板/usage/versions正确 | prompt.test.ts、CLI-P；第五轮 D05 新旧copy 2/2通过 | pass | 系统剪贴板/交互终端原生UI未验；筛选外21项不计第五轮通过 |
| C06 CLI Prompt 版本 | duplicate、versions、create/delete version、diff/rollback、use | prompt.test.ts | pass | 程序化 runCli + 磁盘 SQLite |
| C07 CLI Prompt 关系/输出格式 | parent-id创建、relation create/list、output-format create | cli-completeness.test.ts 对应选中用例 | pass | 程序化 runCli |
| C08 CLI Folder | CRUD/get/reorder，遗漏 ids 拒绝 | run.test.ts full folder lifecycle + 缺 ids；独立进程 create/delete | pass | 普通临时库 |
| C09 CLI 路径/并发/锁恢复 | 新 data 路径、legacy DB、并发 programmatic 目录隔离、重叠 writer、doctor recover | run.test.ts；database-concurrency.test.ts；doctor.test.ts | pass | 部分 lease/PID/异常消息注入；真实 writer/reader 子进程通过 |
| C10 CLI AI 配置 | provider/model/routes 配置、交互选择、vision 拒绝、删除 model 保留 provider | ai-config.test.ts | pass | 没有调用模型；provider-delete/route-clear 所有组合未单独全覆盖 |
| C11 CLI Skill 包/文件/版本 | 本地JSON、长字段、repo CRUD、export、sync-from-repo、安全扫描、版本回滚 | skill.test.ts 选中3项；真实 package/guide.md 读回 | pass | 未选远端/平台部署用例 |
| C12 CLI Skill 项目安装 | 真实临时项目安装完整包、重复跳过保留本地内容、force覆盖、模糊选择 | skill-project-install.test.ts 3项；frontmatter2项 | pass | copy 模式；symlink/native消费未验 |
| C13 CLI Skill 其他路径 | 显式临时目录scan、import alias及托管完整包/二进制读回；平台status/distribute/undistribute、远端及删除卸载组合待验 | CLI-A第六轮scan/import独立进程通过；初始未选项保留 | blocked | CLI内置平台路径不消费Agent overrides，直接os.homedir；当前不能正式隔离，不更改HOME、不操作真实根 |
| C14 CLI MCP | CRUD、空market、import/env-import、check、enable/disable、export、指定临时路径apply冲突/force/remove | cli-completeness与run对应用例 | pass | check是配置健康，不是运行原生MCP协议；未触碰真实Agent配置 |
| C15 CLI Plugin 本地库 | 真实完整包前置；独立CLI进程list/get/create-version/versions/delete；非法参数拒绝，其他包/源/分发副本保全 | CLI-L；第三轮1/1通过，含二进制清单/字节/重开 | pass | 撤回首轮仅凭旧测试标题记delete通过；新证据只证明本地库，市场安装/remove-targets见C16 |
| C16 CLI Plugin 市场/目标清理 | sources/help已执行；market/install及delete --remove-targets待验 | cli-completeness首轮sources/help；CLI-L不执行市场安装或remove-targets | blocked | CLI硬实例化内置market且delete没有目标resolver入口；临时metadata不能证明实际目标隔离，未执行这些组合 |
| C17 CLI Agent | 配置全部临时根、list/get/add/update/enable/delete、identity/config list/read；每步独立进程和文件保全 | CLI-A两项真实生命周期/错误保全通过 | not-run | reset会移除正式override回到HOME，当前不执行；CLI原生config写明确unsupported，不把data-dir等同平台隔离 |
| C18 CLI Rules/workspace/sync | sync status经真实本地HTTP回退manifest、认证与未开DB；rules与workspace导入导出/版本、push/pull待验 | CLI-Q第六轮status通过；真实fixture socket关闭 | blocked | 默认Rule服务直读平台HOME；listCached实际全局scan，workspace/push/pull也调用Rule export，无正式根隔离入口 |
| C19 CLI app-data/参数组合 | --app-data-dir真实落库；--full --summary、prompt正文/文件互斥拒绝并保全内容/版本 | CLI-P既有；CLI-Q第六轮新增正文/file组合通过 | not-run | 其余错误与输出组合没有逐项覆盖，不标全参数通过 |
| C20 CLI发行包/Win/Linux | bin wrapper、packaged运行和原生平台 | 共享out存在但未核实属于HEAD | blocked | 禁止build；macOS源码入口不能替代发行包/其他OS |
| W01 Web auth | bootstrap/captcha/register/login/refresh/logout/me/password、限速/伪造header | auth.test.ts | pass | Request经过createApp；验证码helper解题，非视觉验证码验收 |
| W02 Web Prompt/Folder隔离 | 私有/共享/管理员权限；CRUD、搜索过滤、tags、版本、层级、graph/output | prompts/folders/prompt-advanced/prompt-graph-restore tests | pass | 真实临时SQLite与文件；GUI未验 |
| W03 Web Skill | CRUD/search/import/export、安全报告、版本、远端导入校验 | skills.test.ts | pass | 远端HTTP替换；非Git/浏览器完整包安装 |
| W04 Web Rules | 项目增删、内容保存/读回、非法import/rewrite及超限写入拒绝、路径约束 | rules.test.ts | pass | 服务器托管数据；不证明原生Agent投影 |
| W05 Web Settings | user隔离、部分/嵌套更新、字段验证、敏感security字段拒绝 | settings.test.ts | pass | 以用例断言为边界；没有配置真实凭据 |
| W06 Web AI路由 | request/stream参数、协议、错误与响应合同 | ai.test.ts | pass | remote-http被替换；真实AI请求blocked |
| W07 Web媒体 | image upload/list/read/exists/size/delete/clear及失败原子性；video错误指向/远端下载合同 | media.test.ts；独立进程重开字节读回 | pass | 远端下载HTTP mock；不是浏览器上传UI |
| W08 Web设备 | heartbeat/list、超长元信息拒绝 | devices.test.ts | pass | JSON落盘断言；未真实设备上线 |
| W09 Web备份接收合同 | capabilities/list/latest/upload、版本失配、secret/symlink拒绝、live数据不被导入 | desktop-backups.test.ts 首轮通过 | pass | 仅Web接收与拒绝合同；不证明Desktop真实portable恢复P28，后者依赖数据组D5 |
| W10 Web sync导入/合同 | manifest/data/config/status/push/pull、merge、settings、graph和binary Skill合同 | sync-contract/sync-import/skill-snapshot-compatibility tests | pass | WebDAV远端方法mock；非实际云盘 |
| W11 Web sync恢复 | 媒体写入失败回滚记录、后续写入失败删除已落媒体、路径限制 | sync-import-filesystem.test.ts；sync-webdav.test.ts | pass | 故障注入；真实SQLite/磁盘后置断言 |
| W12 Web导入导出 | roundtrip、旧路径、settings校验、坏JSON/ZIP/paths、部分失败rollback | 4个import-export测试文件 | pass | 所选真实路由，不能外推全部历史版本 |
| W13 Web进程重开 | 注册、私有prompt/folder/用户隔离；每个公开Request独立进程，更新/磁盘/视频读回 | WEB-P；原web-reopen脚本历史记录保留 | pass | createApp Hono Request；无HTTP socket、生产index或GUI验收 |
| W14 Web Agent合同 | services/config/provider/session各路由状态、role/请求校验、脱敏 | agents.test.ts 选中7项 | pass | inventory、config、provider、session服务均注入；不证明真实配置写盘 |
| W15 Web Agent真实服务 | 正式settings隔离全部根；真实HTTP config写盘/加密备份/stale保全、Provider/映射/秘密、session索引重开 | WEB-A第六轮2过1失败；Provider正常链及失败后置通过 | fail | Provider旧expectedUpdatedAt应409实500（FR-FOUNDATION-006）；保留正确红测，未改产品；session是已有索引消费，非原生扫描 |
| W16 Web真实HTTP/部署/浏览器 | 实际src/index.ts socket、认证/持久化/动态端口/关闭重开已通过；Docker资源与浏览器仍未验 | WEB-H真实源码HTTP进程往返通过 | not-run | DATA_ROOT独占、PORT正式正整数；未运行产品build、Docker/发布或GUI |
| W17 Web真实供应商/云盘 | AI和WebDAV/S3网络、取消、真实远端故障 | 未调用 | blocked | 不使用真实账号/付费模型 |
| W18 Web本地桌面能力 | viewer本机Agent/shell/tray/native dialog；Web/Worker用户清空入口 | web.md能力边界；UI-C真实bridge→runtime→DangerPanel组件1/1通过 | unsupported | 清空UI隐藏属于当前合同（总计划P41），不增造路由；Self-hosted视频DELETE接口另见W20 |
| F01 Worker鉴权合同 | captcha/公开路由/invalid token合同；真实本地runtime register/login、租户隔离 | auth/worker既有测试＋WORKER-R | pass | refresh/logout等原有证据仍为Node合同，不外推所有鉴权分支均在workerd实跑 |
| F02 Worker媒体读写 | image/video base64上传、list/raw/base64/size/exists、content-type、另一租户404、重启后字节一致 | WORKER-R真实本地R2；原media.test.ts mock合同保留 | pass | 仅已注册GET/POST路径；DELETE/clear未实现且无用户清空入口，不计未通过功能 |
| F03 Worker快照合同 | sync PUT/GET与非空包/租户/错误保全；正式load/save相同baseline在真实D1的CAS竞争拒绝并重开 | WORKER-R既有；WORKER-S第六轮CAS通过 | not-run | D1正常meta的竞争已实测；提交成功但结果不确定分支仍只有既有mock，未构造假workerd能力 |
| F04 Worker直接恢复与binary合同 | Prompt/版本/Folder direct-insert身份/owner/覆盖/非法父级及snapshot保全；完整Skill/Rule经sync导入重开 | WORKER-R既有；WORKER-S第六轮Folder完整往返通过 | pass | 老reader拒绝沿用此前模拟合同与实际capability拒绝，不代表Desktop portable P28或数据D5通过 |
| F05 Worker body校验 | 分块限量/取消、刚好上限、坏JSON/Content-Length/读失败 | response.test.ts | pass | 真实ReadableStream本地函数 |
| F06 Worker正常业务 | Prompt CRUD/search/tags/copy/diff/render/rollback/三种version-delete；Folder CRUD/reorder/子树与非法parent；非空Skills/Rules读、settings、heartbeat | WORKER-R；第五轮整文件8/8通过，D04正确红测已绿 | pass | 仅所列公开流程；未声称设备全部参数组合或所有endpoint全覆盖 |
| F07 Worker 500不泄露 | 实际workerd auth/bootstrap在真实D1表不可用时通用500、health正常；表恢复后原数据及再次启动保全 | WORKER-S第六轮通过；WORKER-E原Node注入证据保留 | pass | 故障仅在独占临时D1重命名users表后触发并finally恢复，无生产绑定/云部署 |
| F08 Worker实际运行时/部署 | 正式迁移、本地Wrangler/workerd、真实D1/R2持久化、dispose重启/回读 | WORKER-R；测试专用临时bundling已授权并实际通过 | not-run | 无云端部署；生产域名/CORS/静态assets、产品build未验；本地运行时不再blocked |
| F09 Worker本地能力/尚未实现写路径 | Skill create/update/delete/export/version写、远端导入、安全扫描；Rules写/scan/projects/rewrite | worker.ts显式notImplemented返回501 | unsupported | 精确端点见注册附录，不代表Web也不支持 |
| C21 CLI graph剩余操作 | relation update/delete；output-format list/delete/reorder；后续进程读回且Prompt保全 | CLI-P 持久测试补交通过 | pass | 源码CLI子进程，不代表GUI |
| W19 Web Rules补充路径 | import-records→scan→版本删除→新进程读回；两rewrite路由、三协议响应/错误、草稿不写正文/版本/磁盘 | WEB-P＋WEB-R；第二轮最新rewrite16/16通过 | pass | AI外部响应注入；真实Web transport私网拒绝已验，真实供应商调用见W17 |
| W20 Web视频生命周期 | base64/raw/list/clear等已有持久证据；真实multipart拒绝后原字节/租户/重开保全 | WEB-P已有；WEB-H第六轮multipart拒绝通过 | not-run | 精确multipart上传能力unsupported（正式POST明确400）；base64/download仍支持；实际远端播放/GUI未验 |

保留原50组分母；未完成整组的既有子范围证据保留，不采用partial。第六轮后：pass 36，not-run 6，blocked 5，unsupported 2，fail 1。W15 Provider陈旧写入冲突分类红测待修；未覆盖范围仍需按下表安排，不能称全域验收完成。W20 multipart精确子能力unsupported，不把整组已有base64能力标为不支持。

## 当前剩余边界

以下是缺口清单，不表示本次已获授权开展补测；本次任务仅限报告校准。

| 类别 / ID | 具体入口 | 仍缺什么 |
| --- | --- | --- |
| 本地非GUI C13 | platform-status/distribute/undistribute、卸载及远端 | 显式scan/import alias已通过；其余没有消费正式Agent overrides的目录隔离入口，当前不执行 |
| 本地非GUI C16 | plugin market/install、delete --remove-targets | CLI没有本地市场/目标resolver配置，暂不能安全实测，不用metadata或HOME替换绕过 |
| 本地非GUI C17、W15 | CLI reset；Web Provider陈旧更新 | 其余所列正常链已有真实进程证据；reset回到HOME不能正式隔离，Provider 409合同实际500红测待修 |
| 本地非GUI C18 | rules读写/版本/导入导出；workspace import/export；push/pull | sync status真实HTTP已通过；其余触发默认全局Rule扫描，缺正式根隔离入口 |
| 本地非GUI C19 | app-data-dir之外的互斥/错误/输出组合 | 从注册参数选尚未覆盖的明确合同，不能把已有两项扩写成全参数pass |
| 本地非GUI W16、W20 | Docker/浏览器；实际远端视频播放 | index真实HTTP关闭/重开已通过；multipart精确能力unsupported且实际400拒绝/字节保全通过 |
| 本地非GUI F03 | 同步提交结果不确定 | CAS、Folder direct-insert和workerd内部500已实测；不确定供应商meta仍只有mock，不扩张API或注入假workerd |
| 外部/原生 C13、C16–C18、W17 | Git/Gitea/HTTPS实际源、真实市场、AI/WebDAV/S3、Agent消费 | 相应外部授权/账号/可用服务或原生消费者环境；本地fixture不能证明这些环境 |
| 发行/GUI C20、W16、F08 | packaged CLI、Win/Linux、Docker资源、生产assets/域名/CORS、真实浏览器 | 当前未授权产品build/GUI/发布或缺对应OS；测试专用Worker bundling不等于产品发行构建 |
| 跨组 P28 / 数据D5 | Desktop真实portable恢复 | 数据组最新真实恢复及两次启动已通过；本组只引用，不重复测试或计数 |
| 不支持 W18/F09/P41 | viewer本机能力、Web/Worker用户清空、Worker未实现Skill/Rule写入 | 当前无承诺产品入口；不新增功能、不将隐藏流程404当作产品失败 |

## 首轮历史基线与矩阵

以下保留2026-10-04首轮原始状态，包括当时尚未修复的D01/D02，以及后来撤回的C15删除覆盖误记。它们不代表当前状态；后续补测、红转绿和能力更正见上方主矩阵与各轮记录。

### 首轮基线

- 首轮发现两项可复现缺陷：README 免安装 CLI 示例失败、doctor 子命令缺少帮助。没有进行修复。
- 定向 Vitest：38 个文件，261 项通过，24 项因显式筛选未运行；跳过项不是通过。另有独立 CLI 子进程、Web 两次进程启动的公开路由和真实磁盘验证。
- Worker 的 29 项仅为 Node 中的函数/路由及模拟 D1/R2 合同；真实 Workers/D1/R2、部署和浏览器未验收。
- HEAD：`108f375bcd2c3e94c20d93dd619d641b6386b352`。开始和结束时三个 app 及 packages/core、db、shared 无 tracked diff；桌面与 spec 的既有差异保留。开始时 spec/changes/index.md 也已修改，验收计划目录为 untracked。
- 执行窗口：功能检查 17:25–17:30（具体运行时刻见命令表，UTC 加 8 小时；此前文档/源码盘点未单独记时）。Node v26.7.0、pnpm 9.15.0；复用现有 node_modules。未安装、build、打包、运行全仓 harness 或创建 GUI 会话。
- 已读 AGENTS、README、app package/config、testing-standards、document-routing-rules、总计划、web.md、cli-agent-management.md、公开 Web/Worker 文档和被测入口。业务存储以当前实现与 foundation 当前契约为准。

### 首轮矩阵（历史）

状态针对该行注明的入口和边界；pass 不代表未列举参数组合、GUI、发行包或其他平台通过。分母是下面的验收场景组，命令/路由登记全量清单另列，不能用场景组计数代替 endpoint 全覆盖率。

| ID / 功能 | 真实入口 / 操作与预期 | 证据 | 状态 | mock / 未测边界 |
| --- | --- | --- | --- | --- |
| C01 CLI 帮助/版本 | 源码 CLI 独立进程：root help/version 与除 doctor 外 10 个资源 help 返回0 | CLI 子进程首批 12 次正常返回 | pass | 不是打包 bin；doctor 另列 |
| C02 doctor 帮助 | doctor --help 应显示帮助/0 | D01，实际 USAGE_ERROR/2 | fail | 未修改 |
| C03 README 免安装调用 | pnpm dev -- 后接资源应执行 | D02，实际不支持资源类型 -- /2 | fail | 去掉分隔符验证通过 |
| C04 CLI JSON/表格/quiet/退出码/路径 | 带空格中文 data-dir；JSON 无额外 stdout；table、quiet；错误2/3/5 | 独立子进程脚本；错误后原 Prompt 保留 | pass | PNPM exec 包装错误退出码与实际 child exit 分开 |
| C05 CLI Prompt CRUD/搜索/标签/复制 | create/read/update/delete，Unicode/换行/HTML/SQL字面值，tags/variables/favorite | prompt.test.ts；独立进程重开 | pass | 未测试系统剪贴板/交互终端原生UI |
| C06 CLI Prompt 版本 | duplicate、versions、create/delete version、diff/rollback、use | prompt.test.ts | pass | 程序化 runCli + 磁盘 SQLite |
| C07 CLI Prompt 关系/输出格式 | parent-id创建、relation create/list、output-format create | cli-completeness.test.ts 对应选中用例 | pass | 程序化 runCli |
| C08 CLI Folder | CRUD/get/reorder，遗漏 ids 拒绝 | run.test.ts full folder lifecycle + 缺 ids；独立进程 create/delete | pass | 普通临时库 |
| C09 CLI 路径/并发/锁恢复 | 新 data 路径、legacy DB、并发 programmatic 目录隔离、重叠 writer、doctor recover | run.test.ts；database-concurrency.test.ts；doctor.test.ts | pass | 部分 lease/PID/异常消息注入；真实 writer/reader 子进程通过 |
| C10 CLI AI 配置 | provider/model/routes 配置、交互选择、vision 拒绝、删除 model 保留 provider | ai-config.test.ts | pass | 没有调用模型；provider-delete/route-clear 所有组合未单独全覆盖 |
| C11 CLI Skill 包/文件/版本 | 本地JSON、长字段、repo CRUD、export、sync-from-repo、安全扫描、版本回滚 | skill.test.ts 选中3项；真实 package/guide.md 读回 | pass | 未选远端/平台部署用例 |
| C12 CLI Skill 项目安装 | 真实临时项目安装完整包、重复跳过保留本地内容、force覆盖、模糊选择 | skill-project-install.test.ts 3项；frontmatter2项 | pass | copy 模式；symlink/native消费未验 |
| C13 CLI Skill 其他路径 | scan、平台status/distribute/undistribute、Git/Gitea/HTTPS、alias、删除卸载组合 | 静态命令盘点；现有未选用例见附录 | blocked | 默认扫描/平台路径会接触真实 HOME；外部依赖未调用 |
| C14 CLI MCP | CRUD、空market、import/env-import、check、enable/disable、export、指定临时路径apply冲突/force/remove | cli-completeness与run对应用例 | pass | check是配置健康，不是运行原生MCP协议；未触碰真实Agent配置 |
| C15 CLI Plugin | library list/delete | cli-completeness对应用例 | pass | fixture准备库；market/install/sources/get/versions/create-version 未运行 |
| C16 CLI Plugin其他 | market/install/sources/get/versions/create-version及remove-targets | 注册已盘点 | not-run | 正常远端包和原生消费待后续 |
| C17 CLI Agent | 全命令注册与SQLite settings所有权 | cli-agent-management.md；agent-command.ts | blocked | 默认 inventory 探测真实Agent根；现有测试部分使用HOME重定向，本轮未更改HOME |
| C18 CLI Rules/workspace/sync | 导入导出、扫描、版本、rewrite、status/push/pull | rules-workspace export调用listRuleDescriptors再扫描默认global roots | blocked | --data-dir不隔离默认Agent roots；应安排受控home容器/既有隔离运行环境 |
| C19 CLI app-data/参数全组合 | --app-data-dir override、所有错误类型/互斥参数组合 | 仅入口盘点 | not-run | 本轮选中回归不等于全参数覆盖 |
| C20 CLI发行包/Win/Linux | bin wrapper、packaged运行和原生平台 | 共享out存在但未核实属于HEAD | blocked | 禁止build；macOS源码入口不能替代发行包/其他OS |
| W01 Web auth | bootstrap/captcha/register/login/refresh/logout/me/password、限速/伪造header | auth.test.ts | pass | Request经过createApp；验证码helper解题，非视觉验证码验收 |
| W02 Web Prompt/Folder隔离 | 私有/共享/管理员权限；CRUD、搜索过滤、tags、版本、层级、graph/output | prompts/folders/prompt-advanced/prompt-graph-restore tests | pass | 真实临时SQLite与文件；GUI未验 |
| W03 Web Skill | CRUD/search/import/export、安全报告、版本、远端导入校验 | skills.test.ts | pass | 远端HTTP替换；非Git/浏览器完整包安装 |
| W04 Web Rules | 项目增删、内容保存/读回、非法import/rewrite及超限写入拒绝、路径约束 | rules.test.ts | pass | 服务器托管数据；不证明原生Agent投影 |
| W05 Web Settings | user隔离、部分/嵌套更新、字段验证、敏感security字段拒绝 | settings.test.ts | pass | 以用例断言为边界；没有配置真实凭据 |
| W06 Web AI路由 | request/stream参数、协议、错误与响应合同 | ai.test.ts | pass | remote-http被替换；真实AI请求blocked |
| W07 Web媒体 | image upload/list/read/exists/size/delete/clear及失败原子性；video错误指向/远端下载合同 | media.test.ts；独立进程重开字节读回 | pass | 远端下载HTTP mock；不是浏览器上传UI |
| W08 Web设备 | heartbeat/list、超长元信息拒绝 | devices.test.ts | pass | JSON落盘断言；未真实设备上线 |
| W09 Web备份 | capabilities/list/latest/upload、版本失配、secret拒绝、symlink拒绝、live数据不被导入 | desktop-backups.test.ts | pass | 没有真实桌面客户端网络传输 |
| W10 Web sync导入/合同 | manifest/data/config/status/push/pull、merge、settings、graph和binary Skill合同 | sync-contract/sync-import/skill-snapshot-compatibility tests | pass | WebDAV远端方法mock；非实际云盘 |
| W11 Web sync恢复 | 媒体写入失败回滚记录、后续写入失败删除已落媒体、路径限制 | sync-import-filesystem.test.ts；sync-webdav.test.ts | pass | 故障注入；真实SQLite/磁盘后置断言 |
| W12 Web导入导出 | roundtrip、旧路径、settings校验、坏JSON/ZIP/paths、部分失败rollback | 4个import-export测试文件 | pass | 所选真实路由，不能外推全部历史版本 |
| W13 Web进程重开 | 新库初始化、注册、私有prompt/folder、用户隔离、媒体字节；新进程登录读回并更新 | web-reopen.mts create/reopen，均exit0 | pass | createApp Hono Request；未监听HTTP socket，未生产index启动 |
| W14 Web Agent合同 | services/config/provider/session各路由状态、role/请求校验、脱敏 | agents.test.ts 选中7项 | pass | inventory、config、provider、session服务均注入；不证明真实配置写盘 |
| W15 Web Agent真实服务 | 真实inventory/config加密备份/provider/session索引 | 首个用例会探测实际server account roots而未隔离 | blocked | 未执行首个用例；需明确隔离的server Agent homes |
| W16 Web真实HTTP/部署/浏览器 | 生产index socket、Docker打包验证码资源、浏览器所有交互 | 未运行 | blocked | 禁build/GUI；runtime packaging不靠app.request证明 |
| W17 Web真实供应商/云盘 | AI和WebDAV/S3网络、取消、真实远端故障 | 未调用 | blocked | 不使用真实账号/付费模型 |
| W18 Web本地桌面能力 | 浏览器部署到viewer Agent、shell/tray/native dialog | web.md capability boundary | unsupported | Web服务器托管Agent适配器不等于viewer本机能力 |
| F01 Worker鉴权合同 | captcha开关/register/login/public route与invalid token | auth.test.ts；worker.test.ts | pass | Node、模拟D1；JWT本地真实函数 |
| F02 Worker媒体合同 | base64上传及content-type | media.test.ts | pass | R2.put mock，不验证R2持久化或下载/list所有分支 |
| F03 Worker快照合同 | 版本/field/唯一性/容量、tenant binding、race、stale write/未知write结果 | sync.test.ts | pass | D1 SQL调用模拟，不证明真实并发/事务 |
| F04 Worker恢复与binary兼容 | direct folder/prompt/version restore；老reader/writer拒绝、binary保留 | web-data-direct-restore与skill-snapshot-compatibility tests | pass | 模拟D1快照；不是workerd磁盘重开 |
| F05 Worker body校验 | 分块限量/取消、刚好上限、坏JSON/Content-Length/读失败 | response.test.ts | pass | 真实ReadableStream本地函数 |
| F06 Worker其余正常业务 | Prompt普通CRUD/search/tags/version、Folder普通CRUD/reorder、Rules/Skills读取、settings、device heartbeat、媒体read/list | 注册清单已核对 | not-run | 既有29项不足以覆盖这些注册操作 |
| F07 Worker 500不泄露 | 真正内部异常的500响应 | worker.test.ts名为500的用例实际只断言401 | not-run | 覆盖缺口V01，不能称500分支通过 |
| F08 Worker实际运行时/部署 | Workers/D1/R2 migrations、重开/恢复、域名/CORS/静态assets | wrangler配置使用web/dist/client；现有产物未经HEAD构建验证 | blocked | wrangler dev需编译/打包；本轮禁止build/部署 |
| F09 Worker本地能力/尚未实现写路径 | Skill create/update/delete/export/version写、远端导入、安全扫描；Rules写/scan/projects/rewrite | worker.ts显式notImplemented返回501 | unsupported | 精确端点见注册附录，不代表Web也不支持 |
| C21 CLI graph剩余操作 | relation update/delete；output-format list/delete/reorder | 已注册但选中用例未覆盖 | not-run | 不能由create/list推断其他操作通过 |
| W19 Web Rules剩余操作 | scan、version-delete、合法rewrite与正常import-records | rules.test.ts未完整覆盖这些正常路径 | not-run | 当前通过是项目CRUD与异常数据保全 |
| W20 Web视频全生命周期 | videos base64/upload/read/exists/size/delete/clear | 共享media实现与图片不能代替每个视频入口 | not-run | 未逐路由执行视频往返 |

场景组分母 50；状态计数：pass 31，fail 2，blocked 8，not-run 7，unsupported 2。这些计数不声称所有已注册操作均执行。

## 首轮缺陷与覆盖风险（历史）

D01/D02已在第二轮修复，V01由持久500回归补齐；以下保留首次复现与当时建议。

### D01 — doctor 缺少 --help（P3）

- 基线：上述 HEAD；README 说明每个资源命令都有 --help，root help注册 doctor。
- 复现：在临时 data-dir，执行 `pnpm --filter @prompthub/cli exec tsx src/index.ts --data-dir <临时绝对路径> doctor --help`。实际child退出2；JSON stderr为 `USAGE_ERROR` / `不支持的 doctor 命令: --help`。PNPM exec包装层自身退出1并在stdout附加包装错误，不能把它误写成CLI原生退出1。
- 预期：帮助文本、退出0，不开DB。实际无帮助。已有doctor正常锁诊断/恢复通过，因此影响是发现与使用说明，未见数据损坏。
- 推荐回归：apps/cli/tests/doctor.test.ts增加doctor --help/-h/无参数合同，并覆盖真实源码子进程。候选修复位置packages/core/src/cli/doctor-command.ts及help.ts；不能通过把README的统一帮助承诺删掉掩盖。

### D02 — README 的 pnpm dev 示例失败（P2）

- README.md:295–296显示 `pnpm --filter @prompthub/cli dev -- prompt list` 和skill scan。为避免真实用户数据，复现中增加 `--data-dir /tmp/prompthub-cross-acceptance-yqs5jl/readme-data`。
- 实际：脚本收到第一个资源为`--`，返回 `USAGE_ERROR`、`不支持的资源类型: --`，PNPM run退出2。发生在资源分派前，临时目录没有创建数据库。
- 对照：`pnpm --filter @prompthub/cli dev --data-dir <temp> prompt list`成功，退出0、空列表。
- 影响：按公开免安装指令运行核心命令失败；不是依赖缺失或构建失败。
- 推荐：统一公开pnpm调用写法并增加README命令的真实子进程回归；如需求决定支持额外separator，应在args单一边界实现并测试，不能擅增兼容。

### V01 — Worker测试名与断言不匹配

apps/web-cloudflare/tests/worker.test.ts的 `does not leak internal error messages in 500 responses` 实际发无效token并期待401。测试通过只证明认证错误文案，不证明500日志/脱敏。推荐加入真实抛错handler路径的500响应断言，同时保留401用例。

### 文档/隔离差异

- docs/web-self-hosted.md 的 `workspace files + SQLite index` 与foundation当前结构化数据SQLite所有权描述不一致；交由总协调统一，首轮未修改。
- README资源一览漏列workspace/sync/doctor；命令注册附录包含它们。
- CLI workspace export/sync push/rules export会调用rules默认global path扫描；仅传 --data-dir 不足以隔离真实Agent根目录。本轮因此没有执行对应全量文件，保留blocked，不用真实用户目录凑覆盖。
- Web Agent首个集成用例只有自定义Agent根处于临时目录，built-in inventory仍会探测server account默认根。7个纯注入合同用例单独运行。

## 实际命令与运行证据

所有Vitest均单worker、顺序执行，无watch。包装器为每组设置deadline、stdout/stderr落到本任务临时目录并限制回传；CLI单组不超过原有75秒budget。磁盘输入是小规模fixture，未测大容量吞吐；无容量或性能结论。

| 批次 | UTC开始→结束 | PID | 退出码 |
| --- | --- | --- | --- |
| cli | 2026-10-04T09:25:03.286Z → 2026-10-04T09:25:16.673Z | 72532 | 0 |
| web | 2026-10-04T09:25:29.688Z → 2026-10-04T09:26:14.993Z | 73137 | 0 |
| worker | 2026-10-04T09:26:59.478Z → 2026-10-04T09:27:04.598Z | 75568 | 0 |
| web-create | 2026-10-04T09:27:48.620Z → 2026-10-04T09:27:56.007Z | 76309 | 0 |
| web-reopen | 2026-10-04T09:28:05.146Z → 2026-10-04T09:28:06.462Z | 76436 | 0 |
| cli-assets | 2026-10-04T09:28:26.763Z → 2026-10-04T09:28:53.681Z | 76735 | 0 |
| web-agents-contract | 2026-10-04T09:29:02.616Z → 2026-10-04T09:29:05.901Z | 76987 | 0 |
| cli-readme | 2026-10-04T09:29:24.182Z → 2026-10-04T09:29:26.314Z | 77241 | 2 |
| cli-entry | 2026-10-04T09:29:38.971Z → 2026-10-04T09:29:47.291Z | 77542 | 0 |
| cli-readme-corrected | 2026-10-04T09:30:14.727Z → 2026-10-04T09:30:16.278Z | 77793 | 0 |

CLI独立父脚本执行命令：`pnpm exec node /tmp/prompthub-cross-acceptance-yqs5jl/cli-process.mjs`。

从仓库根目录执行的精确pnpm命令（临时脚本/路径在清理后须按下方复现材料重建）：

```sh
pnpm --filter @prompthub/cli exec vitest run tests/prompt.test.ts tests/ai-config.test.ts tests/database-concurrency.test.ts tests/doctor.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web exec vitest run src/routes/auth.test.ts src/routes/prompts.test.ts src/routes/prompt-advanced.test.ts src/routes/prompt-graph-restore.test.ts src/routes/folders.test.ts src/routes/skills.test.ts src/routes/rules.test.ts src/routes/settings.test.ts src/routes/ai.test.ts src/routes/media.test.ts src/routes/devices.test.ts src/routes/desktop-backups.test.ts src/routes/sync-contract.test.ts src/routes/sync-import.test.ts src/routes/sync-import-filesystem.test.ts src/routes/sync-webdav.test.ts src/routes/import-export-roundtrip.test.ts src/routes/import-export-safety-rollback.test.ts src/routes/import-export-settings-validation.test.ts src/routes/import-export-path-compatibility.test.ts src/routes/skill-snapshot-compatibility.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web-cloudflare exec vitest run tests/auth.test.ts tests/media.test.ts tests/sync.test.ts tests/web-data-direct-restore.test.ts tests/skill-snapshot-compatibility.test.ts tests/worker.test.ts tests/response.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web exec tsx /tmp/prompthub-cross-acceptance-yqs5jl/web-reopen.mts create
pnpm --filter @prompthub/web exec tsx /tmp/prompthub-cross-acceptance-yqs5jl/web-reopen.mts reopen
pnpm --filter @prompthub/cli exec vitest run tests/cli-completeness.test.ts tests/skill-frontmatter.test.ts tests/skill-project-install.test.ts tests/skill.test.ts -t 'supports MCP create|supports prompt parent|lists plugins|exposes plugin|uses the shared|preserves file-owned|installs, skips|selects a project|supports fuzzy|supports skill versions|installs a local skill|does not silently truncate' --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web exec vitest run src/routes/agents.test.ts -t 'returns a stable internal|serves the complete|redacts service|exposes authenticated|guards config|manages provider|serves bounded' --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/cli dev -- --data-dir /tmp/prompthub-cross-acceptance-yqs5jl/readme-data prompt list
pnpm --filter @prompthub/cli exec vitest run tests/run.test.ts -t 'keeps concurrent programmatic|creates new CLI databases|keeps reading an existing legacy|selects prompts interactively|reports empty MCP|supports MCP market|supports the full folder lifecycle|folder reorder omits' --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/cli dev --data-dir /tmp/prompthub-cross-acceptance-yqs5jl/readme-data prompt list
```

独立CLI进程检查通过命令由 pnpm exec node 启动测试父进程；父进程使用当前Node加 --import tsx 从apps/cli启动源码CLI，每次timeout 10000ms、maxBuffer 1MiB、等待退出，核心CRUD每步都是新进程。会话85143（帮助发现）、28048（直接child退出码及CRUD）。初版父脚本在doctor处终止；第二版记录该已确认失败后继续其他独立场景，输出中的总体pass只对应后续流程，不能覆盖doctor失败。

## 完整操作入口盘点

### CLI

真源：packages/core/src/cli/run.ts、各*-command.ts与help.ts。下面含已存在alias；不是授权增加alias。

| 资源 | 已注册操作 |
| --- | --- |
| prompt | list, get, create, update, delete, duplicate, search, versions, create-version, delete-version, diff, rollback, use, copy, list-tags, rename-tag, delete-tag, relation list, relation create, relation update, relation delete, output-format list, output-format create, output-format delete, output-format reorder |
| folder | list, get, create, update, delete, reorder |
| agent | list, get, enable, disable, add, update, configure, reset, delete, identity get, identity set, config list, config read |
| rules | list, scan, read, save, rewrite, versions, version-read, version-restore, version-delete, project-init, add-project, remove-project, export, import |
| workspace | export, import |
| skill | list, get, import, install, project-install, install-project, scan, versions, create-version, rollback, delete-version, export, platforms, platform-status, distribute, install-md, undistribute, uninstall-md, repo-files, repo-read, repo-write, repo-delete, repo-mkdir, repo-rename, sync-from-repo, scan-safety, update, check-update, delete, remove |
| mcp | list, get, create, update, delete, market, sources, install, import, check, env-import, enable, disable, export, apply, remove |
| plugin | list, get, market, sources, install, delete, versions, create-version |
| sync | status, push, pull |
| ai | providers, provider-add, provider-delete, models, model-add, model-delete, routes, route-set, route-clear |
| doctor | database-lock |

11个资源，127个命令路径（含alias）。全局：--data-dir、--app-data-dir、--output/-o json/table、--summary/--full/--quiet、--version/-v、--help/-h。

参数登记（源文件中的字面量，含相应utils；表明输入面，未声称每种组合执行）：

- prompt: --description, --favorite, --folder-id, --from, --help, --id, --images, --kind, --last-ai-response, --last-ai-response-file, --limit, --note, --notes, --offset, --parent-id, --pinned, --prompt-id, --prompt-type, --scope, --sort-by, --sort-order, --source, --system-prompt, --system-prompt-en, --system-prompt-en-file, --system-prompt-file, --tags, --target, --title, --to, --unfavorite, --unpinned, --usage-count, --var, --variables, --variables-file, --user-prompt, --user-prompt-en, --user-prompt-en-file, --user-prompt-file, --version, --videos, --visibility
- folder: --help, --icon, --ids, --name, --order, --parent-id, --private, --public
- agent: --agents-path, --commands-path, --config-paths, --disabled, --enabled, --filter, --help, --icon, --id, --include-disabled, --mcp-path, --name, --plugins-path, --root, --rules-path, --search, --skills-path
- rules: --api-key, --api-protocol, --api-url, --content, --content-file, --file, --help, --id, --instruction, --instruction-file, --model, --name, --provider, --replace, --root-path
- workspace: --endpoint, --file, --force-clear, --help, --token
- skill: --author, --content, --content-file, --description, --favorite, --fetch-remote, --force, --format, --from, --help, --keep-platform-installs, --mode, --name, --note, --path, --platform, --project, --purge-managed-repo, --source-label, --tags, --target, --to, --unfavorite, --version
- mcp: --args, --command, --cwd, --description, --disabled, --display-name, --enabled, --env, --file, --force, --headers, --help, --keys, --name, --notes, --path, --preset, --servers, --tags, --target, --transport, --url
- plugin: --help, --note, --remove-targets
- sync: --endpoint, --token, --force-clear；由workspace-command.ts解析，亦支持PROMPTHUB_SYNC_ENDPOINT、PROMPTHUB_SYNC_TOKEN、PROMPTHUB_TOKEN
- ai: --api-key, --api-url, --help, --image-generation, --model, --name, --protocol, --provider, --reasoning, --type, --vision
- doctor: --recover

### Self-hosted Web

所有业务路由经createApp的protectedApi auth中间件；auth公开路由有各自验证。以下全部注册路径按所属文件合并列出（/api前缀）；动态media模板展开images/videos。

| 源文件 | 操作登记 |
| --- | --- |
| apps/web/src/routes/auth.ts | GET /bootstrap; GET /captcha; POST /register; POST /login; POST /refresh; POST /logout; GET /me; PUT /password |
| apps/web/src/routes/prompts.ts | POST /graph/restore; POST /; POST /direct-insert; POST /versions/direct-insert; DELETE /versions/:versionId; POST /workspace/sync; GET /; POST /:id/move; POST /relations; GET /relations; PUT /relations/:id; DELETE /relations/:id; POST /output-formats; GET /output-formats; PUT /output-formats/:id; DELETE /output-formats/:id; PUT /output-formats/:id/reorder; GET /:id; PUT /:id; DELETE /:id; POST /:id/copy; GET /:id/versions; POST /:id/versions; POST /:id/versions/:versionId/rollback; DELETE /:id/versions/:versionId; GET /:id/versions/diff; GET /meta/tags; POST /meta/tags/rename; POST /meta/tags/delete |
| apps/web/src/routes/folders.ts | POST /; POST /direct-insert; GET /; PUT /reorder; PUT /:id; DELETE /:id |
| apps/web/src/routes/skills.ts | POST /; GET /; GET /search; GET /:id; PUT /:id; DELETE /:id; DELETE /; POST /:id/export; POST /import; POST /:id/safety-scan; POST /safety-scan; PUT /:id/safety-report; POST /fetch-remote; GET /:id/versions; POST /:id/versions; POST /:id/versions/:versionId/rollback; DELETE /:id/versions/:versionId |
| apps/web/src/routes/rules.ts | GET /; POST /scan; POST /projects; DELETE /projects/:projectId; GET /:id; PUT /:id; POST /rewrite; POST /:id/rewrite; POST /import-records; DELETE /:id/versions/:versionId |
| apps/web/src/routes/settings.ts | GET /; PUT / |
| apps/web/src/routes/agents.ts | GET /; GET /:agentId/services; GET /:agentId/services/:domain; GET /:agentId/config-files; POST /:agentId/config-files/read; PUT /:agentId/config-files; GET /:agentId/provider-profiles; POST /:agentId/provider-profiles; PUT /:agentId/provider-profiles/:profileId; POST /:agentId/provider-profiles/:profileId/archive; POST /:agentId/provider-profiles/:profileId/duplicate; GET /:agentId/provider-profiles/:profileId/export; DELETE /:agentId/provider-profiles/:profileId; GET /:agentId/sessions; GET /:agentId/sessions/state; GET /:agentId/sessions/:sessionId |
| apps/web/src/routes/ai.ts | POST /request; POST /stream |
| apps/web/src/routes/media.ts | GET /images; GET /videos; GET /images/:filename; GET /videos/:filename; DELETE /images/:filename; DELETE /videos/:filename; GET /images/:filename/exists; GET /videos/:filename/exists; GET /images/:filename/size; GET /videos/:filename/size; GET /images/:filename/base64; GET /videos/:filename/base64; POST /images/download; POST /videos/download; POST /images/base64; POST /videos/base64; POST /images; POST /videos; DELETE /images; DELETE /videos |
| apps/web/src/routes/devices.ts | GET /; POST /heartbeat |
| apps/web/src/routes/backups.ts | GET /desktop/capabilities; GET /desktop; GET /desktop/latest; POST /desktop |
| apps/web/src/routes/import-export.ts | GET /export; POST /import |
| apps/web/src/routes/sync.ts | GET /manifest; GET /data; PUT /data; GET /config; PUT /config; POST /push; POST /pull; GET /status |

共126个注册业务操作，另有GET /health。media的basePath变量GET/DELETE已展开。Web Agent的adapter业务未用mock通过替代真实文件读写验收。

### Cloudflare Worker

真源apps/web-cloudflare/src/worker.ts；认证中间件按/api命名域注册。

| 操作 | 注册状态 / 本轮边界 |
| --- | --- |
| GET /health | 已注册；实际证据/未测见F01–F08 |
| GET /api/auth/bootstrap | 已注册；实际证据/未测见F01–F08 |
| GET /api/auth/captcha | 已注册；实际证据/未测见F01–F08 |
| POST /api/auth/register | 已注册；实际证据/未测见F01–F08 |
| POST /api/auth/login | 已注册；实际证据/未测见F01–F08 |
| POST /api/auth/refresh | 已注册；实际证据/未测见F01–F08 |
| POST /api/auth/logout | 已注册；实际证据/未测见F01–F08 |
| GET /api/auth/me | 已注册；实际证据/未测见F01–F08 |
| POST /api/devices/heartbeat | 已注册；实际证据/未测见F01–F08 |
| GET /api/sync/manifest | 已注册；实际证据/未测见F01–F08 |
| GET /api/sync/data | 已注册；实际证据/未测见F01–F08 |
| PUT /api/sync/data | 已注册；实际证据/未测见F01–F08 |
| GET /api/prompts/meta/tags | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/meta/tags/rename | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/meta/tags/delete | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/direct-insert | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/versions/direct-insert | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/prompts/versions/:versionId | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/workspace/sync | 已注册；实际证据/未测见F01–F08 |
| GET /api/prompts/:id/versions | 已注册；实际证据/未测见F01–F08 |
| GET /api/prompts/:id/versions/diff | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/:id/versions | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/:id/versions/:version/rollback | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/prompts/:id/versions/:versionId | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/:id/render-copy | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts/:id/copy | 已注册；实际证据/未测见F01–F08 |
| GET /api/prompts/:id | 已注册；实际证据/未测见F01–F08 |
| PUT /api/prompts/:id | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/prompts/:id | 已注册；实际证据/未测见F01–F08 |
| GET /api/prompts | 已注册；实际证据/未测见F01–F08 |
| POST /api/prompts | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/prompt-versions/:versionId | 已注册；实际证据/未测见F01–F08 |
| POST /api/folders/direct-insert | 已注册；实际证据/未测见F01–F08 |
| PUT /api/folders/reorder | 已注册；实际证据/未测见F01–F08 |
| GET /api/folders | 已注册；实际证据/未测见F01–F08 |
| POST /api/folders | 已注册；实际证据/未测见F01–F08 |
| PUT /api/folders/:id | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/folders/:id | 已注册；实际证据/未测见F01–F08 |
| POST /api/skills/safety-scan | unsupported：显式501 |
| POST /api/skills/fetch-remote | unsupported：显式501 |
| PUT /api/skills/:id/safety-report | unsupported：显式501 |
| GET /api/skills/:id/versions | 已注册；实际证据/未测见F01–F08 |
| POST /api/skills/:id/versions | unsupported：显式501 |
| POST /api/skills/:id/versions/:version/rollback | unsupported：显式501 |
| DELETE /api/skills/:id/versions/:versionId | unsupported：显式501 |
| POST /api/skills/:id/export | unsupported：显式501 |
| GET /api/skills/:id | 已注册；实际证据/未测见F01–F08 |
| POST /api/skills | unsupported：显式501 |
| PUT /api/skills/:id | unsupported：显式501 |
| DELETE /api/skills/:id | unsupported：显式501 |
| GET /api/skills | 已注册；实际证据/未测见F01–F08 |
| DELETE /api/skills | unsupported：显式501 |
| POST /api/rules/scan | unsupported：显式501 |
| POST /api/rules/rewrite | unsupported：显式501 |
| POST /api/rules/projects | unsupported：显式501 |
| DELETE /api/rules/projects/:id | unsupported：显式501 |
| POST /api/rules/import-records | unsupported：显式501 |
| DELETE /api/rules/:id/versions/:versionId | unsupported：显式501 |
| PUT /api/rules/:id | unsupported：显式501 |
| GET /api/rules/:id | 已注册；实际证据/未测见F01–F08 |
| GET /api/rules | 已注册；实际证据/未测见F01–F08 |
| GET /api/settings | 已注册；实际证据/未测见F01–F08 |
| PUT /api/settings | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/images | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/videos | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/images/:filename/base64 | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/videos/:filename/base64 | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/images/:filename/exists | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/videos/:filename/exists | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/images/:filename/size | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/videos/:filename/size | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/images/:filename | 已注册；实际证据/未测见F01–F08 |
| GET /api/media/videos/:filename | 已注册；实际证据/未测见F01–F08 |
| POST /api/media/images/base64 | 已注册；实际证据/未测见F01–F08 |
| POST /api/media/videos/base64 | 已注册；实际证据/未测见F01–F08 |
| POST /api/media/images | 请求合同：400并指向base64 |
| POST /api/media/videos | 请求合同：400并指向base64 |

共77个显式method/path。未注册Web Agents、AI proxy、desktop backup等路由不能借前端共享而推断可用。

## 已执行用例名称

这些名称用于精确复跑和区分边界；mock性质以矩阵为准。

### cli

- tests/database-concurrency.test.ts > database client lock coordination > preserves a writer lock owned by another live PromptHub client
- tests/database-concurrency.test.ts > database client lock coordination > preserves a live registered writer during legacy lock recovery
- tests/database-concurrency.test.ts > database client lock coordination > recovers an orphan lock and prunes dead or malformed leases
- tests/database-concurrency.test.ts > database client lock coordination > preserves a lock with no registered owner for mixed-version safety
- tests/database-concurrency.test.ts > database client lock coordination > preserves an unsafe lock path during explicit legacy recovery
- tests/database-concurrency.test.ts > database client lock coordination > preserves a lock when unknown lease metadata cannot be pruned
- tests/database-concurrency.test.ts > database client lock coordination > rolls back its registration when lease scanning fails
- tests/database-concurrency.test.ts > database client lock coordination > uses one process exit listener for multiple database leases
- tests/database-concurrency.test.ts > database client lock coordination > runs registered lease cleanup through the process exit handler
- tests/database-concurrency.test.ts > database client lock coordination > treats EPERM process probes as live clients
- tests/database-concurrency.test.ts > database client lock coordination > blocks recovery when a lock reappears during the recovery attempt
- tests/database-concurrency.test.ts > database client lock coordination > refuses a symbolic-link client lease directory
- tests/database-concurrency.test.ts > database client lock coordination > cleans up its lease when database initialization fails
- tests/database-concurrency.test.ts > database client lock coordination > registers normal clients and configures a bounded busy timeout
- tests/database-concurrency.test.ts > database client lock coordination > releases write locks after prepared statement operations
- tests/database-concurrency.test.ts > database client lock coordination > keeps reusable statements functional without retaining writer locks
- tests/database-concurrency.test.ts > database client lock coordination > serializes real overlapping writers across processes
- tests/database-concurrency.test.ts > database client lock coordination > returns an actionable conflict for database is locked
- tests/database-concurrency.test.ts > database client lock coordination > returns an actionable conflict for database table is locked
- tests/database-concurrency.test.ts > database client lock coordination > returns an actionable conflict for SQLITE_BUSY
- tests/database-concurrency.test.ts > database client lock coordination > does not misclassify corruption as a lock conflict
- tests/prompt.test.ts > prompt CLI commands > normalizes CSV tags by trimming whitespace and dropping empty items
- tests/prompt.test.ts > prompt CLI commands > rejects using inline and file system prompt inputs together
- tests/prompt.test.ts > prompt CLI commands > supports the full prompt lifecycle
- tests/prompt.test.ts > prompt CLI commands > filters prompts by visibility scope and renders copied prompt variables
- tests/prompt.test.ts > prompt CLI commands > creates prompts with extended fields and variables
- tests/prompt.test.ts > prompt CLI commands > duplicates a prompt with copied content
- tests/prompt.test.ts > prompt CLI commands > lists prompt versions after content updates
- tests/prompt.test.ts > prompt CLI commands > creates and deletes a manual prompt version
- tests/prompt.test.ts > prompt CLI commands > shows diffs between prompt versions
- tests/prompt.test.ts > prompt CLI commands > rolls back a prompt to a previous version
- tests/prompt.test.ts > prompt CLI commands > increments usage count when prompt use is invoked
- tests/prompt.test.ts > prompt CLI commands > lists, renames, and deletes prompt tags
- tests/prompt.test.ts > prompt CLI commands > updates advanced prompt fields
- tests/prompt.test.ts > prompt CLI commands > returns usage error when rollback omits --version
- tests/prompt.test.ts > prompt CLI commands > renders empty table output for prompt list
- tests/ai-config.test.ts > ai config cli > adds a provider, adds models under it, and sets desktop model routes
- tests/ai-config.test.ts > ai config cli > selects a compatible route model interactively when model id is omitted
- tests/ai-config.test.ts > ai config cli > rejects assigning a non-vision chat model to the vision route
- tests/ai-config.test.ts > ai config cli > keeps providers when deleting a model
- tests/doctor.test.ts > database lock doctor > reports an absent lock without opening SQLite
- tests/doctor.test.ts > database lock doctor > rejects unsupported doctor actions without opening SQLite
- tests/doctor.test.ts > database lock doctor > recovers an ordinary ownerless lock only when explicitly requested
- tests/doctor.test.ts > database lock doctor > prunes malformed and stale regular leases during explicit recovery
- tests/doctor.test.ts > database lock doctor > refuses recovery while a registered client is alive
- tests/doctor.test.ts > database lock doctor > refuses unknown lease entries and unsafe lock path types
- tests/doctor.test.ts > database lock doctor > refuses non-directory lock and client paths

### cli-assets

- tests/skill.test.ts > CLI skill commands > installs a local skill from JSON
- tests/skill.test.ts > CLI skill commands > does not silently truncate long local JSON skill fields
- tests/skill.test.ts > CLI skill commands > supports skill versions, repo operations, export, sync, safety scan, and rollback
- tests/cli-completeness.test.ts > CLI feature completeness > supports MCP create, update, and delete
- tests/cli-completeness.test.ts > CLI feature completeness > supports prompt parent-id, relations, and output formats
- tests/cli-completeness.test.ts > CLI feature completeness > lists plugins from the shared library and supports delete
- tests/cli-completeness.test.ts > CLI feature completeness > exposes plugin in root help
- tests/skill-project-install.test.ts > CLI project Skill installation > installs, skips, and overwrites a My Skills package in a project
- tests/skill-project-install.test.ts > CLI project Skill installation > selects a project Skill interactively when no identifier is provided
- tests/skill-project-install.test.ts > CLI project Skill installation > supports fuzzy project Skill selection and rejects ambiguous matches
- tests/skill-frontmatter.test.ts > CLI SKILL.md frontmatter > uses the shared YAML parser for block scalars and standard fields
- tests/skill-frontmatter.test.ts > CLI SKILL.md frontmatter > preserves file-owned fields when CLI export receives a full SKILL.md

### cli-entry

- tests/run.test.ts > standalone cli wiring > keeps concurrent programmatic CLI invocations in their own data directories
- tests/run.test.ts > standalone cli wiring > creates new CLI databases under the unified data directory
- tests/run.test.ts > standalone cli wiring > keeps reading an existing legacy root database when no unified database exists
- tests/run.test.ts > standalone cli wiring > selects prompts interactively when a query is ambiguous
- tests/run.test.ts > standalone cli wiring > reports empty MCP market templates without installing placeholders
- tests/run.test.ts > standalone cli wiring > supports MCP market, import, env import, and health check in the shared library
- tests/run.test.ts > standalone cli wiring > supports the full folder lifecycle
- tests/run.test.ts > standalone cli wiring > returns usage error when folder reorder omits ids

### web

- src/routes/skills.test.ts > web skill routes > enforces create/list/get/update/delete permissions across private and shared skills
- src/routes/skills.test.ts > web skill routes > scans safety findings and persists explicit safety reports
- src/routes/skills.test.ts > web skill routes > rejects oversized safety scan inputs before calling the AI provider
- src/routes/skills.test.ts > web skill routes > rejects safety report writes through generic skill updates
- src/routes/skills.test.ts > web skill routes > rejects oversized safety reports without persisting them
- src/routes/skills.test.ts > web skill routes > rejects version counter writes through generic skill updates
- src/routes/skills.test.ts > web skill routes > supports version create/list/rollback/delete and enforces deleteAll confirmation and role rules
- src/routes/skills.test.ts > web skill routes > returns validation errors for malformed skill requests
- src/routes/skills.test.ts > web skill routes > rejects malformed skill metadata arrays without persisting them
- src/routes/skills.test.ts > web skill routes > persists valid skill metadata arrays through create and update routes
- src/routes/skills.test.ts > web skill routes > validates skill URL metadata protocols before persisting them
- src/routes/skills.test.ts > web skill routes > fetches remote skill content and optionally imports it into the library
- src/routes/skills.test.ts > web skill routes > defaults normal user remote skill imports to private visibility
- src/routes/skills.test.ts > web skill routes > rejects remote skill imports with malformed parsed metadata
- src/routes/skills.test.ts > web skill routes > returns a validation error when remote skill fetching fails upstream
- src/routes/skills.test.ts > web skill routes > rejects non-HTTPS remote skill URLs before fetching upstream content
- src/routes/prompts.test.ts > web prompt routes > creates, updates, lists, filters, and deletes a private prompt
- src/routes/prompts.test.ts > web prompt routes > returns filtered prompt totals independently from page size
- src/routes/prompts.test.ts > web prompt routes > filters prompts by literal repeated tag query values containing commas
- src/routes/prompts.test.ts > web prompt routes > rejects oversized prompt list query filters
- src/routes/prompts.test.ts > web prompt routes > enforces shared/private visibility rules across admin and normal users
- src/routes/prompts.test.ts > web prompt routes > duplicates prompts as a private copy owned by the caller
- src/routes/prompts.test.ts > web prompt routes > rejects prompt folder references outside the prompt visibility and owner boundary
- src/routes/prompts.test.ts > web prompt routes > clears prompt folder assignment when updating folderId to null
- src/routes/prompts.test.ts > web prompt routes > clears invalid folder references when copying shared prompts into a private library
- src/routes/prompts.test.ts > web prompt routes > rejects unsafe media references before storing prompt metadata
- src/routes/prompts.test.ts > web prompt routes > rejects oversized prompt metadata arrays without persisting them
- src/routes/prompts.test.ts > web prompt routes > persists valid bounded prompt metadata arrays
- src/routes/prompts.test.ts > web prompt routes > scopes tag listing, rename, and delete to prompts visible to the actor
- src/routes/prompts.test.ts > web prompt routes > rejects oversized prompt tag mutations without changing prompt metadata
- src/routes/prompts.test.ts > web prompt routes > restores prompt folders, prompts, and versions through desktop-compatible direct endpoints
- src/routes/prompts.test.ts > web prompt routes > supports prompt version listing, diff, and rollback
- src/routes/prompts.test.ts > web prompt routes > does not delete a version through a different prompt id route
- src/routes/settings.test.ts > web settings routes > returns default settings and rejects unauthenticated access
- src/routes/settings.test.ts > web settings routes > persists partial updates, nested sync config, and isolates settings per user
- src/routes/settings.test.ts > web settings routes > preserves nested sync and device settings during partial nested updates
- src/routes/settings.test.ts > web settings routes > validates malformed settings updates
- src/routes/settings.test.ts > web settings routes > rejects malformed custom agent settings without persisting them
- src/routes/settings.test.ts > web settings routes > rejects malformed skill project settings without persisting them
- src/routes/settings.test.ts > web settings routes > rejects malformed platform settings without persisting them
- src/routes/settings.test.ts > web settings routes > rejects security state in normal settings updates
- src/routes/settings.test.ts > web settings routes > persists supported live preference fields beyond the minimal web form
- src/routes/settings.test.ts > web settings routes > clears defaultFolderId when settings update sends null
- src/routes/auth.test.ts > web auth routes > reports bootstrap status before and after the first user is created
- src/routes/auth.test.ts > web auth routes > keeps public auth endpoints outside the protected API middleware
- src/routes/auth.test.ts > web auth routes > registers the first user as admin and allows login afterward
- src/routes/auth.test.ts > web auth routes > returns conflict when registering a duplicate username
- src/routes/auth.test.ts > web auth routes > returns validation error for usernames shorter than three characters
- src/routes/auth.test.ts > web auth routes > rejects login with a wrong password
- src/routes/auth.test.ts > web auth routes > rate limits repeated failed logins to slow brute-force attempts
- src/routes/auth.test.ts > web auth routes > does not let spoofed forwarded headers bypass login rate limits
- src/routes/auth.test.ts > web auth routes > uses forwarded headers for auth rate limits only when trusted proxy mode is enabled
- src/routes/auth.test.ts > web auth routes > marks auth responses as no-store
- src/routes/auth.test.ts > web auth routes > marks auth cookies as secure for trusted proxy HTTPS requests
- src/routes/auth.test.ts > web auth routes > rejects login when captcha is missing
- src/routes/auth.test.ts > web auth routes > allows setup and login without captcha when captcha is disabled
- src/routes/auth.test.ts > web auth routes > rejects reused captcha challenges
- src/routes/auth.test.ts > web auth routes > accepts access tokens from HttpOnly cookies for authenticated routes
- src/routes/auth.test.ts > web auth routes > returns current user for GET /me with a valid access token
- src/routes/auth.test.ts > web auth routes > rotates refresh tokens and rejects a consumed refresh token
- src/routes/auth.test.ts > web auth routes > rejects oversized optional auth bodies before refreshing tokens
- src/routes/auth.test.ts > web auth routes > rejects oversized auth JSON bodies before parsing credentials
- src/routes/auth.test.ts > web auth routes > rejects GET /me without an authorization header
- src/routes/auth.test.ts > web auth routes > blocks additional registrations when registration is disabled after bootstrap
- src/routes/auth.test.ts > web auth routes > logout invalidates the refresh token
- src/routes/auth.test.ts > web auth routes > changes password and rejects the old password afterward
- src/routes/media.test.ts > web media routes > uploads image base64 content and supports the full read/delete lifecycle
- src/routes/media.test.ts > web media routes > rejects path traversal uploads and requires confirm=true for delete-all
- src/routes/media.test.ts > web media routes > rejects invalid base64 uploads without creating media files
- src/routes/media.test.ts > web media routes > rejects declared oversized base64 uploads before parsing JSON
- src/routes/media.test.ts > web media routes > rejects path traversal reads and deletes as bad requests
- src/routes/media.test.ts > web media routes > clears deletable media files while skipping entries that cannot be removed
- src/routes/media.test.ts > web media routes > does not expose directory entries that use allowed media extensions
- src/routes/media.test.ts > web media routes > downloads remote media and infers extensions from upstream content types
- src/routes/media.test.ts > web media routes > points video upload callers to every supported media creation route
- src/routes/media.test.ts > web media routes > wraps upstream download failures as bad requests
- src/routes/media.test.ts > web media routes > rejects remote media downloads with unsupported content types
- src/routes/media.test.ts > web media routes > rejects non-HTTPS remote media downloads before contacting upstream hosts
- src/routes/media.test.ts > web media routes > returns a blocked-internal-network error for LAN image URLs
- src/routes/media.test.ts > web media routes > does not leave partial media files when base64 writes are interrupted
- src/routes/sync-import.test.ts > web sync import merge and settings > keeps newer remote items while merging incoming desktop payload additions
- src/routes/sync-import.test.ts > web sync import merge and settings > accepts PromptHub envelopes on sync data import and normalizes desktop settings snapshots
- src/routes/sync-import.test.ts > web sync import merge and settings > fills missing settings with shared defaults during sync import
- src/routes/sync-import.test.ts > web sync import merge and settings > rejects sync imports with insecure WebDAV settings endpoints
- src/routes/sync-import.test.ts > web sync import merge and settings > rejects sync imports with oversized WebDAV settings fields
- src/routes/sync-import.test.ts > web sync import merge and settings > rejects sync imports with malformed persisted settings preference fields
- src/routes/sync-import.test.ts > web sync import merge and settings > round-trips prompt relations and output formats while dropping dangling dependencies
- src/routes/folders.test.ts > web folder routes > creates, lists, updates, and deletes a private folder
- src/routes/folders.test.ts > web folder routes > allows reading shared folders but blocks non-admin modifications
- src/routes/folders.test.ts > web folder routes > blocks normal users from creating shared folders and hides private folders from other users
- src/routes/folders.test.ts > web folder routes > keeps legacy isPrivate input coherent with folder visibility
- src/routes/folders.test.ts > web folder routes > enforces parent visibility matching and reorder validation
- src/routes/folders.test.ts > web folder routes > rejects duplicate folder ids during reorder without changing the existing order
- src/routes/folders.test.ts > web folder routes > rejects oversized folder reorder payloads before loading folder rows
- src/routes/folders.test.ts > web folder routes > rejects visibility-only updates that would mismatch parent and child folders
- src/routes/folders.test.ts > web folder routes > rejects folder parent updates that would create cycles
- src/routes/folders.test.ts > web folder routes > allows moving a nested folder back to the root
- src/routes/folders.test.ts > web folder routes > rejects unauthenticated folder creation
- src/routes/sync-contract.test.ts > web sync route contracts > serves manifest, data, config, and status routes with real backup data integrity
- src/routes/sync-contract.test.ts > web sync route contracts > rejects oversized sync data content-length before importing records
- src/routes/sync-contract.test.ts > web sync route contracts > rejects oversized sync config fields without persisting them
- src/routes/sync-contract.test.ts > web sync route contracts > accepts extended sync providers in config and reflects provider in status
- src/routes/import-export-roundtrip.test.ts > web import/export routes > exports the expected payload shape and enforces auth
- src/routes/import-export-roundtrip.test.ts > web import/export routes > round-trips data, merges visible records, restores settings, and preserves nested folders
- src/routes/import-export-settings-validation.test.ts > web import/export routes > imports legacy versions payloads and normalizes numeric timestamps back to ISO strings
- src/routes/import-export-settings-validation.test.ts > web import/export routes > imports PromptHub backup/export envelopes and restores embedded media payloads
- src/routes/import-export-settings-validation.test.ts > web import/export routes > fills missing settings with shared defaults during import
- src/routes/import-export-settings-validation.test.ts > web import/export routes > rejects imported WebDAV settings with insecure endpoints
- src/routes/import-export-settings-validation.test.ts > web import/export routes > rejects imported WebDAV settings with oversized fields
- src/routes/import-export-settings-validation.test.ts > web import/export routes > rejects imported settings with malformed persisted preference fields
- src/routes/import-export-settings-validation.test.ts > web import/export routes > rejects invalid import payloads
- src/routes/ai.test.ts > web ai routes > validates request payloads and buffers successful AI proxy requests
- src/routes/ai.test.ts > web ai routes > rejects non-HTTPS AI proxy URLs before contacting upstream hosts
- src/routes/ai.test.ts > web ai routes > rejects oversized AI proxy request envelopes and fields before contacting upstream hosts
- src/routes/ai.test.ts > web ai routes > streams successful AI responses and preserves safe headers
- src/routes/ai.test.ts > web ai routes > returns non-2xx stream responses without replaying the upstream request
- src/routes/ai.test.ts > web ai routes > does not expose streaming transport error details to clients
- src/routes/ai.test.ts > web ai routes > does not expose buffered transport error details to clients
- src/routes/sync-webdav.test.ts > web sync WebDAV transport > pushes backup data to WebDAV using only mocked server functions
- src/routes/sync-webdav.test.ts > web sync WebDAV transport > pulls backup data from WebDAV and replaces local visible data
- src/routes/sync-webdav.test.ts > web sync WebDAV transport > surfaces WebDAV auth failures on pull instead of masking them as missing backups
- src/routes/sync-webdav.test.ts > web sync WebDAV transport > falls back to desktop legacy WebDAV backup filename on pull
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rejects import requests with oversized content-length before parsing payloads
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rejects streamed multipart imports that exceed the import body limit
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rejects unsafe imported skill file paths before importing records
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rejects imported skills with unsafe URL metadata before importing records
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rolls back database records when import fails during later writes
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > rejects imported folder parent cycles before importing records
- src/routes/import-export-safety-rollback.test.ts > web import/export routes > imports large reversed folder hierarchies with intact parent links
- src/routes/rules.test.ts > web rule routes > creates and removes project rules for the authenticated user
- src/routes/rules.test.ts > web rule routes > rejects unsafe project rule ids before writing workspace files
- src/routes/rules.test.ts > web rule routes > rejects unsafe project rule names and root paths before writing workspace files
- src/routes/rules.test.ts > web rule routes > rejects unsafe project rule ids on delete before touching workspace files
- src/routes/rules.test.ts > web rule routes > returns validation errors for unsafe imported rule records
- src/routes/rules.test.ts > web rule routes > rejects oversized rule writes and imports before mutating workspace files
- src/routes/import-export-path-compatibility.test.ts > web import/export routes > rejects folder hierarchies that exceed prompt workspace path limits before importing records
- src/routes/import-export-path-compatibility.test.ts > web import/export routes > rejects skill workspace paths that exceed filesystem limits before importing records
- src/routes/import-export-path-compatibility.test.ts > web import/export routes > rejects unsafe imported rule paths before writing media or records
- src/routes/import-export-path-compatibility.test.ts > web import/export routes > ignores unknown snapshot fields but rejects unknown enum values without importing records
- src/routes/import-export-path-compatibility.test.ts > web import/export routes > rejects unsupported desktop ZIP backup versions before writing media or records
- src/routes/desktop-backups.test.ts > desktop remote backup routes > blocks version mismatches before writing a backup
- src/routes/desktop-backups.test.ts > desktop remote backup routes > stores a matching snapshot without importing it into the live Web workspace
- src/routes/desktop-backups.test.ts > desktop remote backup routes > rejects a symlinked desktop backup directory through the route boundary
- src/routes/desktop-backups.test.ts > desktop remote backup routes > rejects desktop backup snapshots containing credential fields
- src/routes/desktop-backups.test.ts > desktop remote backup routes > returns a stable internal error when the backup store throws a non-Error value
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > writes media files when importing sync data directly
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > does not leave media files when direct sync import fails during later writes
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > rolls back direct sync import records when pulled media writing fails
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > rejects sync imports that exceed prompt workspace path limits before writing media or records
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > rejects sync imports that exceed skill workspace path limits before writing media or records
- src/routes/sync-import-filesystem.test.ts > web sync import filesystem safety > rejects sync imports with unsafe rule paths before writing media or records
- src/routes/prompt-advanced.test.ts > web advanced prompt routes > persists hierarchy moves and rejects inaccessible or cyclic parents
- src/routes/prompt-advanced.test.ts > web advanced prompt routes > manages prompt relations through the authorized Web contract
- src/routes/prompt-advanced.test.ts > web advanced prompt routes > persists output-format ordering and rejects inaccessible targets
- src/routes/devices.test.ts > web devices routes > registers desktop heartbeats and lists connected devices
- src/routes/devices.test.ts > web devices routes > rejects oversized heartbeat metadata without writing a device record
- src/routes/prompt-graph-restore.test.ts > restores a graph through the authenticated route and rejects invalid input without losing data
- src/routes/skill-snapshot-compatibility.test.ts > Web Skill snapshot transport compatibility > round-trips binary packages while blocking old clients and malformed replacement

### web-agents-contract

- src/routes/agents.test.ts > Web Agent routes > returns a stable internal error when inventory construction fails
- src/routes/agents.test.ts > Web Agent routes > serves the complete self-hosted service manifest and domain results
- src/routes/agents.test.ts > Web Agent routes > redacts service adapter errors at the HTTP boundary
- src/routes/agents.test.ts > Web Agent routes > exposes authenticated config-file list, read, and optimistic write operations
- src/routes/agents.test.ts > Web Agent routes > guards config-file mutations by role, request shape, and stable errors
- src/routes/agents.test.ts > Web Agent routes > manages provider profiles for the selected server Agent without exposing secrets
- src/routes/agents.test.ts > Web Agent routes > serves bounded indexed session pages and redacted details

### worker

- tests/sync.test.ts > sync snapshot helpers > creates an empty snapshot with cloudflare backup version
- tests/sync.test.ts > sync snapshot helpers > normalizes versions and promptVersions symmetrically
- tests/sync.test.ts > sync snapshot helpers > preserves current sync snapshot agent asset fields and counts them
- tests/sync.test.ts > sync snapshot helpers > keeps the acknowledged write when two reads race to initialize a tenant
- tests/sync.test.ts > sync snapshot helpers > rejects a stale update without overwriting the newer snapshot
- tests/sync.test.ts > sync snapshot helpers > rejects malformed and future snapshots instead of defaulting collections
- tests/sync.test.ts > sync snapshot helpers > rejects cross-tenant reuse of a loaded snapshot
- tests/sync.test.ts > sync snapshot helpers > fails closed when D1 write outcome is missing-meta
- tests/sync.test.ts > sync snapshot helpers > fails closed when D1 write outcome is multiple-changes
- tests/sync.test.ts > sync snapshot helpers > fails closed when D1 write outcome is failed
- tests/sync.test.ts > sync snapshot helpers > keeps the original baseline after an unknown write result
- tests/sync.test.ts > sync snapshot helpers > does not accept an unbound snapshot as a write input
- tests/sync.test.ts > sync snapshot helpers > requires stable fields and unique identities in primary collections
- tests/sync.test.ts > sync snapshot helpers > rejects invalid timestamps and snapshots over the object limit
- tests/web-data-direct-restore.test.ts > Cloudflare web-data direct restore compatibility > persists desktop-compatible direct folder, prompt, and version restores
- tests/auth.test.ts > auth captcha > returns svg captcha payload without legacy prompt field
- tests/auth.test.ts > auth captcha > returns an inert captcha-disabled payload without storing a challenge
- tests/auth.test.ts > auth captcha > registers and logs in without captcha when captcha is disabled
- tests/response.test.ts > bounded JSON request reader > cancels an oversized stream before reading another chunk
- tests/response.test.ts > bounded JSON request reader > accepts a body exactly at the byte limit
- tests/response.test.ts > bounded JSON request reader > rejects invalid JSON after bounded UTF-8 decoding
- tests/response.test.ts > bounded JSON request reader > rejects an invalid Content-Length before reading the body
- tests/response.test.ts > bounded JSON request reader > maps a body stream read failure to a bad request
- tests/skill-snapshot-compatibility.test.ts > lossless Skill sync capability > retains binary encoding and refuses unknown encoding
- tests/skill-snapshot-compatibility.test.ts > lossless Skill sync capability > rejects an old reader before returning the encoded payload
- tests/skill-snapshot-compatibility.test.ts > lossless Skill sync capability > prevents an old writer from replacing existing binary data
- tests/worker.test.ts > worker error handling > keeps auth captcha public even when an invalid bearer token is present
- tests/worker.test.ts > worker error handling > does not leak internal error messages in 500 responses
- tests/media.test.ts > media upload > stores uploaded files with resolved media content type

## 独立进程复现材料

在新的唯一临时目录保存下列脚本，替换代码中的临时root为该目录。代码只使用虚构测试账号；未包含真实凭据。Web脚本先create退出，再reopen，命令见上。CLI源码启动位置固定为当前checkout；在其他checkout重放时同步替换repo路径。

### Web 两进程脚本

```ts
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='/tmp/prompthub-cross-acceptance-yqs5jl';
Object.assign(process.env,{DATA_ROOT:root+'/web-data',JWT_SECRET:'isolated-cross-surface-fixture-secret-only',AUTH_CAPTCHA_ENABLED:'false',ALLOW_REGISTRATION:'true',LOG_LEVEL:'error'});
const {createApp}=await import('/Users/lingxiaotian/Programs/personal/PromptHub/apps/web/src/app.ts');
const {closeDatabase}=await import('/Users/lingxiaotian/Programs/personal/PromptHub/packages/db/src/index.ts');
const app=createApp();
async function req(url:string,method='GET',body?:unknown,token?:string){
 const r=await app.request(url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
try{
 assert.equal((await req('/api/prompts')).status,401);
 if(process.argv[2]==='create'){
  const a=await req('/api/auth/register','POST',{username:'isolated-admin',password:'fixture-password-001'});assert.equal(a.status,201);
  const b=await req('/api/auth/register','POST',{username:'isolated-user',password:'fixture-password-002'});assert.equal(b.status,201);
  const token=a.body.data.accessToken;
  const f=await req('/api/folders','POST',{name:'文件夹 📁'},token);assert.equal(f.status,201);
  const p=await req('/api/prompts','POST',{title:'验收 🦌',userPrompt:'中文\n<script>literal</script>',folderId:f.body.data.id},token);assert.equal(p.status,201);
  assert.equal((await req('/api/prompts/'+p.body.data.id,'GET',undefined,b.body.data.accessToken)).status,404);
  const m=await req('/api/media/images/base64','POST',{fileName:'proof.png',base64Data:Buffer.from('media-proof').toString('base64')},token);assert.equal(m.status,201);
  assert.equal(fs.readFileSync(root+'/web-data/data/assets/'+a.body.data.user.id+'/images/'+m.body.data,'utf8'),'media-proof');
  fs.writeFileSync(root+'/web-ids.json',JSON.stringify({prompt:p.body.data.id,folder:f.body.data.id,media:m.body.data}));
  console.log('PASS create: public registration, fresh DB, private folder/prompt, cross-user 404, media disk bytes');
 }else{
  const ids=JSON.parse(fs.readFileSync(root+'/web-ids.json','utf8'));
  const a=await req('/api/auth/login','POST',{username:'isolated-admin',password:'fixture-password-001'});assert.equal(a.status,200);const token=a.body.data.accessToken;
  const p=await req('/api/prompts/'+ids.prompt,'GET',undefined,token);assert.equal(p.status,200);assert.equal(p.body.data.userPrompt,'中文\n<script>literal</script>');assert.equal(p.body.data.folderId,ids.folder);
  const m=await req('/api/media/images/'+ids.media+'/base64','GET',undefined,token);assert.equal(m.status,200);assert.equal(Buffer.from(m.body.data,'base64').toString(),'media-proof');
  assert.equal((await req('/api/prompts/'+ids.prompt,'PUT',{title:'reopened'},token)).status,200);
  assert.equal((await req('/api/prompts/'+ids.prompt,'GET',undefined,token)).body.data.title,'reopened');
  console.log('PASS reopen: new process login, prompt/folder relation and media bytes persisted, update/read works');
 }
}finally{closeDatabase();}
```

### CLI 进程断言脚本

下列为实际第二次运行脚本。doctor失败会记录并继续独立CRUD；复测时必须单独判定D01，不能只看脚本exit0。

```js
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='/tmp/prompthub-cross-acceptance-yqs5jl';
const data=root+'/CLI 空格 数据';
const results=[];
function cli(args,expected=0){
 const r=spawnSync(process.execPath,['--import','tsx','src/index.ts','--data-dir',data,...args],{cwd:'/Users/lingxiaotian/Programs/personal/PromptHub/apps/cli',encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
 results.push({args,status:r.status});
 assert.equal(r.status,expected,JSON.stringify({args,status:r.status,stdout:r.stdout,stderr:r.stderr}));
 return {text:r.stdout,json:expected===0&&r.stdout.trim().startsWith('{')?JSON.parse(r.stdout):undefined,stderr:r.stderr};
}
try{
 try { cli(['doctor','--help']); } catch { console.log('FAIL doctor --help: child exit 2 instead of help/0'); }
 const folder=cli(['folder','create','--name','验收 📁']).json;
 const body='中文 🦌 "引号"\n<script>literal</script> SELECT * FROM prompts;';
 const p=cli(['prompt','create','--title','验收 🦌','--user-prompt',body,'--folder-id',folder.id]).json;
 assert.equal(cli(['--full','prompt','get',p.id]).json.userPrompt,body);
 cli(['prompt','update',p.id,'--title','已更新 🦌']);
 assert.equal(cli(['prompt','get',p.id]).json.title,'已更新 🦌');
 assert.match(cli(['--output','table','prompt','list']).text,/已更新/);
 assert.equal(cli(['--quiet','prompt','list']).text,'');
 cli(['prompt','create'],2);
 cli(['--output','bogus','prompt','list'],2);
 assert.equal(cli(['prompt','get',p.id]).json.title,'已更新 🦌');
 cli(['prompt','get','does-not-exist'],3);
 cli(['prompt','create','--title','missing-file','--user-prompt-file',root+'/absent'],5);
 cli(['prompt','delete',p.id]);
 cli(['prompt','get',p.id],3);
 cli(['folder','delete',folder.id]);
 assert.equal(fs.existsSync(data+'/data/prompthub.db'),true);
 assert.equal(fs.existsSync(data+'/data/prompthub.db.lock'),false);
 const leases=data+'/data/prompthub.db.clients';
 assert.equal(fs.existsSync(leases)?fs.readdirSync(leases).length:0,0);
 console.log(JSON.stringify({status:'pass',cases:results.length,results}));
}finally{fs.writeFileSync(root+'/cli-process-results.json',JSON.stringify(results,null,2));}
```

## 资源与后续交付

- 本任务唯一临时根：`/tmp/prompthub-cross-acceptance-yqs5jl`，最大观察约1.3MiB；无监听端口、浏览器或后台服务。每组runner等待子进程退出；两次Web进程finally closeDatabase。真实CLI数据库无writer lock、客户端lease目录为空。
- 各Vitest临时库/目录由用例finally/afterEach和global teardown清理；退出码全部0，无超时。只清理本任务临时根，不碰其他对话的进程、产物和用户HOME。最终清理确认见末尾。
- 总协调需安排：D01/D02最小回归及修复；受控隔离环境补CLI Agent/Rules/workspace/sync与其他未测参数；Worker真实D1/R2/runtime及未测普通CRUD；Web真实HTTP/Docker/浏览器；真实供应商/云盘和Win/Linux发行包；最终固定候选的全局门禁。
- 当前结论：首轮非GUI证据已记录，不能宣布整个版本可发布。

### 检查进程包装器

实际使用的run.mjs如下。调用形态为 `node run.mjs <批次> <deadline_ms> <pnpm参数...>`；cli/cli-assets/cli-entry/worker 75000，web 240000，web-agents-contract 45000，web-create/web-reopen 30000，cli-readme及corrected 15000。PID/退出码见上表。包装器启动pnpm；并非另建工具链。

```js
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [name, budget, ...args]=process.argv.slice(2);
const root=path.dirname(new URL(import.meta.url).pathname);
const log=fs.openSync(path.join(root,name+'.log'),'w');
const started=new Date().toISOString();
const child=spawn('pnpm',args,{stdio:['ignore',log,log],detached:true});
console.log(JSON.stringify({name,pid:child.pid,started,args}));
const timer=setTimeout(()=>{console.log('deadline exceeded');process.kill(-child.pid,'SIGTERM');},Number(budget));
child.on('close',(code,signal)=>{clearTimeout(timer);fs.closeSync(log);const result={name,code,signal,started,ended:new Date().toISOString(),pid:child.pid,args};fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(result));console.log(JSON.stringify(result));const lines=fs.readFileSync(path.join(root,name+'.log'),'utf8').split('\n');console.log(lines.filter(l=>/Test Files|Tests |Duration|FAIL|Error:|AssertionError|✓|×/.test(l)).slice(-85).join('\n'));process.exitCode=code??1;});
```

最终核对（2026-10-04 17:34:11 Asia/Shanghai）：50行矩阵状态计数一致，报告无行尾空白；10个已记录pnpm父进程全部退出；唯一临时根已删除。HEAD未变化，三个app及共享core/db/shared无tracked源码差异。首轮结束当时，本报告为唯一持久化产物；后续补交增加了下述3个测试文件。

## 持久测试补交（2026-10-04，继续验收）

新增测试文件替代首轮仅报告/临时脚本的交付方式；首轮历史结果不被删除或改成新测试结果。产品源码仍冻结。

| 现有用例 / 文件 | 审计分类 | 有效边界 / 为什么漏检 | 本轮补强 |
| --- | --- | --- | --- |
| apps/cli/tests/doctor.test.ts | 有效，但帮助路径缺失 | 锁状态、恢复、未知action的断言有意义；没有调用doctor --help/-h。runCli注入IO不能证明实际进程退出码 | 新process测试以帮助成功/0为预期保留D01红测，核对未建数据库 |
| apps/cli/tests/prompt.test.ts、run.test.ts | 有效，进程边界缺失 | 真实SQLite与业务读回有效；execCli调用runCli，不能发现src/index.ts退出码/stdio接线缺陷 | 独立Node源码CLI进程，精确JSON错误、退出2/3、quiet、磁盘内容和后续进程读回 |
| apps/cli/tests/cli-completeness.test.ts 的关系/格式用例 | 有效但覆盖不足 | 创建relation/output-format和列关系；未覆盖关系update/delete及格式reorder/delete后的读回 | 新进程图操作用例，删除后列表为空且两个Prompt不受影响 |
| apps/web/src/routes/prompts.test.ts | 有效，关闭重开边界缺失 | createApp真实公开路由/SQLite与权限验证有效；一个app中的读回不证明新进程初始化后读取 | 每次请求重启源码app；登录、内容和folder关联、拒绝他人改写后的真实只读SQLite核对 |
| apps/web/src/routes/media.test.ts | 有效，video正常完整链缺失 | 图片字节与失败保全有效；动态共用实现不代替video路由注册与content-type验证 | video上传/磁盘字节/跨进程二进制与base64/size/exists/list/delete；路径穿越后无半成品 |
| apps/web-cloudflare/tests/worker.test.ts 的500命名用例 | 断言不足 | 实际无效token只触发401，不到app.onError | 从注册的auth/bootstrap注入D1边界失败，必须500且精确通用响应，不泄露内部detail |
| apps/web-cloudflare/tests/web-data-direct-restore.test.ts | 相对真实Worker验收过度mock；函数合同仍有效 | 手写D1按SQL字符串修改内存、直接调用handler、伪context，无法验证实际D1 SQL/持久化/注册 | 不复制假D1框架；真实Worker/D1仍blocked，新500用例明确只覆盖错误路由合同 |
| Web tests/、Worker tests/ 中既有测试 | Vitest接入有效，typecheck范围存在缺口 | Web tsconfig只include src；Worker tsconfig只include src与声明。目录外测试不被现有tsc默认选入 | 新Web/Worker文件放在现有src测试目录。若统一补旧测试类型门禁，需总协调分配apps/web/tsconfig.json与apps/web-cloudflare/tsconfig.json |

新增文件：

- `apps/cli/tests/release-acceptance-cross-surface-process.test.ts`
- `apps/web/src/routes/release-acceptance-cross-surface-persistence.test.ts`
- `apps/web-cloudflare/src/release-acceptance-cross-surface-errors.test.ts`

测试设计边界：CLI只用临时data-dir和Prompt/Folder/graph/doctor，不扫描Agent HOME；CLI子进程关闭Node运行时warning避免其混入业务stderr，但不屏蔽业务错误。Web每次公开请求均新Node进程，取消测试DB模板，使用产品createApp初始化、真实SQLite/文件和虚构账号；不是HTTP监听或GUI证据。Worker只注入外部D1失败与静音console.error，不替换路由业务，不声称实际D1/R2运行。

每个子进程均同步等待，有10秒deadline和1MiB输出限制；Web场景30秒deadline。所有临时数据在afterEach移除，数据库读句柄finally关闭。README示例仍作为D02文档缺陷；没有加入源码字符串断言伪装业务回归。

### 补交实际运行结果

| 文件 / 用例 | 结果 | 关键业务断言与失败能力 |
| --- | --- | --- |
| CLI process / doctor --help explains recovery without opening a database (D01) | fail | 期望exit0、stdout包含database-lock与--recover；实际exit2/空stdout，3条soft业务断言失败；未建DB断言通过 |
| CLI process / doctor -h explains recovery without opening a database (D01) | fail | 同一正确帮助合同；实际USAGE_ERROR，未skip/todo，也未把bug写成期望 |
| CLI process / persists exact content across CLI processes and preserves it after rejected commands | pass | 每次新CLI进程；Unicode/HTML字面值读回、错误2与3、quiet；只读SQLite精确行、删除后空表与lease释放 |
| CLI process / reads relation changes and output-format ordering from later CLI processes | pass | 关系update后的kind/note；格式reorder=4；删除后后续进程返回空列表，两个Prompt行原样保留 |
| Web persistence / reopens private prompt relationships and preserves disk state after another user attempts a write | pass | 每次请求新进程；他人PUT返回404后磁盘记录仍为Original；新登录/读取保留folder与内容；正常更新落盘 |
| Web persistence / round-trips video bytes across processes, rejects traversal without partial files, and persists deletion | pass | 磁盘目录只有合法文件；越界上传400后无半成品；下载字节/content-type与base64/size/exists/list匹配；删除重开404/空列表 |
| Worker errors / returns a generic 500 for a storage failure through the registered public route | pass | 正常health精确响应；公开bootstrap遇D1失败必须500与通用JSON；内部detail不能进入body；失败后health仍可用 |

本次测试退出码：CLI 1（2 failed / 2 passed，8.36s）；Web 0（2 passed，8.88s）；Worker 0（1 passed，255ms）。CLI红测来自业务预期而非初始化/编译失败。新增测试没有skip/todo；变异诊断仅选择视频用例，另一用例未运行不记通过。

C21的剩余CLI图操作已补为pass；F07的真实500分支已补为pass；W13补上可维护的真正进程重开测试。W20中视频upload/read/size/exists/base64/list/delete已补，delete-all/clear仍not-run。D01仍fail，D02仍是待修文档缺陷；其他首轮blocked/not-run保持。

### 常用入口、静态覆盖及精确命令

- CLI经package的run test实际选择新文件4项；Web经run test选择2项；Worker经run test选择1项。没有只用外部脚本绕过package发现机制。
- CLI vite默认test glob、Web src test glob和Worker src test glob均包含文件。root harness checks.mts的cli-test/web-test/web-cloudflare-test调用同一package test脚本；没有运行全仓harness。CLI全套75秒budget未复测，新增定向CLI批次耗时8.36秒，不能据此声称整体预算通过。
- 三包run typecheck --listFiles均exit0，输出确实含各自新增文件。Web和Worker宿主TS在src中已纳入既有include；Web子进程的内嵌JavaScript靠实际执行验证，不宣称被tsc检查。
- 三个新文件用各package现有eslint配置单独检查，均exit0、零warning。未运行整个仓库lint。

以下均从仓库根执行：

```sh
pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-process.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web run test src/routes/release-acceptance-cross-surface-persistence.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-errors.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/cli run typecheck --listFiles
pnpm --filter @prompthub/web run typecheck --listFiles
pnpm --filter @prompthub/web-cloudflare run typecheck --listFiles
pnpm --filter @prompthub/cli exec eslint tests/release-acceptance-cross-surface-process.test.ts --report-unused-disable-directives --max-warnings 0
pnpm --filter @prompthub/web exec eslint src/routes/release-acceptance-cross-surface-persistence.test.ts --report-unused-disable-directives --max-warnings 0
pnpm --filter @prompthub/web-cloudflare exec eslint src/release-acceptance-cross-surface-errors.test.ts --report-unused-disable-directives --max-warnings 0
```

| 批次 | PID | UTC开始 → 结束 | exit |
| --- | --- | --- | --- |
| cli | 83324 | 2026-10-04T09:38:54.323Z → 2026-10-04T09:38:55.273Z | 1 |
| cli-run | 83767 | 2026-10-04T09:39:41.688Z → 2026-10-04T09:39:50.778Z | 1 |
| web | 84207 | 2026-10-04T09:40:08.724Z → 2026-10-04T09:40:18.501Z | 0 |
| worker | 84730 | 2026-10-04T09:40:39.535Z → 2026-10-04T09:40:40.652Z | 0 |
| cli-types | 86095 | 2026-10-04T09:41:56.544Z → 2026-10-04T09:41:59.343Z | 0 |
| web-types | 86420 | 2026-10-04T09:42:25.011Z → 2026-10-04T09:42:28.829Z | 0 |
| worker-types | 86544 | 2026-10-04T09:42:51.083Z → 2026-10-04T09:42:53.928Z | 0 |
| cli-lint | 86998 | 2026-10-04T09:43:18.749Z → 2026-10-04T09:43:20.357Z | 0 |
| web-lint | 87061 | 2026-10-04T09:43:20.420Z → 2026-10-04T09:43:22.191Z | 0 |
| worker-lint | 87133 | 2026-10-04T09:43:22.250Z → 2026-10-04T09:43:23.742Z | 0 |
| web-mutation | 85088 | 2026-10-04T09:40:59.094Z → 2026-10-04T09:40:59.647Z | 1 |
| web-mutation-runtime | 85856 | 2026-10-04T09:41:28.297Z → 2026-10-04T09:41:32.170Z | 1 |

### 断言有效性：隔离媒体响应变异

- 将apps/web/src、vitest.config.ts、tsconfig.json、package.json及tests/global-setup.ts复制到唯一临时副本；package/db/shared和现有node_modules只作为依赖链接，不修改共享源码。未复制真实.env。
- 只在副本apps/web/src/routes/media.ts将 `new Blob([toBlobPart(content)],` 换成 `new Blob([toBlobPart(Buffer.from("corrupt"))],`。上传、磁盘写入、鉴权和HTTP状态均保持原行为，只有下载载荷变坏。
- 原始代码同一测试已pass；副本执行exit1，命中新增Web测试第122行 `expect(Buffer.from(download.bytes, "base64")).toEqual(bytes)`。实际收到ASCII corrupt（7字节），预期为提交的16字节binary fixture；不是编译/初始化失败，也不是直接修改断言。
- 该fixture验证字节传输与持久化，不声称播放器可以播放这个短MP4头；播放/GUI仍blocked。

实际命令（副本已清理，复现须先按上述方式建立新唯一副本）：

```sh
pnpm --filter @prompthub/web exec vitest run --config /tmp/prompthub-cross-tests-c7lh4G/mutation/apps/web/vitest.config.ts --root /tmp/prompthub-cross-tests-c7lh4G/mutation/apps/web src/routes/release-acceptance-cross-surface-persistence.test.ts -t 'round-trips video bytes' --minWorkers 1 --maxWorkers 1 --reporter verbose
```

### 启动错误及资源边界

- 第一次 `pnpm --filter @prompthub/cli test ... --minWorkers ...` 被pnpm快捷命令解析器拒绝（Unknown options，exit1，0用例）。随后用显式 `run test` 运行package脚本。此启动失败不计产品红测。
- 第一次从隔离目录 `pnpm --dir <copy> run test ...` 触发本机pnpm 11.8.0的自动依赖检查/安装，因副本没有workspace成员而报ERR_PNPM_WORKSPACE_PKG_NOT_FOUND；未成功安装，不能计作变异验证。随后从原仓库pnpm 9.15.0执行既有vitest、显式指定副本root/config，成功命中上述业务断言。未主动安装新工具；没有改写真实node_modules链接、lockfile或package配置（原node_modules目录仍为此前时间，tracked文件无差异）。副本中间产物随本任务临时根一起清理。
- 本次没有修改产品源码、既有测试/helper/config，也没有build/GUI/部署/真实账号调用。三包测试文件为本对话独占新增；并行对话改动保留。

本次文件SHA-256（便于总协调核对被测状态）：

- `apps/cli/tests/release-acceptance-cross-surface-process.test.ts`: `9aa0f02265c2415f46c27bc583742d74369d3888aa6d3e98ab7446b861c26874`
- `apps/web/src/routes/release-acceptance-cross-surface-persistence.test.ts`: `a686d9d900bc2562dd47518586f8988b3feab2f2699faeaaf4233b76d8984c9c`
- `apps/web-cloudflare/src/release-acceptance-cross-surface-errors.test.ts`: `89222c65cdc7517ae3b489f3fc3809ee61c1a05b123ab982e48943603697a88d`

本轮脚本补交完成；D01红测须由总协调分配产品修复后再复测，D02修正文档示例。真实Worker/D1/R2、GUI、原生平台、部分CLI隔离流程与其余清单未测项仍需要后续安排，不能宣布全功能或整个版本验收通过。

补交最终清理确认（2026-10-04 17:44:41 Asia/Shanghai）：12个记录的pnpm进程均已退出；CLI/Web fixture目录残留0；临时副本、日志和脚本根已删除；本任务无监听端口、GUI或保留后台服务。新增文件和报告无行尾空白，git diff --check通过；HEAD及产品源码未改变。

## 自主修复与第二轮缺口补强（2026-10-04）

本节为最新状态；上方“源码冻结”“待总协调修复”及首轮状态表仅保留历史证据。2026-10-04 17:46 后按总计划授权，本组接管 D01/D02、Web Rules rewrite 和本地 Worker 验证。没有提交、推送、发布或接触真实账户。

### 修复与实际验收

- **D01 local_done**：`doctor-command.ts` 在动作和路径解析之前按既有 `takeFlag` 处理帮助；`help.ts` 添加 Doctor 帮助及根帮助入口。原 `--help/-h` 两项正确红测转绿。额外进程测试证明 `database-lock --recover --help` 保留实际 lock 目录、不会建 DB；无参数仍为 usage / 2。`database-concurrency.md` 仅更新对应帮助合同，无锁策略或数据迁移变更。
- **D02 local_done**：README 的两条源码示例改为 `pnpm --filter @prompthub/cli run dev ...`。持久回归以实际 pnpm/tsx 进程执行隔离 `prompt list`，退出 0、实际库为空。Skill scan 示例采用同样的已验证参数转发，但未扫描真实 HOME；该例不是 Skill scan 功能通过证据。
- **C19 partial**：`--app-data-dir` 真进程落到临时 `<root>/PromptHub/data/prompthub.db`；互斥 `--full --summary` 拒绝删除后原 Prompt 完整保留。并不声称所有参数组合穷尽。
- **W20 pass（本地路由/文件/重开）**：新增视频 `DELETE /api/media/videos?confirm=true`、未确认拒绝且目录不变、只清空本人文件、另一用户文件字节不变、重开空列表和重复清空计数 0。与前批逐文件视频往返共同覆盖当前视频本地生命周期；播放/GUI仍未验证。
- **W19 partial**：正常 import-records → scan → GET → 删除一个版本 → 新进程 GET 通过，版本内容、当前正文和路径读回一致，外部 AGENTS.md sentinel 不变；另一用户 scan 为空。AI rewrite 另见 D03。
- **C15 审计更正**：首轮将 `cli-completeness.test.ts` 的“lists plugins ... supports delete”按标题写成 delete 已覆盖，实际该用例只调用空 list/sources/help，未执行 delete，也没有写入所声明的 libraryPath。原 C15 delete 的 pass 撤回；这属于用例断言不足，不是已发现产品删除失败。Plugin get/version/delete 正常链需要补真实库 fixture；市场远端/native remove-targets 仍未验。

### D03 — Web Rules 重写返回伪造的 AI 草稿（本地已修）

原 `apps/web/src/routes/rules.ts` 的 `buildRewriteResult` 不使用 aiConfig 或任何 AI 调用，只拼接 HTML instruction 注释并声称生成了草稿。新增 `release-acceptance-cross-surface-rewrite.test.ts` 经真实注册、项目创建、保存和路由调用，原实现 10/10 失败：两条路由的正文不等于供应商结果，缺配置及 HTTP/空正文/运输异常都错误返回 200。不是编译或 fixture 启动错误。

修复边界：

- 两条已有 rewrite 路由复用 `Core rewriteRuleWithAi → chatCompletion` 的提示词、协议和响应处理；Web 新 `rule-rewrite.service.ts` 只适配既有 `requestRemoteBuffered`。无新 endpoint、response shape 或依赖。
- Core chatCompletion 增加可选、显式传输参数，使用既有 `AITransportRequest` / `AITransportResponse`。未注入时继续 fetch；只在默认 fetch helper 内创建 timer。注入 Web 时由 remote-http 接收共享 `AI_REQUEST_TIMEOUT_MS` 并独占实际运输 deadline，无额外 timer、重试或 fallback。
- AI 配置必填，API key 非空，apiProtocol 按现行共享三种协议校验。错误统一由现有 Rule 错误响应封装，不暴露供应商内部文本；规则内容和版本均不保存。稳定 Rules 文档仅改 AI 草稿小节。
- 正常路径包含 OpenAI、Gemini OpenAI-compatible 和 Anthropic 的受控外部响应；实际 Core rewrite/parser 未 mock。另调用真实 remote-http 拒绝 `https://127.0.0.1`，不发出真实供应商请求。它们证明服务器路由行为和安全运输接线，不证明付费供应商或 GUI 可用。
- Core 原有 fetch 成功 fixture 改为真实 `Response`，避免依赖不完整的 `{ json, text }` stub；默认 fetch deadline 和协议检查保留，新增注入运输不启动第二个 timer 的测试。

### 本批验证命令与结果

均为 repo root、既有 pnpm 9.15.0、独占临时目录 `/tmp/prompthub-cross-repair-KjYx5L` 的有界 wrapper。完整 typecheck/build/harness 由主协调负责，本组未运行。

```sh
pnpm --filter @prompthub/cli run test tests/doctor.test.ts tests/release-acceptance-cross-surface-process.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web run test src/routes/release-acceptance-cross-surface-persistence.test.ts -t 'clears only' --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web run test src/routes/release-acceptance-cross-surface-persistence.test.ts -t 'imports and scans' --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web run test src/routes/release-acceptance-cross-surface-rewrite.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/web run test src/routes/release-acceptance-cross-surface-rewrite.test.ts src/routes/rules.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --filter @prompthub/core run test tests/ai-protocol.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

结果依次为：14 passed（10.70s）；1 passed / 2 filtered not-run（4.22s）；1 passed / 3 filtered not-run（5.32s）；旧实现 10 failed（2.44s）；修复后 22 passed（5.62s）；10 passed（190ms）。前两项 Web filtered 用例没有再改行为，不计入本批通过数量；前批通过结果仍单独保留。第二轮存储测试在并行其他组修改共享 DB 时执行，最终固定候选由总协调复核受影响范围。

定向 ESLint 已通过 CLI process 测试、Web persistence、新 Web rewrite 测试/route/service，以及 Doctor/help 源码。Core 文件必须在 repo root 用 `pnpm exec eslint --config apps/cli/eslint.config.mjs <core paths> ...`；首次在 apps/cli cwd 运行被 ESLint base path 排除，exit 1 / 2 warnings，不算源码错误或检查通过。Core AI 与 Worker 新文件检查结果见本节后续。

### D03 版本数据保全补证

总协调审查后，将测试的原始 `GET /api/rules/:id` 完整结果比较补为显式 `versions` 数组比较及 `data/rules` 全部文件相对路径/内容比较（包括 `.versions` 索引与正文）。该 GET 本来就通过 `readRuleContent` 返回实际版本，无单独 GET versions 路由；没有虚构新 endpoint。成功草稿、三种失败、私网拒绝和两个其他协议场景均核对完全不变。只重跑受影响 rewrite 文件：16/16 passed，7.84s；随后该文件 lint exit0。既有 Rules/Core 检查未重复。

### Worker 真实本地 D1/R2 与 Worker runtime

新增 `apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts`，使用已安装、该 package 直接依赖的 Wrangler，未安装依赖。主协调明确授权独占临时根内的测试专用 bundling，未运行正式产品 build。

最终路径：

1. 临时 config 配置合成 JWT、关闭测试验证码、允许合成账号注册、本地 D1/R2 ID；`envFiles: []`、`remoteBindings: false`。getPlatformProxy 初始化已签入的 `0001_init.sql`，关闭代理后才启动 Worker。
2. `unstable_startWorker` 读取临时 config 的 `main` 指向正式源码，`dev.remote=false`、`watch=false`、inspector关闭、loopback动态端口，registry/persist/logs/bundle均在本任务临时根。没有修改正式 Worker/媒体业务或替换 R2 结果。
3. 正式 Worker 内执行注册、鉴权、Folder create/update/list/reorder/delete、Prompt create/read/update/search/tag rename/delete、Prompt version create/list、settings租户隔离、heartbeat。以真实 D1 查询设备行验证持久化。
4. 图片与视频均 upload/list/base64/size/exists/raw read，逐字节验证并核对 content-type；另一用户 list 空、直接读取404。
5. 停止 Worker，重开本地 D1 proxy 读设备后关闭，再启动新的 Worker；登录后 Prompt Unicode正文/folder/tags、settings 与 R2 字节保留。正式删除后返回404；Skill/Rule空库读取正常。不存在“mock SQL字符串返回期望行”。

最终命令：

```sh
pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

最后一轮 exit0，1 passed，1.95s。两个真实 Worker URL 为 `http://127.0.0.1:63415/` 和 `http://127.0.0.1:63469/`；均随 `dispose` 关闭。config projectRoot 与独占根严格相等断言通过；日志缓存要等 Wrangler异步日志结束，fixture用进程exit清理避免重新建出已删除目录。最终无该轮fixture残留。

真实运行所需的环境纠正均保留，不混淆为产品缺陷或绿色证据：

- 第一轮 JWT fixture 少于既有32字符合同，注册500；修正合成fixture，不改验证规则。
- 第二轮误将其他用户 settings 预期写成 `{}`，而正式 `emptySnapshot` 有默认theme/language/autoSave；改为修改前后精确比较该用户数据，仍能发现跨租户污染。
- Node `app.request + getPlatformProxy` 原始媒体读取无法序列化 `R2Object.writeHttpMetadata(Headers)`，报 `DevalueError: Cannot stringify arbitrary non-POJOs`；属于代理运行边界，不是Worker产品缺陷。raw200/byte断言保留，由正式Worker内Headers/R2执行后通过。
- 首次 startWorker 显式 entrypoint 触发 `resolveEntryWithScript` 的 cwd projectRoot，隔离断言拒绝；Wrangler在既有 `apps/web-cloudflare/.wrangler/tmp` 短暂写入的本任务目录已由dispose清掉，父目录出生时间2026-08-12，未删除。静态核对 `resolveEntryWithMain` 后改用临时config.main并省略API entrypoint，最终projectRoot和bundle路径均在独占root。未实际创建薄wrapper或临时package.json。
- getPlatformProxy.persist.path 是完整根，startWorker.dev.persist 自动追加 `v3`；最初二者不一致导致新Worker报users表不存在。按已安装Wrangler的两处路径实现收敛到同一`state/v3`后，实际迁移、重开通过。没有复制表或绕过初始化。

F02媒体证据提升到本地真实R2；F06普通业务上述范围已执行，仍未穷尽所有Prompt版本/复制/标签删除与非空Rule/Skill快照读取。F08已补本地正式Worker、D1迁移及重开，不包含远端Cloudflare部署、真实域名/静态assets、跨版本升级或生产容量。

### 本批仍未完成的边界

- CLI Agent/default Rules/workspace/sync需正式受控Agent homes；不能用data-dir假装HOME隔离。Plugin get/version/delete正常库、市场/native remove-targets仍需补；C15之前的误记已撤回。
- CLI平台symlink/原生消费、发行包/Win/Linux、Web生产HTTP/Docker/GUI、真实AI/云盘、Worker远端部署和未列出的业务组合仍无本批证据。
- Core/Web/Worker新增代码的最终 typecheck、固定候选的全局harness/build由主协调统一运行。上方首轮typecheck结果不能被当成第二轮改动后的通过。
- 本轮修复不变更schema、用户数据布局或公开response shape，不需要数据迁移；回退源码只恢复旧行为，保留原锁/规则/DB数据。

### 第二轮完整执行记录

| 批次 | PID | UTC开始 → 结束 | exit |
| --- | --- | --- | --- |
| cli | 91546 | 2026-10-04T09:50:35.189Z → 2026-10-04T09:50:46.662Z | 0 |
| web-clear | 91807 | 2026-10-04T09:51:01.153Z → 2026-10-04T09:51:06.253Z | 0 |
| web-rules | 92335 | 2026-10-04T09:52:01.717Z → 2026-10-04T09:52:08.006Z | 0 |
| lint-cli | 92723 | 2026-10-04T09:52:31.857Z → 2026-10-04T09:52:33.087Z | 0 |
| lint-web | 92981 | 2026-10-04T09:52:41.618Z → 2026-10-04T09:52:43.334Z | 0 |
| lint-core | 93155 | 2026-10-04T09:52:50.526Z → 2026-10-04T09:52:51.557Z | 1 |
| lint-core-root | 93568 | 2026-10-04T09:53:10.249Z → 2026-10-04T09:53:14.164Z | 0 |
| rewrite-red | 94303 | 2026-10-04T09:54:02.034Z → 2026-10-04T09:54:05.641Z | 1 |
| rewrite-green | 95191 | 2026-10-04T09:55:20.663Z → 2026-10-04T09:55:27.682Z | 0 |
| core-ai | 95326 | 2026-10-04T09:55:42.298Z → 2026-10-04T09:55:43.296Z | 0 |
| worker-storage | 96581 | 2026-10-04T09:56:41.909Z → 2026-10-04T09:57:10.817Z | 1 |
| lint-rewrite | 96750 | 2026-10-04T09:57:06.927Z → 2026-10-04T09:57:13.442Z | 0 |
| worker-storage-valid-fixture | 96967 | 2026-10-04T09:57:40.890Z → 2026-10-04T09:57:49.391Z | 1 |
| worker-storage-isolation | 97329 | 2026-10-04T09:58:16.702Z → 2026-10-04T09:58:21.128Z | 1 |
| rewrite-history-proof | 97795 | 2026-10-04T09:59:16.640Z → 2026-10-04T09:59:25.440Z | 0 |
| lint-rewrite-final | 98124 | 2026-10-04T09:59:59.156Z → 2026-10-04T10:00:00.616Z | 0 |
| lint-core-ai | 98338 | 2026-10-04T10:00:11.752Z → 2026-10-04T10:00:12.616Z | 0 |
| worker-runtime | 98735 | 2026-10-04T10:01:29.652Z → 2026-10-04T10:01:31.386Z | 1 |
| worker-runtime-isolated | 99705 | 2026-10-04T10:03:19.761Z → 2026-10-04T10:03:21.537Z | 1 |
| worker-runtime-shared-storage | 540 | 2026-10-04T10:04:28.021Z → 2026-10-04T10:04:30.629Z | 0 |
| lint-worker | 721 | 2026-10-04T10:04:55.290Z → 2026-10-04T10:04:56.164Z | 0 |

本轮最后源码/测试 SHA-256：

- `packages/core/src/cli/doctor-command.ts`: `742a69cf26dac49bdacd5ca36b2c520783eaf79b68e418afed46c6ba52c74b35`
- `packages/core/src/cli/help.ts`: `cfe1cf9477688e4bd647e8beb973c22d727f8b2204bffa5869a0c632d383d83f`
- `packages/core/src/ai-client.ts`: `f5ebf975438bcf226619a4dac52e0dac5404cc967b187edd9b2b02d03024980d`
- `packages/core/src/rules-rewrite.ts`: `e5a8a6c18be1b8edf684fc02e7813de9a9b9ace36604ff3cee1fb7a8294cb1e6`
- `packages/core/tests/ai-protocol.test.ts`: `eb3ac6cbf47f98af9ed991966071ee49b8b91aaef20da6798d44a285dda68714`
- `apps/cli/tests/release-acceptance-cross-surface-process.test.ts`: `41a6ca4d3a1322a73a669ee1c7e7b9e38200d63ff5a3aeaabe3986ed1a9a3202`
- `apps/web/src/routes/rules.ts`: `7404c9a00db9189b2b29810b6cbdb1c38e5ed0b2883687ceb78634db99961363`
- `apps/web/src/services/rule-rewrite.service.ts`: `a468ba545c56119f85bce6a4e4362c8c887ee025413bfc541c3efb2b0a5f152d`
- `apps/web/src/routes/release-acceptance-cross-surface-rewrite.test.ts`: `925ab32af78d24001167e855ff2e17c7870a3a70361bd4edf3bc5a4af6da1b0c`
- `apps/web/src/routes/release-acceptance-cross-surface-persistence.test.ts`: `a21d527cc990c54e11a6e0654296151652fcba2e5148ec118c4f5749b65cfcdf`
- `apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts`: `f17226c957f1d3eb9390b443a03d178aa719ccd355e83b2790c06e45da7337c8`

第二轮最终资源核对（2026-10-04T10:05:59.637Z）：21个已记录pnpm父进程全部退出；workerd/wrangler进程与63415/63469监听均不存在；CLI/Web/Rules/Worker fixture目录残留0。首个隔离断言失败后异步日志重建的本任务yU3kn9目录已清理。唯一wrapper/log根已删除；既有共享.wrangler/tmp为空且父目录保留。git diff --check通过。未停止其他会话进程，无保留服务。


## 定向收尾：Cloud IPC fixture 类型与 Worker 资源清理

- Cloud IPC：仅修改 `apps/desktop/tests/unit/main/cloud-ipc.test.ts` 的两个 `vi.fn` 泛型，分别直接引用 `CloudDesktopApi["getStorePackage"]` 与 `CloudDesktopApi["getEntitlements"]`。修正响应字面量被推断为宽泛 string 的两项 TS2322；fixture 数据与全部行为断言保留，未改生产接口、共享 helper/config。原错误见 desktop-release-typecheck.log:261–270。
- Cloud IPC 原有三项用例通过；仅证明注册后的 IPC 转发与输入拒绝合同，Cloud 客户端仍是 mock，不作为真实云服务验收。
- Worker 先前最终文件 `f17226c957f1d3eb9390b443a03d178aa719ccd355e83b2790c06e45da7337c8` 对应本报告上一节 PID 540 的真实通过；最终方案一直由临时 wrangler.json.main 指向仓库正式 worker.ts，并省略 startWorker.entrypoint，运行时断言 projectRoot 是临时根。未创建或执行 wrapper 入口，方案说明不等于另一份未复测代码。
- 本次仅将 afterAll 改为同时尝试 worker/proxy dispose，使用 Promise.allSettled 收齐结果后抛 AggregateError；同步抛出也由 Promise.then 捕获。finally 仍恢复环境并清空句柄。未注入 dispose 本身故障；正常资源释放与清理在下列重跑中验证。
- 更新后 Worker SHA-256：`5c3dd8d81b1f1a5f0ada7fef49b00d977497b13eff7f7b5b7d7c67ab8944607e`。该版本完整运行1项真实本地 Worker/D1/R2生命周期用例通过，期间两个URL端口64281、64334；耗时2.09s。定向lint通过。

命令（仓库根执行，每项120s进程上限，单worker；未执行全量tsc）：

`pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/main/cloud-ipc.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/desktop exec eslint tests/unit/main/cloud-ipc.test.ts --report-unused-disable-directives --max-warnings 0`

`pnpm --filter @prompthub/desktop exec tsc --noEmit -p apps/desktop/tsconfig.cross-surface-cloud-ipc.json` 的实际 -p 参数为该临时文件绝对路径；文件 extends ./tsconfig.test.json，仅 include tests/unit/main/cloud-ipc.test.ts，检查该文件及其真实导入依赖。退出0且无诊断，临时配置已删除；复现时同样创建这个两字段JSON即可。

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare exec eslint src/release-acceptance-cross-surface-storage.test.ts --report-unused-disable-directives --max-warnings 0`

| 检查 | PID | UTC 起止 | 退出码 |
| --- | --- | --- | --- |
| Cloud IPC 3用例 | 2753 | 10:07:48.196 → 10:07:49.418 | 0 |
| Cloud IPC lint | 2794 | 10:07:49.419 → 10:07:50.466 | 0 |
| Cloud IPC scoped tsc | 2822 | 10:07:50.466 → 10:07:51.380 | 0 |
| Worker cleanup回归 | 3110 | 10:08:20.523 → 10:08:23.284 | 0 |
| Worker lint | 3181 | 10:08:23.284 → 10:08:24.088 | 0 |

Cloud IPC SHA-256：`336d81b02f286fa0e822037cdde14315695f4c291a360ab857bf671aef83a2b1`。

收尾资源核对：上述5个pnpm父进程均已退出；64281/64334无监听；本任务Worker临时目录残留0；临时scoped-tsc配置已删除；git diff --check通过。未影响其他会话的进程和改动。


## 第三轮：CLI 本地 Plugin 与 Worker 剩余既有入口

测试边界：新CLI Plugin用例用真实Core本地包导入/临时copy分发作为前置，get/list/create-version/versions/delete由各自独立CLI进程执行；检查完整二进制文件清单、快照字节、多次重开、无效删除参数拒绝及其他包/外部源/已分发目标保全。未调用CLI market install，它没有本地目录选项。

Worker沿用同一隔离Wrangler运行时和正式迁移，新增Prompt copy/版本rollback/三种已注册version delete入口/tag delete及租户保全；新增正式PUT /api/sync/data导入非空Skill、包字节和版本、Rule及历史，GET读取、拒绝无binary capability的覆盖请求、dispose重开后完整比对。不存在Worker backup restore别名路由，准备入口准确名称是PUT /api/sync/data。

静态能力缺口：Worker只注册媒体GET/POST，未注册DELETE或clear；shared Web客户端apps/web/src/client/desktop/install-bridge.ts:833及:914却调用DELETE /api/media/images?confirm=true与/videos?confirm=true。记录为客户端/Worker能力不一致，尚未执行该UI，未新造路由或将404当作删除成功。媒体清理行为需主协调确认当前Worker承诺后分配产品修复。

本批实跑结果（2026-10-04）：CLI新用例1/1通过，单用例4.025s、总5.34s；Worker本文件3/3通过（含原真实绑定基线），总4.89s；两文件定向lint及scoped tsc全部通过。相同源码未重复检查，没有产品修改。

命令（仓库根，串行单worker，每命令120s上限）：

`pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-plugins.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/cli exec eslint tests/release-acceptance-cross-surface-plugins.test.ts --report-unused-disable-directives --max-warnings 0`

`pnpm --filter @prompthub/web-cloudflare exec eslint src/release-acceptance-cross-surface-storage.test.ts --report-unused-disable-directives --max-warnings 0`

限定范围类型检查分别用 `pnpm --filter @prompthub/cli exec tsc --noEmit -p <CLI临时配置绝对路径>` 与 `pnpm --filter @prompthub/web-cloudflare exec tsc --noEmit -p <Worker临时配置绝对路径>`。两个临时文件均位于所属app/tsconfig.cross-surface-scope.json，extends ./tsconfig.json，include只含该组本文件；Worker额外含正式worker-configuration.d.ts。真实依赖随import检查，无stub/skip/断言掩盖，临时配置运行后删除。没有全量tsc、build或共享配置修改。

| 检查 | PID | UTC 起止 | 退出码 |
| --- | --- | --- | --- |
| CLI Plugin 1用例 | 6665 | 10:13:38.400 → 10:13:45.147 | 0 |
| Worker 3用例 | 6785 | 10:13:45.148 → 10:13:51.167 | 0 |
| CLI lint | 6928 | 10:13:51.167 → 10:13:52.136 | 0 |
| Worker lint | 6957 | 10:13:52.136 → 10:13:52.960 | 0 |
| CLI scoped tsc | 7159 | 10:14:07.957 → 10:14:09.717 | 0 |
| Worker scoped tsc | 7204 | 10:14:09.717 → 10:14:10.894 | 0 |

本批文件hash：

- `apps/cli/tests/release-acceptance-cross-surface-plugins.test.ts`: `165bbabd057e97b6b429e88fc2e4e8ac937f6db5f523a1f18356a315284d3869`
- `apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts`: `e73ad8c5466f06e8a37c861b4612ba4d73e41f56246a5c03ce1148f64f8ae222`

资源回收：6个pnpm父进程全部退出；CLI包/Worker fixture和本次CLI DB template残留0；两个临时tsconfig已删除；Worker四次启动端口49413/49466/49526/49565无监听；git diff --check退出0。无保留进程。

新增证据范围：完整包在Core导入后与CLI版本快照的文件路径、字节和长度一致；每个CLI动作都由新进程读取，delete后再次新进程读取剩余库；copy分发目标和两份外部源均保留。Worker三种version delete均验证其他租户404、原列表不变、成功后只移除目标版本和重复404；rollback非法0拒绝且正文未变；copy/rollback/tags及版本删除重启后仍保持。非空Skill与Rule经sync公开入口导入，正文/ID/历史/文件编码逐项比对；无capability的覆盖被422拒绝且原数据不变，重开再比对，另一租户完整snapshot保全。

本批没有新增已证实的运行期产品缺陷；媒体clear客户端/Worker不一致待主协调判定。仍未验：CLI市场安装/远端源、--remove-targets映射至真实Agent根、Plugin没有CLI版本rollback/delete命令；Worker媒体删除/clear无实现，Skill/Rule写入口明确返回未实现；Prompt diff/render-copy/direct-insert、folder嵌套删除与非法父目录、设备不同组合以及GUI/打包/生产/真实云未由本批全覆盖。可继续的纯本地缺口是已注册的Prompt diff/render-copy/direct-insert和folder层级保全，不应重复已通过生命周期。


## 第四轮：Worker公开输入合同与Web清空能力选择

新增实际已注册的Prompt diff/render-copy/direct-insert、版本direct-insert、Folder子树删除/非法parent及snapshot错误保全测试，沿用唯一真实本地Wrangler fixture。首次8项运行6过2失败：普通diff/render、direct-insert和folder生命周期通过；变量字面量渲染真实失败（D04，下述）；另一租户空snapshot动态生成exportedAt/settingsUpdatedAt导致严格快照比较失败属于测试前置错误，已补真实POST创建sentinel持久化，不降低比较要求。

D04：POST /api/prompts/:id/render-copy传入变量值包含 $&、$$、$`、$'，正确结果应保留字面值；实际值被String.replace的replacement语法展开。测试保留正确成功预期，原模板及usageCount后置检查仍通过。产品源码web-data.ts:421直接以变量字符串作为replace第二参数，修复归属待主协调分配。

对第三轮媒体能力缺口的更正：真正消费者clearDatabase只由useClearDataFlow调用，按钮位于DangerPanel；DangerPanel.tsx:11以 !webRuntime && activeSubsection === backup 限制整个清空区域。useDataSettingsRuntime读取isWebRuntime，真实installDesktopBridge设置__PROMPTHUB_WEB__=true，Worker资产指向同Web dist/client。因此现有Web/Worker未向用户提供清空入口，底层bridge缺graph/restore和media DELETE不应算作用户可见清空失败。主协调据此撤回“隐藏流程必须成功”的红测要求；本组新增专属Desktop组件测试验证真实bridge/runtime/组件显示条件和Desktop对照回调，不新增产品路由，不宣称真实GUI验收。

第四轮当前结果：Worker共8项，已验证7项通过、D04正确预期仍失败。首次6过2失败中的snapshot fixture已经用真实另一租户Prompt前置修正，并只定向重跑该场景：1通过、7个未选中（不计通过）；未重跑已通过同状态用例。Desktop能力选择1/1通过；两文件lint和各自限定范围tsc均通过。D04产品源码未改，等待归属分配。

D04实际期望：Before $& $$ $` $' 中文 🦌 after

D04实际返回：Before {{value}} $ Before   after 中文 🦌 after

失败定位：本组Worker测试renders dollar replacement sequences as literal variable values，业务返回值断言失败；真实HTTP 200不是业务成功。模板与usageCount=1实际读回正确。

命令（仓库根；每个进程120s上限、串行）：

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts -t 'rejects malformed snapshot' --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/release-acceptance-cross-surface-web-capabilities.test.tsx --minWorkers 1 --maxWorkers 1 --reporter verbose`

分别对上述Worker/Desktop文件执行所属package的 `exec eslint <文件> --report-unused-disable-directives --max-warnings 0`。限定范围tsc使用临时tsconfig.cross-surface-scope.json：Worker extends tsconfig.json，include本组Worker文件与正式worker-configuration.d.ts；Desktop extends tsconfig.test.json，include新组件文件、正式src/vite-env.d.ts及src/renderer/globals.d.ts。分别 `pnpm --filter <package> exec tsc --noEmit -p <临时配置绝对路径>`，无全量tsc或共享配置修改。

| 检查 | PID | UTC 起止 | 退出码 |
| --- | --- | --- | --- |
| Worker第四轮8用例 | 11365 | 10:20:18.838 → 10:20:32.700 | 1（D04真实缺陷+fixture时间戳） |
| Worker首次lint | 11593 | 10:20:32.702 → 10:20:35.573 | 0 |
| Worker snapshot fixture回归 | 11902 | 10:21:56.551 → 10:22:00.479 | 0 |
| Desktop能力组件 | 11973 | 10:22:00.480 → 10:22:04.606 | 0 |
| Worker fixture后lint | 12020 | 10:22:04.606 → 10:22:06.140 | 0 |
| Desktop能力lint | 12054 | 10:22:06.140 → 10:22:07.597 | 0 |
| Worker scoped tsc | 12112 | 10:22:22.803 → 10:22:26.113 | 0 |
| Desktop scoped tsc | 12142 | 10:22:26.115 → 10:22:34.059 | 0 |

当前源码hash：

- `apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts`: `809e1d38b3ccb915f3faf7226ee1f4a48a0ef8109857a306e3cd01f6466555c5`
- `apps/desktop/tests/unit/components/release-acceptance-cross-surface-web-capabilities.test.tsx`: `3d54922f338bca4c5d0c6803dff1fa4d349311b6357e6a16acbf8666d058e0e2`
- `apps/web-cloudflare/src/web-data.ts`: `907464b0205af5b5fcfeb21fb46722bd77a624dd6e1798d16ef73fb15297f25e`

资源核对：8个已记录父进程退出；上述10个Worker监听端口均关闭；Worker临时根0残留；Worker/desktop两份临时tsconfig删除；未运行的错误归属Worker组件草稿已移除，最终文件属于主协调新分配的Desktop路径；git diff --check通过。

新增验收边界：真实diff给出独立的前后正文及field清单；普通render-copy只增加usage不改变模板/版本，重开验证；direct-insert明确身份覆盖和owner归当前账号，非法字段/跨租户版本插入拒绝前后完整snapshot不变；folder非法parent/循环/跨租户失败保全，删除三层树将现存Prompt移回根并保留版本/外部sibling/另租户；snapshot缺字段/重复ID/路径穿越/错误base64逐次422，已有非空包与另租户完整snapshot重开不变。组件验证是jsdom局部合同，未执行实际应用GUI。


## 第五轮：D04 Worker修复与D05 CLI回归

D04修复仅修改apps/web-cloudflare/src/web-data.ts的renderPromptCopy替换表达式，第二参数回调返回value；保留既有escapeRegExp(key)、授权、usage、模板和版本行为。spec/knowledge/behavior/web.md对应Browser Workspace节记录字面值合同。原正确红测在修复后转绿，受影响Worker整文件8/8通过9.77s；源码与测试定向lint、scoped tsc通过。没有新增存储/配置/迁移、接口或业务限制，复杂度保持原有逐变量字符串扫描。

D05确认CLI有活跃消费者：packages/core/src/cli/prompt-command.ts:195–208的prompt copy真实调用prompt-utils.renderPromptCopy，然后incrementUsage。新增测试通过真实独立CLI进程create、versions、copy --var、get、versions，不直调helper。变量值覆盖dollar替换符，key覆盖a.b与a[b]；预期只替换精确占位符，保留{{axb}}。实际CLI退出0但正文错误：dollar被展开，a.b错误匹配{{axb}}，a[b]没有匹配自身。模板/usage=1/版本列表读回仍通过。此次新用例1失败、原7未选中，Core源码未改，正确成功预期保留待主协调分配修复。

命令：

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-process.test.ts -t 'copies literal variable' --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare exec eslint src/web-data.ts src/release-acceptance-cross-surface-storage.test.ts --report-unused-disable-directives --max-warnings 0`

`pnpm --filter @prompthub/cli exec eslint tests/release-acceptance-cross-surface-process.test.ts --report-unused-disable-directives --max-warnings 0`

限定范围类型检查继续使用每app临时tsconfig.cross-surface-scope.json extends ./tsconfig.json，Worker include本组Worker测试、web-data.ts与正式worker-configuration.d.ts，CLI include本组process测试；各自exec tsc --noEmit -p绝对路径。无全量typecheck/build；两份临时配置已删除。

| 检查 | PID | UTC 起止 | 退出码 |
| --- | --- | --- | --- |
| Worker D04绿测8项 | 13891 | 10:25:23.599 → 10:25:34.658 | 0 |
| CLI D05红测1项 | 14034 | 10:25:34.659 → 10:25:39.224 | 1 |
| Worker源码/测试lint | 14146 | 10:25:39.224 → 10:25:40.311 | 0 |
| CLI新增测试lint | 14174 | 10:25:40.311 → 10:25:41.652 | 0 |
| Worker scoped tsc | 14328 | 10:26:09.478 → 10:26:12.498 | 0 |
| CLI scoped tsc | 14370 | 10:26:12.499 → 10:26:14.160 | 0 |

对应hash：

- `apps/web-cloudflare/src/web-data.ts`: `ca6222d68b3ced894ae03808234eb30212b051b0f6706e6a1dfcb94f2ac745ba`
- `apps/cli/tests/release-acceptance-cross-surface-process.test.ts`: `109a10c446ac281d4db4c9376aa65eb67c966f5fc532a24d06d04f1ced0a58d6`
- `packages/core/src/cli/prompt-utils.ts`: `15c3a5ce11d8cc1a908665a493e53a8ded1b49ba953c8aedaaeb0bc98d06ab92`

资源：6个pnpm父进程均退出；Worker8个监听端口全部关闭；本组CLI/Worker fixture与本次CLI模板0残留，临时tsconfig已删除，git diff --check通过。D05仍红是产品未修，不是type/lint问题，不降低断言或skip。


### D05 修复后验证

最终实现仅修改packages/core/src/cli/prompt-utils.ts的renderPromptCopy一行，使用字面占位符的replaceAll并以回调返回value。字符串查找让key中的正则字符按字面匹配，回调返回让value中的dollar替换符保持字面值；原Object.entries逐变量处理顺序不变，无新增工具/抽象/兼容。时间仍是逐变量扫描文本，使用标准replaceAll避免split中间数组。无schema、持久化布局或迁移变化。spec/knowledge/behavior/prompt-workspace.md既有Copy Action Contract仅补CLI字面变量和usage/version约定，保留原有并行改动。

真实CLI新回归及既有正常复制用例2/2通过；另外21项因明确筛选未执行，沿用其先前已接受证据，不标为本次通过。D05原正确红测转绿，保存模板/usage=1/版本历史后置全部通过。Worker同状态8/8未重复执行。

`pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-process.test.ts tests/prompt.test.ts -t 'copies literal variable|renders copied prompt variables' --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/cli exec eslint tests/release-acceptance-cross-surface-process.test.ts --report-unused-disable-directives --max-warnings 0`

首次 `pnpm exec eslint packages/core/src/cli/prompt-utils.ts --report-unused-disable-directives --max-warnings 0` 退出2：仓库根无eslint.config，不是源码诊断。随后显式复用CLI已有配置：

`pnpm exec eslint --config apps/cli/eslint.config.mjs packages/core/src/cli/prompt-utils.ts --report-unused-disable-directives --max-warnings 0`

上命令退出0。没有安装工具或修改配置。限定范围tsc仍用临时apps/cli/tsconfig.cross-surface-scope.json extends tsconfig.json，include本组process测试、既有prompt.test.ts和Core prompt-utils.ts，执行 `pnpm --filter @prompthub/cli exec tsc --noEmit -p <该临时配置绝对路径>` 退出0，随后删除临时文件。

| 检查 | PID | UTC 起止 | 退出码 |
| --- | --- | --- | --- |
| CLI D05新旧copy绿测 | 15703 | 10:28:42.000 → 10:28:52.958 | 0（2过/21未选中） |
| CLI测试lint | 15925 | 10:28:52.959 → 10:28:55.072 | 0 |
| 无根配置的源码lint | 16021 | 10:28:55.072 → 10:28:57.623 | 2（工具入口错误） |
| 指定CLI配置的源码lint | 16705 | 10:29:37.359 → 10:29:38.655 | 0 |
| CLI scoped tsc | 16739 | 10:29:38.656 → 10:29:42.143 | 0 |

Core修复后hash：`d11aa40ff75a38fbfdaeb58360db03836ccf9b7f26781d36d9e11dbdf3299bbd`。5个已记录pnpm父进程退出；本组CLI根及本次DB模板0残留；临时tsconfig已删除；git diff --check通过。其他会话的既有集成检查进程未干预。

当前D01–D05均已有局部修复与对应有效验证，无本组已知缺陷红测待修。验证范围仍不含全量发布门禁、产品build、GUI、真实远端/付费模型、原生Agent消费者或发布部署；这些不能由本轮单元/进程/本地Worker结果推断。

## D3前置历史源样本（2026-10-09）

三个精确旧提交的fresh CLI/Core默认profile已生成，来源/重建说明及每条child命令在packages/core/tests/fixtures/historical-runtime/README.md与各版JSON中。正常旧writer与独立进程重开结果一致；新增historical-runtime-fixtures.test.ts由Core常用test入口选中，3/3通过（501ms）。读取仅使用当前adapter的readOnly边界，未调用当前initializer。286个已加载源码哈希逐项匹配指定Git blob，64个profile文件及完整SQL/BLOB/结构/FK核对通过。定向lint与scoped tsc通过；所有临时根、检查配置、已记录进程已清理，无保留端口。

每个profile含2个Prompt、4个Prompt版本、1个Folder、1条关系、1条output format、1个完整Skill包/2个版本、1条Rule/2个版本，以及无凭据AI设置。beta另含2个active Agent profile（beta.2同名）、完整Plugin包与版本、正常MCP库写入/更新。三个归档各20,480字节；SQLite user_version为0/3/3，legacy migration行6/12/13；详细索引/trigger/migration/字段/文件字节保留在provenance。

主协调已在计划明确：beta空根Core默认database-catalog，不手写Desktop authority/renderer migration/checkpoint标记；MCP bundle历史是本模式未覆盖，不标整个产品unsupported。连续跨版升级、Desktop canonical来源样本和当前D3权威迁移仍待验收；样本通过不算D3完成，也不替代数据D5/P28恢复。该样本交付时50组主矩阵为35 pass、11 not-run、2 blocked、2 unsupported、0 fail；最新状态以上方矩阵为准。

生成初期路径别名、FTS无rowid、单Skill Plugin语义、首次只生成一条Skill历史，以及校验器BLOB类型/JSON表示差异均为fixture构造/校验问题；集中修正后保留了完整字段和字节断言，未修改历史产品源码。这些失败不冒充产品红测。

## 第六轮：现有功能补测（2026-10-09）

仅新增本地现有功能测试；产品源码、D2/D3/D4架构改造及全仓门禁不在本批。CLI通过正式AgentSettingsRepository为全部builtin根设置临时override；Web通过真实认证/settings路由设置所有builtin根、custom集合为空，未改宿主HOME。新增Agent路径/identity/config读取/增删重开、显式Skill目录scan/import alias、prompt文本与文件参数互斥保全，以及真实本地HTTP sync status→manifest链。每个CLI动作由独立源码进程执行。

Web直接启动src/index.ts，DATA_ROOT独占临时根；正式PORT要求正整数，先使用操作系统临时端口预约再释放交给唯一产品进程，不修改生产配置。验证真实HTTP、认证、文件/数据库重开、Agent配置revision写入与真实加密备份、Provider/映射/加密秘密以及session index消费。session前置由正式AgentSessionIndexDB registerSource/commitScan生成，明确不证明原生会话扫描或执行Agent。合成秘密只在独占fixture中使用，不连接真实模型。

Worker按主协调授权将原八项测试的真实Wrangler fixture抽到同目录release-acceptance-cross-surface-runtime.ts，原业务断言保持；新增文件复用该唯一启动/正式迁移/持久D1-R2/关闭边界。同步竞争通过正式loadSnapshot/saveSnapshot持有相同baseline的两个对象，真实D1顺序写入并断言第二个409与成功结果保全；不是用户HTTP可控revision协议。另补Folder direct-insert字段/身份/父级及非法输入保全、实际workerd在临时D1表不可用时的500隐藏内部错误与修复重开。没有把真实D1正常meta结果当作“不确定提交结果”故障注入；该特殊供应商分支仍缺真实证据。

安全隔离限制已交主协调确认：CLI Skill平台目录与默认Rules服务直接由os.homedir/平台常量派生，不消费Agent overrides；listCached实际触发全局scan，workspace export/hasData/push/pull调用Rule export。当前无正式隔离入口，不运行这些组合、不更改HOME。CLI Plugin硬实例化内置market sources且未向delete --remove-targets传入目标resolver，预写临时分发metadata不能证明实际目标路径隔离，因此不运行该清理或市场安装。C13/C16/C18全组仍未完成，已有正常子范围证据保留。

W20正式media.ts:432明确POST /videos返回400要求base64/download，目前multipart无实现；本批只测拒绝后已有视频字节/租户/重开保全，精确能力应记unsupported，不能据此扩展产品。已通过的base64视频证据保持有效。

新增测试callback保持正常链、失败保全和重开因果关联；CLI Agent生命周期与Web配置/Provider的callback略超过50行，明确为同一资源完整流程，辅助函数分离了启动/参数解析/根隔离。规模为少量记录和二进制字节，文件清单O(字节总量)，无新增依赖、产品并发/重试/限流或备用接口。测试子进程有deadline和输出上限，临时根/端口/PID记录后清理；实际结果见下表，未执行的边界不计pass。

### 第六轮结果、冲突红测与清理

实际新增13项：CLI5过；Web4过/1失败；Worker新3过。受fixture提取影响的原Worker8项全部通过；本批唯一业务用例共21项、20过/1失败，受影响定向重跑不重复计数。筛选外用例是未执行，不是通过。三app定向lint与scoped tsc最终全部通过。首次scoped tsc各自暴露同源fixture类型问题：CLI/Web object guard未声明类型谓词，Worker spread可选settings没有明确必填字段；集中改为类型谓词与明确存在检查，无断言转换、skip或生产修改。

Provider正确红测依据foundation-integrity-redesign/specs/foundation/spec.md:79–85的FR-FOUNDATION-006：陈旧写入返回conflict且保全已确认更新；同Web config边界使用409。首次拟定400没有精确合同依据，已按主协调复核纠正为409，不把初次400失败计为合同已证实缺陷。最终旧expectedUpdatedAt请求实际500，soft状态断言保持409失败并继续校验：正常Provider及映射/secretState完全保全、加密secret文件逐字节不变、关闭重开完整对象相同、删除后再次重开列表为空。正常create/update/export/role隔离未失败。根因是DB updateProfile:218抛普通Provider profile changed externally，Core preserve分支传播，Web providerErrorResponse未识别该冲突，落入通用500。本轮产品未改，记录为D06冲突错误映射缺陷；不是数据丢失。

最终失败：apps/web/tests/release-acceptance-cross-surface-agents.test.ts:114，expected 409 / received 500。正确红测仍在普通Web Vitest发现路径中，无todo/skip标记。

命令均在仓库根以pnpm执行、单worker、单检查进程；业务deadline240秒、静态/定向重跑120秒、输出上限4MiB。完整实际参数如下：

`pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-agents.test.ts tests/release-acceptance-cross-surface-cleanup.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web run test tests/release-acceptance-cross-surface-agents.test.ts tests/release-acceptance-cross-surface-http.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-storage.test.ts src/release-acceptance-cross-surface-sync.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/cli run test tests/release-acceptance-cross-surface-agents.test.ts -t scans only --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web run test tests/release-acceptance-cross-surface-agents.test.ts -t persists Provider --minWorkers 1 --maxWorkers 1 --reporter verbose`

`pnpm --filter @prompthub/web-cloudflare run test src/release-acceptance-cross-surface-sync.test.ts -t rejects a stale loaded --minWorkers 1 --maxWorkers 1 --reporter verbose`

lint分别为所属package的exec eslint，文件含本app本批两测试与runtime helper（Worker为storage/sync/runtime），参数--report-unused-disable-directives --max-warnings 0。scoped tsc临时文件tsconfig.cross-surface-sixth-scope.json extends同app tsconfig.json，include上述文件；Worker额外正式worker-configuration.d.ts；执行exec tsc --noEmit -p临时文件绝对路径后finally删除，不修改全仓配置。

| 检查 | PID | UTC起止 | 退出码 |
| --- | --- | --- | --- |
| cli-test | 64930 | 05:40:15.086 → 05:40:27.022 | 0 |
| web-test | 65041 | 05:40:27.023 → 05:40:33.339 | 1 |
| worker-test | 65149 | 05:40:33.340 → 05:40:44.338 | 0 |
| cli-lint | 65553 | 05:42:32.502 → 05:42:33.399 | 0 |
| cli-types | 65581 | 05:42:33.399 → 05:42:34.851 | 1 |
| web-lint | 65633 | 05:42:34.852 → 05:42:35.651 | 0 |
| web-types | 65661 | 05:42:35.651 → 05:42:37.082 | 1 |
| worker-lint | 65713 | 05:42:37.082 → 05:42:37.734 | 0 |
| worker-types | 65744 | 05:42:37.734 → 05:42:38.650 | 1 |
| cli-alias | 66447 | 05:47:05.613 → 05:47:08.223 | 0 |
| web-provider | 66513 | 05:47:08.223 → 05:47:11.231 | 1 |
| worker-cas | 66602 | 05:47:11.231 → 05:47:13.393 | 0 |
| cli-types-final | 66671 | 05:47:13.393 → 05:47:14.782 | 0 |
| cli-lint-final | 66701 | 05:47:14.782 → 05:47:15.565 | 0 |
| web-types-final | 66729 | 05:47:15.565 → 05:47:16.968 | 0 |
| web-lint-final | 66757 | 05:47:16.968 → 05:47:17.742 | 0 |
| worker-types-final | 66786 | 05:47:17.742 → 05:47:18.618 | 0 |
| worker-lint-final | 66814 | 05:47:18.618 → 05:47:19.268 | 0 |

最终本批测试文件SHA-256：

- apps/cli/tests/release-acceptance-cross-surface-agents.test.ts: `dbc25a89a6f449857d05573d78f6b36b84f24d222853eddb81d93711cfd893ae`
- apps/cli/tests/release-acceptance-cross-surface-cleanup.test.ts: `f311bc9804153d6d6977ede6a5032f3d113bfce07d77c2a7f60b6fffe9e0cc8a`
- apps/cli/tests/release-acceptance-cross-surface-runtime.ts: `2dd48644f3ed980bf47d04356783caee79ddde3b6668f9bd2962aeb8ed3c1189`
- apps/web/tests/release-acceptance-cross-surface-agents.test.ts: `f888f59300174fb5f9b9e25f7f01560229a9bef7b93fda3c6a48097661b7308b`
- apps/web/tests/release-acceptance-cross-surface-http.test.ts: `30e692f80bfb7a2746bddcdc133023ca2d33b9734f02be626a7c6828829b720c`
- apps/web/tests/release-acceptance-cross-surface-runtime.ts: `4407c38242e9aa474cb1eda368ad48f338de993bdc28fc8a27fdb4f1a7a0b2e8`
- apps/web-cloudflare/src/release-acceptance-cross-surface-storage.test.ts: `ea9683a4ae186cc75325bbc6b2d629d3d75f7c891485f4a3f9e1059ae28e8450`
- apps/web-cloudflare/src/release-acceptance-cross-surface-sync.test.ts: `e7a6fc51b33434a9669e9c97f3b972be34b2200ddd2ac82ca60d50c90adaa444`
- apps/web-cloudflare/src/release-acceptance-cross-surface-runtime.ts: `6cfdfa34ca469752b1419f2bb491912116dce7ac18929eda07c01b202d6ccb15`

资源核对：33个记录的检查/Web父进程均已退出；35个记录的本地端口无监听；本组CLI/Web/Worker临时根0残留；三个临时tsconfig已删除，git diff --check退出0。CLI execFile/session writer子进程已等待退出；Worker dispose与进程exit清理均执行。测试检查临时日志在交付完成后清理，无保留服务器，未干预用户既有进程或HOME。

剩余：C13/C16/C18无正式根/市场/目标隔离接口；C17 builtin reset重置根不执行；C19非所列参数组合、W16发行/Docker/GUI、F03真实不确定提交结果、W20远端播放与GUI、F08生产云部署仍未覆盖。新增证据不改变D2/D3/D4状态、不代替root release harness、Desktop GUI/跨平台/原生Agent验收。数据组D5最新完整恢复及两次startup已在其报告通过，本组不重复计数。

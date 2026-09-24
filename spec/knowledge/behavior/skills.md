# Skills Spec

## Purpose

本规范定义 PromptHub Skill 体系的稳定真相源，包括 Skill 文件格式、仓库同步、版本管理与相关设计入口。

## Stable Requirements

### 1. Skill Package Contract

- Skill 是目录级 package；`SKILL.md` 是 package 内的必需入口文件，不是 Skill 的完整边界。
- 只有一个 `SKILL.md` 的 Skill 仍然合法，但它仍然必须被视为 `<skill-root>/SKILL.md` 形式的目录包。
- 导入、商店安装、Git/Gitea 安装、本地目录安装、同步、导出、项目分发和平台分发必须保留整个 Skill 目录树，除非命中显式忽略规则（例如 `.git` 与 `.prompthub`）。
- Skill package fingerprint 必须使用显式忽略规则，而不是笼统忽略所有隐藏文件。PromptHub 内部目录（`.prompthub/`）、VCS 元数据、依赖目录、缓存、日志、临时文件、本地环境密钥（例如 `.env` / `.env.local`）、虚拟环境与运行态 pid/socket 文件不参与 fingerprint；可分发模板文件（例如 `.env.example` / `.env.sample` / `.env.template`）仍然参与 fingerprint。
- 仅写入 `SKILL.md` 内容的 API 只适用于新建 UI 原生 Skill 或编辑入口文件；不得作为已有包来源导入/安装的最终持久化路径。

### 1.1 Skill File Contract

- 已发布 canonical Skill bundle 的 inventory 必须完整校验，未声明的目录
  （包括 `.prompthub` 和 `repo`）不能整棵豁免。校验失败必须保留文件，未知数据
  只能通过显式恢复流程处理；源码发布前排除 sidecar 不等于读取时忽略它。
- My Skills 的标签候选、实际过滤、计数、侧栏、列表和卡片统一从
  `getSkillFilterTags` 派生。默认仅含用户标签；开启来源标签设置后并入
  `original_tags`，不能出现候选可选但实际过滤不命中的分歧。
  两字段明确分开时，来源集合中出现同名标签不影响该用户标签；仅对缺失来源字段
  的远程旧记录继续使用兼容推断，不改写持久化数据。

- Skill 采用 `SKILL.md` 文件与 YAML frontmatter。
- `name` 为必填字段，且必须符合小写短横线命名规则。
- Desktop、CLI、Web、市场源适配器与 Skill 详情展示必须复用 `packages/core` 所有的标准 YAML parser/serializer，不得各自维护逐行切分或正则提取的 frontmatter 子集。
- 从 HTML、API payload 或其他外层文档提取嵌入式 `SKILL.md` 时，必须保留 YAML 前导缩进后再调用共享 parser。
- Frontmatter 必须支持 YAML literal/folded block scalar、quoted scalar、flow collection 与 nested map，并识别 `license`、`compatibility`、`metadata`、`allowed-tools` 等 Agent Skills 标准可选字段。
- 元数据编辑触发 `SKILL.md` 重写时，必须保留 PromptHub 当前不编辑的标准字段与未知扩展字段；允许规范化 YAML 表达形式，但不得改变字段值或静默删除字段。
- Malformed YAML、非 object root、自定义 tag、重复 key 和超限 alias expansion 必须明确解析失败，不得返回部分可信元数据。
- Skill 元数据与正文分工明确：UI 展示元数据与版本信息由数据库维护，说明正文与指令正文由 `SKILL.md` 持有。

### 1.2 Package Ignore And Secret Guard Contract

- CLI 的本地目录、GitHub 与 JSON 导入、托管副本、package fingerprint、版本快照、
  Project 分发和 Agent 平台分发必须使用同一套内置 ignore policy；package 根目录可以用
  Gitignore 语义的 `.prompthubignore` 增补规则，但不能排除必需的根 `SKILL.md`。
- `.DS_Store`、VCS/PromptHub 内部目录、依赖、缓存、日志、临时文件、本地 `.env*`
  凭据和常见构建输出默认不进入托管副本、fingerprint、快照或分发目标；可分发的
  `.env.example` / `.env.sample` / `.env.template` 继续参与 package。
- 内容审查不参与托管复制、版本快照、Project/Agent 分发或 JSON 导入。凭据示例、脚本和其他可表示内容按既有 ignore 规则保留，不按内容扫描结论拦截。
- package 路径、容量与原子性校验独立于扫描。CLI 复制入口保留过滤后 500 项上限，单文件与累计容量使用共享 package 20 MiB / 100 MiB 上限；不再读取文本以执行旧的 2 MiB / 16 MiB 扫描门禁。
- 托管、Project 与 Agent copy 替换继续使用同级 staging/backup 原子交换；复制、rename 或清理失败时必须恢复原目标。GitHub 导入先在临时 checkout 完成选择、ignore 与 package 校验，再创建最终托管 package。

### 2. Sync Contract

- PromptHub 必须支持 DB 与本地 Skill 仓库之间的双向同步。
- UI 编辑元数据后，需要同步 frontmatter；文件系统变更后，需要同步回 DB。
- My Skills 的本地 package source 有两种合法形态：
  - 复制导入：`local_repo_path` 指向 PromptHub 托管 package，托管 package 是 My Skills 的内容真相源。
  - 链接导入：`local_repo_path` 指向用户选择的外部本地 Skill 目录，外部目录是 My Skills 的内容真相源。
- 链接导入的 My Skills 文件浏览、读取、编辑、同步与 fingerprint 刷新必须使用该外部目录；不得在解析路径时静默复制为托管 package。
- 删除链接导入的 My Skills 记录时，只能删除 PromptHub 记录和 PromptHub 拥有的分发链接；不得删除外部源目录。
- 通过 backup/restore 恢复 Skill 时，`local_repo_path` 属于机器本地的写入目标，不能作为可移植数据回放。恢复必须从备份的内容和文件树重建当前机器的 PromptHub 托管 package，同时保留来源标识、来源地址和 package 对账基线。
- Desktop 自部署 Web 备份和兼容期 live-sync 必须在发送前移除 `local_repo_path` 以及非 HTTP(S) 的 `source_url`、`content_url` 和本地 icon 路径；Skill 正文、文件树和可移植的远程来源元数据必须保留。旧 live-sync 拉取合并不能只按数据库 ID 判断同一 Skill，必须优先按 `source_id`、package/content fingerprint 或旧记录规范化名称对齐，并同步重映射版本与文件快照，避免重复名称和孤儿文件写入。
- Agent Skills 页的 inventory 以当前 Agent 原生 Skill 目录为事实来源。
  `agentScanState` 只允许作为当前 renderer session 的派生缓存，不得跨应用重启
  持久化后阻止新的文件扫描。直接打开 Agent Skills 且本 session 尚无结果时，
  必须自动执行一次有界扫描；未完成、失败和成功空目录必须是三个不同状态。
- 本地 Skill 扫描遇到普通外部断链时，必须静默跳过并继续发现其它有效 Skill；
  若平台 activation 记录、当前 Skill id/name 与链接保存的旧 PromptHub 托管目标
  完全一致，则启动必须在 canonical workspace 物化后原子重绑。不得按名称猜测、
  接管外部断链或覆盖非链接内容；其它解析故障保留有界诊断，单个坏链接不得让
  整个扫描失败或把有效清单变为空。

### 2.1 Source Update Reconciliation Contract

- My Skills 的来源更新必须按三方对账处理：`B` 是上次来源安装基线，`L` 是当前本地 package，`R` 是当前来源 package。
- 目录级 Skill 必须优先使用 package fingerprint 对账。`directory_fingerprint` 表示当前本地 package，`installed_directory_fingerprint` 表示上次来源安装基线，`fingerprint_algorithm` 记录算法版本。
- v1 durable package fingerprint 使用 `skill-package-sha256-v1`；桌面主进程、CLI 和 renderer 远程包指纹解析不得把旧版 stable-text 目录摘要标记为该算法。Git tree/API 中只有 blob hash、没有包文件内容时，不得直接产出 durable `directory_fingerprint`；必须留空等待 clone/materialize 后按 v1 计算，或在未来能取得文件内容时按 v1 manifest 计算。旧版只记录 `SKILL.md` hash 的安装，只能在旧 hash 证明本地与远程入口一致时静默升级基线，否则进入无法确定历史的状态。
- 兼容旧版安装时，如果缺少 `installed_directory_fingerprint` 但旧 `installed_content_hash` 与远程入口 hash 一致，来源检查可以把当前本地 package fingerprint 作为可推断基线，再判断远程 package 是否变化。自动检查不得绕过 `baseline-missing` 的冲突保护；PromptHub 托管副本只有在用户显式选择覆盖/重置后，才能重新暂存来源并建立基线。链接外部目录即使显式覆盖也不得被 PromptHub 写入。
- 来源更新检查必须通过共享的 `B/L/R` 对账逻辑产生 `localModified`、`remoteChanged` 和状态，UI/store 不得各自手写不一致的状态机。
- 从 Project/Agent 扫描结果复制导入 My Skills 时，必须立即持久化基于确切本地目录的 `source_id`、内容 hash、目录 fingerprint、安装版本/时间和来源基线；后续检查与更新必须继续从该来源目录解析，而不是把复制后的 PromptHub 托管 repo 误当成远程来源。
- 如果 Project/Agent 扫描条目是指向外部目录的 symlink，复制导入必须以解析后的 `symlinkTargetPath` 作为来源身份和来源读取目录，同时保留扫描到的 shortcut 作为 Agent/Project 分发路径；PromptHub 自己管理的 symlink 不适用该外部目标归一化规则。已导入且由 PromptHub 管理的非内置 Agent Skill 详情必须提供来源检查/更新入口，但不应因此暴露 My Skills 的快照、编辑或删除操作。
- 本地来源的 package 校验、目录复制和 package fingerprint 必须复用同一个忽略谓词；依赖、缓存、运行态和本地环境文件不能因为数量或大小限制让有效 Agent 来源变成 `source-unavailable`，也不能被复制进托管 package。可分发模板仍需参与校验、复制和 fingerprint。
- My Skills 列表的“有可用更新”徽标必须先按确切来源身份匹配远程条目，优先级为 `source_id`、`content_url`、`source_url`；只有完全缺少来源身份的旧记录才能按唯一 `registry_slug` 回退。同 slug 的不同商店条目不得互相覆盖或触发刚安装即有更新的误报；只有算法兼容的 durable package fingerprint 才能优先于版本标签参与徽标判断。
- 来源更新状态限定为 `no-source`、`source-unavailable`、`baseline-missing`、`up-to-date`、`update-available`、`local-modified`、`conflict`。`source-moved` 和 `downstream-stale` 不属于 v1 来源更新主状态。
- `downstream-stale` 属于 Project/Agent 分发拓扑数据，只能作为辅助扫描结果或 `hasStaleTargets` / `staleTargets` 类字段暴露，不得污染 My Skills 来源对账状态机。
- `local-linked` 外部目录是用户外部文件夹的内容真相源。v1 不允许直接把远程来源更新覆盖进外部链接目录；UI 必须引导用户转换为 PromptHub 托管副本或手动更新外部目录。
- 来源解析必须先归类为明确 adapter kind：`remote-store`、`remote-git`、`remote-zip`、`content-url`、`local-linked` 或 `managed-copy`。raw `content-url` 是单文件来源，安装基线与远程 package fingerprint 必须等于该 `SKILL.md` 的内容 hash，不得信任 registry 中陈旧或外部提供的目录指纹。
- 来源检查必须使用与来源类型一致的 transport：`local-linked` 与 `managed-copy` 只读取本地目录；`remote-git` 优先通过经过校验的 Git clone 读取 package，Git 启动或 clone 失败时可以对同一个 HTTPS 仓库执行一次受控 HTTP archive 回退；`remote-zip` 下载并校验解压后的 package；只有纯 `content-url` 才使用通用 HTTP 内容接口。Git archive 回退必须复用现有代理、DNS/SSRF、重定向、超时、下载容量、archive 路径与 package 安全门禁，不得把 SSH 凭据静默转换为匿名 HTTPS，也不得在 Git 成功时额外下载。local/Git/Zip adapter 都必须从同一份经过校验的文件清单产生 `SKILL.md` 和完整 package fingerprint。用户明确配置的私有 Gitea 可以走 Git transport，但不得因此放宽通用 HTTP 的 SSRF 私网拦截。旧记录只剩 GitHub/Gitea raw/file URL 时必须恢复 repo/branch/directory；已安装 Skill 保存的具体本地来源路径优先于复用同一 `source_id` 的远程目录项。
- skills.sh 等目录型商店只提供 repo 与 Skill selector 时不得猜测物理子目录；安装、指纹检查和更新快照必须把同一份已校验 selector 传给主进程，并将 selector 纳入缺少稳定目录/source id 时的来源身份，避免同仓库多个 Skill 冲突。显式 selector 即使面对只有一个 Skill 的仓库也必须匹配，不能静默安装无关 package。克隆后按 frontmatter 精确身份优先、目录名回退的规则执行有深度与目录数上限的递归发现；名称归一化必须支持 Unicode。标准 `skills` / `data/skills` 容器优先于隐藏 Agent Skill 容器，隐藏 Agent Skill 容器优先于普通示例目录；同优先级仍存在多个候选时必须明确失败，不得任意选择。远程发现不得跟随 symlink，必须跳过 VCS 与共享 ignore 规则命中的生成目录，但不得笼统跳过 `.agents/skills`、`.cursor/skills` 等合法隐藏 Agent 容器。
- 非本地远程来源更新必须先完成内容落盘，再写入 DB 元数据和来源基线。Git/Zip 继续暂存并校验 package，raw content-url 在 SKILL.md 写入成功后刷新基线；任何落盘失败都不得提前标记为已更新。所有来源均不运行内容扫描。
- package 结构、路径、archive、容量、fingerprint 和回滚校验继续生效；内容报告不构成批准或阻断条件，不再按来源信任进行扫描重试。认证信息仅供传输使用，持久化诊断必须脱敏。
- 实际网络传输保留超时、代理和 SSRF 边界。配置代理时，远程抓取器保留既有 RFC 2544 合成 DNS 地址处理，不放行真实 loopback/RFC1918 内网地址；独立内容扫描不解析或验证来源地址。
- 如果 raw `content-url` 已写入但最终 DB 基线写入失败，必须通过更新前创建的版本快照回滚，避免本地文件内容与数据库来源基线长期不一致。
- PromptHub 托管 repo 替换必须使用 staging/backup swap；复制、校验或 sidecar 写入失败时，应保留上一个可用 managed repo。
- 来源检查失败时，PromptHub 应保留本地内容，返回 `source-unavailable`，并只保存净化后的 `source_last_error` 摘要，避免把 URL userinfo、token、query secret、堆栈换行等细节暴露到持久化错误字段。
- `source-unavailable` 检查结果还必须携带来源 adapter kind、脱敏后的来源位置和脱敏失败原因；本地目录、托管副本、Git、ZIP、内容地址和商店来源必须按实际类型展示，不能把所有来源都文案化为 URL。
- Git 可执行文件缺失且 HTTP archive 不适用时，安装/更新失败必须明确提示安装 Git 或配置 `PATH` 后重启 PromptHub；Git 与 HTTP archive 都失败时必须明确说明两条 transport 均失败，并引导检查 Git/PATH、网络/代理和来源权限。结构化失败只保存有界 reason 与脱敏摘要，不得向 renderer 暴露原始命令、凭据或本地路径。
- Cloud Store 的安装与更新必须先读取已发布 package，展示版本、文件/内容差异，等待用户明确确认后才写入本地；“检查更新”本身不得直接覆盖 Skill。
- My Skills 详情页只能保留一个“检查来源更新”入口，不得在检查后把顶部按钮改成更新动作，也不得追加“覆盖本地修改”按钮。`update-available`、`local-modified`、`conflict` 和 `baseline-missing` 必须先打开本地版本与来源最新版本的差异对比；关闭或保留本地版本不得写入任何内容，只有用户明确选择来源版本后才能进入既有暂存、快照和回滚流程，需要覆盖授权的状态必须显式携带该授权。
- package 来源的更新对比必须使用与 fingerprint 相同的完整有效文件清单，逐项展示新增、修改和删除，并允许用户查看每个变更文本文件的行级差异。二进制或超过安全预览上限的文本文件必须保留在清单中并显示大小/完整摘要比较语义，不得静默忽略或强制解码。raw `content-url` 只对比 `SKILL.md`，不得把本地辅助文件误报为来源删除。
- 同一 Git 仓库包含多个 Skill 时，来源恢复不得仅凭共享的 `source_url` 选择首个目录项；必须优先使用精确 `source_id`、`content_url`、`registry_slug`、已验证目录/路径或唯一 Skill 身份，歧义时回退已安装绑定而不是跨 Skill 更新。成功的 `up-to-date` 对账应修复非空规范来源元数据。skills.sh 页面中带省略号的 Repository 展示值不得保存为 Git URL。来源更新弹窗展示 Skill 身份与完整内容差异，不展示不能代表实际 package 决策的本地/来源版本卡片。
- PromptHub Cloud 的桌面账号与 Skill Store 入口必须受同一个 renderer capability 控制；生产 endpoint 与发布证据未完成时默认关闭。关闭后设置导航、商店来源、程序化选择、持久化恢复和后台刷新都不得访问 Cloud，旧选中状态回退到官方商店。
- Cloud release 的 `store-package-sha256-v1` 只用于远程交付 intent 的版本期望；桌面本地 package 仍必须计算并持久化 `skill-package-sha256-v1`，不得把两种 fingerprint 直接比较或互相标记。
- Cloud 多文件 package 写入失败时必须恢复已写入文件并清理新建文件；安装失败不得留下半成品 Skill，更新失败不得提前刷新来源基线。
- 扫描复制导入只有在完整 package 已写入 PromptHub 托管 repo 且 `local_repo_path` 已持久化后才能计为成功。复制、返回路径或路径持久化失败必须删除临时 Skill 记录；补偿删除失败必须报告原始失败与回滚失败，不得吞错或保留假成功状态。

### 2.1.1 Library CRUD command boundary

- Desktop 创建、编辑、改名和删除只使用已迁移完成的 canonical 文件权威。移除 CRUD 中旧式按名称移动托管目录、独立 frontmatter 补写、renderer 再写 SKILL.md 和忽略失败的路径；未完成迁移明确报错，不启动第二套存储逻辑。
- 创建先准备入口文件，再一次发布完整 bundle。编辑从 canonical inventory 暂存完整包，正文、元数据、fingerprint 和修改前版本在一次 finalize 中发布；用户 tags 不写入来源 frontmatter，未知 YAML 字段和二进制资源保留。仅收藏/用户标签等修改不复制暂存包。源布局和 schema 不变，缓存仍使用稳定 Skill ID。
- 改名只迁移明确安装的目标，不传旧名/新名兼容清理列表；目标冲突提前失败。原分发副本暂存用于失败恢复，符号链接保持模式。全部目标处理完才提交库内名称；失败保留旧名称并恢复分发，恢复失败明确报告保留的临时备份位置。备份、分发和清理按目标顺序执行，有界占用为本次包和已部署副本总大小。
- 删除先撤回指定分发，再由 canonical 层删除 bundle 和缓存。任何前置撤回失败保留库内记录供重试，不显示完成；外部来源不删除。调用者可保留 copy，symlink 必须撤回。canonical 提交后缓存清理失败沿用已提交错误语义，不能伪装为未提交或完整成功。
- Desktop 和 CLI 使用同一份 Skill 目标替换函数：在同级暂存复制/链接完成后移动旧目标并发布新目标；发布前失败恢复旧目标。发布后的备份清理失败明确报错且保留新目标，不用可能已部分删除的备份覆盖它。
- 来源更新携带检查时的完整 package fingerprint，暂存结果不匹配时在写入前返回 conflict。预览只包含有界文本和摘要，不能用预览重建二进制包；检查和实际获取仍各执行一次，避免另建长期暂存缓存及其过期协议。
- 暂存与历史快照成本为 O(package bytes + file count)，分发为 O(sum of target package bytes)，无递归请求或无界并发。已有 canonical 发布失败恢复仍适用；回退程序前应保留独立备份，不改写用户源目录。
- 本批回归覆盖单次创建/编辑、二进制和未知 YAML 保留、版本和陈旧编辑、改名失败与冲突、删除失败/重试、复制/链接替换失败及来源变化。核心 6 个相关测试文件共 54 项、桌面 8 个相关测试文件共 116 项通过；Desktop TypeScript、相关源码和新增测试 ESLint、文件大小门禁及 diff whitespace 检查通过。目标替换函数达到 100% 行/函数/分支；library command 为 100% 行/函数、95.60% 分支，Desktop CRUD 为 100% 行/函数、95.38% 分支。剩余未命中分支为正文/名称 nullish 防御、创建失败后 ID 回读，以及错误传播的 finally 路径；它们没有被计为完整覆盖，后续需补投影缺字段和组合故障夹具。128 文件、2 MiB 同级目标替换实测 96 ms，单次本机观察不代表所有文件系统。GUI、真实远程服务、跨平台、全量发布构建和中断进程后的分发恢复未执行。改名跨目标补偿和完整包准备函数按顺序集中处理，允许超过 50 行以保持快照、提交和恢复顺序可审查。

### 2.1.2 Functional acceptance

- `apps/desktop/tests/integration/skill-public-workflow.test.ts` 从生产 preload API 和完整 IPC 注册入口执行真实服务、磁盘 SQLite、首次 canonical 迁移与关闭重开。正常流程覆盖手工创建、元数据和嵌套文件编辑、版本、完整目录导入、二进制、copy/symlink 分发、改名、来源更新、卸载和删除；之后从同一 IPC 边界验证非法输入、路径穿越、缺失入口和陈旧来源，检查错误类型与持久化结果。Electron 消息运输及隔离 home 属于测试环境边界，不替换业务服务。
- 该功能用例由现有 desktop integration shards 自动纳入。真实按钮流程 `agent-skill-lifecycle.spec.ts` 纳入既有 E2E smoke；`skill-create-structure.spec.ts` 检查当前 canonical bundle 和 workspace，移除过期 variant container 断言。接口流程与 E2E 证据分别记录，mock 组件/store 测试只证明局部交互。
- 多步骤正常流程测试保留顺序断言，允许超过 50 行以直接呈现输入、结果和关闭重开边界；文件 inventory 一次线性遍历，只在临时小包上比较完整字节。此前 170 项聚焦测试与覆盖率仅证明各自局部边界，不作为完整功能可用的结论。
- 首轮真实流程发现本地导入的 `source_url` 在 catalog 重建后丢失。`config/devices/skill-sources/<skill-id>.json` 现在持有本设备的本地来源地址，portable bundle 仍不保存本机路径；设备标识不匹配时不应用该路径。来源记录与 Skill bundle 在同一 canonical publication 内新增、更新和删除，失败一起回滚。启动投影通过设备记录恢复来源，不从 workspace 猜测来源。
- 升级在首次 authority 发布或首次 catalog 对账之前，一次性将现有 SQLite 本地来源移交给设备配置，完成标记位于 `data/operations/migrations/skill-source-bindings-v1.json`；标记和来源记录原子发布，之后不再保留 SQLite 回退读取路径。已被旧程序丢失的来源不可凭包内容恢复，需要重新选择来源；回退旧程序前保留完整 data/config 备份，旧程序不能消费新设备记录。单条绑定读取上限 16 KiB，迁移一次 O(skill count)，正常修改仅写本 Skill 的小型绑定。
- 包操作必须等待启动恢复完成后再执行，恢复失败明确拒绝写入；IPC 注册返回就绪 Promise，隔离测试在关闭数据库前等待该任务。缓存标记 `.canonical-bundle-hash` 仅属于 workspace，不能进入包快照、导出或平台 copy。
- 2026-09-12 非 GUI 验证：两条正常公共接口流程和 14 组黑盒异常输入通过，实际检查完整字节、版本、安装状态、关闭重开及外部来源保留。相关目录操作、authority/startup、IPC 与功能用例 7 文件 131 项通过；另有 canonical lifecycle 5 项、Core 来源绑定/Skill DB/catalog 对账 43 项通过。Desktop TypeScript、额外将本次桌面测试纳入 compiler program 的类型检查、相关 ESLint、文件大小门禁和 Desktop main/preload/renderer 构建通过。没有以覆盖率数字证明功能；GUI 实际点击、真实网络来源、跨设备备份恢复、跨平台及完整发布 harness 未执行，不能据此宣称全部应用功能可用。临时测试目录和进程已回收。

### 2.2 Standalone Content Safety Scan Contract

- 安全扫描是默认关闭的独立功能。开启后仍只响应用户手动操作，不在导航、安装、快捷/批量安装、导入、更新、编辑、版本、同步、备份或部署时自动运行。
- 设置使用独立的 skillSafetyScanEnabled 和 static/ai 方式。旧自动扫描、渠道策略和来源信任设置归零，不启用新功能；历史报告继续可读。回退旧版本前应检查其旧设置，旧程序可能恢复旧策略；不改写 package 或历史报告。
- Desktop/Web 扫描请求必须显式 enabled=true；CLI skill scan-safety 命令即本次显式授权。默认本地静态内容检查，不联网；AI 方式须手动选择并配置模型，失败明确报错，不以静态结果冒充 AI。
- 只检查内容意图和上下文，不根据来源域名、Git/Gitea/目录等渠道、source URL 是否存在、DNS、商店审计或脚本文件名判断风险。AI 输入不携带来源信任元数据，不执行被审查内容，不回显凭据值。
- 报告仅供阅读，任何风险等级都不批准或阻止业务写入；旧操作请求的 safetyScan、safetyScanMode、approvedPackageFingerprint 为不生效的兼容字段。安装/更新不保存扫描结论或写入信任列表。
- 路径穿越、不安全 archive、无效 package 结构、容量超限和写入/回滚错误仍按各自业务契约处理。内容扫描预算不得缩减可备份、版本化或安装的 package 内容。
- 标准生命周期在完整暂存和结构校验后创建持久化 Skill 记录。兼容扫描导入的临时记录仍必须验证补偿删除成功，失败返回回滚诊断。
- Desktop 进程启动时必须在接受新的 Skill package 请求前恢复上一进程留下的全部
  lifecycle journal 与 pending 记录，不受运行时清理所用年龄租约限制；进程运行期间
  的维护清理仍必须保留租约，避免把正在执行的安装或更新当作中断操作回滚。
- 安装/更新的业务元数据必须以最终暂存 package 中解析后的 `SKILL.md` frontmatter 为准；商店目录值仅作为缺失字段的回退。用户在 PromptHub 中维护的 `tags` 不得被来源更新覆盖，来源标签写入 `original_tags`；目录版本 `source` 是哨兵值，不得作为已安装版本持久化。

### 3. Versioning Contract

- Skill 版本历史属于稳定产品能力。
- 版本快照、恢复、差异对比与平台分发属于 Skill 域内关键流程。

### 3.1 Platform Distribution Feedback Contract

- 当用户选择符号链接方式分发 Skill 到平台目录时，PromptHub 必须明确区分“真实 symlink 成功”和“因权限/文件系统限制而回退为 copy 安装”。
- 如果主进程回退为 copy 安装，渲染层必须收到结构化结果，并向用户显示包含受影响平台与原因的警告提示。
- 回退 copy 安装仍属于成功分发，但不得伪装成普通 symlink 成功。

### 3.2 Project-Local Distribution Contract

- PromptHub 必须支持将项目级 Skill 直接分发到当前项目内的本地目录，而不强制要求先纳入 `My Skills`。
- PromptHub CLI 必须支持从现有 `My Skills` 中选择一个 Skill，并直接安装到当前项目的本地 Skill 目录，而不强制要求先在桌面端登记项目。
- 项目级分发默认目标为当前项目的 `.agents/skills`，并允许用户额外选择多个目标目录。
- 项目级分发必须复制整个 Skill 目录到 `<target>/<skill-name>/`，而不是只写单个 `SKILL.md` 文件；这是全局 Skill package contract 在项目分发场景下的具体要求。

### 3.3 Agent Platform Visibility Contract

- Skill 平台分发的可见目标由“已检测到的平台”与“用户显式配置的平台”共同决定。
- 已启用的 custom Agent 和存在用户覆盖配置的 built-in Agent 必须作为可分发目标显示，即使其根目录当前还不存在；安装流程负责创建缺失目录。
- `disabledPlatformIds` 始终优先于检测和显式配置，用于隐藏用户不希望看到的平台。
- 平台检测仍用于默认 built-in 平台降噪和状态提示，但不得单独作为分发目标可见性的唯一门禁。
- `agent-skills-global` 是实验性的共享 Skill 分发目标，不是 Agent 平台，
  因此不得进入 Agent 检测、Agent 数量或 `SKILL_PLATFORMS`。它把完整 package
  安装到 `~/.agents/skills/<skill-name>/`，使用 PromptHub ownership receipt
  区分托管、已修改和外部冲突状态，并在卸载前重新验证所有权。
- 共享目标不得默认参与批量分发。用户同时选择共享目标和已知会发现
  `.agents/skills` 的平台原生目标时，界面必须提示重复发现风险；未完成运行时
  验证的平台继续使用其原生目录，不得被宣称为兼容。

### 3.4 CLI Automation And Asset Topology Contract

- CLI 以 `skill import` 表示纳入 PromptHub，以 `skill distribute` / `skill undistribute`
  表示向 Agent 平台分发或撤回；`install`、`install-md`、`uninstall-md` 作为兼容别名保留。
- CLI 的 Skill `list/get/import/versions/create-version/rollback/sync/update` 成功结果默认只返回
  identity、version、fingerprint 与 file count 等有界摘要，不返回正文或文件快照；`--full`
  显式恢复完整 payload，`--quiet` 只抑制成功 stdout，错误仍写 stderr。显式 `repo-read`
  与 export 命令继续返回调用者要求的内容。
- Skill 详情必须把 upstream/local external source、当前可编辑 package 和已检测到的 Agent
  分发目标分为三个拓扑阶段。外部直连目录不能标成 PromptHub 托管副本；copy target 必须
  说明再次分发会覆盖，symlink target 必须说明编辑会沿链接生效。

### 4. Translation Contract

- Skill 详情页的 AI 翻译结果属于可恢复的本地用户状态。
- 完整 Skill 文档翻译必须通过 Desktop 主进程 AI transport 访问已配置端点，支持用户明确配置的内网 HTTP base URL；翻译与其他 AI HTTP 请求统一使用 300 秒有界请求超时，不得维护更短的操作级 timeout 或新增自动重试。
- 主进程 transport 的 deadline 必须显示为翻译超时，不得误报为无法连接；超时失败不能写入部分译文缓存。
- 翻译结果不得改写原始 `SKILL.md`，应作为 sidecar 文档保存在 Skill 本地 repo 的 `.prompthub/translations/` 目录下。
- 翻译是否仍然有效必须基于当前 `SKILL.md` 内容 fingerprint 判断，而不是仅凭页面内存态。
- 当 `SKILL.md` 变化导致旧译文失效时，UI 必须回退原文并提供明确的重翻入口。
- `.prompthub/` 目录属于 PromptHub 内部文件空间，默认不参与普通文件树、导出和分发流程。
- canonical file authority 启用后，`data/skills/<skill-id>/` 只允许保存可验证的
  canonical Skill bundle；安装/更新暂存必须位于 `operations/`，不得在该目录旁创建
  legacy managed container 或把 `.prompthub` 管理元数据混入 package payload。
- canonical 安装/更新直接从已验证的暂存 package 原子发布 bundle，再物化
  `cache/skill-workspaces/<skill-id>` 可写工作区。SQLite finalize、版本快照和 bundle
  发布任一步失败时必须恢复旧状态，暂存目录由生命周期清理。

### 5. Stable Internal Sources

- Skill 体系设计见 `spec/knowledge/structure/skill-system-design.md` 与 `spec/knowledge/structure/skill-system-design-zh.md`
- Skill 商店需求见 `spec/knowledge/structure/skill-store-requirements.md` 与 `spec/knowledge/structure/skill-store-requirements-zh.md`
- 历史测试演进与状态记录保存在 `spec/changes/legacy/docs-08-todo/`

## Stable Scenarios

### Scenario: Defining a new Skill workflow

When Skill behavior changes materially:

- contributors create a delta spec under `spec/changes/active/<change-key>/specs/skills/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Persisting translated Skill content

When a user has already translated a Skill detail page:

- reopening the same Skill with unchanged `SKILL.md` content restores the saved sidecar translation by default
- changing `SKILL.md` content invalidates the old translation and requires a fresh translation before it is shown again

### Scenario: Recovering Skill knowledge

When historical Skill plans or test rounds are still useful but no longer current source of truth:

- they remain readable under `spec/changes/legacy/`
- they are not deleted or replaced with git-history placeholders

## Lossless package snapshots

Canonical Skill bundles own package bytes; working caches are rebuildable. Metadata
updates retain canonical files when a cache is missing, and managed edits publish a
validated complete package before replacing the cache. An explicitly invalid source
is an error, not an empty package. Concurrent stale edits require reload/retry.

Persistence snapshots are separate from file previews. Text remains the historical
`{ relativePath, content }` shape; non-text bytes carry `encoding: "base64"`. All
supported restoration consumers decode bytes and reject unknown encoding. Old text
history is readable, including auxiliary-only snapshots with a separately stored
entrypoint. Historical `[binary file]`/`[file too large]` text cannot recover lost bytes.

Binary snapshots require new-format file envelopes/CLI bundles/canonical documents
and sync capability 2. Raw WebDAV/S3 binary snapshots have a non-JSON version prefix,
so old readers fail before restoration. Do not use an old client with a writable
upgraded root; downgrade from an independently retained pre-upgrade backup. Package
limits remain the shared Skill limits; byte snapshots do not inherit preview limits.

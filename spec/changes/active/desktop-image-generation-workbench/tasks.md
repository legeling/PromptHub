# Desktop Image Generation Workbench Tasks

## Specify And Clarify

- [x] `T-IGW-001` 建立 active change，记录现有生图能力、用户目标、范围和风险。
- [x] `T-IGW-002` 完成 `FR-IGW-*`、`NFR-IGW-*`、场景和验收标准初稿。
- [x] `T-IGW-003` 导航、资产独立性、100 张上限、单模型批次和生成资产本地专属
      边界已确认。
      Covers `FR-IGW-001`, `FR-IGW-003`, `FR-IGW-014`, `DES-IGW-001`,
      `DES-IGW-003`, `DES-IGW-005`.

## Plan

- [x] `T-IGW-004` 完成数据、文件、备份/同步、迁移和删除生命周期设计，详见
      `data-contract.md`。
      Covers `FR-IGW-005`, `FR-IGW-009`..`FR-IGW-015`, `DES-IGW-003`,
      `DES-IGW-004`, `DES-IGW-006`, `DES-IGW-009`, `TEST-IGW-004`,
      `TEST-IGW-006`, `TEST-IGW-009`.
- [x] `T-IGW-005` 完成编排、provider capability、并发、取消、重试和恢复设计，
      详见 `orchestration.md`。
      Covers `FR-IGW-003`..`FR-IGW-008`, `FR-IGW-013`, `DES-IGW-002`,
      `DES-IGW-005`, `DES-IGW-008`, `TEST-IGW-002`, `TEST-IGW-003`,
      `TEST-IGW-005`.
- [x] `T-IGW-006` 完成交互信息架构、原型和 Desktop UI 验收矩阵。
      2026-07-15 已确认 Prompts 二级导航、画布优先结果墙、右侧批次/溯源面板的
      UI concept；逐状态验收矩阵见 `ui-acceptance.md`。
      Covers `FR-IGW-001`, `FR-IGW-002`, `FR-IGW-007`, `FR-IGW-009`,
      `FR-IGW-011`, `FR-IGW-012`, `DES-IGW-001`, `DES-IGW-007`,
      `TEST-IGW-001`, `TEST-IGW-008`.
- [x] `T-IGW-007` 确认首版生成记录和原图不进入任何远端 payload；未来会员云空间
      另立 change。Web capability 不宣称支持本地批量工作台。
      Covers `FR-IGW-015`, `NFR-IGW-SYNC-001`, `DES-IGW-009`, `TEST-IGW-009`.
- [x] `T-IGW-008` 完成实现前 Analyze，消除阻塞性 `[待确认]`、孤立 ID、
      active change 冲突和未映射测试。

## Implement

- [ ] `T-IGW-009` 按 `TEST-IGW-002`..`TEST-IGW-006` 先添加失败测试，再实现
      shared contract、数据库迁移、编排和文件生命周期；先从接近 2,000 行上限的
      `renderer/services/ai.ts` 提取现有生图 adapters，不继续扩大该文件。
      已完成首个本地 manifest/SQLite index、IPC/preload、runner、恢复、重试、
      favorite 与复制到 Prompt media 的纵向切片；已补齐远端输出直存、字节 MIME
      检测、引用图 capability、比例映射、取消晚到结果和批次写串行化。adapter 提取和
      完整覆盖率仍待完成。
- [ ] `T-IGW-010` 按 `TEST-IGW-001`、`TEST-IGW-008` 先添加失败测试，再实现
      Desktop 导航、工作台配置、进度、结果库、详情和批量操作。
      已完成导航、紧凑配置区、结果墙、筛选/排序/密度、多选、批次队列、进度、
      provenance 和单/多输出动作。2026-07-17 完成第二轮 UI 优化：补充无模型原因、
      本地存储提示、按需批次抽屉、始终可见的右侧生成面板、进度语义、详情预览和列表
      元数据。2026-07-22 按新确认设计重构为左侧结果画布、右侧生成配置及按需批次
      抽屉，并完成 `1586x992` 及用户截图等效 `1008x622` 固定右栏视觉验收；带作品的
      固定 fixture 截图与最小窗口 shell 折叠验收仍待最终 Converge 前补齐。
- [ ] `T-IGW-011` 按 `TEST-IGW-007` 完成 100 输出批次与 10,000 元数据资产库
      压力验证并修复性能瓶颈。
- [ ] `T-IGW-012` 按 `TEST-IGW-009` 完成迁移、备份/恢复、同步范围和 Web
      capability 合同。
      已修复旧生成目录创建后遮蔽 legacy Prompt media 的兼容选择，并在读取批次时将
      旧 workbench 原图复制到新的 `data/generations/assets/`；完整备份/同步合同测试
      仍待完成。

## Verify And Converge

- [ ] `T-IGW-013` 运行 focused tests、coverage、typecheck、lint、Desktop 实操和
      relevant release harness，在 `implementation.md` 记录实际结果与跳过项。
- [ ] `T-IGW-014` 同步 `spec/workflow/*`、`spec/knowledge/behavior/desktop.md`、
      Prompt workspace/data layout/backup-sync 稳定文档及必要的 public docs。
- [ ] `T-IGW-015` 完成 Converge，更新 issues/releases/ADR/index，并把完成 change
      移入日期归档目录。
- [x] `T-IGW-016` 按 `DES-IGW-010` 实施桌面形态布局（`FR-IGW-016`）：批次常驻左栏、
      配置面板可折叠、画廊头部批次身份与切换、运行中细进度条、Lightbox 大图查看
      （键盘导航 + 操作栏）、桌面多选语义、移除空 Advanced 开关。验证合同：左栏切换
      批次无遮罩、配置面板折叠状态流转、Lightbox 打开/键盘切换/Escape/操作、
      hover 才显示选择标记、7 locales、既有生图测试零回归。
- [x] `T-IGW-017` 按修订后的 `FR-IGW-016` / `DES-IGW-010` 先改写桌面布局红测，再移除
      常驻批次栏，使用头部批次切换器和新建按钮；将排序/密度收进画廊选项菜单，将
      比例/质量/参考图收进默认折叠的真实设置区，并完成七语言、类型、静态检查和
      宽窄视口视觉验收。
- [x] `T-IGW-018` 以回归测试证明“新建批次”进入独立干净草稿：清空当前批次画廊和
      草稿输入但保留历史入口；选择历史批次或提交成功后退出草稿状态。
- [x] `T-IGW-019` 将比例与质量作为常驻基础生图参数直接显示；参考图保持默认收起，
      使用具名参考图披露区代替笼统的“更多设置”，并更新回归测试与七语言合同。
- [x] `T-IGW-020` 先用回归测试证明参考图不会被来源 Prompt 自动选中，再实现本地文件
      选择、文件拖入、Prompt 媒体显式选择、移除与拖动排序；本地文件经主进程验证并
      复制为受管媒体，按当前 adapter 的两张上限约束，并同步七语言与视觉验收。
- [x] `T-IGW-021` 将新草稿默认生成数量从 8 调整为 1，并确保“新建批次”恢复为 1；
      通过回归测试区分新草稿默认值与历史批次已持久化的目标数量。
- [x] `T-IGW-022` 将生成数量从页脚无标签步进器移动到常驻配置区，补充可见字段标签；
      页脚只保留主要生成操作，并以组件回归测试锁定字段位置和可访问名称。
- [x] `T-IGW-023` 按确认的 v3 视觉方向改造桌面工作台：生成模式隐藏 Prompts 二级侧栏，
      当前批次使用大图审阅区和缩略图条，右侧检查器切换生成设置与有界历史，失败槽位
      使用紧凑中性状态；先补 `TEST-IGW-010` 红测，再完成七语言、宽窄视口视觉验收、
      类型检查、构建与差异审查。
- [x] `T-IGW-024` 按 `TEST-IGW-011` 修复工作台顶栏侧栏按钮无可见反馈的问题：进入
      工作台仍自动收起二级侧栏，但允许按钮临时展开/收起；工作台状态不得写入持久化
      偏好，离开后恢复普通 Prompt 页既有侧栏状态。
- [x] `T-IGW-025` 按 2026-09-01 确认的轻量审阅方向收敛工作台：右侧生成设置/历史改为
      按需抽屉，工作台筛选和批次操作收进头部菜单，图片操作收进 `More`/右键菜单；
      保留现有生成、取消、重试、收藏、下载、加入 Prompt、IPC、存储和执行合同，补齐
      `TEST-IGW-010` 组件回归、七语言、类型、静态检查、构建与同视口视觉 QA。
      实现、68 个 focused tests、七语言、Desktop 类型检查、focused ESLint、生产构建、
      文件规模与差异检查已通过；用户后续授权 GUI 检查后，使用隔离 E2E profile 与
      5 图 fixture 完成 3 轮 `1200x740` 实际截图和归一化并排对比，P1/P2 已修复，
      `design-qa.md` 最终结果为 passed。
- [x] `T-IGW-026` 按 `FR-IGW-017` / `DES-IGW-011` / `TEST-IGW-012` 补齐生成与整图编辑
      双路径：先写历史输出安全读取、GPT Image multipart edits、unsupported-provider
      预检和组件模式反馈红测，再实现 shared/main/preload/runner/provider/UI/i18n；最后
      运行 focused tests、类型、静态检查、生产构建和隔离 Electron 实机验收。蒙版与
      局部重绘不在本任务范围内。
      108 个 focused tests、Desktop typecheck、focused ESLint、生产构建、spec 索引/
      治理/追踪和 diff check 已通过；隔离 Electron profile 在 `1200x740` 验证历史输出
      继续编辑、GPT Image 模型、`1/4` 参考图、生成图预览、固定编辑操作和无横向溢出。
      未调用真实付费 Provider；真实凭据/网络接受度仍需单独的用户环境验收。
- [x] `T-IGW-027` 按用户实际截图修复右侧设置/历史面板遮挡主内容的问题：先更新
      `FR-IGW-018` / `DES-IGW-012` / `TEST-IGW-013` 和组件红测，再把工作台重构为
      全宽头部下的同层 Gallery/Inspector 布局；在宽与紧凑 Electron 视口验证主预览、
      缩略图、继续入口无覆盖、无页面级横向滚动，且关闭右栏恢复全宽。
      32 个工作台组件测试、Desktop typecheck、focused ESLint、生产构建、文件规模、
      spec 索引/追踪和 diff check 已通过；隔离 Electron 在 `1200x740` 与 `900x650`
      验证 Gallery/Inspector 边界不相交、头部跨满内容区、主预览/继续入口留在 Gallery
      内、关闭面板回收完整宽度且无页面横向滚动。
- [x] `T-IGW-028` 按 `FR-IGW-019` / `DES-IGW-013` / `TEST-IGW-014` 实现生图工作台
      左右辅助侧栏互斥：所有右栏入口统一先收起 Prompts 二级侧栏，展开二级侧栏时关闭
      右栏；补组件红测和紧凑 Electron 双向切换验收，确认全局模块栏、当前批次、聚焦图
      和草稿状态不受影响。
      62 个工作台/TopBar 组件测试、Desktop typecheck、focused ESLint、生产构建、文件
      规模、spec 索引/追踪和 diff check 已通过；隔离 Electron 在 `900x650` 验证左右栏
      双向互斥、全局模块栏常驻、聚焦图片不变、稳定帧无横向滚动，并修复左栏展开时的
      头部控件挤压。


## 2026-10-17 生成配置下拉框统一

- [x] 来源 Prompt、模型、比例、质量复用共享 `Select`，保留原草稿回调与模型能力约束；无模型时禁用选择并显示原配置提示。
- [x] 共享浮层使用触发器下边/上边定位，按可用空间决定方向和最大高度，并限制宽度/横向位置；不改变持久化合同。
- [x] 工作台、共享 Select、i18n 相关 47 项组件测试通过；同批复测上一轮批量栏 12 项通过。Desktop 源码/测试类型检查、定向 ESLint/Prettier、构建通过。
- [x] `pnpm --dir apps/desktop exec playwright test tests/e2e/image-generation-selects.spec.ts --workers=1` 通过：真实 Electron 隔离 profile、1000×720 窗口，四字段选值、菜单与触发器间距、上下/左右边界、Escape 和外部点击关闭；浅/深色截图已检查。未调用生图供应商、未运行完整 release harness。

工作台四字段保留连续声明式 JSX；端到端测试保持同一窗口中依次选值与主题切换的完整流程，允许超过 50 行。共享 Select 继续使用既有 portal/定位实现，未增加新的浮层组件。


## 2026-10-17 工作台入口与方形占位

- [x] 按最新用户确认隐藏生图工作台公共顶栏的 Prompt 搜索和新建，保留侧栏/主题控制与工作台自己的批次工具栏；返回普通 Prompt 页面恢复查询及创建入口。工作台内忽略隐藏的 Prompt 搜索/新建快捷事件。
- [x] 无输出槽位在紧凑/大网格使用 1:1 方框，列表密度仍为 96px 高的列表行，不改变请求比例、数据库或实际生成结果。
- [x] TopBar 29 项、工作台 34 项组件回归通过；测试类型检查、定向 ESLint/Prettier、生产构建通过。`image-generation-workspace-chrome.spec.ts` 真实 Electron 验收通过：1200/900px 窗口、两种网格实测宽高相等，列表行高度保持 96px，工作台隐藏 Prompt 入口且退出后恢复。未执行供应商请求或完整 release harness。

该端到端用例保留同一运行中批次贯穿窗口尺寸和布局切换的完整流程，允许超过 50 行；批次通过公开 API 准备，所有布局与导航通过实际 UI 操作。


## 2026-10-17 大图预览缩放与退出

- [x] 确认点击图片打开的大图预览支持共享缩放、滚轮、还原与拖动，切图/重开复位；通过 body portal 和独立图片滚动区域保留关闭按钮及工具栏。
- [x] Esc 捕获关闭当前查看器，焦点限制在查看器内并在关闭后返回入口；图片加载失败仍可退出。无持久化或 IPC 变更。
- [x] 工作台与共享图片预览 52 项组件测试、测试类型检查、定向 ESLint/Prettier、生产构建通过。`image-generation-preview.spec.ts` 真实 Electron 隔离 profile 验收通过：本地输出实际加载、按钮/滚轮缩放、拖动滚动量、还原、切图复位、900×650 与系统全屏窗口内 400% 居中缩放、关闭按钮可点击、Esc 关闭及焦点返回；两种窗口截图已检查。未执行供应商请求或完整 release harness。

查看器声明式 JSX 保持统一布局，端到端测试保留同一批次下缩放、拖动、切图、小窗口和系统全屏窗口退出的连续流程，允许超过 50 行；共享缩放组件通过可选来源解析器与替代文本同时服务参考图和生成输出。


## 2026-10-17 并发生图与图片复制

- [x] 用户确认默认并发生成：Core 调度器按端点最多 4 路，共享容量并在待执行批次间轮换；renderer 逐张保存与反馈，取消后跳过排队/迟到结果，重试等待旧执行收尾。维持 GenerationLibrary 的串行持久化边界。
- [x] 大图查看器复制图标改为读取当前原图并写入系统图片剪贴板，JPEG/WebP 转 PNG，失败保留预览并提示；其他明确的复制执行 Prompt 入口不变。新增两项文案覆盖 7 语言，无新增 IPC 或数据迁移。
- [x] Core 调度器 2 项、runner/剪贴板服务 23 项、工作台/i18n 41 项定向测试通过；Desktop 测试类型检查、定向 ESLint/Prettier、生产构建通过。`image-generation-concurrency.spec.ts` 在隔离 Electron 中通过真实 UI 发起 4 张请求：本地 HTTP 服务在任何响应前收到全部 4 个请求，乱序返回后仅完成图片可立即审阅，最终持久化 4 张；大图预览复制 PNG 和 JPEG 后读取 Electron 系统剪贴板，与原图逐像素比较一致，覆盖缩放后的原图复制。未调用付费外部模型、未运行完整 release harness。

执行单槽位和批次汇总保留连续错误处理/取消检查，端到端用例保留同一批次从并发请求到原图粘贴的完整流程，允许超过 50 行。


## 2026-10-17 底部图片操作栏常驻

- [x] 用户确认：底栏始终显示，未勾选操作当前预览，勾选后批量操作；空态禁用。取消选择保留当前预览，固定高度避免画布跳动。操作统一图标，单图复制原图，多图时禁用复制并解释。
- [x] 工作台/i18n 42 项测试、测试类型检查、定向 ESLint/Prettier、生产构建通过。`image-generation-preview.spec.ts` 真实 Electron 验收通过：未勾选时底栏可见，勾选两张与取消选择前后预览高度一致，取消选择保留第二张预览，收藏写入当前图片；常驻底栏截图已检查，同时回归缩放、拖动、小窗口及全屏退出。未运行完整 release harness。

声明式底栏 JSX 保持同一组件中完整呈现五个平行动作，允许超过 50 行；操作目标由工作台既有选择/聚焦输出派生，无新增存储或 IPC。

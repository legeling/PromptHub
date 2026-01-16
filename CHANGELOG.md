## [0.3.8] - 2026-01-15

### 新功能 / Added

- ✨ **JSON 输出支持**：AI 测试新增 JSON Mode 和 JSON Schema 输出格式支持，满足结构化数据生成需求
  - **Output Format Support**: Added support for JSON Mode and JSON Schema output formats in AI test, enabling structured data generation
- ⚡️ **英文模式优化**：在英文界面下自动精简 UI，隐藏不必要的"英文版"切换按钮
  - **English UI Optimization**: Automatically hides redundant "English Version" toggle buttons when using the English interface

### 修复 / Fixed

- 🐛 **WebDAV 修复**：修复同步过程中可能导致 WebDAV 用户名和密码丢失的问题
  - **WebDAV Credential Fix**: Fixed issues where WebDAV credentials could be lost during sync operations
- 🐛 **设置记忆修复**：修复窗口关闭行为设置（最小化/退出）无法持久化保存的问题
  - **Close Action Persistence**: Fixed issue where window close behavior preference (minimize/quit) was not saved
- 🐛 **API 路径修复**：修复部分非标准 API 路径在获取模型列表时报 404 的问题
  - **Model Fetch Logic**: Fixed 404 errors when fetching model lists from non-standard API endpoints
- 🌍 **国际化优化**：修复多处未翻译的文本和 fallback 逻辑
  - **i18n Polish**: Fixed various missing translations and fallback behaviors

## [0.3.7] - 2026-01-13

### 新功能 / Added

- �️ **调试模式**：在"关于"页面新增开发者调试模式，开启后支持快捷键唤起控制台 (Ctrl+Shift+I)
  - **Debug Mode**: Added developer debug mode in About page with shortcut support
- 🧩 **侧边栏导航优化**：将顶部导航项整合为分段控制器，节省空间并优化视觉体验
  - **Sidebar Compact Nav**: Consolidated top navigation items into a segmented control for better space efficiency
- �📋 **看板/Bento 视图模式**：新增 Kanban 视图，支持响应式 Bento 网格布局，支持 2-4 列自由切换
  - **Kanban/Bento View**: Added a new Kanban view with responsive Bento grid layout
- 📌 **Prompt 置顶对比**：支持置顶多个 Prompt 到顶部独立区域，支持一键全部展开/收起
  - **Pinned Comparison**: Pin multiple prompts to a dedicated top section with quick "Expand/Collapse All" actions

### 优化 / Improvements

- 🍎 **macOS 全屏适配**：优化侧边栏在 macOS 全屏模式下的布局，自动隐藏红绿灯占位符
  - **macOS Fullscreen Layout**: Optimized sidebar layout in fullscreen mode by hiding traffic light placeholder
- 🎨 **UI 细节优化**：修复侧边栏按钮宽度对齐问题；修复弹窗操作按钮间距过大的问题
  - **UI Polish**: Fixed sidebar button alignment; fixed excessive button spacing in headers
- 🔗 **变量输入体验**：将变量图标从 `(x)` 替换为 `{}` (Braces)，消除视觉歧义
  - **Variable Input UX**: Replaced ambiguous `Variable` icon with `Braces`
- 📂 **属性字段归集**：将 "来源" 和 "备注" 字段逻辑归类
  - **Attribute Grouping**: Grouped "Source" and "Notes" fields for better hierarchy

### 修复 / Fixed

- 🍎 **macOS Intel 启动修复**：修复 macOS Intel 版本启动后白屏/无响应的问题，原因是 `better-sqlite3` 原生模块未针对 Electron 编译 (closes #35)
  - **macOS Intel Launch Fix**: Fixed blank screen on macOS Intel caused by `better-sqlite3` ABI mismatch with Electron
- 🚀 **自动更新修复**：禁用 NSIS 增量更新包，解决 Windows 平台更新时 SHA512 不匹配的问题
  - **Auto-update Fix**: Disabled NSIS differential packages to resolve SHA512 mismatch errors on Windows
- 🐛 **Lint 修复**：修复 GitHub Action 中的上下文访问校验警告
  - **Workflow Lint**: Fixed context access validation warnings in GitHub Actions

## [0.3.6] - 2026-01-07

### 新功能 / Added

- 🎥 **Prompt 视频预览**：支持为 Prompt 添加视频预览，适用于视频生成类 Prompt，支持 MP4/WebM/MOV 格式
  - **Prompt Video Preview**: Support generating video previews for prompts, suitable for video generation prompts (MP4/WebM/MOV)
- 📤 **视频文件支持**：支持上传、播放本地视频文件，均由本地加密存储
  - **Video File Support**: Support upload and playback of local video files, securely stored locally
- ☁️ **视频同步**：WebDAV 同步现已包含视频文件
  - **Video Sync**: WebDAV sync now includes video files

### 优化 / Improvements

- ⚡️ **Modal 动画加速**：大幅提升所有弹窗的打开/关闭速度，优化过渡体验
  - **Faster Modals**: Significantly improved modal animation speed for snappier interactions
- 🎨 **UI 一致性**：统一创建与编辑界面的按钮样式，添加保存图标
  - **UI Consistency**: Standardized button styles and icons across create/edit modals
- 🌍 **国际化完善**：补全法语、德语、西班牙语、日语、繁体中文的缺失翻译
  - **i18n Complete**: Added missing translations for FR, DE, ES, JA, and ZH-TW
- 🔄 **过渡动画优化**：优化从详情页到编辑页的切换动画，消除视觉跳动
  - **Transition Polish**: Smoother transition between detail and edit modals

### 修复 / Fixed

- 🎨 **下拉菜单 UI 优化**：修复新建下拉菜单的选中样式问题，采用悬浮圆角设计
  - **Dropdown UI Polish**: Fixed selection style in create dropdown with floating rounded design
- 🐛 **WebDAV 解析修复**：修复 manifest.json 解析错误问题，增强跨平台兼容性
  - **WebDAV Parse Fix**: Fixed manifest.json parsing error for better cross-platform compatibility
- 🐛 **更新检测修复**：修复 macOS 和 Windows ARM64 平台的更新检测逻辑
  - **Updater Fix**: Fixed update detection logic for macOS and Windows ARM64

---

## [0.3.5] - 2026-01-05

### 新功能 / Added

- 🚀 **新建按钮优化**：采用 Split Button 设计，支持持久化记忆上一次使用的新建模式（手动或快速录入），提升操作效率
  - **New Button Redesign**: Split button with persistent memory for preferred mode (Manual/Quick Add)
- 🤖 **快速录入 AI 标签识别**：快速录入时 AI 会从现有标签库中智能识别并提取匹配标签，保持数据一致性
  - **AI Tag Recognition**: Quick add mode now automatically identifies and matches existing tags using AI
- 📂 **智能文件夹分类**：快速录入新增 “AI 智能分类” 选项，让 AI 自动推荐最合适的存储位置
  - **AI Smart Categorization**: Added "AI Smart Match" option to automatically organize prompts into folders
- 📝 **来源记录**：新增"来源"字段，可记录 Prompt 的出处（如网站、书籍等），并支持历史自动补全
  - **Source Tracking**: New "Source" field to record where prompts came from (URL, book, etc.) with autocomplete history
- ⚡ **快速添加弹窗**：新增独立的快速添加组件，支持一键粘贴 Prompt 并由 AI 自动分析生成标题、描述、标签
  - **Quick Add Modal**: New standalone component for pasting prompts with AI-powered auto-analysis

### 修复 / Fixed

- 📁 **文件夹图标渲染**：修复了新建、编辑和快速录入弹窗中文件夹图标无法正确渲染的问题
  - **Folder Icon Fix**: Corrected folder icons not rendering in modal select lists
- 🎨 **表格滑动遮挡**：修复 Prompt 列表在横向滚动时操作列重叠与透明度问题，优化视觉层级
  - **Table Scrolling Fix**: Resolved z-index and transparency issues for sticky 'Actions' column during horizontal scroll
- 🌐 **多语言缺失**：补齐了快速录入功能相关的多语言翻译键值
  - **i18n Update**: Added missing localization keys for New Button modes and Smart Categorization
- 📏 **表格列宽调整**：修复了表格视图中部分列无法拖拽调整宽度的问题
  - **Column Resize Fix**: Fixed column resize handles being blocked by adjacent columns and sticky action column

### 优化 / Changed

- ⚡ **性能优化**：优化了 TopBar 组件中的 Hook 调用，解决了因条件渲染 Hook 导致的 React 渲染报错
  - **Hook Usage Optimization**: Refactored component hooks for consistent rendering and improved stability
- 🔧 **配置持久化改进**：表格列配置现在只保存用户可自定义的属性，关键属性始终使用默认值
  - **Config Persistence Improvement**: Table column config now only persists user-customizable properties
- 🎯 **拖拽手柄优化**：增大拖拽区域、提高 z-index、优化悬停视觉反馈，使列宽调整更易用
  - **Resize Handle UX**: Larger hit area, higher z-index, better hover feedback for column resizing

---

## [0.3.4] - 2025-12-29

### 修复 / Fixed

- 🧭 **Prompt 预览恢复**：卡片模式点击即可正常选中并在右侧预览/编辑
  - **Prompt Preview Restored**: Card view selection now opens preview/editor as expected
- 🤖 **Gemini 测试连接**：修正模型名与参数兼容，避免 API 400
  - **Gemini Test Fix**: Normalized model name/params to avoid 400 errors

### 优化 / Changed

- 🚫 **列表拖拽禁用**：Prompt 列表不再可拖动，避免误操作
  - **Disable Prompt Dragging**: Removed unintended drag behavior in prompt list
- ⌨️ **快捷键提示样式统一**：与 AI 模式提示一致，视觉更统一
  - **Shortcut Tips Style**: Unified tips styling with AI mode
- 🏷️ **标签区默认高度**：默认展示 3 行标签并升级旧设置
  - **Default Tag Height**: Show ~3 rows by default with migration for older settings
- 📦 **发布流程修复**：清理多余 blockmap，修正 Windows 更新通道与 latest 文件
  - **Release Pipeline Fix**: Cleaned extra blockmap and fixed Windows update channel/metadata

---

## [0.3.3] - 2025-12-27

### 新功能 / Added

- 📂 **多层级文件夹支持**：支持文件夹多级嵌套，通过拖拽即可轻松管理复杂的目录结构 (Closes #14)
  - **Multi-level Folder Support**: Added support for multi-level folder nesting with intuitive drag-and-drop management (Closes #14)
- 🚀 **GitHub 镜像源加速**：新增多个 GitHub 加速镜像源，显著提升国内用户下载更新的速度
  - **GitHub Mirror Support**: Added multiple GitHub accelerator mirrors to significantly speed up update downloads for users in restricted regions

### 修复 / Fixed

- 🤖 **模型修复**：适配 Google Gemini API 的原生响应格式，修复无法获取模型列表的问题 (#24)
  - **Model API Fix**: Adapted to native API response format, fixing model list fetching issues (#24)
- 🎨 **文件夹交互修复**：修复鼠标移入侧边栏时所有文件夹操作按钮同时显示的 UI 问题
  - **UI Interaction Fix**: Fixed issue where all folder action buttons were displayed simultaneously on sidebar hover
- 🌐 **多语言完善**：同步并补全了日、繁中、德、法、西语中缺失的翻译键值
  - **i18n Completion**: Synchronized and completed missing translation keys for JA, ZH-TW, DE, FR, and ES

### 优化 / Changed

- 🔧 **TypeScript 类型增强**：修复多处 TS 类型错误，提升代码健壮性
  - **TS Type Enhancement**: Fixed multiple TypeScript errors for better code stability

---

## [0.3.2] - 2025-12-22

### 优化 / Changed

- 🔍 **搜索展示优化**：优化搜索结果展示逻辑，提升搜索体验
  - **Search Display Optimization**: Improved search results display logic for better user experience
- 🎨 **文件夹图标扩展**：文件夹图标选择器新增 60+ Lucide 图标，支持 Emoji/Icon 双模式切换
  - **Folder Icon Expansion**: Added 60+ Lucide icons with Emoji/Icon mode switcher
- 📂 **侧边栏布局优化**：文件夹少时标签紧跟文件夹，文件夹多时标签固定底部，滚动条隐藏
  - **Sidebar Layout Optimization**: Tags follow folders when few, fixed at bottom when many, hidden scrollbar
- 🗑️ **删除文件夹确认**：删除包含 Prompt 的文件夹时，弹出自定义确认对话框，支持仅删除文件夹或删除所有内容
  - **Folder Deletion Confirmation**: Custom dialog when deleting folders with prompts, choose to keep or delete contents
- ⚠️ **文件夹名称检测**：创建文件夹时检测重复名称，弹出确认对话框
  - **Duplicate Name Detection**: Warns when creating folders with existing names

---

## [0.3.1] - 2025-12-20

### 优化 / Changed

- 🔍 **搜索体验优化**：引入权重评分机制，优先匹配标题，大幅提升搜索准确度 (Closes #18)
  - **Search Logic Improvement**: Introduced weighted scoring system prioritizing title matches for better accuracy (Closes #18)
- 🤖 **预制供应商优化**：核对并修正所有预制 AI 供应商地址，确保默认连接通用 (Closes #19)
  - **Preset Providers Fix**: Verified and corrected all preset AI API endpoints for better connectivity (Closes #19)
- 🎨 **分类图标识别**：优化模型列表的供应商图标识别逻辑，支持识别手动添加的模型
  - **Icon Recognition**: Improved icon detection logic for manually added models in the settings list
- 📝 **API 地址提示**：在输入框增加 # 禁用自动填充的引导提示，操作更透明
  - **API URL Hint**: Added guidance for using '#' to disable auto-fill in API endpoint settings

---

## [0.3.0] - 2025-12-18

### 优化 / Changed

- 🔄 **检查更新优化**：点击检查更新都会真正发起请求，不再使用缓存
  - **Update Check Improvement**: Every manual check now forces a fresh request without caching
- ⏰ **周期性检查更新**：启用自动检查后，每小时自动检查一次新版本
  - **Periodic Update Check**: Auto-check runs every hour when enabled
- 🎨 **更新提示样式优化**：移除闪烁动画，使用主题色虚线边框，与新建按钮增加间距
  - **Update Indicator Style**: Removed pulse animation, uses theme color with dashed border
- 📐 **更新对话框增大**：对话框尺寸从 max-w-md 增大到 max-w-xl，更新日志区域更大
  - **Larger Update Dialog**: Increased dialog size for better readability
- 📝 **精确版本更新日志**：更新日志现在精确显示从当前版本到新版本区间内的所有更新内容
  - **Precise Changelog**: Release notes now show all changes between current and new version

---

## [0.2.9] - 2025-12-18

### 新功能 / Added

- 📌 **Prompt 置顶功能**：支持将重要 Prompt 置顶显示，置顶项始终排在列表最前面
  - **Prompt Pinning**: Pin important prompts to the top of the list for quick access
- ✨ **切换动画**：Prompt 列表和详情区域添加平滑过渡动画，提升视觉体验
  - **Transition Animations**: Added smooth animations when switching prompts and views

### 优化 / Changed

- 🔒 **Windows 单实例模式**：防止多开应用窗口，从托盘恢复时聚焦已有窗口
  - **Windows Single Instance**: Prevents multiple app windows; focuses existing window when restoring from tray
- 🎨 **设置页面按钮间距**：优化设置菜单按钮间距，视觉更舒适
  - **Settings Button Spacing**: Improved spacing between settings menu buttons
- 🖼️ **关于页面图标**：移除图标阴影，更简洁
  - **About Page Icon**: Removed shadow for cleaner appearance
- 📝 **排序文案简化**：将"最新优先"简化为"最新"，更自然
  - **Sort Labels**: Simplified "Newest First" to "Newest" for cleaner UI

---

## [0.2.8] - 2025-12-18

### 新功能 / Added

- 🔔 **顶栏更新提醒入口**：在搜索框右侧以轻量提示展示可用更新，点击后才打开更新对话框
  - **Top-bar Update Indicator**: Shows a subtle "update available" pill next to the search bar and opens the dialog on demand

### 优化 / Changed

- 🍎 **macOS 升级逻辑调整**：下载完成后自动打开下载目录，引导用户手动安装并提供操作步骤
  - **macOS Update Flow**: Opens the Downloads folder after downloading so users can manually install unsigned builds
- 🌐 **更新对话框补充手动下载入口**：自动更新失败时直接给出 GitHub Releases 按钮，方便用户自行下载
  - **Manual Download Button**: Update dialog now links to GitHub Releases whenever auto-update fails

### 修复 / Fixed

- 🖼️ **本地图片占位与错误处理**：新增 `LocalImage` 组件并应用于详情/主内容，避免因文件缺失导致 ERR_FILE_NOT_FOUND
  - **Local Image Fallback**: Added `LocalImage` component with graceful degradation to prevent ERR_FILE_NOT_FOUND when images are missing

---

## [0.2.7] - 2025-12-16

### 新功能 / Added

- ⌨️ **全局快捷键功能**：支持自定义快捷键唤起应用、新建 Prompt、搜索、打开设置
  - **Global Shortcuts**: Customize hotkeys for showing app, new prompt, search, and settings
- ⌨️ **快捷键冲突检测**：自动检测并提示快捷键冲突
  - **Shortcut Conflict Detection**: Automatically detect and warn about conflicting shortcuts
- ⌨️ **跨平台适配**：快捷键显示自动适配 Windows/macOS/Linux
  - **Cross-platform Support**: Shortcut display adapts to Windows/macOS/Linux
- 🎨 **生图模型扩展**：新增 Google Gemini (Nano Banana) 和 Stability AI 图像生成模型
  - **Image Models**: Added Google Gemini (Nano Banana) and Stability AI image generation models
- 💾 **未保存更改提醒**：编辑 Prompt 时关闭会提示保存、放弃或取消
  - **Unsaved Changes Dialog**: Prompt to save, discard, or cancel when closing editor

### 优化 / Changed

- 🎨 图片下载失败使用自定义 Toast 提示替代系统弹窗
  - Image download failure now uses custom Toast instead of system alert
- 🌐 完善多语言翻译（快捷键相关的中/英/日/德/法/西/繁体中文）
  - Improved i18n translations for shortcuts in all supported languages

---

## [0.2.6] - 2025-12-15

### 新功能 / Added

- 🎨 **显示设置升级**：更现代的外观 UI + 更细腻的动效，并支持自定义主题色
  - **Display Settings Upgrade**: Modern UI with smoother animations and custom theme colors
- 🧰 **数据管理升级**：选择性导出（仅导出）+ 全量备份/恢复（`.phub.gz` 压缩，包含 prompts/图片/AI 配置/系统设置）
  - **Data Management Upgrade**: Selective export + full backup/restore (`.phub.gz` compressed, includes prompts/images/AI config/settings)
- ☁️ **WebDAV 同步升级**：同步范围扩展到 AI 配置与系统设置，换设备可更接近"一模一样"
  - **WebDAV Sync Upgrade**: Extended sync scope to AI config and system settings
- ☁️ **WebDAV 增量备份**：只上传有变化的文件，大幅减少流量消耗
  - **WebDAV Incremental Backup**: Only upload changed files, significantly reducing bandwidth
- 🔐 **支持 AES-256 加密备份**（实验性）
  - **AES-256 Encrypted Backup** (experimental)

### 修复 / Fixed

- 🐛 修复语言设置被错误重置为"仅中/英"导致多语言不生效的问题
  - Fixed language settings being incorrectly reset causing i18n issues
- 🐛 修复开启"流式输出 / 思考模式"后 AI 测试无表现差异的问题
  - Fixed AI test not showing streaming/thinking mode differences
- 🐛 修复多模型对比在卡片视图下未传入流式回调导致不流式的问题
  - Fixed multi-model compare not streaming in card view
- 🐛 修复变量检测正则状态问题导致 `systemPrompt` 变量未被识别
  - Fixed variable detection regex issue causing systemPrompt variables not recognized
- 🐛 修复 Windows 关闭窗口弹窗只显示一次的问题
  - Fixed Windows close dialog only showing once
- 🐛 修复部分页面缺少 React Hooks 导入导致的运行时报错/白屏问题
  - Fixed runtime errors/white screen due to missing React Hooks imports
- 🐛 修复右键菜单"取消收藏"多语言翻译缺失问题
  - Fixed missing i18n for "Unfavorite" in context menu
- 🐛 修复右键菜单点击"AI 测试"后黑屏问题
  - Fixed black screen after clicking "AI Test" in context menu
- 🐛 修复右键菜单"查看详情"翻译键名错误问题
  - Fixed wrong translation key for "View Details" in context menu
- 🐛 修复 WebDAV 同步失败问题 (#11)
  - Fixed WebDAV sync failure (#11)

### 优化 / Changed

- 🎨 Windows 关闭窗口弹窗的"记住偏好"勾选框改为自定义样式并适配暗黑模式
  - Custom styled "Remember choice" checkbox with dark mode support
- 📝 补齐多语言 README（en/de/fr/es/ja/zh-TW）内容结构与关键信息
  - Completed multi-language README (en/de/fr/es/ja/zh-TW)
- ☁️ 修复 WebDAV 在开发模式下的 CORS 问题（通过主进程 IPC 绕过）
  - Fixed WebDAV CORS issue in dev mode (bypassed via main process IPC)
- ☁️ 优化 WebDAV 上传兼容性（添加 Content-Length 头以支持坚果云等服务）
  - Improved WebDAV upload compatibility (added Content-Length header)
- 🎨 WebDAV 测试连接按钮添加旋转加载动画
  - Added spinning animation to WebDAV test connection button

---

## [0.2.5] - 2025-12-12

### 新功能 / Added

- 🌐 **添加多语言支持**（简体中文、繁体中文、英文、日语、西班牙语、德语、法语）
  - **Multi-language Support** (Simplified Chinese, Traditional Chinese, English, Japanese, Spanish, German, French)
- 🪟 **Windows 关闭窗口时可选择最小化到托盘或退出**（支持记住选择）
  - **Windows Close Action**: Choose minimize to tray or exit (with remember option)
- 💬 **关于页面添加问题反馈 Issue 按钮**
  - **About Page**: Added issue feedback button
- 🌍 **初始化数据根据用户语言自动选择对应语言版本**
  - **Auto Language Detection**: Initialize data based on user language
- 📥 **README 添加快速下载表格**，支持 Windows/macOS/Linux 各架构一键下载
  - **README Download Table**: Quick download for Windows/macOS/Linux
- 🔔 **优化软件更新功能**，支持 Markdown 渲染 Release Notes
  - **Update Feature**: Markdown rendering for Release Notes
- 🚀 **启动时自动检查更新**（可在设置中关闭）
  - **Auto Update Check**: Check for updates on startup (can be disabled)

### 优化 / Changed

- 🎨 双语对照提示文案优化，不再硬编码"中英"
  - Improved bilingual prompt text, no longer hardcoded "Chinese/English"

### 修复 / Fixed

- ☁️ 修复坚果云 WebDAV 同步失败问题（添加 MKCOL 目录创建和 User-Agent 头）
  - Fixed Nutstore WebDAV sync failure (added MKCOL and User-Agent header)

---

## [0.2.4] - 2025-12-10

### 新功能 / Added

- 🌐 **支持双语提示词**（中英文版本），详情页可切换显示
  - **Bilingual Prompts**: Support Chinese/English versions with toggle in detail view
- 📋 **复制和 AI 测试操作会根据当前语言模式使用对应版本**
  - **Language-aware Copy/Test**: Use corresponding version based on current language mode

### 优化 / Changed

- 🎨 优化视图切换动画，添加平滑淡入淡出效果 (Closes #13)
  - Improved view switch animation with smooth fade effect (Closes #13)
- 🎨 视图切换按钮添加滑动指示器动画
  - Added sliding indicator animation to view switch buttons

---

## [0.2.3] - 2025-12-10

### 修复 / Fixed

- 🐛 修复 Windows 删除 Prompt 后输入框无法输入的问题（原生 confirm 对话框焦点丢失）
  - Fixed Windows input focus lost after deleting Prompt (native confirm dialog issue)
- 🐛 修复 Windows 托盘图标显示为透明的问题
  - Fixed Windows tray icon showing as transparent
- 🐛 修复打包后关于页面图标不显示的问题
  - Fixed About page icon not showing after packaging
- 🐛 修复自动更新模块加载失败的问题（改为静态导入）
  - Fixed auto-update module loading failure (changed to static import)
- 🐛 修复新建 Prompt 时选择文件夹后保存丢失的问题
  - Fixed folder selection lost when creating new Prompt
- 🐛 修复 CI/CD 构建失败问题（EEXIST: file already exists）
  - Fixed CI/CD build failure (EEXIST: file already exists)

### 优化 / Changed

- 🎨 使用自定义确认对话框替代原生 confirm，提升 Windows 兼容性
  - Custom confirm dialog replacing native confirm for better Windows compatibility
- 🎨 优化托盘图标加载逻辑，添加备用路径
  - Improved tray icon loading with fallback paths
- 🎨 新建 Prompt 时默认选择当前所在文件夹
  - Default to current folder when creating new Prompt
- 🌐 修复"上传"按钮多语言适配
  - Fixed "Upload" button i18n

---

## [0.2.2] - 2025-12-08

### 修复 / Fixed

- 🐛 修复关于页面版本号硬编码问题（现在动态获取）
  - Fixed hardcoded version in About page (now dynamically fetched)
- 🐛 修复关于页面图标显示异常
  - Fixed About page icon display issue
- 🐛 修复检查更新功能失效（`cannot set properties of undefined`）
  - Fixed update check failure (`cannot set properties of undefined`)
- 🐛 修复自动更新模块加载失败时的错误处理
  - Fixed error handling when auto-update module fails to load

### 优化 / Changed

- 🎨 更新失败时显示手动下载链接
  - Show manual download link when update fails
- 🔒 清除数据现在需要输入主密码验证（高危操作保护）
  - Clear data now requires master password verification (high-risk operation protection)

---

## [0.2.1] - 2025-12-07

### 新功能 / Added

- ✨ **Markdown 全场景预览**：列表视图、详情弹窗、编辑弹窗均支持 Markdown 渲染与代码高亮
  - **Full Markdown Preview**: List view, detail modal, edit modal all support Markdown rendering with code highlighting
- ✨ **主密码与安全设置**：支持设置应用级主密码，锁定/解锁状态管理
  - **Master Password & Security**: App-level master password with lock/unlock management
- ✨ **私密文件夹（Beta）**：支持将文件夹设为私密，需主密码解锁后方可操作
  - **Private Folders (Beta)**: Set folders as private, requires master password to access
- ✨ **编辑体验优化**：编辑弹窗支持"编辑/预览"模式切换，支持全屏/宽屏模式
  - **Enhanced Editing**: Edit/Preview mode toggle, fullscreen/widescreen support
- ✨ **标签排序**：标签列表自动按字母/拼音排序
  - **Tag Sorting**: Tags auto-sorted alphabetically/by pinyin
- ✨ **图片上传与预览**：支持上传/粘贴本地图片，并在弹窗内预览
  - **Image Upload & Preview**: Upload/paste local images with in-modal preview

### 优化 / Changed

- 🔧 **Qwen/通义千问兼容**：修复非流式调用时的 `enable_thinking` 参数报错问题
  - **Qwen Compatibility**: Fixed `enable_thinking` parameter error in non-streaming calls
- 🔧 **UI 细节**：修复编辑弹窗全屏遮挡左上角按钮的问题
  - **UI Fix**: Fixed fullscreen modal covering top-left buttons
- 🔧 **性能优化**：优化 Markdown 渲染性能与依赖配置
  - **Performance**: Optimized Markdown rendering performance

---

## [0.2.0] - 2025-12-03

### 新功能 / Added

- ✨ **列表视图模式**：表格式展示所有 Prompt，支持横向滚动和分页
  - **List View Mode**: Table display for all Prompts with horizontal scroll and pagination
- ✨ **批量操作**：支持多选后批量收藏、移动到文件夹、删除
  - **Batch Operations**: Multi-select for batch favorite, move to folder, delete
- ✨ **AI 测试结果持久化**：每个 Prompt 保留最后一次测试结果
  - **AI Test Persistence**: Each Prompt keeps last test result
- ✨ **排序功能**：支持按时间、标题、使用次数排序
  - **Sorting**: Sort by time, title, usage count
- ✨ **视图切换**：卡片视图/列表视图一键切换
  - **View Toggle**: One-click switch between card/list view
- ✨ **详情弹窗显示 AI 响应**
  - **Detail Modal**: Shows AI response

### 优化 / Changed

- 🎨 全新列表视图 UI（圆角设计、美观的多选框、悬浮提示）
  - New list view UI (rounded design, beautiful checkboxes, hover tips)
- 🎨 分离单模型/多模型测试的 loading 状态
  - Separated single/multi-model test loading states
- 🎨 AI 测试弹窗支持变量填充
  - AI test modal supports variable filling

---

## [0.1.9] - 2025-12-01

### 新功能 / Added

- ✨ **AI 模型分类图标**：使用本地 SVG/PNG 资源，展示真实提供商 Logo
  - **AI Model Icons**: Local SVG/PNG resources showing real provider logos
- ✨ **Prompt 版本历史弹窗国际化** & 加宽展示，阅读体验更好
  - **Version History i18n**: Internationalized and widened for better reading

### 优化 / Changed

- 🔧 修复 Linux 打包缺少 author.email 导致构建失败
  - Fixed Linux build failure due to missing author.email
- 🔧 完整支持 macOS / Windows 自动更新增量包（dmg/zip/exe + blockmap）
  - Full support for macOS/Windows auto-update delta packages
- 🔧 更新弹窗支持纯文本 Release Notes、错误信息自动换行
  - Update modal supports plain text Release Notes with auto line wrap
- 🔧 修复检查更新弹窗每次打开都会重新请求的问题
  - Fixed update check modal re-requesting on every open

---

## [0.1.8] - 2025-12-01

### 新功能 / Added

- ✨ **最小化到系统托盘功能**（Windows/macOS/Linux）
  - **Minimize to System Tray** (Windows/macOS/Linux)
- ✨ **数据目录路径可点击打开**
  - **Clickable Data Directory Path**
- ✨ **编辑器支持行号显示**
  - **Editor Line Numbers**
- ✨ **新增 Linux 平台支持**（AppImage/deb）
  - **Linux Support** (AppImage/deb)
- ✨ **AI 模型动态获取**（从供应商 API 获取可用模型列表）
  - **Dynamic AI Model Fetching** (from provider API)
- ✨ **模型选择弹窗**（支持搜索、分类、批量添加）
  - **Model Selection Modal** (search, categorize, batch add)
- ✨ **多模型测试**

一键对比国内外主流大语言模型的回复质量，快速找到最佳 Prompt。

- **Multi-Model Testing**

Compare mainstream LLMs side-by-side to identify the best prompt for your needs.

- ✨ **模型分类图标**（每个类别显示对应的 SVG 图标）
  - **Category Icons** (SVG icon for each category)
- ✨ **API URL 智能预览**（自动补全 /v1/chat/completions）
  - **Smart API URL Preview** (auto-complete /v1/chat/completions)
- ✨ **已添加模型按供应商分组折叠显示**
  - **Collapsible Model Groups by Provider**

### 优化 / Changed

- 🎨 变量输入框支持自动变高（多行文本输入更友好）
  - Variable input auto-height for multi-line text
- 🎨 优化 macOS 托盘图标显示
  - Improved macOS tray icon display
- 🎨 AI 测试状态按 Prompt 独立管理（切换 Prompt 不影响测试）
  - AI test state managed per Prompt
- 🎨 测试结果持久化（切换 Prompt 后结果保留）
  - Test results persist when switching Prompts
- 🔧 检查更新支持多次点击
  - Update check supports multiple clicks
- 🔧 修复通知功能图标路径问题
  - Fixed notification icon path issue

---

## [0.1.7] - 2025-11-30

### 新功能 / Added

- ✨ **AI 测试支持变量填充**（与复制功能一致的体验）
  - **AI Test Variable Filling** (same experience as copy)
- ✨ **多模型对比支持变量填充**
  - **Multi-Model Compare Variable Filling**

### 优化 / Changed

- 🎨 深色模式主题色增强（提高饱和度和可见度）
  - Enhanced dark mode theme colors (increased saturation and visibility)
- 🎨 优化开关按钮深色模式样式（添加边框和更好的对比度）
  - Improved toggle button dark mode style (border and better contrast)
- 🎨 AI 测试按钮改用主题色
  - AI test button uses theme color
- 🎨 关于页面图标美化
  - Beautified About page icon
- 🔧 移除语言设置的"立即刷新"按钮（语言切换已即时生效）
  - Removed "Refresh Now" button (language switch takes effect immediately)

---

## [0.1.6] - 2025-11-30

### 优化 / Changed

- 🔧 修复自动更新元数据文件缺失问题（CI 上传 latest-mac.yml）
  - Fixed missing auto-update metadata file (CI uploads latest-mac.yml)
- 🔧 优化 Release 说明格式
  - Improved Release notes format

---

## [0.1.5] - 2025-11-30

### 新功能 / Added

- ✨ **变量填充界面**（复制时自动检测变量，弹出填充界面）
  - **Variable Filling UI** (auto-detect variables when copying, show filling dialog)

### 优化 / Changed

- 🎨 文件夹选择下拉框改用自定义样式组件
  - Custom styled folder selection dropdown
- 🎨 编辑/新建 Prompt 弹窗加宽
  - Widened Edit/Create Prompt modal
- 🔧 修复版本对比问题（当前版本加入版本列表）
  - Fixed version compare (current version added to version list)
- 🔧 生产环境禁止打开开发者工具
  - Disabled DevTools in production

---

## [0.1.4] - 2025-11-30

### 新功能 / Added

- ✨ **多模型配置管理**（支持添加无限数量的 AI 模型）
  - **Multi-Model Config** (support unlimited AI models)
- ✨ **多模型对比改为选择模式**（从已配置模型中选择）
  - **Multi-Model Compare Selection Mode** (select from configured models)
- ✨ **自定义下拉选择框组件**（优化原生样式）
  - **Custom Dropdown Component** (improved native style)
- ✨ **全面国际化支持**（主页、编辑器、弹窗等全部适配多语言）
  - **Full i18n Support** (home, editor, modals all internationalized)
- ✨ **应用内自动更新**（检查、下载、安装一体化）
  - **In-App Auto Update** (check, download, install integrated)

### 优化 / Changed

- 🎨 Prompt 卡片压缩（移除时间和版本显示）
  - Compressed Prompt cards (removed time and version display)
- 🎨 多模型对比按钮移至右侧
  - Moved multi-model compare button to right
- 🎨 优化 README 文档和截图展示
  - Improved README documentation and screenshots
- 🔧 修复 MAC 顶部区域无法拖动窗口问题（整个顶部栏可拖动）
  - Fixed MAC top area window drag issue (entire top bar draggable)
- 🔧 修复语言设置显示不同步问题
  - Fixed language settings display sync issue
- 🔧 修复切换 Prompt 时对比结果残留问题
  - Fixed compare results persisting when switching Prompts
- 🔧 移除 macOS zip 构建包，只保留 dmg
  - Removed macOS zip build, keeping only dmg

---

## [0.1.3] - 2025-11-29

### 新功能 / Added

- ✨ **AI 模型配置**（支持 18+ 国内外服务商）
  - **AI Model Config** (supports 18+ domestic and international providers)
- ✨ **AI 连接测试功能**（异步测试，显示响应时间）
  - **AI Connection Test** (async test with response time display)
- ✨ **AI 模型对比测试**（并行测试多个模型效果）
  - **AI Model Compare Test** (parallel test multiple models)
- ✨ **图像生成模型支持**（DALL-E 3 等）
  - **Image Generation Model Support** (DALL-E 3 etc.)
- ✨ **完整的多语言支持**（设置页面全面国际化）
  - **Full i18n Support** (settings page fully internationalized)
- ✨ **Git 风格版本对比**（行级差异、添加/删除统计）
  - **Git-style Version Compare** (line-level diff, add/delete stats)

### 优化 / Changed

- 🎨 优化设置页面 UI
  - Improved settings page UI
- 🔧 移除 Prompt 卡片拖拽（修复点击问题）
  - Removed Prompt card drag (fixed click issue)

---

## [0.1.2] - 2025-11-29

### 新功能 / Added

- ✨ **WebDAV 同步功能**（上传/下载数据到远程服务器）
  - **WebDAV Sync** (upload/download data to remote server)
- ✨ **文件夹拖拽排序**
  - **Folder Drag Sort**
- ✨ **Prompt 拖拽到文件夹**
  - **Drag Prompt to Folder**
- ✨ **新建 Prompt 时可选择文件夹**
  - **Folder Selection When Creating Prompt**
- ✨ **版本恢复确认提示**
  - **Version Restore Confirmation**

### 优化 / Changed

- 🎨 修复深色模式下开关按钮不可见问题
  - Fixed toggle button invisible in dark mode
- 🎨 设置开关添加操作反馈提示
  - Added feedback toast for settings toggles
- 🎨 优化语言切换体验（添加刷新按钮）
  - Improved language switch experience (added refresh button)
- 🔧 开机自启动功能实现
  - Implemented auto-launch on startup

---

## [0.1.1] - 2025-11-29

### 新功能 / Added

- ✨ **文件夹创建/编辑/删除功能**
  - **Folder Create/Edit/Delete**
- ✨ **标签筛选功能**
  - **Tag Filtering**
- ✨ **检查更新功能**
  - **Check for Updates**
- ✨ **Windows 自定义标题栏**
  - **Windows Custom Title Bar**

### 优化 / Changed

- 🎨 扁平化 UI 设计
  - Flat UI design
- 🎨 移除卡片阴影和缩放效果
  - Removed card shadow and scale effects
- 🔧 WebDAV 同步配置界面
  - WebDAV sync configuration UI

---

## [0.1.0] - 2025-11-29

### 新功能 / Added

- 🎉 **首次发布** / **Initial Release**
- ✨ **Prompt CRUD 管理** / **Prompt CRUD Management**
- ✨ **文件夹和标签系统** / **Folder and Tag System**
- ✨ **收藏功能** / **Favorites**
- ✨ **版本历史** / **Version History**
- ✨ **数据导入导出** / **Data Import/Export**
- ✨ **主题定制** / **Theme Customization**
- ✨ **多语言支持** / **Multi-language Support**

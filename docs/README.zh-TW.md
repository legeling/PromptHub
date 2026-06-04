<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />

  # PromptHub

  本機優先的 Prompt、Skill 與 AI 編程資產工作台。

  <br/>

  [![GitHub Stars](https://img.shields.io/github/stars/legeling/PromptHub?style=for-the-badge&logo=github&color=yellow)](https://github.com/legeling/PromptHub/stargazers)
  [![Downloads](https://img.shields.io/github/downloads/legeling/PromptHub/total?style=for-the-badge&logo=github&color=blue)](https://github.com/legeling/PromptHub/releases)
  [![Version](https://img.shields.io/badge/release-v0.5.8_stable-22C55E?style=for-the-badge)](https://github.com/legeling/PromptHub/releases/latest)
  [![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](../LICENSE)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
  ![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
  ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
  ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

  <br/>

  ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)
  ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
  ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)

  <br/>

  [简体中文](../README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md)

  <br/>

  <a href="https://github.com/legeling/PromptHub/releases/latest">
    <img src="https://img.shields.io/badge/📥_下載桌面版-Releases-blue?style=for-the-badge&logo=github" alt="Download"/>
  </a>
</div>

<br/>

PromptHub 把你的 Prompt、SKILL.md 和專案級 AI 編程資產放進一個本機工作區。它能把同一份 Skill 一鍵安裝到 Claude Code、Cursor、Codex、Windsurf、Gemini CLI 等十幾個工具，給 Prompt 提供版本管理與多模型測試，並透過 WebDAV 或自部署 Web 同步到其他裝置。

資料預設存在你自己的電腦上。

---

## 目錄

- [桌面版下載](#install)
- [螢幕截圖](#screenshots)
- [核心能力](#features)
- [快速上手](#quick-start)
- [自部署網頁版](#self-hosted-web)
- [命令列 CLI](#cli)
- [更新日誌](#changelog)
- [路線圖](#roadmap)
- [從原始碼執行](#dev)
- [儲存庫結構](#project-structure)
- [貢獻與文件](#contributing)
- [授權 / 致謝 / 社群](#meta)

---

<div id="install"></div>

## 📥 桌面版下載

最新穩定版 **v0.5.8**。每個平台都有兩條下載鏈路：

- **直鏈下載** — 檔名固定，連結不會隨版本變化，適合做長期書籤或腳本呼叫（穩定版現已接入 CDN 鏡像）
- **GitHub Releases** — 官方發佈頁，可下載歷史版本、查看簽章與 Release Notes

| 平台    | 直鏈下載 | GitHub Releases |
| ------- | -------- | --------------- |
| Windows | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-arm64.exe) | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-arm64.exe) |
| macOS   | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.dmg) | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.dmg) |
| Linux   | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-amd64.deb) | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-amd64.deb) |
| 預覽版  | [![Preview Channel](https://img.shields.io/badge/Preview-Channel-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/legeling/PromptHub/releases) | 目前沒有單獨預覽版；需要提前體驗新功能時，可在應用內「設定 → 關於」開啟「預覽版通道」 |

> **macOS 選哪個？** Apple Silicon（M1/M2/M3/M4）選 `arm64`，Intel Mac 選 `x64`。
> **Windows 選哪個？** 絕大多數選 `x64`，只有 Surface Pro X 這類 ARM 裝置選 `arm64`。

### macOS 透過 Homebrew

```bash
brew tap legeling/tap
brew install --cask prompthub
```

後續升級請用 `brew upgrade --cask prompthub`，**不要**和應用內自動更新混用，否則可能出現 Homebrew 記錄的版本和實際安裝不一致。

### macOS 首次啟動提示「已損壞」

應用沒有 Apple 公證簽章，第一次打開可能會跳「無法驗證開發者」。打開終端機執行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

接著重新打開即可。如果應用安裝在其他位置，把路徑替換成實際安裝路徑。

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS 安裝提示"/>
</div>

### 預覽通道

如果你想體驗下一版的開發預覽版，可以在「設定 → 關於」打開「預覽版通道」開關，應用會從 GitHub Prereleases 拉取建置。一旦關掉這個開關，更新會回到穩定版，並且不會從較新的預覽版自動降級到較舊的穩定版。

<div id="screenshots"></div>

## 螢幕截圖

> 下面這幾張展示了目前穩定版 0.5.8 的核心互動。

<div align="center">
  <p><strong>主介面（雙欄首頁）</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="主介面"/>
  <br/><br/>
  <p><strong>Skill 商店</strong></p>
  <img src="./imgs/10-skill-store.png" width="80%" alt="Skill 商店"/>
  <br/><br/>
  <p><strong>Skill 詳情與一鍵安裝到平台</strong></p>
  <img src="./imgs/11-skill-platform-install.png" width="80%" alt="Skill 平台安裝"/>
  <br/><br/>
  <p><strong>Rules 工作區</strong></p>
  <img src="./imgs/13-rules-workspace.png" width="80%" alt="Rules 工作區"/>
  <br/><br/>
  <p><strong>專案級 Skill 工作區</strong></p>
  <img src="./imgs/14-skill-projects.png" width="80%" alt="專案級 Skill 工作區"/>
  <br/><br/>
  <p><strong>Quick Add 多入口（手動 / 分析 / AI 生成）</strong></p>
  <img src="./imgs/15-quick-add-ai.png" width="80%" alt="Quick Add"/>
  <br/><br/>
  <p><strong>外觀與動畫偏好</strong></p>
  <img src="./imgs/17-appearance-motion.png" width="80%" alt="外觀設定"/>
</div>

<div id="features"></div>

## 核心能力

### 📝 Prompt 管理

- 資料夾、標籤、收藏三層組織，可拖曳排序，CRUD 全覆蓋
- 範本變數 `{{variable}}`，複製 / 測試 / 分發時跳出表單填值
- 全文搜尋（FTS5），Markdown 渲染與程式碼高亮，附件 / 多媒體預覽
- 桌面卡片支援雙擊進入 inline 編輯使用者 Prompt 和 System Prompt

### 🧩 Skill 商店與一鍵分發

- **技能商店**：內建 20+ 精選技能（來自 Anthropic、OpenAI 等），可疊加自訂商店來源（GitHub / skills.sh / 本機目錄）
- **一鍵安裝到平台**：Claude Code、Cursor、Windsurf、Codex、Kiro、Kilo Code、Gemini CLI、Qoder、QoderWork、CodeBuddy、Trae、OpenCode 等 15+ 平台
- **本機掃描**：自動發現本機已有的 SKILL.md，預覽選擇後匯入，不必在多個工具目錄間複製貼上
- **Symlink / Copy 雙模式**：選 symlink 共享編輯，選 copy 各平台保留獨立副本
- **平台目標目錄可覆寫**：為每個平台單獨設定 Skills 目錄，掃描和分發保持一致
- **AI 翻譯與潤色**：以完整 SKILL.md 為單位產生 sidecar 譯文，支援沉浸式對照和全文翻譯
- **安全掃描**：安裝前用 AI 審閱鏈路檢查 Skill 內容，受限來源直接阻擋
- **GitHub Token**：商店與儲存庫匯入支援驗證，減少匿名限流失敗
- **標籤篩選**：依標籤快速篩選已安裝與商店技能

### 📐 Rules（AI 編程規則）

- 集中管理 `.cursor/rules`、`.claude/CLAUDE.md`、AGENTS.md 等規則檔案
- 支援手動新增專案級 Rules，依目錄分組瀏覽
- 與 ZIP 匯出、WebDAV、自託管同步、Web 匯入匯出全鏈路打通

### 🤖 專案與 Agent 資產工作區

- 掃描專案中的 `.claude/skills`、`.agents/skills`、`skills`、`.gemini` 等常見目錄
- 為單個專案建立獨立 Skill 工作區，不污染全域庫
- 個人庫、本機儲存庫、專案資產同一介面切換，不必在多個工具目錄之間切來切去
- 全域 Prompt 標籤管理：集中搜尋、重新命名、合併、刪除標籤，資料庫與工作區檔案一併同步

### 🧪 AI 測試與生成

- 內建 AI 測試，主流國內外服務商都能設定（OpenAI、Anthropic、Gemini、Azure、自訂 endpoint 等）
- 同一 Prompt 多模型並行對比，文字和圖像模型都支援
- AI 產生技能、AI 潤色技能、Quick Add AI 直接產生結構化 Prompt 草稿
- 統一的端點管理與連線測試，錯誤訊息精確到 504 / 逾時 / 未設定

### 🕒 版本控制與歷史

- 每次儲存 Prompt 自動寫入歷史版本，支援版本對比、差異高亮、一鍵回滾
- Skill 同樣維護版本歷史，可建立命名版本、查看差異、依版本回滾
- Rules 歷史快照可預覽、還原到草稿
- 商店 Skill 安裝時記錄內容雜湊，遠端 SKILL.md 變更可偵測，本機修改有衝突保護

### 💾 資料、同步與備份

- 本機優先：所有資料預設存在你自己的電腦上
- 全量備份 / 還原使用 `.phub.gz` 壓縮格式
- WebDAV 同步（堅果雲、Nextcloud 等）
- 自部署 PromptHub Web 可作為額外的同步來源 / 備份來源
- 啟動時自動拉取 + 背景定時同步；只允許一個活動同步來源驅動自動同步，避免多源衝突寫入

### 🔐 隱私與安全

- 主密碼保護應用入口，AES-256-GCM 加密
- 私密資料夾內容加密儲存（Beta）
- 跨平台離線執行：macOS / Windows / Linux
- 7 種介面語言：簡體中文、繁體中文、English、日本語、Deutsch、Español、Français

<div id="quick-start"></div>

## 快速上手

1. **新建第一個 Prompt。** 點「+ 新建」，填標題、描述、System Prompt 和 User Prompt。`{{變數名稱}}` 會變成一個變數，複製或測試時會跳出表單讓你填。

2. **把 Skills 納入工作區。** 開啟「Skills」頁籤，從商店選幾個，或點「掃描本機」讓 PromptHub 自動找你電腦上已有的 SKILL.md。

3. **一鍵安裝到 AI 工具。** 在 Skill 詳情頁選擇目標平台。PromptHub 會依平台規範把 SKILL.md 安裝到對應目錄。可以選 symlink（同步編輯）或獨立副本。

4. **設定同步（可選）。**「設定 → 資料」裡設定 WebDAV，或自部署一份 PromptHub Web 當同步目標。

<div id="self-hosted-web"></div>

## 自部署網頁版

PromptHub Web 是一個輕量的瀏覽器版工作區，你可以用 Docker 把它跑在 NAS、VPS 或區網裡。它**不是**官方雲端服務，主要用途是：

- 在瀏覽器裡存取自己的 PromptHub 資料
- 給桌面版當作除 WebDAV 之外的另一種同步目標
- 不想讓資料離開本機區網

```bash
cd apps/web
cp .env.example .env
docker compose up -d --build
```

`.env` 裡有幾個必須改的：

- `JWT_SECRET`：≥ 32 位隨機字元
- `ALLOW_REGISTRATION=false`：建議保持關閉，第一個使用者初始化完之後就不要再開公開註冊
- `DATA_ROOT`：資料根目錄，會在下面建立 `data/`、`config/`、`logs/`、`backups/`

預設在 `http://localhost:3871`。第一次打開會跳到 `/setup`，你建立的第一個使用者就是管理員。

桌面版接入這份 Web：「設定 → 資料 → Self-Hosted PromptHub」，填 URL、使用者名稱、密碼。可以測試連線、上傳目前工作區、從 Web 拉回本機、啟動時自動拉取、背景定時推送。

更詳細的部署、升級、備份、GHCR 映像檔、開發說明在 [`web-self-hosted.md`](./web-self-hosted.md)。

<div id="cli"></div>

## 命令列 CLI

CLI 適合腳本化管理、批次匯入匯出、自動化掃描。目前桌面版**不會**自動安裝 `prompthub` 命令，需要你從儲存庫自己打包再安裝：

```bash
pnpm pack:cli
pnpm add -g ./apps/cli/prompthub-cli-*.tgz
prompthub --help
```

也可以不安裝直接執行：

```bash
pnpm --filter @prompthub/cli dev -- prompt list
pnpm --filter @prompthub/cli dev -- skill scan
```

支援的資源命令一覽（每個命令都有 `--help`）：

```text
prompt    list / get / create / update / delete / duplicate / search
          versions / create-version / delete-version / diff / rollback
          use / copy
          list-tags / rename-tag / delete-tag

folder    list / get / create / update / delete / reorder

rules     list / scan / read / save / rewrite
          versions / version-read / version-restore / version-delete
          add-project / remove-project
          export / import

skill     list / get / install / delete / remove
          versions / create-version / rollback / delete-version
          export / scan / scan-safety / sync-from-repo
          platforms / platform-status / install-md / uninstall-md
          repo-files / repo-read / repo-write / repo-delete / repo-mkdir / repo-rename

ai        providers / provider-add / provider-delete
          models / model-add / model-delete
          routes / route-set / route-clear

workspace export / import
```

常用全域參數：

- `--output json|table` — 輸出格式
- `--data-dir <path>` — 顯式指定 PromptHub 的 `userData` 目錄
- `--app-data-dir <path>` — 顯式指定應用資料根目錄
- `--version|-v` — 印出 CLI 版本

<div id="changelog"></div>

## 更新日誌

完整版本說明：**[CHANGELOG.md](../CHANGELOG.md)**

### v0.5.8（2026-06-04）

- 圖片 Prompt 反推新增獨立入口，支援視覺模型生成結構化生圖 Prompt，先預覽/複製再決定是否保存
- AI 模型設定改為供應商優先的三欄體驗，區分供應商、模型能力和業務路由
- ClawHub 與 skill.sh 商店接入遠端搜尋、分類、分頁/滾動載入、快取和完整 Skill 包安裝
- Skill 生命週期矩陣繼續加固，覆蓋我的 Skill、專案 Skill、Agent Skill、平台安裝、copy / symlink、內建 Skill 和外部軟連結
- GitHub / Gitea / 自託管 Git 來源更新檢查更準確，並忽略常見快取檔案以減少誤報

### v0.5.8-beta.3（2026-06-02，預覽版）

- Skill 源碼檔案視圖接入輕量程式碼編輯器，支援語法高亮、行號、自動換行和更準確的檔案圖示
- 從 GitHub 匯入到「我的 Skill」的項目現在可以直接檢查來源更新，並在套用更新前建立版本快照
- Cherry Studio、Agent Skill、專案 Skill、copy / symlink、內建 Skill 與外部軟連結狀態繼續補強
- Prompt / Skill 版本歷史彈窗改為更適合檢索與對比的表格化呈現

### v0.5.7（2026-05-29）

- Prompt AI 快速編輯：詳情頁、詳情彈窗與右鍵選單共用同一套 AI 改寫彈窗，支援先產生草稿再決定套用或繼續編輯
- 同名 Skill variant 正式落地：允許同名但不同來源的 Skill 並存，並以一致的受管容器與來源身份收斂
- 備份導入恢復、自託管 Git 掃描與 AI Workbench 驗證狀態進一步加固

### v0.5.7-beta.2（2026-05-28，預覽版）

- Git 商店來源支援 `branch / directory` 設定、遠端分支建議與 GitHub / SSH / 自部署 Git 倉庫
- 專案 Skill 導入支援 `copy / symlink` 高級模式，並按專案記住導入偏好與目標目錄
- Agent 管理與 Skill 平台安裝內建改為支援 `Kilo Code`，移除 `Roo Code`

### v0.5.7-beta.1（2026-05-26，預覽版）

- 統一 built-in / custom agent 的完整配置模型，`Skill Settings` 可直接覆寫 `root / skills / rules / agents / commands / config` 路徑
- 新增 `Cline`、`Trae CN` 內建平台預設，並讓 Rules 工作區在 agent 設定變更後立即刷新
- 支援把 Skill 直接部署到專案本地 agent 目錄，預設 `.agents/skills`，並支援多目標選擇
- 平台 symlink 安裝回退到 copy 時會明確顯示 warning，不再偽裝成普通成功
- Prompt 詳情雙擊編輯進一步收口：雙擊哪塊就編輯哪塊，編輯態盡量保持原頁面結構

### v0.5.6（2026-05-12）

**新功能**

- 🧭 **Rules 集中管理工作台**：桌面端獨立的 Rules 頁面，統一管理全域規則和手動新增的專案規則，支援搜尋、歷史快照預覽、還原到草稿，並接入 ZIP 匯出、WebDAV、自託管同步和 Web 匯入匯出
- 📁 **專案級 Skill 工作區**：可以為本機專案建立獨立 Skill 工作區，自動掃描常見目錄，在專案上下文中預覽、匯入和分發 Skill
- 🤖 **Quick Add 支援 AI 直接產生 Prompt**：除了分析已有 Prompt，Quick Add 現在也能根據目標和約束直接產生結構化 Prompt 草稿
- 🏷️ **全域 Prompt 標籤管理**：側欄標籤區域新增統一入口，可集中搜尋、重新命名、合併和刪除標籤，同步更新資料庫與工作區檔案
- 🔐 **Skill 商店支援 GitHub Token**：減少匿名限流導致的商店和儲存庫匯入失敗

**修復**

- ✍️ 卡片詳情支援雙擊編輯使用者提示詞和系統提示詞
- 🪟 修復檢查更新對話框閃爍、下載按鈕無法穩定點擊，以及開機自動啟動時不能依 `minimizeOnLaunch` 最小化的問題
- ↔️ Skills 三欄欄寬調節、雙擊重設、標題換行、商店搜尋的一組易用性回歸
- 🔁 Rules、Skill 附加檔案和託管副本在 ZIP 匯出、WebDAV、自託管同步和 Web 匯入匯出鏈路中的一致性
- 🖼️ 自託管 Web 登入改用一次性圖形驗證碼

**優化**

- 🏠 雙欄首頁穩定支援模組顯隱、拖曳排序，背景圖獨立開關
- ☁️ 桌面端只允許一個活動同步源驅動自動同步，避免多源同時寫入衝突
- ✨ 引入完整的桌面端動畫系統（duration / easing / scale tokens、`<Reveal>` `<Collapsible>` `<ViewTransition>` `<Pressable>` 四個意圖元件、三檔使用者偏好），並移除了僅在一個元件用過的 framer-motion，`ui-vendor` chunk gzip 從 54 KB 降到 16 KB
- 🪶 桌面端長列表（Skill 列表 / Prompt 畫廊 / 看板 / Prompt 詳情列表）改為 `@tanstack/react-virtual` 虛擬化，移除了之前手寫的 setTimeout 分批渲染補丁

<div id="roadmap"></div>

## 路線圖

### v0.5.8 ← 目前穩定版

- 圖片 Prompt 反推、AI 模型供應商/能力/路由設定和生圖測試鏈路穩定落地
- Skill 生命週期矩陣收口，覆蓋商店、Git、Agent、專案、平台、copy / symlink 和內建 Skill
- ClawHub / skill.sh 商店、來源更新檢查、程式碼視圖、檔案圖示和版本歷史體驗補齊

### v0.5.7

- Prompt AI 快速編輯、同名 Skill variant、遠端 Git 掃描和 AI Workbench 驗證狀態加固

### v0.5.6

詳見上方更新日誌。

### v0.5.5

- 商店 Skill 安裝時記錄內容雜湊，可偵測遠端 SKILL.md 是否更新並支援本機修改衝突保護
- Skill 整份文件 AI 翻譯：圍繞完整 SKILL.md 產生 sidecar 譯文，支援全文翻譯和沉浸式對照
- 資料目錄切換透過 relaunch 真正生效
- AI 模型測試與翻譯錯誤回饋更明確（504 / 逾時 / 未設定都有具體提示）
- Web/Docker 媒體上傳修復，`local-image://` / `local-video://` 自動解析
- 預覽通道更新鏈路加固
- Issue Form 自動同步 `version: x.y.z` 標籤

### v0.4.x

- AI 工作台、模型管理、端點編輯、連線測試與場景預設模型
- skills.sh 社群商店接入，支援榜單、安裝量、Star
- skill-installer God Class 拆分、SSRF 防護、URL 協議校驗
- 多平台 Skill 一鍵安裝：Claude Code、Cursor、Windsurf、Codex 等十幾個平台
- AI 翻譯、AI 產生 Skill、本機批次掃描

### 在做 / 在想

- [ ] 瀏覽器擴充功能：在 ChatGPT / Claude 網頁裡直接呼叫 PromptHub 庫
- [ ] 行動端：手機查看、搜尋、輕量編輯同步
- [ ] 外掛機制：本機模型（Ollama 等）和自訂 AI 服務商
- [ ] Prompt 商店：複用社群驗證過的提示詞範本
- [ ] 更複雜的變數型態：選擇框、動態日期等
- [ ] 使用者上傳分享自創 Skill

<div id="dev"></div>

## 從原始碼執行

需要 Node.js ≥ 24、pnpm 9。

```bash
git clone https://github.com/legeling/PromptHub.git
cd PromptHub
pnpm install

# 桌面端開發
pnpm electron:dev

# 桌面端建置
pnpm build

# 自部署 Web 建置
pnpm build:web
```

`pnpm build` 預設只建置桌面版。Web 需要顯式 `pnpm build:web`。

常用開發命令：

| 命令 | 用途 |
| ---- | ---- |
| `pnpm electron:dev` | 啟動桌面端開發環境（vite + electron） |
| `pnpm dev:web` | 啟動 Web 開發環境 |
| `pnpm lint` / `pnpm lint:web` | 程式碼風格檢查 |
| `pnpm typecheck` / `pnpm typecheck:web` | TypeScript 型別檢查 |
| `pnpm test -- --run` | 桌面端 vitest 單元 + 整合測試 |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm verify:web` | Web lint + typecheck + test + build |
| `pnpm test:release` | 桌面端發布前完整門檻 |
| `pnpm --filter @prompthub/desktop bundle:budget` | 桌面端 bundle 體積預算檢查 |

<div id="project-structure"></div>

## 儲存庫結構

```text
PromptHub/
├── apps/
│   ├── desktop/   # Electron 桌面端
│   ├── cli/       # 獨立 CLI（基於 packages/core）
│   └── web/       # 自部署 Web
├── packages/
│   ├── core/      # CLI 與桌面共用的核心邏輯
│   ├── db/        # 共用資料層（SQLite schema、查詢）
│   └── shared/    # 共用型別、IPC 常數、協定定義
├── docs/          # 對外文件
├── spec/          # 內部 SSD / 設計規範
├── website/       # 官網相關資源
├── README.md
├── CONTRIBUTING.md
└── package.json
```

<div id="contributing"></div>

## 貢獻與文件

- 入口：[CONTRIBUTING.md](../CONTRIBUTING.md)
- 完整指南：[`docs/contributing.md`](./contributing.md)
- 對外文件索引：[`docs/README.md`](./README.md)
- 內部 SSD / spec：[`spec/README.md`](../spec/README.md)

非平凡改動建議先在 `spec/changes/active/<change-key>/` 下建立一個 change 資料夾（`proposal.md` / `specs/<domain>/spec.md` / `design.md` / `tasks.md` / `implementation.md`），完成後把穩定事實回填到 `spec/workflow/*`、`spec/knowledge/*`、`spec/releases/` 或 `spec/adr/`，並在需要時更新 `docs/`、`README.md`。

<div id="meta"></div>

## 授權

[AGPL-3.0](../LICENSE)

## 回饋

- 問題：[GitHub Issues](https://github.com/legeling/PromptHub/issues)
- 想法：[GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 致謝

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [TailwindCSS](https://tailwindcss.com/) · [Zustand](https://zustand-demo.pmnd.rs/) · [Lucide](https://lucide.dev/) · [@tanstack/react-virtual](https://tanstack.com/virtual) · [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)

## 貢獻者

感謝所有為 PromptHub 做出貢獻的開發者。

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

## Star History

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <img alt="Star History" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## 社群

歡迎加入 PromptHub 社群，回饋問題、交流使用方式、討論新功能、搶先體驗預覽版。

<div align="center">
  <a href="https://discord.gg/zmfWguWFB">
    <img src="https://img.shields.io/badge/Discord-Join%20PromptHub%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join PromptHub Discord Community" />
  </a>
  <p><strong>推薦優先加入 Discord 社群，獲取公告、交流支援與新版本動態</strong></p>
</div>

<br/>

### QQ 交流群

如果你更習慣用 QQ，可以加入 PromptHub QQ 交流群：

- 群號：`704298939`

<div align="center">
  <img src="./imgs/qq-group.jpg" width="320" alt="PromptHub QQ 交流群 QR"/>
  <p><strong>掃碼加入 PromptHub QQ 交流群</strong></p>
</div>

## 贊助支援 / Sponsor

如果 PromptHub 對你的工作有幫助，歡迎請作者喝杯咖啡。

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./imgs/donate/wechat.png" width="200" alt="WeChat Pay"/>
        <br/>
        <b>微信支付 / WeChat Pay</b>
      </td>
      <td align="center">
        <img src="./imgs/donate/alipay.jpg" width="200" alt="Alipay"/>
        <br/>
        <b>支付寶 / Alipay</b>
      </td>
      <td align="center">
        <a href="https://www.buymeacoffee.com/legeling" target="_blank">
          <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
        </a>
        <br/>
        <b>Buy Me A Coffee</b>
      </td>
    </tr>
  </table>
</div>

聯絡：legeling567@gmail.com

歷史贊助記錄歸檔在 [`docs/sponsors.md`](./sponsors.md)。

---

<div align="center">
  <p>如果 PromptHub 對你有幫助，請給個 ⭐ 支持一下。</p>
</div>

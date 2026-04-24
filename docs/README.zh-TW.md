<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="120" height="120" />
  <h1>PromptHub</h1>
  <p><strong>🚀 開源免費的 AI Prompt 與 Skill 管理工具 | 數據本地存儲 | 隱私優先</strong></p>
  <p>Prompt 管理 · 技能商店 · 多平台安裝 · 版本控制 · 變量模板 · 多模型測試 — 一站式 AI 工作台</p>
  
  <p>
    <a href="https://github.com/legeling/PromptHub/stargazers"><img src="https://img.shields.io/github/stars/legeling/PromptHub?style=flat-square&color=yellow" alt="GitHub Stars"/></a>
    <a href="https://github.com/legeling/PromptHub/network/members"><img src="https://img.shields.io/github/forks/legeling/PromptHub?style=flat-square" alt="GitHub Forks"/></a>
    <a href="https://github.com/legeling/PromptHub/releases"><img src="https://img.shields.io/badge/version-v0.5.5-green?style=flat-square" alt="Version"/></a>
    <a href="https://github.com/legeling/PromptHub/releases"><img src="https://img.shields.io/github/downloads/legeling/PromptHub/total?style=flat-square&color=blue" alt="Downloads"/></a>
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License: AGPL-3.0"/>
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"/>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"/>
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="TailwindCSS"/>
  </p>
  
  <p>
    <a href="../README.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.en.md">English</a> ·
    <a href="./README.ja.md">日本語</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.es.md">Español</a> ·
    <a href="./README.fr.md">Français</a>
  </p>
</div>

<br/>

> 💡 **為什麼選擇 PromptHub？**
>
> PromptHub 不僅是 Prompt 管理工具，更是 **AI 技能分發中心**。管理你的 Prompt 和 SKILL.md 技能，一鍵安裝到 Claude Code、Cursor、Windsurf、Codex 等 15+ 主流 AI 編程工具。支援版本控制、變量模板、多模型測試，所有數據都存在本地，隱私安全有保障。

---

## 📥 下載

<div align="center">
  <a href="https://github.com/legeling/PromptHub/releases">
    <img src="https://img.shields.io/badge/📥_立即下載-Releases-blue?style=for-the-badge" alt="Download"/>
  </a>
</div>

|  平台   |                                                                                                                                                                                                                  下載                                                                                                                                                                                                                   |
| :-----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Windows | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.5-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.5-arm64.exe) |
|  macOS  |   [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-x64.dmg)   |
|  Linux  |       [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/prompthub_0.5.5_amd64.deb)        |

---

## ✨ 功能特性

### 📝 Prompt 管理

- 創建、編輯、刪除，支援資料夾和標籤分類
- 自動保存歷史版本，支援查看、對比和回退
- 模板變量 `{{variable}}`，複製時動態替換
- 全文搜索、收藏、多媒體附件

### 🧩 Skill 技能管理 🆕

- **技能商店**：內建 20+ 精選技能（來自 Anthropic、OpenAI 等）
- **多平台安裝**：一鍵安裝到 Claude Code、Cursor、Windsurf、Codex、Kiro、Gemini CLI、Qoder、QoderWork、CodeBuddy 等 15+ 平台
- **本地掃描**：自動發現本地已有 SKILL.md，預覽選擇後導入
- **軟鏈接/複製模式**：支援 Symlink 同步編輯或獨立複製
- **AI 翻譯**：沉浸式/全文翻譯技能內容
- **標籤篩選**：按標籤快速過濾技能

### 🤖 AI 能力

- 內建多模型測試，支援各類主流服務商
- 同一 Prompt 多模型並行測試對比
- AI 技能內容生成與涡色

### 💾 數據與同步

- 所有數據存儲在本地，隱私安全有保障
- 全量備份與恢復（`.phub.gz`）
- WebDAV 雲同步
- 深色/淺色/跟隨系統，7 種語言，跨平台

## 📸 截圖展示

<div align="center">
  <p><strong>主界面</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="主界面"/>
  <br/><br/>
  <p><strong>畫廊視圖</strong></p>
  <img src="./imgs/2-gallery-view.png" width="80%" alt="畫廊視圖"/>
  <br/><br/>
  <p><strong>列表視圖</strong></p>
  <img src="./imgs/3-list-view.png" width="80%" alt="列表視圖"/>
  <br/><br/>
  <p><strong>數據備份</strong></p>
  <img src="./imgs/4-backup.png" width="80%" alt="數據備份"/>
  <br/><br/>
  <p><strong>主題設置</strong></p>
  <img src="./imgs/5-theme.png" width="80%" alt="主題設置"/>
  <br/><br/>
  <p><strong>雙語對照</strong></p>
  <img src="./imgs/6-double-language.png" width="80%" alt="雙語對照"/>
  <br/><br/>
  <p><strong>變量填充</strong></p>
  <img src="./imgs/7-variable.png" width="80%" alt="變量填充"/>
  <br/><br/>
  <p><strong>版本對比</strong></p>
  <img src="./imgs/8-version-compare.png" width="80%" alt="版本對比"/>
  <br/><br/>
  <p><strong>多語言支持</strong></p>
  <img src="./imgs/9-i18n.png" width="80%" alt="多語言支持"/>
</div>

## 📦 安裝指南

### 下載

從 [Releases](https://github.com/legeling/PromptHub/releases) 下載最新版本 v0.5.5：

|  平台   |                                                                                                                                                                                                                  下載                                                                                                                                                                                                                   |
| :-----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Windows | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.5-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.5-arm64.exe) |
|  macOS  |   [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-x64.dmg)   |
|  Linux  |       [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.5-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/prompthub_0.5.5_amd64.deb)        |

### macOS 首次啟動

由於應用未經過 Apple 公證簽名，首次打開時可能會提示 **"PromptHub 已損壞，無法打開"** 或 **"無法驗證開發者"**。

**解決方法（推薦）**：打開終端，執行以下命令繞過公證檢查：

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

> 💡 **提示**：如果應用安裝在其他位置，請將路徑替換為實際安裝路徑。

**或者**：打開「系統設置」→「隱私與安全性」→ 向下滾動找到安全性部分 → 點擊「仍要打開」。

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS 安裝提示"/>
</div>

### 從源碼構建

```bash
# 克隆倉庫
git clone https://github.com/legeling/PromptHub.git
cd PromptHub

# 安裝依賴
pnpm install

# 開發模式
pnpm dev

# 構建應用
pnpm build
```

## 命令列 CLI

PromptHub 現在同時提供 GUI 與 CLI。

> ⚠️ **目前行為**
>
> - 安裝桌面版並首次啟動一次 PromptHub 後，應用會自動安裝 `prompthub` 命令
> - 重新開啟終端後，就可以直接使用 `prompthub --參數`
> - 源碼執行與構建後的 CLI bundle 仍保留，適合開發與除錯

### 桌面版用戶直接使用

```bash
prompthub --help
prompthub prompt list
prompthub skill list
prompthub --output table prompt search SEO --favorite
```

> 💡 **提示**
>
> - 如果你剛安裝完桌面版，請先啟動一次 PromptHub
> - 如果目前終端還找不到 `prompthub`，請關閉並重新打開終端

### 從源碼執行

```bash
pnpm install
pnpm cli:dev -- --help
pnpm cli:dev -- prompt list
pnpm cli:dev -- skill list
pnpm cli:dev -- skill install ~/.claude/skills/my-skill
```

### 使用構建後的 CLI bundle

```bash
pnpm build
node out/cli/prompthub.cjs --help
node out/cli/prompthub.cjs prompt list
node out/cli/prompthub.cjs skill list
```

### 常用參數

- `--output json|table`
- `--data-dir /path/to/user-data`
- `--app-data-dir /path/to/app-data`

### 支援的命令

- `prompt list|get|create|update|delete|search`
- `skill list|get|install|scan|delete|remove`

### 說明

- CLI 會直接讀寫 PromptHub 的本地資料庫與管理中的 skill 倉庫
- 適合腳本化管理、批次操作、匯入、掃描與自動化流程
- 桌面版會在首次啟動時自動安裝 shell 命令包裝器
- 如果你之後移動了應用程式位置，再次啟動 PromptHub 會自動刷新命令包裝器

## 🚀 快速開始

### 1. 創建 Prompt

點擊「新建」按鈕，填寫：

- **標題** - Prompt 名稱
- **描述** - 簡短說明用途
- **System Prompt** - 設置 AI 角色（可選）
- **User Prompt** - 實際的提示詞內容
- **標籤** - 便於分類和搜索

### 2. 使用變量

在 Prompt 中使用 `{{變量名}}` 語法定義變量：

```
請將以下 {{source_lang}} 文本翻譯成 {{target_lang}}：

{{text}}
```

### 3. 複製使用

選中 Prompt，點擊「複製」，Prompt 內容將複製到剪貼板。

### 4. 版本管理

編輯 Prompt 時會自動保存歷史版本，點擊「歷史版本」可以查看和恢復。

## 🛠️ 技術棧

| 類別     | 技術                    |
| -------- | ----------------------- |
| 框架     | Electron 33             |
| 前端     | React 18 + TypeScript 5 |
| 樣式     | TailwindCSS             |
| 狀態管理 | Zustand                 |
| 本地存儲 | SQLite                  |
| 構建工具 | Vite + electron-builder |

## 📁 項目結構

```
PromptHub/
├── src/
│   ├── main/           # Electron 主進程
│   ├── preload/        # 預加載腳本
│   ├── renderer/       # React 渲染進程
│   │   ├── components/ # UI 組件
│   │   ├── stores/     # Zustand 狀態管理
│   │   ├── services/   # 服務層
│   │   └── styles/     # 全域樣式
│   └── shared/         # 共享類型
├── resources/          # 靜態資源
└── package.json
```

## 📈 Star History

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## 🗺️ 路線圖

### v0.5.5（目前）🚀

- [x] **Skill 商店更新檢測**：商店下載的 Skill 會保存安裝時內容雜湊，可檢查遠端 `SKILL.md` 是否更新
- [x] **Skill 更新衝突保護**：可識別本地修改與遠端更新，只有明確選擇覆蓋才會取代本地內容
- [x] **Web 媒體修復**：Docker/Web 環境支援圖片、影片上傳，也能顯示桌面同步來的本地媒體連結
- [x] **同步與密碼修復**：修復 Web 同步後普通資料夾誤上鎖，新增 Web 登入密碼修改入口，桌面取消私密前需先解鎖

### v0.4.9

- [x] 安全加固、架構重構、Skill 元數據編輯修復
- [x] 資料庫遷移修復、代碼品質清理、720 測試全綠

### v0.4.8

- [x] AI 工作台實裝、skills.sh 社群商店接入、歷史版本刪除
- [x] 備份 / WebDAV 強化、資料目錄遷移顯示修復、大量 Skill 效能優化

### v0.3.x

- [x] 多層級資料夾、版本控制、變數範本
- [x] 多模型實驗室、WebDAV 同步、Markdown 渲染
- [x] 多視圖模式、系統整合、安全與隱私

### 未來規劃

- [ ] **瀏覽器擴充功能**：在網頁端（如 ChatGPT/Claude）直接調取 PromptHub 庫
- [ ] **行動端應用**：支援手機端查看、搜尋與編輯
- [ ] **外掛系統**：支援用戶自定義擴充 AI 供應商或本地模型
- [ ] **技能市場**：支援用戶上傳和分享自己創建的技能

## 📝 更新日誌

查看完整更新日誌：**[CHANGELOG.md](../CHANGELOG.md)**

### 最新版本 v0.5.5 (2026-04-24) 🎉

**Skill 更新**

- 🧩 **商店 Skill 更新檢測**：保存安裝時內容雜湊與版本，並比較最新遠端 `SKILL.md` 判斷是否更新
- 🛡️ **本地修改衝突保護**：本地內容與遠端內容同時變更時會提示衝突，需明確覆蓋才會更新

**Web**

- 🌐 **媒體上傳與顯示修復**：Web/Docker 可上傳所選媒體，並顯示桌面同步的 `local-image://` / `local-video://` 連結
- 🔐 **同步私密狀態修復**：缺失 `visibility` 的桌面資料夾不再被 Web 誤判為私密
- 🔑 **登入密碼修改入口**：自架 Web 設定頁新增密碼修改表單

**桌面與文件**

- 🔒 **私密資料夾保護**：桌面端取消資料夾私密狀態前必須先通過主密碼解鎖
- 🌍 **多語言與發版文件同步**：README、多語言文件與官網發布資料同步到 `v0.5.5`

> 📋 [更新日誌詳情](../CHANGELOG.md)

## 🤝 參與貢獻

歡迎貢獻代碼！請遵循以下步驟：

1. Fork 本倉庫
2. 創建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 創建 Pull Request

## 📄 許可證

本项目采用 [AGPL-3.0 License](../LICENSE) 開源協議。

## 💬 支持與反饋

- **問題反饋**: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- **功能建議**: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 🙏 致謝

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Lucide](https://lucide.dev/)
- 感謝所有為 PromptHub 做出貢獻的 [開發者](https://github.com/legeling/PromptHub/graphs/contributors)！

---

<div align="center">
  <p><strong>如果這個項目對你有幫助，請給個 ⭐ 支持一下！</strong></p>
  
  <a href="https://www.buymeacoffee.com/legeling" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
  </a>
</div>

---

## 💖 致謝支持者 / Backers

感謝以下朋友對 PromptHub 的捐助支持：

| 日期       | 支持者 | 金額     | 留言                             |
| :--------- | :----- | :------- | :------------------------------- |
| 2026-01-08 | \*🌊   | ￥100.00 | 支持優秀的軟件！                 |
| 2025-12-29 | \*昊   | ￥20.00  | 感謝您的軟件！能力有限，小小支持 |

---

## ☕ 贊助支持

如果 PromptHub 對你的工作有幫助，歡迎請作者喝杯咖啡 ☕

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./imgs/donate/wechat.png" width="200" alt="WeChat Pay"/>
        <br/>
        <b>微信支付</b>
      </td>
      <td align="center">
        <img src="./imgs/donate/alipay.jpg" width="200" alt="Alipay"/>
        <br/>
        <b>支付寶</b>
      </td>
    </tr>
  </table>
</div>

📧 **聯繫郵箱**: legeling567@gmail.com

感謝每一位支持者！你們的支持是我持續開發的動力！

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/legeling">legeling</a></p>
</div>

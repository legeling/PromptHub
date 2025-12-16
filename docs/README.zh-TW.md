<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="120" height="120" />
  <h1>PromptHub</h1>
  <p><strong>🚀 開源、本地優先的 AI Prompt 管理工具</strong></p>
  <p>高效管理、版本控制、變數填充、多模型測試 — 一站式 Prompt 工作流</p>
  
  <p>
    <a href="https://github.com/legeling/PromptHub/stargazers"><img src="https://img.shields.io/github/stars/legeling/PromptHub?style=flat-square&color=yellow" alt="GitHub Stars"/></a>
    <a href="https://github.com/legeling/PromptHub/network/members"><img src="https://img.shields.io/github/forks/legeling/PromptHub?style=flat-square" alt="GitHub Forks"/></a>
    <a href="https://github.com/legeling/PromptHub/releases"><img src="https://img.shields.io/badge/version-v0.2.7-green?style=flat-square" alt="Version"/></a>
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
> 還在筆記本、文件和聊天記錄裡到處翻找 Prompt？PromptHub 讓你像管理程式碼一樣管理 Prompt — 支援版本控制、變數範本、多模型測試，所有資料都存在本地，隱私安全有保障。

---

## 📥 下載安裝

> 💡 點擊下方連結直接下載最新版本，或造訪 [Releases 頁面](https://github.com/legeling/PromptHub/releases) 查看所有版本。

| 平台 | 架構 | 下載連結 |
|:---:|:---:|:---:|
| **Windows** | x64 | [PromptHub-Setup-0.2.6-x64.exe](https://github.com/legeling/PromptHub/releases/download/v0.2.6/PromptHub-Setup-0.2.6-x64.exe) |
| **macOS** | Apple Silicon (M系列晶片) | [PromptHub-0.2.6-arm64.dmg](https://github.com/legeling/PromptHub/releases/download/v0.2.6/PromptHub-0.2.6-arm64.dmg) |
| **macOS** | Intel | [PromptHub-0.2.6-x64.dmg](https://github.com/legeling/PromptHub/releases/download/v0.2.6/PromptHub-0.2.6-x64.dmg) |
| **Linux** | x64 (AppImage) | [PromptHub-0.2.6-x64.AppImage](https://github.com/legeling/PromptHub/releases/download/v0.2.6/PromptHub-0.2.6-x64.AppImage) |
| **Linux** | x64 (deb) | [PromptHub-0.2.6-amd64.deb](https://github.com/legeling/PromptHub/releases/download/v0.2.6/PromptHub-0.2.6-amd64.deb) |

---

## ✨ 功能特性

- **📝 Prompt 管理** - 建立、編輯、刪除，支援資料夾和標籤分類
- **⭐ 收藏系統** - 快速收藏常用 Prompt，一鍵存取
- **🔄 版本控制** - 自動儲存歷史版本，支援查看和回滾
- **🔧 變數系統** - 範本變數 `{{variable}}`，動態替換
- **📋 一鍵複製** - 快速複製 Prompt 到剪貼簿
- **🔍 全文搜尋** - 快速搜尋標題、描述和內容
- **📤 匯出/備份** - 選擇性匯出（僅匯出）/ 全量備份與還原（支援 `.phub.gz` 壓縮，包含圖片、AI 設定、系統設定）
- **🎨 主題自訂** - 深色/淺色/跟隨系統，多種主題色可選
- **🌐 多語言** - 支援簡體中文、繁體中文、英文、日語、西班牙語、德語、法語
- **💾 本地儲存** - 所有資料儲存在本地，隱私安全有保障
- **🖥️ 跨平台** - 支援 macOS、Windows、Linux
- **📊 列表檢視** - 表格式展示 Prompt，支援排序和批次操作
- **🤖 AI 測試** - 內建多模型測試，支援 18+ 服務商
- **🎨 生圖模型** - 支援設定和測試圖像生成模型（DALL-E、Midjourney 等）
- **🧭 Markdown 預覽** - 全場景支援 Markdown 渲染與程式碼高亮
- **🪟 寬螢幕與全螢幕模式** - 編輯/查看詳情時支援更寬的視野和全螢幕模式
- **🔐 主密碼與私密資料夾** - 支援設定主密碼，私密資料夾內容加密儲存
- **🖼️ 圖片上傳與預覽** - 支援上傳/貼上本地圖片，並在彈窗內預覽
- **☁️ WebDAV 同步** - 支援 WebDAV 雲端同步（prompts/圖片/AI 設定/系統設定），啟動同步 + 定時同步

## 📸 截圖展示

<div align="center">
  <p><strong>主介面</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="主介面"/>
  <br/><br/>
  <p><strong>畫廊視圖</strong></p>
  <img src="./imgs/2-gallery-view.png" width="80%" alt="畫廊視圖"/>
  <br/><br/>
  <p><strong>列表視圖</strong></p>
  <img src="./imgs/3-list-view.png" width="80%" alt="列表視圖"/>
  <br/><br/>
  <p><strong>資料備份</strong></p>
  <img src="./imgs/4-backup.png" width="80%" alt="資料備份"/>
  <br/><br/>
  <p><strong>主題設定</strong></p>
  <img src="./imgs/5-theme.png" width="80%" alt="主題設定"/>
  <br/><br/>
  <p><strong>雙語對照</strong></p>
  <img src="./imgs/6-double-language.png" width="80%" alt="雙語對照"/>
  <br/><br/>
  <p><strong>變數填充</strong></p>
  <img src="./imgs/7-variable.png" width="80%" alt="變數填充"/>
  <br/><br/>
  <p><strong>版本對比</strong></p>
  <img src="./imgs/8-version-compare.png" width="80%" alt="版本對比"/>
  <br/><br/>
  <p><strong>多語言支援</strong></p>
  <img src="./imgs/9-i18n.png" width="80%" alt="多語言支援"/>
</div>

## 📦 安裝說明

### 下載安裝

從 [Releases](https://github.com/legeling/PromptHub/releases) 下載對應平台的安裝包：

| 平台 | 檔案 |
|----------|----------|
| macOS (Intel) | `PromptHub-x.x.x-x64.dmg` |
| macOS (Apple Silicon) | `PromptHub-x.x.x-arm64.dmg` |
| Windows | `PromptHub-Setup-x.x.x-x64.exe` |
| Linux | `PromptHub-x.x.x.AppImage` / `.deb` |

### macOS 首次啟動

由於應用程式未經 Apple 公證，首次啟動時可能會看到 **「PromptHub 已損壞，無法打開」** 或 **「無法驗證開發者」** 的提示。

**解決方案（推薦）**：打開終端機，執行以下命令來繞過 Gatekeeper：

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

> 💡 **提示**：如果應用程式安裝在其他位置，請將路徑替換為實際安裝路徑。

**或者**：打開「系統設定」→「隱私與安全性」→ 向下捲動到安全性區域 → 點擊「仍要打開」。

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS 安裝"/>
</div>

### 從原始碼建置

```bash
# 複製儲存庫
git clone https://github.com/legeling/PromptHub.git
cd PromptHub

# 安裝依賴
pnpm install

# 開發模式
pnpm dev

# 建置應用程式
pnpm build
```

## 🚀 快速開始

### 1. 建立 Prompt

點擊「新增」按鈕，填寫：
- **標題** - Prompt 名稱
- **描述** - 簡短的使用說明
- **System Prompt** - 設定 AI 角色（可選）
- **User Prompt** - 實際的提示詞內容
- **標籤** - 用於分類和搜尋

### 2. 使用變數

在 Prompt 中使用 `{{變數名}}` 語法：

```
請將以下 {{來源語言}} 文字翻譯成 {{目標語言}}：

{{文字}}
```

### 3. 複製使用

選擇一個 Prompt，點擊「複製」即可將內容複製到剪貼簿。

### 4. 版本管理

編輯歷史會自動儲存。點擊「歷史」可查看並還原到之前的版本。

## 🛠️ 技術架構

| 類別 | 技術 |
|----------|------------|
| 框架 | Electron 33 |
| 前端 | React 18 + TypeScript 5 |
| 樣式 | TailwindCSS |
| 狀態管理 | Zustand |
| 本地儲存 | IndexedDB + SQLite |
| 建置工具 | Vite + electron-builder |

## 📁 專案結構

```
PromptHub/
├── src/
│   ├── main/           # Electron 主程序
│   ├── preload/        # 預載入腳本
│   ├── renderer/       # React 渲染程序
│   │   ├── components/ # UI 元件
│   │   ├── stores/     # Zustand 狀態管理
│   │   ├── services/   # 資料庫服務
│   │   └── styles/     # 全域樣式
│   └── shared/         # 共用型別
├── resources/          # 靜態資源
└── package.json
```

## 📈 Star 歷史

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## 🗺️ 開發路線圖

### 已完成功能
- [x] Prompt 增刪改查
- [x] 資料夾和標籤系統
- [x] 收藏功能
- [x] 版本歷史
- [x] 資料匯入匯出
- [x] 主題自訂（深色/淺色/跟隨系統）
- [x] 多語言支援
- [x] WebDAV 同步
- [x] Windows 無邊框視窗
- [x] 資料夾拖曳排序
- [x] AI 模型設定（18+ 服務商）
- [x] AI 連線測試與模型對比
- [x] 多模型設定管理
- [x] 完整國際化支援
- [x] 應用程式內自動更新
- [x] 變數填充介面
- [x] 最小化到系統匣
- [x] Linux 平台支援
- [x] 編輯器行號
- [x] 列表檢視模式
- [x] AI 測試結果持久化
- [x] 排序功能
- [x] Markdown 預覽
- [x] 主密碼與私密資料夾
- [x] 圖片上傳與預覽

### 未來規劃
- [ ] 私密資料夾資料加密（AES-256）
- [ ] Web 版本（Docker/Cloudflare 部署）
- [ ] Prompt 範本市場
- [ ] 瀏覽器擴充功能

## 📝 更新日誌

查看完整的更新日誌：**[CHANGELOG.md](../CHANGELOG.md)**

### 最新版本 v0.2.7 (2025-12-16)

**新功能**
- ⌨️ 全域快捷鍵：自訂快捷鍵喚起應用程式、新建 Prompt、搜尋、開啟設定
- ⌨️ 快捷鍵衝突檢測：自動檢測並提示快捷鍵衝突
- 🎨 生圖模型擴充：新增 Google Gemini 和 Stability AI
- 💾 未儲存更改提醒：編輯時關閉會提示儲存/放棄/取消

**優化**
- 🌐 完善多語言翻譯（中/英/日/德/法/西/繁體中文）
- 🎨 圖片下載失敗使用自訂 Toast 提示

> 📋 [查看完整更新日誌](../CHANGELOG.md)

## 🤝 貢獻指南

歡迎貢獻！請按照以下步驟：

1. Fork 此儲存庫
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權條款

本專案採用 [AGPL-3.0 授權條款](../LICENSE)。

## 💬 支援

- **問題回報**：[GitHub Issues](https://github.com/legeling/PromptHub/issues)
- **討論區**：[GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 🙏 致謝

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Lucide](https://lucide.dev/)
- 所有幫助改進 PromptHub 的[貢獻者](https://github.com/legeling/PromptHub/graphs/contributors)！

---

<div align="center">
  <p><strong>如果這個專案對你有幫助，請給它一個 ⭐！</strong></p>
  
  <a href="https://www.buymeacoffee.com/legeling" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
  </a>
</div>

---

## ☕ 贊助支持 / Sponsor

如果 PromptHub 對你的工作有幫助，歡迎請作者喝杯咖啡 ☕

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
    </tr>
  </table>
</div>

📧 **聯絡信箱 / Contact**: legeling567@gmail.com

感謝每一位支持者！你們的支持是我持續開發的動力！

<div align="center">
  <p>由 <a href="https://github.com/legeling">legeling</a> 用 ❤️ 製作</p>
</div>

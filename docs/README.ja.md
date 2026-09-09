<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />

# PromptHub

プロンプト・Skill・AI コーディング資産のためのローカルファースト ワークスペース。

  <br/>

[![GitHub Stars](https://img.shields.io/github/stars/legeling/PromptHub?style=for-the-badge&logo=github&color=yellow)](https://github.com/legeling/PromptHub/stargazers)
[![Downloads](https://img.shields.io/github/downloads/legeling/PromptHub/total?style=for-the-badge&logo=github&color=blue)](https://github.com/legeling/PromptHub/releases)
[![Version](https://img.shields.io/badge/release-v0.5.9_stable-22C55E?style=for-the-badge)](https://github.com/legeling/PromptHub/releases/latest)
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
    <img src="https://img.shields.io/badge/📥_ダウンロード-Releases-blue?style=for-the-badge&logo=github" alt="Download"/>
  </a>
</div>

<br/>

PromptHub はあなたのプロンプト、SKILL.md、プロジェクトレベルの AI コーディング資産を 1 つのローカルワークスペースにまとめます。同じ Skill を Claude Code、Cursor、Codex、Windsurf、Antigravity など十数のツールへワンクリックでインストールでき、プロンプトのバージョン履歴とマルチモデルテスト、WebDAV による別端末への同期、セルフホスト Web への完全スナップショット保存を備えています。

データは既定であなたのマシンに置かれます。

---

## 目次

- [デスクトップ版ダウンロード](#install)
- [スクリーンショット](#screenshots)
- [機能](#features)
- [はじめに](#quick-start)
- [セルフホスト Web](#self-hosted-web)
- [CLI](#cli)
- [変更履歴](#changelog)
- [ロードマップ](#roadmap)
- [ソースから実行](#dev)
- [リポジトリ構成](#project-structure)
- [貢献とドキュメント](#contributing)
- [ライセンス / クレジット / コミュニティ](#meta)

---

| 模型服务合作伙伴                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **本プロジェクトのスポンサーである APIMart に感謝します！**<br><br>[![APIMart — AI 画像・動画生成に特化した低価格 API プラットフォーム](./imgs/sponsors/apimart-banner-en.png)](https://go.apimart.ai/gh-prompthub)<br><br>APIMart は AI 画像・動画生成に特化した低価格 API プラットフォームです。GPT-Image-2 は **1 枚あたり 0.006 米ドルから**、**1 米ドルで 160 枚以上**の画像を生成できます。<br><br>画像と動画の両方に対応する共通の非同期 API：タスクを送信して ID を取得し、ポーリングまたはコールバックで結果を受け取れます。数万枚の画像もタイムアウトなしでバッチ処理でき、コードを変更せずにモデルを切り替えられます。<br><br>月額料金なしの従量課金。[こちらから登録](https://go.apimart.ai/gh-prompthub)して、すぐに使い始められます。                                                                                                                                                                                                        |
| **PromptHub × infistar.cc 无限星河｜全模型 API · 高效管理与测试 AI 资产**<br><br>[![Infistar.cc 一站式全球大模型 API 服务平台](./imgs/sponsors/infistar-banner.png)](https://infistar.cc/register?aff=RX9CVLVQ&ref_source=link)<br><br>感谢 Infistar.ai 无限星河 赞助并为 PromptHub 提供模型服务支持！<br><br>⚡ 稳定支持多模型测试：提供企业级高并发通道与多节点冗余，价格低至官方渠道 1 折，满足 Prompt 测试、AI生成、翻译润色及多模型并行对比等场景。<br><br>🧠 一个 API Key 接入主流模型：全面支持 ChatGPT、Claude、Gemini、Kimi、GLM、DeepSeek 等模型，兼容 OpenAI 标准接口，可在 PromptHub 中快速完成Provider与模型配置。<br><br>🛠️ 赋能Prompt与Skill工作流：适用于Prompt优化、Skill生成、图片Prompt反推及不同模型效果对比，帮助用户更高效地管理和复用AI编程资产。<br><br>🎁 PromptHub用户专属福利：通过 [专属推广链接](https://infistar.cc/register?aff=RX9CVLVQ&ref_source=link) 注册并完成首次调用，即可领取 [5美元等值测试额度 / 首充专属优惠]！ |

---

<div id="install"></div>

## 📥 デスクトップ版ダウンロード

最新安定版は **v0.5.9** です。直リンクは GitHub Latest の安定版アセットを指し、ミラー同期後は固定ファイル名の CDN リンクに戻ります:

- **直接ダウンロード** — GitHub Latest の安定版アセットを指します。CDN ミラーが空の間の 404 を避け、ミラー同期後は固定ファイル名の CDN リンクに戻ります。
- **GitHub Releases** — 公式リリースページ。過去のバージョン、署名、完全なリリースノートを確認できます。

| プラットフォーム | 直接ダウンロード                                                                                                                                                                                                                                                                                                                                                                                                                        | GitHub Releases                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows          | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.9-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.9-arm64.exe) | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.9-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.9-arm64.exe) |
| macOS            | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-x64.dmg)     | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-x64.dmg)     |
| Linux            | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-amd64.deb)              | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.9-amd64.deb)              |
| プレビュー       | [![現在のプレビュー](https://img.shields.io/badge/Preview-v0.6.0--beta.2-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/legeling/PromptHub/releases/tag/v0.6.0-beta.2)                                                                                                                                                                                                                                     | [GitHub Prerelease v0.6.0-beta.2](https://github.com/legeling/PromptHub/releases/tag/v0.6.0-beta.2)                                                                                                                                                                                                                                                                                                                                     |

> **macOS の arch?** Apple Silicon（M1/M2/M3/M4）→ `arm64`、Intel Mac → `x64`。
> **Windows の arch?** ほとんどのマシン → `x64`。Surface Pro X など ARM 機のみ → `arm64`。

### macOS で Homebrew からインストール

```bash
brew tap legeling/tap
brew install --cask prompthub
```

アップグレードは `brew upgrade --cask prompthub` を使用します。Homebrew とアプリ内自動更新を併用しないでください。Homebrew 側のバージョン記録と実際のインストールがずれる可能性があります。

### macOS セキュリティ検証

macOS パッケージは Developer ID で署名され、Apple のノータリゼーションを通過します。GitHub Releases、公式ミラー、または Homebrew からインストールしてください。macOS が引き続き検証できない場合は、現在の Release DMG を再ダウンロードして再インストールしてください。

初期の `0.5.9` プレビュー版やそれ以前の履歴ビルドは、署名とノータリゼーションが完了していない場合があります。これらの履歴ビルドを意図してダウンロードし、macOS が「壊れている」または「開発元を検証できません」と表示する場合は、次を実行してください:

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

その後、再度開いてください。別の場所にインストールしている場合はパスを置き換えてください。

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS インストール警告"/>
</div>

### プレビューチャンネル

次の開発プレビュー版を試したいですか？「設定 → このアプリについて」でプレビューチャンネルをオンにすると、GitHub Prereleases から取得します。オフに戻せば安定版に戻ります。新しいプレビューから古い安定版へ自動ダウングレードはされません。

<div id="screenshots"></div>

## スクリーンショット

> 以下のスクリーンショットは、現在の安定版 0.5.9 の 5 つのデスクトップワークスペース、Prompt、Skill、MCP、Plugin、Rules をカバーしています。

<div align="center">
  <p><strong>2 カラムのホーム</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="メイン画面"/>
  <br/><br/>
  <p><strong>Skill ストア</strong></p>
  <img src="./imgs/10-skill-store.png" width="80%" alt="Skill ストア"/>
  <br/><br/>
  <p><strong>Skill 詳細とワンクリックでのプラットフォームインストール</strong></p>
  <img src="./imgs/11-skill-platform-install.png" width="80%" alt="Skill プラットフォームインストール"/>
  <br/><br/>
  <p><strong>MCP ワークスペース</strong></p>
  <img src="./imgs/18-mcp-workspace.png" width="80%" alt="MCP ワークスペース"/>
  <br/><br/>
  <p><strong>Plugin ワークスペース</strong></p>
  <img src="./imgs/19-plugin-workspace.png" width="80%" alt="Plugin ワークスペース"/>
  <br/><br/>
  <p><strong>Rules ワークスペース</strong></p>
  <img src="./imgs/13-rules-workspace.png" width="80%" alt="Rules ワークスペース"/>
  <br/><br/>
  <p><strong>プロジェクト Skill ワークスペース</strong></p>
  <img src="./imgs/14-skill-projects.png" width="80%" alt="プロジェクト Skill ワークスペース"/>
  <br/><br/>
  <p><strong>Quick Add（手動 / 分析 / AI 生成）</strong></p>
  <img src="./imgs/15-quick-add-ai.png" width="80%" alt="Quick Add"/>
  <br/><br/>
  <p><strong>外観とモーションの設定</strong></p>
  <img src="./imgs/17-appearance-motion.png" width="80%" alt="外観設定"/>
</div>

<div id="features"></div>

## 機能

### 📝 Prompt 管理

- フォルダ・タグ・お気に入りの 3 層整理、ドラッグ並べ替え、CRUD 完備
- テンプレート変数 `{{variable}}` — コピー / テスト / 配布時にフォームで入力
- 全文検索（FTS5）、Markdown レンダリングとコードハイライト、添付・メディアプレビュー
- デスクトップのカード表示はダブルクリックでユーザープロンプト・システムプロンプトをインライン編集

### 🧩 Skill ストアとワンクリック配布

- **Skill ストア**：Anthropic、OpenAI などからの 20+ 厳選スキルを内蔵、カスタムソース（GitHub / skills.sh / ローカルフォルダ）も追加可能
- **ワンクリック配布**：Claude Code、Cursor、Windsurf、Codex、Antigravity、Kiro、Kilo Code、Qoder、QoderWork、CodeBuddy、Trae、OpenCode など 15+ プラットフォーム。Gemini は Enterprise と有料 API の互換ターゲットとしてのみ保持されます
- **ローカルスキャン**：既存の SKILL.md を自動検出し、複数のツールディレクトリ間でのコピペを不要に
- **Symlink / Copy 両モード**：symlink で共有編集、copy で各プラットフォームに独立コピー
- **プラットフォームごとの保存先上書き**：プラットフォームごとに Skills ディレクトリを設定でき、スキャンと配布が一致
- **AI 翻訳 & 校正**：完全な SKILL.md 単位で sidecar 訳文を生成、対訳ビューと全文翻訳に対応
- **セーフティポリシー**：インストール・更新時の内容/AI スキャンを全体、チャネル、個別ストア単位で設定可能。無効化してもパス、アーカイブ、シンボリックリンク、サイズ、必須ファイル、指紋の検証は常に実行
- **GitHub トークン**：ストアとリポジトリインポートで認証に対応し、匿名レート制限を回避
- **タグフィルタ**：インストール済みおよびストアのスキルをタグで絞り込み

### 📐 Rules（AI コーディングルール）

- `.cursor/rules`、`.claude/CLAUDE.md`、AGENTS.md などのルールファイルを一元管理
- 手動で追加したプロジェクトルールはディレクトリ単位でグループ化
- ZIP エクスポート / WebDAV / セルフホストのバックアップ・復元 / Web インポート・エクスポートと連携

### 🤖 プロジェクトと Agent 資産ワークスペース

- プロジェクト内の `.claude/skills`、`.agents/skills`、`skills`、`.gemini` などの一般的なディレクトリをスキャン
- プロジェクトごとに独立した Skill ワークスペースを作成し、グローバルライブラリと分離
- 個人ライブラリ・ローカルリポジトリ・プロジェクト資産を 1 画面で切替、ツールディレクトリ間の往復が不要に
- グローバルなプロンプトタグ管理：検索 / リネーム / 結合 / 削除をデータベースとワークスペースファイルに同時反映

### 🧪 AI テストと生成

- 主要な海外・国内プロバイダ（OpenAI、Anthropic、Gemini、Azure、カスタム endpoint など）に対応した AI テスト内蔵
- 同一プロンプトを複数モデルで並行テスト、テキストおよび画像モデルに対応
- AI による Skill 生成・校正、Quick Add から構造化プロンプトドラフトを直接生成
- 統一されたエンドポイント管理と接続テスト、エラーは 504 / タイムアウト / 未設定まで具体化

### 🕒 バージョン管理と履歴

- プロンプト保存ごとに自動的にバージョン記録、差分ハイライトとワンクリックロールバック
- Skill にも独自のバージョン履歴があり、命名バージョン作成・差分表示・バージョン単位のロールバックが可能
- Rules のスナップショット履歴をプレビューしドラフトに復元
- ストアからインストールした Skill はコンテンツハッシュを保存、リモート SKILL.md の変更を検知してローカル変更との競合を保護

### 💾 データ・同期・バックアップ

- ローカルファースト：すべてのデータは既定であなたのマシン上に保存
- `.phub.gz` 圧縮形式でフルバックアップ / リストア
- WebDAV 同期（Nextcloud などに対応）
- WebDAV / S3 のライブ同期は選択した 1 つのソースだけを使用し、複数ライターの競合を防止
- セルフホスト PromptHub Web は変更不可のスナップショットを独立保存。起動時と定期処理はアップロードのみで、ローカルデータを自動取得・上書きしない
- バックアップには Desktop と Web の完全なバージョン一致が必要。復元は明示操作で、先にローカル安全スナップショットを作成

### 🔐 プライバシーとセキュリティ

- マスターパスワードによるアプリ入口の保護、AES-256-GCM 暗号化
- プライベートフォルダの暗号化保存（Beta）
- クロスプラットフォームでオフライン利用可能：macOS / Windows / Linux
- 7 言語の UI：簡体中文、繁體中文、English、日本語、Deutsch、Español、Français

<div id="quick-start"></div>

## はじめに

1. **最初のプロンプトを作成。**「+ 新規」をクリックし、タイトル、説明、システムプロンプト、ユーザープロンプトを入力します。`{{name}}` は変数になり、コピーやテスト時にフォームで入力できます。

2. **Skill を取り込む。** Skills タブを開き、ストアからいくつか選ぶか、「ローカルスキャン」でマシン上の既存 SKILL.md を取り込みます。

3. **AI ツールにインストール。** Skill 詳細画面でターゲットプラットフォームを選択。PromptHub は SKILL.md をプラットフォーム所定のディレクトリに、symlink（ライブ編集）または独立コピーでインストールします。

4. **同期またはバックアップ（任意）。**「設定 → データ」で WebDAV / S3 のライブ同期、またはセルフホスト PromptHub Web の独立復元スナップショットを設定できます。

<div id="self-hosted-web"></div>

## セルフホスト Web

PromptHub Web は NAS、VPS、LAN マシン上で Docker により実行できる軽量なブラウザ向けコンパニオンです。マネージドクラウドサービスでは**ありません**。次のような用途に向きます:

- ブラウザから PromptHub のデータにアクセス
- Web のライブワークスペースを変更せず、デスクトップの復元スナップショットを保存
- データを自分のネットワーク内に留める

```bash
cd apps/web
cp .env.example .env
docker compose up -d --build
```

`.env` で最低限設定する項目:

- `JWT_SECRET`：32 文字以上のランダム文字列
- `ALLOW_REGISTRATION=false`：最初の管理者を作成した後はオフに保つことを推奨
- `DATA_ROOT`：データルート、配下に `data/`、`config/`、`logs/`、`backups/` が作成されます

既定: `http://localhost:3871`。最初のアクセスは `/setup` に遷移、最初の登録ユーザーが管理者になります。

デスクトップから接続:「設定 → データ → Self-Hosted PromptHub」。バージョンとバックアップ機能を確認し、リモートスナップショットの作成、最新スナップショットの明示復元、アップロード専用の起動時 / 定期バックアップを設定できます。自動処理はローカルデータを取得、マージ、置換しません。

詳細なデプロイ / アップグレード / バックアップ / GHCR イメージ / 開発メモは [`web-self-hosted.md`](./web-self-hosted.md) に記載しています。

<div id="cli"></div>

## CLI

CLI はスクリプト化、バッチインポート/エクスポート、自動化に適しています。デスクトップ版は `prompthub` シェルコマンドを**自動でインストールしません**。リポジトリでパックして自分でインストールしてください:

```bash
pnpm pack:cli
pnpm add -g ./apps/cli/prompthub-cli-*.tgz
prompthub --help
```

インストールせずソースから実行することも可能:

```bash
pnpm --filter @prompthub/cli dev -- prompt list
pnpm --filter @prompthub/cli dev -- skill scan
```

リソースコマンド一覧（各コマンドに `--help` あり）:

```text
prompt    list / get / create / update / delete / duplicate / search
          versions / create-version / delete-version / diff / rollback
          use / copy
          list-tags / rename-tag / delete-tag

folder    list / get / create / update / delete / reorder

agent     list / get / enable / disable
          add / update / configure / reset / delete
          config list|read（読み取り専用、機密値をマスク）
          identity get|set

rules     list / scan / read / save / rewrite
          versions / version-read / version-restore / version-delete
          add-project / remove-project
          export / import

skill     list / get / import（互換エイリアス: install）/ delete / remove
          versions / create-version / rollback / delete-version
          export / scan / scan-safety / sync-from-repo
          platforms / platform-status / distribute / undistribute
          （互換エイリアス: install-md / uninstall-md）
          repo-files / repo-read / repo-write / repo-delete / repo-mkdir / repo-rename

ai        providers / provider-add / provider-delete
          models / model-add / model-delete
          routes / route-set / route-clear

workspace export / import

doctor    database-lock [--recover]
```

Skill のインポート、バージョンスナップショット、配布では、組み込みの除外規則とルートの `.prompthubignore` を共通で使用し、書き込み前に秘密鍵、アクセストークン、パスワードの疑いがある内容をブロックします。成功時の出力はデフォルトで上限付きの要約です。Skill 本文や完全なファイルスナップショットが必要な場合だけ `--full` を指定してください。

よく使うグローバルフラグ:

- `--output json|table` — 出力形式
- `--summary` — 上限付きの要約を返す（デフォルト）
- `--full` — 完全なリソース内容を返す
- `--quiet` — 成功時の stdout を抑制し、エラーは stderr に残す
- `--data-dir <path>` — PromptHub の `userData` ディレクトリを上書き
- `--app-data-dir <path>` — アプリケーションデータルートを上書き
- `--version|-v` — CLI バージョンを表示

<div id="changelog"></div>

## 変更履歴

完全な変更履歴: **[CHANGELOG.md](../CHANGELOG.md)**

### v0.6.0-beta.2（2026-09-03、プレビュー）

- 画像ワークベンチに画像全体の編集、生成結果からの継続、GPT Image 編集、キャンバスを覆わない詳細パネルを追加
- Git がない環境では、公開 GitHub、GitLab.com、互換 Gitea の Skill を安全な HTTPS アーカイブで取得可能
- Rules 復元で外部編集と履歴を保持し、アップグレード安全点、バックアップ保持、混在 Prompt レイアウト復元を強化
- 更新元の自動/公式/ミラー切替、リリースノート、転送指標、macOS メニューバーの更新状態を追加
- Doubao Work Skill 対応を追加し、終了方法の保存と OpenCode のグローバルセッション検出を修正
- 最新の安定版は引き続き `v0.5.9`

### v0.6.0-beta.1（2026-08-20、差し替えプレビュー）

- 統合 Agent ワークベンチで Skills、MCP、Plugins、Rules、プロバイダー/モデル、設定ファイル、クォータ、履歴を一元管理します
- ファイル優先 canonical authority、復旧候補、self-heal、Windows `0.5.9` アップグレードのパッケージ 2 回起動 gate でプレビューデータを保護します
- 有界な SQLite 一時パスで上書きインストール後の 2 回目起動失敗を修正し、影響を受けたプレビューを同じ beta tag で差し替えます
- 旧 `v0.6.0-beta.1` をインストール済みの場合、同一バージョンの差し替えでは自動更新されないため、修正版を手動でダウンロードして上書きインストールする必要があります
- 最新安定版は引き続き `v0.5.9` です

### v0.5.9（2026-07-09、正式版）

- Plugin 管理を安定化：My Plugins / Plugin Store / Agent Plugin が Skill 風のインストール、詳細、バージョンスナップショット、ソース更新レビュー、一括操作、Agent 配布、子 Skill / MCP インポートに対応
- MCP 管理と同期を拡張：MCP ワークスペース、公式テンプレートストア、Agent ターゲット配布、ヘルスチェック、.env の選択インポート、CLI MCP コマンド、一括再同期設計を整理
- Agent アセット同期が My Skills、My MCP、My Plugins、Rules と関連データを自ホスト同期とバックアップ/復元に含めるようになりました
- Skill ソース更新は SHA-256 package fingerprint と三者照合に移行し、registry fingerprint、content-url baseline、URL credential redaction を修正
- Plugin ソース更新とストア一括更新は、ローカル package を置き換える前に差分表示と確認を要求します
- Prompt はカスタム出力形式シーケンスの構成、並べ替え、永続化、バックアップに対応しました
- macOS リリースフローは Developer ID 署名、公証、DMG/ZIP 検証、Gatekeeper チェックを強化しました

### v0.5.9-beta.1（2026-06-14、プレビュー）

- MCP 管理ワークスペースのプレビュー: ローカル MCP ライブラリ、公式テンプレートストア、Agent ターゲット配布、ヘルスチェック、選択的 .env インポート、CLI MCP コマンドを追加
- Prompt 関係ツリーと意味的関係: 既存のリスト/テーブルで親子化ドラッグ、展開/折りたたみ、親ラベル、子数、詳細ページの関係ナビゲーションをサポート
- Git Skill インポート修正: SSH GitHub スキャンはローカル clone を使い、URL 変更後は再スキャンでき、HTTPS レート制限では SSH 利用を案内
- Skill 画像リソースプレビューでホイールズーム、つかんでパン、右下固定コントロール、全画面プレビューをサポート
- Skill バージョン表示は v1 から始まり、詳細タイトルをクリックすると Skill 名をコピーできます

### v0.5.8 (2026-06-04)

- 画像 Prompt 逆生成の専用入口を追加し、視覚モデルで構造化された画像生成 Prompt を作成、保存前のプレビュー/コピーと参照画像の保持に対応
- AI モデル設定をプロバイダー、モデル能力、業務ルートに分けた三列構成へ整理
- ClawHub と skill.sh ストアにリモート検索、カテゴリ、ページング/読み込み、キャッシュ、完全な Skill パッケージインストールを追加
- My Skills、Project Skills、Agent Skills、プラットフォーム、copy / symlink、内蔵 Skill、外部 symlink を含む Skill ライフサイクルを強化
- GitHub / Gitea / self-hosted Git の更新チェック精度を改善し、一般的なキャッシュファイルを無視して誤検出を減らしました

### v0.5.8-beta.3 (2026-06-02, preview)

- Skill ソースファイル表示に軽量コードエディタを導入し、シンタックスハイライト、行番号、折り返し、より正確なファイルアイコンに対応
- GitHub から My Skills にインポートした Skill は、詳細ページからソース更新を確認し、適用前にバージョンスナップショットを作成できます
- Cherry Studio、Agent Skill、Project Skill、copy / symlink、built-in Skill、外部 symlink の状態をさらに強化
- Prompt / Skill のバージョン履歴ダイアログを、検索と比較に向いたテーブル表示へ改善

### v0.5.7 (2026-05-29)

- Prompt AI クイック編集: 詳細ページ、詳細モーダル、右クリックメニューで同じ AI リライトダイアログを共有し、下書きを確認してから適用できます
- 同名 Skill variant を正式サポートし、異なるソースの同名 Skill を統一された identity / container モデルで併存可能にしました
- バックアップ復元、リモート Git スキャン、AI Workbench の検証状態保持をさらに堅牢化しました

### v0.5.7-beta.2 (2026-05-28, preview)

- Git ストアソースが `branch / directory`、リモートブランチ候補、GitHub / SSH / セルフホスト Git リポジトリに対応
- プロジェクト Skill インポートが高度な `copy / symlink` モードとプロジェクト単位の設定記憶に対応
- Agent 管理と Skill プラットフォーム配布に `Kilo Code` を内蔵し、`Roo Code` を置き換え

### v0.5.7-beta.1 (2026-05-26, preview)

- built-in / custom agent の完全な設定モデルを統一し、`Skill Settings` から `root / skills / rules / agents / commands / config` を直接上書き可能に
- `Cline` と `Trae CN` の built-in プリセットを追加し、agent 設定変更時に Rules ワークスペースが即時更新
- Skill をプロジェクト内ローカル agent ディレクトリへ直接配布可能に。既定は `.agents/skills`、複数ターゲット選択にも対応
- symlink インストールが copy にフォールバックした場合、通常成功に見せず明示的な warning を表示
- Prompt 詳細のインライン編集はダブルクリックしたフィールドをそのまま開き、通常レイアウトに近い見た目を維持

### v0.5.6 (2026-05-12)

**新機能**

- 🧭 **Rules ワークスペース。** デスクトップ専用の Rules ページ。グローバルルールと手動追加のプロジェクトルールを一元管理。検索、スナップショットプレビュー、ドラフト復元、ZIP エクスポート / WebDAV / セルフホストのバックアップ・復元 / Web インポート・エクスポートを統合
- 📁 **プロジェクト Skill ワークスペース。** プロジェクトごとの Skill ワークスペースを作成、一般的な配置を自動スキャンしてプロジェクト文脈でプレビュー / インポート / 配布
- 🤖 **Quick Add で AI から直接プロンプトを生成。** 既存プロンプトの分析だけでなく、目的と制約から構造化プロンプトドラフトを生成
- 🏷️ **グローバルなプロンプトタグ管理。** サイドバーのタグ領域で集中検索 / リネーム / 結合 / 削除、データベースとワークスペースファイルに同期
- 🔐 **Skill ストアの GitHub トークン対応。** 認証付き GitHub クォータでストアおよびリポジトリインポートの匿名レート制限失敗を低減

**修正**

- ✍️ カード詳細でユーザー / システムプロンプトをダブルクリック編集に対応
- 🪟 アップデートダイアログのちらつき、ダウンロードボタンの不安定なクリック、`minimizeOnLaunch` がログイン時起動を尊重しない問題を修正
- ↔️ Skills 三列リサイズ、ダブルクリックリセット、タイトルの折り返し、ストア検索のリグレッション群
- 🔁 ZIP エクスポート / WebDAV / セルフホストのバックアップ・復元 / Web インポート・エクスポート間で Rules / Skill 付随ファイル / 管理コピーを整合
- 🖼️ セルフホスト Web のログインを使い捨て画像 CAPTCHA に切替

**改善**

- 🏠 2 カラムのホームレイアウトでモジュール表示切替、ドラッグ並べ替え、背景画像の独立トグルを安定化
- ☁️ アクティブな同期ソースを 1 つに限定し、複数ソース同時書き込みの競合を回避
- ✨ デスクトップレンダラに本格的なモーションシステム（duration / easing / scale トークン、4 種のインテントコンポーネント `<Reveal>` `<Collapsible>` `<ViewTransition>` `<Pressable>`、3 段階のユーザー設定）を導入。framer-motion を `tailwindcss-animate` に置き換え、`ui-vendor` チャンクの gzip サイズを 54 KB から 16 KB に削減
- 🪶 長いリスト（Skill リスト / Prompt ギャラリー / カンバン / インラインプロンプトリスト）を `@tanstack/react-virtual` で仮想化、自前の `setTimeout` ベースのチャンクレンダラを廃止

<div id="roadmap"></div>

## ロードマップ

### v0.5.9 ← 現在の安定版

- Plugin / MCP 管理はストア、Agent 配布、詳細、タグフィルタ、更新確認、安全チェックで Skill 体験に揃いました
- Agent アセット同期、ネットワークプロキシ、CLI プロジェクトインストール、Skill ソース更新チェックが安定版になりました
- Prompt 関係ツリー、Windows Agent パス、Web CAPTCHA 切替、macOS 署名/公証、リリースパイプライン修正を正式版ユーザーに提供します

### v0.5.8

- 画像 Prompt 逆生成、AI モデルのプロバイダー/能力/ルート設定、画像テストフローが安定版に入りました
- ストア、Git、Agent、プロジェクト、プラットフォーム、copy / symlink、内蔵 Skill のライフサイクルを整理しました
- ClawHub / skill.sh ストア、更新チェック、コード表示、ファイルアイコン、バージョン履歴を改善しました

### v0.5.7

- Prompt AI quick edit、同名 Skill variant、remote Git scan、AI Workbench verification を強化しました

### v0.5.6

上記の変更履歴を参照してください。

### v0.5.5

- Skill ストアインストール時にコンテンツハッシュを記録、リモート SKILL.md の変更検出とローカル編集の競合保護
- 完全ドキュメントの AI 翻訳を sidecar として永続化、全文翻訳と対訳の没入モード
- データパスの切替を真の relaunch で適用
- AI テスト / 翻訳のエラーメッセージを明確化（504 / タイムアウト / 未設定）
- Web/Docker のメディアアップロード修正、`local-image://` / `local-video://` 自動解決
- プレビュー更新ラインの強化
- Issue フォームに `version: x.y.z` ラベルを自動同期

### v0.4.x

- AI ワークベンチ：モデル管理、エンドポイント編集、接続テスト、シナリオ既定モデル
- skills.sh コミュニティストア統合、ランキング・インストール数・スター
- skill-installer のゴッドクラス分割、SSRF 対策、URL プロトコル検証
- 十数プラットフォーム（Claude Code、Cursor、Windsurf、Codex など）への Skill ワンクリックインストール
- AI 翻訳、AI による Skill 生成、ローカル一括スキャン

### 検討中 / 計画中

- [ ] ChatGPT / Claude のページ内で PromptHub を呼び出すブラウザ拡張
- [ ] モバイルコンパニオン：閲覧、検索、軽量編集と同期
- [ ] ローカルモデル（Ollama）やカスタム AI プロバイダ向けのプラグイン基盤
- [ ] Prompt ストア：コミュニティで検証されたプロンプトの再利用
- [ ] より複雑な変数型：選択ボックス、動的日付など
- [ ] ユーザーアップロードの Skill 共有

<div id="dev"></div>

## ソースから実行

Node.js ≥ 24 と pnpm 9 が必要です。

```bash
git clone https://github.com/legeling/PromptHub.git
cd PromptHub
pnpm install

# デスクトップ開発
pnpm electron:dev

# デスクトップビルド
pnpm build

# セルフホスト Web ビルド
pnpm build:web
```

`pnpm build` はデスクトップアプリのみをビルドします。Web は `pnpm build:web` を明示的に指定してください。

| コマンド                                         | 用途                                |
| ------------------------------------------------ | ----------------------------------- |
| `pnpm electron:dev`                              | Vite + Electron 開発環境            |
| `pnpm dev:web`                                   | Web 開発サーバ                      |
| `pnpm lint` / `pnpm lint:web`                    | Lint                                |
| `pnpm typecheck` / `pnpm typecheck:web`          | TypeScript チェック                 |
| `pnpm test -- --run`                             | デスクトップ単体・統合テスト        |
| `pnpm test:e2e`                                  | Playwright e2e                      |
| `pnpm verify:web`                                | Web lint + typecheck + test + build |
| `pnpm test:release`                              | デスクトップリリース前ゲート        |
| `pnpm --filter @prompthub/desktop bundle:budget` | デスクトップバンドルサイズチェック  |

<div id="project-structure"></div>

## リポジトリ構成

```text
PromptHub/
├── apps/
│   ├── desktop/   # Electron デスクトップアプリ
│   ├── cli/       # 独立 CLI（packages/core ベース）
│   └── web/       # セルフホスト Web
├── packages/
│   ├── core/      # CLI とデスクトップで共有するコアロジック
│   ├── db/        # 共有データレイヤー（SQLite スキーマ、クエリ）
│   └── shared/    # 共有型定義、IPC 定数、プロトコル定義
├── docs/          # 公開ドキュメント
├── spec/          # 内部 SSD / 設計仕様
├── website/       # マーケティングサイト
├── README.md
├── CONTRIBUTING.md
└── package.json
```

<div id="contributing"></div>

## 貢献とドキュメント

- 入口：[CONTRIBUTING.md](../CONTRIBUTING.md)
- フルガイド：[`docs/contributing.md`](./contributing.md)
- 公開ドキュメントインデックス：[`docs/README.md`](./README.md)
- 内部 SSD / spec：[`spec/README.md`](../spec/README.md)

文書の量はリスクに応じて決めます。既存の主題をその場で更新し、複数セッションにまたがる作業では必要に応じて計画を1つ残します。[文書ルール](../spec/rules/document-routing-rules.md)に従い、5つの変更文書を一律に作成する必要はありません。

<div id="meta"></div>

## ライセンス

[AGPL-3.0](../LICENSE)

## フィードバック

- Issue：[GitHub Issues](https://github.com/legeling/PromptHub/issues)
- アイデア：[GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 使用技術

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [TailwindCSS](https://tailwindcss.com/) · [Zustand](https://zustand-demo.pmnd.rs/) · [Lucide](https://lucide.dev/) · [@tanstack/react-virtual](https://tanstack.com/virtual) · [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)

## コントリビューター

PromptHub に貢献してくださったすべての方へ感謝します。

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

## Star History

<a href="https://star-history.dera.page/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <img alt="Star History" src="https://star-history.dera.page/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## コミュニティ

サポート、フィードバック、リリース情報、早期プレビューのために PromptHub コミュニティに参加してください。

<div align="center">
  <a href="https://discord.gg/zmfWguWFB">
    <img src="https://img.shields.io/badge/Discord-Join%20PromptHub%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join PromptHub Discord Community" />
  </a>
  <p><strong>Discord が推奨チャンネル：お知らせ・サポート・リリース情報</strong></p>
</div>

<br/>

### QQ グループ（中国語）

QQ をお使いの場合は PromptHub QQ グループにも参加できます:

- グループ ID：`704298939`

<div align="center">
  <img src="./imgs/qq-group.jpg" width="320" alt="PromptHub QQ グループ QR"/>
  <p><strong>QR を読み取って PromptHub QQ グループに参加</strong></p>
</div>

## スポンサー

PromptHub があなたの作業に役立っているなら、開発者にコーヒーを 1 杯どうぞ。

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./imgs/donate/wechat.png" width="200" alt="WeChat Pay"/>
        <br/>
        <b>WeChat Pay</b>
      </td>
      <td align="center">
        <img src="./imgs/donate/alipay.jpg" width="200" alt="Alipay"/>
        <br/>
        <b>Alipay</b>
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

連絡先：legeling567@gmail.com

過去のスポンサーは [`docs/sponsors.md`](./sponsors.md) にアーカイブしています。

---

<div align="center">
  <p>PromptHub が役に立ったら ⭐ をつけてもらえると嬉しいです。</p>
</div>

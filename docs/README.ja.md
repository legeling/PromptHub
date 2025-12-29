<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="120" height="120" />
  <h1>PromptHub</h1>
  <p><strong>🚀 オープンソース、ローカルファーストの AI プロンプトマネージャー</strong></p>
  <p>効率的な管理、バージョン管理、変数入力、マルチモデルテスト — プロンプトワークフローをこれ一つで</p>
  
  <p>
    <a href="https://github.com/legeling/PromptHub/stargazers"><img src="https://img.shields.io/github/stars/legeling/PromptHub?style=flat-square&color=yellow" alt="GitHub Stars"/></a>
    <a href="https://github.com/legeling/PromptHub/network/members"><img src="https://img.shields.io/github/forks/legeling/PromptHub?style=flat-square" alt="GitHub Forks"/></a>
    <a href="https://github.com/legeling/PromptHub/releases"><img src="https://img.shields.io/badge/version-v0.3.4-green?style=flat-square" alt="Version"/></a>
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

> 💡 **なぜ PromptHub なのか？**
> 
> ノートやドキュメント、チャット履歴からプロンプトを探し回るのに疲れていませんか？PromptHub は、プロンプトをコードのように管理できます — バージョン管理、変数テンプレート、マルチモデルテスト。すべてのデータはローカルに保存され、プライバシーも万全です。

---

## 📥 ダウンロード

<div align="center">
  <a href="https://github.com/legeling/PromptHub/releases">
    <img src="https://img.shields.io/badge/📥_今すぐダウンロード-Releases-blue?style=for-the-badge" alt="Download"/>
  </a>
</div>

> 💡 上のボタンをクリックして Releases ページへ移動し、各プラットフォーム用のインストールパッケージをダウンロードしてください。Windows / macOS / Linux をサポートしています。

| プラットフォーム | アーキテクチャ | 形式 |
|:---:|:---:|:---:|
| **Windows** | x64 | `.exe` インストーラー |
| **macOS** | Apple Silicon (M1/M2/M3) | `.dmg` イメージ |
| **macOS** | Intel | `.dmg` イメージ |
| **Linux** | x64 | `.AppImage` / `.deb` |

---

## ✨ 機能紹介

- **📝 プロンプト管理** - 作成、編集、削除。フォルダとタグによる整理が可能
- **⭐ お気に入り** - よく使うプロンプトに素早くアクセス
- **🔄 バージョン管理** - 履歴を自動保存。過去バージョンの閲覧、比較、復元をサポート
- **🔧 変数システム** - テンプレート変数 `{{variable}}` による動的な置換
- **📋 ワンクリックコピー** - プロンプト内容を素早くクリップボードにコピー
- **🔍 全文検索** - タイトル、説明、内容から高速検索
- **📤 エクスポートとバックアップ** - 選択エクスポート + フルバックアップ/復元（`.phub.gz` 形式。画像、AI設定、システム設定を含む）
- **🎨 テーマのカスタマイズ** - ダーク/ライト/システム設定。複数のアクセントカラーから選択可能
- **🌐 多言語対応** - 日本語、英語、中国語（簡体・繁体）、スペイン語、ドイツ語、フランス語をサポート
- **💾 ローカルストレージ** - すべてのデータはローカルに保存され、プライバシーを保護
- **🖥️ クロスプラットフォーム** - macOS, Windows, Linux をサポート
- **📊 リストビュー** - テーブル形式の表示。ソートや一括操作をサポート
- **🤖 AI テスト** - 18以上のプロバイダーによるマルチモデルテストを内蔵
- **🎨 画像生成モデル** - 画像生成モデル（DALL-E など）の設定とテストをサポート
- **🧭 Markdown プレビュー** - 詳細、リスト、編集のすべての画面で Markdown レンダリングとコードハイライトに対応
- **🪟 ワイド・全画面モード** - 編集体験を最適化するワイドおよび全画面モード
- **🔐 マスターパスワードとプライベートフォルダ** - マスターパスワードによるプライベートコンテンツの保護
- **🖼️ 画像のアップロードとプレビュー** - ローカル画像のアップロード/貼り付けとプレビューに対応
- **☁️ WebDAV 同期** - WebDAV による同期をサポート（画像・設定を含む。起動時および定期同期に対応）

## 📸 スクリーンショット

<div align="center">
  <p><strong>メイン画面</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="メイン画面"/>
  <br/><br/>
  <p><strong>ギャラリービュー</strong></p>
  <img src="./imgs/2-gallery-view.png" width="80%" alt="ギャラリービュー"/>
  <br/><br/>
  <p><strong>リストビュー</strong></p>
  <img src="./imgs/3-list-view.png" width="80%" alt="リストビュー"/>
  <br/><br/>
  <p><strong>データバックアップ</strong></p>
  <img src="./imgs/4-backup.png" width="80%" alt="データバックアップ"/>
  <br/><br/>
  <p><strong>テーマ設定</strong></p>
  <img src="./imgs/5-theme.png" width="80%" alt="テーマ設定"/>
  <br/><br/>
  <p><strong>二ヶ国語対照</strong></p>
  <img src="./imgs/6-double-language.png" width="80%" alt="二ヶ国語対照"/>
  <br/><br/>
  <p><strong>変数の入力</strong></p>
  <img src="./imgs/7-variable.png" width="80%" alt="変数の入力"/>
  <br/><br/>
  <p><strong>バージョン比較</strong></p>
  <img src="./imgs/8-version-compare.png" width="80%" alt="バージョン比較"/>
  <br/><br/>
  <p><strong>多言語サポート</strong></p>
  <img src="./imgs/9-i18n.png" width="80%" alt="多言語サポート"/>
</div>

## 📦 インストール方法

### ダウンロード

[Releases](https://github.com/legeling/PromptHub/releases) からお使いのプラットフォーム用のインストーラーをダウンロードしてください：

| プラットフォーム | ダウンロードファイル |
|----------|----------|
| macOS (Intel) | `PromptHub-0.3.4-x64.dmg` |
| macOS (Apple Silicon) | `PromptHub-0.3.4-arm64.dmg` |
| Windows | `PromptHub-Setup-0.3.4-x64.exe` |
| Linux | `PromptHub-0.3.4-x64.AppImage` / `prompthub_0.3.4_amd64.deb` |

### macOS での初回起動について

本アプリは Apple の公証を受けていないため、初回起動時に「**PromptHubは壊れているため開けません**」や「**開発元を検証できないため開けません**」と表示される場合があります。

**解決方法（推奨）**: ターミナルを開き、以下のコマンドを実行して公証チェックを回避してください：

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

> 💡 **ヒント**: アプリを別の場所にインストールした場合は、実際のパスに置き換えてください。

**または**: 「システム設定」→「プライバシーとセキュリティ」→ セキュリティセクションまでスクロールし、「このまま開く」をクリックしてください。

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS インストール"/>
</div>

### ソースからのビルド

```bash
# リポジトリをクローン
git clone https://github.com/legeling/PromptHub.git
cd PromptHub

# 依存関係のインストール
pnpm install

# 開発モード
pnpm dev

# アプリのビルド
pnpm build
```

## 🚀 クイックスタート

### 1. プロンプトの作成

「新規作成」ボタンをクリックし、以下を入力します：
- **タイトル** - プロンプトの名前
- **説明** - 用途の簡単な説明
- **System Prompt** - AI の役割設定（任意）
- **User Prompt** - 実際のプロンプト内容
- **タグ** - 分類と検索用

### 2. 変数の使用

プロンプト内で `{{変数名}}` 構文を使用して変数を定義できます：

```
以下の {{source_lang}} のテキストを {{target_lang}} に翻訳してください：

{{text}}
```

### 3. コピーして使用

プロンプトを選択して「コピー」をクリックすると、内容がクリップボードにコピーされます。

### 4. バージョン管理

編集履歴は自動的に保存されます。「履歴」をクリックして過去バージョンの閲覧や復元が可能です。

## 🛠️ 技術スタック

| カテゴリ | 使用技術 |
|----------|------------|
| フレームワーク | Electron 33 |
| フロントエンド | React 18 + TypeScript 5 |
| スタイリング | TailwindCSS |
| 状態管理 | Zustand |
| ローカル保存 | IndexedDB + SQLite |
| ビルドツール | Vite + electron-builder |

## 📁 プロジェクト構造

```
PromptHub/
├── src/
│   ├── main/           # Electron メインプロセス
│   ├── preload/        # プリロードスクリプト
│   ├── renderer/       # React レンダラープロセス
│   │   ├── components/ # UI コンポーネント
│   │   ├── stores/     # Zustand 状態管理
│   │   ├── services/   # データベースサービス
│   │   └── styles/     # グローバルスタイル
│   └── shared/         # 共通の型定義
├── resources/          # 静的アセット
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

## 🗺️ ロードマップ

### v0.3.4 (現在のバージョン)
- [x] **多階層フォルダ**: 無制限のフォルダ階層化とドラッグ＆ドロップ管理をサポート
- [x] **バージョン管理システム**: コードのようにプロンプトを管理。履歴比較とワンクリック復元が可能
- [x] **変数テンプレートシステム**: `{{variable}}` 構文をサポートし、入力フォームを自動生成。コピー前のプレビューも可能
- [x] **マルチモデル・ラボ**: 18以上のプロバイダーを内蔵。複数モデルの並列比較テストと応答時間分析をサポート
- [x] **デバイス間同期**: WebDAVによる増分同期とフルバックアップをサポートし、データを高度に制御
- [x] **究極の閲覧体験**: Markdownのフルレンダリング、コードハイライト、二ヶ国語対照モードをサポート
- [x] **多次元の効率管理**: フォルダ、タグ、お気に入り、使用統計、全文スコアリング検索による整理
- [x] **マルチビューモード**: カード、リスト、ギャラリーの3つのビューを提供し、様々なシーンに対応
- [x] **システムへの深い統合**: グローバルショートカット、システムトレイへの最小化、ダークモード対応
- [x] **ミラーサイト対応**: 複数の GitHub 加速ミラーを内蔵し、アップデートのダウンロード速度を大幅に向上
- [x] **セキュリティとプライバシー**: マスターパスワード保護、暗号化されたプライベートフォルダ。ローカルファーストを徹底

### 今後の計画
---
(Skipping some lines)
---
## 📝 更新履歴

すべての更新履歴はこちら：**[CHANGELOG.md](../CHANGELOG.md)**

### 最新バージョン v0.3.4 (2025-12-29)

**修正**
- 🧭 **Prompt プレビュー復元**: カード表示でクリックするとプレビュー/編集が開くように修正
- 🤖 **Gemini 接続テスト**: モデル名とパラメータ互換を調整し API 400 を回避

**最適化**
- 🚫 **リストのドラッグ無効化**: Prompt リストの誤ドラッグを防止
- 📦 **リリース手順修正**: 余分な blockmap を削除し Windows 更新チャネルと latest を修正

> 📋 [更新履歴の詳細はこちら](../CHANGELOG.md)

## 🤝 貢献について

貢献を歓迎します！以下の手順に従ってください：

1. リポジトリをフォークする
2. 機能用のブランチを作成する (`git checkout -b feature/amazing-feature`)
3. 変更をコミットする (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュする (`git push origin feature/amazing-feature`)
5. プルリクエストを作成する

## 📄 ライセンス

本プロジェクトは [AGPL-3.0 License](../LICENSE) の下で公開されています。

## 💬 サポート

- **不具合報告**: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- **機能提案**: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 🙏 謝辞

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Lucide](https://lucide.dev/)
- PromptHub の改善に協力してくれたすべての素晴らしい [貢献者](https://github.com/legeling/PromptHub/graphs/contributors) の皆様に感謝します！

---

<div align="center">
  <p><strong>このプロジェクトが役に立った場合は、⭐ を付けて応援してください！</strong></p>
  
  <a href="https://www.buymeacoffee.com/legeling" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
  </a>
</div>

---

## ☕ 開発を支援する

PromptHub がお役に立てたなら、作者にコーヒーを一杯おごってください ☕

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
    </tr>
  </table>
</div>

📧 **連絡先**: legeling567@gmail.com

すべての支援者の皆様に感謝します！皆様のサポートが開発の大きな励みになります！

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/legeling">legeling</a></p>
</div>

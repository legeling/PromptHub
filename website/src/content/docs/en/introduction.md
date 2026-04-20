---
title: Overview
---

# PromptHub

An open-source AI Prompt & Skill management tool. Manage your prompts and SKILL.md skills, one-click install to Claude Code, Cursor, Windsurf, Codex, Qoder, CodeBuddy and 15+ mainstream AI coding tools.

## Key Features

### 🧩 Skill Management (v0.5.3)

Built-in store with 20+ curated AI agent skills. One-click install to 15+ platforms. Local scan discovers existing SKILL.md files. Supports Symlink/copy modes, per-platform target directory overrides, AI translation, and tag filtering.

### Local-First

PromptHub keeps your data on your own machine with workspace files as the source of truth and SQLite as the local index. It works offline by default, and your prompts stay private unless you explicitly sync or export them.

### Professional Editor

A professional editor with Markdown syntax highlighting and a built-in variable template system, making prompts reusable like functions.

### Version Control

Automatic version snapshots on every save. Supports diff comparison and one-click rollback. Manage your prompts like code.

### Multi-Model Testing

Compare mainstream LLMs side-by-side to identify the best prompt for your needs.

### Instant Search

Full-text search powered by SQLite FTS5. Find any prompt by title, content, or tags in milliseconds.

### Flexible Export

Export to JSON, YAML, or CSV. Easily integrate into your workflow or codebase.

## Preview

![Main Interface](/imgs/1-index.png)

## Tech Stack

- **Runtime**: Electron 33
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (WASM)
- **State Management**: Zustand

## System Requirements

| Platform | Minimum Version          |
| -------- | ------------------------ |
| macOS    | 10.15 Catalina           |
| Windows  | Windows 10               |
| Linux    | Ubuntu 18.04 / Debian 10 |

## License

PromptHub is licensed under [AGPL-3.0](https://github.com/legeling/PromptHub/blob/main/LICENSE).

## Contributing

We welcome all forms of contribution:

- 🐛 [Report Bugs](https://github.com/legeling/PromptHub/issues/new?template=bug_report.md)
- 💡 [Feature Requests](https://github.com/legeling/PromptHub/issues/new?template=feature_request.md)
- 🔧 [Submit Pull Requests](https://github.com/legeling/PromptHub/pulls)
- 🌍 Help with translations

## Next Steps

- [Quick Start](/docs/en/quick-start) - Get started in 5 minutes
- [Core Features](/docs/en/features) - Detailed feature guide
- [Changelog](/docs/en/changelog) - See latest changes

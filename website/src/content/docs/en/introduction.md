---
title: Overview
---

# PromptHub

An open-source AI Prompt & Skill management tool. Manage your prompts and SKILL.md skills, one-click install to Claude Code, Cursor, Windsurf, Codex and 12+ mainstream AI coding tools.

## Key Features

### 🧩 Skill Management (New in v0.4.0)

Built-in store with 20+ curated AI agent skills. One-click install to 12+ platforms. Local scan to discover existing SKILL.md files. Supports Symlink/copy modes, AI translation, and tag filtering.

### Local-First

All data is stored in a local SQLite database. Works completely offline. Your prompts never leave your device.

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
- **Database**: SQLite (better-sqlite3)
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

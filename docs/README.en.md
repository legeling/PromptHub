<div align="center">
  <h1>PromptHub · AI Prompt Manager</h1>
  <p>An open-source, local-first AI Prompt management tool for efficient prompt organization, version control, and reuse.</p>
  <p>
    <a href="https://github.com/legeling/PromptHub/stargazers"><img src="https://img.shields.io/github/stars/legeling/PromptHub?style=flat-square" alt="GitHub Stars"/></a>
    <a href="https://github.com/legeling/PromptHub/network/members"><img src="https://img.shields.io/github/forks/legeling/PromptHub?style=flat-square" alt="GitHub Forks"/></a>
    <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"/>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"/>
    <img src="https://img.shields.io/github/license/legeling/PromptHub?style=flat-square" alt="License"/>
  </p>
</div>

<p align="center">
  <a href="../README.md">简体中文</a> ·
  <a href="./README.en.md">English</a>
</p>

---

## ✨ Features

- **📝 Prompt Management** - Create, edit, delete with folder and tag organization
- **⭐ Favorites** - Quick access to frequently used prompts
- **🔄 Version Control** - Auto-save history with view and rollback support
- **🔧 Variable System** - Template variables `{{variable}}` with dynamic replacement
- **📋 One-Click Copy** - Quickly copy prompts to clipboard
- **🔍 Full-Text Search** - Fast search across titles, descriptions, and content
- **📤 Data Export** - JSON format backup and restore
- **🎨 Theme Customization** - Dark/Light/System modes with multiple accent colors
- **🌐 Multi-Language** - Chinese and English interface support
- **💾 Local Storage** - All data stored locally for privacy

## 📸 Screenshots

<div align="center">
  <img src="./imgs/image.png" width="80%" alt="Main Interface"/>
</div>

## 📦 Installation

### Download

Download the installer for your platform from [Releases](https://github.com/legeling/PromptHub/releases):

| Platform | Download |
|----------|----------|
| macOS | `PromptHub-x.x.x.dmg` |
| Windows | `PromptHub-x.x.x-setup.exe` |

### Build from Source

```bash
# Clone repository
git clone https://github.com/legeling/PromptHub.git
cd PromptHub

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build application
pnpm build
```

## 🚀 Quick Start

### 1. Create a Prompt

Click the "New" button and fill in:
- **Title** - Prompt name
- **Description** - Brief usage description
- **System Prompt** - Set AI role (optional)
- **User Prompt** - The actual prompt content
- **Tags** - For categorization and search

### 2. Use Variables

Use `{{variable_name}}` syntax in your prompts:

```
Please translate the following {{source_lang}} text to {{target_lang}}:

{{text}}
```

### 3. Copy and Use

Select a prompt and click "Copy" to copy the content to clipboard.

### 4. Version Management

Edit history is automatically saved. Click "History" to view and restore previous versions.

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Electron 33 |
| Frontend | React 18 + TypeScript 5 |
| Styling | TailwindCSS |
| State Management | Zustand |
| Local Storage | IndexedDB |
| Build Tools | Vite + electron-builder |

## 📁 Project Structure

```
PromptHub/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts
│   ├── renderer/       # React renderer process
│   │   ├── components/ # UI components
│   │   ├── stores/     # Zustand state management
│   │   ├── services/   # Database services
│   │   └── styles/     # Global styles
│   └── shared/         # Shared types
├── resources/          # Static assets
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

## 🗺️ Roadmap

### v0.1.3 (Current)
- [x] Prompt CRUD management
- [x] Folder and tag system
- [x] Favorites feature
- [x] Version history
- [x] Data import/export
- [x] Theme customization (Dark/Light/System)
- [x] Multi-language support (Chinese/English)
- [x] WebDAV sync
- [x] Windows frameless window
- [x] Folder drag & drop sorting
- [x] AI model configuration (18+ providers)
- [x] AI connection test & model comparison

### Future Plans
- [ ] Variable fill-in interface
- [ ] Prompt template marketplace
- [ ] Browser extension
- [ ] Auto update

## 📝 Changelog

### v0.1.3 (2025-11-29)
**New Features**
- ✨ AI model configuration (18+ domestic and international providers)
- ✨ AI connection test (async test with response time)
- ✨ AI model comparison (parallel test multiple models)
- ✨ Image generation model support (DALL-E 3, etc.)
- ✨ Complete i18n support (Settings page fully internationalized)
- ✨ Git-style version diff (line-level diff, add/remove stats)

**Improvements**
- 🎨 Optimized settings page UI
- 🔧 Removed prompt card drag (fixed click issues)

### v0.1.2 (2025-11-29)
**New Features**
- ✨ WebDAV sync (upload/download data to remote server)
- ✨ Folder drag & drop sorting
- ✨ Drag prompts to folders
- ✨ Select folder when creating new prompt

### v0.1.1 (2025-11-29)
**New Features**
- ✨ Folder create/edit/delete
- ✨ Tag filtering
- ✨ Check for updates
- ✨ Windows custom title bar

### v0.1.0 (2025-11-29)
- 🎉 Initial release

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

## 💬 Support

- **Bug Reports**: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## 🙏 Acknowledgments

- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [React](https://react.dev/) - UI framework
- [TailwindCSS](https://tailwindcss.com/) - CSS framework
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [Lucide](https://lucide.dev/) - Icon library

---

<div align="center">
  <p><strong>If you find this project helpful, please give it a ⭐!</strong></p>
  <p>Made with ❤️ by <a href="https://github.com/legeling">legeling</a></p>
</div>

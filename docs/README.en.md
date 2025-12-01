<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="120" height="120" />
  <h1>PromptHub</h1>
  <p><strong>🚀 Open-Source, Local-First AI Prompt Manager</strong></p>
  <p>Efficient management, version control, variable filling, multi-model testing — All-in-one Prompt workflow</p>
  
  <p>
    <a href="https://github.com/legeling/PromptHub/stargazers"><img src="https://img.shields.io/github/stars/legeling/PromptHub?style=flat-square&color=yellow" alt="GitHub Stars"/></a>
    <a href="https://github.com/legeling/PromptHub/network/members"><img src="https://img.shields.io/github/forks/legeling/PromptHub?style=flat-square" alt="GitHub Forks"/></a>
    <a href="https://github.com/legeling/PromptHub/releases"><img src="https://img.shields.io/badge/version-v0.1.8-green?style=flat-square" alt="Version"/></a>
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
    <a href="./README.en.md">English</a>
  </p>
</div>

<br/>

> 💡 **Why PromptHub?**
> 
> Tired of searching for prompts in notebooks, documents, and chat histories? PromptHub lets you manage prompts like code — version control, variable templates, multi-model testing, all local and privacy-first.

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
  <p><strong>Main Interface</strong></p>
  <img src="./imgs/image.png" width="80%" alt="Main Interface"/>
  <br/><br/>
  <p><strong>Theme Settings</strong></p>
  <img src="./imgs/theme.png" width="80%" alt="Theme Settings"/>
  <br/><br/>
  <p><strong>Data Backup</strong></p>
  <img src="./imgs/data.png" width="80%" alt="Data Backup"/>
  <br/><br/>
  <p><strong>AI Model Configuration</strong></p>
  <img src="./imgs/model.png" width="80%" alt="AI Model Configuration"/>
  <br/><br/>
  <p><strong>Version Comparison</strong></p>
  <img src="./imgs/version-compare.png" width="80%" alt="Version Comparison"/>
</div>

## 📦 Installation

### Download

Download the installer for your platform from [Releases](https://github.com/legeling/PromptHub/releases):

| Platform | Download |
|----------|----------|
| macOS (Intel) | `PromptHub-x.x.x-x64.dmg` |
| macOS (Apple Silicon) | `PromptHub-x.x.x-arm64.dmg` |
| Windows | `PromptHub-x.x.x-Setup-x64.exe` |
| Linux | `PromptHub-x.x.x.AppImage` / `.deb` |

### macOS First Launch

Since the app is not notarized by Apple, you may see **"PromptHub is damaged and can't be opened"** or **"Cannot verify developer"** on first launch.

**Solution (Recommended)**: Open Terminal and run the following command to bypass Gatekeeper:

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

> 💡 **Tip**: If the app is installed elsewhere, replace the path with the actual installation path.

**Or**: Open "System Settings" → "Privacy & Security" → scroll down to Security section → click "Open Anyway".

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS Installation"/>
</div>

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

### v0.1.8 (Current)
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
- [x] Multi-model configuration (unlimited)
- [x] Full i18n support (homepage, editor, modals)
- [x] In-app auto update
- [x] Variable fill-in interface (copy & AI test)
- [x] Minimize to system tray
- [x] Linux platform support
- [x] Editor line numbers

### Future Plans
- [ ] Web version (Docker/Cloudflare deployment)
- [ ] Multiple view modes (list/card/table)
- [ ] Advanced filtering & sorting
- [ ] Prompt template marketplace
- [ ] Browser extension

## 📝 Changelog

### v0.1.8 (2025-12-01)
**New Features**
- ✨ Minimize to system tray (Windows/macOS)
- ✨ Clickable data directory path
- ✨ Editor line numbers display
- ✨ Linux platform support (AppImage/deb)

**Improvements**
- 🎨 Variable input auto-expands for multi-line text
- 🎨 Optimized macOS tray icon
- 🔧 Update check can be clicked multiple times

### v0.1.7 (2025-11-30)
**New Features**
- ✨ AI test now supports variable fill-in (same experience as copy)
- ✨ Multi-model comparison supports variable fill-in

**Improvements**
- 🎨 Enhanced dark mode theme colors (better saturation and visibility)
- 🎨 Improved toggle switch dark mode styling (added border and better contrast)
- 🎨 AI test button now uses theme color
- 🎨 Beautified About page icon
- 🔧 Removed "Refresh Now" button from language settings (instant effect)

### v0.1.6 (2025-11-30)
**Improvements**
- 🔧 Fixed auto-update metadata file missing (CI uploads latest-mac.yml)
- 🔧 Optimized Release notes format

### v0.1.5 (2025-11-30)
**New Features**
- ✨ Variable fill-in interface (auto-detect variables on copy, show fill-in dialog)

**Improvements**
- 🎨 Folder select dropdown now uses custom styled component
- 🎨 Wider Edit/Create Prompt modal
- 🔧 Fixed version comparison (current version added to version list)
- 🔧 Disabled DevTools in production

### v0.1.4 (2025-11-30)
**New Features**
- ✨ Multi-model configuration (unlimited AI models)
- ✨ Model comparison selection mode
- ✨ Custom dropdown component
- ✨ Full i18n support (homepage, editor, modals)
- ✨ In-app auto update (check, download, install)

**Improvements**
- 🎨 Prompt card compression
- 🎨 Multi-model compare button moved to right
- 🎨 Improved README and screenshots
- 🔧 Fixed macOS top bar drag issue
- 🔧 Fixed language setting sync issue
- 🔧 Fixed compare results persisting on prompt switch
- 🔧 Removed macOS zip builds, DMG only

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

This project is licensed under the [AGPL-3.0 License](./LICENSE).

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

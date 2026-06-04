<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />

  # PromptHub

  A local-first workspace for prompts, skills, and AI coding assets.

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
    <img src="https://img.shields.io/badge/📥_Download-Releases-blue?style=for-the-badge&logo=github" alt="Download"/>
  </a>
</div>

<br/>

PromptHub keeps your prompts, SKILL.md files, and project-level AI coding assets in one local workspace. It can install the same Skill into Claude Code, Cursor, Codex, Windsurf, Gemini CLI and a dozen other tools, gives prompts version history and multi-model testing, and syncs to other devices via WebDAV or a self-hosted Web instance.

Your data lives on your machine.

---

## Contents

- [Download](#install)
- [Screenshots](#screenshots)
- [What it does](#features)
- [Getting started](#quick-start)
- [Self-hosted Web](#self-hosted-web)
- [CLI](#cli)
- [Changelog](#changelog)
- [Roadmap](#roadmap)
- [From source](#dev)
- [Repository layout](#project-structure)
- [Contributing & docs](#contributing)
- [License / credits / community](#meta)

---

<div id="install"></div>

## 📥 Download

Latest stable: **v0.5.8**. Two download lanes for every platform:

- **Direct download** — fixed filenames so the URL never changes between releases. Good for long-lived bookmarks and scripts. (Stable releases now use the CDN mirror.)
- **GitHub Releases** — official release page with version archives, signatures, and full release notes.

| Platform | Direct download | GitHub Releases |
| -------- | --------------- | --------------- |
| Windows  | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-arm64.exe) | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-arm64.exe) |
| macOS    | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.dmg) | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.dmg) |
| Linux    | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-amd64.deb) | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-amd64.deb) |
| Preview  | [![Preview Channel](https://img.shields.io/badge/Preview-Channel-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/legeling/PromptHub/releases) | No separate preview build is active right now. Enable the preview channel under *Settings → About* when you want early builds. |

> **Apple Silicon vs Intel?** M1/M2/M3/M4 → `arm64`. Older Intel Macs → `x64`.
> **Windows arch?** Most boxes → `x64`. Only Surface Pro X-class ARM hardware → `arm64`.

### macOS via Homebrew

```bash
brew tap legeling/tap
brew install --cask prompthub
```

For upgrades, use `brew upgrade --cask prompthub`. Don't mix Homebrew with the in-app updater, or Homebrew's recorded version may drift away from what's actually installed.

### macOS first launch warning

The app isn't notarized, so the first launch may say "PromptHub is damaged" or "developer cannot be verified". From a terminal:

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

Then reopen the app. Replace the path if you installed it somewhere else.

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="macOS install warning"/>
</div>

### Preview channel

Want to try the next dev preview? Open *Settings → About* and toggle the preview channel. The app will then check GitHub Prereleases. Turn it off to return to stable; PromptHub will not auto-downgrade from a newer preview to an older stable.

<div id="screenshots"></div>

## Screenshots

> The shots below cover the current stable v0.5.8 surfaces.

<div align="center">
  <p><strong>Two-column home</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="Main view"/>
  <br/><br/>
  <p><strong>Skill store</strong></p>
  <img src="./imgs/10-skill-store.png" width="80%" alt="Skill store"/>
  <br/><br/>
  <p><strong>Skill detail with one-click platform install</strong></p>
  <img src="./imgs/11-skill-platform-install.png" width="80%" alt="Skill platform install"/>
  <br/><br/>
  <p><strong>Rules workspace</strong></p>
  <img src="./imgs/13-rules-workspace.png" width="80%" alt="Rules workspace"/>
  <br/><br/>
  <p><strong>Project Skill workspace</strong></p>
  <img src="./imgs/14-skill-projects.png" width="80%" alt="Project Skill workspace"/>
  <br/><br/>
  <p><strong>Quick Add (manual / analyze / AI generation)</strong></p>
  <img src="./imgs/15-quick-add-ai.png" width="80%" alt="Quick Add"/>
  <br/><br/>
  <p><strong>Appearance &amp; motion preferences</strong></p>
  <img src="./imgs/17-appearance-motion.png" width="80%" alt="Appearance settings"/>
</div>

<div id="features"></div>

## What it does

### 📝 Prompt management

- Folders, tags, favorites with drag-to-reorder; full CRUD coverage
- `{{variable}}` templating; copy / test / distribute pops a form to fill values
- Full-text search (FTS5), Markdown rendering with code highlighting, attachments and media preview
- Desktop card view supports double-click inline editing for both user and system prompts

### 🧩 Skill store & one-click distribution

- **Skill store** with 20+ curated skills (Anthropic, OpenAI, etc.) plus stackable custom sources (GitHub repo / skills.sh / local folder)
- **One-click install** to Claude Code, Cursor, Windsurf, Codex, Kiro, Kilo Code, Gemini CLI, Cline, Qoder, QoderWork, CodeBuddy, Trae, Trae CN, OpenCode and 15+ more
- **Local scan** picks up existing SKILL.md files so you no longer copy-paste between tool directories
- **Symlink / Copy modes** — symlink for shared edits, copy for independent per-platform copies
- **Per-platform skill directory override** keeps scan and install on the same path
- **AI translate & polish** at the full SKILL.md level with sidecar storage, side-by-side and full-translation modes
- **Safety scan** runs an AI review pipeline before install; restricted sources are blocked outright
- **GitHub token** for store and repo imports cuts down on anonymous rate-limit failures
- **Tag filtering** for installed skills and store browsing

### 📐 Rules (AI coding rules)

- One place to manage `.cursor/rules`, `.claude/CLAUDE.md`, AGENTS.md and friends
- Manually-added project rules grouped by directory
- Wired into ZIP export, WebDAV, self-hosted sync, and Web import/export

### 🤖 Project & agent asset workspace

- Scans common project locations: `.claude/skills`, `.agents/skills`, `skills`, `.gemini`, etc.
- Per-project skill workspaces keep project context isolated from your global library
- Personal library, local repo, and project assets all in one switcher — no more jumping between tool directories
- Global prompt tag management: search, rename, merge, delete tags with database and workspace files in sync

### 🧪 AI testing & generation

- Built-in AI testing across major global and Chinese providers (OpenAI, Anthropic, Gemini, Azure, custom endpoints)
- Run the same prompt against multiple models in parallel, both text and image models
- AI skill generation, AI skill polish, Quick Add now generates structured prompt drafts directly
- Unified endpoint management and connection tests; precise error reporting for 504 / timeout / unconfigured

### 🕒 Versioning & history

- Every prompt save creates an automatic version; diff highlighting and one-click rollback included
- Skills carry their own version history with named versions, version diff and version-level rollback
- Rules snapshot history can be previewed and restored to a draft
- Skills installed from the store track a content hash so remote SKILL.md changes are detected with local-edit conflict protection

### 💾 Data, sync & backup

- Local-first: by default your data lives on your own machine
- Full backup / restore via the `.phub.gz` compressed format
- WebDAV sync (Jianguoyun, Nextcloud, etc.)
- Self-hosted PromptHub Web works as an additional sync / backup target
- Pull on launch + scheduled background sync; only one active sync source drives automatic sync to prevent multi-writer conflicts

### 🔐 Privacy & security

- Master password gate with AES-256-GCM encryption
- Private folders encrypted at rest (Beta)
- Cross-platform offline-friendly: macOS / Windows / Linux
- 7 UI languages: Simplified Chinese, Traditional Chinese, English, Japanese, German, Spanish, French

<div id="quick-start"></div>

## Getting started

1. **Create your first prompt.** Click **+ New**, fill in title, description, system prompt and user prompt. `{{name}}` makes a variable; copy or test will prompt you for it.

2. **Bring skills in.** Open the Skills tab. Pick a few from the store, or hit *Scan local* to find existing SKILL.md files on your machine.

3. **Install to AI tools.** From a Skill's detail view, pick a target platform. PromptHub installs the SKILL.md into the platform's expected directory, either as a symlink (live edits) or a standalone copy.

4. **Sync (optional).** *Settings → Data* configures WebDAV, or you can self-host PromptHub Web as a sync target.

<div id="self-hosted-web"></div>

## Self-hosted Web

PromptHub Web is a lightweight browser companion you can run on a NAS, VPS, or LAN box with Docker. It is **not** a managed cloud service. Use it to:

- Access your PromptHub data from a browser
- Have a sync target other than WebDAV for the desktop
- Keep your data inside your own network

```bash
cd apps/web
cp .env.example .env
docker compose up -d --build
```

In `.env`, set at minimum:

- `JWT_SECRET`: ≥ 32 random characters
- `ALLOW_REGISTRATION=false`: keep this off after you create the first admin
- `DATA_ROOT`: data root; `data/`, `config/`, `logs/`, `backups/` will be created beneath it

Default: `http://localhost:3871`. The first visit lands on `/setup`; the first user becomes admin.

To connect the desktop: *Settings → Data → Self-Hosted PromptHub*. Test the connection, push the local workspace up, pull from Web, enable launch-time pull or background push.

Detailed deploy / upgrade / backup / GHCR image / dev notes live in [`web-self-hosted.md`](./web-self-hosted.md).

<div id="cli"></div>

## CLI

The CLI is for scripting, batch import/export, and automation. The desktop app does **not** install a `prompthub` shell command for you; pack and install it from the repo:

```bash
pnpm pack:cli
pnpm add -g ./apps/cli/prompthub-cli-*.tgz
prompthub --help
```

Or run from source without installing:

```bash
pnpm --filter @prompthub/cli dev -- prompt list
pnpm --filter @prompthub/cli dev -- skill scan
```

Resource commands (each takes `--help`):

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

Common global flags:

- `--output json|table` — output format
- `--data-dir <path>` — override the PromptHub `userData` directory
- `--app-data-dir <path>` — override the application data root
- `--version|-v` — print the CLI version

<div id="changelog"></div>

## Changelog

Full changelog: **[CHANGELOG.md](../CHANGELOG.md)**

### v0.5.8 (2026-06-04)

- Added a dedicated image reverse-prompt workflow with vision models, preview/copy first, and optional reference-image persistence
- Reworked AI model settings around providers, model capabilities, and business routes
- Added ClawHub and skill.sh store support with remote search, categories, paging/loading, cache, and full Skill package installs
- Hardened the Skill lifecycle matrix across My Skills, Project Skills, Agent Skills, platform installs, copy/symlink, built-in Skills, and external symlinks
- Made GitHub, Gitea, and self-hosted Git update checks more accurate and ignored common cache files to reduce false positives
- Added a lightweight Skill file code view with syntax highlighting, line numbers, soft wrapping, and richer file icons

### v0.5.8-beta.3 (2026-06-02, preview)

- Skill file views now use a lightweight code editor with syntax highlighting, line numbers, soft wrapping, and richer file icons
- GitHub-imported My Skills can now check source updates directly from the detail page and create a version snapshot before applying updates
- Cherry Studio, Agent Skill, Project Skill, copy / symlink, built-in Skill, and external symlink states were hardened further
- Prompt / Skill version history dialogs now use a more scannable table-style presentation

### v0.5.8-beta.2 (2026-06-02, preview)

- Skill lifecycle actions were further hardened across Project Skills, Agent Skills, and platform install/uninstall paths
- The Project Skill detail delete action now uses a red destructive style by default
- Skill management view switches now use horizontal transitions, including project/agent internal selection changes
- GitHub Actions release jobs now run on Node 24

### v0.5.8-beta.1 (2026-06-01, preview)

- Image Prompt Reverse now has its own entry point, uses a vision model to generate structured image prompts, and can keep the source image as a reference
- AI model services now use a provider-first three-column configuration flow that separates provider instances, model capabilities, and business routing
- The standalone CLI `--version` now matches the package version `0.5.8-beta.1`
- Project Skill results now use a compact list with secondary actions moved to icon-only controls

### v0.5.7 (2026-05-29)

- Prompt AI quick rewrite now uses one shared dialog across detail pages, detail modals, and context menus, with draft-first preview before save
- Same-name Skill variants are now treated as first-class identities, with unified managed container semantics
- Backup import restore, remote Git scanning, and AI Workbench verification persistence were hardened for the final release
- `scanRemoteGithub` now supports both HTTPS and SSH URLs for GitHub, Gitea, and self-hosted Git servers
- The AI Workbench `Connected` endpoint state now persists after re-entering the page instead of falling back to `Unverified`

### v0.5.7-beta.2 (2026-05-28, preview)

- Git store sources now support `branch / directory`, remote branch suggestions, and GitHub / SSH / self-hosted Git repos
- Project Skill import now supports advanced `copy / symlink` modes with per-project preference memory
- Agent management and Skill platform install now ship built-in `Kilo Code` support instead of `Roo Code`

### v0.5.7-beta.1 (2026-05-26, preview)

- Unified the full built-in / custom agent configuration model so `Skill Settings` can override `root / skills / rules / agents / commands / config` paths directly
- Added built-in `Cline` and `Trae CN` presets, and made the Rules workspace refresh immediately when agent configuration changes
- Added direct project-local Skill deployment into agent folders, defaulting to `.agents/skills` with multi-target selection
- Symlink installs that fall back to copy now show explicit warnings instead of looking like plain success
- Prompt detail inline editing now opens the exact field you double-clicked while staying closer to the normal detail layout

### v0.5.6 (2026-05-12)

**Features**

- 🧭 **Rules workspace.** A dedicated Rules page on the desktop, managing both global rules and manually added project rules — search, snapshot preview, restore-to-draft, and ZIP export / WebDAV / self-hosted sync / Web import-export.
- 📁 **Project Skill workspace.** Per-project skill workspaces that auto-scan the usual locations and let you preview / import / distribute skills in project context.
- 🤖 **Quick Add can generate prompts with AI.** In addition to analyzing an existing prompt, Quick Add can now generate a structured prompt draft from goals and constraints.
- 🏷️ **Global prompt tag management.** Centralized search / rename / merge / delete in the sidebar tag area, synced to both the database and the workspace files.
- 🔐 **GitHub token for the Skill Store.** Authenticated GitHub quota cuts down on anonymous rate-limit failures during store and repo imports.

**Fixes**

- ✍️ Card detail supports double-click editing for both user and system prompts
- 🪟 Update dialog flicker, unstable download button, and `minimizeOnLaunch` not honoring launch-at-login
- ↔️ Skills three-column resizing, double-click reset, title wrapping, store search regressions
- 🔁 Rules / Skill extras / managed copies stay consistent across ZIP export, WebDAV, self-hosted sync, and Web import/export
- 🖼️ Self-hosted Web login switched to one-time image captcha challenges

**Improvements**

- 🏠 Two-column home layout stably supports module visibility, drag sorting, and an independent background toggle
- ☁️ Only one active sync source drives automatic sync, avoiding multi-provider write conflicts
- ✨ Full motion system on the desktop renderer (duration / easing / scale tokens, four intent components — `<Reveal>` `<Collapsible>` `<ViewTransition>` `<Pressable>`, three user motion tiers). Framer-motion was dropped in favor of `tailwindcss-animate`; the `ui-vendor` chunk went from 54 KB to 16 KB gzipped.
- 🪶 Long lists (Skill list / Prompt gallery / kanban / inline prompt list) now use `@tanstack/react-virtual`, retiring the hand-rolled `setTimeout`-based chunk renderer.

<div id="roadmap"></div>

## Roadmap

### v0.5.8 ← current stable

- Image reverse prompts, provider/capability/route model settings, and image test flows are now stable
- Skill lifecycle handling is consolidated across stores, Git, agents, projects, platforms, copy/symlink, and built-in Skills
- ClawHub / skill.sh stores, source update checks, code view, file icons, and version history are refined

### v0.5.7

- Prompt AI quick edit, same-name Skill variants, remote Git scanning, and AI Workbench verification were hardened

### v0.5.6

See the changelog above.

### v0.5.5

- Skill store install records content hash; remote SKILL.md change detection with local-edit conflict protection
- Full-document AI translation persisted as a sidecar, with full-translation and immersive side-by-side modes
- Data path switch now applies via a real relaunch
- Clearer AI test / translation error messages (504 / timeout / unconfigured)
- Web/Docker media upload fix; `local-image://` / `local-video://` resolved automatically
- Preview update lane hardened
- Issue forms auto-sync `version: x.y.z` labels

### v0.4.x

- AI workbench with model management, endpoint editing, connection testing, scenario defaults
- skills.sh community store integration with rankings, install counts, and stars
- skill-installer god-class breakup, SSRF protection, URL protocol validation
- One-click skill install to a dozen platforms (Claude Code, Cursor, Windsurf, Codex, Cline, etc.)
- AI translation, AI skill generation, batch local scan

### Pondering / planned

- [ ] Browser extension that pulls from PromptHub inside ChatGPT / Claude
- [ ] Mobile companion: view, search, lightweight edit-and-sync
- [ ] Plugin surface for local models (Ollama) and custom AI providers
- [ ] Prompt Store: reuse community-validated prompts
- [ ] Richer variable types: select boxes, dynamic dates
- [ ] User-uploaded skills

<div id="dev"></div>

## From source

Requires Node.js ≥ 24 and pnpm 9.

```bash
git clone https://github.com/legeling/PromptHub.git
cd PromptHub
pnpm install

# desktop dev
pnpm electron:dev

# desktop build
pnpm build

# self-hosted web build
pnpm build:web
```

`pnpm build` only builds the desktop app. The web bundle requires `pnpm build:web`.

| Command | Purpose |
| ------- | ------- |
| `pnpm electron:dev` | Vite + Electron dev environment |
| `pnpm dev:web` | Web dev server |
| `pnpm lint` / `pnpm lint:web` | Lint |
| `pnpm typecheck` / `pnpm typecheck:web` | TypeScript checks |
| `pnpm test -- --run` | Desktop unit + integration tests |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm verify:web` | Web lint + typecheck + test + build |
| `pnpm test:release` | Desktop pre-release gate |
| `pnpm --filter @prompthub/desktop bundle:budget` | Desktop bundle budget check |

<div id="project-structure"></div>

## Repository layout

```text
PromptHub/
├── apps/
│   ├── desktop/   # Electron desktop app
│   ├── cli/       # standalone CLI (built on packages/core)
│   └── web/       # self-hosted Web
├── packages/
│   ├── core/      # core logic shared between CLI and desktop
│   ├── db/        # shared data layer (SQLite schema, queries)
│   └── shared/    # shared types, IPC constants, protocol definitions
├── docs/          # public-facing docs
├── spec/          # internal SSD / design spec system
├── website/       # marketing site
├── README.md
├── CONTRIBUTING.md
└── package.json
```

<div id="contributing"></div>

## Contributing & docs

- Entry point: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Full guide: [`docs/contributing.md`](./contributing.md)
- Public doc index: [`docs/README.md`](./README.md)
- Internal SSD / specs: [`spec/README.md`](../spec/README.md)

For non-trivial changes, start a change folder under `spec/changes/active/<change-key>/` (with `proposal.md` / `specs/<domain>/spec.md` / `design.md` / `tasks.md` / `implementation.md`). Once it ships, sync the durable bits back to `spec/workflow/*`, `spec/knowledge/*`, `spec/releases/`, or `spec/adr/`, and update `docs/` or the root `README.md` if user-facing contracts changed.

<div id="meta"></div>

## License

[AGPL-3.0](../LICENSE)

## Feedback

- Issues: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- Ideas: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## Built with

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [TailwindCSS](https://tailwindcss.com/) · [Zustand](https://zustand-demo.pmnd.rs/) · [Lucide](https://lucide.dev/) · [@tanstack/react-virtual](https://tanstack.com/virtual) · [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)

## Contributors

Thanks to everyone who has contributed to PromptHub.

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

## Star history

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <img alt="Star history" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## Community

Join the PromptHub community for support, feedback, release news, and early previews.

<div align="center">
  <a href="https://discord.gg/zmfWguWFB">
    <img src="https://img.shields.io/badge/Discord-Join%20PromptHub%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join PromptHub Discord Community" />
  </a>
  <p><strong>Discord is the recommended channel: announcements, support, release news.</strong></p>
</div>

<br/>

### QQ group (Chinese)

If you prefer QQ, the PromptHub QQ group is also open:

- Group ID: `704298939`

<div align="center">
  <img src="./imgs/qq-group.jpg" width="320" alt="PromptHub QQ group QR"/>
  <p><strong>Scan to join the PromptHub QQ group</strong></p>
</div>

## Sponsor

If PromptHub is useful to your work, feel free to buy the author a coffee.

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

Contact: legeling567@gmail.com

Past sponsors are archived in [`docs/sponsors.md`](./sponsors.md).

---

<div align="center">
  <p>If PromptHub is useful to you, a ⭐ goes a long way.</p>
</div>

# Skill Store Requirements

This document defines the complete requirements for the PromptHub Skill Store, referencing the OpenAI Codex Skills UI and Claude Code Skills best practices.

## Table of Contents

1. [Overview](#1-overview)
2. [Skill Store UI Design](#2-skill-store-ui-design)
3. [Built-in Skill Library](#3-built-in-skill-library)
4. [Skill Icon System](#4-skill-icon-system)
5. [Skill Detail View](#5-skill-detail-view)
6. [Installation & Management Flow](#6-installation--management-flow)
7. [Data Model Changes](#7-data-model-changes)
8. [Implementation Plan](#8-implementation-plan)

---

## 1. Overview

### 1.1 Background

The current PromptHub Skills page only displays user-installed/created skills, missing:
- **Built-in Skill Store**: Users cannot browse and discover curated pre-built skills
- **Skill Icons**: All skills use the same default Cuboid icon, lacking visual identity
- **Skill Detail Modal**: No way to preview full description, source, and instructions before install

### 1.2 Goals

Following the OpenAI Codex Skills design pattern:
1. **Skill Store navigation**: Add a Store entry in the sidebar
2. **Built-in skill library**: Bundle high-quality commonly-used skills (Excel, PDF, code analysis, etc.)
3. **Skill icon system**: Each skill has its own icon, fetchable online
4. **Skill detail modal**: Click a skill to view full description, source, prerequisites, workflow
5. **One-click install**: Install skills from the store to local

### 1.3 Reference UI

| Ref | Description |
|-----|-------------|
| Image 1 | Codex Skills main page — "Installed" section, 2-column grid, icon + name + description per item |
| Image 2 | Codex Skills "Recommended" section — installable skills with + button |
| Image 3 | Skill detail modal — large icon, name, description, Overview, Prerequisites, Workflow, Install button |
| Image 4 | Current PromptHub Skills page — grid cards without store or icons |

---

## 2. Skill Store UI Design

### 2.1 Layout

```
┌───────────────────────────────────────────────────┐
│ TopBar: [Search Skills...] [Refresh] [+ New Skill] │
├──────────┬────────────────────────────────────────┤
│ Sidebar  │  Skill Store main content               │
│          │                                          │
│ Prompts  │  ┌─ Installed ──────────────────────┐   │
│ Skills ← │  │ [icon] Excel    [icon] PDF       │   │
│  All     │  │ [icon] Figma    [icon] Image Gen │   │
│  Favs    │  └──────────────────────────────────┘   │
│  Store ← │                                          │
│          │  ┌─ Recommended ────────────────────┐   │
│ Settings │  │ [icon] Notion [+]  [icon] Git [+]│   │
│          │  │ [icon] Deploy [+]  [icon] Sentry[+]│  │
│          │  └──────────────────────────────────┘   │
└──────────┴────────────────────────────────────────┘
```

### 2.2 Sidebar Navigation Changes

Add sub-navigation in the Skill area:

| Item | Icon | Description |
|------|------|-------------|
| All Skills | `LayoutGridIcon` | All installed skills (existing) |
| Favorites | `StarIcon` | Favorited skills (existing) |
| **Store** | `StoreIcon` | **New**: Browse built-in skill store |

### 2.3 Store Page

**Layout:**
- Top search bar for store skills
- **Installed** section: installed skills in 2-column grid, icon + name + description + edit button
- **Recommended** section: recommended skills in 2-column grid, icon + name + description + install button (+)
- Category filter tabs: All / Office / Dev / AI / Data / Management / Deploy / Design / Security

**Interactions:**
- Click installed skill → open skill detail page (edit mode)
- Click recommended skill → open skill detail modal (install mode)
- Click `+` button → install directly (skip detail modal)
- Click edit button → open skill editor

---

## 3. Built-in Skill Library

### 3.1 Skill Catalog

#### Office Tools

| Name | Slug | Description |
|------|------|-------------|
| Spreadsheet | `spreadsheet` | Create, edit, and analyze spreadsheets (Excel/CSV) |
| PDF Skill | `pdf-skill` | Create, edit, and review PDFs |
| Word Docs | `word-docs` | Edit and review Word documents |
| Presentation | `presentation` | Create and edit presentations |

#### Development Tools

| Name | Slug | Description |
|------|------|-------------|
| Git Release | `git-release` | Create consistent releases and changelogs |
| Code Review | `code-review` | Systematic code review and quality assessment |
| Yeet | `yeet` | Stage, commit, and open PRs |
| Playwright CLI | `playwright-cli` | Automate real browsers from terminal |
| API Designer | `api-designer` | Design RESTful APIs and interface specs |

#### AI Generation

| Name | Slug | Description |
|------|------|-------------|
| Image Gen | `image-gen` | Generate and edit images using AI |
| Speech Generation | `speech-generation` | Generate narrated audio from text |
| Transcribe | `transcribe` | Transcribe audio using AI |
| Video Generation | `video-generation` | Generate and manage AI videos |

#### Data Analysis

| Name | Slug | Description |
|------|------|-------------|
| Data Analyst | `data-analyst` | Analyze datasets, generate reports and charts |
| Scientific Skills | `scientific-skills` | Research assistance, paper search, experiment analysis |
| Screenshot | `screenshot` | Capture and annotate screenshots |

#### Project Management

| Name | Slug | Description |
|------|------|-------------|
| Linear | `linear` | Manage Linear issues |
| Notion | `notion-knowledge` | Capture conversations into structured Notion pages |
| Sentry | `sentry` | Read-only Sentry observability |

#### Deploy & Platforms

| Name | Slug | Description |
|------|------|-------------|
| Vercel Deploy | `vercel-deploy` | Deploy apps with zero configuration to Vercel |
| Netlify Deploy | `netlify-deploy` | Deploy web projects with Netlify CLI |
| Render Deploy | `render-deploy` | Deploy via Blueprints or MCP to Render |

#### Design Tools

| Name | Slug | Description |
|------|------|-------------|
| Figma | `figma` | Use Figma MCP for design-to-code work |
| Build Things | `build-things` | Rapid build and prototyping |

#### Security

| Name | Slug | Description |
|------|------|-------------|
| Security Best Practices | `security-best-practices` | Security reviews and secure-by-default guidance |
| Security Threat Model | `security-threat-model` | Repo-grounded threat modeling and abuse-path analysis |

#### Meta Skills

| Name | Slug | Description |
|------|------|-------------|
| Skill Creator | `skill-creator` | Create or update a skill |
| Skill Installer | `skill-installer` | Install curated skills from repos |

### 3.2 Registry Data Format

```json
{
  "version": "1.0.0",
  "skills": [
    {
      "slug": "spreadsheet",
      "name": "Spreadsheet",
      "description": "Create, edit, and analyze spreadsheets",
      "category": "office",
      "icon_url": "https://cdn.prompthub.ai/skills/icons/spreadsheet.png",
      "icon_emoji": "📊",
      "author": "PromptHub",
      "source_url": "https://github.com/anthropics/skills/tree/main/spreadsheet",
      "tags": ["excel", "csv", "data", "office"],
      "version": "1.0.0",
      "content_url": "https://raw.githubusercontent.com/anthropics/skills/main/spreadsheet/SKILL.md",
      "prerequisites": ["A file system MCP server for reading/writing files"],
      "compatibility": ["claude", "cursor", "windsurf", "opencode"]
    }
  ]
}
```

### 3.3 Content Sources

Priority:
1. **Local built-in**: App embeds full content for common skills (offline-ready)
2. **Remote fetch**: Latest version from GitHub or CDN
3. **Community**: Community-maintained `registry.json`

---

## 4. Skill Icon System

### 4.1 Icon Sources (Priority)

1. **Custom icon URL** (`icon_url`): PNG/SVG/WebP, 64x64 or 128x128, CDN-loaded with local cache
2. **Emoji icon** (`icon_emoji`): Fallback when URL fails
3. **Default icon**: `CuboidIcon` or name-initial with colored background

### 4.2 Icon Component

```tsx
interface SkillIconProps {
  iconUrl?: string;
  iconEmoji?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';  // 32px / 48px / 64px
  className?: string;
}
```

### 4.3 Caching Strategy

- **Memory cache**: Loaded icon URLs cached in memory
- **Disk cache**: Downloaded images stored in `~/.config/prompthub/cache/icons/`
- **Expiry**: 7-day TTL, re-fetch from remote
- **Loading state**: Skeleton placeholder, graceful degradation on failure

---

## 5. Skill Detail View

### 5.1 Detail Modal (Install Mode)

```
┌───────────────────────────────────────┐
│  [Large Icon]                    [X]  │
│  Figma Implement Design               │
│  Turn Figma designs into code          │
│                                        │
│  ┌─ Content (Markdown) ─────────┐    │
│  │ Overview, Prerequisites,      │    │
│  │ Required Workflow, Examples   │    │
│  └───────────────────────────────┘    │
│                                        │
│  Source: anthropics/skills             │
│  Version: 1.0.0                        │
│  Compatible: Claude, Cursor, Windsurf  │
│                                        │
│                        [+ Install]     │
└───────────────────────────────────────┘
```

### 5.2 Installed Skill Detail

Extends existing `SkillFullDetailPage` with:
- Skill icon display
- Source information (GitHub URL)
- Platform install status (existing)

---

## 6. Installation & Management Flow

### 6.1 Install from Store

```
Browse store → Click skill → View detail → Click Install
                                             ↓
                                   1. Download SKILL.md content
                                   2. Save to local database
                                   3. Download and cache icon
                                   4. Update Installed list
                                   5. Optional: install to platforms
```

### 6.2 Quick Install (+ button)

```
Click + → Install directly (skip detail)
          ↓
   1. Fetch SKILL.md from remote
   2. Store locally
   3. Show success toast
   4. Move from Recommended to Installed
```

### 6.3 Uninstall

```
Open installed skill → Click Uninstall → Confirm → Remove from DB → Return to Recommended
```

### 6.4 Update

```
Refresh / Auto-check → Compare remote registry version → Show update prompt → Update SKILL.md
```

---

## 7. Data Model Changes

### 7.1 Skill Type Extension

```typescript
export interface Skill {
  // ... existing fields ...
  
  // New fields
  icon_url?: string;
  icon_emoji?: string;
  category?: string;
  is_builtin?: boolean;
  registry_slug?: string;
  content_url?: string;
  prerequisites?: string[];
  compatibility?: string[];
}
```

### 7.2 Database Migration

```sql
ALTER TABLE skills ADD COLUMN icon_url TEXT;
ALTER TABLE skills ADD COLUMN icon_emoji TEXT;
ALTER TABLE skills ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE skills ADD COLUMN is_builtin INTEGER DEFAULT 0;
ALTER TABLE skills ADD COLUMN registry_slug TEXT;
ALTER TABLE skills ADD COLUMN content_url TEXT;
ALTER TABLE skills ADD COLUMN prerequisites TEXT;
ALTER TABLE skills ADD COLUMN compatibility TEXT;
```

### 7.3 Store State Extension

```typescript
interface SkillState {
  // ... existing ...
  registrySkills: RegistrySkill[];
  isLoadingRegistry: boolean;
  storeCategory: string;
  
  loadRegistry: () => Promise<void>;
  installFromRegistry: (slug: string) => Promise<Skill | null>;
  setStoreCategory: (category: string) => void;
  getInstalledSlugs: () => string[];
  getRecommendedSkills: () => RegistrySkill[];
}
```

---

## 8. Implementation Plan

### Phase 1: Data Layer (2-3 days)
- Extend `Skill` type with new fields
- Database migration
- Create `skill-registry.ts` with built-in skill data
- Implement registry loading logic

### Phase 2: SkillIcon Component (1-2 days)
- Create `SkillIcon.tsx`
- Implement load priority: URL → Emoji → Initial → Default
- Replace all `CuboidIcon` usages

### Phase 3: SkillStore Page (3-4 days)
- Create `SkillStore.tsx` with Installed/Recommended layout
- Category filter tabs
- 2-column grid with icons
- Search within store

### Phase 4: SkillStoreDetail Modal (2-3 days)
- Create detail modal component
- Markdown rendering of SKILL.md
- Meta info display
- Install/Installed state handling

### Phase 5: Sidebar Integration (1 day)
- Add "Store" nav item to Sidebar
- Store view state in skill.store.ts
- Route between SkillManager and SkillStore

### Phase 6: Install Flow (2 days)
- Implement `installFromRegistry` action
- Quick install (+ button)
- Uninstall returns skill to Recommended
- Loading states and error handling

### Phase 7: Content Population (2-3 days)
- Write/collect SKILL.md content for each built-in skill
- Prepare icon assets
- Embed core skills locally for offline use

### Phase 8: Polish (2 days)
- Icon disk caching
- Remote registry updates
- Animations and empty states
- i18n translations
- Responsive layout
- Performance optimization

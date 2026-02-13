# PromptHub Agent Skill System Design

This document outlines the architecture and design for the "Agent Skills" system in PromptHub, inspired by Claude Code/Desktop skills and the Model Context Protocol (MCP).

## 1. Concept Definition

### What is a "Skill"?

In PromptHub, a **Skill** is a portable, self-contained package that gives the AI agent specific capabilities. It bridges the gap between static _System Prompts_ and dynamic _MCP Tools_.

**A Skill consists of:**

1.  **Procedural Knowledge (System Prompt)**: Instructions on _how_ to perform a task (e.g., "How to write a high-converting email").
2.  **Tool Definitions (MCP Config)**: References to required tools or full MCP server configurations (e.g., "Requires `gmail-mcp-server`").
3.  **Local Resources (Optional)**: Scripts or reference documents that the agent can read.

### Analogy

- **Prompt**: A request (e.g., "Write an email").
- **MCP Tool**: The hammer (e.g., `send_email` function).
- **Skill**: The carpenter (The knowledge of _how_ to use the hammer to build a specific thing, plus the hammer itself).

---

## 2. Architecture

### 2.1 Data Model (`Skill` Entity)

```json
{
  "id": "skill_unique_id",
  "name": "Data Analysis Expert",
  "description": "Analyzes CSV files and generates charts using Python.",
  "version": "1.0.0",
  "author": "User Name",
  "instruction": "You are a data analyst... [Full System Prompt content]",
  "mcp_servers": [
    {
      "name": "pandas-tool",
      "command": "python",
      "args": ["-m", "mcp_pandas_server"]
    }
  ],
  "env": {
    "API_KEY": "..."
  }
}
```

### 2.2 File System Structure (Export Format)

Skills can be exported as `.skill` files (ZIP archives) or simple folders to be compatible with Claude Code standards where possible.

```text
my-data-skill/
├── manifest.json      # Metadata (Name, Version, MCP config)
├── SKILL.md           # The core system prompt/instructions
└── scripts/           # (Optional) Helper scripts
```

---

## 3. Feature Requirements

### 3.1 Skill Installation & Discovery

#### 3.1.1 File Placement

Create one folder per skill name and put a `SKILL.md` inside it. PromptHub searches these locations:

**Project config:**
- `.prompthub/skills/<skill-name>/SKILL.md`
- `.claude/skills/<skill-name>/SKILL.md` (Claude-compatible)

**Global config:**
- `~/.config/prompthub/skills/<skill-name>/SKILL.md`
- `~/.claude/skills/<skill-name>/SKILL.md` (Claude-compatible)

#### 3.1.2 Discovery Mechanism

For project-local paths, PromptHub walks up from your current working directory until it reaches the git worktree root. It loads any matching `skills/*/SKILL.md` files along the way.

Global definitions are also loaded from user config directories.

#### 3.1.3 SKILL.md Format Specification

Each `SKILL.md` must start with YAML frontmatter. Only these fields are recognized:

```yaml
---
name: skill-name           # Required, skill identifier
description: Brief desc    # Required, 1-1024 characters
license: MIT               # Optional, license type
compatibility: prompthub   # Optional, compatibility flag
metadata:                  # Optional, string-to-string map
  audience: developers
  workflow: github
---
```

**Name Validation Rules:**
- Length: 1-64 characters
- Format: lowercase alphanumeric with single hyphen separators
- Cannot start or end with `-`
- Cannot contain consecutive `--`
- Must match the directory name containing SKILL.md
- Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`

**Example:**

Create `.prompthub/skills/git-release/SKILL.md`:

```markdown
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: prompthub
metadata:
  audience: maintainers
  workflow: github
---

## What I do

- Draft release notes from merged PRs
- Propose a version bump
- Provide a copy-pasteable `gh release create` command

## When to use me

Use this when you are preparing a tagged release.
Ask clarifying questions if the target versioning scheme is unclear.
```

#### 3.1.4 Permission Control

Control which skills agents can access using pattern-based permissions in `prompthub.json`:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

**Permission Types:**

| Permission | Behavior |
|------------|----------|
| `allow` | Skill loads immediately |
| `deny` | Skill hidden from agent, access rejected |
| `ask` | User prompted for approval before loading |

Patterns support wildcards: `internal-*` matches `internal-docs`, `internal-tools`, etc.

#### 3.1.5 Override Per Agent

Give specific agents different permissions than the global defaults.

**For custom agents (in agent frontmatter):**

```yaml
---
permission:
  skill:
    "documents-*": "allow"
---
```

**For built-in agents (in prompthub.json):**

```json
{
  "agent": {
    "plan": {
      "permission": {
        "skill": {
          "internal-*": "allow"
        }
      }
    }
  }
}
```

#### 3.1.6 Disable the Skill Tool

Completely disable skills for agents that shouldn't use them:

**For custom agents:**

```yaml
---
tools:
  skill: false
---
```

**For built-in agents:**

```json
{
  "agent": {
    "plan": {
      "tools": {
        "skill": false
      }
    }
  }
}
```

When disabled, the `<available_skills>` section is omitted entirely.

### 3.2 Skill Management (The "Skill Store")

- **Library View**: A grid view of installed skills.
- **One-click Install**:
  - Install from a URL (e.g., from a community Git repo).
  - Install from official/community maintained `registry.json` sources.
  - Automatic validation of skill names and format compliance.
- **Import/Export**:
  - Import from local folder/zip.
  - Export configured skills to standard format for sharing.
  - Auto-generate compliant SKILL.md files on export.
- **Create/Edit**: A GUI to define the System Prompt and configure MCP servers for the skill.

### 3.3 Integration with Chats

- When starting a new chat, users can "Equip" one or multiple Skills.
- **Effect**:
  1. The Skill's `instruction` is appended to the session's System Prompt.
  2. The Skill's defined MCP servers are started and attached to the session context.

### 3.4 Skill Builder

- Provide a graphical interface to create Skills.
- **Prompt Editor**: Write core instructions.
- **MCP Configuration**: Visually add MCP servers through forms, no need to write JSON manually.
- **Frontmatter Editor**: Graphical interface to edit skill metadata with automatic name validation.
- **Live Preview**: Preview the generated SKILL.md file format.

### 3.5 Troubleshooting

If a skill does not show up:

1. **Verify file name**: Ensure the file is named `SKILL.md` (all caps).
2. **Check frontmatter**: Ensure it includes `name` and `description` fields.
3. **Uniqueness check**: Ensure skill names are unique across all locations.
4. **Permission check**: Check permissions—skills with `deny` are hidden from agents.
5. **Directory name match**: Ensure the directory name matches the `name` field in frontmatter exactly.
6. **Format validation**: Use regex `^[a-z0-9]+(-[a-z0-9]+)*$` to validate name format.

### 3.6 Export & Sharing

- **Export to Bundle**: Pack the skill into a shareable JSON or ZIP.
- **Claude Code Compatibility**: Allow exporting in a format compatible with Anthropic's official `SKILL.md` structure so users can use PromptHub to author skills for the official Claude desktop app.

---

## 4. Technical Implementation Roadmap

### Phase 1: Basic Skill Definition

- [ ] CRUD for Skills (Name, Description, System Prompt).
- [ ] Ability to "attach" a Skill to a Prompt/Chat.
- [ ] Implement skill discovery mechanism for project and global paths.
- [ ] Add SKILL.md parser with frontmatter validation.

### Phase 2: MCP Integration

- [ ] UI to define MCP servers within a Skill.
- [ ] Background process management to spawn MCP servers when a Skill is active.
- [ ] Implement permission system for skill access control.

### Phase 3: Marketplace/Hub

- [ ] A simple online registry (JSON file hosted on GitHub) to list community skills.
- [ ] "Install" button implementation with automatic validation.
- [ ] Export/import functionality with Claude Code compatibility.

# Skills Spec

## Added Requirements

### Requirement: Skill User Notes

PromptHub MUST allow users to store a personal note on an installed managed
skill without modifying the skill definition or source-provided description.

#### Scenario: User adds a note to an installed skill

- **Given** an installed skill
- **When** the user saves a note for that skill
- **Then** the note is stored in `.prompthub/user.json` under that skill's
  managed repo
- **And** the skill description and `SKILL.md` content are unchanged.

#### Scenario: Source update preserves user note

- **Given** an installed skill has a user note
- **When** the skill is updated from a store or Git source
- **Then** the source-provided content and description may update
- **And** the user note remains unchanged.

#### Scenario: Notes do not create content history

- **Given** an installed skill
- **When** the user saves a personal note
- **Then** PromptHub writes `.prompthub/user.json` with
  `skipVersionSnapshot`
- **And** no `skill_versions` snapshot is created for the note-only change.

#### Scenario: Notes accept realistic user text

- **Given** a note containing CJK text, emoji, newlines, quotes, SQL-like text,
  or HTML-like text
- **When** the note is saved and reloaded
- **Then** the value round-trips exactly.

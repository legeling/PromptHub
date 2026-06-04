# Implementation

## Shipped Changes

- Added CodeMirror 6 as the lightweight built-in code editor for skill files.
- Added `SkillCodeEditor` to own editor mounting, language extensions, read-only/editable state, keyboard shortcuts, search, completion, line numbers, folding gutter, bracket matching, and editor theme.
- Replaced the old `pre`/`textarea` file content implementation in `SkillFileEditor` with `SkillCodeEditor`.
- Added language detection for common skill file formats including TypeScript, JavaScript, Python, JSON, YAML, Markdown, HTML, CSS, SQL, Dockerfile, and plaintext fallback.
- Added status-bar language display based on the CodeMirror language detector.
- Enabled CodeMirror soft wrapping so long skill-file lines stay readable without horizontal dragging.
- Constrained the CodeMirror host and scroller to the editor panel so vertical scrolling happens inside the code area.
- Normalized skill file relative paths to POSIX-style `/` in the local repo service and file editor so Windows `path.relative()` results do not flatten nested files such as `scripts\\cd2cli\\main.py`.
- Made the file editor's read-only/edit transition explicit: entering edit mode shows an editing state plus discard, cancel, and save icon actions.
- Added a custom CodeMirror highlight style with light/dark CSS variables so dark mode no longer relies on the low-contrast default token palette.
- Changed skill version-history layout so the timeline pane has its own scroll area and the right-side preview/diff pane scrolls independently.
- Removed automatic version snapshot creation from ordinary managed local-repo file operations (`write`, `rename`, `delete`, and `create directory`). Skill versions are now created by explicit snapshot actions or high-risk flows that intentionally create a protection snapshot.
- Added resource preview metadata to skill file entries and render supported resources directly in the skill file editor.
- Supported preview formats now include SVG, PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, MP3, WAV, OGG, M4A, FLAC, MP4, WebM, OGV, MOV, and PDF.
- Kept recursive/bulk skill-file reads lightweight: supported resource files still return a placeholder during bulk reads, while single-file opens return a bounded `data:` URL for preview.
- Added image/SVG preview zoom controls in the file editor header, including zoom out, reset, and zoom in actions with localized labels across all desktop locales.
- Added `material-icon-theme` and replaced generated file-icon badges with real SVG assets from the VS Code Material Icon Theme package.
- Added file-type-specific tree icon URLs for common formats such as Python, JavaScript, TypeScript, JSON, YAML, HTML, CSS, shell, Markdown, SVG, images, Dockerfile, XML, and license files.
- Removed obsolete file-editor static `highlight.js` helper/tests and the transparent textarea overlay implementation.
- Fixed a dirty-state regression where CodeMirror parent-driven `value` sync
  was reported through `onChange` as if the user had edited the file. This made
  multi-file imported Skills, especially custom Git/Gitea imports, show the
  unsaved dot and prompt to save immediately when switching files.
- Changed Skill Markdown preview highlighting to ignore unregistered fenced-code
  languages instead of throwing. Real imported skills with languages such as
  `powershell` now render the preview and show the code block as plain code if
  the highlighter does not know that language.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-code-editor.test.tsx tests/unit/components/skill-file-icons.test.ts tests/unit/components/skill-file-editor.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/components/skill-file-editor.test.tsx tests/unit/components/skill-version-history-modal.test.tsx tests/unit/components/skill-code-editor.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-file-editor.test.tsx --testNamePattern "normalizes Windows relative paths"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern "reads all files recursively from a skill repo"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern "preview data URLs|unsupported and oversized|reads all files recursively from a skill repo"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-file-editor.test.tsx tests/unit/components/skill-code-editor.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-file-editor.test.tsx --testNamePattern "resource files"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-file-editor.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-code-editor.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-preview-pane.test.tsx`
- JSON parse validation for all desktop locales (`en`, `zh`, `zh-TW`, `ja`, `fr`, `de`, `es`)
- `pnpm --filter @prompthub/desktop typecheck`

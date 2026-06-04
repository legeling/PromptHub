# Design

## Overview

Add an explicit batch mode inside `SkillStore`. The mode stores selected store Skill keys in local renderer state and derives target sets from the current filtered catalog. Batch actions call the same store actions already used by single-card and detail flows: `installRegistrySkill`, `updateRegistrySkill`, and `uninstallRegistrySkill`.

## Affected Areas

- Data model: no durable data model change.
- IPC / API: no new IPC channel. Existing Skill store actions continue to call existing APIs.
- Filesystem / sync: no filesystem layout change.
- UI / UX:
  - The store header gets an icon-only batch management toggle.
  - Cards show an icon selection affordance in batch mode.
  - Card click toggles selection in batch mode; a separate icon opens detail.
  - A compact sticky batch action bar exposes icon-only install, update, remove, clear, and exit actions.
  - Batch removal requires confirmation.

## Tradeoffs

- Batch actions run sequentially while marking all targets pending up front. This avoids local DB and file-operation races while still giving each card a real pending state until its own operation completes.
- "Select visible" means the currently loaded and filtered catalog entries, not unloaded remote pages.

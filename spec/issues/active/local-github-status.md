# Local GitHub Issue Status

## Purpose

This file is the local triage and delivery overlay for GitHub issues.

The GitHub snapshots record remote facts:

- `github-open.md`: issues currently open on GitHub.
- `../archive/github-closed.md`: issues currently closed on GitHub.

This file records PromptHub's local delivery state. A GitHub issue can remain
open while its local status is `local_done` or `release_pending`; GitHub issues
are closed only after the version containing the change has been published.

## Status Values

| Status            | Meaning                                                                       | GitHub action                        |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| `untriaged`       | The issue exists remotely but has not been classified locally.                | Leave open                           |
| `accepted`        | The issue is valid and should be handled, but implementation has not started. | Leave open                           |
| `in_progress`     | A local change is actively handling the issue.                                | Leave open                           |
| `local_done`      | Code, tests, and docs are complete locally, but not released.                 | Leave open                           |
| `release_pending` | The issue is assigned to a release that has not shipped yet.                  | Leave open                           |
| `released`        | The target version has shipped.                                               | Close GitHub, then refresh snapshots |
| `wontfix`         | The project will not implement this issue.                                    | Explain publicly, then close         |
| `duplicate`       | The issue is tracked by another issue.                                        | Link the canonical issue, then close |

## Current Local Overlay

| Issue | GitHub state | Local status    | Target release | Change                                  | Notes                                                                                                     |
| ----- | ------------ | --------------- | -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| #178  | open         | release_pending | 0.5.9-beta.2   | `desktop-issue-178-hermes-localappdata` | `%LOCALAPPDATA%` / Hermes Windows Native handling is implemented locally; keep GitHub open until release. |
| #170  | open         | release_pending | 0.5.9-beta.2   | `skill-package-boundary`                | GitHub package install now preserves non-`SKILL.md` files locally; keep GitHub open until release.        |
| #169  | open         | release_pending | 0.5.9-beta.2   | `web-prompt-clipboard-copy`             | Web Markdown prompt copy fallback is implemented locally; keep GitHub open until release.                 |
| #168  | open         | release_pending | 0.5.9-beta.2   | `my-skill-source-update`                | False local-modified detection fix is implemented locally; keep GitHub open until release.                |
| #177  | open         | untriaged       |                |                                         | Skillhub integration needs scope and source-format evaluation.                                            |
| #176  | open         | untriaged       |                |                                         | Plugin loading report needs reproduction and affected plugin identification.                              |
| #175  | open         | untriaged       |                |                                         | Aghub-inspired Skill/MCP board request needs product-scope triage.                                        |
| #167  | open         | untriaged       |                |                                         | Custom Skill store search should be evaluated against current store search/filter UI.                     |

## Update Rules

- Update this file whenever a GitHub issue is triaged, attached to an active change, completed locally, assigned to a release, or publicly closed.
- Do not edit `github-open.md` or `github-closed.md` for local delivery status; those files are regenerated from GitHub.
- Before a release, scan for `local_done` issues and move included items to `release_pending`.
- After a release, move shipped items to `released`, close the corresponding GitHub issues with the release version, then refresh both GitHub snapshots.

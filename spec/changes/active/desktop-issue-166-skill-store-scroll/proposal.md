# Proposal

## Problem

GitHub issue #166 reports that when the Skill Store source list grows beyond the app viewport, the bottom entries cannot be reached. The affected area is the desktop Skill module sidebar, where built-in and custom store sources are rendered under the Skill Store group.

## Scope

- Fix the desktop Skill sidebar layout so many store sources scroll inside the sidebar panel instead of expanding past the window boundary.
- Add regression coverage for a large custom store source list.
- Keep Skill Store loading, source persistence, and install behavior unchanged.

## Risks

- The sidebar also contains My Skills, project skills, agent skills, and tag filters. The fix must not make those fixed entries disappear or steal scroll from the tag filter section.
- The collapsed sidebar layout must not expose a broken scroll area.

## Rollback

Revert the Sidebar layout class changes and the regression test.

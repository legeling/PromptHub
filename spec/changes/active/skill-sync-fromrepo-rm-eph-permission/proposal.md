# EPERM on syncFromRepo when replacing the canonical skill workspace

Status: recorded — not implemented. Filed separately from the
`skill-canonical-prompthub-bundle-recovery` fix (already committed as
98c97881 on feat/my-skills-tag-search).

## Problem

`skill:syncFromRepo` intermittently throws

    EPERM: operation not permitted, lstat
    C:\\Users\\90438\\AppData\\Roaming\\PromptHub\\cache\\skill-workspaces\\
    <uuid>\\SKILL.md

from `hydrateCanonicalSkillWorkspace` ->
`fs.rmSync(workspacePath, { recursive: true, force: true })` while replacing
the writable canonical workspace. The EPERM surfaces under Windows when a file
under the workspace is still open / held (editor, sync/scan indexer, antivirus,
or the just-written replacement), so removing the old tree races with whatever
holds `SKILL.md`.

## Scope / relation

`hydrateCanonicalSkillWorkspace` in
`packages/core/src/canonical-skill-library.ts` deletes then rebuilds the
workspace on every reconcile. Skills that were successfully imported can then
fail a later repo sync purely because the transient-hold removal raised EPERM
(state loss is bounded: new data is staged first, removal targets only the
cache workspace copy).

## Open / unresolved

- Confirm exact holder during repro (editor holding SKILL.md vs internal FD).
- Decide the durable change: bounded retry on EPERM, or a compare-and-swap that
  keeps the old workspace live while the replacement is built, only swapping
  when the new tree is ready and on failure keeps serving the existing copy.
- Decide whether any write path that just wrote into the workspace file keeps
  the fd open until after the removal attempt (candidate root cause).

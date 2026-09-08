# Design

## Existing evidence

`publishCanonicalSkill` prefers `local_repo_path`; `collectPackageFiles` returns an
empty inventory for a missing directory. A real SQLite/temporary-root probe confirmed
that deleting the cache and changing favorite state reduced two package files to zero.

Desktop local-file handlers publish only entrypoint edits. Startup calls
`reconcileCanonicalWorkspaces`, which replaces working caches from canonical bundles.
The probe confirmed that unpublished helper-script edits disappear on reconstruction.

`readCurrentFilesSnapshot` and backup `collectSkillData` map preview-reader content
to `SkillFileSnapshot`. Its contract is only `{ relativePath, content }`. Desktop
replacement and CLI restoration write that string as UTF-8. Binary previews return
`[binary file]`; text above 1 MiB returns `[file too large]`.

## Accepted implementation decisions (2026-09-08)

The user authorized the long-term project-consistent implementation and one scoped
commit after verification. Preserve backward reading, not an impossible promise
that unmodified UTF-8-only clients can decode arbitrary binary files.

- **DES-SKD-001:** Retain validated canonical payload when a derived cache is missing;
  distinguish this from an explicitly supplied invalid package source.
- **DES-SKD-002:** Stage managed package mutations from the verified canonical bundle,
  validate paths and the complete resulting package, compare the source revision,
  then publish through the existing database adapter. Never mutate the live cache
  before publication. Preserve existing canonical commit-outcome semantics; do not
  undo already committed canonical writes. Empty directories remain derived, not
  durable payload entries.
- **DES-SKD-003:** Separate preview reads from lossless snapshot reads. Reuse bounded
  byte readers, path validation and atomic package replacement rather than exposing
  preview data as snapshot content.
- **DES-SKD-004:** Keep legacy `{relativePath, content}` for UTF-8 text; add
  `encoding: "base64"` only for non-text bytes. Use one shared validator/codec across
  desktop, CLI and Web, with existing package capacity/path limits. No SQL migration
  and no bulk rewrite of old history. Preserve encoding through normalizers and
  render binary changes as metadata, not a base64 text diff. Encoded snapshots require
  versioned file envelopes/canonical documents and sync capability negotiation.

Before an encoded API push, desktop and CLI require the server manifest's explicit
`skillSnapshotCapability: "2"`; a request header alone is not proof that an old server
understands it. The read-only preflight precedes uploads/PUTs. Desktop reuses its
bounded HTTP transport; the CLI probe has a 30-second deadline and no automatic retry.
Text-only pushes retain their existing request sequence. This adds one bounded
manifest request only when binary snapshots are present.

## Compatibility and rollback

The existing contract has no binary encoding field. Merely putting base64 into
`content` allows old clients to write base64 characters into PNG/ZIP files. Safe
compatibility therefore requires a format/version boundary and coordinated consumer
updates, not a local reader replacement. The user has delegated this decision after
the impact review.

Accepted boundary: new-format writes with lossless binary encoding; new clients
read historical text snapshots; old clients are not supported for restoring the new
binary format. Preserve original old backups and do not guess lost historical bytes.
Do not share a writable data root with an older application after binary history has
been written. Downgrade using an independently preserved pre-upgrade backup, not by
stripping encoding fields. Unsupported/malformed encodings must fail before writes.

## Cost and verification

File traversal remains O(files + bytes), with existing file/tree bounds; base64 adds
approximately one third to binary payload size. Avoid new dependencies and unbounded
parallel reads. Test actual persisted bytes, missing-cache recovery, all file mutation
types, publication failure, Unicode/traversal/symlink rejection and large inventories.
No live data or external service is needed for these regressions.

The bounded filesystem traversal and staged publication routines keep their resource
ownership and cleanup in one linear function even where formatting exceeds 50 lines;
splitting their state/try-finally ownership would obscure failure handling. Dedicated
capacity, revision-conflict and rollback fixtures cover these longer routines.
Web workspace traversal retains its existing recursive boundary with a shared budget;
no independent per-directory quota can conceal aggregate overflow.

# Skill durability delta

- **FR-SKD-001:** A missing derived workspace must not publish an empty package over
  an intact canonical bundle. Explicit invalid package sources must fail without data loss.
- **FR-SKD-002:** Successful managed package file edits, renames and deletions must
  be durable after restart/reconstruction. Publication failure must restore prior state.
- **FR-SKD-003:** New file snapshots must round-trip arbitrary supported bytes and
  oversized-for-preview text; preview placeholders are not durable file contents.
- **FR-SKD-004:** Snapshot compatibility must be explicit across desktop, CLI,
  backup parsing/restoration and canonical resource validation. Historical text
  snapshots remain readable. Already lost historical bytes cannot be reconstructed
  from placeholders without an independent intact source.

FR-SKD-004: backward reading is required; unmodified old clients cannot restore new
binary history. Supported transport boundaries must explicitly reject unsupported
consumers instead of dropping the encoding field or writing base64 as file text.

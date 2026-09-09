# Tasks

- [x] **T-SCS-001:** Audit callers/defaults and record the accepted boundary.
- [x] **T-SCS-002:** Write regressions, then complete source/UI/contract/doc changes.
- [x] **T-SCS-003:** Run focused tests, branch coverage and cross-package static gates.
- [x] **T-SCS-004:** Run final relevant suites, document remaining acceptance limits,
  synchronize stable boundaries and archive the completed change.

| Requirement | Design | Verification | Task |
| --- | --- | --- | --- |
| FR-SCS-001 | DES-SCS-001 | TEST-SCS-001 | T-SCS-002, T-SCS-003 |
| FR-SCS-002 | DES-SCS-002 | TEST-SCS-002 | T-SCS-002, T-SCS-003 |
| FR-SCS-003 | DES-SCS-003 | TEST-SCS-003 | T-SCS-002, T-SCS-003 |
| FR-SCS-004 | DES-SCS-004 | TEST-SCS-004 | T-SCS-002, T-SCS-004 |

- **TEST-SCS-001:** Flagged-content installs/updates/snapshots do not invoke scans,
  require approval, lose bytes or retry based on source trust.
- **TEST-SCS-002:** Disabled default, old-settings normalization, explicit enablement,
  visible manual controls and no automatic scans on navigation/install/update.
- **TEST-SCS-003:** Content-only/source-independent static and AI reports, no static
  network access, accurate method labels and explicit model failure semantics.
- **TEST-SCS-004:** Path/archive containment, package capacity and atomic rollback
  remain enforced independently of optional scanning.

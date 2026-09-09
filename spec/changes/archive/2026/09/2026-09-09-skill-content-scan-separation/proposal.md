# Standalone Skill content scanning

## Scope

The 2026-09-09 accepted product boundary separates optional content assessment from
all normal business operations. Installation, import, update, editing, versioning,
backup, synchronization and distribution must not run a content scanner or consume
its report as permission. Sources and channels are not assessment criteria.

The standalone feature defaults off. Enabling it exposes explicit static scanning
and optional AI-assisted analysis; enabling does not start background or workflow
scans. Reports are advisory and never execute the assessed content.

Filesystem containment, archive validation, input validation, transport protections,
package representation limits, atomic writes and recovery remain independent.
No live profile/configuration migration, deployment or push is included.

## Superseded boundaries

This explicitly supersedes automatic/channel policies, fingerprint-pinned content
approval, source-trust retry, mandatory content preflight and CLI secret-scan gates
described in the stable Skill document and archived safety-policy/review changes.
It does not supersede package durability or active foundation recovery work.

## Compatibility

Old automatic/channel/trust settings do not enable the standalone feature. Historical
reports remain readable. Legacy operation scan/approval fields are tolerated but
ignored; they cannot start scans. Downgrading restores old binary behavior, so users
must review old settings before running an older application. No package bytes or
existing report history are rewritten.

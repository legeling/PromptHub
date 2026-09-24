# Foundation audit evidence — 2026-09-05

Scope: architecture, local persistence, publication state machines, remote backup,
renderer state, Cloudflare persistence, and verification gates. Read-only review
of production code; no production profiles, remote services or GUI are accessed.
This issue evidence directory defines reproducible probes, not an approved new
storage design or a completed implementation change.

Baseline: `18c08482690ece022c3dd39567fde60b0d0813ed` plus the existing dirty working
tree. Concurrent local work includes Prompt version repair, Skill import/filter
and sync observability. Individual findings must distinguish those changes from
unchanged code. Fixture roots use `prompthub-foundation-audit-*` under the OS
temporary directory and are removed after each test. SQLite probes use the real
WASM adapter in memory; network/D1 probes use deterministic storage adapters.

The assertions express desired integrity properties. Failures document current
defects and are expected until those defects are resolved. These files use the
`.audit.ts` extension and are outside normal unit-test discovery.

| Probe | Required integrity property                                       | Verification method                                              |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| A01   | Publication cleanup cannot leave mixed generations                | Actual filesystem plus cleanup failure injection                 |
| A02   | Outer transaction rollback leaves no aborted canonical resource   | Actual SQLite transaction plus actual canonical files            |
| A03   | Measure per-mutation cost at 10, 100, 500 resources               | Actual files and SQLite; elapsed time and synchronous I/O counts |
| A04   | Failed remote publish preserves last readable backup              | Stateful remote adapter plus production upload/download code     |
| A05   | Identical data does not upload again solely because time passed   | Fixed inventory with controlled wall clock                       |
| A06   | Refresh reflects external edits in detail and list                | Store plus simulated database boundary                           |
| A07   | Deletion is not reversed by snapshot timestamp comparison         | Production sync direction selection; empty local fixture         |
| A08   | Concurrent acknowledged creates are retained                      | Production Worker handlers plus two-read D1 barrier              |
| A09   | Malformed/newer snapshots cannot become empty replacements        | Production snapshot normalizer                                   |
| A10   | Failed initial history creation leaves no Prompt row              | Actual SQLite abort trigger and base DB class used by Web        |
| A11   | Failed workspace refresh cannot split Skill authority and catalog | Actual bundle, SQLite and one failed workspace rename            |

Run from the repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --config ../../spec/issues/active/foundation-audit-20260905/vitest.config.ts --reporter=verbose
```

The suite is single-worker, with a 60-second per-test bound. External suite
activity may influence timing; this is an audit measurement, not a release
performance certification. Findings and actual results are recorded in the
adjacent report after verification. No fixes, commits, branches, or releases are
authorized by this evidence record.

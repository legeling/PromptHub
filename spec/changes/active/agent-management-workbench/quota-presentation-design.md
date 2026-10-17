# Agent Quota Presentation Design

## Status

- Phase: converge
- Status: implemented and verified; parent change remains active
- Requirement: `FR-AGENT-097`
- Design: `DES-AGENT-115`
- Verification: `TEST-AGENT-138`
- Task: `T-AGENT-184`
- Scope: renderer presentation model, shared usage contract, existing six verified
  quota adapters, Overview banner and menu-bar popover
- Non-goals: new provider endpoints, new credential sources, usage estimation,
  billing/cost calculation, persistence, or additional background requests

This design supersedes only the presentation rule in `FR-AGENT-027` /
`DES-AGENT-023` that accepts a provider-selected `window`/`quota` chart kind.
Visualization now derives from typed value and period semantics. The verified
provider sources, credential isolation, 60-second process cache and two-request
concurrency limit remain unchanged.

## Current Inventory

The six delivered adapters already cover the quota shapes below. The renderer
must model these shapes directly instead of recognizing individual Agents.

| Adapter              | Scope                  | Period                       | Provider value                                   | Reset               | Current cardinality |
| -------------------- | ---------------------- | ---------------------------- | ------------------------------------------------ | ------------------- | ------------------: |
| Claude Code          | account                | rolling 5 hours              | used percent                                     | timestamp or absent |                 0-1 |
| Claude Code          | account                | rolling 7 days               | used percent                                     | timestamp or absent |                 0-1 |
| Claude Code          | model family (Opus)    | rolling 7 days               | used percent                                     | timestamp or absent |                 0-1 |
| Codex / ChatGPT      | account                | session/short rolling window | used percent                                     | timestamp or absent |                 0-1 |
| Codex / ChatGPT      | account                | rolling 7 days               | used percent                                     | timestamp or absent |                 0-1 |
| Kimi Code            | account                | weekly allowance             | remaining/limit or legacy used/limit             | timestamp or absent |                 0-1 |
| Kimi Code            | account                | rolling short window         | remaining/limit or legacy used/limit             | timestamp or absent |                 0-n |
| Antigravity          | model group            | rolling 5 hours              | remaining fraction                               | timestamp           |          0-n groups |
| Antigravity          | model group            | rolling week                 | remaining fraction                               | timestamp           |          0-n groups |
| Antigravity fallback | model                  | provider-defined             | remaining fraction                               | timestamp or absent |          0-n models |
| Gemini CLI           | model                  | provider-defined             | remaining fraction                               | timestamp or absent |          0-n models |
| GitHub Copilot       | feature (premium/chat) | billing cycle                | remaining, entitlement and optional used percent | shared timestamp    |                 0-2 |
| GitHub Copilot       | feature                | unlimited                    | unlimited flag                                   | not applicable      |                 0-n |

The design must also remain valid for future daily, calendar-week,
billing-cycle, lifetime/total, absolute balance and provider-defined periods.
Those variants are contract values, not new React components.

## Problems In The Current Contract And UI

1. `kind: "window" | "quota"` mixes business meaning with visualization. A
   resettable model quota is still a quota, but the banner treats any quota
   without both amount fields as a ring.
2. `utilization` always means used percent while the UI mostly labels values as
   remaining. The current ring subtracts utilization, the bar width also uses
   the remainder, and amount copy can still show used/total. This makes a
   monthly credit line capable of showing three different directions at once.
3. `resetsAt` does not describe whether the limit is rolling, calendar-based,
   lifetime, or simply unknown. Labels therefore depend on metric ids and
   Agent-specific string rules.
4. Account, model-group, model and feature quotas have no typed scope. The
   Antigravity renderer reconstructs grouping by parsing id prefixes.
5. Unlimited and provider-reported-empty states are lost. Copilot currently
   drops unlimited snapshots, and `status: ok` with no metrics can render an
   empty strip.
6. The five-metric limit applies only to numeric quota bars. Window/model
   metrics remain unbounded, so a provider with eleven model buckets can render
   eleven large rings.
7. Cold loading fabricates 5-hour and 7-day placeholders for every Agent.
8. Overview and menu-bar surfaces duplicate metric labels, reset countdowns,
   percentage clamping, primary selection and tone thresholds.

## Semantic Contract V2

### Codex balance and tier extension (2026-10-17)

The current contract also accepts `{ kind: "balance", remainingAmount: number,
unit: "credits" | "resets" }`. A balance has no denominator, percentage, progress
bar, or low-percentage warning. It is read from the existing WHAM usage response:
`credits.balance` (including numeric strings), `credits.unlimited`, and
`rate_limit_reset_credits.available_count`. Missing objects are omitted; an
object without a valid nonnegative balance/count displays unknown. Counts must
be safe integers. This is a same-build main/renderer contract extension with no
persisted snapshots, database schema changes, or migration.

Codex windows retain their actual duration. Primary/secondary slot position and
subscription name do not determine window presence or duration. Additional
provider buckets are bounded model-group metrics. Tier display is shared by
Overview and native tray: `prolite` → Pro $100, `pro` → Pro $200, `promax` → Pro
$500. This identifies the tier, not a billing invoice or grandfathered allowance.
Other providers' plan names keep their existing presentation.

Sources: [official pricing](https://learn.chatgpt.com/docs/pricing),
[Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers),
[upstream plan identities](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/auth.rs),
[usage and reset summary](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/types.rs),
[read-only usage request](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs).
The existing 60-second cache, refresh action, authentication, and error recovery
remain authoritative. No extra balance endpoint or reset-consumption action is
introduced. Live account/UI acceptance remains outstanding for this extension.

Static verification for this extension: desktop and shared TypeScript checks
and scoped desktop ESLint passed. Automated tests and live account/UI checks
were not run for this change; the earlier verification status above applies to
the original presentation implementation only.

The adapter boundary normalizes provider payloads into quota semantics. It does
not select a chart, layout, color, visible count or primary metric.

```ts
type AgentQuotaScope =
  | { kind: "account" }
  | { kind: "model-group"; id: string; label: string }
  | { kind: "model"; id: string; label: string }
  | { kind: "feature"; id: string; label: string };

type AgentQuotaPeriod =
  | { kind: "rolling"; durationSeconds: number | null }
  | { kind: "calendar"; unit: "day" | "week" | "month" | "billing-cycle" }
  | { kind: "lifetime" }
  | { kind: "provider-defined"; label: string };

type AgentQuotaValue =
  | { kind: "percentage"; remainingPercent: number }
  | { kind: "balance"; remainingAmount: number; unit: "credits" | "resets" }
  | {
      kind: "amount";
      remainingPercent: number;
      remainingAmount: number;
      limitAmount: number;
      unit: string;
    }
  | { kind: "unlimited" }
  | { kind: "unknown" };

interface AgentUsageMetricV2 {
  id: string;
  label: string;
  scope: AgentQuotaScope;
  period: AgentQuotaPeriod;
  value: AgentQuotaValue;
  resetsAt: number | null;
}

interface AgentUsageQuotaV2 {
  schemaVersion: 2;
  agentId: string;
  adapter: string;
  status: "ok" | "no-credentials" | "expired" | "unavailable";
  source: "provider";
  plan: string | null;
  fetchedAt: number;
  errorCode?: string;
  metrics: AgentUsageMetricV2[];
}
```

Contract rules:

- `remainingPercent` is the only percentage crossing the renderer boundary. It
  is finite and clamped to `0..100` by the main-process adapter.
- An amount value always carries `remainingAmount`, `limitAmount` and a bounded
  unit together. Adapters convert used amounts before returning the contract.
- `unknown` means the provider named a quota but did not provide a trustworthy
  value. It must not become `0%`.
- `unlimited` remains visible and has no progress value or warning tone.
- `resetsAt: null` means unknown or not reported. Period kind determines whether
  reset is applicable; the renderer does not infer this from the metric id.
- Dynamic ids and labels are bounded and sanitized in main. Scope ids are data
  identities, not localization keys or CSS selectors.
- `schemaVersion: 2` invalidates the current renderer cache without a DB or
  filesystem migration. Main, preload and renderer ship atomically in the same
  desktop build.
- Cached Antigravity V2 snapshots containing the retired `promptCredits`
  metric are rejected so an old fabricated total cannot survive a failed
  refresh; valid grouped window caches remain reusable.

## Presentation Decision

### Canonical semantic visualizations

The quota module has two quantitative visualizations selected centrally from
period and value semantics, never from Agent id or provider chart hints:

| Semantic case                                              | Visualization  | Reason                                                             |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| Finite percentage or amount with rolling period            | compact ring   | A bounded reset window is read as one replenishing cycle           |
| Finite percentage or amount with calendar day/week         | compact ring   | Daily and weekly reset windows share the same cycle semantics      |
| Calendar month/billing cycle, lifetime or provider-defined | horizontal bar | Total/balance semantics are clearer as a linear remaining quantity |
| Unlimited or unknown                                       | explicit text  | No trustworthy finite progress exists                              |
| Absolute balance without a denominator                     | stat card      | Keep the number adjacent to its label without inventing a percentage |

Rings are deliberately compact and compose side by side within a scope group;
they are not the former oversized banner gauges. Bars span the available group
width. Account balances and reset counts use bordered, subtly tinted stat cards
with a small semantic icon and prominent tabular number. They sit beside the
window rings in one wrapping flex row; available content width determines when
cards wrap. Labels and values stay together rather than occupying opposite ends
of the whole banner. Numeric balance cards do not expose a progressbar role.
Both progress visualizations expose the same `role="progressbar"`, remaining-value
direction, warning thresholds and accessible label.

The visual direction is always **remaining**:

- fill width = remaining percent;
- numeric copy = `72% remaining`;
- amount copy = `49,500 / 50,000 credits remaining`;
- normal/warning/critical thresholds = above 30%, 11-30%, and 0-10% remaining.

No surface may combine percent-used fill with remaining amount copy.

### Shared component composition

```text
AgentQuotaSummary
├── AgentQuotaHeader (plan, exceptional freshness state, refresh)
├── AgentQuotaGroup[]
│   ├── scope label
│   └── AgentQuotaMeter[]
│       ├── metric + period label
│       ├── remaining value or unlimited/unknown text
│       ├── semantic compact ring or horizontal bar when finite
│       └── amount + reset metadata
└── AgentQuotaState (loading/error/empty/stale)
```

`AgentQuotaMeter` is the only quantitative renderer and contains the semantic
ring/bar selection. Overview and the menu-bar popover consume the same pure
presentation model and formatting helpers; they may choose different density
and expansion behavior, but not different chart selection or value semantics.
The plan uses one shared subscription badge rather than unstyled metadata.

### Grouping and ordering

Metrics group by typed scope rather than Agent id or metric-id parsing:

1. account aggregate;
2. model group;
3. feature;
4. individual model.

Within a group, shorter rolling windows precede longer rolling windows,
followed by calendar day/week/month/billing-cycle, provider-defined and
lifetime totals. Stable label/id order breaks ties. Individual model groups may
sort by lowest remaining percent first so constrained models are never hidden.

Examples:

- Codex: one account group with compact 5-hour and 7-day rings.
- Claude: one account group plus an Opus model-group row when reported.
- Kimi: one account group with rolling and weekly metrics; both are finite
  reset windows and therefore use compact rings even though the provider also
  reports absolute request amounts. The current endpoint
  reports the 5-hour window as `300 TIME_UNIT_MINUTE`; adapters normalize the
  proto enum and prefer provider-reported `remaining` while preserving legacy
  `used` compatibility. The shared Kimi membership monthly total is a separate
  cross-product constraint: the current Kimi Code endpoint and official CLI do
  not expose a trustworthy numeric value, so `totalQuota` is not presented as a
  Kimi Code total.
- Antigravity: `Gemini Models` and `Claude and GPT models` each contain 5-hour
  and weekly rows. Baseline quota does not include an account total; AI credits
  are a separate overage balance and are not inferred from legacy status fields.
- Gemini: one model list with one meter per model.
- Copilot: one feature group containing premium and chat request rows;
  unlimited entries remain visible as `Unlimited`.

### Cardinality and responsive layout

| Finite/explicit metrics | Overview behavior                                                                                           | Menu-bar behavior                                |
| ----------------------: | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
|                       0 | explicit empty or provider state; never blank and never `0%`                                                | status row                                       |
|                       1 | one meter row, constrained readable width                                                                   | primary row                                      |
|                     2-4 | render every group in a responsive two-column grid                                                          | most constrained row; expand for all             |
|                     5-8 | render every grouped row in two columns                                                                     | most constrained row; expand for all             |
|                    9-64 | show all account/group/feature rows plus the four most constrained model rows and an explicit expand action | most constrained row; expand into bounded scroll |

The expanded Overview model list is bounded to 64 metrics and scrolls within
the usage section. It must not expand the whole page indefinitely. The menu-bar
popover keeps its fixed shell and scrolls internally.

Overview uses one shared `UsageCard` shell for every metric and loading
skeleton: border, background, radius, padding and minimum height are identical.
Only the inner visualization varies with value/period semantics. Rings have
the same shell whether or not balance metrics are present. Groups keep their
scope order, with account groups spanning the container and other groups
wrapping from a 25rem flex basis. Individual metric cards share each row from
a 12rem basis; available container width determines wrapping, with no Agent
identity or viewport breakpoint branches. Balance content no longer owns a
second card shell. The renderer layout changes no data or persistence contract.

2026-10-17 follow-up: shared card composition implemented; scoped ESLint passed.
Desktop typecheck is blocked by TS2353 (`servername` in `ClientRequestArgs`)
in `agent-provider-connectivity.ts:260` and `agent-provider-model-test.ts:360`,
outside the changed quota components. `git diff --check` passed.
Automated tests and GUI verification were not run for this layout follow-up.

### Loading, stale and failure states

- No cached snapshot: render neutral skeleton rows with no percentage text.
- Cached snapshot while refreshing: keep values in place and let the refresh
  control carry its busy state; do not expose cache implementation copy or
  replace metrics with placeholders.
- Refresh failure with a successful cache: retain values and show stale/error
  metadata.
- `ok` with no metrics: show `Provider did not report a quota`.
- `no-credentials`, `expired`, custom provider, Antigravity helper unavailable
  and generic unavailable remain explicit guided states.
- One unknown metric does not hide valid siblings. It renders its label and an
  unavailable value without a progress bar.
- A reset timestamp in the past renders `Reset due`; a missing timestamp does
  not render a fabricated countdown.
- A successful fresh summary omits the redundant provider-reported sentence;
  plan and refresh remain visible, while stale/error copy appears only when
  freshness actually affects trust.

## Adapter Mapping

Each adapter only translates provider fields:

| Adapter              | V2 mapping                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude               | account rolling windows; used percent becomes remaining percent; Opus uses model-group scope                                                                                          |
| Codex                | account rolling windows; `limit_window_seconds` becomes duration; used percent becomes remaining percent                                                                              |
| Kimi                 | weekly amount quota plus rolling amount windows; preserve reset, normalize proto time units, and prefer remaining/limit with used/limit compatibility; ignore unverified `totalQuota` |
| Antigravity local    | model-group rolling 5-hour and weekly windows from `RetrieveUserQuotaSummary`; plan identity from `GetUserStatus`                                                                     |
| Antigravity fallback | model-scoped provider-defined percentage values                                                                                                                                       |
| Gemini               | model-scoped provider-defined percentage values                                                                                                                                       |
| Copilot              | feature-scoped billing-cycle amount values; preserve unlimited snapshots instead of dropping them                                                                                     |

No adapter imports renderer code or sends a presentation hint.

## Ownership And Reuse

- `packages/shared/types/agent.ts` owns the V2 contract.
- `apps/desktop/src/main/services/agent-usage-service.ts` and
  `agent-usage-antigravity-local.ts` own provider normalization.
- A renderer pure module owns grouping, ordering, primary selection, value
  formatting and reset formatting.
- Shared renderer components own header, group, meter and state anatomy.
- `AgentUsageBanner` and `AgentUsagePopover` become thin surface compositions.
- `use-agent-usage.ts` keeps cache/SWR ownership and validates schema version.
- No DB table, settings key, credential source, network endpoint or long-lived
  process is added.

## Complexity And Capacity

- Adapter normalization is `O(n)` time and `O(n)` output for `n` provider
  metrics.
- Grouping is `O(n)` and stable ordering is `O(n log n)`. With a hard contract
  limit of 64 metrics, sorting cost is bounded and materially simpler than a
  custom selection structure.
- Overview initially renders at most all non-model metrics plus four model rows;
  expanded rendering remains bounded to 64. Menu-bar rendering remains one
  primary row per Agent until explicitly expanded.
- Network and I/O costs do not change: existing endpoints, 10-second request
  timeout, 60-second memory cache and two-provider concurrency limit remain.
- The implementation must reject or truncate oversized provider arrays before
  IPC, bound labels/units, and avoid repeated sorting in React render by building
  the presentation model with memoized pure selectors.

## Verification Plan

`TEST-AGENT-138` must begin by reproducing the current semantic and layout
failures, then cover:

1. Contract normalization for used percent, remaining fraction, used/limit,
   remaining/limit, unlimited, unknown, invalid numbers and out-of-range values.
2. Period and scope mapping for 5-hour, daily, weekly, monthly, billing-cycle,
   lifetime, account, model group, model and feature cases.
3. Six adapter fixtures, including Claude optional Opus, Codex one/two windows,
   Kimi amount windows, Antigravity grouped 5-hour/weekly composition, Gemini
   more than eight models, and Copilot unlimited snapshots.
4. Shared presentation selectors: grouping, stable ordering, most-constrained
   primary selection, 0/1/2-4/5-8/9-64 cardinality and over-limit handling.
5. One remaining-value direction across ring arc, bar fill, percentage, amount
   copy, tone and accessible labels; semantic selection covers finite
   rolling/day/week rings and month/total/provider-defined bars.
6. Loading without fake values, cached refresh, stale failure, empty-ok,
   no-credentials, expired, custom-provider and unavailable states.
7. Overview and menu-bar reuse the same view model while preserving their
   density/expansion contracts.
8. Seven locales, long labels/units, keyboard expansion, focus restoration,
   light/dark themes and no overlap at desktop and narrow widths.
9. A bounded 64-metric stress fixture and a renderer performance assertion for
   selector work; provider request count and concurrency remain unchanged.

Implementation is not complete until targeted unit/component tests, changed
coverage, typecheck, affected lint, build, visual Playwright screenshots and
`git diff --check` pass. Any unrelated pre-existing failures must be recorded
without being reclassified as part of this change.

## Analyze Gate

- Requirement, design, verification and task are linked:
  `FR-AGENT-097 -> DES-AGENT-115 -> TEST-AGENT-138 -> T-AGENT-184`.
- Existing provider-source and credential boundaries remain authoritative.
- The former provider-selected ring/bar rule is explicitly superseded rather
  than silently coexisting with this design.
- No storage migration, API-key billing semantics or new provider request is
  implied.
- No unresolved material product decision remains for implementation: chart
  selection and composition derive from value, period, scope and cardinality
  rather than Agent identity.

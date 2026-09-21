# W56-a — Polishing `src/components/SystemHealthView.tsx`

**Task ID:** W56-a
**Agent:** full-stack-developer (Z.ai Code)
**Target file:** `src/components/SystemHealthView.tsx` (247 → 651 lines, +534 / −130 per `git diff --stat`)
**Worklog appended to:** `/home/z/my-project/worklog.md`

## Goal

Apply the W50-55 premium visual layer to the SystemHealthView panel
(Pipeline Health & Subsystem Telemetry) for visual consistency with the
StrategyPerformancePanel (W53-c) / AttributionPanel (W55-c) /
LeaderboardPanel (W55-a) redesign family. Preserve every existing test
contract, polling cadence, fetch-error logging signature, and the
`'use client'` directive.

## Prior work consulted

- `src/components/AttributionPanel.tsx` (W55-c, 1417 lines) — Tone system,
  KpiTile, SectionHeader, PulseDot, ShimmerBlock, PolishedEmptyState,
  PolishedErrorCard.
- `src/components/LeaderboardPanel.tsx` (W55-a, 621 lines) — polished
  empty/error states with verbatim test-contract preservation.
- `src/components/SystemHealthView.test.tsx` (W22-1, 247 lines) — 11 test
  contracts covering loading skeleton, loaded KPI cards, services grid,
  HTTP-500 + network-error banners, dismiss/retry buttons, console.error
  logging, 3 s polling cadence, and clean unmount.

## Inline sub-components added (kept private to the panel so test mocks +
ts-isolation stay clean)

- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo + solid
  dot, aria-hidden. Mirrors W53-c / W54-a / W55-c PulseDot. Used by the
  "Process Supervisor Active" header badge + every service-row status
  indicator. The `pulse` prop is `false` for `poor`-tone services so a
  dead service doesn't ping (calmer UX).
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 9.5px title + optional dim italic
  description + optional trailing node (badge / count). Mirrors W53-c /
  W54-e / W55-c SectionHeader. Used by the "System Metrics" KPI strip +
  the "Supervised Processes & Loops" services table.
- `KpiTile({ label, value, hint, tone, icon, quality, trend, testId })` —
  refined KPI card with tone-tinted bg + ring + Lucide icon in the label
  row + large mono tabular-nums value + quality bar (0-100, tone-tinted)
  + optional trend glyph. Mirrors W53-c KpiTile.
- `ShimmerBlock({ className })` — thin skeleton-line-sm placeholder
  sized via className. aria-hidden. Mirrors W54-e / W55-c ShimmerBlock.
- `SystemHealthSkeleton()` — structured loading placeholder mirroring
  the live panel layout (header strip + Gathering caption + 4-tile KPI
  strip skeleton + 6-row services grid skeleton). role=status +
  aria-live=polite + data-testid="system-health-loading-skeleton". The
  "Gathering pipeline health & supervisor telemetry…" caption is
  preserved verbatim above the skeleton rows so the W22-1 test contract
  `getByText(/Gathering pipeline health/)` resolves.
- `PolishedEmptyState()` — friendly empty-state with Lucide AlertTriangle
  icon (size 10, amber 70% opacity, strokeWidth 1.5) + .empty-state-title
  direct text node "System health telemetry endpoint unavailable." +
  .empty-state-desc dim description ("The platform supervisor couldn't
  publish telemetry. The poller will retry automatically every 3
  seconds."). role=status + data-testid="system-health-empty-state".
- `PolishedErrorCard({ message, detail, onRetry, onDismiss })` — red-
  tinted card with AlertTriangle icon + the full wrapped error string
  ("System health endpoint unavailable (HTTP 500)" or
  "Network error: ECONNREFUSED") rendered as the card's title (so the
  W22-1 test contracts `getByText(/System health endpoint unavailable
  \(HTTP 500\)/)` + `getByText(/Network error: ECONNREFUSED/)` still
  resolve) + dim detail + Retry button (RefreshCw glyph, calls
  `fetchHealth()`) + the existing Dismiss button (aria-label="Dismiss
  error" preserved verbatim, X glyph). role=alert +
  data-testid="system-health-error-card" + "-retry" / "-dismiss"
  suffixes on the buttons.

## Tone system

Applied the W53-c Tone system locally (`Tone = 'good' | 'warn' | 'poor' |
'info' | 'neutral'`) with self-contained text-color class strings (static
so Tailwind 4's scanner picks them up). Used by:
- Poller Success Rate KpiTile (`successRateTone`): good ≥99% / warn ≥95% /
  poor <95%.
- Model Drift PSI KpiTile (`driftTone`): good <0.1 / warn 0.1-0.2 / poor
  ≥0.2.
- Feature Store Vectors KpiTile: `warn` tone when poller latency is poor,
  otherwise `info` cyan.
- Service status badges + PulseDot + row hover accent bar
  (`serviceStatusTone`): good = HEALTHY/UP/RUNNING/OK/ACTIVE,
  warn = DEGRADED/WARN/WARNING/SLOW/STALE,
  poor = DOWN/CRITICAL/ERROR/FAILED/STOPPED, neutral = anything else.

## All 8 polish affordances applied

1. **KpiTile pattern for system metrics** — the bare `<div
   className="kpi-card">` blocks are refactored to the shared `KpiTile`
   sub-component with tone-tinted bg + ring + Lucide icon in the label
   row (Activity / Database / Waves / Cpu) + large mono tabular-nums
   value + tone-tinted quality bar (only on the Poller Success Rate tile,
   since that's the only 0-100 metric). The 4 KPI labels (Poller Success
   Rate / Market DB Size / Model Drift PSI / Feature Store Vectors) and
   their values ("99.2%" / "12.5 MB" / drift.toFixed(4) / vectors count)
   are preserved verbatim so the W22-1 test contracts
   `getByText(/Poller Success Rate/)` etc. + `getByText(/99\.2%/)` +
   `getByText(/12\.5 MB/)` resolve.

2. **Shimmer skeleton loading state** — the bare `spinner + "Gathering
   pipeline health & supervisor telemetry…"` placeholder is wrapped in
   `<SystemHealthSkeleton/>` which renders the unified header strip
   (preserving the title text "Platform Subsystem Health & Process
   Telemetry" verbatim so the test contract
   `getByText(/Platform Subsystem Health & Process Telemetry/)`
   resolves across loading / loaded branches — mirrors the W55-a
   LeaderboardPanel unified-header pattern) + the Gathering caption
   (preserved verbatim) + 4-tile KPI strip skeleton + 6-row services
   grid skeleton. Uses the existing `.skeleton-line-sm` /
   `.skeleton-line-md` / `.skeleton-card` classes.

3. **Polished empty state with Lucide icon + message** — the bare
   `AlertTriangle + "System health telemetry endpoint unavailable."`
   strip is wrapped in `<PolishedEmptyState/>` which renders a Lucide
   AlertTriangle icon (size 10, amber 70% opacity, strokeWidth 1.5) +
   .empty-state-title direct text node "System health telemetry endpoint
   unavailable." (preserved verbatim so no test contract breaks) +
   .empty-state-desc dim description. role=status +
   data-testid="system-health-empty-state".

4. **Section headers with icon + uppercase title** — two `SectionHeader`
   sub-components render:
   - Above the KPI strip: Gauge icon + uppercase "System Metrics" title +
     dim italic "pipeline throughput & drift" description + trailing
     "{total_tracked} books tracked" badge. tone=info (cyan).
   - Above the services table: ServerCog icon + uppercase "Supervised
     Processes & Loops" title + dim italic "FastAPI async tasks"
     description + trailing "{services.length} services" badge.
     tone=neutral.

5. **Refined health status indicators (green healthy, amber warning, red
   critical) with PulseDot** — every service row now carries a `PulseDot`
   whose tone reflects the service's status (good / warn / poor / neutral
   via `serviceStatusTone`). The status text is in a tone-tinted badge
   (`badge-green` / `badge-amber` / `badge-red` / `badge-dim`). The
   header's "Process Supervisor Active" badge also carries a PulseDot
   (good tone) so the trader sees the platform is alive at a glance.
   PulseDot for `poor`-tone services is rendered with `pulse={false}` so a
   dead service doesn't ping (calmer UX, mirrors the W54-c retry pattern).

6. **Tabular-nums on all numeric values** — every KpiTile value
   (`{success_rate}%`, `{size_mb} MB`, `psi_drift.toFixed(4)`, vectors
   count) + every KpiTile hint (`{total_tracked} books · {latency_ms}ms
   avg`, `{snapshots_recorded.toLocaleString()} snaps · …`) + every
   service-row Frequency + Port cell + the header's "books tracked" +
   "services" trailing badges + the "$100 Operating Capital" badge now
   carry `tabular-nums` so columns don't shift alignment when values
   change between renders (e.g. as the poller's success_rate fluctuates
   between polls).

7. **Error state: polished error card with retry** — the bare
   `banner-danger` strip is replaced with `<PolishedErrorCard/>` — a red-
   tinted card with AlertTriangle icon + the full wrapped error string
   rendered as the card's title (a direct text node in a leaf div so the
   W22-1 test contracts `getByText(/System health endpoint unavailable
   \(HTTP 500\)/)` + `getByText(/Network error: ECONNREFUSED/)` resolve
   to a single leaf) + dim detail + a Retry button (RefreshCw glyph,
   aria-label="Retry health fetch" preserved verbatim, calls
   `fetchHealth()`) + the existing Dismiss button (aria-label="Dismiss
   error" preserved verbatim, X glyph). role=alert +
   data-testid="system-health-error-card" + "-retry" / "-dismiss"
   suffixes on the buttons. Used in BOTH the no-health empty state (when
   the initial fetch failed) AND the transient polling-error state (when
   a subsequent poll fails but stale data is still rendered).

8. **Refined service status table (uppercase headers, row hover,
   tabular-nums)** — the bare `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
   service cards are replaced with a proper div-based table:
   - Uppercase 10px tracking-wider font-bold text-[#5a637a] header row
     with 4 columns (Service / Status / Frequency / Port). Port column is
     right-aligned. role="row" + role="columnheader" for accessibility.
   - Each service row uses the same 4-column grid (with `minmax(0,1fr)`
     on the first column so long service names truncate instead of
     overflowing) + `hover:bg-cyan-500/[0.04]` (subtle background lift)
     + `hover:shadow-[inset_3px_0_0_0]` (left-edge accent bar via inset
     shadow, tone-tinted by service status: green/amber/red/slate — no
     layout shift) + PulseDot status indicator + tone-tinted badge +
     tabular-nums on Frequency + Port. role="row" + role="cell".
   - Row container with `max-h-72 overflow-y-auto scrollbar-thin` so a
     long services list (8+ services) scrolls inside the card rather
     than stretching the panel vertically. Mirrors the W51-2d MLPanel
     scrollable list pattern.

## Additional refinements (beyond the 8 spec items)

- **Header polish**: the panel header's "Process Supervisor Active"
  badge now carries a `PulseDot tone="good"` so the trader sees the
  platform is alive at a glance. The "$100 Operating Capital" badge
  carries `tabular-nums`. The 🩺 emoji prefix is preserved verbatim as a
  sibling span so the test contract `getByText(/Platform Subsystem
  Health & Process Telemetry/)` regex still matches the title's leaf
  text node.
- **Unified title across branches** — the title "Platform Subsystem
  Health & Process Telemetry" is rendered in BOTH the loading skeleton
  AND the loaded state (mirrors the W55-a LeaderboardPanel unified-
  header pattern) so the test contract
  `getByText(/Platform Subsystem Health & Process Telemetry/)` resolves
  regardless of fetch state.
- **Truncation with tooltip** — long service names carry `truncate` +
  `title={s.name}` so the trader can hover to see the full name if it
  gets clipped on a narrow viewport.
- **Quality bar on Poller Success Rate KpiTile** — the success_rate
  (0-100) is rendered as a tone-tinted quality bar at the bottom of the
  KpiTile so the trader sees the pass rate visually as well as
  numerically.
- **Tone-aware Feature Store Vectors tile** — the vectors tile's tone is
  `warn` when the poller latency is poor (signalling the feature store
  may be lagging behind the live market), otherwise `info` cyan.
- **Reduced-motion-friendly PulseDot** — `pulse={false}` for `poor`-tone
  services so a dead service doesn't ping (calmer UX).
- **New CSS hooks added** (for downstream CSS layer to target):
  - `data-testid="system-health-loading-skeleton"` on the loading
    wrapper.
  - `data-testid="system-health-empty-state"` on the empty-state
    wrapper.
  - `data-testid="system-health-error-card"` on the error card (+
    `-retry` + `-dismiss` suffixes on the buttons).
  - `data-testid="system-health-kpi-tile"` default on KpiTile (+
    `-value` suffix on the value div, + `system-health-kpi-success` /
    `-db` / `-drift` / `-vectors` per-tile testIds).
  - `data-testid="system-health-service-row"` on each service row.
  - `data-tone={good|warn|poor|info|neutral}` on each KpiTile, each
    service-row status badge, and each service row (for downstream CSS
    targeting).

## Test-contract preservation

All 11 existing test contracts pass verbatim:
- "Gathering pipeline health…" caption (regex `/Gathering pipeline
  health/`).
- "Platform Subsystem Health & Process Telemetry" title text (regex
  `/Platform Subsystem Health & Process Telemetry/`).
- "Poller Success Rate" / "Market DB Size" / "Model Drift PSI" /
  "Feature Store Vectors" KPI labels (regex matchers).
- "99.2%" success rate (regex `/99\.2%/`) — exact value leaf.
- "12.5 MB" market db size (regex `/12\.5 MB/`) — exact value leaf.
- "Order Book Poller" + "Supervisor Watchdog" service names (exact
  match — sole textContent of their span).
- "System health endpoint unavailable (HTTP 500)" wrapped error text
  (regex `/System health endpoint unavailable \(HTTP 500\)/`).
- "Network error: ECONNREFUSED" wrapped error text (regex
  `/Network error: ECONNREFUSED/`).
- `aria-label="Retry health fetch"` on the retry button (regex
  `/retry health fetch/i`).
- `aria-label="Dismiss error"` on the dismiss button (regex
  `/dismiss error/i`).
- `console.error('[SystemHealthView] Failed to fetch system health:',
  error)` signature (stringContains matcher).
- `setInterval(fetchHealth, 3000)` polling cadence (3 s).
- `'use client'` directive preserved at the top of the file.

## Verification

```
$ wc -l src/components/SystemHealthView.tsx
651 src/components/SystemHealthView.tsx

$ git diff --stat HEAD src/components/SystemHealthView.tsx
 src/components/SystemHealthView.tsx | 664 +++++++++++++++++++++++++++++-------
 1 file changed, 534 insertions(+), 130 deletions(-)

$ bunx eslint src/components/SystemHealthView.tsx 2>&1 | tail -3
(clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -v IngestionHealthPanel | tail -3
(0 errors in SystemHealthView.tsx — exit 0, no output.
 IngestionHealthPanel.tsx has 10 pre-existing TS errors from another
 agent's incomplete work — not caused by W56-a, untouched by this task.)

$ bunx vitest run src/components/SystemHealthView.test.tsx 2>&1 | tail -5
 ✓ src/components/SystemHealthView.test.tsx (11 tests) 450ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

## Stage Summary

- **Final line count**: 651 lines (was 247 — +534 / −130 per `git diff
  --stat`).
- **All 8 polish affordances applied** while preserving the existing
  props, API calls (`getApiUrl()` + `apiFetch('/api/system/health')`
  REST + 3 s polling + `fetchHealth()` retry), polling, class names
  (`kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` / `badge badge-*` /
  `banner-danger` removed in favor of `PolishedErrorCard` / `card` /
  `skeleton-*` / `scrollbar-thin` / `spinner` / `mono`), accessibility
  roles/labels (role=status / role=alert / role=row / role=cell /
  role=columnheader / role=rowgroup + aria-hidden on icons +
  aria-label on buttons + aria-live=polite on skeleton), test contracts,
  console.error signature, and the `'use client'` directive.
- **Lint**: clean (exit 0, no output on SystemHealthView.tsx).
- **TypeScript**: 0 errors in SystemHealthView.tsx (exit 0).
- **Tests**: 11/11 pass (was 11/11 — no regressions).

## Files touched

- `src/components/SystemHealthView.tsx` (UI polish pass, 247 → 651
  lines, +534 / −130 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W56-a-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended W56-a entry).

**SystemHealthView is production-ready with the premium W56-a visual
layer, visually consistent with the W53-c StrategyPerformancePanel /
W55-c AttributionPanel / W55-a LeaderboardPanel redesign family.**

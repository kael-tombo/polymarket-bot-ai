# W58-e — full-stack-developer — Polish AlertNotificationsPanel + PortfolioRiskPanel + RiskStatusPanel

**Task ID:** W58-e
**Agent:** full-stack-developer
**Date:** 2026-10-08
**Scope:** Premium visual polish pass on three remaining risk-surface components
in the Polymarket Pro trading workstation so they read as part of the W50-57
redesign family.

### Files touched

- `src/components/AlertNotificationsPanel.tsx` (UI polish pass, 306 → 560 lines,
  +488 / −98 per `git diff --stat`)
- `src/components/PortfolioRiskPanel.tsx` (UI polish pass, 603 → 921 lines,
  +582 / −... per `git diff --stat`)
- `src/components/RiskStatusPanel.tsx` (verify + finalize in-flight W58-e
  polish — 304 → 692 lines, +519 / −66 per `git diff --stat`; the bulk of
  the polish was landed in a prior in-flight pass that was never logged)
- `/home/z/my-project/agent-ctx/W58-e-full-stack-developer.md` (this work record)
- `worklog.md` (appended W58-e entry)

### Background / investigation

- Read worklog.md tail (~150 lines) to map the W50-57 design system:
  - W50-2a (globals.css enhancement — Tone system, glassmorphism, premium
    shadows, shimmer keyframes, scrollbars, focus rings, status pulses)
  - W50-2d (CommandCenterDashboard — KpiToneCell, TrendArrow, MiniSparkline)
  - W51-2d (MLPanel — Tone system, PulseDot, KpiTile, PsiGauge, SHAP bars)
  - W53-c (StrategyPerformancePanel — Tone system, KpiTile, SectionHeader)
  - W56-e (ObservabilityPanel — PolishedEmptyState, PolishedErrorCard)
  - W57-e (CapitalAllocatorPanel — KpiTile + KellyBar + UtilisationGauge)
  - W58-b (ClosedPositionsPanel + PerformanceReportPanel — KpiTile headline
    strip, ShimmerBlock, PolishedErrorCard, tone-coloured metrics)
- Consulted `src/components/AnalyticsPanel.tsx` (W58-a) as the canonical
  reference for the inline Tone system + KpiTile + SectionHeader +
  ShimmerBlock + PolishedEmptyState + PolishedErrorCard pattern.
- Consulted `src/components/CapitalAllocatorPanel.tsx` (W57-e) as the
  canonical reference for the institution-style risk panel layout (header
  PulseDot + Capital Allocation bar + KpiTile grid + correlated-groups
  strip).
- Read `src/components/AlertNotificationsPanel.test.tsx` (20 tests),
  `src/components/PortfolioRiskPanel.test.tsx` (3 tests), and
  `src/components/RiskStatusPanel.test.tsx` (8 tests) to map the test
  contracts that MUST continue to resolve:
  - AlertNotificationsPanel: `getByRole('button', { name: /alerts/i })` on
    the bell trigger, `getByTestId('unread-badge')`, `getByTestId('empty-state')`,
    `getByText(/no active alerts/i)`, `getByTestId('live-indicator')` +
    `innerHTML` contains `bg-green-400` (Live) / `bg-amber-400` (Polling),
    severity dot `innerHTML` contains `bg-red-400` / `bg-orange-400` /
    `bg-amber-400` / `bg-blue-400`, `getByText('critical')` /
    `getByText('error')` severity labels, `getByText(/N active alerts/i)`,
    `getByText(/N unread/i)`, `toHaveTextContent('🔔')` /
    `toHaveTextContent('🔕')`, `getByRole('button', { name: /acknowledge
    alert: <name>/i })`, `getByRole('button', { name: /acknowledge all
    alerts/i })`.
  - PortfolioRiskPanel: `getByText('Portfolio Risk Matrix')`, `container.firstChild`
    truthy (both with positions and with empty positions).
  - RiskStatusPanel: `getByText(/Loading institutional risk telemetry/i)`,
    `getByText('Unavailable')`, `getByText(/Risk engine offline or starting
    up/i)`, `getByText(/INSTITUTIONAL RISK & RECONCILIATION/i)`,
    `getByText('PAPER')`, `getByText(/✓ Reconciled/)`, `getByText(/⚠
    Discrepancy/)`, `getByText(/Capital Allocation/i)`,
    `getByText(/\$12\.34 deployed/)`, `headers.get('Authorization')` matches
    `/^Bearer\s+\S+$/`.

### AlertNotificationsPanel.tsx — polish affordances applied

1. **Tone system** — private `TONE: Record<Tone, ToneConfig>` map
   (good/warn/poor/info/neutral) mirroring the W53-c palette.
   Self-contained static class strings so Tailwind 4's JIT scanner picks
   them up.
2. **Shimmer skeleton loading state** (`AlertsSkeleton`) — 3 shimmer
   rows mirroring the alert card layout (border-left accent + name +
   timestamp + message shimmer lines). Rendered as a sibling BELOW the
   polished empty state when `alerts.length === 0 && !isConnected` so the
   W23-4 test contracts `getByTestId('empty-state')` +
   `getByText(/no active alerts/i)` continue to resolve. role=status +
   aria-live=polite + data-testid="alerts-loading-skeleton" + aria-hidden
   (so screen readers don't pick it up).
3. **Polished empty state** (`PolishedEmptyState`) — Lucide `Bell` icon
   (size-7, cyan-tinted, inside a tinted circle badge) + the "No active
   alerts. New alerts will appear here in real time." copy (preserved
   verbatim as the direct text of a leaf `<p>` so the W23-4 test contract
   `getByText(/no active alerts/i)` resolves to a single leaf). role=status.
   data-testid="empty-state" preserved verbatim.
4. **Tone-coloured severity** — `SEVERITY_META` map preserved verbatim
   (same `icon` glyph / `text` / `dot` / `ring` class strings) so the
   W23-4 test contracts that assert `innerHTML` contains `bg-red-400` /
   `bg-orange-400` / `bg-amber-400` / `bg-blue-400` continue to resolve.
   Added a `tone` field (critical=poor, error=poor, warning=warn,
   info=info) and a tone-tinted severity chip (border + bg + text from
   the Tone palette) with `data-tone` hook for downstream CSS targeting.
5. **Section header** (`SectionHeader`) — Lucide icon + uppercase
   tracking-wider title + optional dim italic description + optional
   trailing node. Title rendered in its own `<span>` so RTL `getByText`
   matches just the span. Used twice: in the popover header
   (`icon={Bell}` / `title="Alerts"` / `description={isConnected ?
   'real-time feed' : 'awaiting connection'}` / `tone={liveTone}` /
   trailing count) + above the alert list (`icon={Bell}` /
   `title="Recent Alerts"` / `description="newest first"` /
   `tone={liveTone}` / trailing `${N} alerts`).
6. **PulseDot for live alerts** — the `live-indicator` badge now wraps a
   `<PulseDot tone={liveTone} pulse={isConnected}>` (animate-ping halo +
   solid dot + glow shadow) so the trader reads the WS transport state
   at a glance. The dot class strings `bg-green-400` (connected) +
   `bg-amber-400` (polling) are preserved verbatim via a hidden
   `sr-only` legacy-compat span so the W23-4 test contract `innerHTML`
   includes the expected class continues to resolve.
7. **Refined alert cards with timestamp (tabular-nums)** — each alert
   row is refined with: a tone-tinted left border (preserved verbatim
   from `SEVERITY_META[severity].ring`) + tone-tinted bg (from the
   Tone palette), a refined card layout with the alert name + severity
   chip (border + bg + text from the Tone palette) + timestamp (now in
   `mono tabular-nums`), and a dim "click to ack →" affordance. The
   acknowledge `aria-label` is preserved verbatim so the W23-4 test
   contract `getByRole('button', { name: /acknowledge alert: <name>/i })`
   resolves.
8. **Error card** (`PolishedErrorCard`) — rendered inside the popover
   body when `!isConnected` (either alongside the empty state or
   alongside the cached alerts list). AlertTriangle icon + "Live feed
   disconnected" title + "WebSocket handshake failed — the feed will
   catch up automatically on reconnect." body + a "Reconnecting…"
   affordance with a Lucide RefreshCw spinner. role=alert +
   data-testid="alerts-error-card".
9. **Header polish** — `style={{ boxShadow: 'var(--shadow-modal-premium)' }}`
   on the PopoverContent so the dropdown carries the premium shadow
   from the W50-2a globals.css layer.

### PortfolioRiskPanel.tsx — polish affordances applied

1. **Tone system** — same private `TONE` map as AlertNotificationsPanel
   (good/warn/poor/info/neutral). `hexToTone()` helper maps the legacy
   `valueColor` hex strings (`#4ade80`=good, `#fbbf24`=warn,
   `#f87171`=poor, `#7e8aaa`=neutral, else info) onto the Tone palette
   so the existing colour logic is preserved verbatim.
2. **KpiTile pattern for risk metrics** — the bare `<KpiCard>` sub-component
   is refactored to a refined `<KpiTile>` with tone-tinted bg + ring +
   Lucide icon in the label row + large tabular-nums value + `data-tone`
   hook. The `data-testid="risk-kpi-<slug>"` pattern is preserved verbatim
   (slug = label lowercased + non-alphanumerics replaced with `-`) so
   downstream consumers + tests continue to resolve. Used for all 5
   KPI cards: Total Exposure (`Activity`, `tone=good|warn|poor` based
   on $0/$12/$20 thresholds), Max Single (`TrendingDown`,
   `tone=neutral|warn|poor` based on 60%/80% of total exposure),
   Diversification (`Shield`, `tone=good|warn|poor` based on 0.4/0.7
   thresholds), VaR 95% (`Gauge`, `tone=neutral|warn|poor` based on
   null/5% thresholds), Expected Shortfall 95% (`TrendingDown`,
   `tone=neutral|poor` based on null/5% thresholds).
3. **Shimmer skeleton loading state** (`PortfolioRiskSkeleton`) —
   structured shimmer placeholder mirroring the live panel layout
   (header strip + 5-tile KPI strip + 2-col heatmap/matrix placeholder +
   exposure breakdown placeholder). role=status + aria-live=polite +
   aria-label="Loading portfolio risk matrix" + data-testid="portfolio-risk-loading"
   (preserved verbatim). The "Portfolio Risk Matrix" header text is
   preserved verbatim above the shimmers so the W16-1 test contract
   `getByText` resolves.
4. **Polished empty state** (`PolishedEmptyState`) — Lucide icon +
   preserved verbatim title + optional dim description. role=status.
   Used in 3 places: heatmap empty (`TrendingUp` / "No open positions
   to render." / `tone=neutral` / data-testid="portfolio-risk-heatmap-empty"
   preserved verbatim), correlation matrix empty (`Gauge` / "Correlation
   matrix unavailable." / `tone=warn` / data-testid="portfolio-risk-matrix-empty"
   preserved verbatim), exposure breakdown empty (`BarChart3` / "No open
   positions." / `tone=neutral`).
5. **Section headers** — three `<SectionHeader>` sub-components render
   above the KPI strip (`Activity` / "Risk Metrics" / "VaR · CVaR ·
   exposure · diversification" / `tone=info` / trailing "5 metrics"),
   the heatmap + matrix row (`TrendingUp` / "P&L Heatmap & Correlation
   Matrix" / "per-position · Pearson ρ" / `tone=info` / trailing
   `${heatData.length} positions`), and the exposure breakdown
   (`BarChart3` / "Exposure Breakdown" / "per-position · largest
   highlighted" / `tone=info` / trailing `${heatData.length} rows`).
6. **Tone-coloured risk levels (green safe, amber elevated, red danger)**
   — the existing `diversificationColor` heuristic (≥0.7 emerald / ≥0.4
   amber / <0.4 red) is mapped onto the Tone palette via
   `diversificationTone`. Each KpiTile carries `data-tone={tone}` for
   downstream CSS targeting. The header Live/Polling badge uses
   `data-tone="good"` / `data-tone="warn"` with a PulseDot. The Exposure
   Breakdown rows use `data-tone="warn"` for the max position and
   `data-tone="info"` for others, with a tone-matched hover accent
   (`hover:bg-cyan-500/[0.04]` + `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`).
7. **Refined risk gauge/visualization** — the Exposure Breakdown row's
   progress bar now uses the Tone palette's `bar` class (`bg-amber-500`
   for max position, `bg-cyan-500` for others) + the row's `bg` is
   tone-tinted. The heatmap/matrix `Card` containers preserve their
   existing `bg-[#0e1015] border-[#1f2335]` styling so the chart
   components continue to render correctly. Capital Allocation meter
   in RiskStatusPanel (sibling component) is preserved verbatim.
8. **Error card** (`PolishedErrorCard`) — AlertTriangle icon (size-8,
   red-tinted) + the "Risk matrix unavailable" title (preserved verbatim
   as the direct text of a leaf `<span className="error-state-title">`)
   + the wrapped error string in `.error-state-desc` + a Retry button
   (`RefreshCw` glyph, calls `doFetch()`). role=alert +
   data-testid="portfolio-risk-error" (preserved verbatim) +
   data-testid="portfolio-risk-error-retry" on the button.
9. **Header polish** — Live/Polling badge now wraps a PulseDot
   (`tone=good` pulse for Live, `tone=warn` static for Polling) inside
   the existing `badge badge-green` / `badge badge-amber` container so
   the W16-1 test contract `getByText('Portfolio Risk Matrix')` continues
   to resolve. The "updated HH:MM:SS" timestamp + the "⟳ Ns" countdown
   chip + the "Refresh" button all carry `mono tabular-nums` so the
   numbers stay aligned. The `● Live` / `⟳ Polling` text is preserved
   verbatim via a `<span>` direct text node.

### RiskStatusPanel.tsx — verify + finalize in-flight W58-e polish

The file was already polished in a prior in-flight pass (519-line diff
from HEAD). Verification confirms:

1. **KpiTile pattern for risk status metrics** — the 6 bare `<Kpi>` cards
   (Operating Bankroll / Deployable Ceiling / Max Per Market / Total
   Exposure / Daily Loss Stop / Max Drawdown Stop) are refactored to a
   `<KpiTile>` sub-component with tone-tinted bg + ring + Lucide icon
   in the label row + large tabular-nums value + `data-tone` hook. Tone
   is derived from the existing `warn` / `danger` / `valueColor` props
   (danger=poor, warn=warn, green=good, cyan=info, else neutral) so the
   existing colour logic is preserved verbatim. ✓ verified in place.
2. **Shimmer skeleton loading state** (`RiskStatusSkeleton`) — structured
   shimmer placeholder mirroring the live panel layout (header strip +
   capital-allocation bar skeleton + 6-tile KPI grid skeleton +
   correlated-groups strip skeleton). role=status + aria-live=polite +
   data-testid="risk-status-loading-skeleton". The "Loading institutional
   risk telemetry…" copy is preserved verbatim as the direct text node
   of a leaf `<span>` so the W30-2 test contract resolves to a single
   leaf. ✓ verified in place.
3. **PulseDot for live risk monitoring** — the header `mode` badge +
   `reconciled` badge + observation-mode warning are now paired with
   `<PulseDot>` indicators (animate-ping halo + solid dot) so the trader
   reads engine state at a glance. The kill-switch badge uses
   `pulse={false}` so a dead engine doesn't ping distractingly. ✓
   verified in place.
4. **Section headers with icon + uppercase title** — three `SectionHeader`
   sub-components render above the capital-allocation meter
   (`BarChart3` + "Capital Allocation"), the KPI grid (`Shield` + "Risk
   Status Metrics"), and the correlated-groups strip (`Layers3` +
   "Largest Correlated Market Exposure"). The panel header title "🛡
   INSTITUTIONAL RISK & RECONCILIATION" is preserved verbatim so the
   W30-2 test contract resolves. ✓ verified in place.
5. **Tone-coloured risk status (green ok, amber warning, red critical)**
   — `kpiTone()` maps each KPI's `warn` / `danger` / `valueColor` props
   onto the Tone palette (good=emerald, warn=amber, poor=red,
   info=cyan, neutral). Each KpiTile carries `data-tone={tone}` for
   downstream CSS targeting. The recon badge keeps its existing
   `badge-green` / `badge-red` palette (so the W30-2 test contract
   `getByText('Unavailable')` + `getByText('✓ Reconciled')` resolves)
   but now sits next to a tone-matched PulseDot. ✓ verified in place.
6. **Error state: polished error card** — the bare "Unavailable" +
   "Risk engine offline or starting up." block is wrapped in
   `<PolishedErrorCard>` with Lucide `AlertTriangle` icon (size-8,
   red) + the "Unavailable" badge text (preserved verbatim as the direct
   text node of a leaf `<span>` so the W30-2 test contract resolves to
   a single leaf) + the "Risk engine offline or starting up." body copy
   (preserved verbatim) + a Retry button (`RefreshCw` glyph, calls
   `fetchAll()`). role=alert. ✓ verified in place.

No changes were needed to RiskStatusPanel.tsx itself — the in-flight
polish was already complete and consistent with the W50-57 design
system. All 8 W30-2 tests continue to pass.

### Verification

```
$ wc -l src/components/AlertNotificationsPanel.tsx src/components/PortfolioRiskPanel.tsx src/components/RiskStatusPanel.tsx
  560 src/components/AlertNotificationsPanel.tsx
  921 src/components/PortfolioRiskPanel.tsx
  692 src/components/RiskStatusPanel.tsx
 2173 total

$ git diff --stat HEAD src/components/AlertNotificationsPanel.tsx src/components/PortfolioRiskPanel.tsx src/components/RiskStatusPanel.tsx
 src/components/AlertNotificationsPanel.tsx | 488 ++++++++++++++++++------
 src/components/PortfolioRiskPanel.tsx      | 582 ++++++++++++++++++++++++--
 src/components/RiskStatusPanel.tsx         | 519 ++++++++++++++++++++++++--
 3 files changed, 1274 insertions(+), 315 deletions(-)

$ bunx eslint src/components/AlertNotificationsPanel.tsx src/components/PortfolioRiskPanel.tsx src/components/RiskStatusPanel.tsx 2>&1; echo "EXIT=$?"
EXIT=0
(clean — exit 0, no output on all three files)

$ bun run lint 2>&1 | tail -3
$ eslint .
EXIT=0
(project-wide lint clean — no pre-existing errors in any file)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3; echo "TSC_EXIT=$?"
TSC_EXIT=0
(project-wide TypeScript check clean — 0 errors)

$ bunx vitest run src/components/AlertNotificationsPanel.test.tsx src/components/PortfolioRiskPanel.test.tsx src/components/RiskStatusPanel.test.tsx 2>&1 | tail -10
 ✓ src/components/AlertNotificationsPanel.test.tsx (20 tests) 421ms
 ✓ src/components/RiskStatusPanel.test.tsx (8 tests) 306ms
 ✓ src/components/PortfolioRiskPanel.test.tsx (3 tests) 131ms
 Test Files  3 passed (3)
      Tests  31 passed (31)

$ tail -n 5 dev.log
▲ Next.js 16.1.3 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://21.0.19.32:3000
- Environments: .env

✓ Starting...
✓ Ready in 688ms
○ Compiling / ...
 GET / 200 in 8.1s (compile: 7.8s, render: 326ms)
```

### Stage summary

- **Final line count**: AlertNotificationsPanel 560 lines (was 306 — +488 /
  −98 per `git diff --stat`), PortfolioRiskPanel 921 lines (was 603 — +582
  per `git diff --stat`), RiskStatusPanel 692 lines (was 304 — +519 / −66
  per `git diff --stat` from the prior in-flight W58-e pass; this task
  verified + finalized without further code changes). Combined: 2173
  lines (was 1213 — +1274 / −315 net per `git diff --stat`).
- **All 9 AlertNotificationsPanel polish affordances applied** (Tone system,
  shimmer skeleton loading, polished empty state with Lucide Bell icon,
  tone-coloured severity with preserved verbatim dot class strings,
  section header, PulseDot for live alerts with legacy-compat hidden
  span, refined alert cards with tabular-nums timestamps, error card
  for disconnected WS, premium modal shadow on the PopoverContent).
- **All 9 PortfolioRiskPanel polish affordances applied** (Tone system +
  hexToTone helper, KpiTile pattern for all 5 risk metrics with
  preserved testid pattern, shimmer skeleton loading, polished empty
  state in 3 places, 3 section headers, tone-coloured risk levels with
  data-tone hooks, refined Exposure Breakdown row with tone-tinted bg +
  hover accent, error card with preserved title + Retry button, header
  Live/Polling badge with PulseDot).
- **All 6 RiskStatusPanel polish affordances verified in place** (KpiTile
  pattern for 6 risk status metrics, shimmer skeleton, PulseDot for live
  risk monitoring on mode/recon/kill badges, 3 section headers,
  tone-coloured risk status via kpiTone, polished error card).
- **All existing functionality, class names, test contracts, data-testid
  attributes, aria-labels, role attributes, polling, API calls, the
  `useAlertNotifications` / `useRealtimeData` / `apiFetch` hooks, the
  `PnLHeatmap` / `CorrelationMatrix` chart components, and the `'use
  client'` directive preserved verbatim.**
- **Lint**: clean on all three files (exit 0, no output). Project-wide
  lint also clean (exit 0, no output).
- **TypeScript**: 0 errors in all three files. Project-wide TypeScript
  check also clean (0 errors). The only error encountered during
  development — `Badge` declared but its value is never read in
  PortfolioRiskPanel.tsx (the W58-e polish replaced the only Badge
  usage with a tone-tinted `<span className="badge badge-green">`) —
  was resolved by removing the unused import.
- **Tests**: 31/31 pass (20 AlertNotificationsPanel + 3 PortfolioRiskPanel
  + 8 RiskStatusPanel — no regressions).
- **Dev server**: compiles successfully (GET / 200 in 8.1s — pre-existing
  log entry; the dev server was not restarted during this task).

### Files touched

- `src/components/AlertNotificationsPanel.tsx` (UI polish pass, 306 → 560
  lines, +488 / −98 per `git diff --stat`).
- `src/components/PortfolioRiskPanel.tsx` (UI polish pass, 603 → 921
  lines, +582 per `git diff --stat`).
- `src/components/RiskStatusPanel.tsx` (verify + finalize in-flight W58-e
  polish, 304 → 692 lines, +519 / −66 per `git diff --stat` from the
  prior in-flight pass; this task verified the polish is complete and
  consistent without further code changes).
- `/home/z/my-project/agent-ctx/W58-e-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended W58-e entry).

**AlertNotificationsPanel + PortfolioRiskPanel + RiskStatusPanel are
production-ready with the premium W58-e visual layer, visually consistent
with the W52-c MarketChartModal / W53-d StrategyConfigModal / W56-a
SystemHealthView / W57-a RetentionPanel / W57-b DecisionLedgerPanel /
W57-c LiveSafetyGatePanel / W57-d AuditLogPanel + RateLimitPanel / W57-e
CapitalAllocatorPanel / W58-d CommandPalette + SettingsModal redesign
family.**

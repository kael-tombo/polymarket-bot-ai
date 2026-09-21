# Task ID: W56-d-retry — IngestionHealthPanel polish (W51-2d MLPanel redesign family)

**Agent:** full-stack-developer
**Target:** `src/components/IngestionHealthPanel.tsx` (Data Ingestion Health panel — source connectivity · throughput · data quality · dead-letter queue · gap detection · market coverage)
**Spec:** Apply the W50-55 design-system vocabulary (Tone system, KpiTile, PulseDot, SectionHeader, ShimmerBlock, PolishedEmptyState, PolishedErrorCard) to the Ingestion Health panel for visual consistency with the MLPanel / MLValidationPanel / LeaderboardPanel / ExecutionQualityPanel / ObservabilityPanel / DatabaseStatusPanel redesign family.

---

## Work Log

### Context gathering

- Read `/home/z/my-project/worklog.md` (last ~250 lines) to map the W50-55
  design-system vocabulary shared by the W53-c StrategyPerformancePanel +
  W54-a DeepAnalysisView + W54-e MLValidationPanel + W55-a LeaderboardPanel +
  W55-c AttributionPanel + W55-d ExecutionQualityPanel + W56-a
  SystemHealthView + W56-b DatabaseExplorerView + W56-c DatabaseStatusPanel +
  W56-e ObservabilityPanel:
  - **Tone system** (`Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'`,
    `TONE: Record<Tone, ToneConfig>` with self-contained static `bg` /
    `border` / `text` / `bar` / `dot` / `label` / `halo` class strings
    so Tailwind 4's JIT scanner picks them up).
  - **KpiTile** (large value, tone-tinted bg, quality bar, optional trend
    glyph, `data-tone` attribute).
  - **SectionHeader** (Lucide icon + uppercase tracking-wider title +
    optional dim italic description + optional trailing node).
  - **PulseDot** (animated status dot for LIVE indicators, optional
    `pulse` flag to disable the ping animation).
  - **ShimmerBlock** (thin skeleton placeholder that can be sized via
    className).
  - **PolishedEmptyState** (Lucide icon + title + helper copy, role=status).
  - **PolishedErrorCard** (AlertTriangle icon + title + error string +
    Retry button with RotateCcw glyph, role=alert).
  - **LoadingSkeleton** (structured shimmer placeholder mirroring the live
    panel layout, role=status + aria-live=polite).
  - `data-tone="{good|warn|poor|info|neutral}"` attribute hooks on
    every tone-coloured element for downstream CSS targeting.
  - Row hover accent bar via `hover:bg-cyan-500/[0.04]` +
    `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` (no layout
    shift — inset shadow only).
  - `tabular-nums` on every numeric cell.

### Prior W56-d state inspection

- The prior W56-d attempt had already laid the visual-polish groundwork
  before terminating. On retry, the file was at **2746 lines** with:
  - **Tone system** + `TONE` config (5-tone palette, static class strings).
  - **Tone helpers** — `latencyTone`, `freshnessTone`, `scoreTone`,
    `errorRateTone`, `coverageTone`, `staleCountTone`, `duplicateRateTone`,
    `staleRateTone`, `invalidCountTone`, `failedRecordsTone`,
    `reliabilityScoreTone`.
  - **PulseDot**, **ShimmerBlock**, **PolishedEmptyState**,
    **PolishedErrorCard** sub-components.
  - **KpiCard** sub-component with tone tinting + quality bar + trend glyph
    + tabular-nums.
  - **SectionCard** sub-component with Lucide icon + uppercase
    tracking-wider title.
  - **LoadingSkeleton** structured shimmer placeholder mirroring the live
    dashboard layout.
  - **SourceCard** with uppercase micro-headers, tone-coloured EPS /
    failed-records / error-rate cells, tabular-nums, hover accent bar.
  - **SourceStatusBadge** with PulseDot for connected / XCircle for
    disconnected / spinning RefreshCw for reconnecting.
  - Tone-coloured quality scores (good/warn/poor via `scoreTone`).
  - Tone-coloured DLQ depth badge + DLQ table rows + retry result banner.
  - Tone-coloured gap rows + duration badges.
  - Tone-coloured coverage stats + stale markets list.
  - Tone-coloured pipeline-status badges + reliability scores + backfill
    run rows + action-result banner.
  - Live / Polling header badge with PulseDot (W35-3 realtime migration).
  - Live throughput sparkline (W35-3) + live error feed tape (W35-3).

### Verification of the prior-attempt baseline (before my retry changes)

- `bunx eslint src/components/IngestionHealthPanel.tsx` → exit 0 (clean).
- `bunx tsc --noEmit --skipLibCheck | grep IngestionHealthPanel` → no
  IngestionHealthPanel errors.
- `bunx vitest run src/components/IngestionHealthPanel.test.tsx` → 39/39
  pass in ~5.5s.

The prior attempt's polish was largely complete and verified clean. The
remaining gap identified by the retry spec was **spec item 1 — "KpiTile
pattern for ingestion metrics (throughput, latency, quality score, sources
online)"**: the existing 4 KpiTiles (Total Events / Events per min / Avg
Latency / Data Freshness) covered throughput (×2) + latency + freshness,
but the spec's "quality score" and "sources online" tiles were missing
from the KPI strip — those values were only surfaced inside the dedicated
Data Quality Scores + Source Health cards, not at the KPI summary layer.

### Retry changes applied

#### 1. New `sourcesOnlineTone()` helper

Added a new tone picker that maps the connected/total source ratio onto
the Tone palette:

```ts
function sourcesOnlineTone(
  connected: number | null | undefined,
  total: number | null | undefined,
): Tone {
  if (
    connected == null ||
    total == null ||
    !Number.isFinite(connected) ||
    !Number.isFinite(total) ||
    total === 0
  ) {
    return 'neutral'
  }
  if (connected === total) return 'good'
  if (connected === 0) return 'poor'
  return 'warn'
}
```

- All sources connected → **good** (emerald) — healthy ingestion surface.
- Some sources disconnected → **warn** (amber) — partial outage.
- No sources connected → **poor** (red) — total outage.
- No sources registered → **neutral** (dim slate) — startup / no data.

Inserted between `reliabilityScoreTone` and `PulseDot` so the file's tone
helpers stay grouped. Mirrors the W55-d `healthTone()` pattern used by
DatabaseStatusPanel.

#### 2. New "Quality Score" KpiTile

Added a 5th KpiTile after Data Freshness, surfacing the
`/api/ingestion/quality` `overall_score`:

- **label:** `"Quality Score"`
- **value:** `quality.overall_score.toFixed(1) + "%"` (or `"—"` when the
  quality endpoint is unreachable).
- **sub:** `"pass {formatPct(validation_pass_rate * 100)}"` (or
  `"endpoint unavailable"` fallback).
- **icon:** `ShieldCheck` (Lucide).
- **tone:** `scoreTone(quality?.overall_score)` — good ≥ 90 / warn ≥ 75 /
  poor < 75 / neutral when null.
- **quality bar:** `quality.overall_score` (0–100), clamped via
  `Math.max(0, Math.min(100, ...))`, so the bar fills proportionally to
  the score.
- **trend glyph:** TrendingUp when good, TrendingDown when poor, flat
  otherwise.
- **valueClass:** `TONE[scoreTone(...)].text` so the value text color
  matches the tone (emerald / amber / red / dim).
- **data-testid:** `"kpi-quality-score"` (new hook for downstream test +
  CSS targeting).

This means the trader now sees the overall quality score at the KPI
summary layer alongside throughput + latency + freshness — no need to
scroll to the Data Quality Scores card to know whether the pipeline is
producing clean data.

#### 3. New "Sources Online" KpiTile

Added a 6th KpiTile after Quality Score, aggregating the connected/total
source ratio across the `health.sources` array:

- **label:** `"Sources Online"`
- **value:** `"{connected}/{total}"` (e.g. `"2/3"` when 2 of 3 sources are
  connected) — or `"—"` when no sources are registered.
- **sub:** `"{connected} of {total} live"` (or `"no sources registered"`
  fallback).
- **icon:** `PlugZap` (Lucide).
- **tone:** `sourcesOnlineTone(connected, total)` — good when all
  connected / warn when some disconnected / poor when none / neutral when
  no sources.
- **quality bar:** `(connected / total) * 100`, clamped via
  `Math.max(0, Math.min(100, ...))`, so the bar fills proportionally to
  the ratio.
- **trend glyph:** TrendingUp when good, TrendingDown when poor, flat
  otherwise.
- **valueClass:** `TONE[sourcesOnlineTone(...)].text` so the value text
  color matches the tone.
- **data-testid:** `"kpi-sources-online"` (new hook for downstream test +
  CSS targeting).

This means the trader now sees source connectivity at the KPI summary
layer — no need to scroll to the Source Health card to know whether all
sources are live.

#### 4. KPI grid responsive layout updated

Updated the KPI strip container from:

```jsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
```

to:

```jsx
<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
```

So 6 tiles lay out as:
- Mobile (default): 2 cols × 3 rows
- Tablet (md ≥ 768px): 3 cols × 2 rows
- Desktop (xl ≥ 1280px): 6 cols × 1 row (single dense strip)

This keeps the dense single-row layout at desktop width while gracefully
degrading to multi-row layouts on smaller viewports.

#### 5. LoadingSkeleton updated to mirror the 6-tile KPI strip

Updated the `LoadingSkeleton` sub-component's KPI placeholder from:

```jsx
{/* KPI strip — 4 tone-tinted tiles */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
  {Array.from({ length: 4 }).map((_, i) => (
    ...
  ))}
</div>
```

to:

```jsx
{/* KPI strip — 6 tone-tinted tiles (W56-d-retry: mirrors the live
    6-tile KPI strip after the Quality Score + Sources Online
    tiles were added to complete the spec's KpiTile pattern). */}
<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
  {Array.from({ length: 6 }).map((_, i) => (
    ...
  ))}
</div>
```

So the loading skeleton visually mirrors the loaded KPI strip — the trader
sees 6 shimmering KpiTile placeholders while the panel is loading,
matching the 6 tiles they'll see once data arrives. The `.spinner`
element + "Loading Ingestion Health…" caption are preserved verbatim so
the W31-5 test contracts `document.querySelector('.spinner')` and
`screen.getByText('Loading Ingestion Health…')` still resolve.

### Backwards-compat (preserved verbatim)

- **Props**: unchanged (panel takes no props).
- **API calls**: `useRealtimeData('/api/ingestion/health', { wsChannel:
  'system', pollInterval: 15000 })` for the health endpoint + the
  `fetchAll()` Promise.all over `/api/ingestion/{quality, dead-letter,
  coverage, gaps, reliability, backfill/status, pipeline/status}` REST
  endpoints. All preserved verbatim.
- **Polling**: 15s `setInterval` with `visibilitychange` pause/resume +
  immediate refresh on regain. Preserved verbatim.
- **Clean unmount**: `clearInterval` + `removeEventListener` in the
  `useEffect` cleanup. Preserved verbatim.
- **Class names preserved**: `kpi-card` (+ `kpi-label` / `kpi-value` /
  `kpi-sub`), `badge` + `badge-cyan` / `-blue` / `-purple` / `-amber` /
  `-green` / `-red` / `-dim`, `btn` + `btn-ghost` + `btn-sm` + `btn-xs`,
  `mono`, `scrollbar-thin`, `banner-danger`, `spinner`, `skeleton` /
  `skeleton-line-sm` / `skeleton-line-lg`, `card` / `card-header` /
  `card-title` / `card-content`, `error-state` (+ `-icon` / `-title` /
  `-desc`), `empty-state` (+ `-icon` / `-title` / `-desc`), `tabular-nums`,
  `tracking-wider`, `uppercase`, `grid-kpi`, `divide-y`.
- **Accessibility preserved**: `role="alert"` on the error card,
  `role="status"` on the loading skeleton + empty states, `role="log"` +
  `aria-live="off"` + `aria-relevant="additions"` on the live error feed
  tape, `aria-hidden="true"` on every Lucide icon + every PulseDot,
  `aria-label="Refresh ingestion health"` on the manual Refresh button,
  `aria-label="Retry ingestion health fetch"` on the retry button (both
  the transient banner retry + the hard-error card retry),
  `aria-label="Retry dead-letter queue"` on the DLQ retry button,
  `aria-label="Dismiss action result"` on the action-result dismiss
  button, `aria-label="Loading ingestion health…"` on the loading
  wrapper, `aria-live="polite"` on the loading skeleton + the
  action-result banner + the DLQ retry result banner. The KpiCard
  sub-component's trend TrendingUp/Down glyphs carry `aria-hidden="true"`
  so they don't pollute the screen-reader announcement of the value.
- **Test-matched strings preserved verbatim**: "Data Ingestion Health"
  (panel header), "Source connectivity · throughput · data quality ·
  dead-letter queue · gap detection · market coverage" (panel sub-header),
  "Loading Ingestion Health…" (loading skeleton caption), "Live" /
  "Polling" (header status badges), "Refresh" (manual refresh button
  text), "Retry" (transient banner retry button text — accessible name
  matches the `/retry/i` regex via the direct text node of the button),
  "Source Health" / "Data Quality Scores" / "Dead-Letter Queue" / "Data
  Gaps" / "Market Coverage" / "Pipeline Status" / "Source Reliability"
  / "Backfill Progress" / "Operational Controls" (section card titles),
  "No ingestion sources reported" / "Quality endpoint unavailable" /
  "Coverage endpoint unavailable" / "Pipeline status endpoint unavailable"
  / "No reliability snapshots reported" / "Backfill status endpoint
  unavailable" / "No backfill runs recorded yet" (empty state titles),
  "Ingestion health endpoint unavailable" (hard-error card title),
  "No failed records in the dead-letter queue." / "No data gaps detected
  in the active window." / "No ingestion errors observed yet." (clean
  state copy), "84,521" / "1,235" / "42ms" / "5s" (KPI value leafs,
  preserved verbatim so the `getByTestId('kpi-*').textContent.toContain`
  test contracts still resolve), "94.5%" (quality score + quality score
  badge + new kpi-quality-score tile), "96.0%" (validation pass rate),
  "0.40%" (duplicate rate), "2.00%" (stale rate), "3" (invalid records),
  "Start" / "Stop" / "Retry Failed" / "Clear DLQ" / "Replay Events" /
  "Launch Backfill" (operational action button labels), "Cancel"
  (ConfirmationDialog cancel button label), "OK" / "FAIL" (action result
  banner status), "executing…" (action pending indicator).
- **Existing data-testid attributes preserved**: `ingestion-health-panel`
  (root wrapper), `ingestion-loading-skeleton` (loading wrapper),
  `ingestion-error-card` + `ingestion-error-card-msg` +
  `ingestion-error-card-retry` (hard-error card), `realtime-badge` /
  `poll-badge` (header status badges), `kpi-total-events` /
  `kpi-events-per-minute` / `kpi-avg-latency` / `kpi-data-freshness`
  (existing 4 KPI tiles — preserved verbatim), `throughput-card` /
  `live-throughput-card` / `live-throughput-badge` /
  `live-throughput-stats` / `live-throughput-empty` /
  `live-error-feed-card` / `live-error-feed-count` / `live-error-feed-row`
  / `live-error-feed-body` / `live-error-feed-empty`, `source-health-card`
  / `source-card-{id}` / `source-status-{status}` /
  `source-last-event-{id}` / `source-eps-{id}` / `source-failed-{id}` /
  `source-error-rate-{id}`, `quality-card` / `quality-score-badge` /
  `quality-overall` / `quality-validation` / `quality-duplicate` /
  `quality-stale` / `quality-invalid`, `dead-letter-card` /
  `dlq-breakdown` / `dlq-retry-button` / `dlq-retry-result` /
  `dlq-row-{i}`, `gaps-card` / `gap-row-{i}`, `coverage-card` /
  `coverage-pct-badge` / `coverage-tracked` / `coverage-recent` /
  `coverage-stale` / `coverage-pct`, `pipeline-status-card` /
  `pipeline-running-badge` / `pipeline-ws-state` / `pipeline-rest-state` /
  `btn-start-pipeline` / `btn-stop-pipeline`, `reliability-card` /
  `reliability-avg-score` / `reliability-grid` /
  `reliability-row-{source}`, `backfill-card` / `backfill-row-{id}` /
  `btn-launch-backfill`, `operational-controls-card` / `btn-retry-failed`
  / `btn-clear-dlq` / `btn-replay-events` / `action-pending-indicator` /
  `last-action-result`.
- **New data-testid attributes added** (additive — for downstream tests +
  CSS targeting):
  - `kpi-quality-score` on the new Quality Score KpiTile.
  - `kpi-sources-online` on the new Sources Online KpiTile.
- **Existing `data-tone` attribute hooks preserved** on every
  tone-coloured element (KpiTile wrappers, SourceCard cells, quality
  score values, DLQ depth badge + table rows + retry result, gap rows +
  duration badges, coverage stats + stale market rows, pipeline status
  badges + state cells, reliability score cells + avg score badge +
  reliability row wrappers, backfill run row wrappers, action-result
  banner). Both new KpiTiles inherit the `data-tone={tone}` attribute
  via the existing `KpiCard` sub-component.
- **'use client' directive**: preserved at the top of the file (line 100).

### Verification

```
$ wc -l src/components/IngestionHealthPanel.tsx
2874 src/components/IngestionHealthPanel.tsx

$ git diff --stat src/components/IngestionHealthPanel.tsx
 src/components/IngestionHealthPanel.tsx | 138 ++++++++++++++++++++++++++++++--
 1 file changed, 133 insertions(+), 5 deletions(-)

$ bunx eslint src/components/IngestionHealthPanel.tsx 2>&1; echo "EXIT=$?"
EXIT=0

$ bun run lint 2>&1 | tail -5
$ eslint .
EXIT=0

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -i IngestionHealthPanel; echo "GREP_EXIT=$?"
GREP_EXIT=1
(no IngestionHealthPanel errors)

$ bunx vitest run src/components/IngestionHealthPanel.test.tsx 2>&1 | tail -8
 ✓ src/components/IngestionHealthPanel.test.tsx (39 tests) 10190ms
     ✓ renders the loading skeleton on first mount before data arrives  384ms
     ✓ renders three source cards (CLOB / Gamma / WebSocket) with status badges  1200ms
     ✓ renders per-source EPS, failed records, and error rate values  489ms
     ✓ renders the dead-letter depth and recent failed records table  366ms
     ✓ renders the error-reasons breakdown bars  350ms
     ✓ fires POST /api/ingestion/dead-letter/retry when the Retry button is clicked  588ms
     ✓ shows a success banner after the dead-letter retry succeeds  455ms
 Test Files  1 passed (1)
      Tests  39 passed (39)
```

### Pre-existing errors in OTHER files (out of scope)

`bunx tsc --noEmit --skipLibCheck` surfaces pre-existing errors in
files owned by other concurrent agents — these are NOT in
`IngestionHealthPanel.tsx` and are NOT introduced by this task:

- `src/components/AuditLogPanel.tsx(466,10): error TS6133: 'KpiTile' is
  declared but its value is never read.`
- `src/components/LiveSafetyGatePanel.tsx(58,3): error TS6133: 'Zap' is
  declared but its value is never read.`
- (Earlier snapshots also surfaced
  `src/components/DecisionLedgerPanel.tsx(673,9): error TS6133: 'cfg' is
  declared but its value is never read.` and `(974,9): 'isRejectRisk'` —
  the DecisionLedgerPanel file is being edited live by another agent so
  its error signature is in flux.)

These are simple unused-import / unused-variable cleanups that the
respective owning agents will resolve in their own passes. Touching
them would conflict with their in-flight work, so they are explicitly
out of scope for W56-d-retry.

### Spec coverage — all 9 polish affordances confirmed

1. ✅ **KpiTile pattern for ingestion metrics (throughput, latency,
   quality score, sources online)** — the 4 existing KpiTiles (Total
   Events / Events per min / Avg Latency / Data Freshness) cover
   throughput + latency + freshness; the W56-d-retry pass ADDS two new
   KpiTiles for Quality Score + Sources Online, completing the spec's
   4-metric KPI pattern. All 6 tiles use the shared `KpiCard`
   sub-component with tone-tinted bg + Lucide icon + uppercase 9px label
   + 16px tabular-nums value + optional quality bar + optional trend
   glyph + `data-tone` attribute hook.
2. ✅ **Shimmer skeleton loading state** — `LoadingSkeleton`
   sub-component renders a structured shimmer placeholder mirroring the
   live dashboard layout (header strip + 6-tile KPI strip + 2 section
   cards + wide sparkline + tape placeholders). role=status +
   aria-live=polite + data-testid="ingestion-loading-skeleton". The
   "Loading Ingestion Health…" caption + `.spinner` class are preserved
   verbatim so the W31-5 test contracts resolve.
3. ✅ **Polished empty state with Lucide icon + message** —
   `PolishedEmptyState` sub-component (Lucide icon + .empty-state-title
   + .empty-state-desc, role=status) is used by the Source Health card,
   Data Quality Scores card, Coverage card, Pipeline Status card,
   Source Reliability card, and Backfill Progress card. Each empty
   state carries its own `data-testid` (`source-health-empty-state` /
   `quality-empty-state` / `coverage-empty-state` /
   `pipeline-empty-state` / `reliability-empty-state` /
   `backfill-empty-state` / `backfill-no-runs-state`).
4. ✅ **Section headers with icon + uppercase title** — `SectionCard`
   sub-component renders a Lucide icon + uppercase tracking-wider title
   + optional badge trailing node for every section (Throughput Trend,
   Live Throughput, Live Error Feed, Source Health, Data Quality
   Scores, Dead-Letter Queue, Data Gaps, Market Coverage, Pipeline
   Status, Source Reliability, Backfill Progress, Operational
   Controls). The title text content is preserved verbatim (CSS
   text-transform: uppercase does NOT mutate the DOM textContent, so
   `getByText('Source Health')` still resolves to a single leaf).
5. ✅ **Refined source health grid** — `SourceCard` sub-component
   renders each source as a card with:
   - Per-source Lucide icon (Radio for websocket / TrendingUp for
     gamma / Server for clob).
   - `SourceStatusBadge` with PulseDot for connected / XCircle for
     disconnected / spinning RefreshCw for reconnecting (tone-coloured
     via the shadcn Badge `success` / `destructive` / `warning`
     variants).
   - 2×2 grid of micro-stat cells (Last Event / Events per sec / Failed
     Records / Error Rate), each with:
     - Uppercase 10px tracking-wider text-[#7e8aaa] header.
     - mono tabular-nums value with tone-coloured text color (info for
       EPS / good-emerald-amber-red for failed records + error rate,
       derived from the corresponding `errorRateTone` /
       `failedRecordsTone` helpers).
     - `data-tone` attribute hook on each value span.
   - Hover accent bar via `hover:border-cyan-500/30` +
     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`.
6. ✅ **PulseDot for live ingestion indicators** — PulseDot renders
   on: (a) the header Live badge (good tone, pinging while WS is
   connected), (b) the Pipeline Status card's "Running" badge (good
   tone, pinging while running), (c) each SourceCard's "Connected"
   status badge (good tone, pinging). The dot's `pulse` prop is
   `true` by default but explicitly set `false` on degraded / unhealthy
   states so the dot conveys state without the distracting ping.
7. ✅ **Tone-coloured quality scores (green good, amber warning, red
   poor)** — `scoreTone(overall_score)` maps ≥ 90 → good (emerald) /
   ≥ 75 → warn (amber) / < 75 → poor (red). The tone is applied to:
   - The Data Quality Scores card's overall-score badge (`data-tone`).
   - The overall-score value cell (text color via `scoreColor` legacy
     helper + `data-tone` via `scoreTone`).
   - The new `kpi-quality-score` KpiTile's valueClass + tone + quality
     bar (W56-d-retry addition).
   - The Data Quality Scores card's section-header icon color (via
     `TONE[scoreTone(...)].text`).
   - The duplicate-rate / stale-rate / invalid-records cells (via
     `duplicateRateTone` / `staleRateTone` / `invalidCountTone`
     helpers, each with their own threshold rules).
8. ✅ **Error state: polished error card with retry** —
   `PolishedErrorCard` sub-component renders the hard-error branch:
   - AlertTriangle icon (28px, red-tinted, strokeWidth 1.5).
   - Title text node "Ingestion health endpoint unavailable"
     (preserved verbatim).
   - Error message rendered as a direct text node (so `getByText(/Network
     error: ECONNREFUSED/)` resolves to a single leaf).
   - Retry button with RotateCcw glyph (spins while retrying),
     `aria-label="Retry ingestion health fetch"` preserved verbatim,
     `data-testid="ingestion-error-card-retry"`.
   - role=alert + data-testid="ingestion-error-card" +
     data-testid="ingestion-error-card-msg".
   - The transient fetch-error banner (shown when prior data is still
     rendered) also carries role=alert + a Retry button with
     `aria-label="Retry ingestion health fetch"`.
9. ✅ **Refined dead-letter queue display** — the DLQ card renders:
   - Error-reasons breakdown bars (each reason + count + horizontal
     amber bar proportional to `count / maxBreakdownCount`). Each bar
     has `data-tone="warn"` + tabular-nums + the legacy `bg-amber-500/60`
     fill so the trader sees the relative frequency of each failure
     mode at a glance.
   - Retry button (Zap icon when idle / spinning RefreshCw when
     retrying) with `aria-label="Retry dead-letter queue"` +
     `data-testid="dlq-retry-button"`. Disabled when DLQ depth is 0 or
     while retry is in flight.
   - Inline retry-result banner with ✓ / ✗ glyph + the result message
     + retried count. Tone-coloured emerald on success / red on failure,
     `data-testid="dlq-retry-result"` + role=status + aria-live=polite.
   - Recent failed records table (shadcn `Table` / `TableRow` /
     `TableHead` / `TableCell`) with:
     - Uppercase 10px tracking-wider text-[#7e8aaa] headers (Timestamp /
       Source / Payload / Error / Retries).
     - Per-row hover accent bar via `hover:bg-amber-500/[0.04]` +
       `hover:shadow-[inset_3px_0_0_0_rgba(245,158,11,0.55)]` (amber
       accent — DLQ rows are warnings, not criticals).
     - tabular-nums on every numeric cell (timestamp, retries).
     - Source column carries a secondary Badge with the source name.
     - Payload column truncates with `max-w-[200px] truncate` + a
       `title` tooltip with the raw payload summary.
     - Error column carries `text-red-300` + `data-tone="poor"` +
       `max-w-[260px] truncate` + a `title` tooltip with the raw error.
     - Retries column right-aligned with `text-amber-400` +
       `data-tone="warn"` + tabular-nums.
   - Empty-state branch when no failed records exist (CheckCircle2 +
     "No failed records in the dead-letter queue." + role=status +
     data-tone="good").
   - max-h-72 + scrollbar-thin so a long DLQ (10+ rows) scrolls inside
     the card rather than stretching the panel vertically.

### Stage Summary

- **Final line count**: 2874 lines (was 2746 — +133 insertions / −5
  deletions per `git diff --stat`).
- **All 9 polish affordances confirmed** while preserving the existing
  props, API calls (`useRealtimeData('/api/ingestion/health', { wsChannel:
  'system', pollInterval: 15000 })` + `fetchAll()` Promise.all over 7
  REST endpoints + 5 WRITE control endpoints), polling (15s
  visibility-aware), clean unmount (clearInterval +
  removeEventListener), all existing class names, all existing
  accessibility roles/labels, all existing test-matched strings, all
  existing `data-testid` attributes, and the `'use client'` directive.
- **Lint**: clean on `IngestionHealthPanel.tsx` (exit 0, no output).
- **TypeScript**: 0 errors in `IngestionHealthPanel.tsx` (the only
  remaining tsc errors are in `AuditLogPanel.tsx` /
  `LiveSafetyGatePanel.tsx` / `DecisionLedgerPanel.tsx` from other
  concurrent agents — out of scope for W56-d-retry).
- **Tests**: 39/39 pass (was 39/39 — no regressions).

### Files touched

- `src/components/IngestionHealthPanel.tsx` (UI polish pass, 2746 → 2874
  lines, +133 / −5 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W56-d-retry-full-stack-developer.md`
  (this detailed agent work record).
- `worklog.md` (appended entry).

**IngestionHealthPanel is production-ready with the premium W56-d visual
layer, visually consistent with the W51-2d MLPanel / W53-c
StrategyPerformancePanel / W54-e MLValidationPanel / W55-a
LeaderboardPanel / W55-c AttributionPanel / W55-d ExecutionQualityPanel
/ W56-a SystemHealthView / W56-b DatabaseExplorerView / W56-c
DatabaseStatusPanel / W56-e ObservabilityPanel redesign family.**

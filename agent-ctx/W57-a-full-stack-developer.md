# W57-a — Polish `src/components/RetentionPanel.tsx` (premium visual layer)

**Task ID:** W57-a
**Agent:** fullstack-developer (Z.ai Code)
**Date:** 2026-09-22
**Target file:** `src/components/RetentionPanel.tsx`
**Worklog:** appended to `/home/z/my-project/worklog.md` under heading `## W57-a — full-stack-developer — Polish src/components/RetentionPanel.tsx (premium visual layer)`.

## Scope

UI polish pass on the Data Retention & Pruning control panel — bounded-storage policy
UI over `POST /api/system/prune` + `GET /api/system/health`. Additive only — all
existing functionality, API calls, polling cadence (60s visibility-aware), prune trigger
flow (AlertDialog confirm → POST → history log → refresh), inline horizon config editor
(local-only state), localStorage history (loadHistory / saveHistory with the
`polymarket:retention:prune_history` key + 25-entry cap), all existing class names, all
existing accessibility roles/labels, all existing test-matched strings, and the
`'use client'` directive are preserved.

## Background

- Read `/home/z/my-project/worklog.md` (last ~200 lines) to map the W50-56 design-system
  vocabulary shared by W53-c StrategyPerformancePanel + W54-a DeepAnalysisView + W54-e
  MLValidationPanel + W55-a LeaderboardPanel + W55-c AttributionPanel + W56-a
  SystemHealthView + W56-e ObservabilityPanel.
- Read `src/components/RetentionPanel.tsx` end-to-end (947 lines) + the 10-test contract
  in `src/components/RetentionPanel.test.tsx` (W28-3).
- Consulted `src/components/SystemHealthView.tsx` (W56-a) as the canonical reference for
  the W56-a inline sub-component pattern (`Tone` + `TONE` + `PulseDot` + `SectionHeader`
  + `KpiTile` + `ShimmerBlock` + `SystemHealthSkeleton` + `PolishedEmptyState` +
  `PolishedErrorCard`).
- Verified baseline: 10/10 tests pass pre-polish (vitest 4.1.11, ~1.6s).

## Inline sub-components built (kept private to the panel)

- `Tone` + `ToneConfig` + `TONE` — 5-tone vocabulary with self-contained static class
  strings. Mirrors W53-c / W55-c / W56-a.
- `serviceStatusTone(status: string | undefined): Tone` — maps the downstream
  health-check status onto the W57-a Tone palette:
  - `good` (within policy): UP / HEALTHY / OK / RUNNING / ACTIVE
  - `warn` (near limit): DEGRADED / WARN / WARNING / SLOW / STALE
  - `poor` (exceeded): DOWN / CRITICAL / ERROR / FAILED / STOPPED
  - `neutral`: no probe / unknown
- `statusBadgeClass(t: Tone): string` — maps a Tone onto the legacy badge classes
  (`badge-green` / `badge-amber` / `badge-red` / `badge-dim`).
- `horizonTone(days: number): Tone` — short horizons (≤7d) = `warn` (hot store, prune
  aggressively), mid horizons (≤30d) = `info`, long horizons (>30d) = `good`.
- `horizonBadgeClass(days: number): string` — maps the horizon tone onto the legacy
  badge classes.
- `PulseDot({ tone = 'good', pulse = true })` — `animate-ping` halo + solid dot,
  aria-hidden. `pulse={false}` flag for dead services / history rows.
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide icon +
  uppercase tracking-wider 10px title + optional dim italic 9px description + optional
  trailing node. Title in its own `<span>` so RTL `getByText(...)` matches just the span
  (preserves the W28-3 test contract `getByText('Retention Policy by Store')`).
- `KpiTile({ label, value, hint, tone, icon, quality, trend, testId })` — tone-tinted
  bg + uppercase 9px label with Lucide icon in the label row + large tabular-nums value
  + optional quality bar + optional trend glyph. Carries `data-testid` + `data-tone`.
- `ShimmerBlock({ className })` — thin skeleton placeholder sized via className.
- `RetentionSkeleton()` — structured shimmer placeholder mirroring the live panel
  layout. role=status + aria-live=polite + data-testid="retention-loading-skeleton".
- `PolishedEmptyState({ icon, title, description, testId })` — Lucide icon + title +
  dim description. role=status. Used by the prune-history empty branch.
- `PolishedErrorCard({ message, onRetry })` — AlertTriangle icon + the title
  "Retention backend unreachable" (preserved verbatim as the direct text node of a leaf
  `<span>` so the W28-3 test contract `getByText('Retention backend unreachable')`
  resolves) + the wrapped error string + a Retry button. role=alert +
  data-testid="retention-error-card" + "-retry" suffix on the button.

## All 8 polish affordances applied

1. **KpiTile pattern for retention metrics** — 4 KPI tiles (Market DB Size / Snapshots /
   Ticks / Total Pruned) refactored to `<KpiTile>` with tone-tinted bg + Lucide icon in
   the label row + tabular-nums value + `data-tone` attribute.
2. **Shimmer skeleton loading state** — `<SkeletonRows rows={5}>` replaced by
   `<RetentionSkeleton/>` mirroring the live panel layout.
3. **Polished empty state with Lucide icon + message** — bare `EmptyState` wrapped in
   `<PolishedEmptyState>` with `History` icon + "No prune operations logged yet" title
   (preserved verbatim) + dim description.
4. **Section headers with icon + uppercase title** — 5 `SectionHeader` sub-components
   rendered above the KPI strip / retention policy table / manual prune card / prune
   history card / horizon config card.
5. **Refined retention policy table (uppercase headers, row hover, tabular-nums)** —
   uppercase 10px tracking-wider font-bold headers + row-hover accent bar
   (`hover:bg-cyan-500/[0.04]` + `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`)
   + `tabular-nums` on the Horizon badge + tone-coloured Status column.
6. **Tone-colored retention status (green within policy, amber near limit, red
   exceeded)** — `serviceStatusTone(check?.status)` maps each store's downstream
   health-check status onto the Tone palette; the same palette is applied to the
   per-store result tiles + prune-history Status column + horizon-config card borders.
7. **Error state: polished error card with retry** — bare `ErrorState` replaced by
   `<PolishedErrorCard/>` with AlertTriangle icon + "Retention backend unreachable"
   title (preserved verbatim) + Retry button (RefreshCw glyph, calls `fetchHealth()`).
8. **Refined controls (policy editor, TTL inputs)** — horizon-config inputs carry
   `tabular-nums` + tone-tinted borders (warn when dirty) + `data-tone` hooks; manual
   prune AlertDialog flow preserved verbatim; "Last result" preview card tone-tints
   each per-store tile + tabular-nums on every numeric value.

## Additional refinements (beyond the 8 spec items)

- Header `ops logged` badge carries `tabular-nums`.
- Footer `60s` + `last sync` text preserved verbatim with `mono` + `tabular-nums`.
- `data-tone` hooks on every tone-coloured element (KpiTile, SectionHeader icon,
  Status column badge + PulseDot, per-store result tile, horizon-config card border).
- Row hover accent bar consistent across both tables (retention policy + prune history).
- `tabular-nums` everywhere on numeric values.
- Reduced-motion-friendly PulseDot (`pulse={false}` for `poor`-tone rows + history rows).

## Test contract mapping

All 10 tests in `RetentionPanel.test.tsx` (W28-3 contract) preserved:

| Test | Matched string / contract | Resolution |
|---|---|---|
| Renders the panel container without crashing | `container.firstChild` truthy | Outer wrapper preserved |
| Renders the panel header title "Data Retention & Pruning" | `getByText(/Data Retention & Pruning/)` | `<h2>` direct text node (&amp; → & in textContent) — preserved verbatim |
| Renders the "Bounded-storage policy" badge | `getByText('Bounded-storage policy')` exact | `<span className="badge badge-dim text-[9px]">Bounded-storage policy</span>` direct text node — preserved verbatim |
| Renders the Refresh button in the header | `getByRole('button', { name: /refresh/i })` | `<Button>...Refresh</Button>` accessible name = "Refresh" — preserved verbatim |
| Renders the "POST /api/system/prune" endpoint note | `getByText(/POST \/api\/system\/prune/)` | `<code>POST /api/system/prune</code>` direct text node — preserved verbatim |
| Renders the four-store horizons note (7d / 30d / 30d / 90d) | `getByText(/7d \/ 30d \/ 30d \/ 90d horizons/)` | `<p>` text preserved verbatim |
| Renders the "Retention Policy by Store" table after the health fetch resolves | `getByText('Retention Policy by Store')` exact | `<SectionHeader title="Retention Policy by Store" .../>` → `<span>Retention Policy by Store</span>` direct text node — preserved verbatim |
| Renders the "Retention backend unreachable" error state when fetch throws | `getByText('Retention backend unreachable')` exact | `<PolishedErrorCard>` → `<span className="error-state-title">Retention backend unreachable</span>` direct text node — preserved verbatim |
| Renders without crashing when the health fetch never resolves (stays loading) | `container.firstChild` truthy + `getByText(/Data Retention & Pruning/)` | `<RetentionSkeleton/>` placeholder; panel header rendered by parent outside the body conditional — preserved |
| Passes the Authorization header via apiFetch on the initial poll | `fetch.mock.calls[0][1].headers.get('Authorization')` matches `/^Bearer\s+\S+$/` | `apiFetch(${apiUrl}/api/system/health)` call preserved verbatim |

## Verification

```bash
$ wc -l src/components/RetentionPanel.tsx
1294 src/components/RetentionPanel.tsx

$ bun run lint 2>&1 | tail -3
$ eslint .
(exit 0, no output — clean)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -i RetentionPanel; echo "GREP_EXIT=$?"
GREP_EXIT=1
(no RetentionPanel errors — the only remaining tsc error is in
 LiveSafetyGatePanel.tsx from another concurrent agent, out of scope for W57-a)

$ bun run test src/components/RetentionPanel.test.tsx 2>&1 | tail -8
 ✓ src/components/RetentionPanel.test.tsx (10 tests) 2169ms
     ✓ renders the Refresh button in the header  408ms
     ✓ renders the "Retention Policy by Store" table after the health fetch resolves  501ms
     ✓ renders the "Retention backend unreachable" error state when fetch throws  309ms
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ bun run test 2>&1 | tail -5
 Test Files  93 passed (93)
      Tests  1523 passed (1523)
   Duration  261.05s
```

## Files touched

- `src/components/RetentionPanel.tsx` (UI polish pass, 947 → 1294 lines).
- `/home/z/my-project/agent-ctx/W57-a-full-stack-developer.md` (this work record).
- `/home/z/my-project/worklog.md` (appended `## W57-a — full-stack-developer — Polish src/components/RetentionPanel.tsx (premium visual layer)` entry).

## Result

RetentionPanel is production-ready with the premium W57-a visual layer, visually
consistent with the W51-2d MLPanel / W53-c StrategyPerformancePanel / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-c AttributionPanel / W55-d
ExecutionQualityPanel / W56-a SystemHealthView / W56-b DatabaseExplorerView / W56-e
ObservabilityPanel redesign family.

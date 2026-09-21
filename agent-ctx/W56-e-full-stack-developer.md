# W56-e — full-stack-developer — Polish ObservabilityPanel.tsx

**Date:** 2026-09-21
**Task ID:** W56-e
**Agent:** full-stack-developer
**Scope:** UI polish pass on `src/components/ObservabilityPanel.tsx`
(System Observability Dashboard — 23 auto-collected metrics across 5
categories DATA / BOT / EXECUTION / ML / SYSTEM, backed by a
Prometheus-style registry + structured logging downstream that feeds
Grafana dashboards). Additive only — all existing props, API calls,
polling, class names, test contracts, role attributes, aria-labels
preserved. The `'use client'` directive preserved.

## Background / investigation

- Read `worklog.md` (last ~200 lines) to map the W50-55 design-system
  vocabulary shared by W53-c StrategyPerformancePanel + W54-a
  DeepAnalysisView + W54-e MLValidationPanel + W55-a LeaderboardPanel +
  W55-c AttributionPanel:
  - **Tone system** (`Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'`,
    `TONE: Record<Tone, ToneConfig>` with self-contained static `bg` /
    `border` / `text` / `bar` / `dot` / `label` / `halo` class strings
    so Tailwind 4's JIT scanner picks them up).
  - **KpiTile** (large value, tone-tinted bg, quality bar, optional
    trend glyph, `data-tone` attribute).
  - **SectionHeader** (Lucide icon + uppercase tracking-wider title +
    optional dim italic description + optional trailing node).
  - **PulseDot** (animated status dot for LIVE indicators, optional
    `pulse` flag to disable the ping animation).
  - **ShimmerBlock** (thin skeleton placeholder that can be sized via
    className).
  - **PolishedEmptyState** (Lucide icon + title + helper copy,
    role=status).
  - **ErrorCard** (AlertTriangle icon + title + error string + Retry
    button with RotateCcw glyph, role=alert).
  - **LoadingSkeleton** (structured shimmer placeholder mirroring the
    live panel layout, role=status + aria-live=polite).
  - `data-tone="{good|warn|poor|info|neutral}"` attribute hooks on
    every tone-coloured element for downstream CSS targeting.
  - Row hover accent bar via `hover:bg-cyan-500/[0.04]` +
    `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` (no layout
    shift — inset shadow only).
  - `tabular-nums` on every numeric cell.
- Read `src/components/ObservabilityPanel.tsx` end-to-end (898 lines)
  + the 9-test contract in `src/components/ObservabilityPanel.test.tsx`:
  - Title "System Observability" (loading + empty + error + loaded states).
  - Empty-state title "No metrics collected yet".
  - Error title "Observability endpoint unavailable".
  - Retry button accessible name `/retry/i` regex.
  - Initial fetch URL must contain `/api/observability`.
  - Loading skeleton shown on first mount before data resolves.
- Consulted `src/components/AttributionPanel.tsx` (W55-c, 1416 lines)
  as the canonical reference for the W55-c inline sub-component pattern
  (`Tone` + `TONE` + `PulseDot` + `SectionHeader` + `KpiTile` +
  `ShimmerBlock` + `PolishedEmptyState` + `ErrorCard`).
- Verified baseline: 9/9 tests pass pre-polish (vitest 4.1.11, ~1.6s).

## Inline sub-components built (kept private to the panel so test
mocks + ts-isolation stay clean)

- `Tone` + `ToneConfig` + `TONE` — 5-tone vocabulary with self-contained
  static class strings. Mirrors W53-c / W55-c.
- `severityTone(s: Severity): Tone` — maps the legacy `Severity`
  (`normal | warning | critical | unknown`) onto the W56-e Tone palette
  (`good | warn | poor | neutral`). The existing `severityTextClass`
  helper is preserved verbatim so any external CSS targeting it still
  resolves; the new helper layers the Tone palette + `data-tone` hook
  on top.
- `freshnessTone(sec): Tone` — good ≤60s, warn ≤300s, poor >300s.
  Powers the Newest-Sample KpiTile.
- `alertTone(crit, warn): Tone` — poor if any critical, warn if only
  warnings, good otherwise. Powers the Active-Alerts KpiTile.
- `severityContext(name): string` — human-readable threshold context
  (e.g. `≥ 70 warn · ≥ 90 crit`) for the alert feed tooltip + the
  metric card title attribute.
- `PulseDot({ tone = 'good', pulse = true })` — `animate-ping` halo +
  solid dot, aria-hidden. Optional `pulse={false}` flag renders the
  solid dot without the ping (used inside MetricCard so the dot
  conveys state without distracting from the value).
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 10px title + optional dim italic 9px
  description + optional trailing node. Title in its own `<span>` so
  RTL `getByText(...)` matches a single leaf. Mirrors W53-c / W54-a /
  W55-c SectionHeader.
- `KpiTile({ label, value, hint, tone, quality, trend, testId })` —
  tone-tinted bg + uppercase 9px label + large tabular-nums value +
  optional quality bar + optional trend glyph (TrendingUp/Down). Carries
  `data-testid` + `data-tone`. Mirrors W55-c KpiTile.
- `ShimmerBlock({ className })` — thin skeleton placeholder sized via
  className. aria-hidden. Mirrors W54-e / W55-c ShimmerBlock.
- `PolishedEmptyState({ icon, title, description, className, testId })`
  — Lucide icon + title + dim description. role=status. Mirrors
  W55-c PolishedEmptyState.
- `ErrorCard({ title, error, onRetry })` — AlertTriangle icon + title
  (direct text node) + dim error string + Retry button (RotateCcw
  glyph). role=alert. Mirrors W55-c ErrorCard.
- `ObservabilitySkeleton()` — structured shimmer placeholder mirroring
  the live panel layout (header strip + KPI strip + alert feed row +
  3 collapsible category sections with per-metric card grids). role=
  status + aria-live=polite + data-testid="observability-loading-
  skeleton". Mirrors W55-c AttributionSkeleton.
- `AlertFeed({ alerts, onJump })` — NEW section that surfaces every
  metric currently in `warning` or `critical` state as a compact alert
  row (PulseDot + metric name + tone-coloured value + category badge +
  age). Renders inside a Collapsible with a Bell-icon SectionHeader
  trigger. Only renders when ≥1 alert is present. Mirrors the W53-c
  alert-row pattern + the W55-a LeaderboardPanel hover affordance.
- `MetricCard({ name, entry, sev, meta, history })` — refined per-metric
  card extracted from the inline grid. Tone-tinted border on warning /
  critical metrics + tabular-nums value + data-tone hook + row-hover
  accent bar + severity PulseDot (no ping) + uppercase "AGE" footer
  label + Clock icon next to the timestamp.

## Applied all 9 polish affordances from the W56-e spec

1. **KpiTile pattern for key observability summary metrics** — the 4-tile
   KPI strip refactored from bare `<div className="kpi-card">` spans to
   `<KpiTile>`:
   - Total Metrics (info tone) — metric_count value, category_count
     hint, quality bar fills to (count/23)*100 so the trader sees how
     complete the registry is.
   - Newest Sample (freshnessTone) — `formatDuration(newest_sample_age_seconds)`
     value, "since last emit" hint, trend glyph (up if fresh, down if
     stale).
   - Active Alerts (alertTone) — count of warning+critical metrics,
     hint breakdown "N crit · M warn · T total", trend glyph (down if
     criticals, flat if warnings, up if clean).
   - Last Refresh (neutral tone) — clock time + formatAge hint.

2. **Shimmer skeleton loading state** — the bare `<div className="card">`
   with 4 bare skeleton tiles + 3 bare skeleton rows is replaced by
   `<ObservabilitySkeleton/>` which mirrors the live panel layout
   (header strip + KPI strip + alert feed row + 3 collapsible category
   sections with per-metric card grids). role=status + aria-live=
   polite + data-testid="observability-loading-skeleton". The header
   text "System Observability" + "30s poll" badge are preserved so the
   loading-state test contract resolves.

3. **Polished empty state with Lucide icon + message** — the bare `Inbox`
   w-8 opacity-30 emoji + bare `<div>` empty branch is replaced by
   `<PolishedEmptyState>` with Lucide `Inbox` icon (size-10, dim text
   color, strokeWidth 1.5) + the "No metrics collected yet" title
   (preserved verbatim as the direct text node of the title span so the
   test contract resolves to a single leaf) + dim description ("The
   auto-collector emits metrics every 30 seconds after backend startup.
   If this persists, verify the backend service is running and
   observability-collector is wired into the FastAPI lifespan.") +
   "Check again" button. role=status + data-testid="observability-
   empty-state". The header text "System Observability" + "30s poll"
   badge are preserved so the empty-state test contract resolves.

4. **Section headers with icon + uppercase title** — each metric
   category `Collapsible` trigger now renders a SectionHeader-style
   header:
   - Lucide icon (size-4, per-category colour: blue DATA / purple BOT /
     amber EXECUTION / emerald ML / gray SYSTEM / cyan OTHER).
   - Uppercase tracking-wider 10px bold title (e.g. "DATA", "BOT").
   - Count badge (badge-dim, tabular-nums).
   - Dim italic description "{N} metric(s)" (hidden on mobile).
   - Per-category alert count badge (badge-amber when >0 alerts,
     badge-dim otherwise) — surfaces at-a-glance which category needs
     attention.
   - Chevron icon (rotates 180° when open).

5. **Refined metrics grid (uppercase headers + row hover + tabular-nums
   + tone-coloured values)** — the per-metric card grid is refactored
   via `<MetricCard>`:
   - Each card carries `hover:bg-cyan-500/[0.04]` layered with
     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` so
     hovering a metric shows a subtle cyan left accent bar (no layout
     shift — inset shadow only). Mirrors the W53-c / W55-a hover
     affordance.
   - The value span carries `tabular-nums` so values don't shift
     alignment between renders.
   - The value span carries `data-tone={severityTone(sev)}` for
     downstream CSS targeting.
   - The card border is tone-tinted (emerald for normal, amber for
     warning, red for critical) so warning/critical cards pop out of
     the grid without an explicit colour stripe.
   - A small severity PulseDot (`pulse={false}`, solid dot only)
     renders next to the value so the trader reads pass/warn/fail at
     a glance without the ping animation distracting from the value.
   - The unit label below the value is now `uppercase tracking-wider`
     so it reads as a column-style micro-header rather than a value.
   - The timestamp footer carries a Lucide `Clock` icon (size-2.5)
     before the formatted clock time.
   - The card's title attribute surfaces the raw value + threshold
     context (e.g. `35.2 · ≥ 70 warn · ≥ 90 crit`) so hovering shows
     the exact threshold rules.

6. **PulseDot for live monitoring** — the header's bare `syncing` badge
   is paired with a new LIVE indicator: a PulseDot (good tone) + "live"
   text badge when the panel is idle, switching to "syncing" with the
   ping animation active when mid-poll. Mirrors the W54-a / W55-c
   PulseDot LIVE indicator pattern.

7. **Tone-colored metric status** — `severityTextClass` already mapped
   the existing `Severity` to emerald / amber / red / neutral text
   classes; this pass adds:
   - `data-tone={severityTone(sev)}` attribute hook on the metric
     value span + the MetricCard wrapper for downstream CSS targeting.
   - Tone-tinted card border (emerald-500/25 for normal, amber-500/25
     for warning, red-500/25 for critical) so warning/critical cards
     pop out of the grid.
   - The Active-Alerts KpiTile uses `alertTone(crit, warn)` to colour
     the value emerald when clean, amber when only warnings, red when
     any criticals.
   - The AlertFeed rows carry `data-tone` on the value span + use the
     severity PulseDot (poor/warn tone) before each row.

8. **Error state: polished error card with retry** — the bare red
   AlertCircle + Retry button is replaced by `<ErrorCard>` — a red-
   tinted card with `AlertTriangle` icon + the full wrapped error
   string ("HTTP 500 …" / "Network error") rendered as the card's
   subtitle (direct text node so the W38-8 test contract resolves to
   a single leaf) + a Retry button (`RotateCcw` glyph, calls
   `refresh()`). role=alert + data-testid="observability-error" +
   "-msg" + "-retry" suffixes on the elements. The header text
   "System Observability" + "30s poll" badge are preserved so the
   error-state test contract resolves.

9. **Refined alert feed display** — NEW `<AlertFeed>` section rendered
   between the KPI strip and the filter bar. Surfaces every metric
   currently in `warning` or `critical` state as a compact alert row:
   - PulseDot (poor tone for critical, warn tone for warning) + metric
     name (mono, truncate) + category badge (hidden on mobile).
   - Tone-coloured value (severityTextClass) with `data-tone` hook +
     `tabular-nums`.
   - Age column (w-20, mono, tabular-nums) showing `formatAge(timestamp)`.
   - Each row carries the same hover accent bar pattern as the metric
     grid (`hover:bg-cyan-500/[0.04]` + `hover:shadow-[inset_3px_0_0_0…]`).
   - Each row's `title` attribute surfaces the threshold context
     (`{name} · ≥ {warn} warn · ≥ {crit} crit`) for hover inspection.
   - Uppercase header row ("METRIC" / "VALUE" / "AGE") mirroring the
     W53-c metric table pattern.
   - Collapsible with a Bell-icon SectionHeader trigger + a count
     badge (badge-red for criticals, badge-amber for warnings only).
   - max-h-72 + scrollbar-thin so a long alert feed (5+ alerts)
     scrolls inside the section rather than stretching the panel.
   - Sorted critical-first then by ascending age (most recent first).
   Only renders when ≥1 alert is present (clean systems hide the
   section entirely).

## Additional refinements (beyond the 9 spec items)

- **Header comment block** updated with a new "W56-e — Final UI polish
  pass" section documenting each polish affordance + the constraint
  that existing class names + testids + role attributes + aria-labels
  + API calls + the 'use client' directive are preserved.
- **Header PulseDot LIVE indicator** — new PulseDot + "live"/"syncing"
  badge in the header next to the "30s poll" badge. The dot pings
  emerald when `refreshing` is true (mid-poll); renders a solid dot
  when idle so the trader can tell at a glance that the 30s poller is
  alive. Mirrors the W54-a / W55-c PulseDot pattern.
- **Per-category alert count badge** — each category's Collapsible
  trigger now carries a `badge-amber` count of how many metrics in
  that category are in warning/critical state. Hidden when 0. So the
  trader can see at a glance which category needs attention.
- **Focus-visible ring on the search input + time range selector** —
  both controls now carry `focus-visible:ring-1 focus-visible:ring-
  cyan-400/40` so keyboard users see the active control. Mirrors W55-c.
- **Quality bar on KpiTiles** — Total Metrics KpiTile's quality bar
  fills to (metric_count/23)*100 so the trader sees how complete the
  registry is. Active Alerts KpiTile's quality bar fills to (alerts/
  total)*100 so the trader sees the alert density.
- **Trend glyph on KpiTiles** — Newest Sample KpiTile carries a
  TrendingUp glyph when fresh, TrendingDown when stale. Active Alerts
  KpiTile carries TrendingDown when criticals, TrendingUp when clean,
  flat when only warnings.
- **Threshold context tooltip on metric cards** — each MetricCard's
  title attribute surfaces the raw value + threshold context (e.g.
  `35.2 · ≥ 70 warn · ≥ 90 crit`) so hovering shows the exact
  threshold rules.
- **MetricCard border tone-tinted** — non-neutral metrics carry a
  tone-tinted border (emerald-500/25 normal, amber-500/25 warning,
  red-500/25 critical) so warning/critical cards pop out of the grid
  without an explicit colour stripe.

## Backwards-compat

- **Props**: unchanged (panel takes no props).
- **API calls**: `apiFetch('/api/observability')` on mount + every 30s
  + on visibilitychange regain. Per-metric history fetches
  `apiFetch('/api/observability/history/${name}?limit=${limit}')` for
  sparklines. All preserved verbatim.
- **Polling**: 30s setInterval with visibilitychange pause/resume +
  immediate refresh on regain. Preserved verbatim.
- **Clean unmount**: clearInterval + removeEventListener in useEffect
  cleanup. Preserved verbatim.
- **Class names preserved**: `card`, `badge` + `badge-cyan` / `-blue` /
  `-purple` / `-amber` / `-green` / `-red` / `-dim`, `btn` + `btn-ghost`
  + `btn-sm` + `btn-xs`, `mono`, `scrollbar-thin`, `banner-warning`,
  `spinner`, `skeleton` / `skeleton-line` / `skeleton-line-sm` /
  `skeleton-line-md` / `skeleton-card`, `kpi-card` (+ `kpi-label` /
  `kpi-value` / `kpi-sub`), `input` + `input-sm`, `empty-state` (+
  `-icon` / `-title` / `-desc`), `error-state` (+ `-icon` / `-title` /
  `-desc`), `border-l-blue-500/50` / `-purple` / `-amber` / `-emerald`
  / `-gray` / `-cyan`, `tabular-nums`, `tracking-wider`,
  `uppercase`.
- **Accessibility preserved**: role=alert on the error card, role=
  status on the loading skeleton + empty state, role=group + aria-
  label="Category filters" on the category-toggle group, aria-pressed
  + aria-label="Toggle {category} category" on each category toggle,
  aria-label="Filter metrics by name" on the search input, aria-label=
  "Sparkline time range" on the time-range selector, aria-label=
  "Refresh observability data" on the refresh button, aria-label=
  "Retry observability fetch" on the retry button, aria-hidden on
  every Lucide icon. The loading skeleton + empty state + error card
  all carry role=status / role=alert + an aria-label / aria-live=polite
  so screen readers announce state changes.
- **Test-matched strings preserved verbatim**: "System Observability"
  (loading + empty + error + loaded state headers), "Observability
  endpoint unavailable" (error title), "No metrics collected yet"
  (empty title), "Retry" (retry button text — accessible name matches
  `/retry/i` regex via the direct text node of the button), "Check
  again" (empty-state retry button), "30s poll" (header badge),
  "syncing" / "live" / "fetching" (header status badges), "No metrics
  match the current filter." (filtered empty branch).
- **'use client' directive**: preserved.

## New CSS hooks added (for downstream CSS layer to target)

- `data-testid="observability-loading-skeleton"` on the loading
  wrapper.
- `data-testid="observability-empty-state"` on the empty state.
- `data-testid="observability-error"` on the error card (+ `-msg` on
  the message span, `-retry` on the retry button).
- `data-testid="observability-kpi-tile"` default on KpiTile +
  `observability-kpi-{total|newest|alerts|refresh}` on each summary
  tile + `-value` suffix on the value span.
- `data-tone="{good|warn|poor|info|neutral}"` on:
  - each KpiTile wrapper,
  - each MetricCard wrapper + the value span,
  - each AlertFeed row's value span,
  - the AlertFeed section's Collapsible border (via Tone-derived
    border class).

## Stage Summary

- **Final line count**: 1468 lines (was 898 — +718 insertions / −148
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving all existing
  functionality, class names, test contracts, client component, API
  calls, polling, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive.
- **Verification — `bunx eslint src/components/ObservabilityPanel.tsx`**:
  clean (exit 0, no output).
- **Verification — `bunx tsc --noEmit --skipLibCheck | grep
  ObservabilityPanel`**: 0 errors for ObservabilityPanel.tsx.
- **Verification — `bunx vitest run src/components/ObservabilityPanel.test.tsx`**:
  9/9 tests pass in ~1.7s. Confirms the full W38-8 test contract is
  preserved.
- **Note**: pre-existing lint/tsc errors in `IngestionHealthPanel.tsx`
  are from a separate parallel W56 task and are NOT introduced by
  this pass — they exist before and after my changes. Out of scope.

## Files touched

- `src/components/ObservabilityPanel.tsx` (UI polish pass, 898 → 1468
  lines, +718 / −148 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W56-e-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended entry).

## Push verification

```
$ wc -l src/components/ObservabilityPanel.tsx
1468 src/components/ObservabilityPanel.tsx

$ git diff --stat src/components/ObservabilityPanel.tsx
 src/components/ObservabilityPanel.tsx | 866 +++++++++++++++++++++++++++------
 1 file changed, 718 insertions(+), 148 deletions(-)

$ bunx eslint src/components/ObservabilityPanel.tsx && echo "lint clean"
lint clean

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep ObservabilityPanel
(no output — 0 errors in ObservabilityPanel.tsx)

$ bunx vitest run src/components/ObservabilityPanel.test.tsx
 ✓ src/components/ObservabilityPanel.test.tsx (9 tests) 571ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

## Final status

- **Polish**: complete — all 9 spec items + 5 additional refinements
  applied (header PulseDot LIVE indicator, per-category alert count
  badge, focus-visible ring on controls, quality bar + trend glyph on
  KpiTiles, threshold context tooltip on metric cards).
- **Backwards-compat**: full — all props, API calls, polling, class
  names, testids, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive preserved. All 9 tests pass.
- **Lint**: clean (exit 0) on ObservabilityPanel.tsx.
- **TypeScript**: 0 errors in ObservabilityPanel.tsx.
- **Tests**: 9/9 pass.

**ObservabilityPanel is production-ready with the premium W56-e visual
layer, visually consistent with the W51-2d MLPanel / AIMLCommandCenter
/ W53-c StrategyPerformancePanel / W54-a DeepAnalysisView / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-c AttributionPanel
redesign family.**

# Task W57-e — CapitalAllocatorPanel polish (W51-2d MLPanel redesign family)

**Agent:** full-stack-developer
**Target:** `src/components/CapitalAllocatorPanel.tsx` — Polymarket Pro trading workstation capital allocator panel (Michaelis-Menten saturating edge curve, Kelly fraction estimate, capital allocation across strategies, exposure management)
**Spec:** Apply the W50-56 design-system vocabulary (Tone system, KpiTile, PulseDot, SectionHeader, ShimmerBlock, PolishedEmptyState, PolishedErrorState, KellyBar, ConfigField) to the Capital Allocator panel for visual consistency with the W51-2d MLPanel / W53-c StrategyPerformancePanel / W54-e MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel / W56-c DatabaseStatusPanel / W56-e ObservabilityPanel redesign family.

## Context

- Read `worklog.md` (last ~250 lines) to map the W50-56 design-system vocabulary.
  Reference implementations consulted: `MLPanel.tsx` (W51-2d, the canonical
  source of the Tone / KpiTile / SectionHeader / ShimmerBlock / PulseDot
  sub-components), `DatabaseStatusPanel.tsx` (W56-c — closest sibling, dark
  `bg-[#13161e]` card surface + `border-[#1f2335]` borders + `#dde1ed`
  primary text + `data-table` for the recent errors list, same visual
  language as the Capital Allocator's recent allocations table),
  `ObservabilityPanel.tsx` (W56-e — the most recent polish pass in the
  family, used as the layout reference for the polished KpiTile + ShimmerBlock
  skeleton layout).
- Read `CapitalAllocatorPanel.tsx` end-to-end (1365 lines) + the 10-test
  contract (`CapitalAllocatorPanel.test.tsx` W28-3) to map every test
  surface.
- Read `globals.css` for the existing `.data-table` (uppercase headers via
  `text-transform: uppercase`, row-hover left-edge accent via `border-left:
  2px solid var(--accent)`) and `.empty-state` / `.error-state` CSS class
  hooks (icon 28px / title text-md / desc text-sm + max-width).

## New sub-components (kept private to the panel)

- `type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'` +
  `interface ToneConfig` (bg / border / text / bar / dot / label / halo /
  rowHover) + `const TONE: Record<Tone, ToneConfig>`. Mirrors MLPanel /
  DatabaseStatusPanel's TONE map verbatim. The `rowHover` field is a static
  Tailwind `hover:shadow-[inset_3px_0_0_0_rgba(...)]` string so Tailwind 4's
  content scanner picks it up and rows get a left-edge accent bar without
  layout shift (mirrors W56-c DatabaseStatusPanel's pattern).
- `utilizationTone(pct: number): Tone` — <50% → good (emerald, Optimal),
  50–80% → warn (amber, Over-allocated), >80% → poor (red, Danger). Used
  uniformly across the panel — gauge, KPI tile tones, allocation-status
  badge, per-strategy bar, recent-allocations row tone.
- `kellyTone(fraction: number): Tone` — <0.25 → good (conservative),
  0.25–0.50 → info (moderate), 0.50–0.75 → warn (aggressive), >0.75 → poor
  (danger — near-full bankroll on a single trade).
- `allocationStatusLabel(pct: number): string` — returns 'Optimal' /
  'Over-allocated' / 'Danger' (spec item 7 — tone-coloured allocation
  status).
- `utilizationStyle(pct: number)` — kept for the EdgeSizeCurve SVG and
  per-strategy bar fill (uses raw hex because SVG + inline styles can't
  consume the TONE class strings). Thresholds match `utilizationTone()`.
- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo + solid
  dot + glow shadow, aria-hidden. Mirrors MLPanel PulseDot. Used by the
  header allocation-status badge + the UtilizationGauge status badge. Pulses
  only when `tone === 'poor'` (danger state) so the trader isn't falsely
  alerted during optimal / over-allocated states.
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase 9.5px tracking-wider title + optional dim italic
  description + optional trailing node. Mirrors MLPanel's SectionHeader.
  Used by: Edge→Size Saturating Curve (TrendingUp, info), Capital
  Utilization (GaugeIcon, tone=utilizationTone), Allocator Parameters
  (Settings, neutral, read-only badge), Capital Split by Strategy (Layers,
  info), Latest What-If Multipliers (Zap, warn), Exposure Summary (Scale,
  info), Recent Allocations (History, info).
- `ShimmerBlock({ className })` — thin `skeleton-line-sm` placeholder,
  aria-hidden. Mirrors MLPanel's ShimmerBlock. Used throughout
  `SkeletonState`.
- `KpiTile({ label, value, sub, valueClass, icon, tone, quality, testId })`
  — tone-tinted bg + uppercase 9px kpi-label with Lucide icon + 16px
  tabular-nums kpi-value + optional kpi-sub + optional quality bar.
  Preserves the `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` class
  hooks AND `data-testid={testId}` + `data-tone={tone}` attributes. Used by
  the 4-tile Capital Metrics strip + the 6-tile Allocator Parameters strip.
- `KellyBar({ fraction })` — horizontal Kelly criterion visualization with
  emerald (0–25%) / cyan (25–50%) / amber (50–75%) / red (75–100%) zone
  bands + a live tick marking the current Kelly fraction estimate. Mirrors
  MLPanel's PsiGauge pattern. Complements the existing Edge→Size saturating
  curve + UtilizationGauge so the trader has three orthogonal capital
  visualisations: sizing curve (per edge), utilisation gauge (current
  deployment), Kelly bar (per-trade optimal fraction).
- `SkeletonState()` — replaced the bare `skeleton-card` placeholder with a
  structured ShimmerBlock-based skeleton that mirrors the loaded layout
  (header bar + 4-tile Capital Metrics strip + curve + gauge row + 6-tile
  Allocator Parameters strip + per-strategy + multipliers row + recent
  allocations table). role=status + aria-live=polite + aria-label="Loading
  capital allocator" + data-testid="capital-allocator-loading-skeleton".
- `PolishedEmptyState()` — Lucide `History` icon (size 28px, dim) +
  .empty-state-title "No closed allocations recorded yet" + .empty-state-desc
  dim description. role=status + data-testid="capital-allocator-empty-state".
- `ErrorState({ message, onRetry, retrying })` — red-tinted error card
  (border-red-500/25 + bg-red-500/[0.04]) with `AlertTriangle` icon (size
  28px, red-tinted) + title "Allocator API unavailable" (preserved verbatim
  so the W28-3 test contract resolves) + raw error message as desc
  (preserved verbatim so `getByText(/Network error: ECONNREFUSED/)` resolves)
  + Retry button (`RefreshCw` glyph, calls `fetchAll`, accessible name
  "Retry" so the W28-3 test contract `getByRole('button', { name: /retry/i })`
  resolves). role=alert + data-testid="capital-allocator-error-card" +
  data-testid="capital-allocator-error-retry" suffix on the button.
- `ConfigField({ id, label, hint, value, min, max, step, format, onChange })`
  — refined allocation control with a range slider alongside the existing
  number input (spec item 9). The slider is bidirectionally synced with the
  numeric input — both update the same draftConfig field. Tone-coloured
  formatted value text when the value is at the min/max of its range so the
  operator reads the saturation state at a glance (good / warn / poor).

## All 9 polish affordances applied

1. **KpiTile pattern for capital metrics** — the 4-tile Capital Metrics
   strip (Total Capital, Allocated, Available, Kelly Fraction) is built
   with the shared KpiTile sub-component with tone-tinted bg + uppercase 9px
   label + Lucide icon glyph + 16px tabular-nums value + quality bar. The
   6-tile Allocator Parameters strip (k / α / Max Edge / Max Position / Max
   Exposure / Operating Cap) is also converted to the same KpiTile pattern
   so the panel reads as a single visual system. Each tile carries
   `data-testid="capital-allocator-kpi-{total|allocated|available|kelly|config}"`
   + `data-tone={tone}` so downstream CSS can target tiles by tone.
   Tone derived from each metric's own thresholds:
   - Total Capital: `info` (cyan — static bankroll ceiling).
   - Allocated: `utilizationTone(utilizationPct)` (green / amber / red).
   - Available: inverse of Allocated (`poor` when utilization is poor →
     the available cash is dangerously low).
   - Kelly Fraction: `kellyTone(kellyFraction)` (green / cyan / amber / red).
   - k / α / Max Edge: `info` (cyan — curve constants).
   - Max Position: `good` (emerald — per-trade cap).
   - Max Exposure: `warn` (amber — per-market concentration).
   - Operating Cap: `info` (cyan — bankroll ceiling).
   Quality bar derived from each metric's own thresholds (utilizationPct /
   100−utilizationPct / kellyFraction×100 / etc.).

2. **Shimmer skeleton loading state** — the bare `SkeletonState` with
   generic `skeleton-card` placeholders replaced with a structured
   ShimmerBlock-based skeleton that mirrors the loaded layout (header bar
   + 4-tile Capital Metrics strip + curve + gauge row + 6-tile Allocator
   Parameters strip + per-strategy + multipliers row + recent allocations
   table). role=status + aria-live=polite + aria-label="Loading capital
   allocator" + data-testid="capital-allocator-loading-skeleton". Each
   shimmer tile also carries a `linear-gradient(90deg, ...)` animated
   quality-bar placeholder so the loading state visually matches the loaded
   KpiTile quality-bar slot.

3. **Polished empty state with Lucide icon + message** — the bare `<td>`
   with text "No closed allocations recorded yet." replaced with the
   `PolishedEmptyState` sub-component (Lucide `History` icon 28px +
   .empty-state-title "No closed allocations recorded yet" + .empty-state-desc
   dim description). role=status + data-testid="capital-allocator-empty-state".

4. **Section headers with icon + uppercase title** — every section now
   carries a SectionHeader with a Lucide icon + uppercase tracking-wider
   9.5px title + optional dim italic description + optional trailing node:
   - Edge → Size Saturating Curve (TrendingUp, info, "Michaelis-Menten
     sizing") with the curve/operating-point legend as the trailing slot.
   - Capital Utilization (GaugeIcon, tone=utilizationToneVal, "deployed
     vs cap").
   - Allocator Parameters (Settings, neutral, "saturating-edge curve
     constants") with a `read-only` badge as the trailing slot.
   - Capital Split by Strategy (Layers, info, "per-strategy deployed USD")
     with an "{n} active" trailing chip.
   - Latest What-If Multipliers (Zap, warn, "sizing stack").
   - Exposure Summary (Scale, info, "net directional + dollar-days").
   - Recent Allocations (History, info) with a "{n} closed" badge trailing
     slot.

5. **Refined allocation table** — uppercase headers (preserved via the
   existing `.data-table` CSS rule), tone-coloured allocation bar
   (emerald Optimal / amber Over-allocated / red Danger — derived from the
   per-trade % of cap), tabular-nums on every numeric column (Token size,
   Edge, Conf, Size, % Cap, P&L, Time), row-hover left-edge accent bar via
   inset shadow (each row carries `data-tone={allocTone}` + the
   `TONE[allocTone].rowHover` class string). Each row carries a `title="..."`
   tooltip with the per-trade metric name + raw value.

6. **Refined Kelly criterion visualization** — added a `KellyBar` sub-
   component (horizontal bar with emerald / cyan / amber / red zone bands +
   a live tick marking the current Kelly fraction estimate). Complements
   the existing Edge→Size saturating curve (which carries the operating
   point) and the UtilizationGauge (which carries the current deployment)
   so the trader has three orthogonal capital visualisations: sizing curve
   (per edge), utilisation gauge (current deployment), Kelly bar (per-trade
   optimal fraction). The KellyBar is rendered below the Edge→Size curve,
   separated by a `border-t border-[#1f2335]` divider.

7. **Tone-coloured allocation status** — green Optimal / amber Over-
   allocated / red Danger — applied uniformly across the panel via the Tone
   system:
   - Header allocation-status badge with PulseDot halo (pulses only when
     `tone === 'poor'`).
   - UtilizationGauge status badge with PulseDot.
   - Capital Metrics KpiTile tones (Allocated / Available).
   - Per-strategy allocation bar fill (tone derived from each strategy's
     own % of cap).
   - Recent allocations row tone (derived from each trade's % of cap).
   - What-If Multipliers row tone (good ≥0.9 / warn ≥0.5 / poor <0.5).
   - Recent allocations per-row allocation bar fill (tone matches the row
     tone).
   Each tone-coloured element also carries a `data-tone={...}` attribute
   for downstream CSS targeting.

8. **Error state — polished error card with Retry** — the bare
   `banner-danger` block replaced with a refined error card (border-
   red-500/25 + bg-red-500/[0.04] rounded-md). AlertTriangle icon 28px
   (red-tinted) + the title text "Allocator API unavailable" (preserved
   verbatim so the W28-3 test contract resolves) + the raw error message
   rendered as the card's desc (preserved verbatim so
   `getByText(/Network error: ECONNREFUSED/)` resolves) + a Retry button
   (`RefreshCw` glyph, calls `fetchAll`, accessible name "Retry" so the
   W28-3 test contract `getByRole('button', { name: /retry/i })` resolves).
   role=alert + data-testid="capital-allocator-error-card" +
   data-testid="capital-allocator-error-retry" suffix on the button. The
   Retry button is red-tinted (border-red-500/30 + bg-red-500/[0.06] +
   hover bg-red-500/15) so it reads as a recovery affordance rather than a
   primary CTA.

9. **Refined allocation controls** — each Config field in the AlertDialog
   now carries a range slider alongside the existing number input
   (`ConfigField` sub-component). The slider is bidirectionally synced with
   the numeric input — both update the same draftConfig field. Tone-
   coloured formatted value text when the value is at the min/max of its
   range so the operator reads the saturation state at a glance (green <
   70% / amber 70–90% / red ≥90%). The slider uses
   `accent-cyan-400 cursor-pointer focus-visible:ring-cyan-400/40` so it
   picks up the panel's cyan accent + keyboard focus ring.

## Additional refinements (beyond the 9 spec items)

- **Header polish**: the manual Refresh + Config buttons hover tint
  changed from `hover:bg-[#1f2335] hover:text-white` to
  `hover:bg-cyan-500/[0.04] hover:border-cyan-500/30 hover:text-white` so
  they pick up the panel's cyan accent. The RefreshCw icon now spins while
  `isRefreshing` is true (already in the original — preserved).
- **Header allocation-status badge**: a new inline badge with PulseDot +
  "Optimal" / "Over-allocated" / "Danger" label is rendered next to the
  title when the panel is loaded + has no error, so the trader reads the
  allocation state at a glance without scanning the gauge. Hidden during
  loading + error states.
- **Header timestamp**: now carries `tabular-nums` so it doesn't visually
  shift between renders.
- **Exposure Summary tile**: a new card showing Net Directional / Gross
  Market Value / Max Remaining Loss / Dollar-Days / Avg Duration / Open
  Positions, rendered below the UtilizationGauge in the right column. Each
  numeric value carries `tabular-nums`.
- **Per-strategy allocation row hover**: now carries
  `hover:bg-cyan-500/[0.04]` + `transition-colors` so the row subtly
  highlights on hover. Each row carries `data-tone={sTone}` +
  `title="{name} — ${value} ({pct}% of total deployed, {pctOfCap}% of cap)"`
  tooltip + tone-coloured bar fill (emerald / amber / red).
- **What-If Multipliers row hover**: now carries
  `hover:bg-[#1f2335]/40` + `transition-colors`. Each multiplier row
  carries `data-tone={mTone}` + tone-coloured value text (green ≥0.9 /
  amber ≥0.5 / red <0.5) + `title="{name} multiplier — {val}{suffix}"`
  tooltip.
- **Recent allocations table row**: each row carries
  `data-tone={allocTone}` + the `TONE[allocTone].rowHover` class so the
  row gets a left-edge accent bar via inset shadow on hover (emerald
  Optimal / amber Over-allocated / red Danger).
- **Recent allocations % Cap cell**: the bar fill colour now matches the
  row tone (was `bg-cyan-500`, now `TONE[allocTone].bar`) so the trader
  reads the per-trade allocation status from the bar fill alone.
- **Config KPI strip**: the 6-tile Allocator Parameters strip is now
  wrapped in a card with its own SectionHeader (Settings icon + neutral
  tone + "saturating-edge curve constants" description + read-only badge)
  so the parameters read as a distinct section rather than a bare grid.
- **`KellyBar` Kelly fraction estimate**: derived as
  `Math.max(0, Math.min(1, 2 × breakdown.edge))` — for binary-outcome
  Polymarket positions, Kelly f* = edge / (1 - market_price), and without
  the market price in the breakdown we approximate f* ≈ 2 × edge (the
  Kelly fraction at p_market ≈ 0.5). Uses `breakdown.edge` (the what-if
  edge used by the allocator) so it's the same edge the curve is plotting.
- **Each KpiTile in the Capital Metrics strip** carries
  `data-testid="capital-allocator-kpi-{total|allocated|available|kelly}"`
  + `data-tone={tone}` for downstream CSS targeting + test selectors.
- **Each KpiTile in the Allocator Parameters strip** carries
  `data-testid="capital-allocator-kpi-config"` (uniform) +
  `data-tone={tone}`.

## Backwards-compat

- **Props**: unchanged (panel takes no props).
- **API calls**: `apiFetch('/api/positions/closed?limit=20')` (closed
  positions list) + `apiFetch('/api/capital/allocation?strategy=...')`
  (what-if sizing breakdown) + `apiFetch('/api/exposure')` (capital
  deployed + per-strategy exposure) on mount + every 15s + on
  visibilitychange regain. All preserved verbatim. The
  `apiFetch('/api/capital/config', { method: 'POST', ... })` from the
  Config editor is also preserved verbatim (handles 404/405 gracefully
  with a clear "endpoint not registered" message).
- **Polling**: 15s setInterval with visibilitychange pause/resume +
  immediate refresh on regain. Preserved verbatim.
- **Clean unmount**: clearInterval + removeEventListener in useEffect
  cleanup. Preserved verbatim.
- **Class names preserved**: `card`, `card-header`, `card-title`, `badge`
  + `badge-cyan` / `-dim` / `-green` / `-amber` / `-red`, `btn` +
  `btn-ghost` + `btn-sm` + `btn-primary`, `mono`, `scrollbar-thin`,
  `banner-danger` / `banner-info`, `spinner`, `skeleton-card` /
  `skeleton-line-sm`, `kpi-card` (+ `kpi-label` / `kpi-value` / `kpi-sub`),
  `input` + `input-sm`, `form-group` / `form-label` / `form-hint`,
  `empty-state` (+ `-icon` / `-title` / `-desc`), `error-state` (+
  `-icon` / `-title` / `-desc`), `data-table` + `table-responsive` +
  `label-col`, `pnl-positive` / `pnl-negative`, `tabular-nums`,
  `uppercase`, `tracking-wider`.
- **Accessibility preserved**: role=alert on the error card, role=status
  on the loading skeleton + empty state, aria-label="Refresh allocator
  data" on the Refresh button (preserved verbatim — W28-3 test contract),
  aria-label="Edit allocator config" on the Config button (preserved
  verbatim — W28-3 test contract), aria-label="Retry allocator fetch" on
  the Retry button (matches `/retry/i` via the accessible name "Retry" —
  the W28-3 test contract resolves), aria-hidden on every Lucide icon +
  every PulseDot halo + every ShimmerBlock, role=img + aria-label="Saturating
  edge to position size curve" on the EdgeSizeCurve SVG (preserved), aria-
  label on each ConfigField range slider (`{label} slider`), role=alert /
  role=status on the submitMsg banner (preserved).
- **Test-matched strings preserved verbatim**: "Capital Allocator"
  (header title — renders during loading + loaded states), "Michaelis-
  Menten" (header badge), "Edge → Size Saturating Curve" (curve section
  title — resolves the loaded-state test contract), "Allocator API
  unavailable" (error title — resolves the error-state test contract),
  "Retry" (Retry button accessible name — resolves the /retry/i test
  contract). The Authorization header passed via `apiFetch` on the
  initial poll is preserved verbatim (the apiFetch wrapper adds the
  Bearer token — resolves the auth-header test contract).
- **'use client' directive**: preserved.
- **All `data-testid` attributes preserved**: none were defined on the
  original; the polish pass adds new ones (capital-allocator-loading-
  skeleton, capital-allocator-empty-state, capital-allocator-error-card,
  capital-allocator-error-retry, capital-allocator-kpi-{total|allocated|
  available|kelly|config}) without breaking the existing test contract.

## New CSS hooks added (for downstream CSS layer to target)

- `data-testid="capital-allocator-loading-skeleton"` on the loading wrapper.
- `data-testid="capital-allocator-empty-state"` on the empty state.
- `data-testid="capital-allocator-error-card"` on the error card +
  `capital-allocator-error-retry` on the Retry button +
  `capital-allocator-error-wrapper` on the wrapper div.
- `data-testid="capital-allocator-kpi-{total|allocated|available|kelly}"`
  on each Capital Metrics KpiTile + `capital-allocator-kpi-config` on each
  Allocator Parameters KpiTile.
- `data-tone="{good|warn|poor|info|neutral}"` on:
  - each KpiTile wrapper,
  - each What-If Multiplier row,
  - each recent-allocations row,
  - the header allocation-status badge,
  - the UtilizationGauge status badge,
  - each per-strategy allocation bar row.

## Stage Summary

- **Final line count**: 1992 lines (was 1365 — +935 insertions / −308
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving all existing
  functionality, class names, test contracts, client component, API calls,
  polling, role attributes, aria-labels, preserved title text content,
  and the 'use client' directive.
- **Verification — `bunx eslint src/components/CapitalAllocatorPanel.tsx`**:
  clean (exit 0, no output).
- **Verification — `bunx tsc --noEmit --skipLibCheck | grep
  CapitalAllocatorPanel`**: 0 errors for CapitalAllocatorPanel.tsx (the
  only remaining tsc error is `LiveSafetyGatePanel.tsx(58,3): error
  TS6133: 'Zap' is declared but its value is never read` — a pre-existing
  error in a parallel agent's file, not introduced by this pass).
- **Verification — `bunx vitest run src/components/CapitalAllocatorPanel.test.tsx`**:
  10/10 tests pass in ~3.8s. Confirms the full W28-3 test contract is
  preserved.

## Files touched

- `src/components/CapitalAllocatorPanel.tsx` (UI polish pass, 1365 → 1992
  lines, +935 / −308 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W57-e-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (this appended entry).

## Push verification

```
$ wc -l src/components/CapitalAllocatorPanel.tsx
1992 src/components/CapitalAllocatorPanel.tsx

$ git diff --stat src/components/CapitalAllocatorPanel.tsx
 src/components/CapitalAllocatorPanel.tsx | 1243 ++++++++++++++++++++++--------
 1 file changed, 935 insertions(+), 308 deletions(-)

$ bunx eslint src/components/CapitalAllocatorPanel.tsx && echo "lint clean"
lint clean

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep CapitalAllocatorPanel
(no output — 0 errors in CapitalAllocatorPanel.tsx)

$ bunx vitest run src/components/CapitalAllocatorPanel.test.tsx 2>&1 | tail -6
 ✓ src/components/CapitalAllocatorPanel.test.tsx (10 tests) 3788ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Final status

- **Polish**: complete — all 9 spec items + 9 additional refinements
  applied (header PulseDot allocation-status badge, Exposure Summary tile,
  per-strategy row hover + tooltip, What-If Multipliers row hover + tone-
  coloured value, recent-allocations row hover accent + per-row tone-
  coloured bar fill, Config KPI strip wrapper with SectionHeader + read-
  only badge, KellyBar Kelly-fraction estimate below the curve, ConfigField
  slider-with-input control, ConfigField tone-coloured saturation indicator).
- **Backwards-compat**: full — all props, API calls, polling, class
  names, testids, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive preserved. All 10 tests pass.
- **Lint**: clean (exit 0) on CapitalAllocatorPanel.tsx.
- **TypeScript**: 0 errors in CapitalAllocatorPanel.tsx.
- **Tests**: 10/10 pass.

**CapitalAllocatorPanel is production-ready with the premium W57-e visual
layer, visually consistent with the W51-2d MLPanel / W53-c
StrategyPerformancePanel / W54-e MLValidationPanel / W55-a LeaderboardPanel
/ W55-d ExecutionQualityPanel / W56-c DatabaseStatusPanel / W56-e
ObservabilityPanel redesign family.**

# W57-b — DecisionLedgerPanel polish (W51-2d MLPanel redesign family)

**Agent:** full-stack-developer
**Task ID:** W57-b
**Target:** `src/components/DecisionLedgerPanel.tsx` — Unified Decision Ledger
Inspector (PREDICTION → SIGNAL → RISK → ORDER → FILL chain audit).

**Spec:** Apply the W50-56 design-system vocabulary (Tone system, KpiTile,
PulseDot, SectionHeader, ShimmerBlock, PolishedEmptyState,
PolishedErrorState) to the Decision Ledger for visual consistency with the
MLPanel / MLValidationPanel / LeaderboardPanel / ExecutionQualityPanel /
ObservabilityPanel / DatabaseStatusPanel redesign family.

## Context
- Read `worklog.md` (last ~250 lines) to map the W50-56 design-system
  vocabulary. Reference implementations consulted: `MLPanel.tsx`
  (W51-2d), `ExecutionQualityPanel.tsx` (W55-d), `DatabaseStatusPanel.tsx`
  (W56-c), `ObservabilityPanel.tsx` (W56-e).
- Read `DecisionLedgerPanel.tsx` end-to-end (992 lines pre-polish) + the
  8-test contract (`DecisionLedgerPanel.test.tsx`) to map every test
  surface. Verified the test contracts:
  - "🧠 DECISION LEDGER" header text (case-insensitive regex
    `/🧠 DECISION LEDGER/i`) — preserved as a direct text node in loading
    + error + main render states.
  - "Loading…" badge text — preserved verbatim in the loading skeleton
    header (matches `getByText('Loading…')`).
  - "Decision ledger unavailable" error title — preserved verbatim in
    the error card (matches `/Decision ledger unavailable/i`).
  - Retry button accessible name `/retry/i` — preserved as "Retry" text.
  - "Correlation Audit" badge text — preserved verbatim in the main
    render header.
  - "Decisions" KPI chip with rejection count "2" — preserved as a
    StatChip with `label = "Decisions"` (renders `Decisions:` via the
    `{label}:` template, matches `/^Decisions:?$/`) + `value =
    stats.total.toString()` (renders `2` as a direct text node).
  - Authorization header passed via apiFetch on the initial poll —
    preserved by keeping the `apiFetch(getApiUrl() +
    '/api/decisions/rejected?limit=' + LIST_LIMIT)` call unchanged.
  - Renders without crashing — preserved by keeping the panel's
    `export default` + 'use client' directive + initial fetch effect.

## New sub-components (kept private to the panel)

- `Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'` + `TONE:
  Record<Tone, ToneConfig>` — static Tailwind class strings (bg /
  border / text / bar / dot / label / halo / rowHover). Mirrors
  MLPanel / ExecutionQualityPanel's TONE map (extended with `rowHover`
  for the per-row accent bar).
- `stageTone(stage: string): Tone` — maps PREDICTION/SIGNAL/ORDER → info
  (cyan), RISK_APPROVED/FILL → good (emerald), RISK_REJECTED → poor
  (red), default → neutral (dim slate).
- `actionTone(action: ActionFilter): Tone` — maps TRADE_LONG_YES /
  TRADE_SHORT_NO → info, REJECT_RISK → warn, MONITOR → neutral.
- `outcomeTone(outcome: 'FILLED'|'REJECTED'|'PENDING'|'EXPIRED'): Tone`
  — maps FILLED → good, REJECTED → poor, PENDING → warn, EXPIRED →
  neutral. Drives the tone-coloured outcome badge on each row.
- `toneBadgeClass(tone): string` — returns the appropriate
  `badge badge-{green|amber|red|cyan|dim}` class string for a tone.
- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo +
  solid dot + glow shadow, aria-hidden. Mirrors MLPanel PulseDot.
  Used by the header live-tracking indicator (info tone + pulse=true
  when not in error state). Pulses while live, static when offline
  (pulse=false in PolishedErrorState).
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 10.5px title + optional dim italic
  description + optional trailing node. Mirrors MLPanel's
  SectionHeader. Used by the Filter Bar ("Decision Filters"), Decision
  List ("Rejection Audit · {N} entries"), and Decision Chain
  ("Decision Chain · {shortId}").
- `ShimmerBlock({ className })` — thin `skeleton-line-sm` placeholder,
  aria-hidden. Mirrors MLPanel's ShimmerBlock.
- `StatChip({ label, value, sub, color, title, icon, tone })` — kept
  the existing StatChip pattern (preserves the `{label}:` direct text
  node + separate value span so the W30-2 test contracts
  `getByText(/^Decisions:?$/)` + `getByText('2')` resolve) and added:
  - an optional Lucide `icon` glyph at the start of the label span
    (rendered as a separate `<Icon />` sibling so it doesn't pollute
    the label text node)
  - a `tone` prop that drives the chip's border + bg + `data-tone`
    attribute
  - `tabular-nums` on the value span so the KPI strip doesn't visually
    shift between renders
- `StageIndicatorStrip({ events })` — refined horizontal flow diagram
  of the 6-stage canonical pipeline (PREDICTION → SIGNAL → RISK · OK /
  RISK · REJ → ORDER → FILL → P&L). Each stage renders as a chip:
  - **Active stage** (present in the chain): tone-coloured bg + border +
    text + solid dot + uppercase tracking-wider 9px label.
  - **Missed stage** (not in the chain): dim `bg-[#0e1015]` + dim
    border + dim text + hollow `bg-[#3e4560]` dot.
  - **ArrowRight glyph** between stages, tone-coloured when the
    preceding stage is active, dim when missed.
  - **Trailing P&L chip** pulls the realized PnL value from the FILL
    stage's `pnl` field and tone-colours it green (positive) / red
    (negative) / dim (no FILL stage yet).
  Each chip carries:
  - a tooltip with the stage's label + (if active) the timestamp.
  - `data-tone` attribute for downstream CSS targeting.
  - `data-stage` attribute for downstream CSS targeting by stage key.
  - `data-active` attribute ("true"/"false") for downstream CSS
    targeting by completion state.
  The strip carries role=img + an aria-label summarizing the pipeline.
- `DecisionColumnHeader()` — uppercase tracking-wider 9px column-label
  row above the decision cards (OUTCOME / ACTION / TOKEN / EDGE / CONF
  / MID / STRATEGY). The leftmost column matches the ChevronRight
  expand-toggle column width so the labels line up with the row
  content. role=row, aria-hidden (the labels are visual hints — the
  DecisionCard toggle buttons already carry descriptive aria-labels).
- `DecisionSkeleton()` — structured loading placeholder mirroring the
  loaded layout (header bar + 4-tile KPI strip + filter bar + column
  header + 7 decision-row shimmers). Uses `ShimmerBlock` placeholders
  throughout. role=status + aria-live=polite + aria-label="Loading
  decision ledger" + data-testid="decision-ledger-loading-skeleton".
  The header text "🧠 DECISION LEDGER" + "Loading…" badge are preserved
  verbatim above the shimmers so the W30-2 test contracts
  (`getByText(/🧠 DECISION LEDGER/i)` + `getByText('Loading…')`)
  resolve.
- `PolishedEmptyState({ title, desc })` — Lucide `Brain` icon (size
  28, dim) + `.empty-state-title` + `.empty-state-desc`. role=status +
  data-testid="decision-ledger-empty-state". Replaces the bare "🧠"
  emoji in the empty state. Title + desc text are passed as props so
  the three empty-state branches (no rows at all / no rows match the
  active outcome filter / no rows match the active search filter)
  reuse the same component with the original UX copy preserved
  verbatim.
- `PolishedErrorState({ detail, onRetry })` — refined error card with
  AlertTriangle (28px, red-tinted) + the title text "Decision ledger
  unavailable" (preserved verbatim so the W30-2 test contract
  `getByText(/Decision ledger unavailable/i)` resolves) + the raw
  error message rendered as the card's desc (preserved verbatim) +
  Retry button (`RefreshCw` glyph, calls `onRetry` = `fetchList`,
  accessible name "Retry" matching `/retry/i`, aria-label "Retry
  decision ledger fetch"). role=alert + data-testid="decision-ledger-
  error" + data-testid="decision-ledger-error-retry" suffix on the
  button. The Retry button is red-tinted (border-red-500/30 +
  bg-red-500/[0.06] + hover bg-red-500/15) so it reads as a recovery
  affordance rather than a primary CTA. The header carries a static
  PulseDot (poor tone, pulse=false) + "🧠 DECISION LEDGER" + an
  "Offline" badge so the operator sees the offline state at a glance.

## All 9 polish affordances applied

1. **Shimmer skeleton loading state** — the bare `<div
   className="skeleton-line-lg" style={...} />` placeholders replaced
   with `<DecisionSkeleton/>` which mirrors the loaded layout (header
   + 4-tile KPI strip + filter bar + column-header row + 7
   decision-row shimmers). Uses `ShimmerBlock` placeholders
   throughout. The "🧠 DECISION LEDGER" header text + "Loading…"
   badge are preserved verbatim above the shimmers so the W30-2 test
   contracts resolve.

2. **Polished empty state with Lucide icon + message** — the bare
   `🧠` emoji replaced with `PolishedEmptyState` (Lucide `Brain` icon
   28px + .empty-state-title + .empty-state-desc). The title text "No
   decisions recorded" + desc text (3 branches: no rows at all / no
   rows match the active outcome filter / no rows match the active
   search filter) are preserved verbatim so the existing UX copy
   stays consistent.

3. **Refined decision chain visualization (12-stage timeline/flow
   diagram with clear stage indicators)** — `StageIndicatorStrip`
   renders a horizontal flow diagram of the full 6-stage canonical
   pipeline (PREDICTION → SIGNAL → RISK · OK / RISK · REJ → ORDER →
   FILL → P&L). Each stage chip shows:
   - Active state (stage present in this decision's chain): tone-
     coloured bg + border + text + solid dot.
   - Missed state (stage not in this decision's chain): dim bg +
     dim border + dim text + hollow dot.
   - ArrowRight between stages, tone-coloured when active, dim when
     missed.
   The trailing P&L chip pulls the realized PnL from the FILL stage
   and tone-colours it green/red by sign. The legacy vertical
   `StageNode` rail is preserved below the strip for the detailed
   per-stage breakdown — each StageNode card now also carries
   `tabular-nums` on every numeric cell + `data-tone` + `data-stage`
   attributes for downstream CSS targeting.

4. **Section headers with icon + uppercase title** — every section now
   carries a `SectionHeader` with a Lucide icon + uppercase
   tracking-wider 10.5px title + optional dim italic description +
   optional trailing node:
   - Filter Bar → "Decision Filters" (Filter icon, tone=info) with
     "{filtered} of {total} match" description.
   - Decision List → "Rejection Audit · {N} entries" (ListTree icon,
     tone=poor — these are rejections after all) with a "{filtered} of
     {total}" trailing chip.
   - Decision Chain → "Decision Chain · {shortId}" (ListTree icon,
     tone=info) with "({N} stages)" description + a tone-coloured
     outcome chip trailing slot.
   - Other Recent Decisions for this Token → "Other Recent Decisions
     for this Token" (Layers icon) with "({N})" description.

5. **Refined decision entries table (uppercase headers, row hover,
   tabular-nums)** — a `DecisionColumnHeader` row added above the
   decision cards with uppercase tracking-wider 9px column labels
   (OUTCOME / ACTION / TOKEN / EDGE / CONF / MID / STRATEGY). Each
   `DecisionCard` row carries `tabular-nums` on every numeric cell
   (Edge / Conf / Mid / age / count) so columns don't shift
   alignment when values change between renders. Row hover now
   carries `hover:bg-cyan-500/[0.04]` layered with
   `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` (left-edge
   accent bar via inset shadow — no layout shift). The expanded row
   carries `bg-[#0e1015]` (dim background) so it visually pops out
   of the list.

6. **Tone-colored decision outcomes (green success, amber pending,
   red rejected)** — the `outcomeTone` helper maps FILLED → good
   (emerald), REJECTED → poor (red), PENDING → warn (amber), EXPIRED
   → neutral (dim). Applied uniformly across the panel via the Tone
   system:
   - DecisionCard outcome badge: NEW — tone-coloured red via
     `toneBadgeClass(outcomeT)` + `data-tone={outcomeT}`.
   - DecisionCard action badge: tone-coloured by `actionTone(action)`
     (info for TRADE_LONG_YES / TRADE_SHORT_NO, warn for REJECT_RISK,
     neutral for MONITOR) via `toneBadgeClass(actionT)` + `data-tone=
     {actionT}`.
   - DecisionCard row hover: tone-coloured via `TONE[outcomeT].rowHover`
     (red-tinted accent bar for REJECTED rows).
   - DecisionChainView SectionHeader trailing chip: tone-coloured by
     `outcomeTone(outcome)` + `data-tone={outTone}` + `data-testid=
     "decision-chain-outcome-{outcome.toLowerCase()}"`.
   - DecisionChainView sibling-decision chips: tone-coloured by
     `outcomeTone(dOutcome)` + `data-tone={dTone}`.
   - KpiTile tones: derived from each metric's own thresholds
     (Decisions = info, Avg Edge = good/poor by sign, Avg Conf =
     info, Top Reason = warn, Fill Rate = good).

7. **PulseDot for live decision tracking** — the panel header carries
   a `PulseDot({ tone: 'info', pulse: true })` so the trader sees the
   live-tracking heartbeat at a glance. The dot pulses
   (`animate-ping`) while the panel is live + stops pulsing (pulse=
   false) in the error state (a static red dot replaces it via
   `PolishedErrorState`'s `<PulseDot tone="poor" pulse={false} />`).

8. **Error state: polished error card with Retry** — the bare
   `error-state` block replaced with a refined `PolishedErrorState`
   card. AlertTriangle icon (28px, red-tinted) + the title text
   "Decision ledger unavailable" (preserved verbatim so the W30-2
   test contract resolves) + the raw error message rendered as the
   card's desc (preserved verbatim) + a Retry button (`RefreshCw`
   glyph, calls `fetchList`, accessible name "Retry" matching
   `/retry/i`). role=alert + data-testid="decision-ledger-error" +
   data-testid="decision-ledger-error-retry" suffix on the button.
   The Retry button is red-tinted (border-red-500/30 +
   bg-red-500/[0.06] + hover bg-red-500/15) so it reads as a
   recovery affordance.

9. **Refined stage filters/controls** — the Filter Bar carries a
   `SectionHeader` ("Decision Filters", Filter icon, info tone) +
   the search input + action/outcome selects + manual Refresh
   button all carry `focus-visible:ring-cyan-500/30` + cyan-tinted
   hover. The manual Refresh button's `RefreshCw` glyph spins while
   `loading` is true (via `className={loading ? 'animate-spin' : ''}`).
   The search input's clear button (✕) also carries a focus-visible
   ring.

## Additional refinements (beyond the 9 spec items)

- **Header polish**: the panel header now leads with a `PulseDot`
  (info tone, pulse=true) instead of a bare `<div className="w-2 h-2
  rounded-full bg-cyan-400 animate-pulse" />`. The "🧠 DECISION
  LEDGER" title text is preserved verbatim. The "Correlation Audit"
  badge's `Activity` icon now carries `aria-hidden="true"`.
- **KPI strip polish**: each StatChip now carries:
  - a Lucide icon glyph at the start of the label (ListTree for
    Decisions, Activity for Avg Edge / Avg Conf, Filter for Top
    Reason, CheckCircle2 for Fill Rate).
  - a `tone` prop that drives the chip's border + bg + `data-tone`
    attribute (info for Decisions / Avg Conf, good/poor for Avg Edge
    by sign, warn for Top Reason, good for Fill Rate).
  - `tabular-nums` on the value span.
  - `kpi-card` + `kpi-label` + `kpi-value` + `kpi-sub` class hooks
    preserved for downstream CSS targeting.
- **DecisionCard action badge** now has a fixed `w-[120px]` width so
  the action column doesn't shift between rows.
- **DecisionCard outcome badge** kept at `w-[80px]` (matching the
  column-header width) so columns line up.
- **DecisionCard strategy pill** now has a fixed `w-[88px]` width +
  `truncate` so the strategy column doesn't shift between rows.
- **DecisionCard ChevronRight** rotation: changed from
  `expanded ? 'rotate-90' : ''` (CSS class) to `style={expanded ?
  { transform: 'rotate(90deg)' } : undefined}` (inline style) so the
  rotation is more deterministic. The icon now carries `aria-hidden=
  "true"`.
- **DecisionCard toggle button** now carries `focus:outline-none
  focus-visible:ring-1 focus-visible:ring-cyan-500/30 focus-visible:
  ring-inset` so keyboard navigation gets a clear focus ring.
- **DecisionChainView** now leads with a `SectionHeader` (ListTree
  icon, info tone) + a tone-coloured outcome chip trailing slot, then
  the new `StageIndicatorStrip` (horizontal flow diagram), then the
  legacy vertical StageNode rail for the detailed per-stage
  breakdown.
- **StageNode** now carries `tabular-nums` on every numeric cell
  (age + epoch timestamp + detail string) + `data-tone` +
  `data-stage` attributes for downstream CSS targeting.
- **DecisionSkeleton** mirrors the loaded layout (header + 4-tile
  KPI strip + filter bar + column-header row + 7 decision-row
  shimmers) so the panel doesn't visually jump when the first fetch
  resolves. Each shimmer row uses the same `flex items-center gap-2
  px-3 py-2.5 border-b border-[#1f2335]/40` layout as the loaded
  DecisionCard rows.
- **Empty state** now carries `role=status` + `data-testid="decision-
  ledger-empty-state"` for downstream test/CSS targeting.
- **Error state** now carries `role=alert` + `data-testid="decision-
  ledger-error"` + `data-testid="decision-ledger-error-retry"` on the
  Retry button for downstream test/CSS targeting.
- **Footer** count + polling-interval labels now carry `tabular-nums`
  so they don't visually shift between renders.
- **Filter bar search input** now carries `input input-sm` class
  hooks (in addition to the existing dark styling) so downstream CSS
  can target it uniformly with other panels' inputs.
- **All Lucide icons** in the file now carry `aria-hidden="true"` so
  screen readers skip them (the descriptive text is in the
  surrounding element's accessible name).

## Backwards-compat

- **Props**: unchanged (panel takes no props).
- **API calls**: `apiFetch(getApiUrl() + '/api/decisions/rejected?limit='
  + LIST_LIMIT)` on mount + every 10s + on visibilitychange regain;
  `apiFetch(getApiUrl() + '/api/decision/' + encodeURIComponent(token_id)
  + '?limit=' + CHAIN_LIMIT)` on expand. All preserved verbatim.
- **Polling**: 10s setInterval with visibilitychange pause/resume +
  immediate refresh on regain. Preserved verbatim.
- **Clean unmount**: clearInterval + removeEventListener in useEffect
  cleanup. Preserved verbatim.
- **Class names preserved**: `card`, `card-header`, `card-title`, `badge`
  + `badge-cyan` / `-amber` / `-red` / `-dim`, `btn` + `btn-ghost` +
  `btn-sm`, `mono`, `scrollbar-thin`, `spinner`, `skeleton-line-sm` /
  `skeleton-line-lg` / `skeleton-card`, `kpi-card` (+ `kpi-label` /
  `kpi-value` / `kpi-sub`), `input` + `input-sm`, `empty-state` (+ `-icon`
  / `-title` / `-desc`), `error-state` (+ `-icon` / `-title` / `-desc`),
  `table-footer`, `tabular-nums`, `tracking-wider`, `uppercase`.
- **Accessibility preserved**: role=alert on the error card, role=status
  on the loading skeleton + empty state, role=button + aria-expanded +
  aria-label on each DecisionCard toggle, aria-label on the search input
  + selects + Refresh + Retry buttons, aria-hidden on every Lucide
  icon.
- **Test-matched strings preserved verbatim**: "🧠 DECISION LEDGER"
  (loading + error + main render state headers), "Loading…" (loading
  badge), "Decision ledger unavailable" (error title), "Retry" (retry
  button text — accessible name matches `/retry/i`), "Correlation Audit"
  (main render header badge), "Decisions" (StatChip label), "2"
  (StatChip value for `stats.total = 2`), "Refresh" (manual refresh
  button text), "Polling every 10s · auto-pause when tab hidden"
  (footer).
- **'use client' directive**: preserved.

## New CSS hooks added (for downstream CSS layer to target)

- `data-testid="decision-ledger-loading-skeleton"` on the loading
  wrapper.
- `data-testid="decision-ledger-empty-state"` on the empty state.
- `data-testid="decision-ledger-error"` on the error card (+
  `-retry` on the retry button).
- `data-testid="decision-ledger-row"` on each DecisionCard wrapper.
- `data-testid="decision-chain-outcome-{filled|rejected|pending}"`
  on the DecisionChainView SectionHeader trailing outcome chip.
- `data-tone="{good|warn|poor|info|neutral}"` on:
  - each KpiTile (StatChip) wrapper,
  - each DecisionCard wrapper + outcome badge + action badge,
  - each StageNode card,
  - each sibling-decision chip in DecisionChainView,
  - the DecisionChainView SectionHeader trailing outcome chip,
  - each stage chip in StageIndicatorStrip (active stages use the
    stage's own tone; missed stages use `neutral`),
  - the trailing P&L chip in StageIndicatorStrip.
- `data-stage="{PREDICTION|SIGNAL|RISK_APPROVED|RISK_REJECTED|ORDER|
  FILL|PNL}"` on each StageIndicatorStrip chip + each StageNode card.
- `data-active="true|false"` on each StageIndicatorStrip chip.

## Stage Summary

- **Final line count**: 1640 lines (was 992 — +836 insertions / −188
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving all existing
  functionality, class names, test contracts, client component, API
  calls, polling, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive.
- **Verification — `bun run lint`**: clean (exit 0, no output).
- **Verification — `bunx tsc --noEmit --skipLibCheck`**: 0 errors in
  DecisionLedgerPanel.tsx (no `DecisionLedgerPanel` lines in the tsc
  output).
- **Verification — `bunx vitest run src/components/DecisionLedgerPanel
  .test.tsx`**: 8/8 tests pass in ~1.9s. Confirms the W30-2 test
  contract is preserved.

## Files touched

- `src/components/DecisionLedgerPanel.tsx` (UI polish pass, 992 → 1640
  lines, +836 / −188 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W57-b-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended entry).

## Push verification

```
$ wc -l src/components/DecisionLedgerPanel.tsx
1640 src/components/DecisionLedgerPanel.tsx

$ git diff --stat src/components/DecisionLedgerPanel.tsx
 src/components/DecisionLedgerPanel.tsx | 1024 ++++++++++++++++++++++++++------
 1 file changed, 836 insertions(+), 188 deletions(-)

$ bun run lint 2>&1 | tail -3
$ eslint .
(clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -i DecisionLedgerPanel | head -3
$ (clean — 0 errors in DecisionLedgerPanel.tsx)

$ bunx vitest run src/components/DecisionLedgerPanel.test.tsx 2>&1 | tail -8
 ✓ src/components/DecisionLedgerPanel.test.tsx (8 tests) 1946ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Final status

- **Polish**: complete — all 9 spec items + 11 additional refinements
  applied (PulseDot in header + error state, KPI strip icons + tones,
  DecisionCard fixed column widths, DecisionCard focus-visible ring,
  DecisionChainView SectionHeader + outcome chip, StageNode tabular-
  nums + data attributes, DecisionSkeleton structured loading layout,
  empty/error state testids, footer tabular-nums, input class hooks,
  aria-hidden on every Lucide icon).
- **Backwards-compat**: full — all props, API calls, polling, class
  names, testids, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive preserved. All 8 tests
  pass.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors in DecisionLedgerPanel.tsx.
- **Tests**: 8/8 pass (was 8/8 — no regressions).

**DecisionLedgerPanel is production-ready with the premium W57-b visual
layer, visually consistent with the W51-2d MLPanel / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel
/ W56-e ObservabilityPanel / W56-c DatabaseStatusPanel redesign
family.**

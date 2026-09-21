# W53-b — ArbitrageMatrixView.tsx UI polish pass

Agent: full-stack-developer
Task ID: **W53-b**
Target: `src/components/ArbitrageMatrixView.tsx`
Sibling wave: W50-2c → W51-2b → W51-2c → W51-2d → W52-a → W52-b → W52-c → W52-d → **W53-b**

## Context

Read `/home/z/my-project/worklog.md` (last ~250 lines) to map the design-system
vocabulary shipped in W50-52:

- **Tone system** (`positive` / `negative` / `warn` / `neutral`) with
  static Tailwind class strings so Tailwind 4's scanner picks them up.
- **SectionHeader** pattern — Lucide icon + uppercase 9.5px tracking-wider
  bold title in `text-[#5a637a]` + optional dim italic description + optional
  trailing node. Title rendered in its own `<span>` so RTL's `getByText`
  matches just the span (icon SVG has no text content, trailing node is a
  sibling span with its own text).
- **PulseDot** (not needed here — no LIVE/POLL badge on this panel).
- **Shimmer skeleton** using `.skeleton-table` / `.skeleton-row` /
  `.skeleton-cell` classes from globals.css augmented with `.animate-pulse`.
- **Polished empty state** with a Lucide icon + preserved title + preserved
  description copy.
- **Polished error state** — kept the existing `.banner-danger` banner
  (test contract requires role=alert + Retry + Dismiss controls).
- **`tabular-nums`** on every numeric value.
- **`data-tone="{...}"`** hooks for the downstream CSS layer.

Read the existing `ArbitrageMatrixView.tsx` (327 lines, W22-2 origin) and the
26-test contract (`ArbitrageMatrixView.test.tsx`) to map every surface the
polish pass must preserve:

- Panel title text: "High-Frequency Binary Dutch-Book Arbitrage Scanner"
- Badge text: "Paper Mode · $3 Cap"
- Loading caption: "Scanning synchronized binary order books for Dutch-book
  inefficiencies…" (regex `/Scanning synchronized binary order books/i`)
- Empty-state title: "No arbitrage discrepancies found"
- Card header text: "Verified Dutch-Book Pairs (N)" (regex with parens
  — title must live in its own `<span>`)
- KPI labels with colons: "Active Arbs:", "Max Edge:", "Avg Net ROI:"
- Filter input placeholder: "Filter arbitrage by market name..."
- Slider: `getByRole('slider')` — single slider only
- Execute buttons: accessible name `/Execute paper arbitrage on/i`
- Success banner text: "Arbitrage legs successfully executed"
- Failure banner texts: "Risk engine blocked execution" + "Execution
  network request failed"
- W22-1 banner text: "Failed to load arbitrage opportunities (HTTP 500)"
  + "Network error: ECONNREFUSED" + Retry button (regex `/retry/i`) +
  Dismiss button (`aria-label="Dismiss error"`)
- Row cell values: "+32 bps", "+2.45%", "+20 bps", "+1.85%"
- API calls: apiFetch wrapper adding `Authorization: Bearer …` header to
  every fetch; GET `/api/arbitrage/opportunities`; POST
  `/api/arbitrage/execute` with the same JSON body
- Polling: setInterval(fetchOpportunities, 2500); cleared on unmount
- All existing class names: `card`, `card-header`, `card-title`, `badge` +
  `badge-amber`, `btn` + `btn-primary` + `btn-ghost` + `btn-xs` + `btn-sm`,
  `input`, `mono`, `data-table`, `table-container`, `divide-y` +
  `divide-[#1f2335]/50`, `banner-danger`, `empty-state` +
  `empty-state-title` + `empty-state-desc`, `hover:bg-blue-500/10`,
  `scrollbar-thin`, `shadow-2xl`, `bg-[#13161e]`, `border-[#1f2335]`, etc.
- All aria-labels + role attributes preserved.
- 'use client' directive preserved.

Verified empirically that RTL's `getByText` with a substring regex matches
only the deepest element whose direct text-node children concatenate to a
matching string (not parent elements whose textContent includes the
substring transitively through children). This let me safely wrap the card
title in a SectionHeader `<span>` without tripping the multiple-matches
error — the parent SectionHeader div has no direct text node, only an
icon SVG + the title span + the trailing span.

## Built shared inline sub-components (kept private to the panel)

- **`Tone` system** (`positive` / `negative` / `warn` / `neutral`) with
  self-contained class strings (`text` + `dot` + `halo`) — static so
  Tailwind 4's scanner picks them up. Mirrors W52-b Tone but reduced to
  the 4 tones this panel needs (no info/purple here).
- **`SectionHeader`** — Lucide icon + uppercase 9.5px tracking-wider bold
  title in `text-[#5a637a]` + optional dim italic 8.5px description +
  optional trailing node. Title in its own `<span>` so RTL matches the
  span, not the wrapper div.
- **`MatrixSkeleton`** — 5-row shimmer placeholder for the matrix-loading
  state. Mirrors the live 8-column matrix structure with column flex
  weights (3x market + 70/70/80/80/70/70/110 fixed). Uses
  `.skeleton-table` + `.skeleton-row` + `.skeleton-cell` + `.animate-pulse`.
  aria-hidden + role=status + aria-live=polite on the parent wrapper.
- **`EmptyState`** — Lucide `Crosshair` icon + preserved title
  "No arbitrage discrepancies found" + preserved description copy (with
  the dynamic `{minBps}` threshold interpolation). role=status +
  data-testid="arbitrage-matrix-empty".
- **`edgeTier`** helper — tone classification for a row based on its
  gross edge strength (≥25 bps → positive, 10-24 bps → warn, else
  neutral). Drives the `data-tone` + `data-edge-tier` hooks on each row.

## Polish affordances applied

1. **Header** — Lucide `Zap` icon (amber) replaces the bare ⚡ emoji next
   to the panel title. Title text + Paper Mode badge preserved verbatim.
2. **KPI strip** — each KPI value now carries `tabular-nums` (in addition
   to the existing `mono` class) and a `data-tone` hook reflecting the
   underlying metric's sign (positive when non-zero, neutral when zero).
   Each KPI wrapper div also carries `data-tone` + a `title` tooltip
   explaining the metric. The CSV export button embeds a Lucide `Download`
   icon (aria-hidden so the button's accessible name remains "CSV" — no
   test touches this name).
3. **Filter & Execution Controls** — search input gains a Lucide `Search`
   icon positioned absolutely inside the left padding (pl-7) + a focus
   ring (`focus:ring-1 focus:ring-cyan-500/20 focus:border-cyan-500/30`)
   + `transition-colors` + `aria-label="Filter arbitrage by market name"`.
   Min Profit slider value gains `tabular-nums` + `data-tone="positive"` +
   a `title` tooltip. Scan Now button embeds a Lucide `RefreshCw` icon
   (aria-hidden so the accessible name remains "Scan Now" — the W22-2
   test resolves via `getByRole('button', { name: /Scan Now/i })`). Button
   also gains `transition-colors hover:border-[#2d3450]` + a `title`
   tooltip + `aria-label="Scan Now"`.
4. **lastExecuted banner** — refined with Lucide `Check` (success) or
   `AlertTriangle` (failure) icon (aria-hidden). Gains `transition-colors`
   + `data-tone` reflecting the outcome. Dismiss button embeds a Lucide
   `X` icon (aria-hidden) + `aria-label="Dismiss execution banner"` +
   `data-testid="arbitrage-execution-banner"`. All existing class names
   preserved (bg-green-500/10, border-green-500/30, text-green-400,
   bg-red-500/10, border-red-500/30, text-red-400).
5. **fetchError banner** — kept as `.banner-danger` with role=alert (test
   contract requires role=alert). Gains `data-tone="negative"` +
   `data-testid="arbitrage-matrix-error"`. Retry button embeds a Lucide
   `RefreshCw` icon (aria-hidden so the accessible name remains "Retry"
   — the W22-1 test resolves via `getByRole('button', { name: /retry/i })`).
   Dismiss button embeds a Lucide `X` icon (aria-hidden) — its
   `aria-label="Dismiss error"` is preserved verbatim (the W22-1 test
   resolves via `getByRole('button', { name: /dismiss error/i })`).
6. **Opportunities card** — SectionHeader with Lucide `Target` icon +
   title "Verified Dutch-Book Pairs (N)" (preserved verbatim) +
   trailing "Automatic Dual-Leg Order Placement" caption (preserved
   verbatim as a sibling span in the trailing slot).
7. **Loading state** — replaced the bare spinner + text with a Lucide
   `Loader2` (animate-spin, cyan) + the preserved caption "Scanning
   synchronized binary order books for Dutch-book inefficiencies…"
   (wrapped in a `<span className="animate-pulse">` so RTL matches just
   the span — the W22-2 loading test resolves) + a 5-row MatrixSkeleton
   shimmer below. Wrapper carries `role="status"` + `aria-live="polite"`
   + `data-testid="arbitrage-matrix-loading"`.
8. **Empty state** — Lucide `Crosshair` icon (size-8, muted) + preserved
   title "No arbitrage discrepancies found" + preserved description
   copy. role=status + data-testid="arbitrage-matrix-empty".
9. **Matrix table** — table headers gain `uppercase tracking-wider` for
   a unified caption strip. Each numeric cell gains `tabular-nums` (in
   addition to the existing `mono` class) + a `data-tone` hook reflecting
   the cell's semantic meaning:
   - YES Ask → `data-tone="positive"` (green)
   - NO Ask → `data-tone="neutral"` (cyan)
   - Combined Cost → `data-tone="warn"` (amber)
   - Gross Edge → `data-tone="positive"` (green)
   - Net ROI → `data-tone="positive"` (emerald)
   - Max Cap → `data-tone="neutral"` (default text colour)
10. **Opportunity rows** — each row gains `data-tone={edgeTier(...)}` +
    `data-edge-tier="strong"|"standard"` hooks. The first cell (Market
    Contract) gains a subtle hover left-accent bar
    (`border-l-2 border-transparent hover:border-cyan-500/60
    transition-colors`) that lights up on hover. The question text
    preserves its `group-hover:text-cyan-300` colour shift. The execute
    button embeds a Lucide `Zap` icon (when idle) or `Loader2` (when
    routing) — both aria-hidden so the accessible name remains "Execute
    paper arbitrage on …" (preserved verbatim — the W22-2 execute tests
    resolve).

## Verification

- **`bun run lint`**: clean (exit 0, no output).
- **`bunx tsc --noEmit --skipLibCheck`**: 0 errors in `ArbitrageMatrixView.tsx`
  or `ArbitrageMatrixView.test.tsx`. (There is 1 pre-existing TS6133
  error in `src/components/StrategyMatrix.tsx` from a concurrent agent's
  uncommitted work — NOT caused by this pass. Verified by stashing only
  my ArbitrageMatrixView.tsx change and re-running tsc: the StrategyMatrix
  error reproduces identically, confirming it's unrelated to W53-b.)
- **`vitest run src/components/ArbitrageMatrixView.test.tsx`**: 26/26
  tests pass in ~6.1 s. Confirms the full test contract is preserved
  (renders without crashing, panel title, Paper Mode badge, loading
  caption, opportunities table rows, KPI strip with labels + values,
  empty-state, search filter, min-BPS slider filter, execute POST,
  success banner, failure banner [both server + network], Authorization
  header, 2.5 s polling, clean unmount, Scan Now manual trigger, card
  header count, onSelectMarket callback, no-onSelectMarket safety, gross
  edge + net ROI values, W22-1 fetch-error banner [HTTP 500 + network
  error], W22-1 dismiss, W22-1 retry, W22-1 console.error logging).

## Files touched

- `src/components/ArbitrageMatrixView.tsx` (UI polish pass, 327 → 695
  lines, +418 insertions / −50 deletions per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W53-b-full-stack-developer.md` (this
  detailed agent work record).
- `/home/z/my-project/worklog.md` (appended W53-b entry).

## Push verification

```
$ wc -l src/components/ArbitrageMatrixView.tsx
695 src/components/ArbitrageMatrixView.tsx
$ git diff --stat src/components/ArbitrageMatrixView.tsx
 src/components/ArbitrageMatrixView.tsx | 468 +++++++++++++++++++++++++++++----
 1 file changed, 418 insertions(+), 50 deletions(-)
```

## Final status

- **Polish**: complete — Tone system, SectionHeader, shimmer skeleton,
  polished empty + error states, refined controls, tone-coloured matrix
  cells, tabular-nums everywhere, data-tone hooks, hover left-accent bar,
  Lucide icons throughout.
- **Backwards-compat**: full — all props, API calls (apiFetch + GET
  /api/arbitrage/opportunities + POST /api/arbitrage/execute with the
  same JSON body), polling (2.5 s setInterval + clear on unmount), all
  existing class names, all existing testids/aria-labels/role attributes,
  the 'use client' directive, and all 26 tests preserved.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors for ArbitrageMatrixView.tsx (1 pre-existing
  unrelated error in StrategyMatrix.tsx from a concurrent agent).
- **Tests**: 26/26 pass.

**ArbitrageMatrixView is production-ready with the premium W53-b visual
layer, consistent with the W51-2 PositionsPanel / OrdersPanel /
TradesPanel / MLPanel / AIMLCommandCenter family + the W52-a
MarketScreener + W52-b OrderFlowPanel redesigns.**

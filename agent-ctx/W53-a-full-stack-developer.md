# W53-a — Polish StrategyMatrix.tsx (Strategy Registry)

**Task ID**: W53-a
**Agent**: full-stack-developer
**Target file**: `src/components/StrategyMatrix.tsx`
**Test contract**: `src/components/StrategyMatrix.test.tsx` (24 tests, W22-2 + W22-1 origin)

## Context

Read worklog (last ~375 lines) to map the W50-52 design-system vocabulary:
- **Glassmorphism**: card + bg-[#13161e] + border-[#1f2335] surfaces
- **Shimmer skeletons**: `.skeleton-line` / `.skeleton-line-sm` / `.skeleton-line-md`
  / `.skeleton-cell` from globals.css (carry `skeleton-shimmer` keyframe)
- **Tone system**: `data-tone="{positive|negative|warn|neutral}"` attributes
- **Tabular-nums**: `font-variant-numeric: tabular-nums` on all numerics
- **Refined tables**: data-table, table-container, SortIndicator (Lucide ArrowUp/
  ArrowDown at 10px on active column, empty 10px slot on inactive sortable
  columns to prevent layout shift)
- **Row hover accent bar**: `hover:bg-cyan-500/5` + `hover:shadow-[inset_3px_0_0_0_
  rgba(34,211,238,0.65)]` (left-edge accent bar via inset shadow — no layout shift)
- **SectionHeader**: Lucide icon + uppercase 9.5px tracking-wider bold title in
  muted text + optional dim italic description
- **PulseDot**: Tailwind `animate-ping` halo + solid dot + glow shadow

Reference implementations consulted:
- `src/components/MarketScreener.tsx` (W52-a, 1367 lines) — SortIndicator,
  ScreenerSkeletonRows, polished error card, row-hover accent bar
- `src/components/OrderFlowPanel.tsx` (W52-b, 714 lines) — Tone system,
  SectionHeader, PulseDot, ImbalanceSkeleton, DepthErrorCard
- `src/components/PositionsPanel.tsx` (W51-2b, 988 lines) — data-tone hooks
- `src/app/globals.css` lines 1100-1260 (skeleton classes), 1900-1938
  (empty/error-state classes)

## Test contract mapping (preserved verbatim)

The existing 24-test contract (`StrategyMatrix.test.tsx`) is the hard
constraint. Mapped each test surface to its polish-preserving
implementation:

| Test surface | Contract | Implementation |
|---|---|---|
| Title text | `getByText(/Quantitative Strategy Matrix/i)` | Direct text node in `<span class="card-title">` — preserved. Added Lucide `Zap` icon (aria-hidden) before the title. |
| Header badge | `getByText(/47 Stubs \/ Research/i)` | Direct text node in `<span class="badge badge-dim">` — preserved. Added `tabular-nums`. |
| Active count badge | `getByText(/2 of 3 Implemented Active/i)` | Direct text node in `<span class="badge badge-green">` — preserved. Added `tabular-nums`. |
| 8 category tabs | `getByRole('button', { name: tab })` × 8 | Tab buttons with exact labels — preserved. Refined with `transition-colors` + active cyan ring glow. |
| Search input | `getByLabelText(/Filter strategies/i)` | aria-label preserved. Added leading Lucide `Search` icon + focus ring. |
| Implemented badges | `getAllByText('Implemented').length === 3` | 3 spans with text "Implemented" — preserved. Recolored green with consistent px-2 py-0.5 text-[9px] uppercase tracking-wider rounded-full sizing. |
| Stub badge | `getByText('Stub')` | 1 span with text "Stub" — preserved. Recolored red (DISABLED tone, was `badge-dim`). |
| P&L strip substrings | `getByText(/\+12\.45/)`, `getByText(/62% WR/i)`, `getByText(/38 trades/i)` | Split into 3 separate spans (each with `tabular-nums`) so each regex resolves to a single leaf text node. Verified `getNodeText` from @testing-library/dom returns only direct text node children for non-button/code/input elements — so the parent P&L div does NOT match, only the leaf spans do. |
| Deploy button | `getByRole('button', { name: /Deploy/i })` | Button text "Deploy" — preserved. |
| Stop button | (test 10 only checks Deploy; Stop preserved) | Button text "Stop" — preserved. |
| Stub Only button | `getByRole('button', { name: /Stub Only/i })` | Button text "Stub Only" — preserved. |
| Stub notice | `getByText(/metadata-only research stub/i)` | Direct text in stub-notice banner — preserved. |
| Catalog error | `getByText(/Failed to load strategy catalog \(HTTP 500\)/i)`, `getByText(/Network error: ECONNREFUSED/i)` | Rendered as the title div of the polished ErrorCard — direct text node, single match. |
| Perf error | `getByText(/Failed to load per-strategy performance \(HTTP 502\)/i)` | Rendered as the title div of the polished ErrorCard — direct text node. |
| Toggle error | `getByText(/Risk engine blocked toggle/i)`, `getByText(/Network error: ECONNRESET/i)` | Rendered as a dedicated `<span data-testid="strategy-matrix-toggle-error-msg">{message}</span>` — direct text node. The wrapping `<strong>Toggle failed:</strong>` is a sibling element so its text doesn't transitively match the toggle-error regex. |
| Catalog dismiss | `getByRole('button', { name: /Dismiss catalog error/i })` | aria-label preserved on the bare-X Dismiss button. |
| Perf dismiss | `getByRole('button', { name: /Dismiss performance error/i })` | aria-label preserved. |
| Toggle dismiss | `getByRole('button', { name: /Dismiss toggle error/i })` | aria-label preserved. |
| Console error logging | `expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[StrategyMatrix]'), expect.any(Error))` | `console.error('[StrategyMatrix] ...', e)` preserved verbatim in fetchCatalog + fetchPerf + handleToggle. |
| Polling (4s) | `vi.advanceTimersByTimeAsync(4_000)` → 2 more calls | `setInterval(..., 4000)` preserved verbatim. |
| Clean unmount | `clearInterval` in useEffect cleanup | Preserved. |
| Authorization header | `headers.get('Authorization')` matches `/^Bearer\s+\S+$/` | `apiFetch()` sets Authorization automatically — preserved. |
| Empty catalog | `queryByText('Avellaneda-Stoikov Market Maker')` not in document | Empty state fires — no strategy text leaks into the empty state. |

## Polish affordances applied (9 spec items + 3 additional refinements)

### 1. Shimmer skeleton loading state (rows matching the registry table columns)

Added a `catalogLoaded` state (default `false`, set `true` on the first
fetchCatalog success or failure). When `!catalogLoaded && !catalogError`,
renders `<StrategySkeletonGrid rowCount={6}>` — 6 shimmer placeholder
cards in the same `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`
layout as the live cards so the panel doesn't visually jump when the
first fetch resolves.

Each `StrategySkeletonCard` mirrors the live card structure:
- **Header row**: skeleton for name (70% width, 12px) + skeleton for
  strategy_id (45% width, 8px) + skeleton for status badge (70px round)
- **Description**: two skeleton lines (100% + 85% width, 8px)
- **P&L strip**: three skeleton chips (50px / 60px / 60px, 10px)
- **Footer**: skeleton for category (60px) + risk (40px) + action
  button (60px round)

Uses the design-system `.skeleton-line` + `.skeleton-line-sm` +
`.skeleton-line-md` classes (which carry the `skeleton-shimmer` keyframe
in globals.css) augmented with `.animate-pulse` for an additional
left-to-right shine sweep (consistent with the W52-a ScreenerSkeletonRows
pattern). The wrapper carries `role="status"` + `aria-live="polite"` +
`data-testid="strategy-matrix-loading"`; the skeleton cards themselves
are `aria-hidden`.

The loading state only fires on the initial load (when `catalogLoaded`
is false). The 4s poll doesn't re-trigger the skeleton because
`catalogLoaded` stays true after the first fetch — so a trader's
existing cards stay visible during refreshes.

### 2. Polished empty state with Lucide icon + title + subtitle

Added `<EmptyState>` sub-component using the design-system
`.empty-state` classes from globals.css. Fires when:
- `catalogLoaded === true` (catalog fetch has resolved)
- `catalogError === null` (no fetch failure)
- `sorted.length === 0` (filtered list is empty — either upstream
  catalog is empty OR the active search/tab filter narrows the
  result set to zero)

Renders:
- Lucide `Layers` icon (28px, opacity 0.6)
- Title "No strategies match your view" (semibold)
- Subtitle "Adjust your search query or category filter to surface
  more strategies from the registry." (dim, max-width 320px, leading-
  relaxed)

`role="status"` so screen readers announce the empty state. No
strategy name text leaks into the empty state so the W22-2 test
`screen.queryByText('Avelaneda-Stoikov Market Maker')` still resolves
to null. `data-testid="strategy-matrix-empty"` for downstream CSS
targeting.

### 3. Refined table-style mini-headers (uppercase, 11px, letter-spaced, dimmed, SortIndicator)

The StrategyMatrix is a CARD GRID (not a table) — the W53 spec
mentions "table headers" and "SortIndicator" but the test contract
talks about "renders strategy cards" so the card-grid layout is
preserved (converting to a table would be a major architectural
change with risk to the test contract).

Instead, applied the W52-a table-header polish pattern adapted to
the card grid:
- Each card's category + risk_level row reads as a unified dim
  caption strip: `text-[10px] text-[#7e8aaa] uppercase mono
  tracking-wider`
- The strategy_id caption uses `mono text-[9.5px] text-[#7e8aaa]
  tracking-wide` (consistent with the existing pattern)
- The header badges (Implemented / Stub) use `text-[9px] uppercase
  tracking-wider font-bold px-2 py-0.5 rounded-full` — consistent
  sizing across both badges
- Added a **SortIndicator** sub-component (Lucide ArrowUp / ArrowDown
  at 12px on the active sort option, ArrowUpDown glyph on inactive)
  rendered next to the new sort dropdown in the toolbar
- The sort dropdown itself uses `uppercase`-when-active styling on
  its selected option label

`aria-hidden` on the SortIndicator glyph because the select's
selected option already exposes the sort state to assistive tech.

### 4. Table row hover: subtle background lift + left-edge accent bar (inset shadow)

Replaced the bare `hover:border-[#3b82f6]/40` with the W51-2a / W52-a
row-hover pattern adapted to the card grid:
- **Running + implemented cards** (active deployed strategies):
  `hover:bg-cyan-500/5` + `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`
  + existing `border-cyan-500/40 shadow-sm shadow-cyan-500/10`
- **Implemented (not running) cards** (deployable):
  `hover:border-cyan-500/30` + `hover:bg-cyan-500/5` +
  `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`
- **Stub cards** (research only, dimmed opacity):
  `hover:bg-[#0e1015]` + `hover:opacity-80` +
  `hover:shadow-[inset_3px_0_0_0_rgba(126,138,170,0.35)]` (muted
  gray accent bar to signal "non-deployable")

All three states use the inset-shadow accent bar technique (no layout
shift) consistent with the MarketsPanel W51-2a + MarketScreener
W52-a pattern. The accent color matches the card's status (cyan for
deployable, gray for stubs).

`transition-all` on every card for smooth hover transitions.

### 5. Strategy status badges (IMPLEMENTED green, DISABLED red — consistent sizing)

The test contract requires `getAllByText('Implemented').length === 3`
and `getByText('Stub')` — so the badge text must remain "Implemented"
(3x) and "Stub" (1x). The task spec's PLANNED (amber/muted) doesn't
have a direct equivalent in the StrategyMatrix data model (a strategy
is either implemented = deployable, or stub = research-only).

Applied the badge-color polish without changing the text:
- **Implemented** badge: `badge-green` (IMPLEMENTED tone) — preserved
  green color
- **Stub** badge: switched from `badge-dim` to `badge-red` (DISABLED
  tone) — so a trader can immediately distinguish executable
  strategies from research stubs at a glance. The "Stub" text is
  preserved verbatim.

Consistent sizing: `text-[9px] uppercase tracking-wider font-bold
px-2 py-0.5 rounded-full` for both badges. Was previously `text-[9px]`
with no padding normalization — now both badges have identical
geometry so they visually align across cards.

The running indicator (green pulse dot, `animate-pulse`) is preserved
on running implemented cards. Added `aria-label="Strategy running"`
for screen-reader parity.

### 6. Tabular-nums on all numeric columns

Added `tabular-nums` to:
- **net_pnl** span in the P&L strip (was missing — value would shift
  when net_pnl changed)
- **win_rate** span (`{p.win_rate * 100}% WR`) — was missing
- **closed_trades** span (`{p.closed_trades} trades`) — was missing
- **risk_level** badge (LOW / MEDIUM / HIGH) — added `tabular-nums`
- **"X of 3 Implemented Active"** header badge — added `tabular-nums`
  (was missing — the running count would shift the badge width
  when it ticked)
- **"47 Stubs / Research"** header badge — added `tabular-nums` for
  consistent header badge geometry

The P&L strip was previously a single span; now split into 3 separate
spans (net_pnl · win_rate · trades) with `·` separators in dedicated
spans. Each numeric value is in its own leaf text-node span so
`tabular-nums` aligns each value cleanly AND the W22-2 test contract
(`getByText(/\+12\.45/)`, `getByText(/62% WR/i)`, `getByText(/38
trades/i)`) still resolves — each regex matches a single leaf span
(`getNodeText` from @testing-library/dom returns only direct text
node children for non-button/code/input elements, so the parent P&L
div doesn't transitively match all three substrings).

### 7. Refined toolbar (search + filters + sort) with consistent grouping

Polished the toolbar at the top of the panel:
- **Search input**: added leading Lucide `Search` icon (12px, dimmed)
  absolutely-positioned inside the input wrapper; input gets `pl-7`
  so the icon doesn't overlap the text. Added focus ring:
  `focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20
  outline-none transition-all`. aria-label="Filter strategies"
  preserved verbatim.
- **Sort dropdown** (NEW): native `<select>` with Lucide `ArrowUpDown`
  icon + SortIndicator glyph. Options: Default, P&L (high→low), Win
  Rate (high→low), Trade Count (high→low), Name (A→Z). Default
  preserves upstream catalog order so test contracts that check card
  presence (not order) are unaffected. aria-label="Sort strategies"
  for screen-reader parity with the search input.
- **Category tabs**: refined with `transition-colors` + active cyan
  ring glow (`ring-1 ring-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.18)]`)
  on the active tab — consistent with the MarketsPanel W51-2a active
  chip pattern. Inactive tabs get `hover:text-[#dde1ed]`.

The toolbar grouping reads as a single cohesive strip: [title +
header badges] | [search + sort]. The category tabs stay in their
own dedicated row (separated by `border-b`) for at-a-glance scan.

### 8. Error state: polished error card with retry button

Replaced the bare `banner-danger` strip for the catalog + leaderboard
fetch failures with a refined `ErrorCard` sub-component:
- Lucide `AlertTriangle` icon (w-4 h-4, text-red-400)
- The full error string rendered as the card's **title** in a `<div
  className="text-xs font-semibold text-red-300 break-words">` —
  so `getByText(/Failed to load strategy catalog \(HTTP 500\)/i)`
  and `getByText(/Network error: ECONNREFUSED/i)` still resolve
  (single leaf text node match — the parent divs don't transitively
  match because `getNodeText` returns only direct text node children)
- Dim subtitle: "The strategy registry couldn't be reached. Check
  connectivity and retry." (catalog) / "The strategy performance feed
  couldn't be reached. P&L / win-rate / trade counts will retry on
  the next poll." (perf)
- **Retry button** (Lucide `RotateCcw` glyph + "Retry" text) with
  aria-label="Retry catalog fetch" / "Retry performance feed"
- **Dismiss button** (bare `X` icon) with aria-label="Dismiss catalog
  error" / "Dismiss performance error" preserved verbatim from the
  W22-1 contract
- `role="alert"` + `data-testid="strategy-matrix-catalog-error"` /
  `strategy-matrix-perf-error`

The catalog error card **replaces** the cards area (catalog is the
primary data source — if it fails, no cards can render). The perf
error card renders **inline above** the cards area (perf is
supplementary — cards can still render without perf data, just
without the P&L strip).

For the **toggle error** (POST /api/strategies/toggle failure),
added a `ToggleErrorBanner` sub-component: compact polished banner
with the error message in a dedicated `<span data-testid="strategy-
matrix-toggle-error-msg">` so the W22-1 toggle-error regex resolves
to a single leaf text node. Includes a Retry button (re-fires the
POST for the same strategy + direction via `lastToggle` state) +
Dismiss button (aria-label="Dismiss toggle error" preserved).

Added a `lastToggle` state `{ strategyId, currentStatus }` set on
every toggle attempt and cleared on success. The `handleRetryToggle`
callback reads from `lastToggle` and re-invokes `handleToggle(strategyId,
currentStatus)` — so the retry POST fires with the exact same payload
(strategy_name + enabled: !currentStatus).

### 9. Tone-colored P&L values (green profit, red loss)

The P&L strip wrapper carries `data-tone={p.net_pnl >= 0 ?
'positive' : 'negative'}` (matches the PositionsPanel / OrderFlowPanel
tone vocabulary). The net_pnl value span is colored `text-green-400`
for profit (≥0) and `text-red-400` for loss (<0). The win_rate and
closed_trades spans render in the muted neutral tone (`text-[#7e8aaa]`)
so the trader's eye is drawn to the P&L signal first.

The `title` attribute on the P&L strip wrapper preserves the full
precision tooltip: `net_pnl {value} · win_rate {value}% · {count}
closed trades` — so a trader can hover for the exact numbers.

### Additional refinements (beyond the 9 spec items)

- **Header polish**: added Lucide `Zap` icon (w-4 h-4, text-cyan-300)
  before the "Quantitative Strategy Matrix" title — consistent with
  the MarketsPanel / OrderFlowPanel header-icon pattern. aria-hidden.
- **Stub notice polish**: replaced the bare `⚠️ {stubNotice}` emoji
  with a Lucide `AlertTriangle` icon (aria-hidden) + the message text.
  Added `role="status"` for screen-reader announcement. Added
  `aria-label="Dismiss stub notice"` on the dismiss button (was
  bare `text-white hover:underline` with no aria-label).
- **Risk badge**: added `tabular-nums` to the risk_level badge (LOW /
  MEDIUM / HIGH) for consistent badge geometry.
- **Strategy card border treatment**: kept the existing conditional
  border colors (cyan-500/40 for running, #1f2335 for implemented,
  #1f2335/60 for stubs with opacity-65). Added `hover:border-cyan-500/30`
  on implemented cards so the hover state has a clear visual lift
  signal in addition to the accent bar.
- **Running dot accessibility**: added `aria-label="Strategy running"`
  on the green pulse dot (was previously bare `animate-pulse` with
  only a `title` attribute).
- **4 new inline sub-components** extracted for readability:
  `SortIndicator`, `StrategySkeletonCard`, `StrategySkeletonGrid`,
  `EmptyState`, `ErrorCard`, `ToggleErrorBanner`. Each is small,
  single-purpose, and `aria-hidden` where decorative. No API change.

## Implementation notes

### `getNodeText` behavior (RTL contract preservation)

Verified that @testing-library/dom's `getNodeText(node)` returns:
- For `button, code, input, select, textarea, a[href]` elements: the
  full `textContent` (including descendants)
- For all other elements: ONLY the direct text node children (NOT
  including text from descendant elements)

This is why splitting the P&L strip into 3 separate spans (each
with its own direct text node) preserves the W22-2 test contract —
each regex matches a single leaf span, not the parent P&L div.

Same for the ErrorCard title — the title div has a direct text node
(the error string), so the W22-1 regexes match only the title div,
not the parent ErrorCard div.

### Loading state lifecycle

`catalogLoaded` defaults to `false`. Set to `true` on the first
`fetchCatalog` resolution (success OR failure). This means:
- Initial mount: `catalogLoaded=false` → shimmer skeleton shows
- First fetch success: `catalogLoaded=true`, `catalogError=null`,
  catalog populated → cards render
- First fetch failure: `catalogLoaded=true`, `catalogError=msg` →
  catalog error card renders
- Subsequent 4s polls: `catalogLoaded` stays `true` → skeleton
  doesn't re-flash on refresh (existing cards stay visible)

The perf fetch is independent — `fetchPerf` doesn't have its own
loading state because perf is supplementary (cards render fine
without perf data; the P&L strip just doesn't show).

### Sort dropdown safety

The default sort is `'default'` (no sort applied — preserves
upstream catalog order). The W22-2 filter tests (search + category
tab) check specific card **presence**, not order — so adding a
sort dropdown with default = no sort doesn't break those tests.

The sort is layered on top of the existing `filtered` list (in a
separate `useMemo`) so the filter logic is unchanged. The sort
options use the `perf` map to look up P&L / win_rate / closed_trades
per strategy; strategies without perf data sort to the bottom (using
`-Infinity` / `-1` fallbacks).

## Test contract preservation (verified)

All 24 tests pass in ~2.0s:
1. renders without crashing
2. renders the "Quantitative Strategy Matrix" title
3. renders the "47 Stubs / Research" badge in the header
4. fetches /api/strategies/catalog AND /api/leaderboard on mount
5. renders the "Implemented" badge for canonical strategies and "Stub" badge for research stubs
6. renders the per-strategy live P&L strip when leaderboard has data
7. filters cards by category when a tab is clicked
8. filters cards by search query (matches name)
9. shows the warning notice when a stub "Stub Only" button is clicked
10. fires POST /api/strategies/toggle when the Deploy/Stop button is clicked
11. handles fetch errors gracefully (no crash, no cards rendered)
12. renders the "X of 3 Implemented Active" badge reflecting the running count
13. renders all eight category tabs
14. passes the Authorization header via apiFetch on every fetch
15. polls the catalog + leaderboard every 4 s
16. clears the polling interval on unmount (no leaked setState)
17. renders gracefully when catalog is empty
18. W22-1: shows the catalog error banner when /api/strategies/catalog returns HTTP 500
19. W22-1: shows the performance error banner when /api/leaderboard returns HTTP 502
20. W22-1: shows the catalog error banner when the fetch throws a network error
21. W22-1: dismisses the catalog error banner when the Dismiss button is clicked
22. W22-1: shows the toggle error banner when POST /api/strategies/toggle returns HTTP 423
23. W22-1: shows the toggle error banner when the POST throws a network error
24. W22-1: logs the catalog fetch error to console.error (silent swallow removed)

## Verification results

```
$ bun run lint
$ eslint .
(exit 0, no output — clean)

$ bunx tsc --noEmit --skipLibCheck
(exit 0, 0 errors)

$ TMPDIR=/dev/shm/vitest-tmp NODE_OPTIONS="--max-old-space-size=512" bunx vitest run src/components/StrategyMatrix.test.tsx
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  2.03s
```

## Files touched

- `src/components/StrategyMatrix.tsx` (UI polish pass, 336 → 866 lines,
  +679 insertions / −149 deletions per `git diff --stat`)
- `/home/z/my-project/agent-ctx/W53-a-full-stack-developer.md` (this
  detailed agent work record)
- `worklog.md` (W53-a appended entry — this file's content adapted)

## Push verification

```
$ wc -l src/components/StrategyMatrix.tsx
866 src/components/StrategyMatrix.tsx
$ git diff --stat HEAD src/components/StrategyMatrix.tsx
 src/components/StrategyMatrix.tsx | 828 +++++++++++++++++++++++++++++++-------
 1 file changed, 679 insertions(+), 149 deletions(-)
```

## Final status

- **Polish**: complete — 9 spec items + 4 additional refinements applied.
- **Backwards-compat**: full — all props, API calls (`apiFetch(${apiUrl}/api/strategies/catalog)` +
  `apiFetch(${apiUrl}/api/leaderboard)` in parallel on mount + every 4s +
  `apiFetch(${apiUrl}/api/strategies/toggle)` POST on Deploy/Stop click), polling (4s setInterval),
  all existing class names (card, card-header, card-title, badge + badge-green /
  badge-dim / badge-red, btn + btn-primary / btn-danger / btn-ghost / btn-xs,
  input + input-sm, mono, scrollbar-thin, tab-item + .active, banner-warning),
  all accessibility roles/labels, all test contracts, and the 'use client'
  directive preserved.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors.
- **Tests**: 24/24 pass.

**StrategyMatrix is production-ready with the premium W53-a visual layer,
visually consistent with the W50-52 MarketsPanel / PositionsPanel /
MarketScreener / OrderFlowPanel redesign family.**

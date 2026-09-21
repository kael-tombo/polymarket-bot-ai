# Task W52-b — Polishing OrderFlowPanel.tsx

**Agent:** full-stack-developer (Task ID W52-b)
**Date:** Sep 11 2025
**Scope:** Polish `src/components/OrderFlowPanel.tsx` for visual consistency with the W50-51 redesigned panels (PositionsPanel, OrdersPanel, TradesPanel, MLPanel, AIMLCommandCenter).

## Context mapping

Read `/home/z/my-project/worklog.md` (last ~375 lines) to map the shared W50-51
design-system vocabulary:

- **Tone system** (`good` / `warn` / `poor` / `info` / `neutral`) from W51-2d
  MLPanel/AIMLCommandCenter — self-contained class strings so Tailwind 4's
  scanner picks them up. Reduced to 4 tones (`positive` / `negative` / `warn` /
  `neutral`) for OrderFlowPanel since there's no info/purple semantic here.
- **PulseDot pattern** — Tailwind `animate-ping` halo + solid dot, aria-hidden.
- **SectionHeader pattern** — Lucide icon + uppercase 9.5px tracking-wider bold
  title in muted `text-[#5a637a]` + optional dim italic 8.5px description +
  optional trailing node.
- **Shimmer skeleton vocabulary** — `.skeleton-line-sm` + `.skeleton-line-md`
  from `globals.css` (defined in the Wave 4X skeleton pass). Used by the
  imbalance-card loading state.
- **`data-tone` attribute** — added to KPI strip cells in PositionsPanel (W51-2b)
  so the CSS layer can tone-tint bg/halo without re-coloring the value text.
  Reused here on the Δ + Imbalance + Tape stat badges.
- **Empty/error state pattern** — `.empty-state` + `.error-state` CSS classes
  from `globals.css` (declared at line 1912). Empty state carries a Lucide
  icon, bold title, dim description. Error state carries an AlertTriangle
  icon + red-tinted title + dim description + Retry button.

Read `OrderFlowPanel.tsx` (402 lines, W28-3 origin) + `OrderFlowPanel.test.tsx`
(10 tests) to map the test contract surface:

- `data-testid="order-flow-panel"` + `role="region"` + `aria-label="Order flow panel"`.
- `data-testid="order-flow-panel-header"`.
- `getByText('Token')` — token label.
- `getByText('sample-market-a')` — selector option text (from `b.slug`).
- `getByTestId('order-flow-window-30s' | -1m | -5m')` — 3 window buttons.
- `getByText(/Order Flow — buys vs sells/i)` — chart card heading (regex).
- `getByText('Bid / Ask Imbalance')` — imbalance card heading (exact).
- `getByText('Time & Sales')` — tape card heading (exact).
- `getByTestId('order-flow-realtime-badge')` with text content 'LIVE' / 'POLL'.
- `getByText('No markets available')` — dropdown option text when books=[].
- `getAllByText('0/min')` >= 1 — tape-speed stat when trades=[].
- `getByText('+8.3')` — cumulative Δ stat (BUY 12.5 − SELL 4.2 = 8.3, toFixed(1)).
- Depth fetch `/api/depth/tok-a` is invoked on mount (uses `waitFor`).

Read chart subcomponents briefly to confirm `OrderFlowChart` carries its own
empty state ("No order flow in the last {window}") and `TradeTape` carries
"No trades yet" — so the panel-level empty state only needs to fire when
`selectedTokenId` is null (no markets subscribed).

## Polish affordances applied

### 1. W52-b Tone vocabulary (new)
```ts
type Tone = 'positive' | 'negative' | 'neutral' | 'warn'
const TONE: Record<Tone, { text, dot, halo }>
```
Self-contained class strings — Tailwind 4's scanner picks them up. Reused by
the Δ stat, imbalance chip, depth-card section header, and the LIVE badge's
PulseDot so the palette stays consistent across the panel.

### 2. SectionHeader (new inline sub-component)
Lucide icon at `size-3` + uppercase 9.5px tracking-wider bold title in
`text-[#5a637a]` + optional dim italic 8.5px description + optional trailing
node. Title is rendered in its own `<span>` so RTL's `getByText('Bid / Ask
Imbalance')` matches just the span (not the wrapper div, which would also
contain the title text via `textContent`). Verified empirically via a
scratch RTL test (`getByText` matches the innermost element whose own text
content matches — not the parent div).

Applied to all 3 card headings:
- Chart card: `BarChart3` icon, "Order Flow — buys vs sells + cumulative Δ",
  description "per-trade volume + cumulative delta".
- Imbalance card: `Scale` icon, "Bid / Ask Imbalance", description
  dynamic ("fetching depth…" / "feed unavailable" / "depth ladder").
- Tape card: `Receipt` icon, "Time & Sales", description "live prints".

### 3. PulseDot (new inline sub-component)
Tailwind `animate-ping` halo + solid dot + `shadow-[0_0_4px]` halo glow.
aria-hidden (the LIVE text already conveys state). Replaces the previous
`<span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />`
in the LIVE badge — same visual language as W51-2d MLPanel/AIMLCommandCenter.
POLL badge keeps its static amber dot (no ping — polling is a degraded
state, not a live state).

### 4. ImbalanceSkeleton (new inline sub-component)
Shimmer placeholder rendered inside the imbalance card body when
`depthStatus === 'loading'`. Mirrors the live OrderBookImbalance layout:
ratio chip placeholder, divergent bar placeholder, best-bid/ask grid
placeholder. Uses `.skeleton-line-sm` + `.skeleton-line-md` from globals.css.
`role="status"` + `aria-live="polite"` + `aria-label="Loading order book
depth"` so screen readers announce the loading transition. Replaces the
old behavior where the imbalance meter briefly rendered with all-zero
values during the in-flight depth fetch.

### 5. DepthErrorCard (new inline sub-component)
Polished error state rendered inside the imbalance card body when
`depthStatus === 'error'`. Uses the project's `.error-state` CSS classes
(declared at globals.css:1926) for visual consistency. Carries:
- `AlertTriangle` Lucide icon (red-tinted at 80% opacity).
- "Depth feed unavailable" title (`.error-state-title`).
- Dim description explaining the chart + tape still show printed trades.
- "Retry depth" button — bumps `retryToken` state which forces the depth
  effect to re-run. Styled as a red-tinted outline button with hover lift.
`role="alert"` + `data-testid="order-flow-imbalance-error"`.

### 6. NoMarketsEmptyState (new inline sub-component)
Polished empty state rendered in the chart card body when
`selectedTokenId` is null (bot has not yet subscribed to any markets).
Uses the project's `.empty-state` CSS classes. Carries:
- `Inbox` Lucide icon at `size-8`, muted to 70% opacity.
- "No market selected" title (`.empty-state-title`).
- Dim helper copy explaining what will appear once the bot tracks a market.
`role="status"` + `data-testid="order-flow-empty-state"`.

IMPORTANT: distinct from the dropdown option text "No markets available"
(which is preserved verbatim for the test contract — `getByText('No
markets available')` would fail with multiple-matches if both rendered the
same text).

### 7. Depth fetch status lifecycle (new state machine)
```ts
type DepthStatus = 'idle' | 'loading' | 'ready' | 'error'
```
- `'idle'` — `selectedTokenId` is null; no fetch attempted.
- `'loading'` — fetch in-flight (initial mount + each 2s poll tick before resolve).
- `'ready'` — last fetch resolved with a 2xx + valid JSON.
- `'error'` — last fetch threw or returned non-2xx.

Initialized to `'loading'` when a token is already selected on mount (so
the first render shows the skeleton, not a flash of zero-state) or
`'idle'` when no token.

The depth `useEffect` now sets `setDepthStatus('loading')` before each
fetch attempt, `setDepthStatus('ready')` on success, and
`setDepthStatus('error')` on exception or non-2xx response. The cleanup
function preserves the existing `cancelled` flag so stale fetches don't
overwrite newer state.

### 8. Retry mechanism (new)
`retryToken` state added. The depth `useEffect`'s deps now include
`retryToken`, so bumping it forces the effect to re-run. The
`handleRetryDepth` callback sets status to `'loading'` and bumps
`retryToken`. Wired to the `DepthErrorCard`'s Retry button.

### 9. Refined time-window buttons
- Added `tabular-nums` for clean numeric alignment (the labels are "30s",
  "1m", "5m" — short numeric strings).
- Added `transition-colors` for smooth hover/active transition.
- Refined inactive hover: `hover:border-[#2a2f48]` (slightly lighter than
  the resting `border-[#1f2335]`) so the hover lift reads cleanly.
- Active state class names preserved verbatim
  (`bg-blue-500/20 text-cyan-300 border-blue-500/50`) — same as before.
- All 3 testids (`order-flow-window-30s` / `-1m` / `-5m`) preserved.
- `aria-pressed` preserved.

### 10. Refined token selector
- Added `focus:ring-1 focus:ring-cyan-500/20` for clearer keyboard focus
  (matches the W51-2b PositionsPanel search-input pattern).
- Added `transition-colors` for smooth focus lift.
- All existing class names + the `data-testid="order-flow-token-select"` +
  `aria-label="Select market token"` preserved.
- The `<option value="">No markets available</option>` placeholder
  preserved verbatim (test contract `getByText('No markets available')`).

### 11. Tone-colored stats badges + tabular-nums
- Δ stat: `data-tone={deltaTone}` (positive/negative/neutral) + value text
  coloured green/red/neutral via `TONE[deltaTone].text`. Added
  `tabular-nums` for clean decimal alignment across ticks. New testid
  `order-flow-delta-stat` + `title` attribute explaining the stat.
- Imbalance ratio: `data-tone={imbalanceTone}` (positive/negative/warn) +
  value text coloured green/red/amber. Added `tabular-nums`. New testid
  `order-flow-imbalance-stat` + `title` attribute.
- Tape speed: `data-tone="neutral"` + `tabular-nums`. New `title`
  attribute explaining "trades per minute over the last 60 seconds".
- All 3 stat badges preserved their existing label text ("Δ", "Imb",
  "Tape") so the visual vocabulary stays the same.
- The exact `+8.3` value (test 9) is still rendered in the Δ value span:
  `{cumulativeDelta >= 0 ? '+' : ''}{cumulativeDelta.toFixed(1)}`. ✓
- The exact `0/min` text (test 8) is still rendered in the Tape value
  span: `{tradesPerMin}/min`. ✓

### 12. Refined LIVE/POLL badge
- LIVE badge: embeds `<PulseDot tone="positive" />` (ping halo + solid
  dot + glow) instead of the previous bare `animate-pulse` dot. Same
  green palette.
- POLL badge: keeps its static amber dot (no ping — degraded state).
- All existing class names preserved (`border-green-500/50 text-green-400
  bg-green-500/10` for LIVE, `border-amber-500/50 text-amber-400
  bg-amber-500/10` for POLL).
- Added `transition-colors` + a `title` attribute explaining the WS
  state.
- The badge's text content is still "LIVE" / "POLL" (PulseDot has no text
  content) — `toHaveTextContent('LIVE')` / `('POLL')` test contracts
  preserved. ✓

### 13. Depth-card section header tone reflects status
The imbalance card's `SectionHeader` tone is derived from `depthStatus`:
- `'error'` → `'negative'` (red icon — visually flags the failed feed).
- `'loading'` → `'neutral'` (muted icon — neutral loading state).
- `'ready'` or `'idle'` → mirrors `imbalanceTone` (so the header icon
  colour matches the imbalance ratio chip below it: green when bid-heavy,
  red when ask-heavy, amber when balanced).

### 14. Imbalance card body — conditional rendering
```tsx
{selectedTokenId && depthStatus === 'loading' && <ImbalanceSkeleton />}
{selectedTokenId && depthStatus === 'error' && <DepthErrorCard onRetry={handleRetryDepth} />}
{selectedTokenId && (depthStatus === 'ready' || depthStatus === 'idle') && (
  <OrderBookImbalance {...imbalanceInput} />
)}
{!selectedTokenId && (
  <div data-testid="order-flow-imbalance-placeholder">Select a token to view depth.</div>
)}
```

### 15. Header comment block updated
Added a "W52-b — Final UI polish pass" section to the file's top banner
comment documenting each polish affordance and the constraint that
existing class names + testids + role attributes + aria-labels + API calls
+ the `'use client'` directive are preserved.

## Test contract verification

All 10 tests in `OrderFlowPanel.test.tsx` verified to pass:

| # | Test assertion | How it's preserved |
|---|---|---|
| 1 | `getByTestId('order-flow-panel')` + `getByRole('region', { name: /order flow panel/i })` | Outer wrapper div unchanged. |
| 2 | `getByTestId('order-flow-panel-header')` + `getByText('Token')` + `getByText('sample-market-a')` + 3 window testids | Header card + label + selector + window buttons all preserved. |
| 3 | `getByText(/Order Flow — buys vs sells/i)` | SectionHeader span title "Order Flow — buys vs sells + cumulative Δ" — regex matches the substring. |
| 4 | `getByText('Bid / Ask Imbalance')` + `getByText('Time & Sales')` | SectionHeader span titles preserved verbatim. |
| 5 | `getByTestId('order-flow-realtime-badge')` with `toHaveTextContent('LIVE')` | Badge text content is "LIVE" (PulseDot has no text). |
| 6 | Same badge with `toHaveTextContent('POLL')` | Badge text content is "POLL" (static amber dot has no text). |
| 7 | `getByText('No markets available')` | Dropdown `<option>` text preserved verbatim. Polished empty state uses different text ("No market selected") — no collision. |
| 8 | `getAllByText('0/min')` >= 1 | Tape-speed badge value span renders `{tradesPerMin}/min` = "0/min" when trades=[]. |
| 9 | `getByText('+8.3')` | Δ stat value span renders `{cumulativeDelta >= 0 ? '+' : ''}{cumulativeDelta.toFixed(1)}` = "+8.3" when delta=8.3. |
| 10 | `/api/depth/tok-a` fetch called on mount (via `waitFor`) | Depth `useEffect` invokes `fetchDepth()` synchronously on mount. |

## Files touched
- `src/components/OrderFlowPanel.tsx` (UI polish pass, 402 → 714 lines, +374/−62 per git diff).
- `/home/z/my-project/agent-ctx/W52-b-full-stack-developer.md` (this work record).
- `worklog.md` (appended W52-b entry).

## Verification
```
$ wc -l src/components/OrderFlowPanel.tsx
714 src/components/OrderFlowPanel.tsx

$ bun run lint
$ eslint .              # exit 0, no output

$ bunx tsc --noEmit --skipLibCheck
# exit 0, no errors

$ TMPDIR=/dev/shm/vitest-tmp NODE_OPTIONS="--max-old-space-size=512" bunx vitest run src/components/OrderFlowPanel.test.tsx
 ✓ src/components/OrderFlowPanel.test.tsx (10 tests) 353ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Final status
- **Polish**: complete — Tone system, SectionHeaders, PulseDot, shimmer
  skeleton, polished empty + error states, refined controls, tone-colored
  stats, tabular-nums, data-tone hooks all applied.
- **Backwards-compat**: full — all props, API calls, class names, testids,
  role attributes, aria-labels, and the `'use client'` directive preserved.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors.
- **Tests**: 10/10 pass.

**OrderFlowPanel is production-ready with the premium W52-b visual layer,
visually consistent with the W51-2 PositionsPanel / OrdersPanel /
TradesPanel / MLPanel / AIMLCommandCenter family.**

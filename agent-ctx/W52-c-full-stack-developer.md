# W52-c — full-stack-developer — Premium polish for DepthChartModal + MarketChartModal

**Task ID:** W52-c
**Agent:** full-stack-developer
**Target:** `src/components/DepthChartModal.tsx`, `src/components/MarketChartModal.tsx`
**Wave context:** W50-51 design system (glassmorphism overlays, premium shadows,
`.surface-tier-overlay`, `--shadow-modal-premium` token, shimmer-skeleton loading
pattern from W51-2a..2d panel polish).

---

## Work Log

### 0. Pre-flight recon
- Read `worklog.md` tail (~600 lines) to map the W50-51 design system:
  - `.surface-tier-overlay` (rgba(31,35,48,0.78) bg, 12px backdrop-blur,
    saturate(140%), `--shadow-popover-premium`).
  - `--shadow-modal-premium` token (24px y-offset, 56px blur, 0.6 alpha).
  - Shimmer-skeleton loading pattern (`DepthChartSkeleton`, `MarketsTableSkeleton`,
    `SkeletonRows` from W51-2a/2b/2c).
  - Tone hooks (`data-tone`) and the W51-2d `KpiTile` / `PsiGauge` / `PulseDot` /
    `SectionHeader` inline sub-component pattern.
- Read both target files end-to-end (`DepthChartModal.tsx` 517 lines,
  `MarketChartModal.tsx` 355 lines) and both test files end-to-end
  (`DepthChartModal.test.tsx` 9 tests, `MarketChartModal.test.tsx` 11 tests)
  to enumerate every test contract I MUST NOT break:
  - DepthChartModal:
    • `queryByRole('dialog')` returns null when `tokenId === null`
    • `findByRole('dialog')` when `tokenId` provided
    • `findByText` matcher on `#depth-modal-title` whose textContent matches
      `/Order Book Depth:.*paris-rain/`
    • `findByText(/Manual Paper Trade Execution/)`
    • `getByText('Limit Price ($0.01 – $0.99)')`
    • `getByText('Order Size ($ USDC · Max $3)')`
    • `getByText('No active bids')` + `getByText('No active asks')` when fetch rejects
    • `getByRole('button', { name: /close market depth modal/i })`
    • Escape key handler
    • `getByRole('button', { name: /Place BUY Order/i })` → success banner
      `/Order filled: BUY \$1.5 @ 0.555/`
    • Network error → `/Network error submitting trade/`
  - MarketChartModal:
    • `getByRole('dialog')` always present
    • `getByText(/SYNTHETIC DATA/)`
    • `getByText('Rendering price timeline…')` — exact-text match while loading
    • `getByRole('img', { name: /Price candlestick chart for/i })` — SVG with
      `role="img"` + matching `aria-label`
    • `getByRole('button', { name: /timeframe 1m|5m|1h/i })` × 3
    • `getByText(/Network error loading price history/)`
    • `getByRole('button', { name: /close market chart modal/i })`
    • Escape key handler
    • `getByRole('button', { name: /Buy YES outcome/i })` → success banner
      `/Order placed: BUY \$1.5 @ 0.5/`
    • `getByRole('button', { name: /Sell YES outcome/i })` → `Risk gate rejected: HTTP 400`
    • Network error → `/Order submission failed/`
- Confirmed sibling polished modal examples (`ShortcutsModal.tsx`) use the same
  `.modal-backdrop` → `.modal` → `.modal-header` → `.modal-close` structure.

### 1. DepthChartModal.tsx — polish pass (517 → 612 lines, +95)

#### Glassmorphism modal surface
- Modal `className` changed from `"modal modal-wide"` →
  `"modal modal-wide surface-tier-overlay"`. The `.surface-tier-overlay` class
  (defined in `globals.css` line 2691) supplies:
  - `background: rgba(31, 35, 48, 0.78)` — translucent dark glass.
  - `backdrop-filter: blur(12px) saturate(140%)` — frosted glass effect.
  - `border: 1px solid var(--border-strong)` — premium border.
  - `box-shadow: var(--shadow-popover-premium)` — premium popover shadow.
- Added `style={{ boxShadow: 'var(--shadow-modal-premium)' }}` to the modal
  element. This OVERRIDES the `.surface-tier-overlay` default
  `--shadow-popover-premium` with the heavier `--shadow-modal-premium` token
  (defined in `globals.css` line 2667 dark / 2684 light):
  - dark: `0 1px 0 0 rgba(255,255,255,0.06) inset, 0 4px 8px rgba(0,0,0,0.40),
    0 24px 56px rgba(0,0,0,0.60)` — the heaviest elevation tier.
  - light: `0 1px 0 0 rgba(255,255,255,0.95) inset, 0 4px 8px rgba(15,23,42,0.10),
    0 24px 56px rgba(15,23,42,0.20)`.
- Inline style takes precedence over the class-defined `box-shadow` because
  inline styles have higher specificity than class selectors.

#### Strengthened backdrop blur
- Backdrop `className` changed from `"modal-backdrop"` →
  `"modal-backdrop backdrop-blur-md"`. The Tailwind `backdrop-blur-md` (12px)
  LAYERS on top of the existing `.modal-backdrop` `backdrop-filter: blur(4px)`
  from `globals.css` line 1763. In browsers, the longer blur value wins
  (last-declared filter takes effect); the result is a more pronounced
  frosted-glass pane behind the modal.

#### Refined modal header
- Title `<span id="depth-modal-title">` gained `tracking-tight` for tighter
  letter-spacing (premium dashboard look — matches the W50-2d Command Center
  pattern).
- Mid/Spread caption gained `tabular-nums` so the numeric values align cleanly
  across re-renders as the depth poll updates.
- Close button refined: kept `.modal-close` class (preserves the existing
  CSS hover) but added Tailwind utilities for the red-tinted hover affordance:
  `transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10
  hover:ring-1 hover:ring-red-500/30 rounded-md w-7 h-7 inline-flex
  items-center justify-center text-[13px] leading-none`. The Tailwind hover
  utilities are injected after the global CSS in the cascade, so they take
  precedence over `.modal-close:hover`'s grey→light-grey. The button content
  is now wrapped in `<span aria-hidden="true">✕</span>` (matches the
  `ShortcutsModal.tsx` pattern — keeps the ✕ glyph out of the screen-reader
  announcement; the aria-label is the SR-rendered name).
- All existing class names preserved: `modal-backdrop`, `modal`, `modal-wide`,
  `modal-header`, `modal-close`, `modal-body`, `badge badge-amber`.

#### Polished chart wrapper
- Chart wrapper `className` upgraded from
  `bg-[#0e1015] p-2.5 rounded border border-[#1f2335]` →
  `bg-[#0e1015] p-2.5 rounded-lg border border-[#1f2335]
  shadow-[0_2px_10px_rgba(0,0,0,0.20)]`. The `rounded-lg` (8px) softens the
  corners vs the original `rounded` (4px); the drop-shadow gives the chart
  surface a subtle float above the modal background.
- Section caption gained `tracking-wider` for premium uppercase letter-spacing,
  matching the W51-2b PositionsPanel toolbar pattern. The `bids X · asks Y`
  counter gained `tabular-nums` for stable column alignment across polls.

#### NEW chart loading skeleton — `DepthChartSkeleton`
- Added inline `DepthChartSkeleton({ height })` component (66 lines) defined
  above the default export. Renders while `data === null && !depthFirstFetchDone`:
  - 32 pre-baked bar heights evoking a depth-curve silhouette (bell-ish
    distribution: low → peak at mid → low again).
  - Each bar is a `<div>` with `flex-1 animate-pulse rounded-[2px]` and a
    custom linear-gradient fill: green for the bid half (left), red for the
    ask half (right). Uses `animate-pulse` (opacity-based shimmer) rather
    than `.skeleton-line-sm` so the custom gradient isn't overridden.
  - Mid-price divider rendered as an amber vertical line at `left-1/2`.
  - Caption "fetching depth…" in the top-left.
  - `role="status"` + `aria-live="polite"` + `aria-label="Loading order book
    depth chart"` for screen-reader announcement.
- NEW state: `const [depthFirstFetchDone, setDepthFirstFetchDone] = useState(false)`.
  - Reset to `false` whenever `tokenId` changes (so a newly-opened modal
    shows the skeleton for its own first fetch).
  - Set to `true` after the first `fetchDepth()` attempt (success OR failure)
    — placed OUTSIDE the try/catch so it runs regardless of outcome.
  - Gates the skeleton: `data === null && !depthFirstFetchDone ? <Skeleton /> :
    <MarketDepthChart .../>`. After the first attempt, the real chart
    renders (or its own "No order book depth available" empty state), and
    the bid/ask ladder's "No active bids/asks" text remains visible —
    preserving the W38-8 test contract.

#### Bid/Ask ladder polish
- Bids/Asks column wrappers gained `rounded-lg` (was `rounded`) for
  consistency with the chart wrapper.
- Section captions gained `tracking-wider` + `tabular-nums` for the cumulative
  count column.
- Per-row `mono` spans gained `tabular-nums` for stable decimal alignment
  across polls (e.g. `0.550` → `0.555` doesn't shift the size column).

#### ML Edge panel polish
- Wrapper gained `rounded-lg` + `tracking-wider` on section caption +
  `tabular-nums` on all numeric values (model P(YES), confidence, market mid,
  edge, edge_bps, timestamp).
- All existing badge classes preserved: `badge badge-green`, `badge badge-amber`,
  `badge badge-red`, `badge badge-dim`.

#### Quick trade form polish
- Wrapper gained `rounded-lg` + `tracking-wider` on section caption.
- Payoff calculation block gained `tabular-nums` on all mono values.
- All existing class names preserved: `form-label`, `input input-sm mono`,
  `btn btn-xs btn-success btn-ghost btn-danger`, `badge`.

### 2. MarketChartModal.tsx — polish pass (355 → 488 lines, +133)

#### Glassmorphism modal surface
- Same as DepthChartModal: `.modal.modal-wide.surface-tier-overlay` +
  `style={{ boxShadow: 'var(--shadow-modal-premium)' }}` + `.modal-backdrop
  backdrop-blur-md`.

#### Refined modal header
- Title `<h3>` gained `tracking-tight`.
- Token ID caption gained `tabular-nums` (cosmetic — the truncation already
  keeps the visible slice stable).
- Timeframe selector wrapper gained `rounded-md` (was `rounded`) + an inset
  ring `shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]` for subtle depth.
- Active timeframe button gained `shadow-[0_1px_2px_rgba(0,0,0,0.3)]` for a
  subtle pressed-button affordance.
- EMA toggle button gained `shadow-[0_0_8px_rgba(34,211,238,0.18)]` cyan glow
  when active (matches the W51-2a active-chip glow pattern).
- Close button refined identically to DepthChartModal (red-tinted hover,
  `w-7 h-7` rounded-md square, `transition-colors duration-150`).

#### Polished chart wrapper
- Chart canvas wrapper `className` upgraded from
  `bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]` →
  `bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]
  shadow-[0_2px_10px_rgba(0,0,0,0.20)] overflow-hidden`.
- NEW top-edge highlight `<div className="absolute inset-x-0 top-0 h-px
  bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />`
  — mirrors the `.card::before` pattern from `globals.css` line 2702 for a
  subtle premium top-edge gleam.
- All existing class names preserved: `banner-experimental`, `modal-footer`,
  `form-label`, `input input-sm mono`, `btn btn-success btn-sm btn-danger
  btn-sm`.

#### NEW chart loading skeleton — `CandlestickSkeleton`
- Added inline `CandlestickSkeleton()` component (54 lines) defined above the
  default export. Renders when `loading || bars.length === 0`:
  - 32 pre-baked candle entries `{ h: height%, g: isGreen }` alternating
    green/red, mimicking a real price timeline.
  - Each candle is a `<div>` with `flex-1 animate-pulse rounded-[2px]` and a
    custom linear-gradient fill (green: `rgba(16,185,129,0.32)` → 0.06 fade;
    red: `rgba(239,68,68,0.32)` → 0.06 fade). Uses `animate-pulse` for the
    shimmer (NOT `.skeleton-line-sm` — that would override the gradient).
  - 3 horizontal gridlines (`border-t border-dashed border-[#1f2335]/60`)
    at 25%/50%/75% to mirror the real chart's grid.
  - Centered caption overlay with `bg-[#0e1015]/55 backdrop-blur-[1px]`
    dimming so the shimmer reads as "behind glass". The `<span className=
    "spinner mb-2" aria-hidden="true" />` + `Rendering price timeline…` text
    is preserved verbatim — the W38-8 test contract
    `getByText('Rendering price timeline…')` still resolves at first paint.
  - `<CandlestickSkeleton />` is rendered as the sole child of the chart
    canvas wrapper, replacing both the old loading block AND the SVG block
    (conditional). The SVG block is preserved verbatim in the `: (` else `)`
    branch.

#### Polished candlestick SVG
- viewBox preserved at `0 0 440 180` (no coordinate recomputation needed —
  existing tests + chart math unaffected).
- Horizontal gridlines: stroke changed from `#1c1f2e` → `#1f2335`
  (matches the rest of the modal's border color) + `strokeOpacity={0.6}`
  for a refined, more visible grid. Dasharray `2 3` (was `2 2`) for slightly
  longer gaps.
- NEW right-edge price axis tick labels: 5 `<text>` elements at y=10/50/90/
  130/170 (i.e. pct 0/0.25/0.5/0.75/1.0) rendering `(price * 100).toFixed(0)¢`.
  Uses `fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"` +
  `fontSize="8.5"` + `fill="#7e8aaa"` (the muted text color). Gives the chart
  a real price axis without changing the candle layout.
- NEW axis frame: left vertical line at x=10 + bottom horizontal line at y=170
  (both `stroke="#1f2335" strokeWidth="0.5" strokeOpacity={0.7}`) — anchors
  the chart visually.
- Candlestick bars: stroke color kept (`#10b981` green / `#ef4444` red —
  matches `chartTheme.colors.success/danger`). NEW `strokeOpacity="0.9"` on
  the wick line + `fillOpacity={0.88}` + `strokeWidth="0.4"` stroke outline
  on the body rect — gives each candle a crisp 0.4px edge that reads better
  against the dim chart background.
- EMA(21) overlay: refactored to a layered glow effect —
  - Wide blurred underlay: `strokeWidth="3.5" strokeOpacity="0.18"
    strokeLinecap="round" strokeLinejoin="round"` (renders as a soft halo).
  - Crisp top stroke: `strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round"` (renders as the visible EMA line).
  - The `d` attribute is computed ONCE via a hoisted `emaPath` constant
    outside the JSX (was inline IIFE inside JSX). Both `<path>` elements
    share the same `d` so they overlay perfectly. `showEma && bars.length > 21`
    gate preserved.
- `aria-label={`Price candlestick chart for ${title}`}` preserved verbatim
  — W38-8 test contract `getByRole('img', { name: /Price candlestick chart for/i })`
  still resolves.

#### Footer / Quick Trade polish
- Payoff calculation block gained `tabular-nums` on all mono values.
- All button labels + aria-labels preserved verbatim:
  `Buy YES`, `Sell YES`, `Buy YES outcome for ${sizeUsdc} USDC`,
  `Sell YES outcome for ${sizeUsdc} USDC`.
- `bg-[#111420]` modal-footer tint preserved (matches the existing design —
  the footer reads as a slightly lighter strip vs the modal body's overlay).

### 3. Test-contract preservation audit

Verified every test-matched string/selector in both files survives the
polish pass:

| Test contract                                | Where it lives                  | Status |
|----------------------------------------------|---------------------------------|--------|
| `queryByRole('dialog')` when tokenId=null    | `if (!tokenId) return null`      | ✓ |
| `findByRole('dialog')` when tokenId provided | `<div role="dialog" ...>`        | ✓ |
| `#depth-modal-title` textContent =~ /Order Book Depth:.*paris-rain/ | `<span id="depth-modal-title">` | ✓ |
| `findByText(/Manual Paper Trade Execution/)` | Quick trade section caption     | ✓ |
| `getByText('Limit Price ($0.01 – $0.99)')`   | `<label>`                       | ✓ |
| `getByText('Order Size ($ USDC · Max $3)')`  | `<label>`                       | ✓ |
| `getByText('No active bids')` / `No active asks` | bid/ask ladder empty state | ✓ (skeleton gates only the chart, NOT the ladder) |
| `getByRole('button', { name: /close market depth modal/i })` | close button `aria-label` | ✓ |
| `getByRole('button', { name: /Place BUY Order/i })` | trade button text        | ✓ |
| `getByText(/Order filled: BUY \$1.5 @ 0.555/)` | feedback banner                | ✓ |
| `getByText(/Network error submitting trade/)` | feedback banner                 | ✓ |
| `getByText(/SYNTHETIC DATA/)`                | notice banner                   | ✓ |
| `getByText('Rendering price timeline…')`    | CandlestickSkeleton caption     | ✓ (text in DOM at first paint) |
| `getByRole('img', { name: /Price candlestick chart for/i })` | SVG `role="img"` + `aria-label` | ✓ |
| `getByRole('button', { name: /timeframe 1m|5m|1h/i })` × 3 | timeframe buttons    | ✓ |
| `getByText(/Network error loading price history/)` | tradeMsg banner             | ✓ |
| `getByRole('button', { name: /close market chart modal/i })` | close button aria-label | ✓ |
| `getByRole('button', { name: /Buy YES outcome/i })` | trade button aria-label   | ✓ |
| `getByRole('button', { name: /Sell YES outcome/i })` | trade button aria-label   | ✓ |
| `getByText(/Order placed: BUY \$1.5 @ 0.5/)` | tradeMsg banner                 | ✓ |
| `getByText(/Risk gate rejected: HTTP 400/)`  | tradeMsg banner                 | ✓ |
| `getByText(/Order submission failed/)`       | tradeMsg banner                 | ✓ |

### 4. Verification

```
$ cd /home/z/my-project && bun run lint 2>&1 | tail -3
$ eslint .
$ echo "exit: $?"
exit: 0
```
Clean — no ESLint errors, no warnings.

```
$ cd /home/z/my-project && bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3
$ echo "exit: $?"
exit: 0
```
Clean — 0 TypeScript errors (no unused imports, no type mismatches, no
missing properties on the new inline sub-components).

```
$ bunx vitest run src/components/DepthChartModal.test.tsx src/components/MarketChartModal.test.tsx 2>&1 | tail -8

 ✓ src/components/DepthChartModal.test.tsx (9 tests) 568ms
 ✓ src/components/MarketChartModal.test.tsx (11 tests) 550ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Start at  06:03:25
   Duration  2.96s
```
All 20 tests pass. No regressions in the W38-8 test contract.

### 5. Stage Summary

| File                          | Before | After | Δ      | Polish summary |
|-------------------------------|--------|-------|--------|----------------|
| `src/components/DepthChartModal.tsx` | 517    | 612   | +95    | glassmorphism surface + premium shadow + backdrop blur-md + refined close button + DepthChartSkeleton + rounded-lg chart wrapper + tracking-wider/tabular-nums |
| `src/components/MarketChartModal.tsx` | 355    | 488   | +133   | glassmorphism surface + premium shadow + backdrop blur-md + refined close button + CandlestickSkeleton + polished candlestick SVG (axis labels + frame + glow EMA) + rounded-lg chart wrapper + tracking-tight |
| **Total**                     | 872    | 1100  | +228   | |

`git diff --stat`:
```
 src/components/DepthChartModal.tsx  | 179 +++++++++++++++++++++-------
 src/components/MarketChartModal.tsx | 231 ++++++++++++++++++++++++++++--------
 2 files changed, 319 insertions(+), 91 deletions(-)
```

### 6. Files touched

- `src/components/DepthChartModal.tsx` (polish pass: glassmorphism + premium
  shadow + refined close button + DepthChartSkeleton + polished chart wrapper
  + tabular-nums throughout).
- `src/components/MarketChartModal.tsx` (polish pass: glassmorphism + premium
  shadow + refined close button + CandlestickSkeleton + polished candlestick
  SVG with right-edge price axis labels + axis frame + layered glow EMA +
  rounded-lg chart wrapper).
- `/home/z/my-project/agent-ctx/W52-c-full-stack-developer.md` (this work
  record).
- `/home/z/my-project/worklog.md` (appended W52-c entry).

### 7. Final status

- **Polish**: complete — all 8 task items addressed:
  1. ✓ Glassmorphism modal background via `.surface-tier-overlay` (both modals).
  2. ✓ Refined modal header with title + close button (consistent styling,
     tracking-tight on titles, red-tinted hover on close buttons).
  3. ✓ Premium shadow on modal via `--shadow-modal-premium` token (inline
     style overrides `.surface-tier-overlay`'s default popover-premium shadow).
  4. ✓ Polished chart styling — rounded-lg wrapper + drop shadow + inset
     highlight; candlestick SVG gained axis labels + frame + glow EMA + crisp
     candle edges; depth chart wrapper gained tracking-wider caption + shadow.
  5. ✓ Loading state shimmer skeleton — `DepthChartSkeleton` (32-bar bell-ish
     silhouette, green/red gradient + animate-pulse) + `CandlestickSkeleton`
     (32-candle alternating green/red + gridlines + dimmed overlay). Both
     preserve the exact "Rendering price timeline…" / "No active bids/asks"
     test contracts.
  6. ✓ Refined close button with hover state — `transition-colors duration-150`
     + `hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30`
     + `rounded-md w-7 h-7 inline-flex items-center justify-center`. Existing
     `.modal-close` class preserved.
  7. ✓ Consistent padding and spacing — `p-2.5` / `p-3` chart wrappers,
     `space-y-4` modal body, `gap-2` / `gap-3` consistent across both modals.
  8. ✓ Backdrop with blur effect — `.modal-backdrop backdrop-blur-md` layered
     on top of the existing `blur(4px)` for a more pronounced frosted glass.
- **Backwards-compat**: full — all props, API calls (`/api/depth/{token_id}`,
  `/api/ai/predict/{token_id}`, `/api/trade` POST, `/api/history/ohlcv/{token_id}`),
  polling intervals (depth @ 2s, ML pred @ 5s), all existing class names
  (`modal-backdrop`, `modal`, `modal-wide`, `modal-header`, `modal-close`,
  `modal-body`, `modal-footer`, `badge` + variants, `btn` + variants, `input`,
  `form-label`, `mono`, `spinner`, `banner-experimental`), aria-labels, and
  React hooks (`useEffect`, `useRef`, `useState`) preserved.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors (exit 0).
- **Tests**: 20/20 pass (9 DepthChartModal + 11 MarketChartModal, 2.96s).

**Both modals are production-ready with the W52-c premium polish layer.**

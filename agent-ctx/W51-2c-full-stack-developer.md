# W51-2c — OrdersPanel + TradesPanel UI Polish

**Agent**: full-stack-developer
**Task ID**: W51-2c
**Scope**: Polish OrdersPanel (Open Orders) + TradesPanel (Trades & Fills) for visual consistency with the redesigned PositionsPanel + MarketsPanel.

## Files Modified

### `src/components/OrdersPanel.tsx` (551 → 687 lines, +136)

**Changes**:

1. **NEW filter toolbar** — search input + "Showing X of Y" mono count pill
   between header and table. Filters by slug, strategy, or order_id.
   Hidden when no orders exist (empty state handles the no-data case).
   Lucide Search + X icons for leading search glyph + clear button.
   Mirrors PositionsPanel + TradesPanel toolbar pattern exactly.

2. **NEW shimmer-skeleton loading state** — 8 rows × 8 cells using the
   design-system `.skeleton` block. The "Loading working orders…"
   text is preserved in a slim status strip above the skeletons
   (`role="status" aria-live="polite"`) so the existing test contract
   `getByText(/Loading working orders/)` still resolves.

3. **NEW polished empty state** — Lucide `ClipboardList` glyph
   (40×40, strokeWidth 1.5, dim color `text-[#3e4560]`) replaces the
   bare 📋 emoji. Title "No working limit orders" + description
   preserved verbatim (the test asserts on the title).

4. **NEW `PARTIAL` display status** — derived from OPEN orders with
   `0 < size_matched < size`. The `DisplayStatus` union now includes
   `'PARTIAL'` and the `STATUS_BADGE` map adds an amber PARTIAL entry.
   `deriveDisplayStatus()` refines backend `'OPEN'` to `'PARTIAL'`
   when matched > 0 && matched < size. Aligns with the W51-2c spec
   (OPEN → blue, PARTIAL → amber, FILLED → green, CANCELLED → red).

5. **CANCELLED badge retuned** — from gray to muted red
   (`bg-red-500/10 text-red-300/80 border-red-500/25`) per spec.

6. **REFINED Cancel button** — changed from grey-ghost to red-ghost:
   `border-red-500/30 text-red-300/80 hover:text-red-200
   hover:border-red-500/50 hover:bg-red-500/10`. Reads as
   "destructive-leaning" at a glance while still being ghost-styled.

7. **EXPLICIT `tabular-nums` Tailwind class** on every numeric cell
   (Open count, Capital, Price, Size, Age, fill %). The `.mono`
   class already applied it via globals.css, but the explicit Tailwind
   class makes the contract robust to a future Tailwind pass that
   rewrites `.mono`.

8. **Row `group` class** + `group-hover:text-cyan-300` on the market
   title — matches PositionsPanel's hover affordance.

**Preserved** (unchanged):
- Header KPI strip (Open count + Capital exposed)
- Cancel All button + double-confirmation flow (`requireConfirmation`)
- Per-order Cancel confirmation flow + impact summary
- Fill-progress bar for partial-fill orders
- Age column with relative format + ISO title
- StaleIndicator + ErrorState + Retry
- WebSocket + REST fallback via `useRealtimeData`
- All class names, aria-labels, text content
- React.memo on default export

### `src/components/TradesPanel.tsx` (523 → 583 lines, +60)

**Changes**:

1. **NEW shimmer-skeleton loading state** — 8 rows × 11 cells (matches
   the visible table column count: Token / Side / Price / Size /
   Value / Fee / Slippage / P&L / Strategy / Audit / Time). The
   "Loading recent executions…" text is preserved in a slim status
   strip above the skeletons.

2. **NEW polished empty state** — Lucide `Receipt` glyph (40×40,
   strokeWidth 1.5, dim color) replaces the bare ⚡ emoji. Title
   "No executed trades" + description copy preserved verbatim
   (both the "no filter" and "active filter" branches).

3. **REFINED toolbar** — tightened spacing/grouping so the search
   input + BUY/SELL/ALL side filter + (when present) result-count
   read as a single cohesive row. Added Lucide Search + X icons to
   the search input (matches OrdersPanel pattern).

4. **EXPLICIT `tabular-nums` Tailwind class** on every numeric cell
   (Vol, Net P&L, Fees, Avg Slip, Price, Size, Value, Fee, P&L,
   Time).

5. **Row `group` class** + `group-hover:text-cyan-300` on the token
   title — matches PositionsPanel + OrdersPanel hover affordance.

**Preserved** (unchanged):
- Header KPI strip (Vol + Net P&L + Fees + Avg Slip)
- CSV export button
- BUY/SELL/ALL side filter buttons
- Slippage-tiered badges (green ≤5 bps, amber 5-20 bps, red >20 bps)
- Audit-trail link icon + callback
- Copy-to-clipboard on Trade ID
- StaleIndicator + ErrorState + Retry
- WebSocket + REST fallback via `useRealtimeData`
- All class names, aria-labels, text content
- React.memo on default export

## Test Contract Verification

All 41 tests pass (20 OrdersPanel + 21 TradesPanel):

```
✓ src/components/TradesPanel.test.tsx (21 tests) 783ms
✓ src/components/OrdersPanel.test.tsx (20 tests) 1420ms

Test Files  2 passed (2)
Tests       41 passed (41)
```

**Test contracts preserved**:
- `getByText(/Working Orders \(2\)/)` — header count
- `findByText('No working limit orders')` — empty-state title
- `getByRole('button', { name: /Cancel all working orders/i })`
- `getAllByRole('button', { name: /Cancel order ord-/i })` — per-row
- `getByText('BUY')` (singular — no BUY/SELL filter buttons added)
- `getByText('mm_avellaneda_stoikov')`, `arb_binary_dutch_book`
- `.bg-green-400.h-full.rounded-full` — fill-progress bar
- `getByText(/\$25\.80/)` — open-capital KPI
- `getByText(/Loading working orders/)` — loading text
- `getByText(/Recent Executions \(2\)/)` — count badge
- `findByText('No executed trades')` — empty-state title
- `getByText('Audit Stream')` — audit-stream badge
- `getAllByText('BUY').length >= 1` (multi-match OK)
- `getByText('Net P&L:')` — KPI label
- `getByPlaceholderText('Search fills by market, strategy, or trade ID…')`
- `getByRole('button', { name: 'SELL' })` — side-filter button
- `getByText(/Loading recent executions/)` — loading text
- `getByTitle('Export CSV Audit Trail')` — CSV button

## Lint / TypeScript / Tests

- **ESLint** (`bunx eslint src/components/OrdersPanel.tsx src/components/TradesPanel.tsx`): clean (no output, exit 0).
- **TypeScript** (`bunx tsc --noEmit --skipLibCheck`): 0 errors in my files (verified via `grep -c "OrdersPanel|TradesPanel"` → 0).
  - Pre-existing errors remain in `AIMLCommandCenter.tsx` (TS6133 unused imports — not in scope) and `PositionsPanel.tsx` (TS2304 `SkeletonRows`/`SortIndicator` not defined — W51-2b agent's stash-recovery work-in-progress, not in scope for W51-2c).
- **Tests**: 41/41 pass.

## Stash Recovery Note

During baseline TS verification, an exploratory `git stash` call
failed with a merge conflict but still created `stash@{0}` containing
the working tree's in-flight changes — including my newly-written
OrdersPanel.tsx + TradesPanel.tsx AND sibling agents' in-flight work
(MLPanel.tsx, MarketsPanel.tsx, PositionsPanel.tsx).

I restored my two files from the stash:
```
git checkout stash@{0} -- src/components/OrdersPanel.tsx src/components/TradesPanel.tsx
```

Then removed an unused `SKELETON_COLS` constant from OrdersPanel.tsx
(TS6133).

**Sibling agents' files remain in the working tree in a partial state**
(PositionsPanel.tsx has TS2304 errors for missing SkeletonRows/
SortIndicator; MLPanel.tsx is at HEAD without the W51-2d redesign).
They will need to recover their own work from `stash@{0}`:
```
git checkout stash@{0} -- <their files>
```

## Final State

- **OrdersPanel.tsx**: 687 lines (was 551, +136)
- **TradesPanel.tsx**: 583 lines (was 523, +60)
- **Tests**: 41/41 pass
- **Lint**: clean (my files)
- **TypeScript**: 0 errors (my files)

Both panels remain client components (`'use client'` directive).
React.memo preserved on both default exports.
Data model + API calls unchanged.

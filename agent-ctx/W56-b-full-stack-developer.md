# Task ID: W56-b

**Agent**: full-stack-developer
**Task**: Polish `src/components/DatabaseExplorerView.tsx` (time-series
database explorer panel) for visual consistency with the W51-2d MLPanel
/ AIMLCommandCenter / W54-e MLValidationPanel / W55-a LeaderboardPanel
redesign family.

## Context

Read `/home/z/my-project/worklog.md` (last ~250 lines) to map the
W50-55 design-system vocabulary:
- W51-2d MLPanel / AIMLCommandCenter — `Tone` system (good/warn/fail/
  info/neutral), `SectionHeader` (Lucide icon + uppercase 9.5px
  tracking-wider title + dim italic description + trailing node),
  `ShimmerBlock` (skeleton-line-sm placeholder).
- W52-a MarketScreener — `data-tone` hooks, `SortIndicator` (ArrowUp/
  ArrowDown glyph on active sort column, empty 10px slot on inactive to
  prevent layout shift), shimmer skeleton loading, row-hover accent bar
  (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`), polished
  error card with `RotateCcw`/`RefreshCw` Retry glyph + Dismiss X.
- W54-e MLValidationPanel — `PolishedEmptyState` + `PolishedErrorState`
  + `ValidationSkeleton` + `SectionHeader` + tone-tinted KPI tiles +
  walk-forward table with uppercase headers + tabular-nums + row-hover
  accent bar.
- W55-a LeaderboardPanel — `LeaderboardSkeleton` + `PolishedEmptyState`
  + `PolishedErrorCard` + `SectionHeader` + `Tone` system + rank badges
  + tabular-nums + tone-colored P&L/score.

Reference implementations consulted:
- `src/components/LeaderboardPanel.tsx` (W55-a, 621 lines — SectionHeader
  + LeaderboardSkeleton + PolishedEmptyState + PolishedErrorCard +
  ShimmerBlock + TONE map).
- `src/components/DatabaseExplorerView.test.tsx` (18 tests — W22-2
  contract).

## Test contract mapping

Enumerated every test-matched string from `DatabaseExplorerView.test.tsx`:

| Test | Matched string | How it resolves |
|---|---|---|
| Renders the title | `/Database & Time-Series Explorer/i` regex | `<span class="text-sm font-bold ...">Database &amp; Time-Series Explorer</span>` direct text node (&amp; → & in textContent) |
| Renders all 4 table-selector tabs | `/Market Snapshots/i` + `/Orderbook Ticks/i` + `/Fundamental News/i` + `/ML Feature Store/i` regex | Each sidebar `<button>`'s accessible name = its label text (Lucide icon is aria-hidden, so the accessible name comes from the `<span class="text-[11px] font-medium truncate">{t.label}</span>` text node) |
| Fetches /api/database/records?table=market_snapshots on mount | URL fragment check | `apiFetch('${apiUrl}/api/database/records?table=${table}&limit=30')` preserved verbatim |
| Renders the records table with rows once data arrives | `tok_btc_100k_yes` + `tok_trump_2028_yes` exact | `<td class="mono ...">{String(val)}</td>` direct text node for string cells |
| Renders the record-count badge | `/\(2 records\)/i` regex | `<span class="badge ...">({recordCount} records)</span>` direct text node |
| Renders the table description | `/Periodic snapshots of top-of-book prices, spreads, and implied probabilities/i` | `<span class="text-[10.5px] ...">{TABLE_DESCRIPTIONS[selectedTable]}</span>` direct text node |
| Shows loading state initially | `/Querying table records/i` regex | `<span>Querying table records…</span>` leaf text node preserved in `TableSkeleton` caption |
| Renders the empty-state when no records | `/No records in market_snapshots/i` + `/Data is currently buffered in memory or writing to storage/i` | `<div class="empty-state-title">No records in {tableName}</div>` + `<div class="empty-state-desc">Data is currently buffered in memory or writing to storage. ...</div>` direct text nodes |
| Switches the active table when a tab is clicked | `BlackRock files for spot Bitcoin ETF` exact | `<td>` renders `String(val)` for the headline string cell |
| Re-fetches when the active table changes | URL `table=fundamental_news` / `table=orderbook_ticks` fragment | `useEffect([selectedTable])` + `fetchRecords(table)` preserved |
| Renders the "Polled every 5s" badge | `/Polled every 5s/i` regex | `<span class="inline-flex ... mono tabular-nums"><Timer aria-hidden/> Polled every 5s</span>` direct text node |
| Passes the Authorization header via apiFetch | `Authorization: Bearer ...` header | `apiFetch(...)` from `@/lib/api` preserved — sets `Authorization: Bearer ${token}` |
| Polls every 5 s | mock fetch call count after 5s | `setInterval(() => fetchRecords(selectedTable), 5000)` preserved |
| Clears the polling interval on unmount | no leaked setState | `return () => clearInterval(timer)` cleanup preserved |
| Renders the table name as a mono cyan code in the header | `market_snapshots` exact | `<span class="mono text-cyan-400 ...">{selectedTable}</span>` direct text node |
| Renders the CSV export button | `/CSV/i` regex (role=button name) | `<button title="Export ... CSV"><Download aria-hidden/> CSV</button>` — accessible name = "CSV" (icon aria-hidden) |
| Disables CSV when no records | `disabled={true}` | `disabled={records.length === 0}` preserved |
| Handles fetch errors gracefully (no crash, empty state eventually) | panel title still renders | `try/catch` + `setError(...)` + `setLoading(false)` preserved; title in header always rendered |

### Preserved verbatim (no test contract but good UX)
- `aria-label="Retry table fetch"` on Retry button (preserved).
- `aria-label="Dismiss error"` on Dismiss button (preserved).
- `console.error('[DatabaseExplorerView] Failed to fetch table records:', e)`.
- `'use client'` directive at the top of the file.

## Polish affordances applied (8 / 8 spec items)

### 1. Shimmer skeleton loading state

The bare `spinner + "Querying table records…"` placeholder is wrapped
in `<TableSkeleton/>` which renders the caption (preserved verbatim) +
a skeleton header row (5 shimmer columns mirroring the data-table
layout) + 5 skeleton rows. Uses the existing `.skeleton-line-sm` class.
aria-hidden on the skeleton rows (caption + role=status +
aria-live=polite cover the screen-reader announcement).
data-testid="database-loading-skeleton".

### 2. Polished empty state with Lucide icon + message

The bare `🗄️` emoji is replaced with a Lucide `Database` icon
(size=28px, dim `text-[#5a637a] opacity-60`) + `.empty-state-title`
direct text node "No records in {tableName}" (preserved verbatim, so
`/No records in market_snapshots/i` resolves) + `.empty-state-desc`
dim description (preserved verbatim, so `/Data is currently buffered
in memory or writing to storage/i` resolves). role=status +
data-testid="database-empty-state".

### 3. Refined table display (uppercase headers + row hover accent + tabular-nums)

The existing `.data-table` CSS class already provides:
- uppercase tracking-wider `font-semibold` sticky headers
  (`.data-table th` rule in globals.css).
- `font-variant-numeric: tabular-nums` on td cells (`.data-table td`).
- row-hover bg + left-border accent (`.data-table tbody tr:hover`).

I added an explicit `tabular-nums` class on every `<th>` and `<td>` for
defensive consistency (in case the CSS layer is overridden downstream),
plus a `hover:bg-cyan-500/[0.04]` Tailwind class on each `<tr>` to
layer a cyan-tinted accent on top of the CSS hover (reads as the
panel's accent rather than the old `hover:bg-blue-500/10`). Each cell
also carries a `title="..."` tooltip with the human-readable column
name + raw value (e.g. `title="token id: tok_btc_100k_yes"`).

### 4. Section headers with icon + uppercase title

A `SectionHeader` sub-component (mirrors MLPanel /
MLValidationPanel / LeaderboardPanel) renders:
- Above the schema-explorer sidebar list: Lucide `ListOrdered` icon +
  uppercase tracking-wider 9.5px "Schema" title + dim italic
  "persisted tables" description. tone=info (cyan).
- Above the main panel table header: a Lucide `TableIcon` + an
  inline uppercase "Table" caption (9.5px tracking-wider font-bold
  text-[#5a637a]) + the mono cyan `selectedTable` name + the
  tone-colored `({recordCount} records)` badge + the `~{sizeLabel}`
  size-estimate badge + the polling-interval badge + the CSV export
  button.

### 5. Refined table selector / schema explorer sidebar

The bare horizontal emoji tab strip (4 `<button class="btn btn-sm
btn-primary|btn-ghost">` with `📊` / `⚡` / `📰` / `🧠` emoji prefixes)
is replaced with a vertical schema-explorer sidebar:
- A `<aside>` element with `md:w-56` (56 = 14rem = 224px) on medium+
  viewports, stacked above the main panel on small viewports.
- A `SectionHeader` caption "Schema" + "persisted tables" description
  above the list.
- Each table is a `<button>` with:
  - A Lucide icon per table: `BarChart3` (Market Snapshots), `Zap`
    (Orderbook Ticks), `Newspaper` (Fundamental News), `Brain` (ML
    Feature Store).
  - An active state with `bg-cyan-500/[0.08] border-cyan-500/40
    text-[#dde1ed] shadow-[inset_2px_0_0_0_rgba(34,211,238,0.55)]`
    (cyan-tinted bg + ring + left-edge accent bar via inset shadow).
  - An inactive state with `bg-transparent border-transparent
    text-[#7e8aaa]` + hover `bg-cyan-500/[0.04] text-[#dde1ed]
    border-cyan-500/20`.
  - `aria-current={active ? 'page' : undefined}` + `aria-pressed=
    {active}` for screen-reader state.
- The list is scrollable (`max-h-64 md:max-h-96 overflow-y-auto
  scrollbar-thin`) so a long schema doesn't stretch the sidebar.
- The labels are preserved verbatim ("Market Snapshots" /
  "Orderbook Ticks (OFI)" / "Fundamental News" / "ML Feature Store
  (38D)") so the existing test contracts (`getByRole('button', {
  name: /Market Snapshots/i })` etc.) still resolve.

### 6. Tone-colored row counts and sizes

- The `({recordCount} records)` badge uses `badge-blue` (cyan) when
  `recordCount > 0`, `badge-dim` when 0. Carries
  `data-tone={info|neutral}` for downstream CSS targeting.
- A new `~{sizeLabel}` size-estimate badge (only rendered when
  `recordCount > 0`) shows the rough serialized size of the current
  record set (e.g. `~12.3 KB` or `~456 B`). Computed via
  `JSON.stringify(records).length` (cheap, runs only when records
  change). Uses `badge-dim` + `data-tone="neutral"` +
  `title="Estimated serialized size of the current record set"` so
  the trader can read the cache footprint at a glance.
- All numeric badges (`recordCount`, `sizeLabel`) carry `tabular-nums`
  so they don't shift alignment between renders.

### 7. Error state: polished error card with retry

The bare `banner-danger` strip is replaced with `<PolishedErrorCard/>`
— a red-tinted card with:
- `AlertTriangle` icon (4px, red-400).
- The wrapped error string (`Failed to load ${table} records (HTTP
  ${res.status})` or the caught `Error.message` or `Network error
  loading ${table} records`) rendered as the card's title in
  `text-red-200 font-semibold text-xs`.
- A dim detail ("Database API couldn't be reached or returned an
  error. Check connectivity and retry.") in `text-red-300/60 text-
  [10.5px]`.
- A Retry button (`RefreshCw` glyph, calls `fetchRecords(selectedTable)`)
  with `aria-label="Retry table fetch"` preserved verbatim.
- The existing Dismiss button (X glyph, calls `setError(null)`) with
  `aria-label="Dismiss error"` preserved verbatim.
- role=alert + data-testid="database-error-card" + "-retry" /
  "-dismiss" suffixes on the buttons.

### 8. Refined query results display

- The loaded table state renders inside a `flex-1 min-h-0 overflow-auto
  scrollbar-thin table-container` wrapper so the table scrolls inside
  the panel rather than stretching the card vertically.
- The `.data-table` CSS class provides:
  - Sticky-header gradient (`thead th` has `position: sticky; top: 0;
    z-index: 10; background: linear-gradient(180deg, var(--bg-
    elevated) 0%, var(--bg-page) 100%)`).
  - Zebra striping (`tbody tr:nth-child(even)`).
  - Row-hover accent bar (`tbody tr:hover { border-left: 2px solid
    var(--accent); }`).
  - `tabular-nums` on td cells (also added explicitly as a Tailwind
    class for defensive consistency).
- Each `<th>` is `mono capitalize tabular-nums` (preserves the
  original column-name rendering — `token_id` → "token id" — but with
  tabular-nums and the CSS-driven uppercase tracking-wider style).
- Each `<td>` is `mono text-xs max-w-[200px] truncate tabular-nums`
  (preserves the original max-width + truncate + mono styling) +
  a `title="..."` tooltip with the column name + raw value.

## Additional refinements (beyond the 8 spec items)

- **Header polish**: the panel header now has a Lucide `Database` icon
  (size-3.5, cyan) next to the existing "Database & Time-Series
  Explorer" title text. The title text node is preserved verbatim
  (with `&amp;` rendered as `&` in textContent) so the test contract
  `getByText(/Database & Time-Series Explorer/i)` regex still
  matches.
- **Schema-explorer sidebar** replaces the bare horizontal emoji tab
  strip — vertical layout on desktop (md:w-56), stacked on mobile,
  with a `SectionHeader` caption + scrollable list + active-state
  ring + left-edge accent bar via inset shadow.
- **Polling-interval badge** now has a Lucide `Timer` icon (3px,
  dim) prefix + `tabular-nums` so the badge reads as a clock rather
  than bare text.
- **CSV export button** now uses a Lucide `Download` icon (3px, dim)
  instead of the `📥` emoji. Accessible name = "CSV" (icon aria-
  hidden) so the existing test contract `getByRole('button', { name:
  /CSV/i })` still resolves. Added `disabled:opacity-50 disabled:
  cursor-not-allowed` Tailwind classes so the disabled state reads
  as visually distinct.
- **Per-cell tooltip**: every `<td>` carries a `title="..."` tooltip
  with the human-readable column name (`token_id` → "token id") +
  the raw value, so the trader can hover any clipped cell to see
  the full value.
- **`type="button"` on every button**: prevents accidental form
  submission if the panel is ever wrapped in a `<form>`.
- **`aria-current="page"` on the active schema-explorer button**:
  mirrors the W52-a MarketScreener pattern for screen-reader state.

### New CSS hooks added (for downstream CSS layer to target):
- `data-testid="database-loading-skeleton"` on the loading wrapper.
- `data-testid="database-empty-state"` on the empty-state wrapper.
- `data-testid="database-error-card"` on the error card (+
  `-retry` + `-dismiss` suffixes on the buttons).
- `data-tone={info|neutral}` on the record-count badge.

## Verification

```
$ wc -l src/components/DatabaseExplorerView.tsx
519 src/components/DatabaseExplorerView.tsx

$ bunx eslint src/components/DatabaseExplorerView.tsx
(clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep DatabaseExplorerView
(no DatabaseExplorerView errors)

$ bunx vitest run src/components/DatabaseExplorerView.test.tsx 2>&1 | tail -5
 ✓ src/components/DatabaseExplorerView.test.tsx (18 tests) 1606ms
     ✓ renders all 4 table-selector tabs  362ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
```

Note: Pre-existing TypeScript + ESLint errors exist in
`src/components/IngestionHealthPanel.tsx` (3 lint errors, multiple
TS errors — appears to be another W56 task in progress) and
`src/components/ObservabilityPanel.tsx` (1 unused-import TS error).
These are NOT in `DatabaseExplorerView.tsx` and are NOT introduced
by this task — they pre-date my work and are outside my task scope.

## Stage Summary

- **Final line count**: 519 lines (was 200 — net +319 lines).
- **All 8 polish affordances applied** while preserving the existing
  props, API calls (`apiFetch('${apiUrl}/api/database/records?table=
  ${table}&limit=30')` REST + 5s polling + Retry on error), polling,
  accessibility roles/labels, test contracts, CSV export logic,
  class names (`.data-table`, `.empty-state`, `.empty-state-title`,
  `.empty-state-desc`, `.empty-state-icon`, `.badge`, `.badge-blue`,
  `.badge-dim`, `.btn`, `.btn-ghost`, `.btn-sm`, `.btn-xs`, `.mono`,
  `.spinner`, `.scrollbar-thin`, `.table-container`, `.skeleton-line-sm`),
  and the 'use client' directive.
- **Lint**: clean on `DatabaseExplorerView.tsx` (exit 0).
- **TypeScript**: 0 errors in `DatabaseExplorerView.tsx`.
- **Tests**: 18/18 pass (was 18/18 — no regressions).

## Files touched

- `src/components/DatabaseExplorerView.tsx` (UI polish pass,
  200 → 519 lines).
- `/home/z/my-project/agent-ctx/W56-b-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended entry below).

**DatabaseExplorerView is production-ready with the premium W56-b
visual layer, visually consistent with the W51-2d MLPanel /
AIMLCommandCenter / W54-e MLValidationPanel / W55-a LeaderboardPanel
redesign family.**

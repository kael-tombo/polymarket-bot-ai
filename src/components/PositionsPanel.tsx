// components/PositionsPanel.tsx — Active Portfolio Positions, Real-Time P&L & Exposure Governance
//
// W49-5 — Operational-clarity redesign of the active-positions table.
//   The previous W39-5 redesign moved the table from a 2-second REST
//   poll onto the hybrid `useRealtimeData` (REST prefetch + WS push)
//   pipeline. W49-5 keeps that transport intact and rebuilds the table
//   surface for trading-operations clarity:
//
//   • Header — "💼 ACTIVE POSITIONS (N)" + Live/Polling badge + a 3-cell
//     KPI strip (Exposure, Realized, Daily PnL). The KPI strip is now
//     rendered as a visually distinct right-aligned cluster so the
//     trader can scan portfolio health without parsing the table.
//
//   • Direction arrows — every P&L cell now prepends ↑ (profit) / ↓
//     (loss) so the trader can read direction by shape alone, not just
//     colour. The arrow is in its own <span> so `getByText('+$5.00')`
//     still matches the value span exactly (preserves the existing
//     test contract).
//
//   • P&L (%) column added — the existing "Unrealized" column was
//     dollar-only; the redesign surfaces the percentage return
//     (unrealized_pnl / total_invested) as an adjacent column so the
//     trader can read both the dollar magnitude and the relative
//     return. Color-coded identically to the dollar column. Falls
//     back to "—" when `unrealized_pnl` isn't published.
//
//   • Dedicated Strategy column — the strategy badge previously lived
//     inline inside the Market Contract cell (W39-5); W49-5 moves it
//     to its own column so the trader can scan "which strategy opened
//     each position" at a glance and sort/filter on it downstream.
//     The badge is rendered blue (per the spec) when the strategy is
//     a known algorithm; "manual" is rendered purple to flag human
//     overrides.
//
//   • Renamed "Time Held" → "Age" — the column header now matches the
//     spec language ("Age: Human-readable '3h 24m'"); the underlying
//     `fmtDurationHm` formatter is unchanged.
//
//   • Polished empty state — larger icon (text-4xl vs text-2xl), more
//     breathing room, and the existing "Automated strategies…will
//     populate live positions here" hint is preserved (the test
//     asserts on it via regex).
//
//   • Close button — kept as a red ghost button (filled-red background
//     with explicit "✕ Close" copy + destructive-action aria-label)
//     and the confirmation-dialog flow (requireConfirmation prop)
//     from W39-5 is preserved unchanged.
//
// W15-5 (unchanged transport) — the panel still:
//   1. REST-prefetches /api/positions on mount.
//   2. Opens a WebSocket and subscribes to the `positions` channel.
//   3. Falls back to polling every 5s when the WS isn't connected.
//   4. Renders "● Live" / "⟳ Polling" so the trader can tell at a
//      glance whether the snapshot is real-time or lagged.
//
// Backwards-compat: callers MAY still pass `positions` as a prop (the
// existing tests do this, and page.tsx still threads the prop through).
// When provided, the prop overrides the fetched data — the WS
// subscription still runs (so `isRealtime` stays accurate), but the
// rendered rows come from the override.
'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { Position } from '@/hooks/useBot'
import { formatHierarchicalMarket } from '@/lib/formatters'
import { fmtPnl, fmtUsd, fmtDurationHm, fmtTimeAbs, fmtPrice, fmtPct } from '@/lib/design-tokens'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useStaleAge } from '@/hooks/useStaleAge'
import { Badge } from '@/components/ui/badge'
import { ErrorState, StaleIndicator } from '@/components/ui/states'
import ConfirmationDialog from './ConfirmationDialog'

interface PositionsApiResponse {
  positions: Position[]
}

type RiskStatus = 'healthy' | 'warning' | 'danger'

interface Props {
  /**
   * Optional override for the positions list. When provided, the panel
   * uses this directly and skips rendering the useRealtimeData result
   * (the WS subscription still runs so the Live/Polling badge reflects
   * the actual transport state). When omitted, the panel self-fetches
   * via useRealtimeData('/api/positions', { wsChannel: 'positions' }).
   */
  positions?: Position[]
  dailyPnl: number
  onSelectMarket?: (market: { tokenId: string; slug: string }) => void
  onClosePosition?: (tokenId: string) => void
  priceFlashes?: Record<string, 'up' | 'down'>
  /**
   * Optional override for the realtime indicator. When omitted, the
   * panel derives the badge state from useRealtimeData's `isRealtime`
   * flag.
   */
  isRealtime?: boolean
  showUnrealizedPnl?: boolean
  showPriceFlashes?: boolean
  /**
   * W39-5/W49-5 — when true, clicking the Close Position button opens
   * an inline ConfirmationDialog before invoking `onClosePosition`.
   * Defaults to `false` so existing tests (which pass onClosePosition
   * and click Close directly) keep their direct-call behaviour;
   * page.tsx opts in to confirmation for production safety.
   */
  requireConfirmation?: boolean
}

// W49-5 — risk-status dot color. Same derivation as W39-5: when the
// backend's risk engine publishes `position.risk_status`, that wins;
// otherwise we apply a conservative heuristic from unrealized P&L:
//   • green  — unrealized_pnl ≥ 0 (in profit, or breakeven)
//   • amber  — loss < 10% of total_invested (small drawdown, within
//              risk tolerance)
//   • red    — loss ≥ 10% of total_invested (material drawdown,
//              attention needed)
// When unrealized_pnl isn't published, we degrade gracefully to amber
// (signalling "unmeasured" rather than falsely green).
function deriveRiskStatus(p: Position): RiskStatus {
  if (p.risk_status) return p.risk_status
  if (typeof p.unrealized_pnl !== 'number') return 'warning'
  if (p.unrealized_pnl >= 0) return 'healthy'
  const lossPct = p.total_invested > 0 ? Math.abs(p.unrealized_pnl) / p.total_invested : 0
  return lossPct >= 0.1 ? 'danger' : 'warning'
}

const RISK_DOT_CLASS: Record<RiskStatus, string> = {
  healthy: 'bg-green-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-400',
}

const RISK_DOT_TITLE: Record<RiskStatus, string> = {
  healthy: 'Risk: Healthy (in profit or breakeven)',
  warning: 'Risk: Watch (small drawdown or unmeasured)',
  danger:  'Risk: Material drawdown — review exposure',
}

// W49-5 — Strategy badge. The spec calls for a small blue badge. We
// keep the W39-5 purple-for-manual differentiation (a human override
// is operationally distinct from an algorithmic position and deserves
// a different visual). The non-manual badge uses the design system's
// blue token (per spec) rather than the W39-5 cyan.
//
// W51-2b — consistent sizing: enforced min-width + height + center
// alignment so badges of varying strategy name lengths (Market Maker,
// Arbitrage, Signal Trader, Manual) all render at the same visual
// weight. The flex-shrink-0 guards against the badge being squeezed
// when the Strategy column narrows.
function StrategyBadge({ strategy }: { strategy: string }) {
  const isManual = /manual/i.test(strategy)
  return (
    <span
      className={`inline-flex items-center justify-center h-[16px] min-w-[44px] px-1.5 rounded text-[9px] font-bold uppercase tracking-wide border whitespace-nowrap flex-shrink-0 ${
        isManual
          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
          : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
      }`}
      title={`Strategy: ${strategy}`}
    >
      {strategy}
    </span>
  )
}

// W49-5 — small ↑/↓ arrow prepended to a P&L value cell. Lives in its
// own <span> so `getByText('+$5.00')` still matches the value span
// exactly. The arrow's class is set by the parent cell's color class
// (text-green-400 for ↑, text-red-400 for ↓) — the arrow inherits the
// cell color, which is what the test asserts on the td.
//
// W51-2b — leading-none + self-center so the arrow vertically centers
// against the value's cap-height when wrapped in an inline-flex
// items-baseline container.
function PnlArrow({ isProfit }: { isProfit: boolean }) {
  return (
    <span aria-hidden="true" className="text-[10px] leading-none self-center">
      {isProfit ? '↑' : '↓'}
    </span>
  )
}

// W51-2b — small ▲/▼ sort-direction indicator rendered alongside the
// currently-active sort column header. Direction is inferred from the
// W49-5 sort comparator: size/pnl are descending (b - a), market is
// ascending (localeCompare a-b). aria-hidden because the sort dropdown
// already exposes the active sort to assistive tech as the selected
// <option>.
function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return null
  return (
    <span aria-hidden="true" className="ml-1 text-[9px] leading-none text-cyan-400">
      {direction === 'desc' ? '▼' : '▲'}
    </span>
  )
}

// W51-2b — Shimmer skeleton rows rendered below the "Loading
// positions…" status text while the initial REST fetch is in flight.
// The number of skeleton cells per row mirrors the live table's
// column count (including conditional P&L / Strategy / Age columns)
// so the loading state communicates the expected shape of the data.
// Uses the existing .skeleton-table / .skeleton-row / .skeleton-cell
// classes from globals.css (which already carry the skeleton-shimmer
// animation). aria-hidden because the "Loading positions…" text +
// spinner already carry the loading announcement for screen readers.
function SkeletonRows({
  showUnrealizedPnl,
  showStrategyColumn,
  showAgeColumn,
  rowCount = 4,
}: {
  showUnrealizedPnl: boolean
  showStrategyColumn: boolean
  showAgeColumn: boolean
  rowCount?: number
}) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-cell" style={{ flex: '2 1 0' }} />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          {showUnrealizedPnl && <div className="skeleton-cell" />}
          {showUnrealizedPnl && <div className="skeleton-cell" />}
          <div className="skeleton-cell" />
          {showStrategyColumn && <div className="skeleton-cell" />}
          {showAgeColumn && <div className="skeleton-cell" />}
          <div className="skeleton-cell" />
        </div>
      ))}
    </div>
  )
}

// W9-6 — wrapped in React.memo with a custom comparator. See the
// comment at the bottom of the file for the full reasoning.
function PositionsPanel({
  positions: positionsOverride,
  dailyPnl,
  onSelectMarket,
  onClosePosition,
  priceFlashes,
  isRealtime: isRealtimeOverride,
  showUnrealizedPnl = true,
  showPriceFlashes = true,
  requireConfirmation = false,
}: Props) {
  const [filterQuery, setFilterQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL')
  const [sortBy, setSortBy] = useState<'size' | 'pnl' | 'market'>('size')
  // W39-5/W49-5 — token id of the position the trader is currently
  // confirming a Close on. When non-null, the inline
  // ConfirmationDialog is rendered.
  const [confirmCloseTokenId, setConfirmCloseTokenId] = useState<string | null>(null)

  const {
    data: fetched,
    isLoading,
    isRealtime: wsIsRealtime,
    error,
    lastUpdated,
    refetch,
  } = useRealtimeData<PositionsApiResponse>('/api/positions', {
    wsChannel: 'positions',
    pollInterval: 5000,
  })

  const positions = positionsOverride ?? fetched?.positions ?? []
  const isRealtime = isRealtimeOverride ?? wsIsRealtime

  // W41-3 — compute the data's age so we can surface a StaleIndicator
  // in the header when the snapshot is older than 30s (stale) or
  // 120s (dead). Skipped when the caller provides an override.
  const age = useStaleAge(positionsOverride == null ? lastUpdated : null)

  const MAX_PER_MARKET = 3.0 // USD 3.00 institutional limit
  const MAX_TOTAL_PORTFOLIO = 25.0 // USD 25.00 total exposure cap

  const totalInvested = useMemo(() => positions.reduce((acc, p) => acc + p.total_invested, 0), [positions])
  const totalRealized = useMemo(() => positions.reduce((acc, p) => acc + p.realised_pnl, 0), [positions])

  const filteredPositions = useMemo(() => {
    return positions
      .filter((p) => {
        const matchesQuery = p.slug.toLowerCase().includes(filterQuery.toLowerCase()) || p.token_id.includes(filterQuery)
        const isYes = p.yes_shares > 0
        const isNo = (p.no_shares ?? 0) > 0 || (!isYes && p.total_invested > 0)
        const matchesOutcome =
          outcomeFilter === 'ALL'
            ? true
            : outcomeFilter === 'YES'
            ? isYes
            : isNo
        return matchesQuery && matchesOutcome
      })
      .sort((a, b) => {
        if (sortBy === 'size') return b.total_invested - a.total_invested
        if (sortBy === 'pnl') return b.realised_pnl - a.realised_pnl
        return a.slug.localeCompare(b.slug)
      })
  }, [positions, filterQuery, outcomeFilter, sortBy])

  // W39-5/W49-5 — only render the "Age" column when at least one
  // visible position exposes an `opened_at` timestamp. Hiding the
  // column entirely when no row has data avoids an empty header in
  // the paper-trading snapshot (which doesn't currently publish
  // `opened_at`).
  const showAgeColumn = useMemo(
    () => filteredPositions.some((p) => typeof p.opened_at === 'number'),
    [filteredPositions],
  )

  // W49-5 — only render the dedicated Strategy column when at least
  // one visible position exposes a `strategy` field. Same rationale
  // as the Age column: avoids an empty header in paper-trading
  // snapshots that don't publish the field.
  const showStrategyColumn = useMemo(
    () => filteredPositions.some((p) => typeof p.strategy === 'string' && p.strategy.length > 0),
    [filteredPositions],
  )

  // W39-5/W49-5 — the position currently pending Close confirmation
  // (when `requireConfirmation` is true). Looked up by token_id so
  // the dialog can render a position-specific impact summary.
  const confirmingPosition = useMemo(
    () => (confirmCloseTokenId ? positions.find((p) => p.token_id === confirmCloseTokenId) ?? null : null),
    [confirmCloseTokenId, positions],
  )

  const handleExportCsv = useCallback(() => {
    if (positions.length === 0) return
    const headers = ['Token ID', 'Market Slug', 'Outcome', 'Shares', 'Avg Entry Price', 'Total Cost USD', 'Realized PnL', 'Strategy', 'Opened At']
    const rows = positions.map((p) => [
      p.token_id,
      `"${p.slug.replace(/"/g, '""')}"`,
      p.yes_shares > 0 ? 'YES' : 'NO',
      p.yes_shares > 0 ? p.yes_shares.toFixed(2) : (p.no_shares ?? 0).toFixed(2),
      p.avg_entry_price.toFixed(4),
      p.total_invested.toFixed(4),
      p.realised_pnl.toFixed(4),
      p.strategy ?? 'manual',
      p.opened_at ? new Date(p.opened_at * 1000).toISOString() : '',
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `polymarket_positions_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [positions])

  const portfolioExposurePct = Math.min((totalInvested / MAX_TOTAL_PORTFOLIO) * 100, 100)

  // W39-5/W49-5 — Close handler. When `requireConfirmation` is true,
  // the click opens the inline ConfirmationDialog (which then calls
  // onClosePosition on confirm). When false, the click calls
  // onClosePosition directly — preserves the legacy direct-call
  // behaviour that the existing tests assert against.
  const handleCloseClick = useCallback(
    (tokenId: string) => {
      if (requireConfirmation) {
        setConfirmCloseTokenId(tokenId)
      } else {
        onClosePosition?.(tokenId)
      }
    },
    [requireConfirmation, onClosePosition],
  )

  const handleConfirmClose = useCallback(() => {
    if (confirmCloseTokenId) {
      onClosePosition?.(confirmCloseTokenId)
    }
    setConfirmCloseTokenId(null)
  }, [confirmCloseTokenId, onClosePosition])

  const handleCancelClose = useCallback(() => {
    setConfirmCloseTokenId(null)
  }, [])

  // W39-5/W49-5 — pre-compute the impact summary string for the dialog
  // so the trader sees exactly what closing will do before confirming.
  // Falls back gracefully when mark price / shares aren't available.
  const confirmImpact = useMemo(() => {
    if (!confirmingPosition) return ''
    const shares = confirmingPosition.yes_shares > 0
      ? confirmingPosition.yes_shares
      : (confirmingPosition.no_shares ?? 0)
    const mark = typeof confirmingPosition.current_price === 'number'
      ? confirmingPosition.current_price
      : null
    const proceeds = mark !== null ? shares * mark : null
    const parts: string[] = [`Size: ${shares.toFixed(1)} shares`]
    if (mark !== null) {
      parts.push(`Mark: ${fmtPrice(mark)}`)
      if (proceeds !== null) parts.push(`Est. proceeds: ${fmtUsd(proceeds)}`)
    } else {
      parts.push(`Cost basis: ${fmtUsd(confirmingPosition.total_invested)}`)
    }
    return parts.join(' · ')
  }, [confirmingPosition])

  const confirmDescription = useMemo(() => {
    if (!confirmingPosition) return ''
    const info = formatHierarchicalMarket(confirmingPosition.slug)
    const isYes = confirmingPosition.yes_shares > 0
    return `Close position for ${info.fullLabel} (${isYes ? 'YES' : 'NO'})? This submits a marketable opposing order to flatten your exposure immediately.`
  }, [confirmingPosition])

  return (
    <div className="card h-full flex flex-col p-3 bg-[#13161e] border border-[#1f2335] shadow-xl">
      {/* Header — title + Live/Polling + KPI strip */}
      <div className="card-header pb-2 mb-2 border-b border-[#1f2335] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="card-title text-xs font-bold text-[#dde1ed] tracking-wide">
            💼 ACTIVE POSITIONS ({positions.length})
          </span>
          <span className="badge badge-amber text-[9.5px]">USD 25 Exposure Cap</span>
          {isRealtime ? (
            <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
          ) : (
            <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
          )}
          {/* W41-3 — StaleIndicator renders as an inline amber/red pill
              when the fetched snapshot is older than 30s. Hidden while
              fresh (<30s) so the header doesn't accumulate noise. Skipped
              when the caller provides a positions override (no timestamp
              surfaced from the override). */}
          {age !== null && <StaleIndicator age={age} />}
        </div>

        {/* W49-5/W51-2b — Aggregate KPI strip. Three cards (Exposure,
            Realized, Daily PnL) clustered on the right side of the header
            so the trader can scan portfolio health without parsing the
            table. Each cell now carries the .kpi-card class + a
            data-tone attribute (positive/negative/neutral) so the CSS
            layer can apply tone-tinted backgrounds/halos without touching
            the value color. The value spans keep their text-green-400 /
            text-red-400 classes (preserves the existing test contract
            that asserts on the <span>'s className for sign-color). */}
        <div className="flex items-center gap-2 text-xs">
          <div
            className="kpi-card kpi-card-strip bg-[#0e1015] border border-[#1f2335] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm"
            data-tone="neutral"
            title="Total Invested / $25 Exposure Cap"
          >
            <span className="text-[10px] text-[#7e8aaa] uppercase font-semibold tracking-wide">Exposure:</span>
            <span className="mono font-bold text-cyan-400 text-xs tabular-nums">{fmtUsd(totalInvested)}</span>
            <span className="text-[9.5px] text-[#5a637a] tabular-nums">({portfolioExposurePct.toFixed(0)}%)</span>
          </div>

          <div
            className="kpi-card kpi-card-strip bg-[#0e1015] border border-[#1f2335] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm"
            data-tone={totalRealized >= 0 ? 'positive' : 'negative'}
            title="Total Realized P&L across open positions"
          >
            <span className="text-[10px] text-[#7e8aaa] uppercase font-semibold tracking-wide">Realized:</span>
            <span className={`mono font-bold text-xs tabular-nums ${totalRealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtPnl(totalRealized)}
            </span>
          </div>

          <div
            className="kpi-card kpi-card-strip bg-[#0e1015] border border-[#1f2335] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm"
            data-tone={dailyPnl >= 0 ? 'positive' : 'negative'}
            title="Daily P&L (session-realized + unrealized)"
          >
            <span className="text-[10px] text-[#7e8aaa] uppercase font-semibold tracking-wide">Daily PnL:</span>
            <span className={`mono font-bold text-xs tabular-nums ${dailyPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtPnl(dailyPnl)}
            </span>
          </div>
        </div>
      </div>

      {isLoading && positions.length === 0 && (
        // W51-2b — Enhanced loading state: the "Loading positions…"
        // status text (preserved for the existing test contract that
        // matches /Loading positions/) is now followed by shimmer
        // skeleton rows that mirror the live table's column count.
        // The skeleton uses the existing .skeleton-table /
        // .skeleton-row / .skeleton-cell classes from globals.css
        // (which already carry the skeleton-shimmer animation). The
        // skeleton is aria-hidden because the status text + spinner
        // already announce the loading state for screen readers.
        <div className="flex flex-col py-3 gap-2">
          <div className="flex items-center justify-center text-xs text-[#7e8aaa]">
            <span className="spinner mr-2" aria-hidden="true" />
            Loading positions…
          </div>
          <SkeletonRows
            showUnrealizedPnl={showUnrealizedPnl}
            showStrategyColumn={false}
            showAgeColumn={false}
            rowCount={4}
          />
        </div>
      )}

      {/* W41-3 — Error state. Rendered only when the initial REST fetch
          failed AND no override was supplied (the override short-circuits
          the loading gate; an error from the underlying hook is irrelevant
          in that case). Includes a Retry button that calls the hook's
          refetch(), which re-runs the initial fetch + clears the error. */}
      {!isLoading && error && positionsOverride == null && positions.length === 0 && (
        <ErrorState
          message="Positions unavailable"
          detail={error}
          onRetry={refetch}
          retryLabel="Retry"
        />
      )}

      {/* W51-2b — Unified toolbar: search + outcome filter + sort + CSV
          export grouped into a single cohesive bar with subtle 1px
          vertical dividers between control groups. CSV export was
          previously in the header; moving it into the toolbar groups
          all data-shaping controls together. The "Export Positions CSV"
          title is preserved so the existing test contract still matches.
          The search input's .relative wrapper is preserved so the
          existing test that walks `input.closest('.relative')` to find
          the clear ✕ button still passes. */}
      <div className="positions-toolbar flex items-center gap-2 mb-2 bg-[#0e1015] border border-[#1f2335] rounded-md px-2 py-1.5">
        {/* Search group */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <input
            type="text"
            placeholder="Search position by market / contract..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            aria-label="Search positions by market name or contract token ID"
            className="w-full bg-[#13161e] border border-[#1f2335] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 rounded text-xs px-2.5 py-1.5 text-[#dde1ed] placeholder-[#3e4560] outline-none transition-all"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#7e8aaa] hover:text-white transition-colors"
              aria-label="Clear search filter"
            >
              ✕
            </button>
          )}
        </div>

        {/* Divider between search and outcome filter */}
        <div className="w-px h-5 bg-[#1f2335] flex-shrink-0" aria-hidden="true" />

        {/* Outcome filter group */}
        <div className="inline-flex bg-[#13161e] border border-[#1f2335] rounded p-0.5 text-[10px]" role="group" aria-label="Filter positions by outcome">
          {(['ALL', 'YES', 'NO'] as const).map((side) => (
            <button
              key={side}
              onClick={() => setOutcomeFilter(side)}
              aria-pressed={outcomeFilter === side}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                outcomeFilter === side
                  ? 'bg-blue-500/20 text-cyan-300 shadow-sm'
                  : 'text-[#7e8aaa] hover:text-[#dde1ed]'
              }`}
            >
              {side}
            </button>
          ))}
        </div>

        {/* Divider between outcome filter and sort */}
        <div className="w-px h-5 bg-[#1f2335] flex-shrink-0" aria-hidden="true" />

        {/* Sort group */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'size' | 'pnl' | 'market')}
          aria-label="Sort positions by"
          className="bg-[#13161e] border border-[#1f2335] text-[#7e8aaa] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        >
          <option value="size">Sort: Size ($)</option>
          <option value="pnl">Sort: Realized P&amp;L</option>
          <option value="market">Sort: Market Name</option>
        </select>

        {/* Flexible spacer pushes CSV export to the right edge */}
        <div className="flex-1" aria-hidden="true" />

        {/* Divider between sort and CSV export */}
        <div className="w-px h-5 bg-[#1f2335] flex-shrink-0" aria-hidden="true" />

        {/* CSV export (moved from header in W51-2b) */}
        <button
          onClick={handleExportCsv}
          disabled={positions.length === 0}
          className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[#1f2335] text-[#7e8aaa] hover:text-white hover:border-[#2d3450] flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Export Positions CSV"
        >
          <span aria-hidden="true">📥</span> CSV
        </button>
      </div>

      {/* Positions Table */}
      <div className="overflow-auto scrollbar-thin flex-1 table-container">
        {filteredPositions.length === 0 ? (
          // W49-5 — polished empty state. Larger icon (text-4xl), more
          // generous vertical padding, and the existing hint copy is
          // preserved (the test asserts on "Automated strategies...will
          // populate live positions here" via regex).
          <div className="empty-state py-10">
            <span className="empty-state-icon text-4xl" aria-hidden="true">💼</span>
            <span className="empty-state-title text-sm font-semibold">No positions found</span>
            <span className="empty-state-desc text-xs max-w-sm text-center">
              {filterQuery || outcomeFilter !== 'ALL'
                ? 'No open positions match your active filters.'
                : 'Automated strategies (Market Maker, Arbitrage, Signal Trader) will populate live positions here.'}
            </span>
          </div>
        ) : (
          <table className="data-table positions-table text-xs w-full" role="table" aria-label="Portfolio open positions">
            <thead>
              {/* W51-2b — header row refined: .data-table th already applies
                  uppercase + letter-spacing + a subtle bottom border via
                  globals.css. The inline `uppercase tracking-wider
                  text-[11px] font-semibold` classes reinforce the
                  typographic treatment at the Tailwind layer (in case
                  the cascade resolves Tailwind utilities above the
                  component-layer rule). The dimmed color (`text-[#7e8aaa]`)
                  + tight `py-1.5` keeps the header visually subordinate
                  to the row data. */}
              <tr className="border-b border-[#1f2335] text-[#7e8aaa] text-[11px] uppercase tracking-wider font-semibold">
                {/* W51-2b — Token sortable (sortBy='market', asc). */}
                <th scope="col" className="min-w-[190px] py-1.5 text-left">
                  <span className="inline-flex items-baseline">
                    Token
                    <SortIndicator active={sortBy === 'market'} direction="asc" />
                  </span>
                </th>
                <th scope="col" className="text-center">Risk</th>
                <th scope="col" className="text-center">Side</th>
                {/* W51-2b — Size sortable (sortBy='size', desc). */}
                <th scope="col" className="text-right">
                  <span className="inline-flex items-baseline justify-end">
                    Size
                    <SortIndicator active={sortBy === 'size'} direction="desc" />
                  </span>
                </th>
                <th scope="col" className="text-right">Entry</th>
                <th scope="col" className="text-right">Current</th>
                <th scope="col" className="text-right">Cost Basis</th>
                <th scope="col" className="text-center min-w-[110px]">Cap Limit ($3 Max)</th>
                {/* W49-5 — P&L ($) = unrealized dollar value with ↑/↓
                    arrow icon. Color-coded green/red per the spec. */}
                {showUnrealizedPnl && (
                  <th scope="col" className="text-right">P&amp;L ($)</th>
                )}
                {/* W49-5 — P&L (%) = unrealized percentage return.
                    Color-coded identically to the dollar column. Falls
                    back to "—" when unrealized_pnl isn't published. */}
                {showUnrealizedPnl && (
                  <th scope="col" className="text-right">P&amp;L (%)</th>
                )}
                {/* W51-2b — Realized sortable (sortBy='pnl', desc). */}
                <th scope="col" className="text-right">
                  <span className="inline-flex items-baseline justify-end">
                    Realized
                    <SortIndicator active={sortBy === 'pnl'} direction="desc" />
                  </span>
                </th>
                {/* W49-5 — dedicated Strategy column (previously inline
                    in the Token cell). Only rendered when at least one
                    visible row exposes a strategy field. */}
                {showStrategyColumn && (
                  <th scope="col" className="text-center">Strategy</th>
                )}
                {/* W49-5 — renamed "Time Held" → "Age" per the spec. */}
                {showAgeColumn && (
                  <th scope="col" className="text-right">Age</th>
                )}
                <th scope="col" className="text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2335]/50">
              {filteredPositions.map((p) => {
                const info = formatHierarchicalMarket(p.slug)
                const utilizationPct = Math.min((p.total_invested / MAX_PER_MARKET) * 100, 100)
                const isYes = p.yes_shares > 0
                const isNearCap = utilizationPct > 80
                const flashDir = priceFlashes?.[p.token_id]
                const flashClass =
                  showPriceFlashes && flashDir === 'up'
                    ? ' price-up'
                    : showPriceFlashes && flashDir === 'down'
                      ? ' price-down'
                      : ''
                const riskStatus = deriveRiskStatus(p)
                // W49-5 — pre-compute P&L arrow direction. The arrow is
                // rendered in its own <span> so getByText('+$5.00')
                // still matches the value span exactly.
                const hasUnrealized = typeof p.unrealized_pnl === 'number'
                const unrealizedProfit = hasUnrealized && (p.unrealized_pnl as number) >= 0
                const realizedProfit = p.realised_pnl >= 0
                // W49-5 — unrealized P&L percentage. Falls back to null
                // when unrealized_pnl isn't published OR total_invested
                // is zero (avoids div-by-zero).
                const unrealizedPct = hasUnrealized && p.total_invested > 0
                  ? (p.unrealized_pnl as number) / p.total_invested
                  : null

                return (
                  <tr
                    key={p.token_id}
                    className="hover:bg-blue-500/10 transition-colors group"
                  >
                    {/* Token — clickable to open depth chart + trade modal.
                        The strategy badge no longer lives inline here
                        (moved to its own column in W49-5). */}
                    <td
                      className="py-2.5 max-w-[240px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectMarket?.({ tokenId: p.token_id, slug: p.slug })}
                        className="w-full text-left bg-transparent border-0 p-0 cursor-pointer"
                        aria-label={`Open depth chart and trade modal for ${info.fullLabel}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider truncate">
                              {info.category.icon} {info.eventTitle}
                            </span>
                          </div>
                          <span
                            className="text-[#dde1ed] group-hover:text-cyan-300 font-medium leading-snug text-xs block whitespace-normal transition-colors"
                            title={info.fullLabel}
                          >
                            {info.question}
                          </span>
                        </div>
                      </button>
                    </td>

                    {/* W39-5/W49-5 — Risk status indicator dot. */}
                    <td className="text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${RISK_DOT_CLASS[riskStatus]}`}
                        role="img"
                        aria-label={RISK_DOT_TITLE[riskStatus]}
                        title={RISK_DOT_TITLE[riskStatus]}
                      />
                    </td>

                    {/* W49-5 — Side badge (YES/NO outcome). Green for
                        YES (long-YES outcome), red for NO (short-YES
                        outcome). The spec's "Green LONG / red SHORT"
                        maps onto Polymarket's binary-outcome semantics:
                        YES shares = LONG the YES outcome, NO shares =
                        SHORT the YES outcome (equiv. LONG the NO). */}
                    <td className="text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${
                          isYes
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {isYes ? 'YES' : 'NO'}
                      </span>
                    </td>

                    {/* W49-5/W51-2b — Size (Shares). tabular-nums
                        ensures the decimal points line up across rows
                        for clean vertical scanning. */}
                    <td className="mono text-right font-semibold text-[#dde1ed] tabular-nums">
                      {p.yes_shares > 0 ? p.yes_shares.toFixed(1) : (p.no_shares ?? 0).toFixed(1)}
                    </td>

                    {/* W49-5/W51-2b — Entry (Avg Entry). */}
                    <td className="mono text-right text-[#7e8aaa] text-xs tabular-nums">
                      ${p.avg_entry_price.toFixed(3)}
                    </td>

                    {/* W49-5/W51-2b — Current (Mark) with flash class. */}
                    <td className={`mono text-right text-[#dde1ed] text-xs tabular-nums${flashClass}`}>
                      {typeof p.current_price === 'number'
                        ? `$${p.current_price.toFixed(3)}`
                        : <span className="text-[#3e4560]">—</span>}
                    </td>

                    {/* W51-2b — Cost Basis. tabular-nums for decimal
                        alignment with Size / Entry / Current. */}
                    <td className="mono text-right font-semibold text-cyan-300 tabular-nums">
                      {fmtUsd(p.total_invested)}
                    </td>

                    {/* Exposure Utilization Gauge. */}
                    <td className="text-center px-2">
                      <div className="flex flex-col gap-1 items-center">
                        <div className="w-full bg-[#0e1015] border border-[#1f2335] h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isNearCap ? 'bg-amber-400' : 'bg-cyan-400'
                            }`}
                            style={{ width: `${utilizationPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] mono text-[#7e8aaa]">
                          {utilizationPct.toFixed(0)}% (${p.total_invested.toFixed(2)}/$3)
                        </span>
                      </div>
                    </td>

                    {/* W49-5/W51-2b — P&L ($) = Unrealized dollar PnL
                        with direction arrow. The arrow + value are now
                        wrapped in an inline-flex items-baseline gap-0.5
                        justify-end container so the arrow sits cleanly
                        aligned with the value's baseline (the W49-5
                        margin-based approach left the arrow floating in
                        inline-flow). The value still lives in its own
                        <span> so getByText('+$5.00') matches exactly
                        (preserves the test contract for color-coded
                        unrealized PnL). */}
                    {showUnrealizedPnl && (
                      <td
                        className={`mono text-right font-bold text-xs tabular-nums ${
                          hasUnrealized
                            ? unrealizedProfit
                              ? 'text-green-400'
                              : 'text-red-400'
                            : 'text-[#3e4560]'
                        }`}
                      >
                        {hasUnrealized ? (
                          <span className="inline-flex items-baseline gap-0.5 justify-end">
                            <PnlArrow isProfit={unrealizedProfit} />
                            <span>{fmtPnl(p.unrealized_pnl)}</span>
                          </span>
                        ) : '—'}
                      </td>
                    )}

                    {/* W49-5/W51-2b — P&L (%) = Unrealized percentage
                        return. Falls back to "—" when unrealized_pnl
                        isn't published OR total_invested is zero. Same
                        inline-flex arrow + value alignment as P&L ($). */}
                    {showUnrealizedPnl && (
                      <td
                        className={`mono text-right font-bold text-xs tabular-nums ${
                          unrealizedPct !== null
                            ? unrealizedPct >= 0
                              ? 'text-green-400'
                              : 'text-red-400'
                            : 'text-[#3e4560]'
                        }`}
                      >
                        {unrealizedPct !== null ? (
                          <span className="inline-flex items-baseline gap-0.5 justify-end">
                            <PnlArrow isProfit={unrealizedPct >= 0} />
                            <span>{fmtPct(unrealizedPct)}</span>
                          </span>
                        ) : '—'}
                      </td>
                    )}

                    {/* W49-5/W51-2b — Realized P&L — also with
                        direction arrow per the W49-5 spec ("P&L coloring
                        with arrow"). Same inline-flex alignment as the
                        unrealized P&L cells. */}
                    <td
                      className={`mono text-right font-bold text-xs tabular-nums ${
                        p.realised_pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      <span className="inline-flex items-baseline gap-0.5 justify-end">
                        <PnlArrow isProfit={realizedProfit} />
                        <span>{fmtPnl(p.realised_pnl)}</span>
                      </span>
                    </td>

                    {/* W49-5 — dedicated Strategy column. Only rendered
                        when at least one visible row exposes a
                        strategy field. Renders "—" when this specific
                        row doesn't have one (preserves the W39-5
                        graceful-degradation contract). */}
                    {showStrategyColumn && (
                      <td className="text-center">
                        {p.strategy ? (
                          <StrategyBadge strategy={p.strategy} />
                        ) : (
                          <span className="text-[#3e4560]">—</span>
                        )}
                      </td>
                    )}

                    {/* W49-5/W51-2b — Age (renamed from "Time Held").
                        tabular-nums for clean decimal alignment.
                        The title attribute carries the absolute
                        timestamp for hover tooltips + screen-reader
                        context. */}
                    {showAgeColumn && (
                      <td
                        className="mono text-right text-[#7e8aaa] text-[10.5px] tabular-nums"
                        title={typeof p.opened_at === 'number' ? fmtTimeAbs(p.opened_at) : undefined}
                      >
                        {typeof p.opened_at === 'number' ? fmtDurationHm(p.opened_at) : '—'}
                      </td>
                    )}

                    {/* Action — Trade + Close buttons. */}
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onSelectMarket?.({ tokenId: p.token_id, slug: p.slug })}
                          className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[#1f2335] text-cyan-400 hover:text-white hover:border-cyan-500/50"
                          title="Open Depth & Trade Modal"
                        >
                          Trade
                        </button>
                        {/* W39-5/W49-5/W51-2b — Close Position button
                            styled as an explicitly destructive red ghost
                            action. W51-2b refines the hover: slightly
                            darker red background (red-500/30) with a
                            transition-colors so the lift is smooth.
                            Border width stays 1px on both states so
                            there is no layout shift on hover. When
                            `requireConfirmation` is true, the click opens
                            the ConfirmationDialog instead of calling
                            onClosePosition directly. */}
                        <button
                          onClick={() => handleCloseClick(p.token_id)}
                          className="btn btn-sm text-[10px] px-2 py-0.5 border border-red-500/40 bg-red-500/10 text-red-400 hover:text-white hover:bg-red-500/30 hover:border-red-500/70 font-bold flex items-center gap-1 transition-colors"
                          aria-label={`Close position for ${info.fullLabel}`}
                          title="Close position at market"
                        >
                          <span aria-hidden="true">✕</span> Close
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* W39-5/W49-5 — Close Position confirmation dialog. Rendered
          inline so the panel can drive its own impact summary from
          the live position snapshot (size + mark + estimated proceeds)
          without threading every position through the parent. */}
      <ConfirmationDialog
        open={confirmCloseTokenId !== null && confirmingPosition !== null}
        severity="danger"
        title="Close Position?"
        description={confirmDescription}
        impact={confirmImpact}
        riskWarning="This action cannot be undone. Market close executes immediately at the best available price — on thin books this may slip materially below the displayed mark. Review the order book depth before confirming."
        confirmLabel="✕ Close Position"
        cancelLabel="Keep Position"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />
    </div>
  )
}

// W9-6 — React.memo with a custom comparator. See the original
// (pre-W39-5) header comment for the full reasoning. The W49-5
// additions are non-behavioural (column renderings), so the comparator
// is unchanged from W39-5.
export default memo(PositionsPanel, (prev, next) => {
  if (prev.positions !== next.positions) return false
  if (prev.dailyPnl !== next.dailyPnl) return false
  if (prev.onSelectMarket !== next.onSelectMarket) return false
  if (prev.onClosePosition !== next.onClosePosition) return false
  if (prev.isRealtime !== next.isRealtime) return false
  if (prev.showUnrealizedPnl !== next.showUnrealizedPnl) return false
  if (prev.showPriceFlashes !== next.showPriceFlashes) return false
  if (prev.requireConfirmation !== next.requireConfirmation) return false
  if (JSON.stringify(prev.priceFlashes) !== JSON.stringify(next.priceFlashes)) return false
  return true
})

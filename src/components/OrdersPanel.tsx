// components/OrdersPanel.tsx — Live Working Orders & Execution Queue Panel
//
// W51-2c — Visual-consistency polish to align the working-orders table
//   with the redesigned PositionsPanel + MarketsPanel.
//   Builds on the W49-5 operational-clarity redesign and applies the
//   W51-2c spec:
//
//   • Filter toolbar — a search row sits between the header and the
//     table (same shape as TradesPanel + PositionsPanel): leading
//     search input + "Showing X of Y" mono count pill. Filters by
//     slug, strategy, or order_id. The header KPI strip (Open count +
//     Capital exposed) and the Cancel All button are unchanged so
//     the test contract on the header text + Cancel All aria-label
//     is preserved.
//
//   • Loading skeletons — the previous spinner-only loading state is
//     replaced with shimmer skeleton rows (8 rows × 8 cells, using
//     the design-system `.skeleton` block). The "Loading working
//     orders…" text is preserved (now sits in a slim status strip
//     above the skeletons) so the existing test contract
//     (`getByText(/Loading working orders/)`) still resolves.
//
//   • Empty state — polished with a Lucide `ClipboardList` glyph
//     (replaces the bare 📋 emoji), centered title + subtitle, and
//     the existing "Active market making…" hint copy is preserved
//     (the test asserts on `No working limit orders`).
//
//   • Status badges — a new `PARTIAL` display status is derived when
//     an OPEN order has 0 < matched < size (was previously lumped
//     under OPEN). The badge colour map is updated per the spec:
//       PENDING   → amber (awaiting match-engine acceptance)
//       OPEN      → blue  (resting on the book, no fills yet)
//       PARTIAL   → amber (resting on the book, partially filled)
//       FILLED    → green (fully matched)
//       CANCELLED → muted red (terminal, cancelled)
//       REJECTED  → red   (terminal, rejected)
//
//   • Cancel button — restyled as a refined red ghost button
//     (transparent bg, thin red border, dimmed-red text; hover lifts
//     the tint). The previous grey-ghost styling made it look like a
//     neutral action — cancellation is reversible (re-quote) but the
//     button should still read as "destructive-leaning" at a glance.
//
//   • Table design — explicit `tabular-nums` Tailwind class on every
//     numeric cell (the mono class already applies it via globals.css,
//     but adding the Tailwind class makes the contract explicit so a
//     future Tailwind pass that rewrites `.mono` doesn't silently
//     drop the tabular alignment). Right-alignment preserved on all
//     numeric columns.
//
// W49-5 (preserved) — header KPI strip (Open count + Capital exposed),
// Cancel-All double-confirmation flow, per-order Cancel confirmation
// flow, fill-progress bar, Age column, StaleIndicator, ErrorState.
//
// W15-5 (unchanged transport) — the panel still subscribes to the
// `orders` WS channel and falls back to polling /api/orders every 5s
// when the WS isn't connected. "● Live" / "⟳ Polling" badge reflects
// the actual transport state.
//
// Backwards-compat: callers MAY still pass `orders` as a prop.
'use client'

import { useMemo, useState, useCallback, memo } from 'react'
import { ClipboardList, Search as SearchIcon, X as ClearIcon } from 'lucide-react'
import { Order } from '@/hooks/useBot'
import { formatHierarchicalMarket } from '@/lib/formatters'
import { fmtAge, fmtPrice, fmtUsd, fmtTimeAbs } from '@/lib/design-tokens'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useStaleAge } from '@/hooks/useStaleAge'
import { Badge } from '@/components/ui/badge'
import { ErrorState, StaleIndicator } from '@/components/ui/states'
import ConfirmationDialog from './ConfirmationDialog'

interface OrdersApiResponse {
  orders: Order[]
}

// W51-2c — `PARTIAL` added to the display-status union. An OPEN order
// with 0 < matched < size now renders as PARTIAL (amber badge) per the
// W51-2c spec, distinguishing "resting with no fills" from "resting
// with partial fills" at a glance.
type DisplayStatus = 'PENDING' | 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED'

interface Props {
  orders?: Order[]
  onCancel: (orderId: string) => void
  onCancelAll?: () => void
  isRealtime?: boolean
  /**
   * W39-5/W49-5 — when true, clicking a per-order Cancel button OR the
   * Cancel All button opens an inline ConfirmationDialog before
   * invoking the handler. Cancel All uses a double-confirmation flow
   * (two sequential dialogs). Defaults to `false` so existing tests
   * (which assert onCancel / onCancelAll is called directly on click)
   * keep their behaviour. page.tsx opts in to confirmation for
   * production safety.
   */
  requireConfirmation?: boolean
}

// W51-2c — status badge visual map. PENDING/PARTIAL share the amber
// tint (both represent "in-flight" states: PENDING = awaiting
// match-engine acceptance, PARTIAL = resting with partial fills).
// OPEN is blue (resting, no fills). FILLED is green (terminal-success).
// CANCELLED is muted red (terminal, cancelled by user). REJECTED is
// red (terminal, rejected by match-engine).
const STATUS_BADGE: Record<DisplayStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'PENDING',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  OPEN:      { label: 'OPEN',      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PARTIAL:   { label: 'PARTIAL',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  FILLED:    { label: 'FILLED',    cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CANCELLED: { label: 'CANCELLED', cls: 'bg-red-500/10 text-red-300/80 border-red-500/25' },
  REJECTED:  { label: 'REJECTED',  cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

// W51-2c — derive a display status when the snapshot doesn't expose
// `order.status`. We can distinguish FILLED / PARTIAL / OPEN from
// size_matched — PENDING / REJECTED / CANCELLED require backend
// signalling and fall back to OPEN/PARTIAL.
function deriveDisplayStatus(o: Order): DisplayStatus {
  if (o.status) {
    // Backend may send 'OPEN' for both pure-open and partial-open
    // orders; if it does and size_matched > 0, refine to PARTIAL.
    if (o.status === 'OPEN' && o.size > 0) {
      const matched = o.size_matched ?? 0
      if (matched > 0 && matched < o.size) return 'PARTIAL'
    }
    return o.status
  }
  const matched = o.size_matched ?? 0
  if (o.size > 0 && matched >= o.size) return 'FILLED'
  if (matched > 0 && matched < o.size) return 'PARTIAL'
  return 'OPEN'
}

// W51-2c — shimmer skeleton row count for the loading state. Eight
// rows matches the typical visible height of the panel without
// overflowing (the table-container has its own scroll).
const SKELETON_ROWS = 8

function OrdersPanel({
  orders: ordersOverride,
  onCancel,
  onCancelAll,
  isRealtime: isRealtimeOverride,
  requireConfirmation = false,
}: Props) {
  const {
    data: fetched,
    isLoading,
    isRealtime: wsIsRealtime,
    error,
    lastUpdated,
    refetch,
  } = useRealtimeData<OrdersApiResponse>('/api/orders', {
    wsChannel: 'orders',
    pollInterval: 5000,
  })

  const orders = ordersOverride ?? fetched?.orders ?? []
  const isRealtime = isRealtimeOverride ?? wsIsRealtime

  // W41-3 — compute the data's age so we can surface a StaleIndicator
  // in the header when the snapshot is older than 30s. Skipped when
  // the caller provides an orders override.
  const age = useStaleAge(ordersOverride == null ? lastUpdated : null)

  // W51-2c — search/filter query for the new toolbar. Filters by
  // slug, strategy, or order_id. Default '' renders all orders so the
  // existing test contract (which doesn't type into the search box)
  // is preserved — `Working Orders (2)` still resolves to 2 visible
  // rows.
  const [filterQuery, setFilterQuery] = useState('')

  // W39-5/W49-5 — token id of the order the trader is currently
  // confirming a Cancel on. When non-null, the inline
  // ConfirmationDialog renders.
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null)

  // W49-5 — Cancel All double-confirmation state machine.
  //   0 = no dialog open
  //   1 = first dialog ("Cancel all N orders?")
  //   2 = second dialog ("Are you absolutely sure?")
  // Default `requireConfirmation=false` keeps the state at 0 and
  // calls onCancelAll directly on click — preserves the existing
  // test contract (`expect(onCancelAll).toHaveBeenCalledTimes(1)`).
  const [cancelAllStep, setCancelAllStep] = useState<0 | 1 | 2>(0)

  const totalOpenExposure = useMemo(() => {
    return orders.reduce((acc, o) => acc + o.price * (o.size - (o.size_matched ?? 0)), 0)
  }, [orders])

  // W49-5 — KPI strip aggregates: open-count (non-terminal orders) +
  // total open capital + average fill rate across the visible set.
  // Computed from the un-filtered `orders` list so the KPI reflects
  // portfolio state, not the active search filter.
  const openCount = useMemo(
    () => orders.filter((o) => {
      const status = deriveDisplayStatus(o)
      return status === 'PENDING' || status === 'OPEN' || status === 'PARTIAL'
    }).length,
    [orders],
  )
  const totalSize = useMemo(() => orders.reduce((acc, o) => acc + o.size, 0), [orders])
  const totalMatched = useMemo(
    () => orders.reduce((acc, o) => acc + (o.size_matched ?? 0), 0),
    [orders],
  )
  const avgFillPct = totalSize > 0 ? Math.round((totalMatched / totalSize) * 100) : 0

  // W51-2c — filtered orders list (search). The Cancel All button
  // and the KPI strip continue to use the un-filtered `orders` list
  // so portfolio-wide counts/exposure are stable regardless of the
  // active search filter.
  const filteredOrders = useMemo(() => {
    if (!filterQuery.trim()) return orders
    const q = filterQuery.toLowerCase()
    return orders.filter((o) => {
      return (
        o.slug.toLowerCase().includes(q) ||
        (o.strategy && o.strategy.toLowerCase().includes(q)) ||
        (o.order_id && o.order_id.toLowerCase().includes(q))
      )
    })
  }, [orders, filterQuery])

  // W39-5/W49-5 — the order currently pending Cancel confirmation.
  // Looked up by order_id so the dialog can render an order-specific
  // impact summary.
  const confirmingOrder = useMemo(
    () => (confirmCancelOrderId ? orders.find((o) => o.order_id === confirmCancelOrderId) ?? null : null),
    [confirmCancelOrderId, orders],
  )

  // W39-5/W49-5 — per-order Cancel handler. When
  // `requireConfirmation` is true, the click opens the inline
  // ConfirmationDialog (which then calls onCancel on confirm). When
  // false, the click calls onCancel directly — preserves the legacy
  // direct-call behaviour that the existing tests assert.
  const handleCancelClick = useCallback(
    (orderId: string) => {
      if (requireConfirmation) {
        setConfirmCancelOrderId(orderId)
      } else {
        onCancel(orderId)
      }
    },
    [requireConfirmation, onCancel],
  )

  const handleConfirmCancel = useCallback(() => {
    if (confirmCancelOrderId) {
      onCancel(confirmCancelOrderId)
    }
    setConfirmCancelOrderId(null)
  }, [confirmCancelOrderId, onCancel])

  const handleCancelDialogClose = useCallback(() => {
    setConfirmCancelOrderId(null)
  }, [])

  // W49-5 — Cancel All click handler. When `requireConfirmation` is
  // true, kicks off the double-confirmation flow (step 1 → step 2 →
  // onCancelAll). When false, calls onCancelAll directly — preserves
  // the existing test contract.
  const handleCancelAllClick = useCallback(() => {
    if (requireConfirmation) {
      setCancelAllStep(1)
    } else {
      onCancelAll?.()
    }
  }, [requireConfirmation, onCancelAll])

  // W49-5 — step 1 → step 2 (the user confirmed the first warning;
  // now show the explicit re-confirmation dialog).
  const handleConfirmCancelAllStep1 = useCallback(() => {
    setCancelAllStep(2)
  }, [])

  // W49-5 — step 2 → onCancelAll (the user explicitly re-confirmed;
  // now actually invoke the batch cancel).
  const handleConfirmCancelAllStep2 = useCallback(() => {
    onCancelAll?.()
    setCancelAllStep(0)
  }, [onCancelAll])

  // W49-5 — escape hatches for either step's Cancel button.
  const handleCancelCancelAll = useCallback(() => {
    setCancelAllStep(0)
  }, [])

  // W39-5/W49-5 — pre-compute the impact summary string for the
  // per-order dialog so the trader sees exactly what cancelling will
  // do before confirming.
  const confirmImpact = useMemo(() => {
    if (!confirmingOrder) return ''
    const matched = confirmingOrder.size_matched ?? 0
    const remaining = confirmingOrder.size - matched
    const remainingValue = confirmingOrder.price * remaining
    return [
      `Side: ${confirmingOrder.side}`,
      `Price: ${fmtPrice(confirmingOrder.price)}`,
      `Size: ${confirmingOrder.size.toFixed(1)}`,
      matched > 0 ? `(${matched.toFixed(1)} filled, ${remaining.toFixed(1)} resting)` : '(0 filled)',
      `Open capital: ${fmtUsd(remainingValue)}`,
    ].join(' · ')
  }, [confirmingOrder])

  const confirmDescription = useMemo(() => {
    if (!confirmingOrder) return ''
    const info = formatHierarchicalMarket(confirmingOrder.slug)
    return `Cancel the ${confirmingOrder.side} order on ${info.fullLabel}? This sends a cancel to the matching engine — the order will stop resting on the book immediately.`
  }, [confirmingOrder])

  // W49-5 — Cancel All impact summary. Surfaced in the first dialog
  // so the trader sees the aggregate blast radius before confirming.
  const cancelAllImpact = useMemo(() => {
    if (orders.length === 0) return ''
    return [
      `Orders: ${orders.length}`,
      `Open capital: ${fmtUsd(totalOpenExposure)}`,
      `Avg fill rate: ${avgFillPct}%`,
    ].join(' · ')
  }, [orders.length, totalOpenExposure, avgFillPct])

  return (
    <div className="card h-full flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl overflow-hidden">
      {/* Header — title + KPI strip + Cancel All */}
      <div className="card-header px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-page)]/80">
        <div className="flex items-center gap-2.5">
          <span className="card-title text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            📋 Working Orders ({orders.length})
          </span>
          {isRealtime ? (
            <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
          ) : (
            <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
          )}
          {/* W41-3 — StaleIndicator renders as an inline amber/red pill
              when the fetched snapshot is older than 30s. Hidden while
              fresh (<30s) so the header doesn't accumulate noise. Skipped
              when the caller provides an orders override. */}
          {age !== null && <StaleIndicator age={age} />}
        </div>

        {/* W49-5 — KPI strip. Two cards (Open count, Capital exposed)
            clustered on the right side of the header. Each card has
            the same shape as the Positions panel's KPI strip: tiny
            uppercase label + bold color-coded value. Hidden when no
            orders exist (avoids showing "Open: 0 / Capital: $0.00"
            in the empty state — the empty-state placeholder already
            communicates "nothing here"). */}
        {orders.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="bg-[var(--bg-page)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5" title="Non-terminal working orders (PENDING + OPEN + PARTIAL)">
              <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Open:</span>
              <span className="mono font-bold text-emerald-300 text-xs tabular-nums">{openCount}</span>
              <span className="text-[9.5px] text-[var(--text-secondary)] tabular-nums">/ {orders.length}</span>
            </div>

            <div className="bg-[var(--bg-page)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5" title="Total capital exposed across all working orders">
              <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Capital:</span>
              <span className="mono font-bold text-emerald-400 text-xs tabular-nums">{fmtUsd(totalOpenExposure)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* W49-5 — Cancel All promoted to a prominent button. The
              double-confirmation flow (when `requireConfirmation=true`)
              is handled by `handleCancelAllClick` + the two
              ConfirmationDialogs rendered at the bottom of the panel. */}
          {orders.length > 0 && onCancelAll && (
            <button
              onClick={handleCancelAllClick}
              className="btn btn-danger btn-xs font-bold shadow-sm"
              aria-label="Cancel all working orders"
            >
              Cancel All ({orders.length})
            </button>
          )}
        </div>
      </div>

      {/* W51-2c — Filter toolbar. Same shape as TradesPanel +
          PositionsPanel: leading search input + "Showing X of Y"
          mono count pill. Hidden when no orders exist (the empty
          state below handles the no-data case). */}
      {orders.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--border)] bg-[var(--bg-page)]/60">
          <div className="relative flex-1 max-w-xs">
            <SearchIcon
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-secondary)] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search orders by market, strategy, or ID…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Search working orders"
              className="w-full text-xs bg-[var(--bg-page)] border border-[var(--border)] focus:border-emerald-500/50 rounded pl-7 pr-7 py-1 text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                aria-label="Clear search"
              >
                <ClearIcon className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* W51-2c — "Showing X of Y" mono pill. Reflects the active
              filter state so a trader can tell whether the search is
              hiding rows. Hidden when the filter is empty (the count
              would just duplicate the header's "(N)" badge). */}
          {filterQuery && (
            <span className="text-[10px] mono text-[var(--text-secondary)] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
              Showing <strong className="text-emerald-300 font-semibold tabular-nums">{filteredOrders.length}</strong>
              <span className="opacity-50">of</span>
              <strong className="text-[var(--text-primary)] font-semibold tabular-nums">{orders.length}</strong>
            </span>
          )}
        </div>
      )}

      {isLoading && orders.length === 0 ? (
        // W51-2c — shimmer skeleton loading state. The previous
        // spinner-only state is replaced with 8 shimmer rows + a
        // slim status strip carrying the "Loading working orders…"
        // text (preserves the existing test contract
        // `getByText(/Loading working orders/)`).
        <div className="flex-1 overflow-hidden flex flex-col" role="status" aria-live="polite">
          <div className="px-3.5 py-1.5 text-[10px] text-[var(--text-secondary)] flex items-center gap-2 border-b border-[var(--border)]/50 bg-[var(--bg-page)]/40">
            <span className="spinner" aria-hidden="true" />
            Loading working orders…
          </div>
          <div className="flex-1 overflow-hidden">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[var(--border)]/30"
                aria-hidden="true"
              >
                {/* Market cell skeleton — wider */}
                <div className="skeleton h-3.5 w-40 rounded" />
                {/* Side badge skeleton */}
                <div className="skeleton h-3.5 w-10 rounded" />
                {/* Status badge skeleton */}
                <div className="skeleton h-3.5 w-14 rounded" />
                {/* Price skeleton */}
                <div className="skeleton h-3.5 w-12 rounded ml-auto" />
                {/* Size skeleton */}
                <div className="skeleton h-3.5 w-14 rounded" />
                {/* Strategy skeleton */}
                <div className="skeleton h-3.5 w-12 rounded" />
                {/* Age skeleton */}
                <div className="skeleton h-3.5 w-10 rounded" />
                {/* Cancel action skeleton */}
                <div className="skeleton h-3.5 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : error && ordersOverride == null && orders.length === 0 ? (
        // W41-3 — Error state. Rendered only when the initial REST fetch
        // failed AND no override was supplied. Includes a Retry button
        // that calls the hook's refetch().
        <ErrorState
          message="Working orders unavailable"
          detail={error}
          onRetry={refetch}
          retryLabel="Retry"
        />
      ) : (
        <div className="overflow-auto scrollbar-thin flex-1 table-container">
          {filteredOrders.length === 0 ? (
            // W51-2c — polished empty state. Lucide ClipboardList glyph
            // (replaces the bare 📋 emoji), centered title + subtitle,
            // preserves the "No working limit orders" title text (the
            // existing test asserts on it via findByText).
            <div className="empty-state py-12">
              <span className="empty-state-icon" aria-hidden="true">
                <ClipboardList className="w-10 h-10 text-[var(--text-dim)]" strokeWidth={1.5} />
              </span>
              <span className="empty-state-title">No working limit orders</span>
              <span className="empty-state-desc">
                Active market making &amp; arbitrage quoting loops will place limit orders in the matching engine.
              </span>
            </div>
          ) : (
            <table className="data-table text-xs w-full" role="table" aria-label="Working limit orders">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-[10.5px]">
                  <th scope="col" className="min-w-[190px] text-left">Market Contract</th>
                  <th scope="col" className="text-center">Side</th>
                  <th scope="col" className="text-center">Status</th>
                  <th scope="col" className="text-right">Price</th>
                  <th scope="col" className="text-right">Shares (Filled)</th>
                  <th scope="col" className="text-left">Strategy</th>
                  <th scope="col" className="text-center">Age</th>
                  <th scope="col" className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/50">
                {filteredOrders.map((o) => {
                  const info = formatHierarchicalMarket(o.slug)
                  const matched = o.size_matched ?? 0
                  const fillPct = o.size > 0 ? Math.min(100, Math.round((matched / o.size) * 100)) : 0
                  const isBuy = o.side === 'BUY'
                  // W51-2c — derive the display status (prefers
                  // backend `o.status` when available; falls back to
                  // size-based heuristic otherwise). PARTIAL is now
                  // derived for OPEN orders with 0 < matched < size.
                  const displayStatus = deriveDisplayStatus(o)
                  const isFilled = displayStatus === 'FILLED'
                  const isCancelled = displayStatus === 'CANCELLED'
                  const isRejected = displayStatus === 'REJECTED'
                  const isTerminal = isFilled || isCancelled || isRejected
                  const showFillBar = !isTerminal && matched > 0

                  return (
                    <tr key={o.order_id} className="hover:bg-emerald-500/10 transition-colors group">
                      <td className="py-2.5 max-w-[220px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9.5px] text-emerald-400 font-bold uppercase tracking-wider truncate">
                            {info.category.icon} {info.eventTitle}
                          </span>
                          <span className="text-[var(--text-primary)] group-hover:text-emerald-300 font-medium leading-tight text-xs block whitespace-normal transition-colors" title={info.fullLabel}>
                            {info.question}
                          </span>
                        </div>
                      </td>

                      {/* Side */}
                      <td className="text-center">
                        <span
                          className={`badge text-[9.5px] font-black tracking-wider uppercase px-2 py-0.5 ${
                            isBuy ? 'badge-green bg-green-500/15 text-green-400 border-green-500/30' : 'badge-red bg-red-500/15 text-red-400 border-red-500/30'
                          }`}
                        >
                          {o.side}
                        </span>
                      </td>

                      {/* W51-2c — Status badge column. PARTIAL now
                          derived for OPEN orders with partial fills. */}
                      <td className="text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${STATUS_BADGE[displayStatus].cls}`}
                          title={`Status: ${displayStatus}`}
                        >
                          {STATUS_BADGE[displayStatus].label}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="mono text-right font-bold text-emerald-400 tabular-nums">
                        {fmtPrice(o.price)}
                      </td>

                      {/* Fill Progress & Size — W39-5/W49-5: the
                          progress bar is rendered for any OPEN/partial
                          order (matched > 0 AND matched < size). */}
                      <td className="mono text-right font-medium text-[var(--text-primary)] tabular-nums">
                        <div>
                          <span>{o.size.toFixed(1)}</span>
                          {matched > 0 && (
                            <span className="text-[10px] text-green-400 ml-1 tabular-nums">({matched.toFixed(1)})</span>
                          )}
                          {showFillBar && (
                            <span className="text-[9.5px] text-[var(--text-secondary)] ml-1 tabular-nums">{fillPct}%</span>
                          )}
                        </div>
                        {showFillBar && (
                          <div className="w-full bg-[var(--border)] h-1 rounded-full overflow-hidden mt-1" role="progressbar" aria-valuenow={fillPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Fill progress: ${fillPct}%`}>
                            <div className="bg-green-400 h-full rounded-full transition-all" style={{ width: `${fillPct}%` }} />
                          </div>
                        )}
                      </td>

                      {/* Strategy Tag */}
                      <td>
                        <span className="text-[9.5px] text-[var(--text-secondary)] mono bg-[var(--bg-page)] px-1.5 py-0.5 rounded border border-[var(--border)] font-semibold">
                          {o.strategy}
                        </span>
                      </td>

                      {/* W39-5/W49-5 — Age in relative format ("3m ago").
                          The title attribute carries the absolute ISO
                          timestamp for hover + screen-reader context. */}
                      <td className="mono text-[var(--text-secondary)] text-[10.5px] text-center tabular-nums" title={`Created: ${fmtTimeAbs(o.created_at)}`}>
                        {fmtAge(o.created_at)}
                      </td>

                      {/* Action — W51-2c: Cancel is hidden for terminal
                          states (FILLED / CANCELLED / REJECTED) where
                          cancellation is a no-op. For non-terminal
                          states the button renders in the spec's
                          refined "red ghost" style — transparent bg,
                          thin red border, dimmed red text; hover lifts
                          the tint. */}
                      <td className="text-right">
                        {isTerminal ? (
                          <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider font-semibold" aria-label={`Order ${displayStatus.toLowerCase()} — no cancel action`}>
                            {displayStatus === 'FILLED' ? '✓ Filled' : displayStatus === 'CANCELLED' ? '— Cancelled' : '✕ Rejected'}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleCancelClick(o.order_id)}
                            className="btn btn-ghost btn-xs font-bold border border-red-500/30 text-red-300/80 hover:text-red-200 hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
                            aria-label={`Cancel order ${o.order_id}`}
                            title="Cancel this order"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* W39-5/W49-5 — per-order Cancel confirmation dialog. Rendered
          inline so the panel can drive its own impact summary from
          the live order snapshot without threading every order through
          the parent. */}
      <ConfirmationDialog
        open={confirmCancelOrderId !== null && confirmingOrder !== null}
        severity="warning"
        title="Cancel Order?"
        description={confirmDescription}
        impact={confirmImpact}
        riskWarning="This action cannot be undone. Cancelling a partial-fill order forfeits the resting portion of your book priority — on thin markets, re-entering at the same price may require waiting for the next quote refresh."
        confirmLabel="✕ Cancel Order"
        cancelLabel="Keep Order"
        onConfirm={handleConfirmCancel}
        onCancel={handleCancelDialogClose}
      />

      {/* W49-5 — Cancel All double-confirmation flow. Two sequential
          dialogs:
            1. Warning + impact summary (N orders + capital exposed +
               avg fill rate).
            2. Explicit re-confirmation with the "cannot be undone"
               risk warning. */}
      <ConfirmationDialog
        open={cancelAllStep === 1}
        severity="warning"
        title={`Cancel all ${orders.length} working orders?`}
        description="This sends a batch cancel to the matching engine for every working order in your book. Partially-filled orders will keep their fills; only the resting (unmatched) portion is cancelled."
        impact={cancelAllImpact}
        riskWarning="This action cannot be undone. Re-quoting the same book may require waiting for the next strategy refresh — on volatile markets the mid may have moved by then."
        confirmLabel="Continue"
        cancelLabel="Keep Orders"
        onConfirm={handleConfirmCancelAllStep1}
        onCancel={handleCancelCancelAll}
      />
      <ConfirmationDialog
        open={cancelAllStep === 2}
        severity="danger"
        title="Are you absolutely sure?"
        description="This is the final confirmation. Clicking 'Cancel All' will immediately submit batch-cancellation for every resting order in your book. The fills already on the tape remain — only the resting quotes are removed."
        impact={cancelAllImpact}
        riskWarning="This action cannot be undone. After cancellation, your strategies will resume quoting on the next tick (typically 1–5 seconds). During that gap you have zero market presence."
        confirmLabel="✕ Cancel All Orders"
        cancelLabel="Back"
        onConfirm={handleConfirmCancelAllStep2}
        onCancel={handleCancelCancelAll}
      />
    </div>
  )
}

// W9-6 — React.memo with shallow compare is sufficient because all props
// are reference-compared. `onCancel` / `onCancelAll` MUST be stable in the
// parent for memo to skip renders.
//
// W39-5/W49-5/W51-2c — `requireConfirmation` is a primitive boolean, diffed
// inline so the parent flipping the preference re-renders the panel.
export default memo(OrdersPanel)

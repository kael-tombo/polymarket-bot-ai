// components/OrderFlowPanel.tsx — Order-flow workstation.
//
// Combines three sub-components into one real-time trading view:
//
//   ┌───────────────────────────────────────────────────────────┐
//   │ [token selector ▼]  [window 30s|1m|5m]   Δ +120  ◉ Live   │
//   ├───────────────────────────────────────────────────────────┤
//   │                                                           │
//   │            OrderFlowChart (buy/sell bars + Δ line)        │
//   │                                                           │
//   ├──────────────────────────────────┬────────────────────────┤
//   │                                  │                        │
//   │  OrderBookImbalance              │   TradeTape (scrolling) │
//   │  (bid↔ask divergent bar)         │                        │
//   │                                  │                        │
//   └──────────────────────────────────┴────────────────────────┘
//
// Data flow:
//   • `trades` + `orderBooks` come from the parent's useBot hook
//     (WS-with-polling-fallback — see src/hooks/useBot.ts). The panel
//     accepts them as props so it doesn't open a second WS socket.
//   • The depth ladder for the SELECTED token is polled separately via
//     `/api/depth/{token_id}` every 2s — same pattern as
//     DepthChartModal. This gives the OrderBookImbalance component
//     the per-level sizes it needs to compute bid/ask volume + best
//     bid/ask depth.
//   • `isRealtime` reflects the parent's WS connection state — when
//     false, the "Polling" badge is shown so the trader knows the
//     numbers may lag by up to `pollIntervalMs` (default 2s).
//
// Stats header shows:
//   • Cumulative Δ — net buy_vol − sell_vol over the visible window.
//   • Imbalance ratio — (bidVol − askVol) / (bidVol + askVol).
//   • Tape speed — trades/min over the last 60s.
//
// ─────────────────────────────────────────────────────────────────────────
// W52-b — Final UI polish pass (visual consistency with W51-2 panels).
// ─────────────────────────────────────────────────────────────────────────
// This pass applies the W51 design-system layer (Tone vocabulary,
// SectionHeader, PulseDot, shimmer skeleton, polished empty + error
// states, tabular-nums, data-tone hooks) to the order-flow workstation
// without touching any of the existing test contracts:
//
//   • Stats badges carry `data-tone` attributes (positive|negative|warn|
//     neutral) so the CSS layer can apply tone-tinted backgrounds/halos
//     without re-coloring the value text — same pattern as
//     PositionsPanel's KPI strip.
//   • Cumulative Δ + Imbalance ratio + Tape speed stats get explicit
//     `tabular-nums` for clean decimal alignment across ticks.
//   • Time-window buttons gain `tabular-nums`, `transition-colors`, and
//     a refined hover border so the active/inactive contrast reads
//     cleanly. Active class names + testids preserved.
//   • LIVE badge now embeds a `PulseDot` (Lucide-free ping halo + solid
//     dot). POLL badge keeps its static amber dot.
//   • Each card (chart / imbalance / tape) gets a `SectionHeader` with a
//     Lucide icon + uppercase title + dim italic description. Section
//     titles preserved verbatim ("Order Flow — buys vs sells + cumulative
//     Δ", "Bid / Ask Imbalance", "Time & Sales") so test contracts hold.
//   • NEW shimmer-skeleton loading state inside the imbalance card —
//     `ImbalanceSkeleton` renders while the depth fetch is in-flight
//     (status === 'loading'). Replaces the old "all-zero imbalance"
//     flicker with a clean shimmer placeholder.
//   • NEW polished empty state — when no market is selected
//     (orderBooks=[]), the chart card body shows a Lucide `Inbox` icon +
//     "No market selected" title + helper copy. The dropdown option text
//     "No markets available" is preserved verbatim (test contract).
//   • NEW polished error state — when the depth fetch errors (network,
//     4xx/5xx), the imbalance card body shows a `DepthErrorCard` with a
//     Lucide `AlertTriangle` icon + "Depth feed unavailable" message +
//     Retry button (re-runs the fetch effect via `retryToken` bump).
//   • All existing class names, testids, role attributes, aria-labels,
//     API calls (useEffect polling /api/depth/{token_id}), and the
//     'use client' directive are preserved.

'use client'

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { apiFetch, getApiUrl } from '@/lib/api'
import type { Trade, OrderBook } from '@/hooks/useBot'
import OrderFlowChart, {
  type FlowTrade,
  type TimeWindow,
} from './charts/OrderFlowChart'
import OrderBookImbalance, {
  type OrderBookImbalanceProps,
  computeImbalance,
} from './charts/OrderBookImbalance'
import TradeTape from './charts/TradeTape'
import {
  BarChart3,
  Scale,
  Receipt,
  RefreshCw,
  Inbox,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

interface DepthLevel {
  price: number
  size: number
  total: number
}

interface DepthData {
  token_id: string
  bids: DepthLevel[]
  asks: DepthLevel[]
  mid: number | null
  spread: number | null
  best_bid: number | null
  best_ask: number | null
}

export interface OrderFlowPanelProps {
  /** Recent trades (oldest- or newest-first; chart sorts internally). */
  trades: Trade[]
  /** Live order books (used to populate the token selector). */
  orderBooks: OrderBook[]
  /** True when the parent's WS is live; false when polling. */
  isRealtime: boolean
  /** Optional callback invoked when the user picks a token via the chart. */
  onSelectMarket?: (tokenId: string, slug: string) => void
  /** Optional className for the outer wrapper. */
  className?: string
}

const WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '30s', label: '30s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
]

/**
 * Convert a bot `Trade` into the chart-friendly `FlowTrade` shape.
 * Drops trades without a token_id match — we filter at the panel level
 * so the chart receives only the selected token's prints.
 */
function toFlowTrade(t: Trade): FlowTrade {
  return {
    timestamp: t.timestamp * 1000, // bot uses seconds; chart uses ms
    side: t.side,
    size: t.size,
    price: t.price,
  }
}

// ── W52-b Tone vocabulary ──────────────────────────────────────────────────
// Unified tone palette shared across the Δ stat, imbalance chip, and the
// depth-card section header. Static class strings so Tailwind 4's scanner
// picks them up at build time. Mirrors the W51-2d Tone system used by
// MLPanel + AIMLCommandCenter but reduced to the four tones this panel
// needs (positive/negative/warn/neutral — no info/purple here).
type Tone = 'positive' | 'negative' | 'neutral' | 'warn'

interface ToneConfig {
  text: string
  dot: string
  halo: string
}

const TONE: Record<Tone, ToneConfig> = {
  positive: { text: 'text-green-400',  dot: 'bg-green-400',  halo: 'shadow-green-500/10' },
  negative: { text: 'text-red-400',    dot: 'bg-red-400',    halo: 'shadow-red-500/10' },
  warn:     { text: 'text-amber-400',  dot: 'bg-amber-400',  halo: 'shadow-amber-500/10' },
  neutral:  { text: 'text-[#7e8aaa]',  dot: 'bg-[#5a637a]',  halo: '' },
}

// ── SectionHeader — Lucide icon + uppercase title + optional dim description
// Mirrors the W51-2d SectionHeader pattern: icon at 12px, uppercase
// 9.5px tracking-wider bold title in muted text-[#5a637a], optional dim
// italic 8.5px description. The title is rendered in its own <span> so
// RTL's `getByText('Bid / Ask Imbalance')` matches just the span, not
// the wrapper div (the icon is an SVG with no text content).
function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  trailing,
}: {
  icon: LucideIcon
  title: string
  description?: string
  tone?: Tone
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[#5a637a] italic truncate">
          {description}
        </span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── PulseDot — small status dot with ping halo (LIVE badge) ─────────────────
// Tailwind's `animate-ping` halo + solid dot. Reduced-motion users see a
// static dot — the halo's ping is decorative; the dot's colour still
// conveys state. Mirrors the W51-2d PulseDot pattern.
function PulseDot({ tone = 'positive' }: { tone?: Tone }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-1.5 h-1.5 shrink-0" aria-hidden="true">
      <span
        className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`}
      />
      <span
        className={`relative inline-flex w-1.5 h-1.5 rounded-full ${cfg.dot} shadow-[0_0_4px] ${cfg.halo}`}
      />
    </span>
  )
}

// ── ImbalanceSkeleton — shimmer placeholder for the depth-loading state ────
// Renders while the depth fetch is in-flight (status === 'loading') so the
// trader sees a clean shimmer instead of a flicker of all-zero imbalance
// values. Mirrors the W51-2 skeleton vocabulary (`.skeleton-line-sm` +
// `.skeleton-line-md` from globals.css). aria-live='polite' so screen
// readers announce the loading transition.
function ImbalanceSkeleton() {
  return (
    <div
      className="space-y-2 py-1"
      role="status"
      aria-live="polite"
      aria-label="Loading order book depth"
      data-testid="order-flow-imbalance-skeleton"
    >
      {/* Imbalance ratio + spread placeholder */}
      <div className="flex items-baseline justify-between">
        <div className="skeleton-line-sm w-1/3" />
        <div className="skeleton-line-sm w-1/4" />
      </div>
      {/* Big ratio chip placeholder */}
      <div className="skeleton-line-md w-1/2" />
      {/* Divergent bar placeholder */}
      <div className="skeleton-line-md" />
      {/* Best bid / best ask placeholder */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="skeleton-line-md" />
        <div className="skeleton-line-md" />
      </div>
    </div>
  )
}

// ── DepthErrorCard — polished error state with Retry ───────────────────────
// Renders when the depth fetch errors (network failure, non-2xx response).
// Uses the project's `.error-state` CSS classes for visual consistency
// with the rest of the dashboard's empty/error pattern. The Retry button
// bumps `retryToken` to force the depth effect to re-run.
function DepthErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="error-state py-6"
      role="alert"
      data-testid="order-flow-imbalance-error"
    >
      <AlertTriangle
        className="size-7 text-red-400/80"
        aria-hidden="true"
      />
      <span className="error-state-title">Depth feed unavailable</span>
      <span className="error-state-desc">
        The order-book depth endpoint for this market couldn&apos;t be
        reached. The chart and tape still show printed trades.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        data-testid="order-flow-imbalance-retry"
        aria-label="Retry depth fetch"
      >
        <RefreshCw className="size-3" aria-hidden="true" />
        Retry depth
      </button>
    </div>
  )
}

// ── NoMarketsEmptyState — polished empty state when no market selected ──────
// Renders in the chart card body when `selectedTokenId` is null (bot has
// not yet subscribed to any markets). Distinct from the dropdown option
// text "No markets available" (which is preserved verbatim for the test
// contract) — this is the rich visual empty state with a Lucide icon +
// title + helper copy.
function NoMarketsEmptyState() {
  return (
    <div
      className="empty-state"
      role="status"
      data-testid="order-flow-empty-state"
      style={{ minHeight: 240 }}
    >
      <Inbox
        className="size-8 text-[#5a637a]/70"
        aria-hidden="true"
      />
      <span className="empty-state-title">No market selected</span>
      <span className="empty-state-desc">
        Awaiting market subscriptions from the bot. Once the bot tracks a
        market, its order flow, depth imbalance, and trade tape will appear
        here in real time.
      </span>
    </div>
  )
}

// ── Depth fetch status lifecycle ───────────────────────────────────────────
// 'idle'     — selectedTokenId is null; no fetch attempted.
// 'loading'  — fetch in-flight (initial + each 2s poll tick before resolve).
// 'ready'    — last fetch resolved with a 2xx + valid JSON.
// 'error'    — last fetch threw or returned non-2xx.
type DepthStatus = 'idle' | 'loading' | 'ready' | 'error'

export default function OrderFlowPanel({
  trades,
  orderBooks,
  isRealtime,
  onSelectMarket,
  className,
}: OrderFlowPanelProps) {
  // Selected token — defaults to the first book's token_id. When the
  // parent passes an empty order_books array (bot just booted), the
  // selector shows a placeholder and the chart shows its empty state.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(
    orderBooks[0]?.token_id ?? null,
  )
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1m')
  const [depth, setDepth] = useState<DepthData | null>(null)
  // W52-b — depth fetch status drives the shimmer skeleton + error card.
  // Initialized to 'loading' when a token is already selected on mount so
  // the first render shows the skeleton (not a flash of zero-state).
  const [depthStatus, setDepthStatus] = useState<DepthStatus>(
    orderBooks[0]?.token_id ? 'loading' : 'idle',
  )
  // W52-b — retry token. Bumps to force the depth fetch effect to re-run
  // when the trader clicks "Retry depth" on the error card.
  const [retryToken, setRetryToken] = useState(0)

  // Re-sync `selectedTokenId` when the parent's orderBooks list changes
  // (e.g. on first snapshot landing after the panel mounts, or when a
  // market goes offline and the bot drops it from the list).
  useEffect(() => {
    if (!selectedTokenId && orderBooks.length > 0) {
      setSelectedTokenId(orderBooks[0].token_id)
      return
    }
    if (selectedTokenId && !orderBooks.some((b) => b.token_id === selectedTokenId)) {
      // Selected market dropped — fall back to the first available.
      setSelectedTokenId(orderBooks[0]?.token_id ?? null)
    }
  }, [orderBooks, selectedTokenId])

  // Poll /api/depth/{token_id} every 2s for the selected market. The
  // gateway port is injected by apiFetch (see @/lib/api). We clear stale
  // depth on token switch so the imbalance meter doesn't briefly show
  // the previous market's numbers. retryToken in the deps lets the
  // Retry button re-trigger the fetch without unmounting the card.
  useEffect(() => {
    if (!selectedTokenId) {
      setDepth(null)
      setDepthStatus('idle')
      return
    }
    setDepth(null)
    setDepthStatus('loading')
    let cancelled = false
    const fetchDepth = async () => {
      try {
        const apiUrl = getApiUrl()
        const res = await apiFetch(`${apiUrl}/api/depth/${selectedTokenId}`)
        if (!res.ok) {
          if (!cancelled) setDepthStatus('error')
          return
        }
        const json: DepthData = await res.json()
        if (!cancelled) {
          setDepth(json)
          setDepthStatus('ready')
        }
      } catch {
        if (!cancelled) setDepthStatus('error')
      }
    }
    fetchDepth()
    const timer = setInterval(fetchDepth, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedTokenId, retryToken])

  const handleRetryDepth = useCallback(() => {
    setDepthStatus('loading')
    setRetryToken((n) => n + 1)
  }, [])

  // Filter trades to the selected token. Bot trades carry `token_id`
  // directly; if it's missing (rare), we skip the trade.
  const flowTrades: FlowTrade[] = useMemo(() => {
    if (!selectedTokenId) return []
    return trades
      .filter((t) => t.token_id === selectedTokenId)
      .map(toFlowTrade)
  }, [trades, selectedTokenId])

  // Cumulative delta over the visible window — used for the top stats bar.
  // Recomputed each render from `flowTrades` (cheap; O(n) over ≤ a few
  // hundred trades).
  const cumulativeDelta = useMemo(() => {
    let d = 0
    for (const t of flowTrades) {
      d += t.side === 'BUY' ? t.size : -t.size
    }
    return d
  }, [flowTrades])

  // Trades per minute over the last 60s — the "tape speed" stat.
  const tradesPerMin = useMemo(() => {
    const now = Date.now()
    let c = 0
    for (const t of flowTrades) {
      if (t.timestamp >= now - 60_000) c += 1
    }
    return c
  }, [flowTrades])

  // Aggregate the depth ladder into the totals the imbalance meter needs.
  const imbalanceInput: OrderBookImbalanceProps = useMemo(() => {
    const bids = depth?.bids ?? []
    const asks = depth?.asks ?? []
    const bidVolume = bids.reduce((s, l) => s + (l.size || 0), 0)
    const askVolume = asks.reduce((s, l) => s + (l.size || 0), 0)
    // Best bid = highest bid price; best ask = lowest ask price. The
    // depth ladder from the bot is sorted ascending by price, so:
    //   best bid size = last bid entry's size
    //   best ask size = first ask entry's size
    // But we use the best_bid/best_ask fields from the response
    // (already computed server-side) for the price chips.
    const bestBidSize = bids.length > 0 ? bids[bids.length - 1]?.size ?? null : null
    const bestAskSize = asks.length > 0 ? asks[0]?.size ?? null : null
    return {
      bidVolume,
      askVolume,
      bestBidSize,
      bestAskSize,
      mid: depth?.mid ?? null,
      bestBid: depth?.best_bid ?? null,
      bestAsk: depth?.best_ask ?? null,
      spread: depth?.spread ?? null,
    }
  }, [depth])

  const imbalanceRatio = useMemo(
    () => computeImbalance(imbalanceInput.bidVolume, imbalanceInput.askVolume),
    [imbalanceInput.bidVolume, imbalanceInput.askVolume],
  )

  const selectedBook = useMemo(
    () => orderBooks.find((b) => b.token_id === selectedTokenId) ?? null,
    [orderBooks, selectedTokenId],
  )

  const handleTokenChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value || null
      setSelectedTokenId(id)
      if (id && selectedBook && onSelectMarket) {
        // Surface the selection to the parent so it can open the
        // depth modal / chart modal in a follow-up UX iteration.
        const book = orderBooks.find((b) => b.token_id === id)
        if (book) onSelectMarket(book.token_id, book.slug)
      }
    },
    [onSelectMarket, orderBooks, selectedBook],
  )

  // W52-b — Tone hooks for the stats badges. Drives the `data-tone`
  // attribute (downstream CSS layer can tone-tint the bg/halo) AND the
  // value text colour. Positive Δ = buy pressure (green), negative Δ =
  // sell pressure (red), zero = neutral. Imbalance ratio uses the same
  // palette but switches to amber when |ratio| < 0.1 (balanced book).
  const deltaTone: Tone =
    cumulativeDelta > 0 ? 'positive' : cumulativeDelta < 0 ? 'negative' : 'neutral'

  const imbalanceTone: Tone =
    Math.abs(imbalanceRatio) < 0.1
      ? 'warn'
      : imbalanceRatio > 0
        ? 'positive'
        : 'negative'

  // Depth card section-header tone reflects the depth fetch status —
  // red on error, otherwise mirrors the imbalance ratio's tone so the
  // header chip colour matches the imbalance ratio chip below it.
  const depthHeaderTone: Tone =
    depthStatus === 'error'
      ? 'negative'
      : depthStatus === 'loading'
        ? 'neutral'
        : imbalanceTone

  return (
    <div
      className={`flex flex-col gap-3 h-full ${className ?? ''}`}
      data-testid="order-flow-panel"
      role="region"
      aria-label="Order flow panel"
    >
      {/* Top control bar: token selector + window selector + stats */}
      <div
        className="card bg-[#13161e] border border-[#1f2335] shadow-md p-3"
        data-testid="order-flow-panel-header"
      >
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Token selector */}
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="ofp-token-select"
              className="text-[10px] uppercase font-bold text-[#7e8aaa] flex-shrink-0"
            >
              Token
            </label>
            <select
              id="ofp-token-select"
              value={selectedTokenId ?? ''}
              onChange={handleTokenChange}
              className="bg-[#0e1015] border border-[#1f2335] text-[#dde1ed] text-xs rounded px-2 py-1 mono max-w-[260px] truncate focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              aria-label="Select market token"
              data-testid="order-flow-token-select"
            >
              {orderBooks.length === 0 && (
                <option value="">No markets available</option>
              )}
              {orderBooks.map((b) => (
                <option key={b.token_id} value={b.token_id}>
                  {b.slug || b.token_id.slice(0, 16)}
                </option>
              ))}
            </select>
          </div>

          {/* Window selector — refined buttons (tabular-nums + hover border) */}
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Time window"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeWindow(opt.value)}
                className={`px-2 py-1 rounded text-[10px] mono font-bold border tabular-nums transition-colors ${
                  timeWindow === opt.value
                    ? 'bg-blue-500/20 text-cyan-300 border-blue-500/50'
                    : 'bg-[#0e1015] text-[#7e8aaa] border-[#1f2335] hover:text-white hover:border-[#2a2f48]'
                }`}
                aria-pressed={timeWindow === opt.value}
                data-testid={`order-flow-window-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Stats badges — tone-tinted + tabular-nums */}
          <div className="flex items-center gap-3 text-[10px]">
            {/* Cumulative Δ — green for buy pressure, red for sell pressure */}
            <div
              className="bg-[#0e1015] border border-[#1f2335] rounded px-2 py-1 transition-colors"
              data-tone={deltaTone}
              data-testid="order-flow-delta-stat"
              title="Cumulative delta — net buy volume minus sell volume over the visible window"
            >
              <span className="text-[#7e8aaa] uppercase">Δ </span>
              <span className={`mono font-bold tabular-nums ${TONE[deltaTone].text}`}>
                {cumulativeDelta >= 0 ? '+' : ''}{cumulativeDelta.toFixed(1)}
              </span>
            </div>
            {/* Imbalance ratio — green bid-heavy, red ask-heavy, amber balanced */}
            <div
              className="bg-[#0e1015] border border-[#1f2335] rounded px-2 py-1 transition-colors"
              data-tone={imbalanceTone}
              data-testid="order-flow-imbalance-stat"
              title="Bid/ask volume imbalance — (bid − ask) / (bid + ask)"
            >
              <span className="text-[#7e8aaa] uppercase">Imb </span>
              <span className={`mono font-bold tabular-nums ${TONE[imbalanceTone].text}`}>
                {(imbalanceRatio * 100).toFixed(0)}%
              </span>
            </div>
            {/* Tape speed — neutral numeric (trades/min over last 60s) */}
            <div
              className="bg-[#0e1015] border border-[#1f2335] rounded px-2 py-1 transition-colors"
              data-tone="neutral"
              title="Tape speed — trades per minute over the last 60 seconds"
            >
              <span className="text-[#7e8aaa] uppercase">Tape </span>
              <span className="mono font-bold tabular-nums text-[#dde1ed]">
                {tradesPerMin}/min
              </span>
            </div>
            {/* Live / Polling badge — refined with PulseDot */}
            <div
              className={`mono text-[10px] px-2 py-1 rounded border flex items-center gap-1.5 transition-colors ${
                isRealtime
                  ? 'border-green-500/50 text-green-400 bg-green-500/10'
                  : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
              }`}
              role="status"
              data-testid="order-flow-realtime-badge"
              title={
                isRealtime
                  ? 'WebSocket is live — trades arrive in real time'
                  : 'WebSocket is offline — polling REST every 2s'
              }
            >
              {isRealtime ? (
                <PulseDot tone="positive" />
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  aria-hidden="true"
                />
              )}
              {isRealtime ? 'LIVE' : 'POLL'}
            </div>
          </div>
        </div>
      </div>

      {/* Order flow chart — full width */}
      <div
        className="card bg-[#13161e] border border-[#1f2335] shadow-md p-3"
        data-testid="order-flow-chart-card"
      >
        <SectionHeader
          icon={BarChart3}
          title="Order Flow — buys vs sells + cumulative Δ"
          description="per-trade volume + cumulative delta"
          tone="neutral"
        />
        {selectedTokenId ? (
          <OrderFlowChart
            trades={flowTrades}
            window={timeWindow}
            height={240}
          />
        ) : (
          <NoMarketsEmptyState />
        )}
      </div>

      {/* Bottom grid: imbalance (left) + tape (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        <div
          className="card bg-[#13161e] border border-[#1f2335] shadow-md p-3"
          data-testid="order-flow-imbalance-card"
        >
          <SectionHeader
            icon={Scale}
            title="Bid / Ask Imbalance"
            description={
              depthStatus === 'loading'
                ? 'fetching depth…'
                : depthStatus === 'error'
                  ? 'feed unavailable'
                  : 'depth ladder'
            }
            tone={depthHeaderTone}
          />
          {selectedTokenId && depthStatus === 'loading' && <ImbalanceSkeleton />}
          {selectedTokenId && depthStatus === 'error' && (
            <DepthErrorCard onRetry={handleRetryDepth} />
          )}
          {selectedTokenId && (depthStatus === 'ready' || depthStatus === 'idle') && (
            <OrderBookImbalance {...imbalanceInput} />
          )}
          {!selectedTokenId && (
            <div
              className="text-[10px] text-[#5a637a] italic text-center py-6"
              data-testid="order-flow-imbalance-placeholder"
            >
              Select a token to view depth.
            </div>
          )}
        </div>
        <div
          className="card bg-[#13161e] border border-[#1f2335] shadow-md p-3"
          data-testid="order-flow-tape-card"
        >
          <SectionHeader
            icon={Receipt}
            title="Time & Sales"
            description="live prints"
            tone="neutral"
          />
          <TradeTape trades={flowTrades} height={320} />
        </div>
      </div>
    </div>
  )
}

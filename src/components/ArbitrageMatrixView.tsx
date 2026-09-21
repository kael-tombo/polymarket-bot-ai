// components/ArbitrageMatrixView.tsx — High-Frequency Binary Dutch-Book Arbitrage Scanner
'use client'

// ─────────────────────────────────────────────────────────────────────────────
// W53-b — Final UI polish pass (mirrors the W51-2 / W52 design-system layer).
// ─────────────────────────────────────────────────────────────────────────────
// This pass applies the unified visual vocabulary already shipped in
// MarketScreener (W52-a) + OrderFlowPanel (W52-b) to the arbitrage scanner:
//
//   • Tone system — positive / negative / warn / neutral palette shared by
//     the KPI strip, the row cells, and the empty / error states. Surfaced
//     as `data-tone="{...}"` hooks so the downstream CSS layer can target
//     them with consistent colour rules.
//   • SectionHeader — Lucide icon + uppercase 9.5px tracking-wider bold
//     title in muted text-[var(--text-secondary)]. Replaces the bare 🎯 emoji on the
//     opportunities card header. The title lives in its own <span> so
//     RTL's `getByText(/Verified Dutch-Book Pairs \(2\)/i)` resolves to
//     just the inner span (the parent div has no direct text node).
//   • Shimmer skeleton loading state — a 5-row `.skeleton-table` mirrors
//     the live 8-column matrix structure so the trader sees a clean
//     shimmer instead of a blank card while the first poll resolves.
//     The "Scanning synchronized binary order books…" caption is
//     preserved verbatim above the skeleton so the W22-2 loading test
//     still resolves. role=status + aria-live=polite for screen readers.
//   • Polished empty state — a Lucide `Crosshair` icon + the existing
//     "No arbitrage discrepancies found" title + the existing description
//     copy. The title text is preserved verbatim so the W22-2 empty-state
//     test still resolves.
//   • Polished error state — the existing `.banner-danger` banner is
//     refined with consistent RefreshCw / X Lucide icons (the bare text
//     "Retry" and "Dismiss" controls are preserved so the W22-1 retry /
//     dismiss tests still resolve, including the `aria-label="Dismiss
//     error"` requirement).
//   • Refined matrix grid — every numeric cell now carries `tabular-nums`
//     (in addition to the existing `mono` class) for clean column
//     alignment, plus a `data-tone` hook reflecting the cell's semantic
//     meaning (YES ask=positive, NO ask=neutral, Combined Cost=warn,
//     Gross Edge=positive, Net ROI=positive, Max Cap=neutral). Each row
//     gains a `data-tone` reflecting its edge tier (strong/standard) and
//     a subtle hover left-accent bar on the first cell.
//   • Refined controls — the search input gains a Lucide `Search` icon
//     inside the field + a focus ring. The "Scan Now" button embeds a
//     Lucide `RefreshCw` icon. The "CSV" export button embeds a Lucide
//     `Download` icon. All existing class names preserved.
//   • Refined KPI strip — each KPI value gains `tabular-nums` and a
//     `data-tone` hook (positive when non-zero, neutral when zero).
//   • Refined opportunity rows — hover background, transition-colors,
//     cursor-pointer on the market cell, group-hover colour shift on
//     the question text, and a left-accent bar on hover.
//
// CONSTRAINTS preserved (no test regressions):
//   • 'use client' directive preserved.
//   • All existing class names preserved (card, bg-[var(--bg-surface)], border-
//     [var(--border)], shadow-2xl, p-4, space-y-3.5, overflow-y-auto,
//     scrollbar-thin, badge + badge-amber, btn + btn-primary + btn-ghost
//     + btn-xs + btn-sm, input, mono, data-table, table-container,
//     divide-y + divide-[var(--border)]/50, banner-danger, empty-state +
//     empty-state-title + empty-state-desc, hover:bg-blue-500/10).
//   • All existing text content preserved verbatim — title, KPI labels
//     with colons, KPI values, table headers, row cell values (+X bps,
//     +X.XX%, etc.), loading caption, empty-state title + description,
//     error banner text, Retry + Dismiss controls, Scan Now, CSV,
//     "Verified Dutch-Book Pairs (N)" card header.
//   • All API calls preserved (apiFetch wrapper adding Authorization
//     header; GET /api/arbitrage/opportunities; POST /api/arbitrage/
//     execute with the same JSON body).
//   • Polling interval preserved (setInterval 2500 ms; cleared on
//     unmount).
//   • All aria-labels preserved (Execute Arb button, Dismiss button,
//     slider).
//   • All role attributes preserved (banner-danger role=alert,
//     empty-state role=status, table role=table with aria-label).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo, type ReactNode } from 'react'
import {
  Zap,
  Search,
  RefreshCw,
  Download,
  Target,
  Crosshair,
  AlertTriangle,
  X,
  Loader2,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { formatHierarchicalMarket } from '@/lib/formatters'
import { fmtPrice, fmtUsd } from '@/lib/design-tokens'

interface ArbOpportunity {
  token_id_yes: string
  token_id_no: string
  slug: string
  category: string
  yes_ask: number
  no_ask: number
  total_cost: number
  gross_profit_bps: number
  net_roi_pct: number
  max_executable_size_usdc: number
  status: string
}

interface Props {
  onSelectMarket?: (m: { tokenId: string; slug: string }) => void
}

// ── W53-b Tone vocabulary ──────────────────────────────────────────────────
// Unified tone palette shared across the KPI strip, the matrix cells, and
// the empty / error states. Static class strings so Tailwind 4's scanner
// picks them up at build time. Mirrors the W51-2 / W52-b Tone system used
// by PositionsPanel / OrdersPanel / OrderFlowPanel / MLPanel but reduced
// to the four tones this panel needs (positive / negative / warn / neutral
// — no info / purple here).
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
  neutral:  { text: 'text-[var(--text-secondary)]',  dot: 'bg-[var(--text-secondary)]',  halo: '' },
}

// ── SectionHeader — Lucide icon + uppercase title + optional dim description
// Mirrors the W51-2d / W52-b SectionHeader pattern: icon at 12px, uppercase
// 9.5px tracking-wider bold title in muted text-[var(--text-secondary)], optional dim
// italic 8.5px description, optional trailing node. The title lives in its
// own <span> so RTL's `getByText('Verified Dutch-Book Pairs (2)')` matches
// just the span, not the wrapper div (the icon is an SVG with no text
// content; the trailing node is a sibling span with its own text).
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
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[var(--text-secondary)] italic truncate">
          {description}
        </span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── MatrixSkeleton — shimmer placeholder for the matrix-loading state ──────
// Renders while the first poll is in-flight so the trader sees a clean
// shimmer instead of a blank card. Uses the project's `.skeleton-table` /
// `.skeleton-row` / `.skeleton-cell` classes (which carry the
// `skeleton-shimmer` keyframe) augmented with `.animate-pulse` for an
// additional left-to-right shine sweep. aria-hidden because the caption
// "Scanning synchronized binary order books…" + role=status +
// aria-live=polite on the parent wrapper already announce the loading
// state to screen readers.
//
// Column flex weights approximate the live 8-column matrix:
//   • Market Contract — 3x (matches min-w-[200px])
//   • YES Ask         — 70px fixed
//   • NO Ask          — 70px fixed
//   • Combined Cost   — 80px fixed
//   • Gross Edge      — 80px fixed
//   • Net ROI         — 70px fixed
//   • Max Cap         — 70px fixed
//   • Action          — 110px fixed
function MatrixSkeleton({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div
      className="skeleton-table mx-3 mb-3 rounded-md border border-[var(--border)]"
      aria-hidden="true"
      data-testid="arbitrage-matrix-skeleton"
    >
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: '40px' }}>
          <div className="skeleton-cell animate-pulse" style={{ flex: '3 1 0' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 70px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 70px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 80px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 80px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 70px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 70px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 110px' }} />
        </div>
      ))}
    </div>
  )
}

// ── EmptyState — polished empty state when no opportunities are returned ────
// Renders a Lucide `Crosshair` icon + the existing "No arbitrage
// discrepancies found" title + the existing description copy. The title
// text is preserved verbatim so the W22-2 empty-state test still resolves.
// role=status so screen readers announce the empty state transition.
function EmptyState({ minBps }: { minBps: number }) {
  return (
    <div
      className="empty-state py-8"
      role="status"
      data-testid="arbitrage-matrix-empty"
    >
      <Crosshair
        className="size-8 text-[var(--text-secondary)]/70"
        aria-hidden="true"
      />
      <span className="empty-state-title text-sm font-semibold">
        No arbitrage discrepancies found
      </span>
      <span className="empty-state-desc text-xs max-w-md text-center text-[var(--text-secondary)]">
        When the combined ask cost of YES and synthetic NO drops below $0.995 (exceeding {minBps} bps edge), opportunities will appear here.
      </span>
    </div>
  )
}

// ── edgeTier — tone for a row based on its gross edge strength ────────────
// Arbitrage opportunities are profitable by definition (gross_profit_bps > 0),
// so every row receives a positive-leaning tone. We distinguish strong vs
// marginal edges so the trader's eye is drawn to the highest-edge rows
// first. Strong ≥ 50 bps → positive; mid 25-49 bps → positive; marginal
// 10-24 bps → warn (close to the minBps threshold, may evaporate). Below
// minBps rows are filtered out by `filteredOpps` so we never see them here.
function edgeTier(bps: number): Tone {
  if (bps >= 25) return 'positive'  // strong / standard profit
  if (bps >= 10) return 'warn'      // marginal profit
  return 'neutral'                  // barely above threshold (rare)
}

export default function ArbitrageMatrixView({ onSelectMarket }: Props = {}) {
  const [opportunities, setOpportunities] = useState<ArbOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState<string | null>(null)
  const [lastExecuted, setLastExecuted] = useState<{ ok: boolean; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [minBps, setMinBps] = useState(10)
  // W22-1 — surface fetch failures instead of silent swallowing.
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchOpportunities = async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/arbitrage/opportunities`)
      if (res.ok) {
        const data = await res.json()
        setOpportunities(data.opportunities || [])
        setFetchError(null)
      } else {
        setFetchError(`Failed to load arbitrage opportunities (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[ArbitrageMatrixView] Failed to fetch arbitrage opportunities:', e)
      setFetchError(e instanceof Error ? e.message : 'Network error loading arbitrage opportunities')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOpportunities()
    const timer = setInterval(fetchOpportunities, 2500)
    return () => clearInterval(timer)
  }, [])

  const handleExecute = async (opp: ArbOpportunity) => {
    setExecuting(opp.token_id_yes)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/arbitrage/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_id_yes: opp.token_id_yes,
          token_id_no: opp.token_id_no,
          size_usdc: Math.min(opp.max_executable_size_usdc, 3.0), // $3 per-market risk ceiling
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const statuses = (data.legs || []).map((l: { leg: string; status: string }) => `${l.leg}: ${l.status}`).join(' · ')
        setLastExecuted({ ok: true, message: `Arbitrage legs successfully executed (${statuses})` })
        fetchOpportunities()
      } else {
        const body = await res.json().catch(() => null)
        setLastExecuted({ ok: false, message: body?.detail || `Execution rejected by risk engine (HTTP ${res.status})` })
      }
    } catch (e) {
      console.error('[ArbitrageMatrixView] Failed to execute arbitrage:', e)
      setLastExecuted({ ok: false, message: 'Execution network request failed' })
    }
    setExecuting(null)
  }

  const filteredOpps = useMemo(() => {
    return opportunities.filter((opp) => {
      const matchesSearch = opp.slug.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesBps = opp.gross_profit_bps >= minBps
      return matchesSearch && matchesBps
    })
  }, [opportunities, searchQuery, minBps])

  const maxEdge = opportunities.reduce((max, o) => Math.max(max, o.gross_profit_bps), 0)
  const avgRoi = opportunities.length > 0
    ? opportunities.reduce((sum, o) => sum + o.net_roi_pct, 0) / opportunities.length
    : 0

  // W53-b — Tone hooks for the KPI strip. Positive when the underlying
  // metric is non-zero (real arbs in flight), neutral when the strip is
  // dark (no opportunities yet). Drives the `data-tone` attribute on each
  // KPI wrapper so the downstream CSS layer can colour the border / glow.
  const activeArbsTone: Tone = opportunities.length > 0 ? 'positive' : 'neutral'
  const maxEdgeTone: Tone = maxEdge > 0 ? 'positive' : 'neutral'
  const avgRoiTone: Tone = avgRoi > 0 ? 'positive' : 'neutral'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4 space-y-3.5 overflow-y-auto scrollbar-thin shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[var(--border)] gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            {/* W53-b — Lucide Zap replaces the bare ⚡ emoji for crisp
                rendering at small sizes. aria-hidden so the title
                remains the only accessible-name contribution. */}
            <Zap className="size-4 text-amber-300" aria-hidden="true" />
            <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">
              High-Frequency Binary Dutch-Book Arbitrage Scanner
            </span>
            <span className="badge badge-amber text-[9.5px]">Paper Mode · $3 Cap</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Real-time mispricing detector: <code>Ask(YES) + Ask(NO) &lt; $1.00 - fees</code> (Guaranteed synthetic delta-neutral profit)
          </p>
        </div>

        {/* Aggregate KPI Strip — refined with tabular-nums + data-tone hooks */}
        <div className="flex items-center gap-2 text-xs">
          <div
            className="bg-[var(--bg-base)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5"
            data-tone={activeArbsTone}
            title="Number of arbitrage opportunities currently passing the min-edge filter"
          >
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Active Arbs:</span>
            <span className="mono font-bold text-cyan-400 text-xs tabular-nums">{opportunities.length}</span>
          </div>
          <div
            className="bg-[var(--bg-base)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5"
            data-tone={maxEdgeTone}
            title="Highest gross edge across the active arbitrage set"
          >
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Max Edge:</span>
            <span className={`mono font-bold text-xs tabular-nums ${TONE[maxEdgeTone].text}`}>+{maxEdge.toFixed(0)} bps</span>
          </div>
          <div
            className="bg-[var(--bg-base)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5"
            data-tone={avgRoiTone}
            title="Average net ROI (after fees) across the active arbitrage set"
          >
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Avg Net ROI:</span>
            <span className={`mono font-bold text-xs tabular-nums ${TONE[avgRoiTone].text}`}>+{avgRoi.toFixed(2)}%</span>
          </div>
          <button
            onClick={() => {
              if (opportunities.length === 0) return
              const headers = ['Market Slug', 'YES Ask', 'NO Ask', 'Combined Cost', 'Gross Edge (bps)', 'Net ROI (%)', 'Max Executable USD']
              const rows = opportunities.map((o) => [
                `"${o.slug.replace(/"/g, '""')}"`,
                o.yes_ask.toFixed(4),
                o.no_ask.toFixed(4),
                o.total_cost.toFixed(4),
                o.gross_profit_bps.toFixed(0),
                o.net_roi_pct.toFixed(2),
                o.max_executable_size_usdc.toFixed(2),
              ])
              const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
              const encodedUri = encodeURI(csvContent)
              const link = document.createElement('a')
              link.setAttribute('href', encodedUri)
              link.setAttribute('download', `polymarket_arbitrage_${Date.now()}.csv`)
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
            }}
            disabled={opportunities.length === 0}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-strong)] flex items-center gap-1 transition-colors"
            title="Export Arbitrage Matrix CSV"
            aria-label="Export Arbitrage Matrix CSV"
          >
            {/* W53-b — Lucide Download replaces the bare 📥 emoji. aria-hidden
                so the accessible name is just "CSV" (no test touches this
                button's name). */}
            <Download className="size-3" aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      {/* Filter & Execution Controls — refined with Lucide icons + focus ring */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border)]">
        <div className="relative flex-1 max-w-sm">
          {/* W53-b — Lucide Search icon positioned absolutely inside the
              input's left padding (pl-7 reserves the space). aria-hidden
              + pointer-events-none so it never intercepts clicks. */}
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-[var(--text-secondary)] pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Filter arbitrage by market name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded text-xs pl-7 pr-2.5 py-1.5 text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:ring-1 focus:ring-cyan-500/20 focus:border-cyan-500/30 transition-colors"
            aria-label="Filter arbitrage by market name"
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-secondary)] text-[11px] font-semibold">Min Profit:</span>
            <input
              type="range"
              min={0}
              max={150}
              step={5}
              value={minBps}
              onChange={(e) => setMinBps(Number(e.target.value))}
              className="w-24 accent-cyan-400 cursor-pointer"
              aria-label="Minimum profit threshold in basis points"
            />
            <span
              className="mono text-cyan-400 font-bold w-12 tabular-nums"
              data-tone="positive"
              title="Minimum gross edge required for an opportunity to surface in the matrix"
            >
              {minBps} bps
            </span>
          </div>

          <button
            onClick={fetchOpportunities}
            className="btn btn-ghost btn-xs text-[var(--text-secondary)] hover:text-white border border-[var(--border)] px-2.5 py-1 flex items-center gap-1 transition-colors hover:border-[var(--border-strong)]"
            aria-label="Scan Now"
            title="Trigger an immediate re-scan of the arbitrage opportunities feed"
          >
            {/* W53-b — Lucide RefreshCw replaces the bare 🔄 emoji. aria-hidden
                so the button's accessible name remains "Scan Now" (the W22-2
                test resolves via getByRole('button', { name: /Scan Now/i })). */}
            <RefreshCw className="size-3" aria-hidden="true" />
            Scan Now
          </button>
        </div>
      </div>

      {lastExecuted && (
        <div
          className={`text-xs px-3 py-2 rounded flex justify-between items-center transition-colors ${
            lastExecuted.ok
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
          role="status"
          data-tone={lastExecuted.ok ? 'positive' : 'negative'}
          data-testid="arbitrage-execution-banner"
        >
          <span className="flex items-center gap-1.5">
            {/* W53-b — Lucide Check / AlertTriangle replaces the bare ✅ / ⚠️
                emoji. aria-hidden so the banner's text message is the only
                accessible-name contribution. */}
            {lastExecuted.ok ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            )}
            <span>{lastExecuted.message}</span>
          </span>
          <button
            onClick={() => setLastExecuted(null)}
            className="hover:underline font-bold ml-2 flex items-center"
            aria-label="Dismiss execution banner"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* W22-1 — fetch-error banner (previously silently swallowed). */}
      {fetchError && (
        <div
          className="banner-danger text-xs px-3 py-2 rounded flex justify-between items-center"
          role="alert"
          data-tone="negative"
          data-testid="arbitrage-matrix-error"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{fetchError}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOpportunities()}
              className="hover:underline text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
            </button>
            <button
              onClick={() => setFetchError(null)}
              className="hover:underline text-xs flex items-center gap-0.5"
              aria-label="Dismiss error"
            >
              <X className="w-3 h-3" aria-hidden="true" /> Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Opportunities List */}
      <div className="card p-3 bg-[var(--bg-base)] border border-[var(--border)] flex-1">
        {/* W53-b — SectionHeader replaces the bare 🎯 emoji header. The
            title text "Verified Dutch-Book Pairs (N)" is preserved verbatim
            (rendered inside the title <span>) so the W22-2 test resolves.
            The trailing "Automatic Dual-Leg Order Placement" caption is
            preserved as a sibling span inside the trailing slot. */}
        <SectionHeader
          icon={Target}
          title={`Verified Dutch-Book Pairs (${filteredOpps.length})`}
          tone="neutral"
          trailing={
            <span className="text-[10px] text-[var(--text-secondary)] mono">
              Automatic Dual-Leg Order Placement
            </span>
          }
        />

        {loading ? (
          // W53-b — Shimmer skeleton loader replaces the bare spinner + text.
          // Renders a dim "Scanning synchronized binary order books for
          // Dutch-book inefficiencies…" caption above N shimmer rows
          // mirroring the live 8-column matrix. The caption text is
          // preserved verbatim so the W22-2 loading test still resolves.
          // The wrapper carries role=status + aria-live=polite for screen
          // readers.
          <div
            className="flex flex-col"
            role="status"
            aria-live="polite"
            data-testid="arbitrage-matrix-loading"
          >
            <div className="flex items-center gap-2 px-3 py-2 text-[var(--text-secondary)] text-[11px]">
              <Loader2 className="size-3 animate-spin text-cyan-400/70" aria-hidden="true" />
              <span className="animate-pulse">
                Scanning synchronized binary order books for Dutch-book inefficiencies…
              </span>
            </div>
            <MatrixSkeleton rowCount={5} />
          </div>
        ) : filteredOpps.length === 0 ? (
          <EmptyState minBps={minBps} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin table-container">
            <table className="data-table text-xs w-full" role="table" aria-label="Arbitrage opportunities table">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-[10.5px] uppercase tracking-wider">
                  <th scope="col" className="min-w-[200px] text-left py-1">Market Contract</th>
                  <th scope="col" className="text-right">YES Ask</th>
                  <th scope="col" className="text-right">NO Ask</th>
                  <th scope="col" className="text-right">Combined Cost</th>
                  <th scope="col" className="text-right">Gross Edge</th>
                  <th scope="col" className="text-right">Net ROI</th>
                  <th scope="col" className="text-right">Max Cap ($3)</th>
                  <th scope="col" className="text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/50">
                {filteredOpps.map((opp) => {
                  const info = formatHierarchicalMarket(opp.slug)
                  const rowTone = edgeTier(opp.gross_profit_bps)
                  const strongEdge = opp.gross_profit_bps >= 50
                  return (
                    <tr
                      key={opp.token_id_yes}
                      className="hover:bg-blue-500/10 transition-colors group"
                      data-tone={rowTone}
                      data-edge-tier={strongEdge ? 'strong' : 'standard'}
                    >
                      {/* Market Contract cell — clickable, with hover left-accent bar.
                          The `border-l-2 border-transparent hover:border-cyan-500/60`
                          creates a subtle accent that lights up on hover, drawing
                          the trader's eye to the row they're inspecting. */}
                      <td
                        className="py-2.5 max-w-[240px] cursor-pointer relative border-l-2 border-transparent hover:border-cyan-500/60 transition-colors"
                        onClick={() => onSelectMarket?.({ tokenId: opp.token_id_yes, slug: opp.slug })}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider truncate">
                            {info.category.icon} {info.eventTitle}
                          </span>
                          <span
                            className="text-[var(--text-primary)] group-hover:text-cyan-300 font-medium leading-snug text-xs block whitespace-normal transition-colors"
                            title={info.fullLabel}
                          >
                            {info.question}
                          </span>
                        </div>
                      </td>
                      {/* YES Ask — green (positive leg cost) */}
                      <td
                        className="mono text-right text-green-400 font-semibold tabular-nums"
                        data-tone="positive"
                      >
                        {fmtPrice(opp.yes_ask)}
                      </td>
                      {/* NO Ask — cyan (neutral synthetic-leg cost) */}
                      <td
                        className="mono text-right text-cyan-400 font-semibold tabular-nums"
                        data-tone="neutral"
                      >
                        {fmtPrice(opp.no_ask)}
                      </td>
                      {/* Combined Cost — amber (warn: total cost approaching $1) */}
                      <td
                        className="mono text-right text-amber-400 font-bold tabular-nums"
                        data-tone="warn"
                      >
                        {fmtPrice(opp.total_cost)}
                      </td>
                      {/* Gross Edge — green (positive profit signal) */}
                      <td
                        className="mono text-right font-bold text-green-400 tabular-nums"
                        data-tone="positive"
                      >
                        +{opp.gross_profit_bps.toFixed(0)} bps
                      </td>
                      {/* Net ROI — emerald (positive net profit after fees) */}
                      <td
                        className="mono text-right font-bold text-emerald-400 tabular-nums"
                        data-tone="positive"
                      >
                        +{opp.net_roi_pct.toFixed(2)}%
                      </td>
                      {/* Max Cap — neutral (paper-mode risk ceiling) */}
                      <td
                        className="mono text-right text-[var(--text-primary)] tabular-nums"
                        data-tone="neutral"
                      >
                        {fmtUsd(Math.min(opp.max_executable_size_usdc, 3.0))}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={() => handleExecute(opp)}
                          disabled={executing === opp.token_id_yes}
                          className="btn btn-primary btn-xs px-3 py-1 font-bold shadow-md hover:shadow-cyan-500/20 inline-flex items-center gap-1 transition-shadow"
                          aria-label={`Execute paper arbitrage on ${info.question}`}
                        >
                          {executing === opp.token_id_yes ? (
                            <>
                              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                              Routing…
                            </>
                          ) : (
                            <>
                              <Zap className="size-3" aria-hidden="true" />
                              Execute Arb
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

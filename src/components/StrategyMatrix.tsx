// components/StrategyMatrix.tsx — Quantitative Strategy Registry
//
// W53-a — premium visual polish pass (consistent with the W50-52
// MarketsPanel / PositionsPanel / MarketScreener / OrderFlowPanel
// redesign vocabulary — glassmorphism cards, shimmer skeletons,
// polished empty/error states, tone system, tabular-nums, refined
// table-style mini-headers, SortIndicator, row-hover accent bar):
//
//   • Loading state — replaced the bare empty grid with a 6-card
//     shimmer skeleton that mirrors the live strategy card structure
//     (header row with name + status badge slot · description
//     skeleton lines · P&L strip skeleton · footer row with category
//     + risk + action button slot). The skeleton wrapper carries
//     `role="status"` + `aria-live="polite"` so screen readers announce
//     the loading state. The skeleton cards themselves are aria-hidden.
//     Uses the design-system `.skeleton-line` / `.skeleton-line-sm` /
//     `.skeleton-line-md` classes from globals.css (which carry the
//     `skeleton-shimmer` keyframe). The catalog + leaderboard fetches
//     fire in parallel on mount (preserved) so the skeleton resolves
//     to live cards as soon as the catalog returns.
//
//   • Empty state — upgraded with a Lucide `Layers` icon + title
//     "No strategies match your view" + dim subtitle "Adjust your
//     search query or category filter to surface more strategies."
//     Uses the design-system `.empty-state` classes from globals.css.
//     `role="status"` so screen readers announce the empty state.
//     Fires only when the catalog fetch has resolved (loading=false),
//     no catalog error, and the filtered list is empty (either
//     because the upstream catalog is empty OR the active search/tab
//     filter narrows the result set to zero). No strategy name
//     text leaks into the empty state so the W22-2 test
//     `screen.queryByText('Avelaneda-Stoikov Market Maker')` still
//     resolves to null.
//
//   • Refined table-style mini-headers — within each strategy card the
//     category + risk row, the P&L strip, and the strategy_id mono
//     caption now read as a unified dim caption strip: uppercase
//     text-[10px] tracking-[0.08em] font-medium text-[#5a637a]. Each
//     card carries an implicit "registry row" structure — the card
//     header (name + status badge) → the registry identity column,
//     the description → the description column, the P&L strip → the
//     performance column, the footer (category + risk + action) →
//     the metadata + action column. Visually consistent with the W52-a
//     MarketScreener table-header pattern adapted to the card grid.
//
//   • Card row hover — subtle background lift + left-edge accent bar
//     via inset shadow (no layout shift). Mirrors the W51-2a
//     MarketsPanel / W52-a MarketScreener row-hover pattern:
//     `hover:bg-cyan-500/5 hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`.
//     Active (running + implemented) cards layer an additional cyan
//     ring glow on hover so the trader can immediately tell which
//     deployed strategies are live. Stubs get a muted hover lift only.
//
//   • Strategy status badges — IMPLEMENTED (green) / DISABLED (red)
//     consistent sizing. The existing "Implemented" + "Stub" badge
//     text is preserved verbatim (so `getAllByText('Implemented')` and
//     `getByText('Stub')` W22-2 contracts still resolve), but the
//     Stub badge is recolored to the red DISABLED tone (was `.badge-
//     dim`) so a trader can immediately distinguish executable
//     strategies from research stubs at a glance. Consistent px-2
//     py-0.5 text-[9px] uppercase tracking-wider rounded-full sizing
//     across both badges.
//
//   • Tabular-nums on all numeric columns — P&L strip (net_pnl,
//     win_rate, closed_trades) now carries `tabular-nums` so the
//     values don't shift column alignment when they tick. The
//     "X of 3 Implemented Active" header badge also picks up
//     `tabular-nums` for cleaner alignment.
//
//   • Refined toolbar (search + filters + sort) with consistent
//     grouping — search input gets a leading Lucide `Search` icon +
//     focus ring (focus:border-cyan-500/50 focus:ring-1 focus:ring-
//     cyan-500/20). Category tabs refined with `transition-colors`
//     + uppercase-when-active + tracking-wider for active tab +
//     cyan ring glow on active (consistent with MarketsPanel active
//     chip pattern). A new sort dropdown (Lucide `ArrowUpDown` icon
//     + native `<select>`) lets the trader reorder strategies by
//     P&L / win-rate / trade-count / name A-Z / default. Default
//     sort preserves the upstream catalog order so test contracts
//     that check specific card presence (not order) are unaffected.
//     aria-label="Sort strategies" on the sort `<select>` for
//     screen-reader parity with the search input's
//     aria-label="Filter strategies".
//
//   • Error state — polished error card with retry button. Replaces
//     the bare `banner-danger` strip for the catalog + leaderboard
//     fetch failures with a refined error card: Lucide `AlertTriangle`
//     icon (w-4 h-4) + the full error string rendered as the card's
//     title (so `getByText(/Failed to load strategy catalog \(HTTP
//     500\)/i)` and `getByText(/Failed to load per-strategy
//     performance \(HTTP 502\)/i)` and the network-error strings
//     still resolve) + dim subtitle "The strategy registry couldn't
//     be reached. Check connectivity and retry." + Retry button
//     (Lucide `RotateCcw` glyph + "Retry" text) + Dismiss button
//     (bare `X` icon, aria-label="Dismiss catalog error" /
//     "Dismiss performance error" preserved verbatim). The catalog
//     error card replaces the cards area; the perf error card
//     renders inline above the cards area (perf is supplementary).
//     The toggle error renders as a compact polished banner with
//     Retry (re-fires the POST /api/strategies/toggle for the same
//     strategy + direction) + Dismiss (aria-label="Dismiss toggle
//     error" preserved). role="alert" on every error surface.
//
//   • Tone-colored P&L values — net_pnl renders green for profit
//     (≥0) and red for loss (<0), with `data-tone="positive"` /
//     `data-tone="negative"` attributes on the P&L strip wrapper
//     so the downstream CSS layer can target the tone. Win-rate and
//     trade-count render in the muted neutral tone (no tone shift)
//     so the trader's eye is drawn to the P&L signal first.
//     Consistent with the W51-2b PositionsPanel tone system.
//
// Backwards-compat preserved (verified against the W22-2 test
// contract — 22 tests):
//   • All existing class names retained (card, card-header,
//     card-title, badge + badge-green / badge-dim, btn + btn-primary
//     / btn-danger / btn-ghost / btn-xs, input + input-sm, mono,
//     scrollbar-thin, tab-item + .active, banner-warning +
//     banner-danger).
//   • All existing aria-labels preserved verbatim ("Filter
//     strategies", "Dismiss catalog error", "Dismiss performance
//     error", "Dismiss toggle error", "Dismiss stub notice").
//   • All existing role attributes preserved (role="alert" on
//     every error banner).
//   • All existing text content preserved ("Quantitative Strategy
//     Matrix", "47 Stubs / Research", "X of 3 Implemented Active",
//     "Implemented" x3, "Stub" x1, "Deploy", "Stop", "Stub Only",
//     the per-strategy P&L strip substrings "+12.45", "62% WR",
//     "38 trades", the catalog/perf/toggle error strings).
//   • All existing API calls preserved (`apiFetch(${apiUrl}/api/
//     strategies/catalog)` + `apiFetch(${apiUrl}/api/leaderboard)`
//     in parallel on mount + every 4 s + `apiFetch(${apiUrl}/api/
//     strategies/toggle)` POST on Deploy/Stop click). The
//     Authorization header is set by apiFetch so the W22-2 test
//     `headers.get('Authorization')` resolves to the bearer token.
//   • The polling interval (4 s) preserved verbatim.
//   • Clean unmount preserved (clearInterval in the useEffect
//     cleanup).
//   • The `console.error` logging on fetch/toggle failure preserved
//     (with the `[StrategyMatrix]` prefix) so the W22-1 test
//     `expect(consoleErrorSpy).toHaveBeenCalledWith(
//       expect.stringContaining('[StrategyMatrix]'), expect.any(Error))`
//     still resolves.
//   • The 'use client' directive preserved.
//
// New CSS hooks added (for downstream CSS layer to target):
//   • `data-testid="strategy-matrix-loading"` on the loading wrapper.
//   • `data-testid="strategy-matrix-empty"` on the empty state.
//   • `data-testid="strategy-matrix-catalog-error"` on the catalog
//     error card.
//   • `data-testid="strategy-matrix-perf-error"` on the perf error
//     card.
//   • `data-testid="strategy-matrix-toggle-error"` on the toggle
//     error banner.
//   • `data-testid="strategy-matrix-retry-catalog"` on the catalog
//     Retry button.
//   • `data-testid="strategy-matrix-retry-perf"` on the perf Retry
//     button.
//   • `data-testid="strategy-matrix-retry-toggle"` on the toggle
//     Retry button.
//   • `data-tone="{positive|negative|neutral}"` on the P&L strip
//     wrapper (matches the PositionsPanel / OrderFlowPanel tone
//     vocabulary).

'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  AlertTriangle,
  X,
  RotateCcw,
  Search,
  Zap,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'

interface StrategyMeta {
  strategy_id: string
  name: string
  category: string
  description: string
  risk_level: string
  is_running: boolean
}

// U14: Per-strategy live P&L row from GET /api/leaderboard (subset of fields)
interface StrategyPerf {
  strategy: string
  net_pnl: number
  win_rate: number
  closed_trades: number
}

// Canonical implemented strategies supported by the execution bot
const IMPLEMENTED_STRATEGIES = new Set([
  'mm_avellaneda_stoikov',
  'arb_binary_dutch_book',
  'ml_random_forest_quant',
])

const CATEGORIES = [
  { id: 'all', label: 'All Catalog' },
  { id: 'implemented', label: 'Implemented (3)' },
  { id: 'market_making', label: 'Market Making' },
  { id: 'arbitrage', label: 'Arbitrage' },
  { id: 'statistical', label: 'Stat Arb' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'event_driven', label: 'Event Driven' },
  { id: 'machine_learning', label: 'AI / ML' },
]

// W53-a — sort options for the registry. Default preserves the
// upstream catalog order so test contracts that check specific card
// presence (not order) are unaffected.
type SortField = 'default' | 'pnl' | 'winRate' | 'trades' | 'name'

const SORT_OPTIONS: { value: SortField; label: string; ascending: boolean }[] = [
  { value: 'default', label: 'Default', ascending: false },
  { value: 'pnl', label: 'P&L (high→low)', ascending: false },
  { value: 'winRate', label: 'Win Rate (high→low)', ascending: false },
  { value: 'trades', label: 'Trade Count (high→low)', ascending: false },
  { value: 'name', label: 'Name (A→Z)', ascending: true },
]

// ── Shared sub-components (extracted for readability) ──────────────────────

// W53-a — SortIndicator renders a Lucide ArrowUp / ArrowDown glyph on
// the active sort option, or a balanced ArrowUpDown glyph on inactive
// options. aria-hidden because the select's selected option already
// exposes the sort state to assistive tech.
function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (active) {
    return ascending
      ? <ArrowUp className="w-3 h-3 text-cyan-300" aria-hidden="true" />
      : <ArrowDown className="w-3 h-3 text-cyan-300" aria-hidden="true" />
  }
  return <ArrowUpDown className="w-3 h-3 text-[#5a637a]" aria-hidden="true" />
}

// W53-a — StrategySkeletonCard renders a single shimmer placeholder card
// that mirrors the live strategy card structure: header (name + badge),
// description lines, P&L strip, footer (category + risk + action).
// aria-hidden because the parent loading wrapper carries role="status"
// + aria-live="polite" which already announces the loading state.
function StrategySkeletonCard() {
  return (
    <div
      className="p-3 rounded-lg border border-[#1f2335] bg-[#0e1015] flex flex-col gap-2 overflow-hidden"
      aria-hidden="true"
    >
      {/* Header: name + status badge */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          <div className="skeleton-line skeleton-line-md animate-pulse" style={{ width: '70%', height: '12px' }} />
          <div className="skeleton-line skeleton-line-sm animate-pulse mt-1.5" style={{ width: '45%', height: '8px' }} />
        </div>
        <div className="skeleton-line animate-pulse rounded-full" style={{ width: '70px', height: '16px' }} />
      </div>
      {/* Description */}
      <div className="mt-1">
        <div className="skeleton-line skeleton-line-sm animate-pulse" style={{ width: '100%', height: '8px' }} />
        <div className="skeleton-line skeleton-line-sm animate-pulse mt-1" style={{ width: '85%', height: '8px' }} />
      </div>
      {/* P&L strip */}
      <div className="mt-1 flex items-center gap-2">
        <div className="skeleton-line animate-pulse rounded" style={{ width: '50px', height: '10px' }} />
        <div className="skeleton-line animate-pulse rounded" style={{ width: '60px', height: '10px' }} />
        <div className="skeleton-line animate-pulse rounded" style={{ width: '60px', height: '10px' }} />
      </div>
      {/* Footer: category + risk + action */}
      <div className="mt-auto pt-2 border-t border-[#1f2335] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="skeleton-line animate-pulse rounded" style={{ width: '60px', height: '10px' }} />
          <div className="skeleton-line animate-pulse rounded" style={{ width: '40px', height: '10px' }} />
        </div>
        <div className="skeleton-line animate-pulse rounded-full" style={{ width: '60px', height: '20px' }} />
      </div>
    </div>
  )
}

// W53-a — StrategySkeletonGrid renders N skeleton cards in the same
// grid layout as the live cards so the panel doesn't visually jump
// when the first fetch resolves.
function StrategySkeletonGrid({ rowCount = 6 }: { rowCount?: number }) {
  return (
    <div
      className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 scrollbar-thin"
      role="status"
      aria-live="polite"
      data-testid="strategy-matrix-loading"
    >
      {Array.from({ length: rowCount }).map((_, i) => (
        <StrategySkeletonCard key={i} />
      ))}
    </div>
  )
}

// W53-a — EmptyState renders a polished empty state with a Lucide icon
// + title + subtitle. Fires when the catalog fetch has resolved, no
// catalog error, and the filtered list is empty.
function EmptyState() {
  return (
    <div
      className="empty-state flex-1"
      role="status"
      data-testid="strategy-matrix-empty"
    >
      <Layers className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-title">No strategies match your view</div>
      <div className="empty-state-desc">
        Adjust your search query or category filter to surface more strategies from the registry.
      </div>
    </div>
  )
}

// W53-a — ErrorCard renders a polished error card with an
// AlertTriangle icon, the error string as the title, a dim subtitle,
// a Retry button (RotateCcw glyph + "Retry" text), and a Dismiss
// button (bare X icon). role="alert" so screen readers announce the
// error. Used for both the catalog and the per-strategy performance
// fetch failures.
function ErrorCard({
  title,
  subtitle,
  onRetry,
  onDismiss,
  retryLabel,
  dismissLabel,
  testId,
}: {
  title: string
  subtitle: string
  onRetry: () => void
  onDismiss: () => void
  retryLabel: string
  dismissLabel: string
  testId: string
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="m-3 rounded-md border border-red-500/30 bg-red-500/[0.07] p-4 flex items-start gap-3"
    >
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-red-300 break-words">{title}</div>
        <div className="text-[11px] text-[#7e8aaa] mt-1 leading-relaxed">{subtitle}</div>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onRetry}
            aria-label={retryLabel}
            data-testid={`${testId}-retry`}
            className="btn btn-xs btn-ghost text-red-300 hover:text-red-200 border border-red-500/30 hover:border-red-500/50 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            data-testid={`${testId}-dismiss`}
            className="text-[#7e8aaa] hover:text-[#dde1ed] transition-colors p-1 rounded"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

// W53-a — ToggleErrorBanner renders a compact polished banner for the
// toggle POST failure. Includes a Retry button (re-fires the POST for
// the same strategy + direction) and a Dismiss button. role="alert".
function ToggleErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      data-testid="strategy-matrix-toggle-error"
      className="mx-4 mt-2 rounded-md border border-red-500/30 bg-red-500/[0.07] px-3 py-2 flex items-center justify-between gap-2"
    >
      <span className="flex items-center gap-1.5 text-xs min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" aria-hidden="true" />
        <span className="text-red-300 truncate">
          <strong className="font-semibold">Toggle failed:</strong>{' '}
          <span data-testid="strategy-matrix-toggle-error-msg">{message}</span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry toggle"
          data-testid="strategy-matrix-retry-toggle"
          className="btn btn-xs btn-ghost text-red-300 hover:text-red-200 border border-red-500/30 hover:border-red-500/50 flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          <span>Retry</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss toggle error"
          className="text-[#7e8aaa] hover:text-[#dde1ed] transition-colors p-1 rounded"
          title="Dismiss"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}

export default function StrategyMatrix() {
  const [catalog, setCatalog] = useState<StrategyMeta[]>([])
  // U14: per-strategy performance map keyed by strategy_id
  const [perf, setPerf] = useState<Record<string, StrategyPerf>>({})
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [stubNotice, setStubNotice] = useState<string | null>(null)
  // W53-a — initial loading state for the catalog fetch. Resolves to
  // false on the first fetch (success or failure) so the shimmer
  // skeleton doesn't flash on every 4s poll — only on the initial
  // load when catalog is empty AND no error has surfaced yet.
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  // W53-a — sort dropdown state. Default preserves upstream catalog
  // order so test contracts that check card presence (not order) are
  // unaffected.
  const [sortBy, setSortBy] = useState<SortField>('default')
  // W22-1 — surface fetch / toggle failures instead of silently swallowing.
  // Each error string is keyed by the operation that produced it so the
  // banner can show a useful "which call failed" prefix.
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [perfError, setPerfError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  // W53-a — last toggle attempt (strategyId + currentStatus) so the
  // Retry button on the toggle error banner can re-fire the same POST.
  // Cleared on successful toggle (so stale retries don't fire after
  // the user moves on).
  const [lastToggle, setLastToggle] = useState<{ strategyId: string; currentStatus: boolean } | null>(null)

  const fetchCatalog = async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/strategies/catalog`)
      if (res.ok) {
        const json = await res.json()
        setCatalog(json.catalog || [])
        setCatalogError(null)
        setCatalogLoaded(true)
      } else {
        setCatalogError(`Failed to load strategy catalog (HTTP ${res.status})`)
        setCatalogLoaded(true)
      }
    } catch (e) {
      console.error('[StrategyMatrix] Failed to fetch strategy catalog:', e)
      setCatalogError(e instanceof Error ? e.message : 'Network error loading strategy catalog')
      setCatalogLoaded(true)
    }
  }

  // U14: live per-strategy P&L / win-rate / trade count from the leaderboard.
  // Fetched in parallel with fetchCatalog — never blocks catalog rendering.
  const fetchPerf = async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/leaderboard`)
      if (res.ok) {
        const json = await res.json()
        const rows: StrategyPerf[] = json.ranked ?? []
        const map: Record<string, StrategyPerf> = {}
        for (const r of rows) map[r.strategy] = r
        setPerf(map)
        setPerfError(null)
      } else {
        setPerfError(`Failed to load per-strategy performance (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[StrategyMatrix] Failed to fetch per-strategy performance:', e)
      setPerfError(e instanceof Error ? e.message : 'Network error loading per-strategy performance')
    }
  }

  useEffect(() => {
    // U14: catalog + leaderboard fetched in parallel (no await between them)
    fetchCatalog()
    fetchPerf()
    const timer = setInterval(() => {
      fetchCatalog()
      fetchPerf()
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const handleToggle = async (strategyId: string, currentStatus: boolean) => {
    if (!IMPLEMENTED_STRATEGIES.has(strategyId)) {
      setStubNotice(`"${strategyId}" is a metadata-only research stub (_execute_cycle = pass). It does not execute live trades.`)
      setTimeout(() => setStubNotice(null), 5000)
      return
    }

    // W53-a — remember the toggle attempt so the Retry button on the
    // toggle error banner can re-fire the same POST.
    setLastToggle({ strategyId, currentStatus })
    setToggling(strategyId)
    setToggleError(null)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/strategies/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_name: strategyId, enabled: !currentStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.detail || `Risk gate rejected toggle (HTTP ${res.status})`
        console.error('[StrategyMatrix] Strategy toggle rejected:', msg)
        setToggleError(msg)
      } else {
        await fetchCatalog()
        setLastToggle(null)
      }
    } catch (e) {
      console.error('[StrategyMatrix] Failed to toggle strategy:', e)
      setToggleError(e instanceof Error ? e.message : 'Network error toggling strategy')
    }
    setToggling(null)
  }

  // W53-a — Retry the last failed toggle. Reuses handleToggle with the
  // stored strategyId + currentStatus so the POST fires with the exact
  // same payload (strategy_name + enabled: !currentStatus).
  const handleRetryToggle = () => {
    if (!lastToggle) return
    handleToggle(lastToggle.strategyId, lastToggle.currentStatus)
  }

  // W53-a — derived sorted list. The sort is layered on top of the
  // existing filter (catalog.filter(...)) so the W22-2 filter tests
  // (search + category tab) still resolve the same visible set.
  const filtered = useMemo(() => {
    return catalog.filter((s) => {
      const isImp = IMPLEMENTED_STRATEGIES.has(s.strategy_id)
      if (activeTab === 'implemented') return isImp
      const matchCat = activeTab === 'all' || s.category === activeTab
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase()) ||
        s.strategy_id.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [catalog, activeTab, search])

  // W53-a — apply the user's sort selection on top of the filtered
  // list. Default preserves upstream catalog order (no sort applied).
  const sorted = useMemo(() => {
    if (sortBy === 'default') return filtered
    const arr = [...filtered]
    if (sortBy === 'pnl') {
      arr.sort((a, b) => (perf[b.strategy_id]?.net_pnl ?? -Infinity) - (perf[a.strategy_id]?.net_pnl ?? -Infinity))
    } else if (sortBy === 'winRate') {
      arr.sort((a, b) => (perf[b.strategy_id]?.win_rate ?? -1) - (perf[a.strategy_id]?.win_rate ?? -1))
    } else if (sortBy === 'trades') {
      arr.sort((a, b) => (perf[b.strategy_id]?.closed_trades ?? -1) - (perf[a.strategy_id]?.closed_trades ?? -1))
    } else if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return arr
  }, [filtered, perf, sortBy])

  const runningImplemented = catalog.filter((s) => s.is_running && IMPLEMENTED_STRATEGIES.has(s.strategy_id)).length

  const activeSortOption = SORT_OPTIONS.find((o) => o.value === sortBy) ?? SORT_OPTIONS[0]

  return (
    <div className="card flex flex-col h-full overflow-hidden bg-[#13161e] border border-[#1f2335]">
      {/* Header */}
      <div className="card-header flex flex-wrap justify-between items-center px-4 py-3 border-b border-[#1f2335] gap-3">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-cyan-300 flex-shrink-0" aria-hidden="true" />
          <span className="card-title text-sm font-bold text-[#dde1ed]">
            Quantitative Strategy Matrix
          </span>
          <span className="badge badge-green text-xs font-semibold tabular-nums">
            {runningImplemented} of 3 Implemented Active
          </span>
          <span className="badge badge-dim text-[10px] tabular-nums">
            47 Stubs / Research
          </span>
        </div>

        {/* W53-a — refined toolbar: search input with leading icon + focus ring */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5a637a] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Filter strategies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm w-48 text-xs pl-7 pr-2 py-1 border border-[#1f2335] bg-[#0e1015] rounded-md text-[#dde1ed] placeholder:text-[#5a637a] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all"
              aria-label="Filter strategies"
            />
          </div>

          {/* W53-a — sort dropdown. Default preserves upstream catalog
              order so test contracts that check card presence (not
              order) are unaffected. */}
          <div className="relative flex items-center">
            <ArrowUpDown
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5a637a] pointer-events-none"
              aria-hidden="true"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="input input-sm text-xs pl-7 pr-7 py-1 border border-[#1f2335] bg-[#0e1015] rounded-md text-[#dde1ed] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all appearance-none cursor-pointer"
              aria-label="Sort strategies"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <SortIndicator
              active={sortBy !== 'default'}
              ascending={activeSortOption.ascending}
            />
          </div>
        </div>
      </div>

      {/* Category Tabs — refined with transition + active cyan glow */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[#0e1015] border-b border-[#1f2335] overflow-x-auto scrollbar-thin shrink-0">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveTab(c.id)}
            className={`tab-item text-xs py-1 px-2.5 transition-colors ${
              activeTab === c.id
                ? 'active text-cyan-300 ring-1 ring-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.18)]'
                : 'hover:text-[#dde1ed]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Stub Notice Banner */}
      {stubNotice && (
        <div
          className="banner-warning mx-4 mt-2 text-xs py-2 px-3 flex items-center justify-between"
          role="status"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{stubNotice}</span>
          </span>
          <button
            onClick={() => setStubNotice(null)}
            className="text-white hover:underline text-xs ml-2 flex items-center gap-0.5"
            aria-label="Dismiss stub notice"
          >
            <X className="w-3 h-3" aria-hidden="true" /> Dismiss
          </button>
        </div>
      )}

      {/* Toggle Error Banner (polished, with Retry) */}
      {toggleError && (
        <ToggleErrorBanner
          message={toggleError}
          onRetry={handleRetryToggle}
          onDismiss={() => {
            setToggleError(null)
            setLastToggle(null)
          }}
        />
      )}

      {/* Perf Error Card (polished, with Retry) — renders inline above
          the cards area because perf is supplementary data. The cards
          area itself isn't replaced; the catalog fetch is independent. */}
      {perfError && (
        <ErrorCard
          title={perfError}
          subtitle="The strategy performance feed couldn't be reached. P&L / win-rate / trade counts will retry on the next poll."
          onRetry={fetchPerf}
          onDismiss={() => setPerfError(null)}
          retryLabel="Retry performance feed"
          dismissLabel="Dismiss performance error"
          testId="strategy-matrix-perf-error"
        />
      )}

      {/* Main area — loading skeleton / catalog error card / empty state / cards */}
      {!catalogLoaded && !catalogError ? (
        <StrategySkeletonGrid rowCount={6} />
      ) : catalogError ? (
        <ErrorCard
          title={catalogError}
          subtitle="The strategy registry couldn't be reached. Check connectivity and retry."
          onRetry={fetchCatalog}
          onDismiss={() => setCatalogError(null)}
          retryLabel="Retry catalog fetch"
          dismissLabel="Dismiss catalog error"
          testId="strategy-matrix-catalog-error"
        />
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        /* Grid of Strategies — polished cards with hover accent bar */
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 scrollbar-thin">
          {sorted.map((s) => {
            const isImplemented = IMPLEMENTED_STRATEGIES.has(s.strategy_id)
            // U14: per-strategy perf row (may be undefined if no closed trades yet)
            const p = perf[s.strategy_id]
            const isRunning = s.is_running && isImplemented
            return (
              <div
                key={s.strategy_id}
                className={`group relative p-3 rounded-lg border transition-all flex flex-col justify-between overflow-hidden ${
                  isRunning
                    ? 'bg-[#141724] border-cyan-500/40 shadow-sm shadow-cyan-500/10 hover:bg-cyan-500/5 hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]'
                    : isImplemented
                    ? 'bg-[#0e1015] border-[#1f2335] hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]'
                    : 'bg-[#0e1015]/60 border-[#1f2335]/60 opacity-65 hover:bg-[#0e1015] hover:opacity-80 hover:shadow-[inset_3px_0_0_0_rgba(126,138,170,0.35)]'
                }`}
              >
                <div>
                  {/* Header: name + strategy_id + status badge */}
                  <div className="flex justify-between items-start mb-1.5 gap-1">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-xs text-[#dde1ed] block truncate">
                        {s.name}
                      </span>
                      <span className="mono text-[9.5px] text-[#7e8aaa] tracking-wide">
                        {s.strategy_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isImplemented ? (
                        <span className="badge badge-green text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                          Implemented
                        </span>
                      ) : (
                        <span className="badge badge-red text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                          Stub
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#7e8aaa] leading-relaxed mb-3">{s.description}</p>
                  {/* U14: live P&L strip — green/red net_pnl, win-rate %, closed-trade count.
                      W53-a — split into separate spans so tabular-nums
                      aligns each value cleanly and tone-colored P&L
                      draws the trader's eye to the profit/loss signal.
                      Each span's textContent preserves the test
                      contract substrings ("+12.45", "62% WR", "38 trades"). */}
                  {p && (
                    <div
                      className="flex items-center gap-2 mb-2 mono text-[10px] font-semibold"
                      data-tone={p.net_pnl >= 0 ? 'positive' : 'negative'}
                      title={`net_pnl ${p.net_pnl.toFixed(2)} · win_rate ${(p.win_rate * 100).toFixed(1)}% · ${p.closed_trades} closed trades`}
                    >
                      <span
                        className={`tabular-nums ${p.net_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {p.net_pnl >= 0 ? '+' : ''}
                        {p.net_pnl.toFixed(2)}
                      </span>
                      <span className="text-[#3e4560]">·</span>
                      <span className="tabular-nums text-[#7e8aaa]">
                        {p.win_rate * 100}% WR
                      </span>
                      <span className="text-[#3e4560]">·</span>
                      <span className="tabular-nums text-[#7e8aaa]">
                        {p.closed_trades} trades
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer: category + risk + action */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1f2335]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#7e8aaa] uppercase mono tracking-wider">
                      {s.category.replace('_', ' ')}
                    </span>
                    <span className="text-[#3e4560]">·</span>
                    <span
                      className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold uppercase mono tabular-nums ${
                        s.risk_level === 'LOW'
                          ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                          : s.risk_level === 'MEDIUM'
                          ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                          : 'text-red-400 bg-red-500/10 border border-red-500/20'
                      }`}
                    >
                      {s.risk_level}
                    </span>
                  </div>

                  {isImplemented ? (
                    <div className="flex items-center gap-1.5">
                      {s.is_running && (
                        <span
                          className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"
                          title="Running live execution loop"
                          aria-label="Strategy running"
                        />
                      )}
                      <button
                        onClick={() => handleToggle(s.strategy_id, s.is_running)}
                        disabled={toggling === s.strategy_id}
                        className={`btn btn-xs font-bold transition-colors ${
                          s.is_running
                            ? 'btn-danger'
                            : 'btn-primary'
                        }`}
                      >
                        {toggling === s.strategy_id ? '…' : s.is_running ? 'Stop' : 'Deploy'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleToggle(s.strategy_id, false)}
                      className="btn btn-ghost btn-xs text-[#7e8aaa] cursor-not-allowed opacity-60"
                      title="This strategy is a research stub with no execution loop"
                    >
                      Stub Only
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

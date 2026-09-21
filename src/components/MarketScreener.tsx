// components/MarketScreener.tsx — Multi-factor Prediction Market Screener
//
// W52-a — premium visual polish pass (consistent with the W51-2
// MarketsPanel / PositionsPanel redesign):
//   • Loading state replaced with a shimmer skeleton that mirrors the
//     live table's 9-column structure (Market Event · Category ·
//     24h Volume · Liquidity · AI Conf · Score · Edge · Resolution ·
//     Action). The "Scanning Polymarket prediction markets…" caption
//     is preserved as a dim status banner above the skeleton rows so
//     the W22-2 test `getByText(/Scanning Polymarket prediction markets/i)`
//     still resolves. The skeleton wrapper carries `role="status"` +
//     `aria-live="polite"` so screen readers announce the loading
//     state. The skeleton rows themselves are aria-hidden (caption +
//     role cover the announcement).
//   • Empty state upgraded with a Lucide `SearchX` icon (replaces the
//     emoji 🔍) + title + subtitle + the existing active-filter
//     context. "No markets found" copy preserved verbatim so the
//     W22-2 test `getByText(/No markets found/i)` still resolves.
//   • Active filter chips now carry a subtle cyan accent border glow
//     (`shadow-[0_0_8px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/30`)
//     layered on top of the existing `.filter-chip.active` solid
//     accent fill. Consistent with the MarketsPanel W51-2a active
//     chip pattern. Inactive chips unchanged.
//   • Table headers polished: the `<tr>` gets `uppercase text-[11px]
//     tracking-wider font-medium text-[#7e8aaa]` so column labels
//     read as a unified dim caption strip. Sort indicators (Lucide
//     ArrowUp / ArrowDown at 10px) preserved on sortable columns
//     (Market Event, 24h Volume, Liquidity, AI Conf, Score, Edge,
//     Resolution). Empty 10px slot on non-active sortable headers
//     keeps layout stable on sort toggle.
//   • Table row hover refined: replaced the bare
//     `hover:bg-blue-500/10` with `hover:bg-cyan-500/5` (subtle
//     background lift) layered with
//     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.65)]` (left-edge
//     accent bar via inset shadow — no layout shift). Consistent with
//     the MarketsPanel W51-2a row-hover pattern.
//   • `tabular-nums` added to the Opportunity Score badge so it
//     aligns cleanly under the Score header. All other numeric cells
//     (Volume, Liquidity, AI Conf, Edge, Resolution) already carry
//     `tabular-nums`.
//   • Toolbar grouping refined: each filter group (AI Conf · Edge ·
//     Resolution) gets a leading uppercase label + subtle 1px vertical
//     dividers between groups (`w-px h-4 bg-[#1f2335] mx-1`) so the
//     three groups read as a single cohesive strip. The category
//     chip row keeps its own dedicated toolbar for at-a-glance scan.
//   • Error state polished: bare `<div class="banner-danger">`
//     replaced with a polished error card (`AlertTriangle` Lucide
//     icon + dim subtitle + Retry button with `RotateCcw` glyph +
//     Dismiss `X`). The full error string (e.g. "Failed to load
//     markets (HTTP 500)") is still rendered as the card's title so
//     the W22-2 test `getByText(/Failed to load markets \(HTTP 500\)/i)`
//     still resolves. Retry button still `getByRole('button',
//     { name: /retry/i })`; Dismiss button still `getByRole('button',
//     { name: /dismiss error/i })`.
//   • Two new inline sub-components extracted for readability
//     (`SortIndicator` + `ScreenerSkeletonRows`) — single-purpose,
//     aria-hidden where decorative. No API change. No test contract
//     change.
//
// W49-4 — pro-trading redesign (preserved):
//   • Filter chips switched to the design-system `.filter-chip` class
//     (with `.active` state) for category + AI confidence + edge +
//     resolution. Visually consistent with the MarketsPanel.
//   • Search input gets a leading Lucide `Search` icon. Placeholder
//     kept as "Search Polymarket events…" so the W22-2 test
//     `getByLabelText(/Search prediction market events/i)` still
//     resolves (aria-label preserved).
//   • Sortable columns + Lucide `ArrowUp` / `ArrowDown` sort
//     indicators on Volume, Liquidity, AI Conf, Score, Edge, and
//     Resolution headers. Click toggles asc/desc. The default sort
//     is by Score (descending) so the highest-opportunity markets
//     surface to the top on first render.
//   • NEW "AI Conf" column (per-row percentage) — surfaces the
//     W38-4-derived AI confidence so a trader can scan conviction
//     across the visible result set without hovering each row.
//   • Volume + Liquidity formatting switched from `fmtUsd` (which
//     always renders full digits like "$1,234") to `fmtCompact`
//     ("1.2K" / "3.4M") per the W49-4 "Human-readable (1.2K, 3.4M)"
//     spec. Tooltip preserves the full-precision value.
//   • Opportunity score tooltip still shows the transparent formula
//     breakdown (per-factor weighted points) on hover — W38-4 kept
//     intact.
//   • "Reset all" button kept (named "Reset all" not "Clear all" so
//     the W22-2 `getByRole('button', { name: /clear/i })` assertion
//     returns exactly one element after typing a search — the
//     Clear button next to the search input remains the only match).
//   • Result-count summary "Showing X of Y markets" badge kept
//     (wording tightened to "Showing X of Y Markets" so the existing
//     W22-2 test regex `/N of M Markets/i` still resolves).
//
// W39-4 — markets/screener readability + filter UX pass (preserved):
//   • Active-filter summary bar between the chip rows and the table.
//     Lists each active filter as a removable chip (click to clear that
//     single filter) plus a trailing `Reset all` button that clears
//     every filter in one click.
//   • Named "Reset all" (not "Clear all") so the existing W22-2 test
//     `getByRole('button', { name: /clear/i })` — which expects exactly
//     one matching button after typing a search — doesn't pick up this
//     reset button as a second match. The MarketsPanel uses the same
//     label so the two panels share visual language.
//   • Loading-during-filter indicator: when `loading` is true AND we
//     already have prior rows on screen, a small inline spinner renders
//     at the right edge of the filter chip row so a trader sees the
//     refetch is in flight without losing the visible rows. (The
//     full-panel shimmer skeleton only fires on the initial load when
//     `markets.length === 0`.)
//
// W38-4 — prior market discovery improvements (preserved):
//   • Opportunity score (0–100) computed via a transparent weighted
//     formula that combines liquidity, 24h volume, spread tightness,
//     AI confidence, and time-to-resolution. Each factor is normalized
//     0..1 against the current page of results so the relative ranking
//     stays meaningful even when the absolute numbers are tiny.
//   • Score badge tooltip shows the full breakdown (per-factor points +
//     weights) so a trader can see exactly WHY a market ranks where it
//     does — no opaque "AI score" black box.
//   • New filter chips: AI confidence (≥50% / ≥70%), edge (≥2¢ / ≥5¢),
//     time-to-resolution (Any / <1d / <7d / <30d). The chips compose
//     with the existing category + search filters.
//   • "Export CSV" button in the header — downloads the currently
//     filtered result set as a CSV file.
//   • Improved empty/no-results states — empty-result rows now show
//     the active filter context + a reset button so the trader can
//     tell whether they over-constrained the view (vs. the upstream
//     actually being empty).

'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Search as SearchIcon,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  SearchX,
  RotateCcw,
  X,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { fmtUsd, fmtAge, fmtCompact } from '@/lib/design-tokens'

interface MarketItem {
  id?: string
  conditionId?: string
  slug: string
  groupItemTitle?: string
  category?: string
  volume24hr?: number
  liquidity?: number
  outcomePrices?: string
  // W38-4 — optional ISO date the market resolves. Used to compute
  // "time to resolution" (days remaining). May be absent on legacy
  // payloads; we fall back to a null bucket.
  endDate?: string
  // W38-4 — optional upstream-provided AI confidence 0..1. When absent,
  // the screener synthesizes a confidence from volume + liquidity
  // (high volume + liquidity → high confidence in price discovery).
  aiConfidence?: number
  tokens?: Array<{ token_id: string; outcome: string }>
}

interface Props {
  onSelectMarket?: (tokenId: string, slug: string) => void
  onQuickTrade?: (tokenId: string, slug: string) => void
}

// W38-4 — opportunity score weights (documented + shown in UI tooltip).
//   • Liquidity  35% — deeper books → tighter spreads → safer to size
//   • Volume     30% — confirms genuine trader interest (vs. dead book)
//   • Spread     15% — tighter spread = lower cost to enter/exit
//   • AI conf    10% — model's directional conviction (when available)
//   • Resolution 10% — closer resolution = less time-value decay risk
//
// Weights sum to 1.0. Each factor is min-max normalized against the
// current page of results so the relative ranking stays meaningful.
const SCORE_WEIGHTS = {
  liquidity: 0.35,
  volume: 0.30,
  spread: 0.15,
  aiConfidence: 0.10,
  resolution: 0.10,
} as const

// W38-4 — derived row computed from the raw MarketItem + the page's
// normalization stats. The score is rounded to an integer 0..100 so
// the badge + CSV stay readable.
interface ScoredMarket {
  market: MarketItem
  tokenId: string
  title: string
  category: string
  volume: number
  liquidity: number
  spreadCents: number | null
  aiConfidence: number
  edgeCents: number
  daysToResolution: number | null
  // Per-factor contribution to the final score (0..100, after weighting).
  // Surfaced in the badge tooltip so a trader can see WHY a market ranks
  // where it does.
  scoreBreakdown: {
    liquidity: number
    volume: number
    spread: number
    aiConfidence: number
    resolution: number
  }
  score: number
}

// W38-4 — derive the per-market edge (in cents) from liquidity + volume.
//
// "Edge" here is a heuristic proxy for the theoretical edge a market
// maker can capture on this market: deeper liquidity relative to 24h
// volume means the book is over-capitalized (small edge per trade), while
// thin liquidity on a high-volume market means each trade moves price
// (large potential edge but high risk). We model it as:
//
//    edge_cents = clamp(5 * (volume / max(liquidity, 1)), 0, 10)
//
// So when liquidity == volume, edge = 5¢; high-volume + low-liquidity
// pushes toward 10¢; low-volume + high-liquidity pushes toward 0¢.
function deriveEdgeCents(volume: number, liquidity: number): number {
  if (!Number.isFinite(volume) || !Number.isFinite(liquidity) || liquidity <= 0) {
    return 0
  }
  const raw = 5 * (volume / liquidity)
  return Math.max(0, Math.min(10, raw))
}

// W38-4 — derive a synthetic AI confidence (0..1) when the upstream
// payload doesn't include one. Combines volume + liquidity into a
// [0, 1] signal: higher volume and deeper liquidity → higher
// confidence in the current price discovery.
function deriveAiConfidence(m: MarketItem, volume: number, liquidity: number): number {
  if (typeof m.aiConfidence === 'number' && Number.isFinite(m.aiConfidence)) {
    return Math.max(0, Math.min(1, m.aiConfidence))
  }
  // Synthetic: cap each input at a meaningful ceiling so a single
  // mega-market doesn't saturate the score.
  const volSignal = Math.min(1, Math.log10(Math.max(1, volume)) / 6) // 1M → 1.0
  const liqSignal = Math.min(1, Math.log10(Math.max(1, liquidity)) / 5) // 100k → 1.0
  return Math.max(0, Math.min(1, 0.5 * volSignal + 0.5 * liqSignal))
}

// W38-4 — parse the market's endDate into "days to resolution" from now.
// Returns null when the date is missing, malformed, or in the past.
function deriveDaysToResolution(m: MarketItem): number | null {
  if (!m.endDate || typeof m.endDate !== 'string') return null
  const t = Date.parse(m.endDate)
  if (!Number.isFinite(t)) return null
  const days = (t - Date.now()) / 86_400_000
  return days > 0 ? Math.round(days) : null
}

// W38-4 — derive the synthetic bid-ask spread (in cents) from
// liquidity + volume. Polymarket's Gamma API doesn't always include
// a real spread for inactive books; we synthesize one so the
// opportunity score has something to chew on:
//
//    spread_cents ≈ clamp(20 / sqrt(liquidity), 0.5, 20)
//
// Deep liquidity → tight spread; thin liquidity → wide spread.
function deriveSpreadCents(liquidity: number, volume: number): number | null {
  if (!Number.isFinite(liquidity) || liquidity <= 0) return null
  const liqComponent = 20 / Math.sqrt(liquidity)
  // Volume dampens spread slightly (active markets tighten).
  const volComponent = Number.isFinite(volume) && volume > 0
    ? Math.min(2, Math.log10(volume) / 3)
    : 0
  return Math.max(0.5, Math.min(20, liqComponent - volComponent))
}

// W38-4 — min-max normalize a numeric value against the page's
// [min, max] range. Returns 0..1 (0 when min == max). Negative
// inputs clamp to 0.
function minMax(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0
  if (max <= min) return 0
  const n = (v - min) / (max - min)
  return Math.max(0, Math.min(1, n))
}

// W38-4 — compute the scored-market rows from the raw markets list.
//
// The function runs three passes:
//   1. Per-row derived metrics (edge, AI confidence, spread, days-to-
//      resolution) — these don't depend on the rest of the page.
//   2. Page-wide min/max for each numeric factor so we can normalize.
//   3. Final weighted score + per-factor breakdown (post-weight, in
//      points out of 100) for each row.
//
// Returns the scored rows (NOT sorted — sorting happens in a
// separate memo so the user's column sort takes precedence).
function computeScoredMarkets(markets: MarketItem[]): ScoredMarket[] {
  if (!markets.length) return []

  // Pass 1: derive per-row metrics.
  const rows = markets.map((m) => {
    const title = m.groupItemTitle || m.slug
    const volume = parseFloat(String(m.volume24hr || 0)) || 0
    const liquidity = parseFloat(String(m.liquidity || 0)) || 0
    const tokenId = m.tokens?.[0]?.token_id || m.conditionId || m.slug
    const category = (m.category || 'general').toUpperCase()
    const spreadCents = deriveSpreadCents(liquidity, volume)
    const aiConfidence = deriveAiConfidence(m, volume, liquidity)
    const edgeCents = deriveEdgeCents(volume, liquidity)
    const daysToResolution = deriveDaysToResolution(m)
    return {
      market: m,
      tokenId,
      title,
      category,
      volume,
      liquidity,
      spreadCents,
      aiConfidence,
      edgeCents,
      daysToResolution,
    }
  })

  // Pass 2: compute page-wide min/max for each numeric factor.
  const volMax = Math.max(1, ...rows.map((r) => r.volume))
  const liqMax = Math.max(1, ...rows.map((r) => r.liquidity))
  const spreadMin = rows.reduce(
    (acc, r) => (r.spreadCents != null ? Math.min(acc, r.spreadCents) : acc),
    Infinity,
  )
  const spreadMax = rows.reduce(
    (acc, r) => (r.spreadCents != null ? Math.max(acc, r.spreadCents) : acc),
    -Infinity,
  )
  // For resolution: closer = better, but a missing date shouldn't
  // dominate. Treat null as "neutral" (0.5) so it neither helps nor
  // hurts the score.
  const daysMax = Math.max(1, ...rows.map((r) => r.daysToResolution ?? 1))

  // Pass 3: weighted score + breakdown (each factor contributes
  // weight * normalized * 100 points).
  return rows.map((r) => {
    const volScore = minMax(r.volume, 0, volMax)
    const liqScore = minMax(r.liquidity, 0, liqMax)
    // Spread is inverted: tighter (lower) = higher score.
    const spreadScore =
      r.spreadCents == null || !Number.isFinite(spreadMin) || !Number.isFinite(spreadMax) || spreadMax <= spreadMin
        ? 0.5
        : 1 - minMax(r.spreadCents, spreadMin, spreadMax)
    const confScore = r.aiConfidence // already 0..1
    const resScore = r.daysToResolution == null ? 0.5 : 1 - minMax(r.daysToResolution, 0, daysMax)

    const breakdown = {
      liquidity: SCORE_WEIGHTS.liquidity * liqScore * 100,
      volume: SCORE_WEIGHTS.volume * volScore * 100,
      spread: SCORE_WEIGHTS.spread * spreadScore * 100,
      aiConfidence: SCORE_WEIGHTS.aiConfidence * confScore * 100,
      resolution: SCORE_WEIGHTS.resolution * resScore * 100,
    }
    const score = Math.round(
      breakdown.liquidity +
        breakdown.volume +
        breakdown.spread +
        breakdown.aiConfidence +
        breakdown.resolution,
    )
    return { ...r, scoreBreakdown: breakdown, score }
  })
}

// W38-4 — CSV export of the currently filtered (post-filter) rows.
// Triggers a client-side download via a Blob URL; no API round-trip.
function exportRowsToCSV(rows: ScoredMarket[]): void {
  if (!rows.length) return
  const header = [
    'slug',
    'title',
    'category',
    'volume_24h_usd',
    'liquidity_usd',
    'spread_cents',
    'ai_confidence_pct',
    'edge_cents',
    'days_to_resolution',
    'opportunity_score',
  ]
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return ''
    const s = String(v)
    // Quote any field that contains commas, quotes, or newlines.
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const body = rows.map((r) =>
    [
      r.market.slug,
      r.title,
      r.category,
      r.volume.toFixed(2),
      r.liquidity.toFixed(2),
      r.spreadCents != null ? r.spreadCents.toFixed(2) : '',
      (r.aiConfidence * 100).toFixed(1),
      r.edgeCents.toFixed(2),
      r.daysToResolution != null ? String(r.daysToResolution) : '',
      String(r.score),
    ]
      .map(escape)
      .join(','),
  )
  const csv = [header.join(','), ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `polymarket-screener-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// W38-4 — AI confidence filter chips.
type AiConfidenceFilter = 'ALL' | 'GTE50' | 'GTE70'
const AI_CONFIDENCE_FILTERS: { key: AiConfidenceFilter; label: string; min: number; title: string }[] = [
  { key: 'ALL', label: 'All', min: 0, title: 'Show all confidence levels' },
  { key: 'GTE50', label: '≥50%', min: 0.5, title: 'AI confidence ≥ 50%' },
  { key: 'GTE70', label: '≥70%', min: 0.7, title: 'AI confidence ≥ 70% (high conviction)' },
]

// W38-4 — Edge filter chips (in cents).
type EdgeFilter = 'ALL' | 'GTE2' | 'GTE5'
const EDGE_FILTERS: { key: EdgeFilter; label: string; minCents: number; title: string }[] = [
  { key: 'ALL', label: 'All', minCents: 0, title: 'Show all edge levels' },
  { key: 'GTE2', label: '≥2¢', minCents: 2, title: 'Edge ≥ 2¢ (minimum tradable)' },
  { key: 'GTE5', label: '≥5¢', minCents: 5, title: 'Edge ≥ 5¢ (high-edge)' },
]

// W38-4 — Time-to-resolution filter chips (in days).
type ResolutionFilter = 'ALL' | 'LT1D' | 'LT7D' | 'LT30D'
const RESOLUTION_FILTERS: { key: ResolutionFilter; label: string; maxDays: number | null; title: string }[] = [
  { key: 'ALL', label: 'Any', maxDays: null, title: 'Show all resolution windows' },
  { key: 'LT1D', label: '<1d', maxDays: 1, title: 'Resolves within 1 day' },
  { key: 'LT7D', label: '<7d', maxDays: 7, title: 'Resolves within 7 days' },
  { key: 'LT30D', label: '<30d', maxDays: 30, title: 'Resolves within 30 days' },
]

// W38-4 — score badge colour buckets. Score 0..100 maps to:
//   ≥75 → emerald (top opportunities)
//   50–74 → cyan (solid)
//   25–49 → amber (marginal)
//   <25 → slate (skip)
function scoreBadgeClass(score: number): string {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
  if (score >= 50) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
  if (score >= 25) return 'bg-amber-500/15 text-amber-300 border-amber-500/40'
  return 'bg-slate-500/15 text-slate-300 border-slate-500/40'
}

// W52-a — SortIndicator extracted for readability. Renders a Lucide
// ArrowUp / ArrowDown glyph on the active sort column, or an empty
// 10px slot on inactive columns so the layout doesn't shift on sort
// toggle. aria-hidden because the `aria-sort` attribute on the
// parent <th> already exposes the sort state to assistive tech.
function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (active) {
    return ascending
      ? <ArrowUp className="w-2.5 h-2.5" aria-hidden="true" />
      : <ArrowDown className="w-2.5 h-2.5" aria-hidden="true" />
  }
  return <span className="w-2.5 h-2.5 inline-block" aria-hidden="true" />
}

// W52-a — Shimmer skeleton loader for the initial-load state
// (loading && markets.length === 0). Renders N shimmer rows that
// mirror the live table's 9-column structure so the panel doesn't
// visually jump when the first fetch resolves. Uses the design-system
// `.skeleton-table` / `.skeleton-row` / `.skeleton-cell` classes from
// globals.css (which carry the `skeleton-shimmer` keyframe) augmented
// with `.animate-pulse` for an additional left-to-right shine sweep.
// aria-hidden because the "Scanning Polymarket prediction markets…"
// caption + `role="status"` + `aria-live="polite"` on the parent
// wrapper already announce the loading state to screen readers.
//
// Column flex weights approximate the live column widths:
//   • Market Event  — 3x (matches min-w-[260px])
//   • Category      — 90px fixed
//   • 24h Volume    — 80px fixed
//   • Liquidity     — 80px fixed
//   • AI Conf       — 70px fixed
//   • Score         — 60px fixed
//   • Edge          — 60px fixed
//   • Resolution    — 80px fixed
//   • Action        — 100px fixed
function ScreenerSkeletonRows({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div
      className="skeleton-table mx-3 mb-3 rounded-md border border-[#1f2335]"
      aria-hidden="true"
    >
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: '42px' }}>
          <div className="skeleton-cell animate-pulse" style={{ flex: '3 1 0' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 90px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 80px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 80px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 70px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 60px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 60px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 80px' }} />
          <div className="skeleton-cell animate-pulse" style={{ flex: '0 0 100px' }} />
        </div>
      ))}
    </div>
  )
}

export default function MarketScreener({ onSelectMarket, onQuickTrade }: Props) {
  const [markets, setMarkets] = useState<MarketItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null)

  // W38-4 — additional filter state for AI confidence, edge, and
  // time-to-resolution chips. These compose with the existing category
  // + search filters.
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [aiConfidenceFilter, setAiConfidenceFilter] = useState<AiConfidenceFilter>('ALL')
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilter>('ALL')
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>('ALL')

  // W49-4 — sort state. Default sort is by score (descending) so the
  // highest-opportunity markets surface to the top on first render.
  // The trader can click any sortable header to toggle asc/desc.
  type SortField = 'title' | 'volume' | 'liquidity' | 'aiConfidence' | 'score' | 'edge' | 'resolution'
  const [sortBy, setSortBy] = useState<SortField>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortAsc((a) => !a)
    else {
      setSortBy(field)
      setSortAsc(false)
    }
  }

  const searchRef = useRef(search)
  searchRef.current = search

  const fetchMarkets = useCallback(async (q?: string) => {
    const query = q !== undefined ? q : searchRef.current
    setLoading(true)
    setError(null)
    try {
      const apiUrl = getApiUrl()
      const url = query
        ? `${apiUrl}/api/markets?search=${encodeURIComponent(query)}&limit=50`
        : `${apiUrl}/api/markets?limit=50`
      const res = await apiFetch(url)
      if (res.ok) {
        const data = await res.json()
        setMarkets(data.markets || [])
        setLastRefreshed(Date.now() / 1000)
      } else {
        setError(`Failed to load markets (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[MarketScreener] Failed to fetch markets:', e)
      setError(e instanceof Error ? e.message : 'Network error while querying Gamma markets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMarkets('')
    const timer = setInterval(() => {
      fetchMarkets(searchRef.current)
    }, 30000)
    return () => clearInterval(timer)
  }, [fetchMarkets])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchMarkets(search)
  }

  const CATEGORY_CHIPS = ['ALL', 'CRYPTO', 'POLITICS', 'SPORTS', 'ECONOMY', 'TECH']

  // W38-4 — pre-compute scored rows once per markets list (so the
  // tooltip / CSV / filter logic all read from the same source).
  const scoredAll = useMemo(() => computeScoredMarkets(markets), [markets])

  // Apply category + AI confidence + edge + resolution filters.
  const filteredScored = useMemo(() => {
    const aiMin = AI_CONFIDENCE_FILTERS.find((f) => f.key === aiConfidenceFilter)?.min ?? 0
    const edgeMin = EDGE_FILTERS.find((f) => f.key === edgeFilter)?.minCents ?? 0
    const resMax = RESOLUTION_FILTERS.find((f) => f.key === resolutionFilter)?.maxDays ?? null
    return scoredAll.filter((s) => {
      if (selectedCategory !== 'ALL') {
        const cat = s.category
        const slug = s.market.slug.toUpperCase()
        const matchCat =
          (selectedCategory === 'CRYPTO' && (cat.includes('CRYPTO') || slug.includes('BITCOIN') || slug.includes('ETH') || slug.includes('SOL'))) ||
          (selectedCategory === 'POLITICS' && (cat.includes('POLITICS') || slug.includes('ELECTION') || slug.includes('PRESIDENT') || slug.includes('TRUMP'))) ||
          (selectedCategory === 'SPORTS' && (cat.includes('SPORTS') || slug.includes('NBA') || slug.includes('NFL') || slug.includes('SOCCER'))) ||
          (selectedCategory === 'ECONOMY' && (cat.includes('ECONOMY') || slug.includes('FED') || slug.includes('INFLATION') || slug.includes('RATE'))) ||
          (selectedCategory === 'TECH' && (cat.includes('TECH') || slug.includes('AI') || slug.includes('OPENAI') || slug.includes('GPT')))
        if (!matchCat) return false
      }
      if (s.aiConfidence < aiMin) return false
      if (s.edgeCents < edgeMin) return false
      if (resMax != null && (s.daysToResolution == null || s.daysToResolution > resMax)) return false
      return true
    })
  }, [scoredAll, selectedCategory, aiConfidenceFilter, edgeFilter, resolutionFilter])

  // Backwards-compat: filteredMarkets is the same as filteredScored but
  // exposes the raw MarketItem shape for the test "3 of 3 Markets" badge.
  // The header badge counts the post-filter set.
  const filteredMarkets = useMemo(() => filteredScored.map((s) => s.market), [filteredScored])

  // W49-4 — Apply the user's column sort to the filtered set. Default
  // sort is by score (descending) so the highest-opportunity markets
  // surface to the top on first render. Each field has a numeric
  // comparator except 'title' which is locale-aware alphabetical.
  const sortedScored = useMemo(() => {
    const dir = sortAsc ? 1 : -1 // desc by default
    const arr = [...filteredScored]
    arr.sort((a, b) => {
      let diff = 0
      switch (sortBy) {
        case 'title':
          diff = a.title.localeCompare(b.title)
          break
        case 'volume':
          diff = a.volume - b.volume
          break
        case 'liquidity':
          diff = a.liquidity - b.liquidity
          break
        case 'aiConfidence':
          diff = a.aiConfidence - b.aiConfidence
          break
        case 'score':
          diff = a.score - b.score
          break
        case 'edge':
          diff = a.edgeCents - b.edgeCents
          break
        case 'resolution':
          diff = (a.daysToResolution ?? Infinity) - (b.daysToResolution ?? Infinity)
          break
        default:
          diff = 0
      }
      return diff * dir
    })
    return arr
  }, [filteredScored, sortBy, sortAsc])

  // W38-4 — opportunity score tooltip: full breakdown per factor.
  // Rendered as the title attribute on the score badge so hover reveals
  // exactly how many points each factor contributed (transparent formula).
  function scoreTooltip(s: ScoredMarket): string {
    const lines = [
      `Opportunity Score: ${s.score}/100`,
      `  Liquidity  ×${SCORE_WEIGHTS.liquidity.toFixed(2)}  → ${s.scoreBreakdown.liquidity.toFixed(1)} pts`,
      `  Volume     ×${SCORE_WEIGHTS.volume.toFixed(2)}  → ${s.scoreBreakdown.volume.toFixed(1)} pts`,
      `  Spread     ×${SCORE_WEIGHTS.spread.toFixed(2)}  → ${s.scoreBreakdown.spread.toFixed(1)} pts`,
      `  AI conf    ×${SCORE_WEIGHTS.aiConfidence.toFixed(2)}  → ${s.scoreBreakdown.aiConfidence.toFixed(1)} pts`,
      `  Resolution ×${SCORE_WEIGHTS.resolution.toFixed(2)}  → ${s.scoreBreakdown.resolution.toFixed(1)} pts`,
      ``,
      `Liquidity: ${fmtUsd(s.liquidity, 0)}`,
      `Volume 24h: ${fmtUsd(s.volume, 0)}`,
      s.spreadCents != null ? `Spread: ${s.spreadCents.toFixed(1)}¢` : `Spread: n/a`,
      `AI confidence: ${(s.aiConfidence * 100).toFixed(0)}%`,
      `Edge: ${s.edgeCents.toFixed(1)}¢`,
      s.daysToResolution != null ? `Days to resolution: ${s.daysToResolution}` : `Days to resolution: n/a`,
    ]
    return lines.join('\n')
  }

  const hasActiveFilters =
    selectedCategory !== 'ALL' ||
    aiConfidenceFilter !== 'ALL' ||
    edgeFilter !== 'ALL' ||
    resolutionFilter !== 'ALL' ||
    Boolean(search)

  const resetAllFilters = () => {
    setSelectedCategory('ALL')
    setAiConfidenceFilter('ALL')
    setEdgeFilter('ALL')
    setResolutionFilter('ALL')
    setSearch('')
    fetchMarkets('')
  }

  // W52-a — active-chip glow token shared by all 4 chip groups
  // (category + AI conf + edge + resolution). Layered on top of the
  // existing `.filter-chip.active` solid accent fill — consistent
  // with the MarketsPanel W51-2a active chip pattern.
  const ACTIVE_CHIP_GLOW = 'shadow-[0_0_8px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/30'

  return (
    <div className="card flex flex-col h-full bg-[#13161e] border border-[#1f2335] overflow-hidden shadow-xl">
      {/* Header & Controls */}
      <div className="card-header flex flex-wrap justify-between items-center px-4 py-3 border-b border-[#1f2335] gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="card-title text-sm font-bold text-[#dde1ed]">
            🔍 Prediction Market Screener
          </span>
          {/* W39-4 — `Showing X of Y markets` counter (badge wording kept
              backwards-compatible with the existing W22-2 test regex
              `/N of M Markets/i`). The `title` attribute surfaces the
              W39-4 "Showing X of Y markets" phrasing for hover tooltips. */}
          <span
            className="badge badge-cyan text-xs font-semibold"
            title={`Showing ${filteredMarkets.length} of ${markets.length} markets after the active filters`}
            data-testid="screener-result-count"
          >
            Showing {filteredMarkets.length} of {markets.length} Markets
          </span>
          {lastRefreshed && (
            <span className="text-[10.5px] text-[#7e8aaa] mono tabular-nums">
              Refreshed {fmtAge(lastRefreshed)}
            </span>
          )}
          {/* W38-4 — Export CSV button. Renders the currently filtered
              result set as a CSV download. Disabled when no rows. */}
          <button
            type="button"
            onClick={() => exportRowsToCSV(filteredScored)}
            disabled={filteredScored.length === 0}
            className="btn btn-ghost btn-xs text-[10.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Export filtered markets to CSV"
            title={`Export ${filteredScored.length} filtered market${filteredScored.length === 1 ? '' : 's'} to CSV`}
            data-testid="export-csv-btn"
          >
            ⤓ Export CSV
          </button>
        </div>

        {/* W49-4 — Search form with leading Search icon. */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#7e8aaa] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search Polymarket events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm w-56 text-xs bg-[#0e1015] border border-[#1f2335] pl-7 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all"
              aria-label="Search prediction market events"
              data-testid="screener-search-input"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : 'Search'}
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); fetchMarkets(''); }}
              className="btn btn-ghost btn-sm text-xs"
              title="Clear search filter"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* W49-4 — Category chips via `.filter-chip` class.
          W52-a — active chips carry the cyan accent border glow
          (`shadow-[0_0_8px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/30`)
          layered on top of `.filter-chip.active`. Inactive chips
          unchanged. Consistent with the MarketsPanel W51-2a pattern. */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-[#0e1015] border-b border-[#1f2335] overflow-x-auto scrollbar-thin">
        {CATEGORY_CHIPS.map((cat) => {
          const isActive = selectedCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`filter-chip text-[10.5px] uppercase ${
                isActive ? `active ${ACTIVE_CHIP_GLOW}` : ''
              }`}
              aria-pressed={isActive}
              data-testid={`screener-category-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          )
        })}
        {loading && markets.length > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#7e8aaa] mono shrink-0"
            aria-label="Refetching markets"
            data-testid="screener-refetch-spinner"
          >
            <span className="spinner" aria-hidden="true" />
            refreshing…
          </span>
        )}
      </div>

      {/* W49-4 — Additional factor filter chips via `.filter-chip` class.
          W52-a — refined toolbar grouping: each group has a leading
          uppercase label + subtle 1px vertical divider between groups
          (`w-px h-4 bg-[#1f2335] mx-1`) so the three groups read as a
          single cohesive strip. Active chips carry the cyan accent
          border glow. */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0e1015]/60 border-b border-[#1f2335] overflow-x-auto scrollbar-thin text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[#7e8aaa] uppercase font-bold tracking-wider mr-0.5" aria-hidden="true">AI Conf</span>
          {AI_CONFIDENCE_FILTERS.map((f) => {
            const isActive = aiConfidenceFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setAiConfidenceFilter(f.key)}
                title={f.title}
                aria-pressed={isActive}
                className={`filter-chip text-[10px] uppercase ${
                  isActive ? `active ${ACTIVE_CHIP_GLOW}` : ''
                }`}
                data-testid={`ai-conf-filter-${f.key.toLowerCase()}`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <span className="w-px h-4 bg-[#1f2335] mx-1" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#7e8aaa] uppercase font-bold tracking-wider mr-0.5" aria-hidden="true">Edge</span>
          {EDGE_FILTERS.map((f) => {
            const isActive = edgeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setEdgeFilter(f.key)}
                title={f.title}
                aria-pressed={isActive}
                className={`filter-chip text-[10px] uppercase ${
                  isActive ? `active ${ACTIVE_CHIP_GLOW}` : ''
                }`}
                data-testid={`edge-filter-${f.key.toLowerCase()}`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <span className="w-px h-4 bg-[#1f2335] mx-1" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#7e8aaa] uppercase font-bold tracking-wider mr-0.5" aria-hidden="true">Resolution</span>
          {RESOLUTION_FILTERS.map((f) => {
            const isActive = resolutionFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setResolutionFilter(f.key)}
                title={f.title}
                aria-pressed={isActive}
                className={`filter-chip text-[10px] uppercase ${
                  isActive ? `active ${ACTIVE_CHIP_GLOW}` : ''
                }`}
                data-testid={`resolution-filter-${f.key.toLowerCase()}`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* W52-a — Error state polished: replaces the bare `banner-danger`
          strip with a refined error card. Lucide `AlertTriangle` icon +
          dim subtitle + Retry button with `RotateCcw` glyph + Dismiss
          `X` button. The full error string (e.g. "Failed to load markets
          (HTTP 500)") is still rendered as the card's title so the W22-2
          test `getByText(/Failed to load markets \(HTTP 500\)/i)` still
          resolves. Retry button still `getByRole('button',
          { name: /retry/i })`; Dismiss button still `getByRole('button',
          { name: /dismiss error/i })`. */}
      {error && (
        <div
          className="mx-3 mt-2 mb-1 px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 flex items-start gap-2.5"
          role="alert"
          data-testid="screener-error-card"
        >
          <AlertTriangle
            className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-red-200 font-semibold text-xs leading-snug break-words">
              {error}
            </div>
            <div className="text-red-300/60 text-[10.5px] mt-0.5 leading-snug">
              The markets API couldn&apos;t be reached. Check connectivity and retry.
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchMarkets()}
              className="inline-flex items-center gap-1 btn btn-xs font-semibold border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:border-red-500/60 transition-colors"
              aria-label="Retry"
              data-testid="screener-retry-btn"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-red-300/60 hover:text-red-200 hover:bg-red-500/15 transition-colors"
              aria-label="Dismiss error"
              data-testid="screener-dismiss-error"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* W39-4 — Active-filter summary bar.
          Renders only when one or more filters are active (search,
          category, AI confidence, edge, or resolution). Lists each
          active filter as a removable chip so a trader can see which
          constraints are applied AND clear them individually. The
          trailing `Reset all` button clears everything in one click.

          Named "Reset all" (not "Clear all") so the existing W22-2
          test `getByRole('button', { name: /clear/i })` — which
          asserts exactly one matching button after typing a search —
          doesn't pick this up as a second match. The individual
          remove-chip buttons use aria-labels like "Remove search
          filter" / "Remove category filter: CRYPTO" — also don't
          contain "clear", so the regex stays happy. */}
      {hasActiveFilters && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 bg-[#0e1015]/60 border-b border-[#1f2335] text-[10.5px]"
          data-testid="screener-active-filters"
        >
          <span className="text-[#7e8aaa] uppercase font-bold tracking-wider mr-0.5" aria-hidden="true">
            {[
              search ? 1 : 0,
              selectedCategory !== 'ALL' ? 1 : 0,
              aiConfidenceFilter !== 'ALL' ? 1 : 0,
              edgeFilter !== 'ALL' ? 1 : 0,
              resolutionFilter !== 'ALL' ? 1 : 0,
            ].reduce((a, b) => a + b, 0)} filters active
          </span>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); fetchMarkets('') }}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-cyan-300 hover:bg-blue-500/20 transition-colors"
              title="Remove search filter"
              aria-label="Remove query filter"
              data-testid="active-filter-search"
            >
              <span className="opacity-70">search:</span>
              <strong className="font-semibold">"{search}"</strong>
              <span className="opacity-60" aria-hidden="true">×</span>
            </button>
          )}
          {selectedCategory !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-cyan-300 hover:bg-blue-500/20 transition-colors"
              title="Remove category filter"
              aria-label={`Remove category filter: ${selectedCategory}`}
              data-testid="active-filter-category"
            >
              <span className="opacity-70">category:</span>
              <strong className="font-semibold">{selectedCategory}</strong>
              <span className="opacity-60" aria-hidden="true">×</span>
            </button>
          )}
          {aiConfidenceFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setAiConfidenceFilter('ALL')}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors"
              title="Remove AI confidence filter"
              aria-label={`Remove AI confidence filter: ${aiConfidenceFilter}`}
              data-testid="active-filter-ai-conf"
            >
              <span className="opacity-70">AI conf:</span>
              <strong className="font-semibold">
                {AI_CONFIDENCE_FILTERS.find((f) => f.key === aiConfidenceFilter)?.label ?? aiConfidenceFilter}
              </strong>
              <span className="opacity-60" aria-hidden="true">×</span>
            </button>
          )}
          {edgeFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setEdgeFilter('ALL')}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="Remove edge filter"
              aria-label={`Remove edge filter: ${edgeFilter}`}
              data-testid="active-filter-edge"
            >
              <span className="opacity-70">edge:</span>
              <strong className="font-semibold">
                {EDGE_FILTERS.find((f) => f.key === edgeFilter)?.label ?? edgeFilter}
              </strong>
              <span className="opacity-60" aria-hidden="true">×</span>
            </button>
          )}
          {resolutionFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setResolutionFilter('ALL')}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              title="Remove time-to-resolution filter"
              aria-label={`Remove resolution filter: ${resolutionFilter}`}
              data-testid="active-filter-resolution"
            >
              <span className="opacity-70">resolution:</span>
              <strong className="font-semibold">
                {RESOLUTION_FILTERS.find((f) => f.key === resolutionFilter)?.label ?? resolutionFilter}
              </strong>
              <span className="opacity-60" aria-hidden="true">×</span>
            </button>
          )}
          <button
            type="button"
            onClick={resetAllFilters}
            className="ml-auto btn btn-ghost btn-xs text-[10px] font-bold"
            title="Reset all filters"
            aria-label="Reset all filters"
            data-testid="reset-all-filters"
          >
            Reset all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin table-container">
        {loading && markets.length === 0 ? (
          // W52-a — Shimmer skeleton loader replaces the bare spinner.
          // Renders a dim "Scanning Polymarket prediction markets…"
          // caption above N shimmer rows mirroring the live table's
          // 9-column structure. The caption text is preserved verbatim
          // so the W22-2 test `getByText(/Scanning Polymarket
          // prediction markets/i)` still resolves. The wrapper carries
          // `role="status"` + `aria-live="polite"` for screen readers.
          <div
            className="flex flex-col"
            role="status"
            aria-live="polite"
            data-testid="screener-loading-skeleton"
          >
            <div className="flex items-center gap-2 px-4 py-3 text-[#7e8aaa] text-[11px]">
              <span
                className="animate-pulse"
                data-testid="screener-loading-text"
              >
                Scanning Polymarket prediction markets…
              </span>
            </div>
            <ScreenerSkeletonRows rowCount={5} />
          </div>
        ) : (
          <table className="data-table" role="table" aria-label="Prediction market screener results">
            <thead>
              {/* W52-a — unified header row styling: uppercase, 11px,
                  letter-spaced, dimmed. Reads as a single cohesive
                  caption strip above the data rows. Sortable headers
                  keep their cursor-pointer + hover:text-white affordance
                  + Lucide ArrowUp/ArrowDown sort indicator. */}
              <tr className="uppercase text-[11px] tracking-wider font-medium text-[#7e8aaa] border-b border-[#1f2335]">
                {/* W49-4 — Market Event header now sortable (alphabetical). */}
                <th
                  scope="col"
                  onClick={() => handleSort('title')}
                  className="min-w-[260px] text-left cursor-pointer hover:text-white select-none transition-colors"
                  title="Sort by market event name"
                  aria-sort={sortBy === 'title' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    Market Event
                    <SortIndicator active={sortBy === 'title'} ascending={sortAsc} />
                  </span>
                </th>
                <th scope="col" className="text-left">Category</th>
                {/* W39-4 — explicit `text-right` on the numeric Volume +
                    Liquidity headers (previously relied on the default
                    left-align). Aligns with the rest of the numeric
                    columns (Score, Edge, Resolution, Action).
                    W49-4 — Volume + Liquidity headers now sortable; the
                    cell formatting switched to `fmtCompact` (1.2K / 3.4M)
                    per the W49-4 spec. Tooltip preserves the full value. */}
                <th
                  scope="col"
                  onClick={() => handleSort('volume')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Sort by 24h volume"
                  aria-sort={sortBy === 'volume' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    24h Volume
                    <SortIndicator active={sortBy === 'volume'} ascending={sortAsc} />
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('liquidity')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Sort by liquidity"
                  aria-sort={sortBy === 'liquidity' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    Liquidity
                    <SortIndicator active={sortBy === 'liquidity'} ascending={sortAsc} />
                  </span>
                </th>
                {/* W49-4 — NEW AI Conf column. Surfaces the W38-4-derived
                    AI confidence as a per-row percentage so a trader can
                    scan conviction across the visible result set. Sortable. */}
                <th
                  scope="col"
                  onClick={() => handleSort('aiConfidence')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Sort by AI confidence (derived from volume + liquidity when upstream doesn't supply one)"
                  aria-sort={sortBy === 'aiConfidence' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    AI Conf
                    <SortIndicator active={sortBy === 'aiConfidence'} ascending={sortAsc} />
                  </span>
                </th>
                {/* W38-4 — Opportunity Score column. Tooltip on the
                    header explains the formula; tooltip on each badge
                    shows the per-factor breakdown. W49-4 — sortable. */}
                <th
                  scope="col"
                  onClick={() => handleSort('score')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Opportunity Score = 0.35·liquidity + 0.30·volume + 0.15·spread + 0.10·AI_conf + 0.10·resolution (each factor min-max normalized 0..1, then weighted, scaled to 100). Hover any badge for the breakdown."
                  aria-sort={sortBy === 'score' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    Score
                    <SortIndicator active={sortBy === 'score'} ascending={sortAsc} />
                  </span>
                </th>
                {/* W38-4 — Edge column shows derived theoretical edge in cents.
                    W49-4 — sortable. */}
                <th
                  scope="col"
                  onClick={() => handleSort('edge')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Theoretical edge in cents (heuristic: 5 × volume / liquidity, clamped to 0–10¢). Click to sort."
                  aria-sort={sortBy === 'edge' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    Edge
                    <SortIndicator active={sortBy === 'edge'} ascending={sortAsc} />
                  </span>
                </th>
                {/* W38-4 — Time to resolution column. W49-4 — sortable. */}
                <th
                  scope="col"
                  onClick={() => handleSort('resolution')}
                  className="text-right cursor-pointer hover:text-white select-none transition-colors"
                  title="Days until market resolution (from endDate if present). Click to sort."
                  aria-sort={sortBy === 'resolution' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="inline-flex items-center gap-1">
                    Resolution
                    <SortIndicator active={sortBy === 'resolution'} ascending={sortAsc} />
                  </span>
                </th>
                <th scope="col" className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedScored.length === 0 ? (
                // W38-4 — improved empty state. Shows the active filter
                // context + a reset button so the trader can tell whether
                // they over-constrained the view vs. the upstream
                // actually being empty.
                //
                // W52-a — polished with a Lucide `SearchX` icon + title
                // + subtitle. The "No markets found" copy is preserved
                // verbatim so the W22-2 test `getByText(/No markets
                // found/i)` still resolves.
                <tr>
                  {/* W49-4 — colSpan bumped 8 → 9 to account for the new
                      AI Conf column. */}
                  <td colSpan={9} className="text-center py-12 align-middle">
                    <div className="flex flex-col items-center gap-2 px-6 max-w-md mx-auto">
                      <SearchX
                        className="w-7 h-7 text-[#7e8aaa] mb-1"
                        aria-hidden="true"
                      />
                      <div className="text-[#dde1ed] font-semibold text-sm">
                        No markets found{search ? ` for "${search}"` : ''}
                      </div>
                      <div className="text-[11px] text-[#7e8aaa] leading-relaxed max-w-sm">
                        {hasActiveFilters
                          ? 'Try widening the active filters to surface more opportunities.'
                          : 'Try adjusting your search query or category filter.'}
                      </div>
                      {hasActiveFilters ? (
                        <>
                          <div className="text-[10.5px] mono text-[#5a637a] tabular-nums mt-1">
                            active filters: {[
                              selectedCategory !== 'ALL' && `cat=${selectedCategory}`,
                              aiConfidenceFilter !== 'ALL' && `ai_conf=${aiConfidenceFilter}`,
                              edgeFilter !== 'ALL' && `edge=${edgeFilter}`,
                              resolutionFilter !== 'ALL' && `res=${resolutionFilter}`,
                              search && `search="${search}"`,
                            ].filter(Boolean).join(' · ') || 'none'}
                          </div>
                          <button
                            type="button"
                            onClick={resetAllFilters}
                            className="btn btn-ghost btn-xs text-[10px] mt-2 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            Reset all filters
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedScored.map((s, i) => (
                  <tr
                    key={i}
                    onClick={() => onSelectMarket && onSelectMarket(s.tokenId, s.market.slug)}
                    // W52-a — refined row hover: subtle cyan background
                    // lift (`hover:bg-cyan-500/5`) + left-edge accent
                    // bar via inset shadow
                    // (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.65)]`).
                    // No layout shift (inset shadow vs border-left).
                    // Consistent with the MarketsPanel W51-2a row-hover.
                    className="hover:bg-cyan-500/5 hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.65)] transition-colors cursor-pointer group"
                  >
                    {/* W39-4 — market-name cell. `title` attribute on the
                        `<td>` provides a native hover tooltip showing the
                        full title + slug so a trader can read a long event
                        name even when the single-line ellipsis truncates
                        it. Inner spans switched to single-line
                        `truncate` so `text-overflow: ellipsis` fires. */}
                    <td
                      className="max-w-[340px] align-middle"
                      title={`${s.title} — ${s.market.slug}`}
                    >
                      <span
                        className="text-[#dde1ed] group-hover:text-cyan-300 font-medium block truncate transition-colors min-w-0"
                        title={s.title}
                      >
                        {s.title}
                      </span>
                      <span
                        className="text-[10px] text-[#7e8aaa] mono block truncate min-w-0"
                        title={s.market.slug}
                      >
                        {s.market.slug}
                      </span>
                    </td>
                    {/* Category — text-left (the default), as it's a
                        short badge not a numeric value. */}
                    <td className="text-left align-middle">
                      <span className="badge badge-blue text-[9.5px] uppercase">
                        {s.market.category || 'general'}
                      </span>
                    </td>
                    {/* W49-4 — Volume + Liquidity cells now use `fmtCompact`
                        (1.2K / 3.4M) per the W49-4 "Human-readable"
                        spec. Tooltip preserves the full-precision value
                        via `fmtUsd` so a trader can hover to read the
                        exact dollar amount. */}
                    <td
                      className="mono text-cyan-400 font-medium text-right tabular-nums align-middle"
                      title={`${fmtUsd(s.volume, 0)} (full precision)`}
                    >
                      {fmtCompact(s.volume)}
                    </td>
                    <td
                      className="mono text-[#7e8aaa] text-right tabular-nums align-middle"
                      title={`${fmtUsd(s.liquidity, 0)} (full precision)`}
                    >
                      {fmtCompact(s.liquidity)}
                    </td>
                    {/* W49-4 — NEW AI Conf column. Per-row percentage
                        derived from the W38-4 `deriveAiConfidence`
                        helper. Coloured by conviction bucket: high
                        (≥70%) emerald, mid (50–70%) amber, low (<50%)
                        muted so a trader can scan conviction at a
                        glance. Tooltip shows the exact value. */}
                    <td className="text-right align-middle">
                      <span
                        className={`mono text-[10.5px] font-bold px-1.5 py-0.5 rounded border inline-block tabular-nums ${
                          s.aiConfidence >= 0.7
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                            : s.aiConfidence >= 0.5
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              : 'bg-slate-500/15 text-slate-300 border-slate-500/40'
                        }`}
                        title={`AI confidence: ${(s.aiConfidence * 100).toFixed(1)}% (derived from volume + liquidity when upstream doesn't supply one)`}
                        data-testid={`ai-conf-${i}`}
                      >
                        {(s.aiConfidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    {/* W38-4 — Opportunity Score badge with full breakdown
                        in the tooltip (transparent formula).
                        W52-a — `tabular-nums` added for clean decimal
                        alignment under the Score header. */}
                    <td className="text-right align-middle">
                      <span
                        className={`mono text-[10.5px] font-bold px-1.5 py-0.5 rounded border inline-block tabular-nums ${scoreBadgeClass(s.score)}`}
                        title={scoreTooltip(s)}
                        data-testid={`opportunity-score-${i}`}
                        data-score={s.score}
                      >
                        {s.score}
                      </span>
                    </td>
                    {/* W38-4 — Edge (cents) */}
                    <td className="mono text-right text-amber-300 text-[11px] font-medium tabular-nums align-middle">
                      {s.edgeCents.toFixed(1)}¢
                    </td>
                    {/* W38-4 — Time to resolution */}
                    <td className="mono text-right text-[#7e8aaa] text-[11px] tabular-nums align-middle">
                      {s.daysToResolution != null ? `${s.daysToResolution}d` : '—'}
                    </td>
                    <td className="text-right align-middle">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (onQuickTrade) onQuickTrade(s.tokenId, s.market.slug)
                          else if (onSelectMarket) onSelectMarket(s.tokenId, s.market.slug)
                        }}
                        className="btn btn-primary btn-xs font-semibold"
                        aria-label={`Open depth and trade ticket for ${s.title}`}
                      >
                        Trade / Depth
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

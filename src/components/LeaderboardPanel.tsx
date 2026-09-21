// components/LeaderboardPanel.tsx — Strategy leaderboard ranked by
// reproducible risk-adjusted net performance.
//
// W22-5 — Migrated from the self-managed 6-second REST polling loop to
// the hybrid `useRealtimeData` hook. The panel now:
//   1. REST-prefetches /api/leaderboard on mount.
//   2. Subscribes to the `metrics` WS channel for live push updates.
//      The `metrics` channel pushes the full BotSnapshot, whose shape
//      doesn't match the LeaderboardResponse `{ ranked: StrategyRow[] }`
//      the panel renders. To avoid clobbering the typed state with
//      mismatched data, the hook is given a `validate` predicate that
//      drops any payload missing the `ranked` array.
//   3. Falls back to polling /api/leaderboard every 10s when the WS
//      isn't connected.
//   4. Renders a "● Live" / "⟳ Polling" badge so the trader can tell at
//      a glance whether the rankings are real-time or lagged.
//
// W55-a — Premium visual polish pass, aligned with the W51-2d MLPanel
// / AIMLCommandCenter / W54-e MLValidationPanel redesign family:
//   1. Shimmer skeleton loading state mirroring the leaderboard column
//      layout (Rank | Strategy | Win | PF | DD | P&L | Score) so the
//      panel doesn't visually jump when the first fetch resolves.
//   2. Polished empty state with Lucide Trophy icon + dim description.
//   3. Refined table: uppercase 11px tracking-wider headers, SortIndicator
//      glyphs (▲/▼) on every sortable column, row-hover accent bar via
//      inset shadow.
//   4. Rank badges (gold #1 / silver #2 / bronze #3 / muted for the
//      rest) wrapping the medal emoji (preserved as the sole text node
//      so the existing findByText('🥇') test contract stays intact).
//   5. tabular-nums on every numeric column (closed trades, win rate,
//      profit factor, max drawdown, net P&L, risk-adjusted score).
//   6. Tone-colored P&L + score values (green profit / red loss).
//   7. SectionHeader with ListOrdered icon + uppercase "RANKINGS" title
//      + count badge.
//   8. Refined top-3 row styling (gold/silver/bronze left-edge accent
//      bar on hover) so the podium reads at a glance.
//   9. Polished error card with AlertTriangle icon + Retry button
//      (calls useRealtimeData.refetch) + existing Dismiss button.
// All existing functionality, class names, API calls, polling,
// accessibility roles/labels, test-matched strings, and the 'use
// client' directive preserved.

'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ListOrdered,
  RefreshCw,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { Badge } from '@/components/ui/badge'

// ── Types ──────────────────────────────────────────────────────────────────

interface StrategyRow {
  strategy: string
  fills: number
  closed_trades: number
  net_pnl: number
  win_rate: number
  profit_factor: number | null
  open_exposure: number
  max_drawdown: number
  risk_adjusted_score: number
}

interface LeaderboardResponse {
  ranked?: StrategyRow[]
}

// ── W51-2d Tone system (mirror of MLPanel / MLValidationPanel) ─────────────

type Tone = 'good' | 'warn' | 'fail' | 'info' | 'neutral'

const TONE: Record<Tone, { text: string }> = {
  good:    { text: 'text-emerald-400' },
  warn:    { text: 'text-amber-400' },
  fail:    { text: 'text-red-400' },
  info:    { text: 'text-cyan-300' },
  neutral: { text: 'text-[var(--text-primary)]' },
}

// ── Rank-badge config (gold #1 / silver #2 / bronze #3 / muted rest) ─────

interface RankBadgeStyle {
  /** Tailwind classes applied to the rank badge span. */
  badge: string
  /** Left-edge accent bar applied to the row on hover (top-3 highlight). */
  rowHover: string
}

const RANK_BADGE: Record<number, RankBadgeStyle> = {
  1: {
    badge: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 shadow-[0_0_6px_rgba(251,191,36,0.30)]',
    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]',
  },
  2: {
    badge: 'bg-slate-300/15 text-slate-200 ring-1 ring-slate-300/40',
    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(203,213,225,0.55)]',
  },
  3: {
    badge: 'bg-orange-700/20 text-orange-300 ring-1 ring-orange-600/40',
    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(194,65,12,0.55)]',
  },
}

const MUTED_RANK_BADGE: RankBadgeStyle = {
  badge: 'bg-[var(--border)] text-[var(--text-secondary)] ring-1 ring-[#2a2f45]',
  rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]',
}

// ── Sort config ────────────────────────────────────────────────────────────

type SortField = 'score' | 'net_pnl' | 'win_rate' | 'profit_factor' | 'max_drawdown'

function getSortValue(row: StrategyRow, field: SortField): number {
  switch (field) {
    case 'score':          return row.risk_adjusted_score
    case 'net_pnl':        return row.net_pnl
    case 'win_rate':       return row.win_rate
    case 'profit_factor':  return row.profit_factor ?? -Infinity
    case 'max_drawdown':   return row.max_drawdown
  }
}

// ── W22-5 — type guard for the metrics WS channel ──────────────────────────
// The channel pushes the full BotSnapshot by default; only payloads that
// look like a LeaderboardResponse (have the `ranked` array) are accepted.
// When the payload doesn't match, the data state is left untouched and
// the REST polling continues to drive the displayed rankings.
function isLeaderboardPayload(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return Array.isArray(obj.ranked)
}

// ── Sub-components ─────────────────────────────────────────────────────────

// W52-a / W55-a — SortIndicator renders an ArrowUp / ArrowDown glyph on
// the active sort column, or an empty 10px slot on inactive columns so
// the layout doesn't shift on sort toggle. aria-hidden because the
// sort state is already exposed via the button's aria-label
// ("Sort by …").
function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (active) {
    return ascending
      ? <ArrowUp className="w-2.5 h-2.5 inline-block ml-0.5" aria-hidden="true" />
      : <ArrowDown className="w-2.5 h-2.5 inline-block ml-0.5" aria-hidden="true" />
  }
  return <span className="w-2.5 h-2.5 inline-block ml-0.5" aria-hidden="true" />
}

// W54-e / W55-a — ShimmerBlock is a thin skeleton-line-sm placeholder
// that can be sized via the className prop. aria-hidden so screen
// readers don't pick it up.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// W51-2d / W55-a — SectionHeader renders a Lucide icon + uppercase
// tracking-wider 9.5px title + optional dim italic description +
// optional trailing node (badge / count). Mirrors the MLPanel and
// MLValidationPanel SectionHeader so the leaderboard reads as part of
// the same premium trading-terminal family.
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
    <div className="flex items-center gap-1.5">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[var(--text-secondary)] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// W55-a — LeaderboardSkeleton renders shimmer rows mirroring the
// leaderboard's column layout (Rank | Strategy | Win | PF | DD | P&L
// | Score) so the panel doesn't visually jump when the first fetch
// resolves. Uses the design-system `.skeleton-line-sm` class from
// globals.css (which carries the `skeleton-shimmer` keyframe). The
// "Loading leaderboard…" caption is preserved verbatim above the
// skeleton rows so the W22-1 / W22-5 test contract
// (`getByText(/Loading leaderboard/)`) still resolves. The skeleton
// rows themselves are aria-hidden (the caption + role=status +
// aria-live=polite already announce the loading state to screen
// readers).
function LeaderboardSkeleton({ rowCount = 4 }: { rowCount?: number }) {
  return (
    <div
      className="p-2.5 space-y-1.5"
      role="status"
      aria-live="polite"
      aria-label="Loading leaderboard rankings"
      data-testid="leaderboard-loading-skeleton"
    >
      <div className="text-[10.5px] text-[var(--text-secondary)] flex items-center gap-2 pb-1">
        <span className="spinner" aria-hidden="true" />
        <span>Loading leaderboard…</span>
      </div>
      {/* Skeleton header row mirroring the table column layout */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--border)]" aria-hidden="true">
        <ShimmerBlock className="w-5 shrink-0" />
        <ShimmerBlock className="w-1/3 flex-1" />
        <ShimmerBlock className="w-10 shrink-0" />
        <ShimmerBlock className="w-12 shrink-0" />
        <ShimmerBlock className="w-14 shrink-0" />
        <ShimmerBlock className="w-14 shrink-0" />
        <ShimmerBlock className="w-12 shrink-0" />
      </div>
      {/* Skeleton rows */}
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-page)]"
          aria-hidden="true"
        >
          <ShimmerBlock className="w-5 shrink-0" />
          <ShimmerBlock className="w-1/2 flex-1" />
          <ShimmerBlock className="w-10 shrink-0" />
          <ShimmerBlock className="w-12 shrink-0" />
          <ShimmerBlock className="w-14 shrink-0" />
          <ShimmerBlock className="w-14 shrink-0" />
          <ShimmerBlock className="w-12 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// W55-a — PolishedEmptyState replaces the bare emoji with a Lucide
// Trophy icon (28px, dim) + .empty-state-title direct text node +
// .empty-state-desc dim description. role=status preserved. The
// "No closed trades yet" title is preserved verbatim so the existing
// test contract (`findByText('No closed trades yet')`) resolves.
function PolishedEmptyState() {
  return (
    <div
      className="empty-state p-8"
      role="status"
      data-testid="leaderboard-empty-state"
    >
      <Trophy className="empty-state-icon text-[var(--text-secondary)]" size={28} aria-hidden="true" />
      <div className="empty-state-title">No closed trades yet</div>
      <div className="empty-state-desc">
        Rankings populate as strategies close positions and bank P&amp;L.
      </div>
    </div>
  )
}

// W55-a — PolishedErrorCard replaces the bare `banner-danger` strip
// with a refined error card. Lucide AlertTriangle icon + the full
// wrapped error string ("Leaderboard: HTTP 500") rendered as the
// card's title (so the W22-1 test contracts `findByText(/Leaderboard:/i)`
// + `getByText(/HTTP 500/i)` still resolve) + dim detail + Retry
// button (calls useRealtimeData.refetch) + the existing Dismiss
// button (aria-label="Dismiss leaderboard error" preserved verbatim).
interface PolishedErrorCardProps {
  message: string
  detail: string
  onRetry: () => void
  onDismiss: () => void
}

function PolishedErrorCard({ message, detail, onRetry, onDismiss }: PolishedErrorCardProps) {
  return (
    <div
      className="mx-3 mt-2 mb-1 px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 flex items-start gap-2.5"
      role="alert"
      data-testid="leaderboard-error-card"
    >
      <AlertTriangle
        className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="text-red-200 font-semibold text-xs leading-snug break-words">
          {message}
        </div>
        <div className="text-red-300/60 text-[10.5px] mt-0.5 leading-snug">
          {detail}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 btn btn-xs font-semibold border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:border-red-500/60 transition-colors"
          aria-label="Retry leaderboard fetch"
          data-testid="leaderboard-error-retry"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Retry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-red-300/60 hover:text-red-200 hover:bg-red-500/15 transition-colors"
          aria-label="Dismiss leaderboard error"
          data-testid="leaderboard-error-dismiss"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function LeaderboardPanel() {
  const { data, isLoading, isRealtime, error, refetch } = useRealtimeData<LeaderboardResponse>(
    '/api/leaderboard',
    {
      wsChannel: 'metrics',
      pollInterval: 10000,
      validate: isLeaderboardPayload,
    },
  )

  const rows: StrategyRow[] = data?.ranked ?? []

  // Tag each row with its original (backend) rank so the medal emoji
  // reflects the strategy's OFFICIAL rank regardless of the local sort
  // order (preserves the test contract that the gold medal always maps
  // to the top-ranked strategy by risk-adjusted score, even after the
  // trader re-sorts the table by P&L / win rate / etc.).
  const rankedRows = useMemo(
    () => rows.map((r, i) => ({ row: r, originalRank: i + 1 })),
    [rows],
  )

  // W55-a — local sort state. Default = score desc, mirroring the
  // backend's pre-ranking so the initial render matches the original
  // order (preserves the test contract that 🥇 maps to the highest-
  // scoring strategy on first render).
  const [sortBy, setSortBy] = useState<SortField>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortAsc((a) => !a)
    else {
      setSortBy(field)
      setSortAsc(false)
    }
  }

  const sortedRanked = useMemo(() => {
    const copy = [...rankedRows]
    copy.sort((a, b) => {
      const av = getSortValue(a.row, sortBy)
      const bv = getSortValue(b.row, sortBy)
      if (av === -Infinity && bv === -Infinity) return 0
      if (av === -Infinity) return 1
      if (bv === -Infinity) return -1
      return sortAsc ? av - bv : bv - av
    })
    return copy
  }, [rankedRows, sortBy, sortAsc])

  // W22-1 backwards-compat — surface fetch failures via a dismissable
  // error card so the trader knows the leaderboard fetch failed and
  // the rankings are stale. useRealtimeData exposes the latest error
  // string (or null when the last fetch succeeded); we mirror it into
  // local state so we can track dismissal independently. The card
  // re-appears whenever a fresh error arrives.
  const wrappedError = error ? `Leaderboard: ${error}` : null
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  useEffect(() => {
    if (wrappedError && wrappedError !== dismissedError) {
      setDismissedError(null)
    }
  }, [wrappedError, dismissedError])
  const showError = wrappedError && wrappedError !== dismissedError
  const dismissError = () => setDismissedError(wrappedError)

  const errorCard = showError && (
    <PolishedErrorCard
      message={wrappedError as string}
      detail="Leaderboard API couldn't be reached. Check connectivity and retry."
      onRetry={() => refetch()}
      onDismiss={dismissError}
    />
  )

  // ── Shared header (rendered in every branch so the test contract
  //    `getByText(/Strategy Leaderboard/)` resolves regardless of
  //    loading / empty / loaded state). The 🏆 emoji prefix is preserved
  //    verbatim so the regex still matches; the Lucide Trophy icon is
  //    decorative (aria-hidden).
  const header = (
    <div className="card-header p-3 border-b border-[var(--border)] flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Trophy className="size-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span className="card-title text-xs font-bold text-[var(--text-primary)]">
          🏆 Strategy Leaderboard
        </span>
        {isRealtime ? (
          <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
        ) : (
          <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
        )}
      </div>
      <span className="badge badge-amber text-[9.5px]">Ranked by Score</span>
    </div>
  )

  // ── Loading state — shimmer skeleton mirroring the table layout ──────────

  if (isLoading && rows.length === 0) {
    return (
      <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
        {header}
        {errorCard}
        <LeaderboardSkeleton rowCount={4} />
      </div>
    )
  }

  // ── Empty state — polished Trophy icon + dim description ─────────────────

  if (rows.length === 0) {
    return (
      <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
        {header}
        {errorCard}
        <PolishedEmptyState />
      </div>
    )
  }

  // ── Loaded state — refined table with sort + rank badges + tones ────────

  return (
    <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
      {header}
      {errorCard}

      {/* Section header — Lucide icon + uppercase title + count badge */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
        <SectionHeader
          icon={ListOrdered}
          title="Rankings"
          description="risk-adjusted net performance"
          tone="info"
          trailing={
            <span className="badge badge-dim text-[9px] tabular-nums">
              {rankedRows.length} {rankedRows.length === 1 ? 'strategy' : 'strategies'}
            </span>
          }
        />
      </div>

      {/* Table header row — uppercase 11px tracking-wider dim caption
          strip. Every numeric column header is a sortable button with a
          SortIndicator glyph (▲/▼ on active, empty 10px slot on
          inactive so the layout doesn't shift on sort toggle). */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)] border-b border-[var(--border)]">
        <span className="w-5 text-center shrink-0">#</span>
        <span className="flex-1">Strategy</span>
        <button
          type="button"
          onClick={() => handleSort('win_rate')}
          className="flex items-center justify-end w-12 shrink-0 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Sort by win rate"
        >
          Win
          <SortIndicator active={sortBy === 'win_rate'} ascending={sortAsc} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('profit_factor')}
          className="flex items-center justify-end w-14 shrink-0 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Sort by profit factor"
        >
          PF
          <SortIndicator active={sortBy === 'profit_factor'} ascending={sortAsc} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('max_drawdown')}
          className="flex items-center justify-end w-14 shrink-0 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Sort by max drawdown"
        >
          DD
          <SortIndicator active={sortBy === 'max_drawdown'} ascending={sortAsc} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('net_pnl')}
          className="flex items-center justify-end w-14 shrink-0 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Sort by net P&L"
        >
          P&L
          <SortIndicator active={sortBy === 'net_pnl'} ascending={sortAsc} />
        </button>
        <button
          type="button"
          onClick={() => handleSort('score')}
          className="flex items-center justify-end w-12 shrink-0 hover:text-[var(--text-primary)] transition-colors"
          aria-label="Sort by risk-adjusted score"
        >
          Score
          <SortIndicator active={sortBy === 'score'} ascending={sortAsc} />
        </button>
      </div>

      {/* Rows — each row carries a rank badge (gold/silver/bronze for
          top-3, muted for the rest) + the strategy name + tabular-nums
          numeric cells (closed trades, win rate, profit factor, max
          drawdown, net P&L, risk-adjusted score). Row hover lifts the
          background AND renders a left-edge accent bar (gold for #1,
          silver for #2, bronze for #3, cyan for the rest) via inset
          shadow so the trader can read across a wide row without
          losing position. */}
      <div className="p-2.5 space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
        {sortedRanked.map(({ row: r, originalRank }) => {
          const badge = RANK_BADGE[originalRank] ?? MUTED_RANK_BADGE
          const medal =
            originalRank === 1 ? '🥇' :
            originalRank === 2 ? '🥈' :
            originalRank === 3 ? '🥉' :
            String(originalRank)
          const winTone: Tone = r.win_rate >= 0.5 ? 'good' : r.win_rate >= 0.4 ? 'warn' : 'fail'
          const pnlTone: Tone = r.net_pnl >= 0 ? 'good' : 'fail'
          const scoreTone: Tone = r.risk_adjusted_score >= 0 ? 'good' : 'fail'
          const rankTone = originalRank === 1 ? 'good' : originalRank === 2 ? 'neutral' : originalRank === 3 ? 'warn' : 'neutral'
          return (
            <div
              key={r.strategy}
              className={`group flex items-center gap-2 text-xs bg-[var(--bg-page)] px-2.5 py-1.5 rounded border border-[var(--border)] hover:bg-cyan-500/[0.04] hover:border-cyan-500/30 transition-colors ${badge.rowHover}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold tabular-nums shrink-0 ${badge.badge}`}
                  data-tone={rankTone}
                  aria-label={`Rank ${originalRank}`}
                  title={`Rank ${originalRank} of ${rankedRows.length}`}
                >
                  {medal}
                </span>
                <span
                  className="truncate font-semibold text-[var(--text-primary)] text-[11px]"
                  title={r.strategy}
                >
                  {r.strategy}
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className="text-[10px] text-[var(--text-secondary)] mono tabular-nums"
                  title={`${r.closed_trades} closed trades`}
                >
                  {r.closed_trades}W
                </span>
                <span
                  className={`mono text-[11px] font-medium tabular-nums ${TONE[winTone].text}`}
                  data-tone={winTone}
                  title={`Win rate ${(r.win_rate * 100).toFixed(1)}%`}
                >
                  {(r.win_rate * 100).toFixed(0)}%
                </span>
                {r.profit_factor !== null ? (
                  <span className="badge badge-blue text-[9px] tabular-nums">
                    PF {r.profit_factor.toFixed(2)}
                  </span>
                ) : (
                  <span className="badge badge-dim text-[9px]">PF —</span>
                )}
                <span
                  className={`mono text-[10px] tabular-nums ${r.max_drawdown < 0 ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}
                  data-tone={r.max_drawdown < 0 ? 'fail' : 'neutral'}
                  title={`Max drawdown $${r.max_drawdown.toFixed(2)}`}
                >
                  DD ${r.max_drawdown.toFixed(2)}
                </span>
                <span
                  className={`mono text-[10px] font-medium tabular-nums ${TONE[pnlTone].text}`}
                  data-tone={pnlTone}
                  title={`Net P&L $${r.net_pnl.toFixed(2)}`}
                >
                  {r.net_pnl >= 0 ? '+' : '-'}${Math.abs(r.net_pnl).toFixed(2)}
                </span>
                <span
                  className={`mono font-bold text-xs tabular-nums ${TONE[scoreTone].text}`}
                  data-tone={scoreTone}
                  title={`Risk-adjusted score ${r.risk_adjusted_score.toFixed(2)}`}
                >
                  {r.risk_adjusted_score >= 0 ? '+' : ''}{r.risk_adjusted_score.toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

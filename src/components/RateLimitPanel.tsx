// components/RateLimitPanel.tsx — Rate Limit Analytics Dashboard (W14-7)
//
// Surfaces the in-memory ``RateLimitTracker`` snapshot emitted by
// ``GET /api/rate-limit/stats`` (registered in ``api/server.py``). The
// panel surfaces five views of the same underlying data:
//
//   1. KPI cards     — total hits (last hour), top endpoint, top client,
//                       hit rate (hits/min).
//   2. Endpoint bar  — `PnLBarChart` of hits-by-endpoint (top 20).
//   3. Per-min line  — `Sparkline` of hits-per-minute over the last hour.
//   4. Top endpoints — table of most-rate-limited routes with counts.
//   5. Top clients   — table of client IPs with the most hits.
//
// W57-d — Applied the W51-2d design-system vocabulary (Tone system,
// PulseDot, SectionHeader, ShimmerBlock, KpiTile, PolishedEmptyState,
// PolishedErrorState) for visual consistency with the MLPanel /
// ExecutionQualityPanel / DatabaseStatusPanel / ObservabilityPanel
// redesign family. All existing functionality, class names, test
// contracts, aria-labels, and API calls are preserved.
//
// Visual language mirrors ObservabilityPanel.tsx (dark `var(--bg-surface)` card
// surface, `var(--border)` borders, `var(--text-primary)` primary text). Polls every
// 30s and pauses when the document is hidden (same visibility-aware
// pattern used across the W8–W13 panels).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import {
  Activity,
  RefreshCw,
  AlertCircle,
  Inbox,
  TrendingUp,
  Globe,
  Server,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { PnLBarChart, Sparkline, chartTheme } from '@/components/charts'

// ────────────────────────────────────────────────────────────────────────────
// Types — mirror the JSON shape returned by api/server.py::rate_limit_stats
// ────────────────────────────────────────────────────────────────────────────

interface RateLimitStats {
  total_hits: number
  hits_per_minute_rate: number
  hits_by_endpoint: Record<string, number>
  hits_by_client: Record<string, number>
  hits_per_minute: Record<string, number>
  top_endpoints: Record<string, number>
}

// ────────────────────────────────────────────────────────────────────────────
// W51-2d Tone system (mirror of MLPanel / DatabaseStatusPanel /
// ExecutionQualityPanel) — self-contained Tailwind class strings so
// Tailwind 4's content scanner picks them up. Used by the KpiTile,
// PulseDot, SectionHeader icon, row-hover accent bars, and tone-tinted
// limit-status badges.
// ────────────────────────────────────────────────────────────────────────────

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
  /** Row-hover left-edge accent bar (inset shadow). */
  rowHover: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10', rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.55)]' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10',   rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10',     rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.55)]' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10',    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',      halo: '',                       rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map a hit-count to a tone so rows + badges convey severity at a glance:
 *  0 hits → good (no rate-limiting), 1–5 → warn (some rate-limiting),
 *  6+ → poor (heavy rate-limiting). Used by the EndpointRow /
 *  ClientRow hover accent + the data-tone attribute for downstream CSS. */
function countTone(count: number): Tone {
  if (count <= 0) return 'good'
  if (count <= 5) return 'warn'
  return 'poor'
}

/** Map total_hits to a tone so the Total Hits KpiTile reads the
 *  panel's overall health: 0 → good, 1–20 → warn, 21+ → poor. */
function totalTone(total: number): Tone {
  if (total <= 0) return 'good'
  if (total <= 20) return 'warn'
  return 'poor'
}

/** Map hits-per-minute rate to a tone: 0 → good, ≤1 → warn, >1 → poor. */
function rateTone(rate: number): Tone {
  if (rate <= 0) return 'good'
  if (rate <= 1) return 'warn'
  return 'poor'
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US')
}

function formatRate(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)} / min`
}

function formatRelativeTime(epochMs: number | null): string {
  if (epochMs == null) return '—'
  const diff = Date.now() - epochMs
  if (diff < 0) return 'just now'
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function shortEndpoint(ep: string, maxLen = 36): string {
  if (!ep) return '—'
  if (ep.length <= maxLen) return ep
  // Keep the leading /api/<resource> and trail with ellipsis.
  return `${ep.slice(0, maxLen - 1)}…`
}

function shortIp(ip: string): string {
  if (!ip) return '—'
  return ip
}

// ────────────────────────────────────────────────────────────────────────────
// W51-2d design-system sub-components (private to this panel)
// ────────────────────────────────────────────────────────────────────────────

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// `animate-ping` is Tailwind's built-in pulse. Pulses when `refreshing` is
// true so the trader can tell at a glance that the 30s poller is alive.
function PulseDot({ tone, pulse = true }: { tone: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      )}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
  )
}

// ── SectionHeader — icon + uppercase title + optional dim description ────────
// Mirrors the MLPanel / DatabaseStatusPanel / ExecutionQualityPanel
// SectionHeader so the rate-limit panel reads as part of the same premium
// trading-terminal family.
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
      <span className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
        {title}
      </span>
      {description && (
        <span className="text-[9px] text-[var(--text-secondary)] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── ShimmerBlock — thin skeleton-line-sm placeholder ────────────────────────
// Can be sized via the className prop. aria-hidden so screen readers
// don't pick it up. Mirrors MLPanel / DatabaseStatusPanel's ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: Tone
  /** Quality-bar fill [0..100]. 0 / undefined = no bar rendered. */
  quality?: number
  title?: string
  /** Preserve the legacy `accentClass` prop name for backwards-compat —
   *  when supplied it overrides the tone-derived text colour. */
  accentClass?: string
}

// W57-d — KpiTile replaces the legacy KpiCard. Preserves the
// `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` class hooks (so
// downstream CSS still applies) AND accepts the same `label` / `value` /
// `hint` / `icon` / `accentClass` props so the W14-7 test contracts
// (`getByText('Total Hits (1h)')`, `getByText('42')`, `getByText('0.70 / min')`,
// `getAllByText('/api/orders')`, `getAllByText('127.0.0.1')`) still resolve.
function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  quality,
  title,
  accentClass,
}: KpiTileProps) {
  const cfg = tone ? TONE[tone] : null
  const cardCls = cfg
    ? `kpi-card relative rounded p-2.5 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors hover:border-[var(--border-strong)]`
    : 'kpi-card relative rounded p-2.5 border border-[var(--border)] bg-[var(--bg-page)] overflow-hidden transition-colors hover:border-[var(--border-strong)]'
  return (
    <div className={cardCls} title={title} data-tone={tone ?? 'neutral'}>
      <span className={`kpi-label flex items-center gap-1.5 ${cfg ? cfg.label : ''}`}>
        <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`kpi-value mono text-base font-bold tabular-nums mt-0.5 truncate ${accentClass ?? ''} ${cfg ? cfg.text : ''}`}
      >
        {value}
      </span>
      {hint && <span className="kpi-sub truncate">{hint}</span>}
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg ? cfg.bar : 'bg-[var(--text-secondary)]'}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

interface EndpointRowProps {
  endpoint: string
  count: number
  max: number
}

function EndpointRow({ endpoint, count, max }: EndpointRowProps) {
  const pct = max > 0 ? Math.min(100, (count / max) * 100) : 0
  const tone = countTone(count)
  const cfg = TONE[tone]
  return (
    <div
      className={`flex items-center gap-2 py-1 px-1.5 rounded border-b border-[var(--border)]/50 last:border-b-0 hover:bg-cyan-500/[0.04] ${cfg.rowHover} transition-shadow`}
      data-tone={tone}
    >
      <div
        className="flex-1 min-w-0 text-[11px] mono text-[var(--text-primary)] truncate tabular-nums"
        title={endpoint}
      >
        {shortEndpoint(endpoint, 48)}
      </div>
      <div className="w-24 h-1.5 bg-[var(--border)] rounded-sm overflow-hidden flex-shrink-0">
        <div
          className={`h-full transition-all duration-300 ${cfg.bar}`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="w-12 text-right text-[11px] mono text-[var(--text-primary)] font-semibold tabular-nums">
        {formatNumber(count)}
      </div>
    </div>
  )
}

interface ClientRowProps {
  ip: string
  count: number
  max: number
}

function ClientRow({ ip, count, max }: ClientRowProps) {
  const pct = max > 0 ? Math.min(100, (count / max) * 100) : 0
  const tone = countTone(count)
  const cfg = TONE[tone]
  return (
    <div
      className={`flex items-center gap-2 py-1 px-1.5 rounded border-b border-[var(--border)]/50 last:border-b-0 hover:bg-cyan-500/[0.04] ${cfg.rowHover} transition-shadow`}
      data-tone={tone}
    >
      <div
        className="flex-1 min-w-0 text-[11px] mono text-[var(--text-primary)] truncate tabular-nums"
        title={ip}
      >
        {shortIp(ip)}
      </div>
      <div className="w-24 h-1.5 bg-[var(--border)] rounded-sm overflow-hidden flex-shrink-0">
        <div
          className={`h-full transition-all duration-300 ${cfg.bar}`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="w-12 text-right text-[11px] mono text-[var(--text-primary)] font-semibold tabular-nums">
        {formatNumber(count)}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// W57-d — Polished loading / empty / error states
// ────────────────────────────────────────────────────────────────────────────

// ── RateLimitSkeleton — structured shimmer loading state ─────────────────────
// Mirrors the loaded panel layout (header + KPI strip + charts row + tables
// row) so the panel doesn't visually jump when the first fetch resolves.
// Preserves the "Rate Limits" title + .spinner element so the W14-7 test
// contracts (`getByText('Rate Limits')` + `.spinner` selector) still
// resolve. role=status + aria-live=polite announce the loading state to
// screen readers; the skeleton placeholders themselves are aria-hidden.
function RateLimitSkeleton() {
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4 space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading rate-limit stats"
      data-testid="rate-limit-loading-skeleton"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <PulseDot tone="warn" />
          <span className="text-sm font-bold text-[var(--text-primary)]">Rate Limits</span>
        </div>
        <span className="spinner" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi-card rounded p-2.5 border border-[var(--border)] bg-[var(--bg-page)] space-y-1.5">
            <ShimmerBlock className="w-1/2" />
            <ShimmerBlock className="w-3/4 !h-4" />
            <ShimmerBlock className="w-2/3 !h-2" />
            <div className="h-0.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full w-1/2 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(161,168,181,0.08) 25%, rgba(161,168,181,0.18) 50%, rgba(161,168,181,0.08) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--bg-page)] p-3 space-y-2">
            <ShimmerBlock className="w-32" />
            <ShimmerBlock className="w-full !h-[220px] !rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--bg-page)] p-3 space-y-2">
            <ShimmerBlock className="w-40" />
            <ShimmerBlock className="w-full" />
            <ShimmerBlock className="w-full" />
            <ShimmerBlock className="w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PolishedEmptyState — Lucide Inbox icon + preserved title ────────────────
// Preserves the existing visual identity (Inbox icon + "No rate-limit hits
// in the last hour" title + policy reference badges + "Check again" button).
// role=status preserved. W57-d adds a SectionHeader so the empty state
// reads as part of the same premium redesign family.
function RateLimitEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4"
      data-testid="rate-limit-empty-state"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <PulseDot tone="good" pulse={false} />
            <span className="text-sm font-bold text-[var(--text-primary)]">Rate Limits</span>
            <span className="badge badge-dim text-[9.5px]">30s poll</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Per-route throttle analytics · last 1h window
          </p>
        </div>
      </div>
      <div
        className="empty-state flex-1 flex flex-col items-center justify-center gap-2 py-12"
        role="status"
      >
        <Inbox
          className="empty-state-icon text-[var(--text-secondary)]"
          size={28}
          aria-hidden="true"
        />
        <div className="empty-state-title text-sm font-semibold">
          No rate-limit hits in the last hour
        </div>
        <div className="empty-state-desc text-[11px] text-center max-w-sm">
          The dashboard will surface 429 hits here as soon as a client
          exceeds a route's per-minute allowance. Routes are limited
          by the policy shown below.
        </div>
        <div className="mt-3 flex flex-wrap gap-2 justify-center max-w-md">
          {[
            { k: 'Read', v: '120/min' },
            { k: 'Write', v: '30/min' },
            { k: 'Heavy', v: '5/min' },
            { k: 'Trade', v: '20/min' },
            { k: 'Arb', v: '10/min' },
            { k: 'Live', v: '3/min' },
          ].map((p) => (
            <span
              key={p.k}
              className="badge badge-dim mono text-[10px]"
              title={`${p.k} limit: ${p.v}`}
            >
              {p.k}: {p.v}
            </span>
          ))}
        </div>
        <button
          onClick={onRetry}
          className="btn btn-ghost btn-sm mt-3 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Check again
        </button>
      </div>
    </div>
  )
}

// ── PolishedErrorState — red-tinted error card with Retry ───────────────────
// Mirrors the MLPanel / DatabaseStatusPanel / ExecutionQualityPanel error
// card styling. The "Rate-limit stats endpoint unavailable" title is
// preserved verbatim so the existing test contract resolves. The Retry
// button preserves the accessible name "Retry" so the test contract
// (`getByRole('button', { name: /retry/i })`) still resolves. role=alert
// preserved.
function RateLimitErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4"
      data-testid="rate-limit-error-card"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <PulseDot tone="poor" pulse={false} />
          <span className="text-sm font-bold text-[var(--text-primary)]">Rate Limits</span>
          <span className="badge badge-red text-[9.5px]">Offline</span>
        </div>
      </div>
      <div
        className="error-state flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        role="alert"
        data-testid="rate-limit-error-msg"
      >
        <AlertCircle
          className="error-state-icon text-[#f87171]"
          size={28}
          aria-hidden="true"
        />
        <div className="error-state-title text-sm font-semibold">
          Rate-limit stats endpoint unavailable
        </div>
        <div className="error-state-desc mono text-[10px] max-w-md text-center break-all">
          {message}
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="btn btn-ghost btn-sm mt-2 text-xs border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100"
          data-testid="rate-limit-error-retry"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          Retry
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main panel
// ────────────────────────────────────────────────────────────────────────────

export default function RateLimitPanel() {
  const [stats, setStats] = useState<RateLimitStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const fetchingRef = useRef(false)

  // ── Fetcher ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (silent = false) => {
    // Guard against overlapping fetches when the 30s interval fires
    // while a manual Refresh is still in flight.
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (!silent) setRefreshing(true)
    try {
      const res = await apiFetch('/api/rate-limit/stats')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      const data = (await res.json()) as RateLimitStats
      setStats(data)
      setError(null)
      setLastUpdated(Date.now())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      fetchingRef.current = false
      if (!silent) setRefreshing(false)
      setLoading(false)
    }
  }, [])

  // ── Initial fetch + visibility-aware polling ─────────────────────────
  useEffect(() => {
    fetchStats()
    let timer: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (timer) return
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        fetchStats(true)
      }, POLL_INTERVAL_MS)
    }
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stopPolling()
      } else {
        // Refresh immediately on tab regain so the user doesn't see a
        // stale snapshot for up to 30s after switching back.
        fetchStats(true)
        startPolling()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    startPolling()
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      stopPolling()
    }
  }, [fetchStats])

  // ── Derived data for charts ──────────────────────────────────────────
  const endpointBarData = useMemo(() => {
    if (!stats?.hits_by_endpoint) return []
    return Object.entries(stats.hits_by_endpoint).map(([name, value]) => ({
      name: shortEndpoint(name, 24),
      value,
      sub: `${value} hits`,
    }))
  }, [stats])

  const perMinuteSeries = useMemo(() => {
    if (!stats?.hits_per_minute) return []
    // hits_per_minute is keyed "1".."60" where 60 = oldest, 1 = newest.
    // Sort ascending and emit values oldest→newest (left→right) so the
    // Sparkline's last-dot indicator marks the current minute.
    return Object.entries(stats.hits_per_minute)
      .map(([k, v]) => ({ minute: parseInt(k, 10) || 0, hits: v }))
      .sort((a, b) => a.minute - b.minute)
      .map((d) => d.hits)
  }, [stats])

  const topEndpointList = useMemo(() => {
    if (!stats?.hits_by_endpoint) return []
    return Object.entries(stats.hits_by_endpoint)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
  }, [stats])

  const topClientList = useMemo(() => {
    if (!stats?.hits_by_client) return []
    return Object.entries(stats.hits_by_client)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
  }, [stats])

  const maxEndpointCount = topEndpointList[0]?.count ?? 0
  const maxClientCount = topClientList[0]?.count ?? 0

  const topEndpointEntry = topEndpointList[0]
  const topClientEntry = topClientList[0]

  // ── Render: loading skeleton ─────────────────────────────────────────
  if (loading && !stats) {
    return <RateLimitSkeleton />
  }

  // ── Render: hard error (no data yet) ─────────────────────────────────
  if (error && !stats) {
    return (
      <RateLimitErrorState
        message={error}
        onRetry={() => fetchStats()}
      />
    )
  }

  // ── Render: empty state (no hits yet) ────────────────────────────────
  const isEmpty =
    stats != null &&
    stats.total_hits === 0 &&
    Object.keys(stats.hits_by_endpoint ?? {}).length === 0

  if (isEmpty) {
    return <RateLimitEmptyState onRetry={() => fetchStats()} />
  }

  // ── Render: main panel ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap justify-between items-center gap-2 p-4 pb-2 border-b border-[var(--border)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PulseDot tone="warn" pulse={refreshing} />
            <Activity className="w-4 h-4 text-amber-400 flex-shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Rate Limits</h2>
            <span className="badge badge-dim text-[9.5px]">30s poll</span>
            {refreshing && (
              <span className="badge badge-amber text-[9.5px]">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                syncing
              </span>
            )}
            {error && stats && (
              <span
                className="badge badge-red text-[9.5px]"
                title={error}
              >
                stale
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            Per-route throttle analytics · last 1h window ·{' '}
            updated {formatRelativeTime(lastUpdated)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fetchStats()}
            disabled={refreshing}
            className="btn btn-ghost btn-sm flex items-center gap-1.5 text-xs"
            aria-label="Refresh rate-limit stats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Body (scrollable) ─────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin"
        style={{ maxHeight: '100%' }}
      >
        {/* ── KPI cards ──────────────────────────────────────────────── */}
        <section
          aria-label="Rate limit summary KPIs"
          className="grid grid-cols-2 md:grid-cols-4 gap-2.5"
        >
          <KpiTile
            label="Total Hits (1h)"
            value={formatNumber(stats?.total_hits ?? 0)}
            hint="rate-limited requests"
            icon={Zap}
            tone={totalTone(stats?.total_hits ?? 0)}
            accentClass={
              (stats?.total_hits ?? 0) > 0
                ? 'text-amber-400'
                : 'text-[var(--text-primary)]'
            }
            quality={Math.min(100, ((stats?.total_hits ?? 0) / 50) * 100)}
            title={`Total rate-limited requests in the last hour: ${formatNumber(stats?.total_hits ?? 0)}`}
          />
          <KpiTile
            label="Hit Rate"
            value={formatRate(stats?.hits_per_minute_rate ?? 0)}
            hint="hits / minute"
            icon={TrendingUp}
            tone={rateTone(stats?.hits_per_minute_rate ?? 0)}
            accentClass={
              (stats?.hits_per_minute_rate ?? 0) > 1
                ? 'text-red-400'
                : 'text-[var(--text-primary)]'
            }
            quality={Math.min(100, ((stats?.hits_per_minute_rate ?? 0) / 2) * 100)}
            title={`Rate-limited requests per minute: ${formatRate(stats?.hits_per_minute_rate ?? 0)}`}
          />
          <KpiTile
            label="Top Endpoint"
            value={topEndpointEntry ? shortEndpoint(topEndpointEntry.endpoint, 18) : '—'}
            hint={topEndpointEntry ? `${formatNumber(topEndpointEntry.count)} hits` : undefined}
            icon={Server}
            tone={topEndpointEntry ? countTone(topEndpointEntry.count) : 'neutral'}
            accentClass="text-blue-400"
            title={topEndpointEntry ? `Top rate-limited endpoint: ${topEndpointEntry.endpoint} (${formatNumber(topEndpointEntry.count)} hits)` : undefined}
          />
          <KpiTile
            label="Top Client"
            value={topClientEntry ? shortIp(topClientEntry.ip) : '—'}
            hint={topClientEntry ? `${formatNumber(topClientEntry.count)} hits` : undefined}
            icon={Globe}
            tone={topClientEntry ? countTone(topClientEntry.count) : 'neutral'}
            accentClass="text-emerald-400"
            title={topClientEntry ? `Top rate-limited client: ${topClientEntry.ip} (${formatNumber(topClientEntry.count)} hits)` : undefined}
          />
        </section>

        {/* ── Charts row ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Hits by endpoint — PnLBarChart */}
          <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
            <SectionHeader
              icon={Server}
              title="Hits by Endpoint"
              tone="info"
              trailing={
                <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
                  {endpointBarData.length} endpoints
                </span>
              }
            />
            <div className="h-[220px]">
              {endpointBarData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--text-secondary)]">
                  No hits recorded
                </div>
              ) : (
                <PnLBarChart
                  data={endpointBarData}
                  height={220}
                  layout="vertical"
                  showZeroLine={false}
                  successColor={chartTheme.colors.warning}
                  dangerColor={chartTheme.colors.danger}
                  formatValue={(v) => formatNumber(v)}
                  formatTooltip={(d) => (
                    <div style={{ fontSize: 11 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {d.name}
                      </div>
                      <div>{formatNumber(d.value)} hits</div>
                    </div>
                  )}
                />
              )}
            </div>
          </div>

          {/* Hits per minute — Sparkline */}
          <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
            <SectionHeader
              icon={TrendingUp}
              title="Hits per Minute (60m)"
              tone="info"
              trailing={
                <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
                  rate: {formatRate(stats?.hits_per_minute_rate ?? 0)}
                </span>
              }
            />
            <div className="h-[220px] flex items-center justify-center">
              {perMinuteSeries.length < 2 ? (
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Not enough samples for a trend yet
                </div>
              ) : (
                <Sparkline
                  data={perMinuteSeries}
                  color={chartTheme.colors.warning}
                  width="100%"
                  height={220}
                  strokeWidth={1.4}
                  showLastDot
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Tables row ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top endpoints table */}
          <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
            <SectionHeader
              icon={Server}
              title="Top Rate-Limited Endpoints"
              tone="warn"
              trailing={
                <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
                  {topEndpointList.length} shown
                </span>
              }
            />
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--border)]">
              <div className="flex-1 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                Endpoint
              </div>
              <div className="w-24 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-center">
                Share
              </div>
              <div className="w-12 text-right text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                Hits
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              {topEndpointList.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-[var(--text-secondary)]">
                  No endpoints throttled yet
                </div>
              ) : (
                topEndpointList.map(({ endpoint, count }) => (
                  <EndpointRow
                    key={`${endpoint}-${count}`}
                    endpoint={endpoint}
                    count={count}
                    max={maxEndpointCount}
                  />
                ))
              )}
            </div>
          </div>

          {/* Top clients table */}
          <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
            <SectionHeader
              icon={Globe}
              title="Top Rate-Limited Clients"
              tone="warn"
              trailing={
                <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
                  {topClientList.length} shown
                </span>
              }
            />
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--border)]">
              <div className="flex-1 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                Client IP
              </div>
              <div className="w-24 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-center">
                Share
              </div>
              <div className="w-12 text-right text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                Hits
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              {topClientList.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-[var(--text-secondary)]">
                  No clients throttled yet
                </div>
              ) : (
                topClientList.map(({ ip, count }) => (
                  <ClientRow
                    key={`${ip}-${count}`}
                    ip={ip}
                    count={count}
                    max={maxClientCount}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* ── Top requested endpoints (all-requests view) ───────────── */}
        <section className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
          <SectionHeader
            icon={Activity}
            title="Most-Requested Endpoints"
            tone="info"
            description="all-requests view"
          />
          <div className="flex items-center gap-2 pb-1 border-b border-[var(--border)]">
            <div className="flex-1 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
              Endpoint
            </div>
            <div className="w-24 text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-center">
              Share
            </div>
            <div className="w-12 text-right text-[9.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
              Hits
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto scrollbar-thin">
            {(() => {
              const topReqList = stats?.top_endpoints
                ? Object.entries(stats.top_endpoints)
                    .map(([endpoint, count]) => ({ endpoint, count }))
                    .sort((a, b) => b.count - a.count)
                : []
              if (topReqList.length === 0) {
                return (
                  <div className="py-6 text-center text-[11px] text-[var(--text-secondary)]">
                    No requests recorded yet
                  </div>
                )
              }
              const maxReqCount = topReqList[0]?.count ?? 0
              return topReqList.map(({ endpoint, count }) => (
                <EndpointRow
                  key={`req-${endpoint}-${count}`}
                  endpoint={endpoint}
                  count={count}
                  max={maxReqCount}
                />
              ))
            })()}
          </div>
        </section>

        {/* ── Policy reference ───────────────────────────────────────── */}
        <section className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col gap-2">
          <SectionHeader
            icon={Zap}
            title="Rate-Limit Policy"
            tone="neutral"
            description="per-route throttle allowances"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { k: 'Read routes', v: '120/min', desc: 'Generous — allows polling' },
              { k: 'Write routes', v: '30/min', desc: 'POST/PUT/DELETE' },
              { k: 'Heavy routes', v: '5/min', desc: 'ML retrain, backtest' },
              { k: 'Trade routes', v: '20/min', desc: 'Orders, position-close' },
              { k: 'Arbitrage', v: '10/min', desc: 'Auth + heavy' },
              { k: 'Live enable', v: '3/min', desc: 'One-shot escalation' },
            ].map((p) => (
              <div
                key={p.k}
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md p-2 flex flex-col gap-0.5"
              >
                <div className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                  {p.k}
                </div>
                <div className="text-sm font-bold text-amber-400 mono tabular-nums">{p.v}</div>
                <div className="text-[9.5px] text-[var(--text-secondary)]">{p.desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

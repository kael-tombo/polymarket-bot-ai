// components/DatabaseStatusPanel.tsx — Database Status Panel (W21-7 / W56-c polish)
//
// Exposes the live database backend (PostgreSQL vs SQLite) and PG-pool
// health stats so the trader can see at-a-glance whether the system is
// running on the primary PG store or has fallen back to the SQLite
// standby, plus how many times the fallback has fired, the row count /
// on-disk size of each persisted table, and the last 5 connection
// errors. A manual "Retry PG Connection" button lets the operator
// re-arm the PG pool without restarting the bot.
//
// Backend contract (mirrors the AsyncDBPool standby surface in
// `mini-services/polymarket-bot/core/db_pool.py` + `core/async_repositories.py`):
//
//   GET /api/system/db-status
//     → {
//         backend: 'postgresql' | 'sqlite',
//         pg_health: {
//           status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown',
//           uptime_pct: number,
//           avg_latency_ms: number,
//           last_check_epoch: number,
//           consecutive_failures: number,
//           pool_size: number,
//           pool_in_use: number,
//         } | null,
//         fallback_counter: number,
//         tables: Array<{ name: string; row_count: number; size_mb: number;
//                         database: 'pg' | 'sqlite'; last_modified: number }>,
//         recent_errors: Array<{ timestamp: number; error: string;
//                                retry_attempt: number; backend: string }>,
//         generated_at: number,
//       }
//
//   POST /api/system/db-retry
//     → { success: boolean; backend: string; message: string; attempted_at: number }
//
// Visual language mirrors SystemHealthView.tsx + ObservabilityPanel.tsx
// (dark `var(--bg-surface)` card surface, `var(--border)` borders, `var(--text-primary)` primary
// text) but uses shadcn/ui primitives (Card, Badge, Table, Button) per
// the W21-7 spec. Polls every 15s and pauses when the document is
// hidden (matches the visibility-aware polling pattern established
// by ObservabilityPanel.tsx).
//
// W56-c — Premium visual polish pass, aligned with the W51-2d MLPanel
// / AIMLCommandCenter / W54-e MLValidationPanel / W55-a LeaderboardPanel
// / W55-d ExecutionQualityPanel redesign family:
//   1. KpiTile pattern for DB metrics (Active Backend, PG Uptime, SQLite
//      Fallbacks, Total Rows) — tone-tinted bg + uppercase 9px label +
//      large 16px tabular-nums value + quality bar + Lucide icon glyph.
//   2. Shimmer skeleton loading state mirroring the loaded panel layout
//      (header + KPI strip + PG health grid + tables + recent errors)
//      so the panel doesn't visually jump when the first fetch resolves.
//   3. Polished empty state with Lucide Database icon + message.
//   4. Section headers with icon + uppercase title (PG Connection Health
//      → Server, Database Tables → Layers, Recent Connection Errors →
//      AlertTriangle).
//   5. Refined health status display — PulseDot (Tailwind animate-ping
//      halo) + tone-coloured label so the operator reads healthy /
//      degraded / unhealthy / unknown at a glance.
//   6. Tone-coloured health indicators (green connected / amber degraded
//      / red unhealthy / dim unknown).
//   7. Refined table stats display — uppercase headers, row-hover accent
//      bar via inset shadow, tabular-nums on every numeric column.
//   8. Error state — polished error card with AlertTriangle icon +
//      message + dim detail + Retry button (RefreshCw glyph).
// All existing functionality, class names, API calls, polling, visibility
// pause/resume, accessibility roles/labels, test-matched strings, and
// the 'use client' directive preserved.

'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  RefreshCw,
  Server,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────────────────────
// Types — mirror the JSON shape documented above
// ────────────────────────────────────────────────────────────────────────────

export type DbBackend = 'postgresql' | 'sqlite'
export type PgHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface PgHealthReport {
  status: PgHealthStatus
  uptime_pct: number
  avg_latency_ms: number
  last_check_epoch: number
  consecutive_failures: number
  pool_size: number
  pool_in_use: number
}

export interface DbTableStat {
  name: string
  row_count: number
  size_mb: number
  database: 'pg' | 'sqlite'
  last_modified: number
}

export interface DbErrorEntry {
  timestamp: number
  error: string
  retry_attempt: number
  backend: string
}

export interface DatabaseStatusPayload {
  backend: DbBackend
  pg_health: PgHealthReport | null
  fallback_counter: number
  tables: DbTableStat[]
  recent_errors: DbErrorEntry[]
  generated_at: number
}

export interface DatabaseRetryResult {
  success: boolean
  backend: string
  message: string
  attempted_at: number
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000
const STATUS_ENDPOINT = '/api/system/db-status'
const RETRY_ENDPOINT = '/api/system/db-retry'

// ────────────────────────────────────────────────────────────────────────────
// W51-2d Tone system (mirror of MLPanel / ExecutionQualityPanel)
// ────────────────────────────────────────────────────────────────────────────
// Self-contained Tailwind class strings (no dynamic concatenation) so
// Tailwind 4's content scanner picks them up. Used by the KpiTile, the
// PulseDot, the SectionHeader icon, the PG health-grid cells, the
// per-table row hover accent, and the retry result banner.

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
  good:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10',  rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.55)]' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10',   rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10',     rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.55)]' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10',    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',      halo: '',                       rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map a PgHealthStatus to a Tone for the health-grid + PulseDot + KPI
 *  tile accent. healthy → good (emerald), degraded → warn (amber),
 *  unhealthy → poor (red), unknown → neutral (dim slate). */
function healthTone(status: PgHealthStatus): Tone {
  if (status === 'healthy') return 'good'
  if (status === 'degraded') return 'warn'
  if (status === 'unhealthy') return 'poor'
  return 'neutral'
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────────────────

function formatBytes(mb: number | undefined | null): string {
  if (mb === undefined || mb === null || Number.isNaN(mb)) return '—'
  if (mb < 1 / 1024) return `${(mb * 1024 * 1024).toFixed(0)} B`
  if (mb < 1) return `${(mb * 1024).toFixed(1)} KB`
  if (mb < 1024) return `${mb.toFixed(2)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatRowCount(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString()
}

function formatRelativeTime(epoch: number | undefined | null): string {
  if (!epoch) return '—'
  const diff = Date.now() / 1000 - epoch
  if (diff < 0) return 'just now'
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function formatUptimePct(pct: number | undefined | null): string {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return '—'
  return `${pct.toFixed(2)}%`
}

function formatLatency(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '—'
  return `${ms.toFixed(1)}ms`
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// `animate-ping` is Tailwind's built-in pulse. Reduced-motion users see a
// static dot (the halo's ping is decorative; the dot's colour still conveys
// state). Used by the live PG-connection-status readout in the Pool
// Telemetry SectionHeader.
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
// Mirrors the MLPanel / MLValidationPanel / ExecutionQualityPanel
// SectionHeader so the database panel reads as part of the same premium
// trading-terminal family. Used by the PG Connection Health (Pool
// Telemetry), Database Tables (Persisted Tables), and Recent Connection
// Errors (Connection Error Log) sections.
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
// don't pick it up. Mirrors MLPanel's ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

interface BackendBadgeProps {
  backend: DbBackend
}

function BackendBadge({ backend }: BackendBadgeProps) {
  const isPg = backend === 'postgresql'
  return (
    <Badge
      variant={isPg ? 'success' : 'warning'}
      className="px-3 py-1.5 text-sm font-bold gap-2"
      data-testid="db-backend-badge"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isPg ? 'bg-green-400' : 'bg-amber-400'
        }`}
        aria-hidden="true"
      />
      {isPg ? 'PostgreSQL' : 'SQLite'}
    </Badge>
  )
}

interface HealthBadgeProps {
  status: PgHealthStatus
}

function HealthBadge({ status }: HealthBadgeProps) {
  // healthy → green, degraded → amber, unhealthy → red, unknown → dim
  const variant: 'success' | 'warning' | 'destructive' | 'secondary' =
    status === 'healthy'
      ? 'success'
      : status === 'degraded'
        ? 'warning'
        : status === 'unhealthy'
          ? 'destructive'
          : 'secondary'
  const label =
    status === 'healthy'
      ? 'Healthy'
      : status === 'degraded'
        ? 'Degraded'
        : status === 'unhealthy'
          ? 'Unhealthy'
          : 'Unknown'
  return (
    <Badge variant={variant} className="px-2 py-1 text-xs gap-1.5">
      {status === 'healthy' ? (
        <CheckCircle2 size={12} aria-hidden="true" />
      ) : status === 'unhealthy' ? (
        <XCircle size={12} aria-hidden="true" />
      ) : (
        <AlertTriangle size={12} aria-hidden="true" />
      )}
      {label}
    </Badge>
  )
}

// ── KpiTile — refined KPI card (large value, tone-tinted bg, quality bar) ────
// Mirrors the MLPanel / ExecutionQualityPanel KpiTile sub-component so the
// database metrics read as part of the same premium KPI strip family.
// Preserves the existing `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub`
// class hooks (so downstream CSS still applies) AND the
// `data-testid="db-kpi-card"` attribute (preserved verbatim from the W21-7
// implementation).
interface KpiTileProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon?: LucideIcon
  tone?: Tone
  /** Quality-bar fill [0..100]. 0 / undefined = no bar rendered. */
  quality?: number
}

function KpiTile({
  label,
  value,
  sub,
  valueClass,
  icon: Icon,
  tone,
  quality,
}: KpiTileProps) {
  const cfg = tone ? TONE[tone] : null
  const cardCls = cfg
    ? `kpi-card relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`
    : 'kpi-card relative rounded p-2 border border-[var(--border)] bg-[var(--bg-page)] overflow-hidden transition-colors'
  return (
    <div className={cardCls} data-testid="db-kpi-card" data-tone={tone ?? 'neutral'}>
      <span className={`kpi-label flex items-center gap-1.5 ${cfg ? cfg.label : ''}`}>
        {Icon && <Icon size={11} aria-hidden="true" />}
        {label}
      </span>
      <span
        className={`kpi-value mono text-base font-bold tabular-nums mt-0.5 ${valueClass ?? ''} ${cfg ? cfg.text : ''} leading-tight`}
      >
        {value}
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
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

// ── PolishedEmptyState — Lucide Database icon + title + dim description ──────
// Preserves the .empty-state class hooks (icon / title / desc) so the
// existing CSS rule continues to apply. role=status preserved. The
// "No table statistics available" title + "backend has not reported
// table-level row counts" description are preserved verbatim so the W21-7
// test contracts (`getByText('No table statistics available')` +
// `getByText(/backend has not reported table-level row counts/)`) resolve.
function PolishedEmptyState() {
  return (
    <div className="empty-state py-8" role="status" data-testid="db-tables-empty-state">
      <Database
        className="empty-state-icon text-[var(--text-secondary)]"
        size={28}
        aria-hidden="true"
      />
      <div className="empty-state-title">No table statistics available</div>
      <div className="empty-state-desc">
        The backend has not reported table-level row counts or sizes.
        This is normal when the SQLite standby is empty or when the PG
        pool has not yet mirrored schema to its read replica.
      </div>
    </div>
  )
}

// ── PolishedErrorState — red-tinted error card with Retry ───────────────────
// Mirrors the MLPanel / LeaderboardPanel / ExecutionQualityPanel error card
// styling. The "Database status endpoint unavailable" title is preserved
// verbatim so the existing test contract (`getByText('Database status
// endpoint unavailable')`) resolves. The Retry button preserves the
// aria-label "Retry database status fetch" verbatim. role=alert preserved.
interface ErrorStateProps {
  message: string
  onRetry: () => void
  retrying?: boolean
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      className="error-state p-8"
      role="alert"
      data-testid="db-status-error-card"
    >
      <AlertTriangle
        className="error-state-icon text-[#f87171]"
        size={28}
        aria-hidden="true"
      />
      <div className="error-state-title">Database status endpoint unavailable</div>
      <div className="error-state-desc">{message}</div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2 border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100"
        disabled={retrying}
        aria-label="Retry database status fetch"
        data-testid="db-status-error-retry"
      >
        <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}

// ── DbStatusSkeleton — structured shimmer loading state ─────────────────────
// Mirrors the loaded panel layout (header + KPI strip + PG health card +
// tables card + recent errors card) so the panel doesn't visually jump
// when the first fetch resolves. Uses the design-system `.skeleton-line-sm`
// class from globals.css (which carries the `skeleton-shimmer` keyframe).
// The "Loading Database Status…" caption is preserved verbatim above the
// skeleton rows so the W21-7 test contract (`getByText('Loading Database
// Status…')`) still resolves. The skeleton placeholders themselves are
// aria-hidden (the caption + role=status + aria-live=polite already
// announce the loading state to screen readers).
function DbStatusSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading database status"
      data-testid="db-status-loading-skeleton"
    >
      {/* Skeleton header bar */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
        <ShimmerBlock className="w-4 h-4 !rounded-full" />
        <ShimmerBlock className="w-44 h-3" />
        <div className="ml-auto flex items-center gap-2">
          <ShimmerBlock className="w-12 h-3" />
          <ShimmerBlock className="w-16 h-5 !rounded-md" />
          <ShimmerBlock className="w-16 h-5 !rounded-md" />
        </div>
      </div>
      {/* Skeleton KPI strip — 4 tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="kpi-card rounded p-2 border border-[var(--border)] bg-[var(--bg-page)] space-y-1.5"
            aria-hidden="true"
          >
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
      {/* Skeleton PG Connection Health card */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-page)] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
          <ShimmerBlock className="w-3 h-3 !rounded-full" />
          <ShimmerBlock className="w-40 h-3" />
          <div className="ml-auto">
            <ShimmerBlock className="w-14 h-4 !rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <ShimmerBlock className="w-1/2" />
              <ShimmerBlock className="w-2/3 !h-3.5" />
            </div>
          ))}
        </div>
        <div className="px-3 pb-3 pt-2 mt-2 border-t border-[var(--border)]">
          <ShimmerBlock className="w-32 h-5 !rounded-md" />
        </div>
      </div>
      {/* Skeleton Database Tables card */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-page)] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
          <ShimmerBlock className="w-3 h-3 !rounded-full" />
          <ShimmerBlock className="w-32 h-3" />
          <div className="ml-auto">
            <ShimmerBlock className="w-24 h-2.5" />
          </div>
        </div>
        <div className="px-3 py-2 space-y-1.5" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--border)]"
            >
              <ShimmerBlock className="w-32" />
              <ShimmerBlock className="w-10 h-3 !rounded-md" />
              <div className="ml-auto flex items-center gap-2">
                <ShimmerBlock className="w-8 h-2.5" />
                <ShimmerBlock className="w-10 h-2.5" />
                <ShimmerBlock className="w-12 h-2.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Skeleton Recent Errors card */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-page)] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
          <ShimmerBlock className="w-3 h-3 !rounded-full" />
          <ShimmerBlock className="w-36 h-3" />
        </div>
        <div className="px-3 py-2 space-y-1.5" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-2 rounded border border-[var(--border)] bg-[var(--bg-surface)]"
            >
              <ShimmerBlock className="w-3 h-3 !rounded-full mt-0.5" />
              <div className="flex-1 space-y-1">
                <ShimmerBlock className="w-3/4" />
                <ShimmerBlock className="w-1/2 !h-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main panel
// ────────────────────────────────────────────────────────────────────────────

export default function DatabaseStatusPanel() {
  const [status, setStatus] = useState<DatabaseStatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryResult, setRetryResult] = useState<DatabaseRetryResult | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const r = await apiFetch(STATUS_ENDPOINT)
      if (r.ok) {
        const json = (await r.json()) as DatabaseStatusPayload
        setStatus(json)
        setError(null)
      } else {
        setError(`GET ${STATUS_ENDPOINT} → ${r.status} ${r.statusText}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + 15s polling, paused when document hidden.
  // The tick itself re-checks `document.hidden` so a visibility flip
  // that happens between the visibilitychange event and the next tick
  // still short-circuits (mirrors RateLimitPanel.tsx + ObservabilityPanel).
  useEffect(() => {
    fetchStatus()
    let timer: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (timer) return
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        fetchStatus()
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
        // Refresh immediately on tab regain so the operator doesn't
        // see a stale snapshot for up to 15s after switching back.
        fetchStatus()
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
  }, [fetchStatus])

  const handleRetryPg = useCallback(async () => {
    setRetrying(true)
    setRetryResult(null)
    try {
      const r = await apiFetch(RETRY_ENDPOINT, { method: 'POST' })
      if (r.ok) {
        const json = (await r.json()) as DatabaseRetryResult
        setRetryResult(json)
        // Re-fetch the status immediately so the operator sees the
        // post-retry state without waiting for the next poll tick.
        await fetchStatus()
      } else {
        setRetryResult({
          success: false,
          backend: 'unknown',
          message: `POST ${RETRY_ENDPOINT} → ${r.status} ${r.statusText}`,
          attempted_at: Date.now() / 1000,
        })
      }
    } catch (e) {
      setRetryResult({
        success: false,
        backend: 'unknown',
        message: e instanceof Error ? e.message : String(e),
        attempted_at: Date.now() / 1000,
      })
    } finally {
      setRetrying(false)
    }
  }, [fetchStatus])

  const handleManualRefresh = useCallback(() => {
    fetchStatus()
  }, [fetchStatus])

  // ── Derived display values ──────────────────────────────────────────────

  const backend = status?.backend ?? 'sqlite'
  const pgHealth = status?.pg_health ?? null
  const healthStatus: PgHealthStatus = pgHealth?.status ?? 'unknown'
  const healthT = healthTone(healthStatus)
  const fallbackCounter = status?.fallback_counter ?? 0
  const tables = status?.tables ?? []
  const recentErrors = status?.recent_errors ?? []

  const totalRows = useMemo(
    () => tables.reduce((sum, t) => sum + (t.row_count ?? 0), 0),
    [tables],
  )
  const totalSizeMb = useMemo(
    () => tables.reduce((sum, t) => sum + (t.size_mb ?? 0), 0),
    [tables],
  )

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading && !status) {
    return (
      <div
        className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden"
        role="status"
        aria-live="polite"
        aria-label="Loading database status…"
        data-testid="database-status-panel"
      >
        <div className="card-header px-3.5 py-2.5 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--bg-page)]/80">
          <span className="spinner" aria-hidden="true" />
          <span className="text-xs font-bold text-[var(--text-primary)] tracking-wide">
            Loading Database Status…
          </span>
        </div>
        <DbStatusSkeleton />
      </div>
    )
  }

  if (error && !status) {
    return (
      <div
        className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4"
        data-testid="database-status-panel"
      >
        <ErrorState message={error} onRetry={handleManualRefresh} />
      </div>
    )
  }

  // ── Per-KPI tone derivations (so each tile reads pass/warn/fail at a glance) ──
  const backendTone: Tone = backend === 'postgresql' ? 'good' : 'warn'
  const uptimeTone: Tone = !pgHealth
    ? 'neutral'
    : pgHealth.uptime_pct >= 99
      ? 'good'
      : pgHealth.uptime_pct >= 90
        ? 'warn'
        : 'poor'
  const fallbackTone: Tone =
    fallbackCounter === 0 ? 'good' : fallbackCounter < 5 ? 'warn' : 'poor'
  const rowsTone: Tone = tables.length === 0 ? 'neutral' : 'info'

  // Quality-bar fills (clamped 0–100) for each KPI tile.
  const uptimeQuality = !pgHealth
    ? 0
    : Math.max(0, Math.min(100, pgHealth.uptime_pct))
  const fallbackQuality =
    fallbackCounter === 0
      ? 100
      : Math.max(0, Math.min(100, 100 - fallbackCounter * 10))
  // Total-rows quality bar mirrors the table-count fill (more tables = fuller bar).
  const rowsQuality = Math.max(0, Math.min(100, tables.length * 20))

  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4 space-y-3 overflow-y-auto scrollbar-thin"
      data-testid="database-status-panel"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[var(--border)] gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Database size={18} className="text-emerald-400" aria-hidden="true" />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Database Backend Status
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            PostgreSQL primary · SQLite fallback · pool health, table stats &amp; recent errors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-dim text-[9.5px]">15s poll</span>
          <BackendBadge backend={backend} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            className="h-7 px-2 text-xs border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
            aria-label="Refresh database status"
            disabled={retrying}
          >
            <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Cards (KpiTile pattern) ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiTile
          label="Active Backend"
          value={backend === 'postgresql' ? 'PostgreSQL' : 'SQLite'}
          sub={
            backend === 'postgresql'
              ? 'Primary PG pool active'
              : 'Fallback SQLite active'
          }
          valueClass={
            backend === 'postgresql'
              ? 'text-green-400'
              : 'text-amber-400'
          }
          icon={Server}
          tone={backendTone}
        />
        <KpiTile
          label="PG Uptime"
          value={formatUptimePct(pgHealth?.uptime_pct)}
          sub={
            pgHealth
              ? `Avg ${formatLatency(pgHealth.avg_latency_ms)}`
              : 'PG pool not configured'
          }
          valueClass={
            !pgHealth
              ? 'text-[var(--text-secondary)]'
              : pgHealth.uptime_pct >= 99
                ? 'text-green-400'
                : pgHealth.uptime_pct >= 90
                  ? 'text-amber-400'
                  : 'text-red-400'
          }
          icon={Activity}
          tone={uptimeTone}
          quality={uptimeQuality}
        />
        <KpiTile
          label="SQLite Fallbacks"
          value={formatRowCount(fallbackCounter)}
          sub={
            fallbackCounter === 0
              ? 'No fallbacks recorded'
              : 'Fallbacks to SQLite'
          }
          valueClass={
            fallbackCounter === 0
              ? 'text-green-400'
              : fallbackCounter < 5
                ? 'text-amber-400'
                : 'text-red-400'
          }
          icon={AlertTriangle}
          tone={fallbackTone}
          quality={fallbackQuality}
        />
        <KpiTile
          label="Total Rows"
          value={formatRowCount(totalRows)}
          sub={`${formatBytes(totalSizeMb)} across ${tables.length} tables`}
          valueClass="text-emerald-400"
          icon={Layers}
          tone={rowsTone}
          quality={rowsQuality}
        />
      </div>

      {/* ── PG Connection Health ──────────────────────────────────────── */}
      <Card className="bg-[var(--bg-page)] border-[var(--border)] py-0 gap-0">
        <CardHeader className="px-3 py-2.5 border-b border-[var(--border)]">
          <CardTitle className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Server size={12} className="text-green-400" aria-hidden="true" />
            PostgreSQL Connection Health
            {pgHealth && <HealthBadge status={healthStatus} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-3 space-y-2">
          {/* SectionHeader with PulseDot — live connection status */}
          <SectionHeader
            icon={Activity}
            title="Pool Telemetry"
            description={
              pgHealth
                ? `live · last check ${formatRelativeTime(pgHealth.last_check_epoch)}`
                : 'PG pool not configured'
            }
            tone={pgHealth ? healthT : 'neutral'}
            trailing={
              pgHealth ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] mono text-[var(--text-secondary)]">
                  <PulseDot tone={healthT} pulse={healthStatus === 'healthy'} />
                  <span className={TONE[healthT].text}>
                    {healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1)}
                  </span>
                </span>
              ) : undefined
            }
          />
          {pgHealth ? (
            <div className="grid-kpi text-xs">
              <div data-tone={healthT}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-0.5">
                  Status
                </div>
                <div
                  className={`font-bold tabular-nums ${TONE[healthT].text}`}
                >
                  {healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1)}
                </div>
              </div>
              <div data-tone={uptimeTone}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-0.5">
                  Uptime
                </div>
                <div className={`font-bold mono tabular-nums ${TONE[uptimeTone].text}`}>
                  {formatUptimePct(pgHealth.uptime_pct)}
                </div>
              </div>
              <div data-tone="info">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-0.5">
                  Avg Latency
                </div>
                <div className="font-bold mono tabular-nums text-emerald-400">
                  {formatLatency(pgHealth.avg_latency_ms)}
                </div>
              </div>
              <div data-tone="neutral">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-0.5">
                  Pool In-Use
                </div>
                <div className="font-bold mono tabular-nums text-[var(--text-primary)]">
                  {pgHealth.pool_in_use}/{pgHealth.pool_size}
                </div>
              </div>
              <div
                data-tone={
                  pgHealth.consecutive_failures === 0
                    ? 'good'
                    : pgHealth.consecutive_failures < 3
                      ? 'warn'
                      : 'poor'
                }
              >
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-0.5">
                  Consecutive Failures
                </div>
                <div
                  className={`font-bold mono tabular-nums ${
                    pgHealth.consecutive_failures === 0
                      ? 'text-green-400'
                      : pgHealth.consecutive_failures < 3
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}
                >
                  {pgHealth.consecutive_failures}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-secondary)] py-2">
              <Clock size={14} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
              PostgreSQL pool is not configured — operating on the SQLite
              standby backend. Last status check:{' '}
              <span className="mono">
                {formatRelativeTime(status?.generated_at ?? 0)}
              </span>
              .
            </div>
          )}

          {/* Manual retry button + result banner */}
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryPg}
              disabled={retrying}
              className="h-7 px-3 text-xs border-[var(--border)] text-[var(--text-primary)] hover:bg-emerald-500/[0.06] hover:border-emerald-500/30 hover:text-white"
              aria-label="Retry PostgreSQL connection"
            >
              {retrying ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Zap size={12} className="text-amber-400" />
              )}
              {retrying ? 'Retrying…' : 'Retry PG Connection'}
            </Button>
            {retryResult && (
              <span
                role="status"
                aria-live="polite"
                className={`text-[11px] mono tabular-nums ${
                  retryResult.success
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
                data-tone={retryResult.success ? 'good' : 'poor'}
              >
                {retryResult.success ? '✓' : '✗'}{' '}
                {retryResult.message} · {formatRelativeTime(retryResult.attempted_at)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Database Tables ───────────────────────────────────────────── */}
      <Card className="bg-[var(--bg-page)] border-[var(--border)] py-0 gap-0">
        <CardHeader className="px-3 py-2.5 border-b border-[var(--border)]">
          <CardTitle className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layers size={12} className="text-emerald-400" aria-hidden="true" />
            Database Tables
            <span className="text-[10px] text-[var(--text-secondary)] font-normal mono tabular-nums">
              ({tables.length} tables · {formatRowCount(totalRows)} rows ·{' '}
              {formatBytes(totalSizeMb)})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2 space-y-2">
          {/* SectionHeader — table count + total size trailing */}
          <SectionHeader
            icon={Layers}
            title="Persisted Tables"
            description={
              tables.length === 0
                ? 'no tables reported'
                : 'row counts + on-disk size per table'
            }
            tone={tables.length === 0 ? 'neutral' : 'info'}
            trailing={
              <span className="text-[10px] mono tabular-nums text-[var(--text-secondary)]">
                {formatBytes(totalSizeMb)} total
              </span>
            }
          />
          {tables.length === 0 ? (
            <PolishedEmptyState />
          ) : (
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--border)] hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] h-8 px-2">
                      Table
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] h-8 px-2">
                      Database
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] h-8 px-2 text-right">
                      Rows
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] h-8 px-2 text-right">
                      Size
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] h-8 px-2">
                      Last Modified
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((t, i) => {
                    const tTone: Tone = t.database === 'pg' ? 'good' : 'warn'
                    return (
                      <TableRow
                        key={`${t.name}-${i}`}
                        className={`border-[var(--border)] hover:bg-emerald-500/[0.04] ${TONE[tTone].rowHover}`}
                        data-tone={tTone}
                      >
                        <TableCell
                          className="mono text-xs text-[var(--text-primary)] px-2 py-1.5"
                          title={`Table ${t.name}`}
                        >
                          {t.name}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge
                            variant={t.database === 'pg' ? 'success' : 'warning'}
                            className="text-[9.5px] px-1.5 py-0"
                          >
                            {t.database === 'pg' ? 'PG' : 'SQLite'}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="mono text-xs text-emerald-400 px-2 py-1.5 text-right tabular-nums"
                          title={`${formatRowCount(t.row_count)} rows`}
                        >
                          {formatRowCount(t.row_count)}
                        </TableCell>
                        <TableCell
                          className="mono text-xs text-[var(--text-secondary)] px-2 py-1.5 text-right tabular-nums"
                          title={`${formatBytes(t.size_mb)} on-disk`}
                        >
                          {formatBytes(t.size_mb)}
                        </TableCell>
                        <TableCell
                          className="mono text-[10px] text-[var(--text-secondary)] px-2 py-1.5 tabular-nums"
                          title={`Last modified ${formatRelativeTime(t.last_modified)}`}
                        >
                          {formatRelativeTime(t.last_modified)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Errors ────────────────────────────────────────────── */}
      <Card className="bg-[var(--bg-page)] border-[var(--border)] py-0 gap-0">
        <CardHeader className="px-3 py-2.5 border-b border-[var(--border)]">
          <CardTitle className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
            <AlertTriangle
              size={12}
              className="text-red-400"
              aria-hidden="true"
            />
            Recent Connection Errors
            <span className="text-[10px] text-[var(--text-secondary)] font-normal mono tabular-nums">
              (last {Math.min(recentErrors.length, 5)})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-2 space-y-2">
          {/* SectionHeader — error count trailing badge */}
          <SectionHeader
            icon={AlertTriangle}
            title="Connection Error Log"
            description={
              recentErrors.length === 0
                ? 'no errors recorded in the active window'
                : 'newest first'
            }
            tone={recentErrors.length === 0 ? 'good' : 'poor'}
            trailing={
              <span
                className={`text-[10px] mono tabular-nums px-1.5 py-0.5 rounded ${
                  recentErrors.length === 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    : 'bg-red-500/10 text-red-400 border border-red-500/25'
                }`}
                data-tone={recentErrors.length === 0 ? 'good' : 'poor'}
              >
                {recentErrors.length} error{recentErrors.length === 1 ? '' : 's'}
              </span>
            }
          />
          {recentErrors.length === 0 ? (
            <div
              className="text-xs text-green-400 py-3 flex items-center gap-2"
              role="status"
              data-tone="good"
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              No connection errors recorded in the active window.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto scrollbar-thin space-y-1.5">
              {recentErrors.slice(0, 5).map((e, i) => (
                <div
                  key={`${e.timestamp}-${i}`}
                  className="flex items-start gap-2 bg-[var(--bg-surface)] p-2 rounded border border-[var(--border)] text-xs hover:bg-red-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.45)] transition-shadow"
                  data-tone="poor"
                >
                  <XCircle
                    size={12}
                    className="text-red-400 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--text-primary)] break-words">{e.error}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mono mt-0.5 tabular-nums">
                      <span>{formatRelativeTime(e.timestamp)}</span>
                      {e.backend && <span> · backend: {e.backend}</span>}
                      {e.retry_attempt > 0 && (
                        <span> · retry #{e.retry_attempt}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="text-[10px] text-[var(--text-secondary)] mono tabular-nums text-center pt-1">
        Generated at {formatRelativeTime(status?.generated_at)} · endpoint:{' '}
        <span className="text-emerald-400">{STATUS_ENDPOINT}</span>
      </div>
    </div>
  )
}

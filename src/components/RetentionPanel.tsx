// components/RetentionPanel.tsx — Data retention / pruning control panel.
//
// Exposes the bounded-storage retention policy implemented in
// `mini-services/polymarket-bot/core/retention.py` over the HTTP surface
// `POST /api/system/prune` (registered by `register_routes(app)`). Mirrors
// the visual style established by `MLPanel.tsx` and `SystemHealthView.tsx`
// (dark `var(--bg-surface)` cards, `var(--border)` borders, `.kpi-card` / `.badge-*` /
// `.data-table` design-system classes from `globals.css`).
//
// W57-a — Polished with the W50-56 design-system layer (Tone system,
// KpiTile, SectionHeader, ShimmerBlock, PulseDot, PolishedEmptyState,
// PolishedErrorCard, RetentionSkeleton). All existing functionality, class
// names, test contracts (W28-3 — 10 tests), polling cadence, fetch error
// logging, API calls, and the `'use client'` directive are preserved
// verbatim.
//
// Backend contract (verified by reading core/retention.py register_routes):
//   POST /api/system/prune        body {target: "all" | "observability" |
//                                  "decision_ledger" | "execution_quality" |
//                                  "audit_events"} (default "all")
//                                  → {timestamp, results: {target:
//                                  {pruned, max_age_hours, db_path, error}},
//                                     total_pruned, success}
//                                     OR  {target, pruned} for a single target
//
// The four retention horizons below mirror the module constants
// OBSERVABILITY_RETENTION_HOURS=168 (7d), DECISION_LEDGER_RETENTION_HOURS=720
// (30d), EXECUTION_QUALITY_RETENTION_HOURS=720 (30d),
// AUDIT_EVENTS_RETENTION_HOURS=2160 (90d). There is no live GET endpoint that
// re-exposes the policy at runtime, so the canonical values are embedded here
// as the source-of-truth display (the env-var-driven defaults in retention.py
// are the only override path; the inline config editor surfaces this honestly
// — local edits are staged for display, persistence requires an env-var
// override at boot).

'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Database,
  Trash2,
  History,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  Server,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react'

import { apiFetch, getApiUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── W57-a Tone vocabulary (5-tone subset of the W51-2d / W53-c family) ─────
// Static class strings so Tailwind 4's JIT scanner picks them up at build
// time. Mirrors the W53-c Tone system (StrategyPerformancePanel) so the
// visual palette stays consistent across the workstation.

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',     halo: '' },
}

// ── Tone helpers ──────────────────────────────────────────────────────────

/**
 * Map a downstream-health-check status onto the Tone palette.
 * Used by the per-store retention-status column:
 *   - good (within policy): UP / HEALTHY / OK / RUNNING / ACTIVE
 *   - warn (near limit):    DEGRADED / WARN / WARNING / SLOW / STALE
 *   - poor (exceeded):      DOWN / CRITICAL / ERROR / FAILED / STOPPED
 *   - neutral:              no probe / unknown
 */
function serviceStatusTone(status: string | undefined): Tone {
  const s = (status || '').toUpperCase()
  if (!s) return 'neutral'
  if (['UP', 'HEALTHY', 'OK', 'RUNNING', 'ACTIVE'].includes(s)) return 'good'
  if (['DEGRADED', 'WARN', 'WARNING', 'SLOW', 'STALE'].includes(s)) return 'warn'
  if (['DOWN', 'CRITICAL', 'ERROR', 'FAILED', 'STOPPED'].includes(s)) return 'poor'
  return 'neutral'
}

function statusBadgeClass(t: Tone): string {
  switch (t) {
    case 'good': return 'badge-green'
    case 'warn': return 'badge-amber'
    case 'poor': return 'badge-red'
    default: return 'badge-dim'
  }
}

/**
 * Tone for the horizon badge — short horizons (≤7d) are "hot" stores
 * (warn) because they prune aggressively, mid horizons (≤30d) are info,
 * long horizons (>30d) are good (stable, low-churn).
 */
function horizonTone(days: number): Tone {
  if (days <= 7) return 'warn'
  if (days <= 30) return 'info'
  return 'good'
}

function horizonBadgeClass(days: number): string {
  switch (horizonTone(days)) {
    case 'warn': return 'badge-amber'
    case 'info': return 'badge-cyan'
    case 'good': return 'badge-green'
    default: return 'badge-dim'
  }
}

// ── W57-a Inline sub-components (kept private to the panel so test mocks
// and ts-isolation stay clean) ─────────────────────────────────────────────

// PulseDot — small status dot with halo + ping animation. `animate-ping` is
// Tailwind's built-in pulse. Reduced-motion users see a static dot (the
// halo's ping is decorative; the dot's colour still conveys state).
function PulseDot({ tone = 'good', pulse = true }: { tone?: Tone; pulse?: boolean }) {
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

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. Mirrors the W53-c / W54-e /
// W55-c SectionHeader pattern. Title rendered in its own <span> so RTL's
// `getByText(...)` matches just the span (preserves the W28-3 test contract
// `getByText('Retention Policy by Store')`).
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
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-primary)] truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[var(--text-secondary)] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[var(--text-secondary)] mono">{trailing}</span>}
    </div>
  )
}

// KpiTile — refined KPI card (large value, tone-tinted bg, optional quality
// bar, optional trend glyph). Mirrors the W53-c / W56-a KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  icon: LucideIcon
  /** Quality bar fill [0..100]. 0 / undefined = no bar rendered. */
  quality?: number
  /** Optional trend glyph ('up' | 'down' | 'flat'). */
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, icon: Icon, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative overflow-hidden border ${cfg.border} ${cfg.bg} transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId ?? 'retention-kpi-tile'}
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className={`kpi-label flex items-center gap-1 ${cfg.label}`}>
          <Icon className="size-3 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </div>
        {trend === 'up' && <TrendingUp className="size-3 text-emerald-400 shrink-0" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 text-red-400 shrink-0" aria-hidden="true" />}
      </div>
      <div
        className={`kpi-value mono tabular-nums ${cfg.text}`}
        data-testid={testId ? `${testId}-value` : 'retention-kpi-value'}
      >
        {value}
      </div>
      <div className="kpi-sub tabular-nums">{hint}</div>
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ShimmerBlock — thin skeleton placeholder that can be sized via the
// className prop. aria-hidden. Mirrors W54-e / W56-a ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// RetentionSkeleton — structured shimmer placeholder mirroring the live
// panel layout (KPI strip + retention policy table + manual prune row +
// prune history table + horizon config grid). role=status + aria-live=
// polite + data-testid="retention-loading-skeleton". The panel header is
// rendered by the parent (outside this skeleton) so the W28-3 test contract
// `getByText(/Data Retention & Pruning/)` resolves during the loading state.
function RetentionSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading data retention & pruning telemetry…"
      data-testid="retention-loading-skeleton"
    >
      {/* KPI strip skeleton */}
      <div className="space-y-2">
        <ShimmerBlock className="w-44" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card space-y-2">
              <ShimmerBlock className="w-2/5" />
              <div className="h-5 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-3/5" />
            </div>
          ))}
        </div>
      </div>

      {/* Retention policy table skeleton */}
      <div className="card p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-48" />
          <ShimmerBlock className="w-20" />
        </div>
        <div className="space-y-2 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card p-2.5 flex items-center justify-between">
              <ShimmerBlock className="w-32" />
              <ShimmerBlock className="w-16" />
              <ShimmerBlock className="w-20" />
              <ShimmerBlock className="w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* Manual prune skeleton */}
      <div className="card p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-32" />
          <ShimmerBlock className="w-24" />
        </div>
        <div className="flex items-end gap-3 pt-1">
          <ShimmerBlock className="w-40 h-9" />
          <ShimmerBlock className="w-24 h-9" />
        </div>
      </div>

      {/* Prune history skeleton */}
      <div className="card p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-36" />
          <ShimmerBlock className="w-20" />
        </div>
        <div className="space-y-2 pt-1">
          <ShimmerBlock className="w-full h-8" />
        </div>
      </div>

      {/* Horizon config skeleton */}
      <div className="card p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-44" />
          <ShimmerBlock className="w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card p-2.5 space-y-2">
              <ShimmerBlock className="w-32" />
              <ShimmerBlock className="w-20 h-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. role=status.
// Used by the prune-history empty branch. Mirrors W56-a / W56-e.
interface PolishedEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  testId?: string
}

function PolishedEmptyState({ icon: Icon, title, description, className = '', testId }: PolishedEmptyStateProps) {
  return (
    <div
      className={`empty-state py-8 ${className}`}
      role="status"
      data-testid={testId ?? 'retention-empty-state'}
    >
      <span className="empty-state-icon" aria-hidden="true">
        <Icon className="w-10 h-10 text-[var(--text-dim)]" strokeWidth={1.5} />
      </span>
      <span className="empty-state-title text-sm font-semibold">{title}</span>
      {description && (
        <span className="empty-state-desc text-xs max-w-sm text-center">{description}</span>
      )}
    </div>
  )
}

// PolishedErrorCard — polished error state with Lucide AlertTriangle + the
// title "Retention backend unreachable" (preserved verbatim as the direct
// text node of a leaf <span> so the W28-3 test contract
// `getByText('Retention backend unreachable')` resolves) + the wrapped
// error string + a Retry button (RefreshCw glyph, calls `onRetry`).
// role=alert. Mirrors W54-a / W55-c / W56-a ErrorCard.
interface PolishedErrorCardProps {
  message: string
  onRetry: () => void
}

function PolishedErrorCard({ message, onRetry }: PolishedErrorCardProps) {
  return (
    <div
      className="error-state p-6"
      role="alert"
      data-testid="retention-error-card"
    >
      <AlertTriangle className="error-state-icon text-[var(--color-red-fg)]" size={28} aria-hidden="true" />
      <span className="error-state-title">Retention backend unreachable</span>
      <span className="error-state-desc" data-testid="retention-error-msg">
        {message}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2"
        data-testid="retention-error-retry"
        aria-label="Retry retention fetch"
      >
        <RefreshCw size={14} className="mr-1.5" />
        Retry
      </Button>
    </div>
  )
}

// ── Static policy source-of-truth (mirrors core/retention.py constants) ────

interface RetentionTarget {
  /** URL target string passed to POST /api/system/prune */
  target: string
  /** Human-readable store label */
  label: string
  /** SQLite table(s) pruned by this target */
  tables: string[]
  /** Default retention horizon in days (env-var override at boot) */
  horizonDays: number
  /** env var name controlling the DB path */
  envVar: string
  /** Default DB file path (when env var unset) */
  defaultDbPath: string
  /** Short rationale for the chosen horizon */
  rationale: string
}

const RETENTION_TARGETS: RetentionTarget[] = [
  {
    target: 'observability',
    label: 'Observability (metrics)',
    tables: ['metrics'],
    horizonDays: 7,
    envVar: 'OBSERVABILITY_DB_PATH',
    defaultDbPath: '/app/data/observability.db',
    rationale: 'High-frequency system snapshots (CPU/mem every ~10s) — fastest-growing store.',
  },
  {
    target: 'decision_ledger',
    label: 'Decision Ledger',
    tables: ['decision_events', 'decision_rejections'],
    horizonDays: 30,
    envVar: 'DECISION_LEDGER_DB_PATH',
    defaultDbPath: '/app/data/decision_ledger.db',
    rationale: 'Full PREDICTION → SIGNAL → RISK_* → ORDER → FILL chain kept for one trade lifecycle.',
  },
  {
    target: 'execution_quality',
    label: 'Execution Quality',
    tables: ['execution_quality'],
    horizonDays: 30,
    envVar: 'EXECUTION_QUALITY_DB_PATH',
    defaultDbPath: '/app/data/execution_quality.db',
    rationale: 'Per-fill slippage / latency / realized-edge rows — drives the 30-day rolling exec view.',
  },
  {
    target: 'audit_events',
    label: 'Audit Events',
    tables: ['audit_events'],
    horizonDays: 90,
    envVar: 'AUDIT_DB_PATH',
    defaultDbPath: '/app/data/audit_trail.db',
    rationale: 'Forensic / compliance window — three months is the typical reconstruction horizon.',
  },
]

// ── Runtime types ───────────────────────────────────────────────────────────

interface PruneAllResult {
  timestamp: number
  results: Record<
    string,
    { pruned: number; max_age_hours: number; db_path: string; error: string | null }
  >
  total_pruned: number
  success: boolean
}

interface PruneSingleResult {
  target: string
  pruned: number
}

interface MarketDbStats {
  db_backend?: string
  size_mb?: number
  snapshots_recorded?: number
  ticks_recorded?: number
  news_items_recorded?: number
  ml_feature_vectors?: number
}

interface SystemHealth {
  status?: string
  checks?: Record<string, { status: string; detail: string }>
  market_db?: MarketDbStats
}

/** One row of client-side prune history (kept in localStorage). */
interface PruneHistoryEntry {
  id: string
  timestamp: number
  target: string
  triggered_by: 'manual' | 'auto-refresh-attempt'
  total_pruned: number
  success: boolean
  per_store?: Record<string, { pruned: number; error: string | null }>
  error?: string
}

const HISTORY_KEY = 'polymarket:retention:prune_history'
const HISTORY_MAX = 25
const POLL_INTERVAL_MS = 60_000

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(mb: number | undefined | null): string {
  if (mb === undefined || mb === null || Number.isNaN(mb)) return '—'
  if (mb < 1 / 1024) return `${(mb * 1024 * 1024).toFixed(0)} B`
  if (mb < 1) return `${(mb * 1024).toFixed(1)} KB`
  if (mb < 1024) return `${mb.toFixed(2)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatRelativeTime(epoch: number): string {
  if (!epoch) return '—'
  const diff = Date.now() / 1000 - epoch
  if (diff < 0) return 'just now'
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function loadHistory(): PruneHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PruneHistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveHistory(entries: PruneHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = entries.slice(0, HISTORY_MAX)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    /* localStorage quota or serialization issue — best-effort, never fatal */
  }
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function RetentionPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pruning, setPruning] = useState(false)
  const [pruneTarget, setPruneTarget] = useState<string>('all')
  const [lastResult, setLastResult] = useState<PruneAllResult | PruneSingleResult | null>(null)
  const [history, setHistory] = useState<PruneHistoryEntry[]>([])
  // Inline config editor — local-only state (backend has no PUT endpoint).
  const [editedHorizons, setEditedHorizons] = useState<Record<string, number>>(() =>
    Object.fromEntries(RETENTION_TARGETS.map((t) => [t.target, t.horizonDays])),
  )

  const fetchHealth = useCallback(async () => {
    try {
      const apiUrl = getApiUrl()
      const r = await apiFetch(`${apiUrl}/api/system/health`)
      if (r.ok) {
        setHealth(await r.json())
        setError(null)
      } else {
        setError(`GET /api/system/health → ${r.status} ${r.statusText}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + 60s polling, paused when document hidden.
  useEffect(() => {
    fetchHealth()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        fetchHealth()
      }, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    start()
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchHealth()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [fetchHealth])

  // Load client-side prune history on mount.
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const triggerPrune = useCallback(
    async (target: string) => {
      setPruning(true)
      const startedAt = Date.now() / 1000
      let entry: PruneHistoryEntry = {
        id: `${startedAt}-${target}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: startedAt,
        target,
        triggered_by: 'manual',
        total_pruned: 0,
        success: false,
      }
      try {
        const apiUrl = getApiUrl()
        const r = await apiFetch(`${apiUrl}/api/system/prune`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        })
        const payload = r.ok ? await r.json() : null
        if (r.ok) {
          if (target === 'all') {
            const all = payload as PruneAllResult
            entry = {
              ...entry,
              success: !!all?.success,
              total_pruned: all?.total_pruned ?? 0,
              per_store: Object.fromEntries(
                Object.entries(all?.results ?? {}).map(([k, v]) => [
                  k,
                  { pruned: v.pruned, error: v.error },
                ]),
              ),
            }
          } else {
            const single = payload as PruneSingleResult
            entry = {
              ...entry,
              success: true,
              total_pruned: single?.pruned ?? 0,
              per_store: { [target]: { pruned: single?.pruned ?? 0, error: null } },
            }
          }
          setLastResult(payload)
        } else {
          entry = { ...entry, success: false, error: `HTTP ${r.status} ${r.statusText}` }
        }
      } catch (e) {
        entry = {
          ...entry,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        }
      } finally {
        setPruning(false)
        const next = [entry, ...loadHistory()].slice(0, HISTORY_MAX)
        setHistory(next)
        saveHistory(next)
        // Refresh table sizes after prune completes.
        fetchHealth()
      }
    },
    [fetchHealth],
  )

  const marketDb = health?.market_db
  const totalHistoryPruned = useMemo(
    () => history.reduce((acc, h) => acc + (h.total_pruned || 0), 0),
    [history],
  )
  const lastSuccessfulPrune = useMemo(
    () => history.find((h) => h.success),
    [history],
  )

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3 p-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-[var(--color-amber-bg)] border border-[var(--color-amber-bd)]">
            <Database className="text-[var(--color-amber-fg)]" size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              Data Retention &amp; Pruning
              <span className="badge badge-dim text-[9px]">Bounded-storage policy</span>
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Four SQLite stores · 7d / 30d / 30d / 90d horizons · <code className="mono text-[10px]">POST /api/system/prune</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-cyan text-[9.5px] tabular-nums">
            <Server size={10} className="mr-1" />
            {history.length} ops logged
          </span>
          {lastSuccessfulPrune && (
            <span className="badge badge-green text-[9.5px]">
              <CheckCircle2 size={10} className="mr-1" />
              Last prune {formatRelativeTime(lastSuccessfulPrune.timestamp)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            disabled={loading}
            className="h-7 text-[11px]"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Body (scrollable) ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {error && !health ? (
          <PolishedErrorCard message={error} onRetry={fetchHealth} />
        ) : loading && !health ? (
          <RetentionSkeleton />
        ) : (
          <>
            {/* ── KPI Row ───────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <SectionHeader
                icon={HardDrive}
                title="Retention Metrics"
                description="storage footprint & session prunes"
                tone="info"
                trailing={`${history.length} ops`}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <KpiTile
                  label="Market DB Size"
                  value={formatBytes(marketDb?.size_mb ?? 0)}
                  hint={marketDb?.db_backend ?? '—'}
                  tone="info"
                  icon={HardDrive}
                  testId="retention-kpi-size"
                />
                <KpiTile
                  label="Snapshots"
                  value={(marketDb?.snapshots_recorded ?? 0).toLocaleString()}
                  hint="market_snapshots table"
                  tone="good"
                  icon={Database}
                  testId="retention-kpi-snapshots"
                />
                <KpiTile
                  label="Ticks"
                  value={(marketDb?.ticks_recorded ?? 0).toLocaleString()}
                  hint="orderbook_ticks table"
                  tone="warn"
                  icon={Clock}
                  testId="retention-kpi-ticks"
                />
                <KpiTile
                  label="Total Pruned"
                  value={totalHistoryPruned.toLocaleString()}
                  hint="rows (this browser session)"
                  tone="neutral"
                  icon={Trash2}
                  testId="retention-kpi-pruned"
                />
              </div>
            </div>

            {/* ── Retention Policy Table ─────────────────────────────────────── */}
            <div className="card">
              <div className="p-3.5 pb-2">
                <SectionHeader
                  icon={ShieldCheck}
                  title="Retention Policy by Store"
                  description="env-var overrides at boot"
                  tone="neutral"
                  trailing={`${RETENTION_TARGETS.length} stores`}
                />
              </div>
              <div className="table-container">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Store</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Tables</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Horizon</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">DB Path</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RETENTION_TARGETS.map((t) => {
                      const checkKey =
                        t.target === 'observability'
                          ? 'observability'
                          : t.target === 'audit_events'
                            ? 'audit'
                            : t.target === 'decision_ledger'
                              ? 'decision_ledger'
                              : 'execution_quality'
                      const check = health?.checks?.[checkKey]
                      const tone = serviceStatusTone(check?.status)
                      return (
                        <TableRow
                          key={t.target}
                          className="hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-colors"
                          data-tone={tone}
                        >
                          <TableCell className="label-col">
                            <div className="flex flex-col">
                              <span className="font-semibold text-[var(--text-primary)]">{t.label}</span>
                              <span className="text-[10px] text-[var(--text-secondary)]">{t.rationale}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              {t.tables.map((tbl) => (
                                <code
                                  key={tbl}
                                  className="mono text-[10px] text-[var(--color-cyan-fg)]"
                                >
                                  {tbl}
                                </code>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`badge ${horizonBadgeClass(t.horizonDays)} text-[10px] tabular-nums`} data-tone={horizonTone(t.horizonDays)}>
                              {t.horizonDays}d
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <code className="mono text-[10px] text-[var(--text-primary)]">
                                {t.defaultDbPath}
                              </code>
                              <code className="mono text-[9px] text-[var(--text-secondary)]">{t.envVar}</code>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1.5 justify-end">
                              <PulseDot tone={tone} pulse={tone !== 'poor'} />
                              {check ? (
                                <span
                                  className={`badge ${statusBadgeClass(tone)} text-[9.5px] tabular-nums`}
                                  title={check.detail}
                                  data-tone={tone}
                                >
                                  {check.status}
                                </span>
                              ) : (
                                <span className="badge badge-dim text-[9.5px]" data-tone="neutral">
                                  no probe
                                </span>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ── Manual Prune ──────────────────────────────────────────────── */}
            <div className="card">
              <div className="p-3.5 pb-2">
                <SectionHeader
                  icon={Trash2}
                  title="Manual Prune"
                  description="irreversible row delete"
                  tone="warn"
                  trailing={
                    lastResult
                      ? `${(lastResult as PruneAllResult).total_pruned ??
                          (lastResult as PruneSingleResult).pruned ?? 0} rows deleted`
                      : undefined
                  }
                />
              </div>
              <div className="p-4 pt-2 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold mb-1 block">
                      Target store
                    </label>
                    <Select value={pruneTarget} onValueChange={setPruneTarget}>
                      <SelectTrigger className="h-9 bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] text-xs">
                        <SelectValue placeholder="Select target" />
                      </SelectTrigger>
                      <SelectContent className="bg-[var(--bg-surface)] border-[var(--border)]">
                        <SelectItem value="all" className="text-[var(--text-primary)] focus:bg-[var(--border)]">
                          <span className="font-semibold">all stores</span>
                          <span className="text-[10px] text-[var(--text-secondary)] ml-2">(run_all_pruning)</span>
                        </SelectItem>
                        {RETENTION_TARGETS.map((t) => (
                          <SelectItem
                            key={t.target}
                            value={t.target}
                            className="text-[var(--text-primary)] focus:bg-[var(--border)]"
                          >
                            {t.label}
                            <span className="text-[10px] text-[var(--text-secondary)] ml-2">
                              ({t.horizonDays}d)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pruning}
                        className="bg-[var(--color-red-bg)] border border-[var(--color-red-bd)] text-[var(--color-red-fg)] hover:bg-[var(--color-red-bd)]"
                      >
                        {pruning ? (
                          <>
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                            Pruning…
                          </>
                        ) : (
                          <>
                            <Trash2 size={14} className="mr-1.5" />
                            Prune Now
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-[var(--text-primary)] flex items-center gap-2">
                          <AlertTriangle size={16} className="text-[var(--color-amber-fg)]" />
                          Confirm immediate prune
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[var(--text-secondary)] text-xs">
                          This will permanently delete rows older than the configured horizon from{' '}
                          <span className="font-semibold text-[var(--color-amber-fg)]">
                            {pruneTarget === 'all' ? 'all four stores' : RETENTION_TARGETS.find((t) => t.target === pruneTarget)?.label}
                          </span>
                          . The operation is irreversible (no soft-delete).
                          {pruneTarget === 'all' ? (
                            <ul className="mt-2 space-y-1 list-disc list-inside">
                              {RETENTION_TARGETS.map((t) => (
                                <li key={t.target} className="text-[11px]">
                                  <code className="mono text-[var(--color-cyan-fg)]">{t.target}</code>{' '}
                                  → rows older than <span className="font-semibold">{t.horizonDays}d</span> ({t.tables.join(', ')})
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-[11px]">
                              Target tables:{' '}
                              <code className="mono text-[var(--color-cyan-fg)]">
                                {RETENTION_TARGETS.find((t) => t.target === pruneTarget)?.tables.join(', ')}
                              </code>
                            </div>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)]">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => triggerPrune(pruneTarget)}
                          className="bg-[var(--color-red-bg)] border border-[var(--color-red-bd)] text-[var(--color-red-fg)] hover:bg-[var(--color-red-bd)]"
                        >
                          <Trash2 size={14} className="mr-1.5" />
                          Delete rows
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {lastResult && (
                  <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 text-xs">
                    <div className="flex items-center gap-2 mb-2">
                      {(lastResult as PruneAllResult).success === true ||
                      (lastResult as PruneAllResult).success === false ? (
                        <CheckCircle2 size={12} className="text-emerald-400" />
                      ) : (
                        <CheckCircle2 size={12} className="text-cyan-400" />
                      )}
                      <span className="font-semibold text-[var(--text-primary)]">
                        Prune result →{' '}
                        {new Date(
                          ((lastResult as PruneAllResult).timestamp ?? Date.now() / 1000) * 1000,
                        ).toLocaleTimeString()}
                      </span>
                    </div>
                    {(lastResult as PruneAllResult).results ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries((lastResult as PruneAllResult).results).map(([k, v]) => {
                          const cellTone: Tone = v.error ? 'poor' : v.pruned > 0 ? 'good' : 'neutral'
                          return (
                            <div
                              key={k}
                              className={`bg-[var(--bg-surface)] border rounded p-2 text-center ${TONE[cellTone].border}`}
                              data-tone={cellTone}
                            >
                              <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">
                                {k}
                              </div>
                              <div className={`mono text-sm font-bold tabular-nums mt-0.5 ${TONE[cellTone].text}`}>
                                {v.pruned.toLocaleString()}
                              </div>
                              {v.error && (
                                <div className="text-[9px] text-red-400 mt-0.5 truncate" title={v.error}>
                                  {v.error}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-cyan-400 mono tabular-nums">
                        Deleted {(lastResult as PruneSingleResult).pruned.toLocaleString()} row(s) from{' '}
                        <code>{(lastResult as PruneSingleResult).target}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Prune History ────────────────────────────────────────────── */}
            <div className="card">
              <div className="p-3.5 pb-2">
                <SectionHeader
                  icon={History}
                  title="Prune History"
                  description="client-side · localStorage"
                  tone="info"
                  trailing={`${history.length} entries`}
                />
              </div>
              {history.length === 0 ? (
                <PolishedEmptyState
                  icon={History}
                  title="No prune operations logged yet"
                  description="Manual and auto-triggered prunes will appear here. History is kept locally per browser."
                  testId="retention-history-empty"
                />
              ) : (
                <div className="table-container max-h-72 overflow-y-auto scrollbar-thin">
                  <Table className="data-table">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">When</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Target</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold text-right">Rows Deleted</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Per-store detail</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => {
                        const rowTone: Tone = h.success ? 'good' : 'poor'
                        return (
                          <TableRow
                            key={h.id}
                            className="hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-colors"
                            data-tone={rowTone}
                          >
                            <TableCell className="label-col">
                              <div className="flex flex-col">
                                <span className="tabular-nums">{new Date(h.timestamp * 1000).toLocaleTimeString()}</span>
                                <span className="text-[10px] text-[var(--text-secondary)]">
                                  {formatRelativeTime(h.timestamp)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="mono text-[11px] text-[var(--color-cyan-fg)]">
                                {h.target}
                              </code>
                            </TableCell>
                            <TableCell className="text-right mono text-cyan-300 font-bold tabular-nums">
                              {h.total_pruned.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {h.per_store ? (
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(h.per_store).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className={`badge ${v.error ? 'badge-red' : 'badge-dim'} text-[9px] tabular-nums`}
                                      title={v.error ?? ''}
                                      data-tone={v.error ? 'poor' : 'neutral'}
                                    >
                                      {k}: {v.pruned}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-[var(--text-secondary)]">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                <PulseDot tone={rowTone} pulse={false} />
                                {h.success ? (
                                  <span className="badge badge-green text-[9.5px]">
                                    <CheckCircle2 size={10} className="mr-1" /> OK
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-red text-[9.5px]"
                                    title={h.error ?? 'failed'}
                                  >
                                    <XCircle size={10} className="mr-1" /> FAIL
                                  </span>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* ── Inline Config Editor (horizon / TTL inputs) ──────────────── */}
            <div className="card">
              <div className="p-3.5 pb-2">
                <SectionHeader
                  icon={ShieldCheck}
                  title="Horizon Configuration"
                  description="read-only · env-var override required"
                  tone="warn"
                  trailing={`${RETENTION_TARGETS.length} horizons`}
                />
              </div>
              <div className="p-4 pt-2 space-y-3">
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Retention horizons are loaded from{' '}
                  <code className="mono text-[10px] text-[var(--color-cyan-fg)]">core/retention.py</code>{' '}
                  module constants at boot. Runtime updates require an env-var
                  override + service restart — there is no live PUT endpoint yet.
                  The form below stages local-only edits for review (no backend
                  write).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {RETENTION_TARGETS.map((t) => {
                    const edited = editedHorizons[t.target] ?? t.horizonDays
                    const dirty = edited !== t.horizonDays
                    const cellTone = dirty ? 'warn' : horizonTone(t.horizonDays)
                    return (
                      <div
                        key={t.target}
                        className={`bg-[var(--bg-page)] border rounded-md p-2.5 transition-colors ${TONE[cellTone].border}`}
                        data-tone={cellTone}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                            {t.label}
                          </span>
                          {dirty && (
                            <span className="badge badge-amber text-[9px]">unsaved</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={3650}
                            value={edited}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10)
                              setEditedHorizons((prev) => ({
                                ...prev,
                                [t.target]: Number.isFinite(v) ? Math.max(1, v) : t.horizonDays,
                              }))
                            }}
                            className="h-8 bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] mono text-xs tabular-nums"
                          />
                          <span className="text-[11px] text-[var(--text-secondary)]">days</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            onClick={() =>
                              setEditedHorizons((prev) => ({ ...prev, [t.target]: t.horizonDays }))
                            }
                            disabled={!dirty}
                          >
                            Reset
                          </Button>
                        </div>
                        <div className="text-[9.5px] text-[var(--text-secondary)] mt-1.5">
                          env: <code className="mono">{t.envVar}</code>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditedHorizons(
                        Object.fromEntries(RETENTION_TARGETS.map((t) => [t.target, t.horizonDays])),
                      )
                    }
                    className="h-8 text-[11px] bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)]"
                  >
                    Reset all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-8 text-[11px] bg-[var(--color-amber-bg)] border-[var(--color-amber-bd)] text-[var(--color-amber-fg)] opacity-70 cursor-not-allowed"
                    title="Backend has no PUT endpoint — env-var override required"
                  >
                    <AlertTriangle size={12} className="mr-1.5" />
                    Apply (no backend endpoint)
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)] text-[10px] text-[var(--text-secondary)]">
        <span>
          Auto-refresh: <span className="mono text-[var(--color-blue-fg)]">60s</span>
          {typeof document !== 'undefined' && document.visibilityState === 'hidden' && ' (paused)'}
        </span>
        <span className="mono">
          {health ? `last sync ${formatRelativeTime(Math.floor(Date.now() / 1000))}` : 'no sync'}
        </span>
      </div>
    </div>
  )
}

// components/SystemHealthView.tsx — Pipeline Health & Subsystem Telemetry
//
// W56-a — Polished with the W50-55 design-system layer (Tone system,
// KpiTile, SectionHeader, ShimmerBlock, PulseDot, PolishedEmptyState,
// PolishedErrorCard). All existing functionality, class names, test
// contracts, polling cadence, fetch error logging, and the 'use client'
// directive are preserved verbatim.
'use client'

import { type ReactNode, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Gauge,
  RefreshCw,
  ServerCog,
  TrendingDown,
  TrendingUp,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'

interface HealthData {
  status: string
  timestamp: number
  poller: {
    tier1_tokens: number
    tier2_tokens: number
    total_tracked: number
    success_rate: number
    latency_ms: number
  }
  ml_engine: {
    active_version: string
    brier_score: number
    psi_drift: number
    drift_status: string
  }
  market_db?: {
    db_backend: string
    db_path: string
    size_mb: number
    snapshots_recorded: number
    ticks_recorded: number
    news_items_recorded: number
    ml_feature_vectors: number
  }
  storage: {
    vector_index_size: number
    audit_trail_backend: string
    market_intelligence_db?: string
    state_persistence: string
  }
  services: Array<{ name: string; status: string; port?: number; frequency?: string }>
}

// ────────────────────────────────────────────────────────────────────────────
// W56-a — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
// ────────────────────────────────────────────────────────────────────────────
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
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',   text: 'text-cyan-400',   bar: 'bg-cyan-500',   dot: 'bg-cyan-400',   label: 'text-cyan-400/80',   halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',     text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '' },
}

// ── Tone helpers ────────────────────────────────────────────────────────────

function successRateTone(v: number): Tone {
  if (!Number.isFinite(v)) return 'neutral'
  if (v >= 99) return 'good'
  if (v >= 95) return 'warn'
  return 'poor'
}

function latencyTone(ms: number): Tone {
  if (!Number.isFinite(ms)) return 'neutral'
  if (ms <= 50) return 'good'
  if (ms <= 150) return 'warn'
  return 'poor'
}

function driftTone(psi: number): Tone {
  if (!Number.isFinite(psi)) return 'neutral'
  if (psi < 0.1) return 'good'
  if (psi < 0.2) return 'warn'
  return 'poor'
}

function serviceStatusTone(status: string): Tone {
  const s = (status || '').toUpperCase()
  if (s === 'HEALTHY' || s === 'UP' || s === 'RUNNING' || s === 'OK' || s === 'ACTIVE') return 'good'
  if (s === 'DEGRADED' || s === 'WARN' || s === 'WARNING' || s === 'SLOW' || s === 'STALE') return 'warn'
  if (s === 'DOWN' || s === 'CRITICAL' || s === 'ERROR' || s === 'FAILED' || s === 'STOPPED') return 'poor'
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

// ────────────────────────────────────────────────────────────────────────────
// W56-a — Inline sub-components (kept private to the panel so test mocks
// and ts-isolation stay clean)
// ────────────────────────────────────────────────────────────────────────────

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
// dim italic description + optional trailing node. Mirrors the W53-c /
// W54-e SectionHeader pattern. Title rendered in its own <span> so RTL's
// `getByText('...')` matches just the span.
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
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#dde1ed] truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[#5a637a] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[#7e8aaa] mono">{trailing}</span>}
    </div>
  )
}

// KpiTile — refined KPI card (large value, tone-tinted bg, quality bar,
// optional trend glyph). Mirrors the W53-c KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  icon: LucideIcon
  /** Quality bar fill [0..100]. 0 or undefined = no bar rendered. */
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
      data-testid={testId ?? 'system-health-kpi-tile'}
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
        data-testid={testId ? `${testId}-value` : 'system-health-kpi-value'}
      >
        {value}
      </div>
      <div className="kpi-sub tabular-nums">{hint}</div>
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[#1f2335] rounded-full mt-1 overflow-hidden">
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
// className prop. aria-hidden. Mirrors W54-e ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// SystemHealthSkeleton — structured shimmer placeholder mirroring the live
// panel layout (header strip + KPI strip + services table). Uses the
// existing `.skeleton-line-sm` / `.skeleton-line-md` classes so the
// existing loading-state test contract resolves. The "Gathering pipeline
// health…" caption is preserved verbatim above the skeleton rows so the
// W22-1 test contract `getByText(/Gathering pipeline health/)` resolves.
function SystemHealthSkeleton() {
  return (
    <div
      className="card flex flex-col bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden p-4 space-y-3 overflow-y-auto scrollbar-thin"
      role="status"
      aria-live="polite"
      data-testid="system-health-loading-skeleton"
    >
      {/* Header skeleton — title preserved verbatim so getByText resolves
          across the loading / loaded branches (mirrors the W55-a
          LeaderboardPanel unified-header pattern). */}
      <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[#1f2335] gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🩺</span>
            <span className="text-sm font-bold text-[#dde1ed]">
              Platform Subsystem Health &amp; Process Telemetry
            </span>
          </div>
          <p className="text-xs text-[#7e8aaa]">
            Order Book Poller, Supervisor Watchdog, TimescaleDB Storage &amp; Risk Sizing ($100 Operating / $200 Ceiling)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShimmerBlock className="w-32 h-5" />
          <ShimmerBlock className="w-32 h-5" />
        </div>
      </div>

      {/* Loading caption — text preserved verbatim so the W22-1 test
          contract `getByText(/Gathering pipeline health/)` resolves. */}
      <div className="text-[10.5px] text-[#7e8aaa] flex items-center gap-2 pb-1">
        <span className="spinner" aria-hidden="true" />
        <span>Gathering pipeline health &amp; supervisor telemetry…</span>
      </div>

      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-card space-y-2">
            <ShimmerBlock className="w-2/5" />
            <div className="h-5 rounded-sm skeleton-line-md" />
            <ShimmerBlock className="w-3/5" />
          </div>
        ))}
      </div>

      {/* Services table skeleton */}
      <div className="card p-3 bg-[#0e1015] border border-[#1f2335] space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1f2335]">
          <ShimmerBlock className="w-44" />
          <ShimmerBlock className="w-20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <ShimmerBlock className="w-32" />
                <ShimmerBlock className="w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. Used by the
// empty / no-health-data branch (when the initial fetch failed or the
// dismiss button has been clicked). role=status preserved.
function PolishedEmptyState() {
  return (
    <div
      className="empty-state py-6"
      role="status"
      data-testid="system-health-empty-state"
    >
      <AlertTriangle
        className="empty-state-icon w-10 h-10 text-amber-400/70"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="empty-state-title text-sm font-semibold text-[#dde1ed]">
        System health telemetry endpoint unavailable.
      </span>
      <span className="empty-state-desc text-xs max-w-sm text-center">
        The platform supervisor couldn&apos;t publish telemetry. The poller will retry automatically every 3&nbsp;seconds.
      </span>
    </div>
  )
}

// PolishedErrorCard — polished error state with Lucide AlertTriangle + the
// full wrapped error string ("System health endpoint unavailable (HTTP 500)"
// or "Network error: ECONNREFUSED") rendered as the card's title (a direct
// text node in a leaf <span> so the W22-1 test contracts
// `getByText(/System health endpoint unavailable/)` +
// `getByText(/HTTP 500/)` + `getByText(/Network error: ECONNREFUSED/)`
// still resolve) + dim detail + Retry button (calls fetchHealth) + the
// existing Dismiss button (aria-label="Dismiss error" preserved verbatim).
// role=alert preserved.
interface PolishedErrorCardProps {
  message: string
  detail?: string
  onRetry: () => void
  onDismiss: () => void
}

function PolishedErrorCard({ message, detail, onRetry, onDismiss }: PolishedErrorCardProps) {
  return (
    <div
      className="px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 flex items-start gap-2.5 max-w-md w-full"
      role="alert"
      data-testid="system-health-error-card"
    >
      <AlertTriangle
        className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        {/* The full wrapped error string is rendered as the direct text
            node of this <div> so the W22-1 test contracts
            `getByText(/System health endpoint unavailable \(HTTP 500\)/)` +
            `getByText(/Network error: ECONNREFUSED/)` resolve to a single
            leaf. */}
        <div className="text-red-200 font-semibold text-xs leading-snug break-words">
          {message}
        </div>
        {detail && (
          <div className="text-red-300/60 text-[10.5px] mt-0.5 leading-snug">
            {detail}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] mono font-bold border bg-red-500/15 text-red-200 border-red-500/40 hover:bg-red-500/25 hover:border-red-500/60 transition-colors"
          aria-label="Retry health fetch"
          data-testid="system-health-error-retry"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Retry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10.5px] mono font-bold border border-red-500/30 text-red-300/80 hover:bg-red-500/15 hover:text-red-200 transition-colors"
          aria-label="Dismiss error"
          data-testid="system-health-error-dismiss"
        >
          <X className="w-3 h-3" aria-hidden="true" />
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SystemHealthView() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  // W22-1 — surface fetch failures instead of silently swallowing.
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/system/health`)
      if (res.ok) {
        setHealth(await res.json())
        setError(null)
      } else {
        setError(`System health endpoint unavailable (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[SystemHealthView] Failed to fetch system health:', e)
      setError(e instanceof Error ? e.message : 'Network error loading system health')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchHealth()
    const timer = setInterval(fetchHealth, 3000)
    return () => clearInterval(timer)
  }, [])

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading && !health) {
    return <SystemHealthSkeleton />
  }

  // ── Empty / error state ──────────────────────────────────────────────────
  if (!health) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-xs text-[#7e8aaa] gap-3 px-4 py-8 bg-[#13161e] border border-[#1f2335] rounded-lg overflow-y-auto scrollbar-thin"
        role="alert"
      >
        <PolishedEmptyState />
        {error && (
          <PolishedErrorCard
            message={error}
            detail="System health API couldn't be reached. Check connectivity and retry."
            onRetry={() => { setError(null); setLoading(true); fetchHealth() }}
            onDismiss={() => setError(null)}
          />
        )}
      </div>
    )
  }

  // ── Tone lookups for the loaded KPI tiles ─────────────────────────────────
  const pollerTone = successRateTone(health.poller.success_rate)
  const latencyTileTone = latencyTone(health.poller.latency_ms)
  const driftTileTone = driftTone(health.ml_engine.psi_drift)

  return (
    <div className="flex flex-col h-full bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden p-4 space-y-3 overflow-y-auto scrollbar-thin">
      {/* Top Header — title text "Platform Subsystem Health & Process
          Telemetry" preserved verbatim as a leaf text node so the W22-1
          test contract `getByText(/Platform Subsystem Health & Process
          Telemetry/)` resolves. The 🩺 emoji is preserved as a sibling
          span so it doesn't pollute the title's text node. */}
      <div className="flex flex-wrap justify-between items-center pb-2 border-b border-[#1f2335] gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🩺</span>
            <span className="text-sm font-bold text-[#dde1ed]">
              Platform Subsystem Health &amp; Process Telemetry
            </span>
          </div>
          <p className="text-xs text-[#7e8aaa]">
            Order Book Poller, Supervisor Watchdog, TimescaleDB Storage &amp; Risk Sizing ($100 Operating / $200 Ceiling)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-amber text-[9.5px] tabular-nums">$100 Operating Capital</span>
          <span className="badge badge-green text-[9.5px] flex items-center gap-1.5">
            <PulseDot tone="good" />
            <span>Process Supervisor Active</span>
          </span>
        </div>
      </div>

      {/* W22-1 — transient fetch errors during polling. Shown inline so
          the trader knows the latest poll failed even though stale data
          is still rendered. Dismissable. The error string is rendered as
          the direct text node of the PolishedErrorCard's title span so
          the test contract still resolves. */}
      {error && (
        <PolishedErrorCard
          message={error}
          detail="Last poll failed — displaying stale telemetry. Retry to refresh."
          onRetry={() => { setError(null); fetchHealth() }}
          onDismiss={() => setError(null)}
        />
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon={Gauge}
          title="System Metrics"
          description="pipeline throughput & drift"
          tone="info"
          trailing={
            <span className="badge badge-dim text-[9.5px] tabular-nums">
              {health.poller.total_tracked} books tracked
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <KpiTile
            label="Poller Success Rate"
            value={`${health.poller.success_rate}%`}
            hint={`${health.poller.total_tracked} books · ${health.poller.latency_ms}ms avg`}
            tone={pollerTone}
            icon={Activity}
            quality={health.poller.success_rate}
            testId="system-health-kpi-success"
          />
          <KpiTile
            label="Market DB Size"
            value={health.market_db ? `${health.market_db.size_mb} MB` : 'Buffered'}
            hint={
              health.market_db
                ? `${health.market_db.snapshots_recorded.toLocaleString()} snaps · ${health.market_db.ticks_recorded.toLocaleString()} ticks`
                : 'In-memory state'
            }
            tone="info"
            icon={Database}
            testId="system-health-kpi-db"
          />
          <KpiTile
            label="Model Drift PSI"
            value={health.ml_engine.psi_drift.toFixed(4)}
            hint={health.ml_engine.drift_status}
            tone={driftTileTone}
            icon={Waves}
            testId="system-health-kpi-drift"
          />
          <KpiTile
            label="Feature Store Vectors"
            value={
              health.market_db
                ? health.market_db.ml_feature_vectors.toLocaleString()
                : '0'
            }
            hint="38-dimensional shape"
            tone={latencyTileTone === 'poor' ? 'warn' : 'info'}
            icon={Cpu}
            testId="system-health-kpi-vectors"
          />
        </div>
      </div>

      {/* ── Supervised Processes table ──────────────────────────────────── */}
      <div className="card p-3 bg-[#0e1015] border border-[#1f2335]">
        <SectionHeader
          icon={ServerCog}
          title="Supervised Processes & Loops"
          description="FastAPI async tasks"
          tone="neutral"
          trailing={
            <span className="badge badge-dim text-[9.5px] tabular-nums">
              {health.services.length} services
            </span>
          }
        />

        {/* Uppercase header row — tabular-nums on numeric columns so
            values align cleanly when the trader scans the table. */}
        <div
          className="grid grid-cols-[minmax(0,1fr)_110px_90px_70px] gap-2 px-2.5 py-1.5 border-b border-[#1f2335] text-[10px] uppercase tracking-wider font-bold text-[#5a637a]"
          role="row"
        >
          <span role="columnheader">Service</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Frequency</span>
          <span role="columnheader" className="text-right">Port</span>
        </div>

        {/* Service rows — PulseDot status indicator + tone-tinted badge +
            row hover (subtle background lift + left-edge accent bar via
            inset shadow so layout doesn't shift on hover). */}
        <div
          className="divide-y divide-[#1f2335]/60 max-h-72 overflow-y-auto scrollbar-thin"
          role="rowgroup"
        >
          {health.services.map((s, i) => {
            const sTone = serviceStatusTone(s.status)
            const cfg = TONE[sTone]
            return (
              <div
                key={i}
                className={`grid grid-cols-[minmax(0,1fr)_110px_90px_70px] gap-2 px-2.5 py-2 items-center text-xs transition-colors hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0] ${cfg.bar}`}
                role="row"
                data-tone={sTone}
                data-testid="system-health-service-row"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PulseDot tone={sTone} pulse={sTone !== 'poor'} />
                  <span
                    className="font-semibold text-[#dde1ed] truncate"
                    title={s.name}
                    role="cell"
                  >
                    {s.name}
                  </span>
                </div>
                <div role="cell">
                  <span
                    className={`badge text-[9.5px] font-bold tabular-nums ${statusBadgeClass(sTone)}`}
                    data-tone={sTone}
                  >
                    {s.status}
                  </span>
                </div>
                <span
                  className="text-[10px] text-[#7e8aaa] mono tabular-nums"
                  role="cell"
                >
                  {s.frequency ?? '—'}
                </span>
                <span
                  className="text-[10px] text-cyan-400 mono tabular-nums text-right"
                  role="cell"
                >
                  {s.port ?? '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

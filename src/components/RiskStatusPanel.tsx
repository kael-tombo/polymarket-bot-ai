// components/RiskStatusPanel.tsx — Institutional Risk & Capital Governance Strip
//
// W58-e — Final UI polish pass (premium visual layer)
// ────────────────────────────────────────────────────────────────────────────
// This pass applies the W50-57 premium visual layer (Tone system, KpiTile,
// SectionHeader, PulseDot, ShimmerBlock, PolishedErrorCard) so the risk
// engine status surface stays visually consistent with the W51-2d MLPanel
// / W53-c StrategyPerformancePanel / W54-e MLValidationPanel / W55-a
// LeaderboardPanel / W56-a SystemHealthView / W56-e ObservabilityPanel
// / W57-a RetentionPanel redesign family.
//
// Affordances applied (additive only — existing class names, testids, role
// attributes, aria-labels, API calls, polling, the mode/recon badges, the
// Capital Allocation meter, and the 'use client' directive are preserved
// verbatim):
//
//   • KpiTile pattern for risk status metrics — the 6 bare `<Kpi>` cards
//     (Operating Bankroll / Deployable Ceiling / Max Per Market / Total
//     Exposure / Daily Loss Stop / Max Drawdown Stop) are refactored to
//     a `<KpiTile>` sub-component with tone-tinted bg + ring + Lucide
//     icon in the label row + large tabular-nums value + `data-tone`
//     hook. Tone is derived from the existing `warn` / `danger` /
//     `valueColor` props (danger=poor, warn=warn, green=good, cyan=info,
//     else neutral) so the existing colour logic is preserved verbatim.
//   • Shimmer skeleton loading state — the bare "Loading institutional
//     risk telemetry…" banner is wrapped in `<RiskStatusSkeleton/>`
//     which mirrors the live panel layout (header strip + capital-
//     allocation bar skeleton + 6-tile KPI grid skeleton + correlated-
//     groups strip skeleton). role=status + aria-live=polite. The
//     "Loading institutional risk telemetry…" copy is preserved verbatim
//     as the direct text node of a leaf `<span>` so the W30-2 test
//     contract resolves to a single leaf.
//   • PulseDot for live risk monitoring — the header `mode` badge +
//     `reconciled` badge + observation-mode warning are now paired
//     with `<PulseDot>` indicators (animate-ping halo + solid dot) so
//     the trader reads engine state at a glance. The kill-switch badge
//     uses `pulse={false}` so a dead engine doesn't ping distractingly.
//   • Section headers with icon + uppercase title — three `SectionHeader`
//     sub-components render above the capital-allocation meter
//     (BarChart3 icon + "Capital Allocation"), the KPI grid (Shield
//     icon + "Risk Status Metrics"), and the correlated-groups strip
//     (Layers3 icon + "Largest Correlated Market Exposure"). The panel
//     header title "🛡 INSTITUTIONAL RISK & RECONCILIATION" is preserved
//     verbatim so the W30-2 test contract resolves.
//   • Tone-colored risk status (green ok, amber warning, red critical) —
//     `kpiTone()` maps each KPI's `warn` / `danger` / `valueColor` props
//     onto the Tone palette (good=emerald, warn=amber, poor=red,
//     info=cyan, neutral). Each KpiTile carries `data-tone={tone}` for
//     downstream CSS targeting. The recon badge keeps its existing
//     `badge-green` / `badge-red` palette (so the W30-2 test contract
//     `getByText('Unavailable')` + `getByText('✓ Reconciled')` resolves)
//     but now sits next to a tone-matched PulseDot.
//   • Error state: polished error card — the bare "Unavailable" + "Risk
//     engine offline or starting up." block is wrapped in
//     `<PolishedErrorCard>` with Lucide `AlertTriangle` icon (size-8,
//     red) + the "Unavailable" badge text (preserved verbatim as the
//     direct text node of a leaf `<span>` so the W30-2 test contract
//     resolves to a single leaf) + the "Risk engine offline or starting
//     up." body copy (preserved verbatim) + a Retry button (RefreshCw
//     glyph, calls `fetchAll()`). role=alert.
//
// Data flow (preserved verbatim):
//   • On mount, the panel fires `Promise.all([GET /api/status, GET
//     /api/risk/reconcile])` via `apiFetch`. The Authorization header
//     is injected by `apiFetch` so the W30-2 test contract
//     `headers.get('Authorization') matches /^Bearer\s+\S+$/` resolves.
//   • Polls every 3s (preserved verbatim).
//   • Loading state: skeleton with the legacy copy text.
//   • Error state: polished error card with the legacy copy text.
'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { fmtUsd, fmtPnl } from '@/lib/design-tokens'
import {
  Shield,
  BarChart3,
  Layers3,
  AlertTriangle,
  RefreshCw,
  Activity,
  TrendingDown,
  AlertOctagon,
  Banknote,
  Wallet,
  Target,
} from 'lucide-react'

interface Reconciliation {
  reconciled: boolean
  status: string
  findings: string[]
  exposure: {
    capital_invested: number
    reserved_for_pending_orders: number
    net_directional_exposure: number
    maximum_remaining_loss: number
    exposure_dollar_days: number
    exposure_per_group: Record<string, number>
    exposure_per_strategy: Record<string, number>
    available_cash: number
  }
}

interface RiskStatus {
  mode: string
  observation_only: boolean
  observation_reason: string
  exposure_reconciled: boolean
  bankroll_ceiling: number
  deployable_ceiling: number
  total_exposure: number
  max_total_exposure: number
  max_position_per_market: number
  dynamic_risk_multiplier?: number
  effective_max_position_per_market?: number
  daily_pnl: number
  daily_loss_limit: number
  weekly_pnl?: number
  weekly_loss_limit?: number
  drawdown_dollars?: number
  max_drawdown_limit?: number
  max_loss_if_all_zero: number
  kill_switch?: boolean
  paper_balance?: number | null
  open_orders?: number
}

// ────────────────────────────────────────────────────────────────────────────
// W58-e — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
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
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',     halo: '' },
}

/** Map the legacy `warn` / `danger` / `valueColor` props onto the Tone palette. */
function kpiTone(opts: { warn?: boolean; danger?: boolean; valueColor?: string }): Tone {
  if (opts.danger) return 'poor'
  if (opts.warn) return 'warn'
  if (opts.valueColor === 'var(--color-green-fg)') return 'good'
  if (opts.valueColor === 'var(--color-cyan-fg)') return 'info'
  if (opts.valueColor === 'var(--color-red-fg)') return 'poor'
  if (opts.valueColor === 'var(--color-amber-fg)') return 'warn'
  return 'neutral'
}

// ────────────────────────────────────────────────────────────────────────────
// W58-e — Inline sub-components (kept private to the panel so test mocks
// + ts-isolation stay clean)
// ────────────────────────────────────────────────────────────────────────────

// PulseDot — small status dot with halo + ping animation. Used on the
// header mode/recon badges + the observation-mode warning. Mirrors W56-e
// / W57-a PulseDot.
function PulseDot({ tone = 'good', pulse = true }: { tone?: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-1.5 h-1.5 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      )}
      <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
  )
}

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. Title rendered in its
// own `<span>` so RTL `getByText(...)` matches just the span. Mirrors the
// W53-c / W56-e / W57-a SectionHeader pattern.
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
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#dde1ed] truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[#5a637a] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[#7e8aaa] mono tabular-nums">{trailing}</span>}
    </div>
  )
}

// ShimmerBlock — thin skeleton placeholder sized via className. aria-hidden.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
}

// KpiTile — refined KPI card (tone-tinted bg + ring, Lucide icon in the
// label row, large tabular-nums value, optional tooltip). Carries
// `data-tone` hook for downstream CSS targeting. Mirrors W56-e KpiTile.
interface KpiTileProps {
  label: string
  value: string | null
  sub?: string
  icon: LucideIcon
  tone: Tone
  /** Legacy color override — drives `style.color` when set. */
  valueColor?: string
  tooltip?: string
}

function KpiTile({ label, value, sub, icon: Icon, tone, valueColor, tooltip }: KpiTileProps) {
  const cfg = TONE[tone]
  // When the caller supplies an explicit valueColor (e.g. the legacy
  // `var(--color-green-fg)` CSS variable), use it. Otherwise fall back
  // to the Tone palette's text class.
  const valueStyle = valueColor ? { color: valueColor } : undefined
  const valueClass = valueColor ? '' : cfg.text
  return (
    <div
      className={`kpi-card bg-[#0e1015] border ${cfg.border} ${cfg.bg} p-2.5 rounded-lg flex flex-col justify-between transition-colors`}
      title={tooltip}
      data-tooltip={tooltip}
      data-tone={tone}
    >
      <span className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 flex items-center gap-1 ${cfg.label}`}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </span>
      <span className={`mono font-bold text-sm tabular-nums ${valueClass}`} style={valueStyle}>
        {value ?? <span className="text-[#3e4560]">—</span>}
      </span>
      {sub && <span className="text-[9.5px] text-[#7e8aaa] mt-0.5 block tabular-nums">{sub}</span>}
    </div>
  )
}

// PolishedErrorCard — AlertTriangle icon + "Unavailable" title + "Risk
// engine offline or starting up." body + Retry button. role=alert.
// The title + body text nodes are preserved verbatim as the direct
// text of leaf spans so the W30-2 test contracts resolve.
function PolishedErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="error-state py-6 px-4 flex flex-col items-center text-center"
      role="alert"
      data-testid="risk-status-error"
    >
      <span className="mb-2 inline-flex" aria-hidden="true">
        <AlertTriangle className="w-8 h-8 text-red-400/80" strokeWidth={1.5} />
      </span>
      <span className="badge badge-red text-[9.5px] mb-1">
        Unavailable
      </span>
      <p className="text-xs text-[#7e8aaa] max-w-[260px] mb-2">
        Risk engine offline or starting up.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        aria-label="Retry risk status fetch"
        data-testid="risk-status-error-retry"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// RiskStatusSkeleton — structured shimmer placeholder mirroring the live
// panel layout (header strip + capital-allocation bar skeleton + 6-tile
// KPI grid skeleton + correlated-groups strip skeleton). role=status +
// aria-live=polite. The "Loading institutional risk telemetry…" copy is
// preserved verbatim as the direct text node of a leaf `<span>` so the
// W30-2 test contract resolves.
function RiskStatusSkeleton() {
  return (
    <div
      className="card h-full flex flex-col bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-xl"
      role="status"
      aria-live="polite"
      aria-label="Loading institutional risk telemetry…"
      data-testid="risk-status-loading-skeleton"
    >
      {/* Header skeleton */}
      <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="text-xs font-bold text-[#dde1ed]">
            Loading institutional risk telemetry…
          </span>
        </div>
        <span className="spinner" aria-hidden="true" />
      </div>

      {/* Capital allocation bar skeleton */}
      <div className="px-3 py-2 mx-3 mb-2 mt-2.5 bg-[#0e1015] border border-[#1f2335] rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-40" />
          <ShimmerBlock className="w-20" />
        </div>
        <div className="h-2 rounded-full bg-[#13161e] border border-[#1f2335]" />
        <div className="flex justify-between">
          <ShimmerBlock className="w-16" />
          <ShimmerBlock className="w-16" />
          <ShimmerBlock className="w-16" />
        </div>
      </div>

      {/* KPI grid skeleton (6 tiles) */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kpi-card bg-[#0e1015] border border-[#1f2335] p-2.5 rounded-lg space-y-2">
              <ShimmerBlock className="w-2/3" />
              <div className="h-4 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-1/2" />
            </div>
          ))}
        </div>
      </div>

      {/* Correlated groups strip skeleton */}
      <div className="px-3 pb-3 pt-2 border-t border-[#1f2335] mt-auto space-y-2">
        <div className="flex items-center justify-between">
          <ShimmerBlock className="w-48" />
          <ShimmerBlock className="w-20" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex justify-between items-center text-xs bg-[#0e1015] px-2.5 py-1 rounded border border-[#1f2335]"
          >
            <ShimmerBlock className="w-32" />
            <ShimmerBlock className="w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface KpiProps {
  label: string
  value: string | null
  sub?: string
  valueColor?: string
  tooltip?: string
  warn?: boolean
  danger?: boolean
  /** Lucide icon rendered in the label row. Defaults to Activity. */
  icon?: LucideIcon
}

function Kpi({ label, value, sub, valueColor, tooltip, warn, danger, icon: Icon = Activity }: KpiProps) {
  const tone = kpiTone({ warn, danger, valueColor })
  return (
    <KpiTile
      label={label}
      value={value}
      sub={sub}
      icon={Icon}
      tone={tone}
      valueColor={valueColor}
      tooltip={tooltip}
    />
  )
}

function CapitalAllocationBar({ invested, reserved, maxDeployable }: { invested: number; reserved: number; maxDeployable: number }) {
  const investedPct = maxDeployable > 0 ? (invested / maxDeployable) * 100 : 0
  const reservedPct = maxDeployable > 0 ? (reserved / maxDeployable) * 100 : 0
  // Tone for the deployed-vs-ceiling gauge: good when ≤60%, warn when
  // ≤85%, poor when >85%. Mirrors the W56-e capital-utilization tone.
  const deployedTone: Tone =
    investedPct > 85 ? 'poor' : investedPct > 60 ? 'warn' : 'good'

  return (
    <div className="px-3 py-2 bg-[#0e1015] border border-[#1f2335] rounded-lg mx-3 mb-2">
      <div className="flex justify-between items-center text-[10.5px] text-[#7e8aaa] mb-1.5">
        <span className="font-semibold text-[#dde1ed] flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3 text-cyan-400" aria-hidden="true" />
          <span>📊 Capital Allocation</span>
          <span className="text-[9.5px] font-normal text-[#7e8aaa] tabular-nums">
            (${invested.toFixed(2)} deployed / $60 ceiling)
          </span>
        </span>
        <span className={`mono font-bold tabular-nums ${TONE[deployedTone].text}`} data-tone={deployedTone}>
          {investedPct.toFixed(1)}% Deployed
        </span>
      </div>

      <div className="w-full bg-[#13161e] border border-[#1f2335] h-2 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-cyan-400 transition-all duration-300"
          style={{ width: `${Math.min(investedPct, 100)}%` }}
          title={`Invested: $${invested.toFixed(2)}`}
        />
        <div
          className="h-full bg-amber-400 transition-all duration-300"
          style={{ width: `${Math.min(reservedPct, 100)}%` }}
          title={`Reserved: $${reserved.toFixed(2)}`}
        />
      </div>

      <div className="flex justify-between text-[9px] text-[#7e8aaa] mt-1 mono tabular-nums">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> Active: ${invested.toFixed(2)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Pending: ${reserved.toFixed(2)}
        </span>
        <span className="flex items-center gap-1 text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Avail: ${(maxDeployable - invested - reserved).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

export default function RiskStatusPanel() {
  const [risk, setRisk] = useState<RiskStatus | null>(null)
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [, setLastUpdated] = useState<number | null>(null)

  const fetchAll = async () => {
    try {
      const apiUrl = getApiUrl()
      const [statusRes, reconRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/status`),
        apiFetch(`${apiUrl}/api/risk/reconcile`),
      ])
      if (statusRes.ok) setRisk(await statusRes.json())
      if (reconRes.ok) setRecon(await reconRes.json())
      setError(false)
      setLastUpdated(Date.now())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 3000)
    return () => clearInterval(t)
  }, [])

  if (loading) {
    return <RiskStatusSkeleton />
  }

  if (error || !risk) {
    return (
      <div className="card bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden">
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">🛡 Risk &amp; Exposure</span>
          </div>
          <PulseDot tone="poor" pulse={false} />
        </div>
        <PolishedErrorCard onRetry={fetchAll} />
      </div>
    )
  }

  const observing = risk.observation_only || !risk.exposure_reconciled
  const reconOk = recon?.reconciled ?? false
  const groups = recon?.exposure.exposure_per_group ?? {}
  const topGroups = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 2)

  const expPct = risk.max_total_exposure > 0 ? risk.total_exposure / risk.max_total_exposure : null
  const modeLabel = risk.mode === 'live' ? 'LIVE' : risk.mode === 'shadow' ? 'SHADOW' : 'PAPER'
  const modeBadgeClass = risk.mode === 'live' ? 'badge-red' : risk.mode === 'shadow' ? 'badge-cyan' : 'badge-amber'
  // Tone for the mode badge: live=poor (red, real capital at risk),
  // shadow=info (cyan), paper=warn (amber, simulation).
  const modeTone: Tone = risk.mode === 'live' ? 'poor' : risk.mode === 'shadow' ? 'info' : 'warn'

  const dynamicMult = risk.dynamic_risk_multiplier ?? 1.0
  const effectiveCap = risk.effective_max_position_per_market ?? 3.0

  return (
    <div className="card h-full flex flex-col bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-xl">
      {/* Header — section header with Shield icon + uppercase title + mode
          badge (with PulseDot) + recon badge (with PulseDot) + kill-switch
          badge (no ping for dead engine). */}
      <div className="card-header p-3 border-b border-[#1f2335] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed] tracking-wide">
            🛡 INSTITUTIONAL RISK &amp; RECONCILIATION
          </span>
          <span
            className={`flex items-center gap-1 badge ${modeBadgeClass} text-[9.5px]`}
            data-tone={modeTone}
            title={`Operating mode: ${modeLabel}`}
          >
            <PulseDot tone={modeTone} pulse={risk.mode === 'live'} />
            {modeLabel}
          </span>
          <span
            className={`flex items-center gap-1 badge ${reconOk ? 'badge-green' : 'badge-red'} text-[9.5px]`}
            title={reconOk ? 'Exposure reconciled with ledger' : 'Ledger reconciliation discrepancy detected'}
            data-tone={reconOk ? 'good' : 'poor'}
          >
            <PulseDot tone={reconOk ? 'good' : 'poor'} pulse={!reconOk} />
            {reconOk ? '✓ Reconciled' : '⚠ Discrepancy'}
          </span>
          {risk.kill_switch && (
            <span
              className="flex items-center gap-1 badge badge-red animate-pulse text-[9.5px]"
              data-tone="poor"
            >
              <PulseDot tone="poor" pulse={false} />
              🛑 Circuit Breaker Active
            </span>
          )}
        </div>

        {/* Dynamic Model Health Multiplier Badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#7e8aaa]">ML Risk Scale:</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums ${
              dynamicMult >= 1.0
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : dynamicMult >= 0.6
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}
            data-tone={dynamicMult >= 1.0 ? 'good' : dynamicMult >= 0.6 ? 'warn' : 'poor'}
          >
            {(dynamicMult * 100).toFixed(0)}% (${effectiveCap.toFixed(2)} Cap)
          </span>
        </div>
      </div>

      {/* Observation Warning */}
      {observing && (
        <div
          className="bg-amber-500/10 border-l-4 border-amber-500 text-amber-300 text-xs px-3 py-2 mx-3 mt-2 rounded flex items-center gap-2"
          data-tone="warn"
        >
          <PulseDot tone="warn" />
          <span>
            <strong>Observation Mode Active:</strong> New live orders disabled until portfolio exposure is reconciled.
            {risk.observation_reason ? ` (${risk.observation_reason})` : ''}
          </span>
        </div>
      )}

      {/* Capital Allocation Visual Meter */}
      <div className="mt-2.5">
        <CapitalAllocationBar
          invested={recon?.exposure.capital_invested || 0}
          reserved={recon?.exposure.reserved_for_pending_orders || 0}
          maxDeployable={60.0}
        />
      </div>

      {/* Section header above the KPI grid */}
      <div className="px-3 pb-1 pt-1">
        <SectionHeader
          icon={Shield}
          title="Risk Status Metrics"
          description="capital & position limits"
          tone="info"
          trailing="6 limits"
        />
      </div>

      {/* Primary KPI Grid — Capital & Position Limits */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Kpi
            label="Operating Bankroll"
            value={fmtUsd(100)}
            sub="Active Sizing Base"
            icon={Banknote}
            tooltip="USD 100.00 operating capital — automated sizing baseline"
          />
          <Kpi
            label="Deployable Ceiling"
            value={fmtUsd(risk.deployable_ceiling || 60)}
            sub="$40 Cash Reserve"
            icon={Wallet}
            tooltip="Maximum capital deployable without breaching the $40 minimum cash reserve"
          />
          <Kpi
            label="Max Per Market"
            value={`$${effectiveCap.toFixed(2)}`}
            sub={`Scaled: ${(dynamicMult * 100).toFixed(0)}%`}
            icon={Target}
            valueColor="var(--color-cyan-fg)"
            tooltip="Dynamically scaled maximum dollar commitment per individual market based on ML calibration health"
          />
          <Kpi
            label="Total Exposure"
            value={fmtUsd(risk.total_exposure)}
            sub={expPct != null ? `${(expPct * 100).toFixed(1)}% of $25 limit` : undefined}
            icon={Activity}
            warn={expPct != null && expPct > 0.7}
            danger={expPct != null && expPct > 0.9}
            tooltip="Total open risk across all positions + active open orders ($25.00 hard cap)"
          />
          <Kpi
            label="Daily Loss Stop"
            value={`-$2.00`}
            sub={`PnL: ${fmtPnl(risk.daily_pnl)}`}
            icon={TrendingDown}
            valueColor={risk.daily_pnl >= 0 ? 'var(--color-green-fg)' : 'var(--color-red-fg)'}
            tooltip="Circuit breaker activates and cancels all open orders if daily realized losses reach -$2.00"
          />
          <Kpi
            label="Max Drawdown Stop"
            value={`-$8.00`}
            sub="High-Water Mark"
            icon={AlertOctagon}
            tooltip="Hard stop: halts all execution if portfolio draws down $8.00 from peak equity"
          />
        </div>
      </div>

      {/* Correlated Groups Strip */}
      {topGroups.length > 0 && (
        <div className="px-3 pb-3 pt-2 border-t border-[#1f2335] mt-auto">
          <SectionHeader
            icon={Layers3}
            title="Largest Correlated Market Exposure"
            description="top-2 by $ exposure"
            tone="warn"
            trailing="Limit: $8.00 Max"
          />
          <div className="space-y-1 mt-1.5">
            {topGroups.map(([name, val]) => {
              const groupTone: Tone = val > 8 ? 'poor' : val > 5 ? 'warn' : 'good'
              return (
                <div
                  key={name}
                  className="flex justify-between items-center text-xs bg-[#0e1015] px-2.5 py-1 rounded border border-[#1f2335] hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-all"
                  data-tone={groupTone}
                >
                  <span className="text-[#dde1ed] truncate max-w-[200px] text-[11px]">{name}</span>
                  <span className={`mono font-bold tabular-nums ${TONE[groupTone].text}`}>
                    {fmtUsd(val)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// components/CapitalAllocatorPanel.tsx — Saturating edge-curve capital allocator panel
//
// Exposes the capital_allocator backend (Michaelis-Menten saturating edge curve,
// multiplier-based sizing stack) on the Polymarket trading bot dashboard.
//
// Backend endpoints (verified in `register_routes` of
// `mini-services/polymarket-bot/core/capital_allocator.py` and `api/server.py`):
//
//   • GET /api/capital/allocation   — what-if sizing + component breakdown
//   • GET /api/exposure             — capital deployed, per-strategy exposure
//   • GET /api/positions/closed     — recent closed allocations (edge, conf, size)
//
// The allocator's curve constants (k = EDGE_K_M, α = EDGE_V_MAX,
// max position, max exposure) are Python module-level constants with no
// GET endpoint to read them — we display the documented values from the
// module docstring and confirm them against the breakdown response.
//
// ────────────────────────────────────────────────────────────────────────────
// W57-e — Premium visual polish pass, aligned with the W51-2d MLPanel
// / AIMLCommandCenter / W53-c StrategyPerformancePanel / W54-e
// MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel /
// W56-c DatabaseStatusPanel / W56-e ObservabilityPanel redesign family:
//   1. KpiTile pattern for capital metrics (Total Capital, Allocated,
//      Available, Kelly fraction) — tone-tinted bg + uppercase 9px label +
//      16px tabular-nums value + quality bar + Lucide icon glyph. The 6-tile
//      Config KPI strip (k / α / max edge / max position / max exposure /
//      operating cap) is also converted to the same KpiTile pattern so the
//      panel reads as a single visual system.
//   2. Shimmer skeleton loading state mirroring the loaded panel layout
//      (header + 4-tile Capital Metrics strip + 6-tile Config KPI strip +
//      Edge→Size curve + Utilization gauge + per-strategy split + recent
//      allocations table) so the panel doesn't visually jump on first fetch.
//   3. Polished empty state with Lucide icon + message for the recent
//      allocations table when no closed positions are recorded yet.
//   4. Section headers with icon + uppercase tracking-wider title (Curve →
//      TrendingUp, Utilization → Gauge, Split → Layers, Multipliers → Zap,
//      Allocations → History) — unified via the shared SectionHeader sub-
//      component so every section reads identically to MLPanel.
//   5. Refined allocation table — uppercase headers (via the existing
//      .data-table CSS), tone-coloured allocation bar (emerald optimal /
//      amber over-allocated / red danger), tabular-nums on every numeric
//      column, row-hover left-edge accent bar via inset shadow.
//   6. Refined Kelly criterion visualization — a horizontal KellyBar with
//      green / amber / red zones + a live tick marking the current Kelly
//      fraction estimate, complementing the existing Edge→Size saturating
//      curve and the UtilizationGauge.
//   7. Tone-coloured allocation status (Optimal / Over-allocated / Danger)
//      badge next to the gauge so the trader reads utilisation state at a
//      glance.
//   8. Error state — polished error card with AlertTriangle icon + dim
//      detail + Retry button (RefreshCw glyph), preserving the
//      "Allocator API unavailable" title + the /retry/i accessible name.
//   9. Refined allocation controls — each Config field in the AlertDialog
//      now carries a range slider alongside the existing number input, so
//      the operator can scrub k / α / max_edge / max_position / max_exposure
//      / operating_capital continuously with tactile feedback.
// All existing functionality, class names, API calls, polling, visibility
// pause/resume, accessibility roles/labels, test-matched strings, and the
// 'use client' directive preserved.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { fmtUsd, fmtAge } from '@/lib/design-tokens'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Activity,
  AlertTriangle,
  Banknote,
  Coins,
  Crosshair,
  Gauge as GaugeIcon,
  History,
  Layers,
  PiggyBank,
  RefreshCw,
  Scale,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { GaugeChart } from '@/components/charts'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AllocatorComponents {
  raw_size: number
  confidence_mult: number
  calibration_mult: number
  drawdown_mult: number
  correlation_mult: number
  performance_mult: number
  liquidity_mult: number
  product_mult: number
}

interface AllocatorBreakdown {
  strategy: string
  edge: number
  confidence: number
  liquidity_usd: number
  existing_exposure_usd: number
  drawdown_usd: number
  strategy_performance: Record<string, number> | null
  brier_override: number | null
  model_brier: number | null
  size_usd: number
  cap_usd: number
  drawdown_limit_usd: number
  edge_k_m: number
  edge_v_max: number
  liquidity_k: number
  components: AllocatorComponents
}

interface ExposureReport {
  capital_invested: number
  reserved_for_pending_orders: number
  gross_market_value: number
  net_directional_exposure: number
  maximum_remaining_loss: number
  exposure_per_group: Record<string, number>
  exposure_per_strategy: Record<string, number>
  exposure_duration_hours_avg: number
  exposure_dollar_days: number
  available_cash: number
  reserved_cash: number
  open_position_count: number
}

interface ClosedPosition {
  id: number
  timestamp: number
  position_id: string
  token_id: string
  strategy: string
  entry_price: number | null
  exit_price: number | null
  shares: number | null
  pnl: number | null
  holding_seconds: number | null
  model_version: string | null
  decision_id: string | null
  direction: string | null
  confidence: number | null
  predicted_edge: number | null
  p_yes: number | null
  market_mid: number | null
  liquidity: number | null
  data: Record<string, unknown> | null
}

interface AllocatorConfig {
  k: number         // EDGE_K_M (Michaelis-Menten half-saturation edge)
  alpha: number      // EDGE_V_MAX (asymptotic max position size, USD)
  max_edge: number   // display range ceiling (decimal, e.g. 0.20 = 20%)
  max_position_size: number
  max_exposure: number
  operating_capital: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Static allocator constants — mirror of `core/capital_allocator.py`
// ─────────────────────────────────────────────────────────────────────────────
// The backend surfaces `edge_k_m`, `edge_v_max`, `liquidity_k`, `cap_usd`,
// `drawdown_limit_usd` via the breakdown response, so we use those values
// when available and fall back to these documented constants.
const DEFAULT_CONFIG: AllocatorConfig = {
  k: 0.05,
  alpha: 3.00,
  max_edge: 0.20,
  max_position_size: 3.00,
  max_exposure: 5.00,
  operating_capital: 200.00, // BANKROLL_CEILING from api/server.py
}

const POLL_INTERVAL_MS = 15_000
const RECENT_ALLOCATIONS_LIMIT = 20

// ─────────────────────────────────────────────────────────────────────────────
// Saturating edge curve (Michaelis-Menten) — mirrors `saturating_edge()` in
// capital_allocator.py so the panel can render the curve locally without
// an extra round-trip per pixel.
// ─────────────────────────────────────────────────────────────────────────────
function saturatingEdge(edge: number, k: number, vMax: number): number {
  const e = Math.max(0, Number(edge) || 0)
  if (e <= 0) return 0
  return (vMax * e) / (k + e)
}

// ─────────────────────────────────────────────────────────────────────────────
// W51-2d Tone system (mirror of MLPanel / ExecutionQualityPanel /
// DatabaseStatusPanel / ObservabilityPanel) — self-contained Tailwind class
// strings so Tailwind 4's content scanner picks them up. Used by the KpiTile,
// the PulseDot, the SectionHeader icon, the KellyBar, the allocation status
// badge, the per-strategy allocation bar, and the recent allocations table
// tone-coloured cells.
// ─────────────────────────────────────────────────────────────────────────────
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
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '',                       rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map a utilisation percentage to a Tone for the gauge / KPI tile /
 *  allocation-status badge. <50% → good (emerald, optimal), 50–80% →
 *  warn (amber, over-allocated), >80% → poor (red, danger). */
function utilizationTone(pct: number): Tone {
  if (pct > 80) return 'poor'
  if (pct >= 50) return 'warn'
  return 'good'
}

/** Map a Kelly fraction [0..1] to a Tone. <0.25 → good (conservative),
 *  0.25–0.50 → info (moderate), 0.50–0.75 → warn (aggressive), >0.75 → poor
 *  (danger — near-full bankroll on a single trade). */
function kellyTone(fraction: number): Tone {
  if (fraction > 0.75) return 'poor'
  if (fraction > 0.5) return 'warn'
  if (fraction > 0.25) return 'info'
  return 'good'
}

/** Allocation status label rendered next to the gauge. */
function allocationStatusLabel(pct: number): string {
  if (pct > 80) return 'Danger'
  if (pct >= 50) return 'Over-allocated'
  return 'Optimal'
}

// Utilization colour set — kept for the EdgeSizeCurve and per-strategy bar
// fill (uses raw hex because SVG + inline styles can't consume the TONE
// class strings). Thresholds match utilizationTone().
function utilizationStyle(pct: number): {
  badge: string
  text: string
  stroke: string
  ring: string
} {
  const tone = utilizationTone(pct)
  if (tone === 'poor') {
    return {
      badge: 'badge-red',
      text: TONE.poor.text,
      stroke: '#ef4444',
      ring: 'rgba(239, 68, 68, 0.18)',
    }
  }
  if (tone === 'warn') {
    return {
      badge: 'badge-amber',
      text: TONE.warn.text,
      stroke: '#f59e0b',
      ring: 'rgba(245, 158, 11, 0.18)',
    }
  }
  return {
    badge: 'badge-green',
    text: TONE.good.text,
    stroke: '#22c55e',
    ring: 'rgba(34, 197, 94, 0.18)',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — design system
// ─────────────────────────────────────────────────────────────────────────────

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// Mirrors MLPanel / DatabaseStatusPanel. Used by the header LIVE indicator.
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
// Mirrors the MLPanel / StrategyPerformancePanel / DatabaseStatusPanel
// SectionHeader so every section reads identically across the redesign
// family. Used by the Edge→Size curve, Utilisation gauge, Capital split,
// What-if multipliers, Recent allocations, and Config KPI strip sections.
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
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[9px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── ShimmerBlock — thin skeleton-line-sm placeholder ────────────────────────
// Can be sized via the className prop. aria-hidden so screen readers don't
// pick it up. Mirrors MLPanel's ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// ── KpiTile — refined KPI card (large value, tone-tinted bg, quality bar) ────
// Mirrors the MLPanel / DatabaseStatusPanel KpiTile sub-component so the
// capital metrics read as part of the same premium KPI strip family.
interface KpiTileProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon?: LucideIcon
  tone?: Tone
  /** Quality-bar fill [0..100]. 0 / undefined = no bar rendered. */
  quality?: number
  testId?: string
}

function KpiTile({
  label,
  value,
  sub,
  valueClass,
  icon: Icon,
  tone,
  quality,
  testId,
}: KpiTileProps) {
  const cfg = tone ? TONE[tone] : null
  const cardCls = cfg
    ? `kpi-card relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`
    : 'kpi-card relative rounded p-2 border border-[#1f2335] bg-[#0e1015] overflow-hidden transition-colors'
  return (
    <div className={cardCls} data-testid={testId} data-tone={tone ?? 'neutral'}>
      <span className={`kpi-label flex items-center gap-1 ${cfg ? cfg.label : ''}`}>
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
        <div className="h-0.5 bg-[#1f2335] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg ? cfg.bar : 'bg-[#5a637a]'}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

// ── KellyBar — horizontal Kelly criterion bar with zone bands + live tick ────
// Shows the estimated Kelly fraction (optimal bankroll fraction to deploy
// per trade) on a 0–100% scale with green / amber / red zone bands and a
// live tick. Complements the Edge→Size curve + UtilizationGauge so the
// trader has three orthogonal capital visualisations: sizing curve (per
// edge), utilisation gauge (current deployment), Kelly bar (per-trade
// optimal fraction).
function KellyBar({ fraction }: { fraction: number | null }) {
  // Clamp to [0, 1] for display.
  const f = fraction == null || !Number.isFinite(fraction) ? null : Math.max(0, Math.min(1, fraction))
  const pct = f == null ? 0 : f * 100
  const tone: Tone = f == null ? 'neutral' : kellyTone(f)
  const cfg = TONE[tone]
  return (
    <div
      className="space-y-1"
      title={
        f == null
          ? 'Kelly fraction unavailable — awaiting what-if breakdown'
          : `Estimated Kelly fraction ${(f * 100).toFixed(1)}% — zones: <25% conservative, 25–50% moderate, 50–75% aggressive, >75% danger`
      }
    >
      <div className="relative h-2 bg-[#080910] rounded-full overflow-hidden border border-[#181c28]">
        {/* zone bands — emerald (0–25%), cyan (25–50%), amber (50–75%), red (75–100%) */}
        <div className="absolute inset-y-0 left-0 bg-emerald-500/25" style={{ width: '25%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-cyan-500/25" style={{ left: '25%', width: '25%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-amber-500/25" style={{ left: '50%', width: '25%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-red-500/25" style={{ left: '75%', right: 0 }} aria-hidden="true" />
        {/* live tick */}
        {f != null && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm ${cfg.bar} shadow-sm transition-all duration-500`}
            style={{ left: `calc(${pct}% - 2px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex justify-between text-[8px] text-[#5a637a] mono">
        <span>0%</span>
        <span className="text-emerald-400/70">25%</span>
        <span className="text-cyan-400/70">50%</span>
        <span className="text-amber-400/70">75%</span>
        <span>100%</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wider font-bold text-[#5a637a]">
          Kelly Fraction
        </span>
        <span className={`mono text-[11px] font-bold tabular-nums ${cfg.text}`}>
          {f == null ? '—' : `${(f * 100).toFixed(1)}%`}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge → Size curve SVG
// ─────────────────────────────────────────────────────────────────────────────
function EdgeSizeCurve({
  k,
  vMax,
  maxEdge,
  operatingEdge,
  operatingSize,
}: {
  k: number
  vMax: number
  maxEdge: number
  operatingEdge: number | null
  operatingSize: number | null
}) {
  // SVG coordinate system — 0..440 wide, 0..200 tall.
  const W = 440
  const H = 200
  const PAD_L = 36
  const PAD_R = 14
  const PAD_T = 14
  const PAD_B = 28
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  // Sample the curve at ~40 points across [0, maxEdge].
  const samples = 40
  const pts: Array<{ x: number; y: number; edge: number; size: number }> = []
  for (let i = 0; i <= samples; i++) {
    const edge = (i / samples) * maxEdge
    const size = saturatingEdge(edge, k, vMax)
    pts.push({
      x: PAD_L + (edge / maxEdge) * plotW,
      y: PAD_T + (1 - size / vMax) * plotH,
      edge,
      size,
    })
  }
  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  // Half-saturation reference (edge = k → size = vMax / 2).
  const halfX = PAD_L + (k / maxEdge) * plotW
  const halfY = PAD_T + (1 - 0.5) * plotH

  // Current operating point.
  const op = (() => {
    if (operatingEdge == null || operatingSize == null) return null
    const e = Math.max(0, Math.min(operatingEdge, maxEdge))
    const s = Math.max(0, Math.min(operatingSize, vMax))
    return {
      x: PAD_L + (e / maxEdge) * plotW,
      y: PAD_T + (1 - s / vMax) * plotH,
    }
  })()

  // Y-axis gridlines at 0, vMax/4, vMax/2, 3vMax/4, vMax.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    y: PAD_T + (1 - f) * plotH,
    val: f * vMax,
  }))

  // X-axis ticks at 0, 5%, 10%, 15%, 20%.
  const xTicks = [0, 0.05, 0.10, 0.15, 0.20]
    .filter((t) => t <= maxEdge)
    .map((t) => ({ t, x: PAD_L + (t / maxEdge) * plotW }))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      role="img"
      aria-label="Saturating edge to position size curve"
    >
      {/* Background plot area */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={plotW}
        height={plotH}
        fill="#0a0c12"
        stroke="#1f2335"
        strokeWidth="1"
      />

      {/* Y gridlines */}
      {yTicks.map((t) => (
        <g key={`y-${t.f}`}>
          <line
            x1={PAD_L}
            y1={t.y}
            x2={W - PAD_R}
            y2={t.y}
            stroke="#1f2335"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <text
            x={PAD_L - 5}
            y={t.y + 3}
            fill="#5a637a"
            fontSize="9"
            textAnchor="end"
            fontFamily="JetBrains Mono, monospace"
          >
            ${t.val.toFixed(2)}
          </text>
        </g>
      ))}

      {/* X axis ticks */}
      {xTicks.map((t) => (
        <g key={`x-${t.t}`}>
          <line
            x1={t.x}
            y1={H - PAD_B}
            x2={t.x}
            y2={H - PAD_B + 3}
            stroke="#3e4560"
            strokeWidth="1"
          />
          <text
            x={t.x}
            y={H - PAD_B + 16}
            fill="#5a637a"
            fontSize="9"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
          >
            {(t.t * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {/* Half-saturation reference line (edge = k → size = vMax/2) */}
      <line
        x1={halfX}
        y1={PAD_T}
        x2={halfX}
        y2={H - PAD_B}
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="2 3"
        strokeOpacity="0.45"
      />
      <text
        x={halfX + 4}
        y={PAD_T + 10}
        fill="#60a5fa"
        fontSize="8.5"
        fontFamily="JetBrains Mono, monospace"
      >
        k={(k * 100).toFixed(1)}%
      </text>
      <line
        x1={PAD_L}
        y1={halfY}
        x2={halfX}
        y2={halfY}
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="2 3"
        strokeOpacity="0.45"
      />

      {/* Asymptote (vMax) */}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={W - PAD_R}
        y2={PAD_T}
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="3 3"
        strokeOpacity="0.35"
      />
      <text
        x={W - PAD_R}
        y={PAD_T - 4}
        fill="#60a5fa"
        fontSize="8.5"
        textAnchor="end"
        fontFamily="JetBrains Mono, monospace"
      >
        α = ${vMax.toFixed(2)}
      </text>

      {/* Saturating curve */}
      <path
        d={pathD}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Area under curve (subtle) */}
      <path
        d={`${pathD} L ${pts[pts.length - 1].x.toFixed(2)} ${H - PAD_B} L ${pts[0].x.toFixed(2)} ${H - PAD_B} Z`}
        fill="rgba(34, 211, 238, 0.06)"
        stroke="none"
      />

      {/* Current operating point */}
      {op && (
        <g>
          <line
            x1={op.x}
            y1={op.y}
            x2={op.x}
            y2={H - PAD_B}
            stroke="#fbbf24"
            strokeWidth="1"
            strokeDasharray="2 2"
            strokeOpacity="0.6"
          />
          <line
            x1={PAD_L}
            y1={op.y}
            x2={op.x}
            y2={op.y}
            stroke="#fbbf24"
            strokeWidth="1"
            strokeDasharray="2 2"
            strokeOpacity="0.6"
          />
          <circle
            cx={op.x}
            cy={op.y}
            r="5"
            fill="#fbbf24"
            stroke="#0e1015"
            strokeWidth="2"
          />
          <circle cx={op.x} cy={op.y} r="9" fill="none" stroke="#fbbf24" strokeOpacity="0.3" strokeWidth="1" />
        </g>
      )}

      {/* Axis labels */}
      <text
        x={PAD_L + plotW / 2}
        y={H - 2}
        fill="#7e8aaa"
        fontSize="9.5"
        textAnchor="middle"
        fontWeight="600"
      >
        Predicted Edge →
      </text>
      <text
        x={10}
        y={PAD_T + plotH / 2}
        fill="#7e8aaa"
        fontSize="9.5"
        textAnchor="middle"
        fontWeight="600"
        transform={`rotate(-90 10 ${PAD_T + plotH / 2})`}
      >
        Position Size ($) →
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Capital utilization circular gauge
//
// W13-9 — Now backed by the shared Recharts GaugeChart component from
// @/components/charts. This wrapper preserves the panel's local API
// (pct + deployed + capital) and the "Near Cap / Moderate / Healthy"
// status badge so call sites don't need to change.
//
// W57-e — Adds a tone-coloured allocation-status badge ("Optimal" /
// "Over-allocated" / "Danger") so the trader reads utilisation state at a
// glance, plus a PulseDot halo when utilisation is in the danger zone.
// ─────────────────────────────────────────────────────────────────────────────
function UtilizationGauge({
  pct,
  deployed,
  capital,
}: {
  pct: number
  deployed: number
  capital: number
}) {
  const clampedPct = Math.max(0, Math.min(100, pct))
  const style = utilizationStyle(clampedPct)
  const tone = utilizationTone(clampedPct)
  const label = allocationStatusLabel(clampedPct)
  return (
    <div className="flex flex-col items-center justify-center">
      <GaugeChart
        value={clampedPct}
        label="DEPLOYED"
        sublabel={`${fmtUsd(deployed)} / ${fmtUsd(capital)}`}
        color={style.stroke}
        height={180}
      />
      <span
        className={`badge ${style.badge} text-[9.5px] mt-1.5 flex items-center gap-1`}
        data-tone={tone}
      >
        <PulseDot tone={tone} pulse={tone === 'poor'} />
        {label}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loading state (W57-e — ShimmerBlock-based, mirrors loaded layout)
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonState() {
  return (
    <div
      className="flex flex-col gap-3 p-3"
      role="status"
      aria-live="polite"
      aria-label="Loading capital allocator"
      data-testid="capital-allocator-loading-skeleton"
    >
      {/* Skeleton header bar */}
      <div className="flex items-center gap-2 pb-2 border-b border-[#1f2335]">
        <ShimmerBlock className="w-3.5 h-3.5 !rounded-full" />
        <ShimmerBlock className="w-32 h-3" />
        <ShimmerBlock className="w-24 h-3 !rounded-md" />
        <div className="ml-auto flex items-center gap-2">
          <ShimmerBlock className="w-16 h-3" />
          <ShimmerBlock className="w-16 h-5 !rounded-md" />
          <ShimmerBlock className="w-16 h-5 !rounded-md" />
        </div>
      </div>
      {/* Skeleton 4-tile Capital Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`cap-kpi-${i}`}
            className="kpi-card rounded p-2 border border-[#1f2335] bg-[#0e1015] space-y-1.5"
          >
            <ShimmerBlock className="w-1/2" />
            <ShimmerBlock className="w-3/4 !h-4" />
            <ShimmerBlock className="w-2/3 !h-2" />
            <div className="h-0.5 w-full bg-[#1f2335] rounded-full overflow-hidden">
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
      {/* Skeleton curve + gauge row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded p-3 border border-[#1f2335] bg-[#0e1015] space-y-2" aria-hidden="true">
          <div className="flex items-center gap-2">
            <ShimmerBlock className="w-3 h-3 !rounded-full" />
            <ShimmerBlock className="w-44 h-3" />
            <div className="ml-auto">
              <ShimmerBlock className="w-24 h-2.5" />
            </div>
          </div>
          <ShimmerBlock className="w-full !h-44" />
        </div>
        <div className="rounded p-3 border border-[#1f2335] bg-[#0e1015] space-y-2" aria-hidden="true">
          <div className="flex items-center gap-2">
            <ShimmerBlock className="w-3 h-3 !rounded-full" />
            <ShimmerBlock className="w-32 h-3" />
          </div>
          <ShimmerBlock className="w-32 h-32 mx-auto !rounded-full" />
          <ShimmerBlock className="w-24 h-3 mx-auto !rounded-md" />
        </div>
      </div>
      {/* Skeleton 6-tile Config KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1.5" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`cfg-kpi-${i}`}
            className="kpi-card rounded p-2 border border-[#1f2335] bg-[#0e1015] space-y-1"
          >
            <ShimmerBlock className="w-1/2" />
            <ShimmerBlock className="w-2/3 !h-3" />
          </div>
        ))}
      </div>
      {/* Skeleton per-strategy + multipliers row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded p-3 border border-[#1f2335] bg-[#0e1015] space-y-2" aria-hidden="true">
          <div className="flex items-center gap-2">
            <ShimmerBlock className="w-3 h-3 !rounded-full" />
            <ShimmerBlock className="w-40 h-3" />
            <div className="ml-auto">
              <ShimmerBlock className="w-12 h-2.5" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`strat-${i}`} className="flex items-center gap-2">
              <ShimmerBlock className="w-28 h-2.5" />
              <ShimmerBlock className="flex-1 !h-3 !rounded-sm" />
              <ShimmerBlock className="w-10 h-2.5" />
            </div>
          ))}
        </div>
        <div className="rounded p-3 border border-[#1f2335] bg-[#0e1015] space-y-2" aria-hidden="true">
          <div className="flex items-center gap-2">
            <ShimmerBlock className="w-3 h-3 !rounded-full" />
            <ShimmerBlock className="w-40 h-3" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`mult-${i}`} className="flex items-center justify-between">
              <ShimmerBlock className="w-1/3 h-2.5" />
              <ShimmerBlock className="w-1/4 h-2.5" />
            </div>
          ))}
        </div>
      </div>
      {/* Skeleton recent allocations table */}
      <div className="rounded border border-[#1f2335] bg-[#0e1015] overflow-hidden" aria-hidden="true">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#1f2335]">
          <ShimmerBlock className="w-3 h-3 !rounded-full" />
          <ShimmerBlock className="w-48 h-3" />
          <div className="ml-auto">
            <ShimmerBlock className="w-16 h-2.5 !rounded-md" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`row-${i}`} className="flex items-center gap-3 px-3 py-2 border-b border-[#1f2335]/60">
            <ShimmerBlock className="w-32 h-2.5" />
            <ShimmerBlock className="w-16 h-2.5" />
            <ShimmerBlock className="w-10 h-2.5" />
            <ShimmerBlock className="w-10 h-2.5" />
            <ShimmerBlock className="w-14 h-2.5" />
            <ShimmerBlock className="w-12 h-2.5" />
            <div className="ml-auto">
              <ShimmerBlock className="w-12 h-2.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Polished empty state — recent allocations table when no closed positions
// ─────────────────────────────────────────────────────────────────────────────
function PolishedEmptyState() {
  return (
    <div
      className="empty-state py-8"
      role="status"
      data-testid="capital-allocator-empty-state"
    >
      <History
        className="empty-state-icon text-[#5a637a]"
        size={28}
        aria-hidden="true"
      />
      <div className="empty-state-title">No closed allocations recorded yet</div>
      <div className="empty-state-desc">
        The allocator hasn&apos;t closed any positions in the active window.
        Closed trades will appear here with their predicted edge, confidence,
        size, % of cap, and realised P&amp;L.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Polished error state — red-tinted error card with Retry
//
// Preserves the "Allocator API unavailable" title text verbatim so the
// W28-3 test contract (`getByText('Allocator API unavailable')`) resolves,
// and the Retry button's accessible name "Retry" so the test contract
// (`getByRole('button', { name: /retry/i })`) resolves.
// ─────────────────────────────────────────────────────────────────────────────
interface ErrorStateProps {
  message: string
  onRetry: () => void
  retrying?: boolean
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div className="p-4" data-testid="capital-allocator-error-wrapper">
      <div
        className="error-state border border-red-500/25 bg-red-500/[0.04] rounded-md"
        role="alert"
        data-testid="capital-allocator-error-card"
      >
        <AlertTriangle
          className="error-state-icon text-[#f87171]"
          size={28}
          aria-hidden="true"
        />
        <div className="error-state-title">Allocator API unavailable</div>
        <div className="error-state-desc mono">{message}</div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="btn btn-ghost btn-sm mt-2 text-[10px] border border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100 flex items-center gap-1"
          aria-label="Retry allocator fetch"
          data-testid="capital-allocator-error-retry"
        >
          <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function CapitalAllocatorPanel() {
  const [breakdown, setBreakdown] = useState<AllocatorBreakdown | null>(null)
  const [exposure, setExposure] = useState<ExposureReport | null>(null)
  const [allocations, setAllocations] = useState<ClosedPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── Config editor state ──
  const [draftConfig, setDraftConfig] = useState<AllocatorConfig>(DEFAULT_CONFIG)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const configFormRef = useRef<HTMLFormElement>(null)

  // ── Live allocator config — derived from breakdown response if available,
  //    else fall back to DEFAULT_CONFIG. ──
  const liveConfig: AllocatorConfig = useMemo(() => {
    if (!breakdown) return DEFAULT_CONFIG
    return {
      k: breakdown.edge_k_m ?? DEFAULT_CONFIG.k,
      alpha: breakdown.edge_v_max ?? DEFAULT_CONFIG.alpha,
      max_edge: DEFAULT_CONFIG.max_edge,
      max_position_size: breakdown.cap_usd ?? DEFAULT_CONFIG.max_position_size,
      max_exposure: DEFAULT_CONFIG.max_exposure,
      operating_capital: DEFAULT_CONFIG.operating_capital,
    }
  }, [breakdown])

  // ── Fetch all data ──
  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true)
      setError(null)
    } else {
      setIsRefreshing(true)
    }
    try {
      // Parallel fetch — closed positions (for the recent allocations table
      // AND for the latest edge/confidence to drive the what-if allocation call).
      const closedRes = await apiFetch(`/api/positions/closed?limit=${RECENT_ALLOCATIONS_LIMIT}`)
      let latestEdge = 0.05
      let latestConf = 0.7
      let closedPositions: ClosedPosition[] = []
      if (closedRes.ok) {
        const j = await closedRes.json()
        closedPositions = (j?.positions ?? []) as ClosedPosition[]
        if (closedPositions.length > 0) {
          const latest = closedPositions[0]
          if (typeof latest.predicted_edge === 'number' && latest.predicted_edge > 0) {
            latestEdge = latest.predicted_edge
          }
          if (typeof latest.confidence === 'number' && latest.confidence > 0) {
            latestConf = latest.confidence
          }
        }
      }

      // What-if allocation call — uses latest signal edge/conf to plot the
      // current operating point on the curve.
      const allocUrl =
        `/api/capital/allocation` +
        `?strategy=signal_trader` +
        `&edge=${latestEdge.toFixed(4)}` +
        `&confidence=${latestConf.toFixed(4)}` +
        `&liquidity=100` +
        `&existing_exposure=0` +
        `&drawdown=0`
      const [allocRes, expoRes] = await Promise.all([
        apiFetch(allocUrl),
        apiFetch('/api/exposure'),
      ])

      if (!allocRes.ok) {
        throw new Error(`Allocator endpoint returned ${allocRes.status}`)
      }
      const allocJson = (await allocRes.json()) as AllocatorBreakdown
      setBreakdown(allocJson)

      if (expoRes.ok) {
        setExposure((await expoRes.json()) as ExposureReport)
      }

      setAllocations(closedPositions)
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // ── Initial fetch + 15s polling, paused when document hidden ──
  useEffect(() => {
    fetchAll()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => fetchAll(true), POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVis = () => {
      if (document.hidden) {
        stop()
      } else {
        // Refresh immediately on tab refocus, then resume polling.
        fetchAll(true)
        start()
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchAll])

  // ── Derive utilization & per-strategy split ──
  const deployed = exposure?.capital_invested ?? 0
  const operatingCapital = liveConfig.operating_capital
  const utilizationPct = operatingCapital > 0 ? (deployed / operatingCapital) * 100 : 0
  const availableCash = exposure?.available_cash ?? Math.max(0, operatingCapital - deployed)
  const utilizationToneVal = utilizationTone(utilizationPct)

  // ── Kelly fraction estimate ──
  // For binary-outcome Polymarket positions, Kelly f* = edge / (1 - market_price).
  // Without the market price in the breakdown, we approximate f* ≈ 2 × edge
  // (the Kelly fraction at p_market ≈ 0.5). The breakdown.edge carries the
  // what-if edge used by the allocator, so this is the same edge the curve
  // is plotting. Clamped to [0, 1] for display.
  const kellyFraction = useMemo(() => {
    const edge = breakdown?.edge
    if (edge == null || !Number.isFinite(edge) || edge <= 0) return null
    return Math.max(0, Math.min(1, 2 * edge))
  }, [breakdown])

  const strategySplit = useMemo(() => {
    if (!exposure?.exposure_per_strategy) return []
    const entries = Object.entries(exposure.exposure_per_strategy)
    const total = entries.reduce((a, [, v]) => a + (v || 0), 0)
    return entries
      .map(([name, value]) => ({
        name,
        value: value || 0,
        pct: total > 0 ? ((value || 0) / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [exposure])

  // ── Latest signal edge (operating point on the curve) ──
  const latestSignal = allocations[0] ?? null
  const operatingEdge = latestSignal?.predicted_edge ?? null
  const operatingConf = latestSignal?.confidence ?? null
  // The actual size produced by the allocator at the operating point
  // (from the what-if breakdown call).
  const operatingSize = breakdown?.size_usd ?? null

  // ── Config editor ──
  const openEditor = () => {
    setDraftConfig(liveConfig)
    setSubmitMsg(null)
    setConfirmOpen(true)
  }

  const handleConfirmSubmit = async () => {
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      // Attempt POST to the allocator update endpoint. The current backend
      // (`capital_allocator.py:register_routes`) only registers a GET route;
      // this POST is the intended future endpoint. We handle 404/405
      // gracefully with a clear "endpoint not available" message.
      const res = await apiFetch('/api/capital/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_k_m: draftConfig.k,
          edge_v_max: draftConfig.alpha,
          max_edge: draftConfig.max_edge,
          max_position_size: draftConfig.max_position_size,
          max_exposure: draftConfig.max_exposure,
          operating_capital: draftConfig.operating_capital,
        }),
      })
      if (res.ok) {
        setSubmitMsg({ kind: 'ok', text: 'Allocator config updated successfully.' })
        setConfirmOpen(false)
        // Re-fetch to pick up new values.
        fetchAll(true)
      } else if (res.status === 404 || res.status === 405) {
        setSubmitMsg({
          kind: 'err',
          text:
            'Backend endpoint POST /api/capital/config is not registered. ' +
            'Allocator constants are read-only module-level values (see core/capital_allocator.py).',
        })
      } else {
        let detail = `HTTP ${res.status}`
        try {
          const j = await res.json()
          if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
        } catch {
          /* ignore */
        }
        setSubmitMsg({ kind: 'err', text: `Update failed: ${detail}` })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      setSubmitMsg({ kind: 'err', text: `Update failed: ${msg}` })
    } finally {
      setSubmitting(false)
    }
  }

  const fmtPct100 = (v: number | null | undefined, digits = 1) =>
    v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`

  // ── Render ──
  return (
    <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md">
      {/* ── Header ── */}
      <div className="card-header p-3 border-b border-[#1f2335] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            Capital Allocator
          </span>
          <span className="badge badge-cyan text-[9.5px]">Michaelis-Menten</span>
          {breakdown && (
            <span className="badge badge-dim text-[9px]">
              v_max=${breakdown.edge_v_max.toFixed(2)} · k_m={(breakdown.edge_k_m * 100).toFixed(1)}%
            </span>
          )}
          {!loading && !error && (
            <span
              className="flex items-center gap-1 text-[9px] text-[#5a637a] uppercase tracking-wider font-bold"
              data-tone={utilizationToneVal}
            >
              <PulseDot tone={utilizationToneVal} pulse={utilizationToneVal === 'poor'} />
              {allocationStatusLabel(utilizationPct)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[9.5px] text-[#5a637a] mono tabular-nums">
              updated {fmtAge(lastUpdated / 1000)}
            </span>
          )}
          <button
            onClick={() => fetchAll(true)}
            disabled={isRefreshing || loading}
            className="btn btn-ghost btn-sm text-[10px] flex items-center gap-1 border border-[#1f2335] hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] hover:text-white transition-colors"
            aria-label="Refresh allocator data"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            onClick={openEditor}
            className="btn btn-ghost btn-sm text-[10px] flex items-center gap-1 border border-[#1f2335] hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] hover:text-white transition-colors"
            aria-label="Edit allocator config"
          >
            <Settings className="w-3 h-3" aria-hidden="true" />
            Config
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <SkeletonState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchAll()} retrying={isRefreshing} />
      ) : (
        <div className="p-3 space-y-3">
          {/* ── Capital Metrics KPI strip (Total / Allocated / Available / Kelly) ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiTile
              label="Total Capital"
              value={fmtUsd(operatingCapital, 0)}
              sub="bankroll ceiling"
              icon={Wallet}
              tone="info"
              quality={100}
              testId="capital-allocator-kpi-total"
            />
            <KpiTile
              label="Allocated"
              value={fmtUsd(deployed, 2)}
              sub={`${utilizationPct.toFixed(1)}% deployed`}
              icon={Banknote}
              tone={utilizationToneVal}
              quality={Math.min(100, utilizationPct)}
              testId="capital-allocator-kpi-allocated"
            />
            <KpiTile
              label="Available"
              value={fmtUsd(availableCash, 2)}
              sub="free bankroll"
              icon={PiggyBank}
              tone={utilizationToneVal === 'poor' ? 'poor' : utilizationToneVal === 'warn' ? 'warn' : 'good'}
              quality={Math.max(0, 100 - utilizationPct)}
              testId="capital-allocator-kpi-available"
            />
            <KpiTile
              label="Kelly Fraction"
              value={kellyFraction == null ? '—' : `${(kellyFraction * 100).toFixed(1)}%`}
              sub="per-trade optimal"
              icon={Target}
              tone={kellyFraction == null ? 'neutral' : kellyTone(kellyFraction)}
              quality={kellyFraction == null ? 0 : kellyFraction * 100}
              testId="capital-allocator-kpi-kelly"
            />
          </div>

          {/* ── Top row: Curve + Config KPIs + Gauge ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Edge → Size curve */}
            <div className="lg:col-span-2 bg-[#0e1015] rounded p-3 border border-[#1f2335]">
              <SectionHeader
                icon={TrendingUp}
                title="Edge → Size Saturating Curve"
                tone="info"
                description="Michaelis-Menten sizing"
                trailing={
                  <div className="flex items-center gap-2 text-[9px] mono">
                    <span className="text-cyan-400">● curve</span>
                    {operatingEdge != null && (
                      <span className="text-amber-400">● live op-point</span>
                    )}
                  </div>
                }
              />
              <div className="h-44">
                <EdgeSizeCurve
                  k={liveConfig.k}
                  vMax={liveConfig.alpha}
                  maxEdge={liveConfig.max_edge}
                  operatingEdge={operatingEdge}
                  operatingSize={operatingSize}
                />
              </div>
              {operatingEdge != null && operatingSize != null && (
                <div className="mt-1.5 flex items-center justify-between text-[9.5px] mono text-[#7e8aaa] tabular-nums">
                  <span>
                    op-point: edge={(operatingEdge * 100).toFixed(2)}%
                    {operatingConf != null && ` · conf=${(operatingConf * 100).toFixed(0)}%`}
                  </span>
                  <span className="text-amber-400 font-semibold">
                    size=${operatingSize.toFixed(4)}
                  </span>
                </div>
              )}
              {/* Kelly criterion bar — complements the curve + gauge */}
              <div className="mt-3 pt-3 border-t border-[#1f2335]">
                <KellyBar fraction={kellyFraction} />
              </div>
            </div>

            {/* Right column: Gauge + Kelly status */}
            <div className="flex flex-col gap-3">
              {/* Utilization gauge */}
              <div className="bg-[#0e1015] rounded p-3 border border-[#1f2335]">
                <SectionHeader
                  icon={GaugeIcon}
                  title="Capital Utilization"
                  tone={utilizationToneVal}
                  description="deployed vs cap"
                />
                <UtilizationGauge
                  pct={utilizationPct}
                  deployed={deployed}
                  capital={operatingCapital}
                />
              </div>
              {/* Exposure summary tile */}
              <div className="bg-[#0e1015] rounded p-3 border border-[#1f2335]">
                <SectionHeader
                  icon={Scale}
                  title="Exposure Summary"
                  tone="info"
                  description="net directional + dollar-days"
                />
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa]">Net Directional</span>
                    <span className="mono tabular-nums text-cyan-300 font-semibold">
                      {fmtUsd(exposure?.net_directional_exposure ?? 0, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa]">Gross Market Value</span>
                    <span className="mono tabular-nums text-cyan-300 font-semibold">
                      {fmtUsd(exposure?.gross_market_value ?? 0, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa]">Max Remaining Loss</span>
                    <span className="mono tabular-nums text-amber-400 font-semibold">
                      {fmtUsd(exposure?.maximum_remaining_loss ?? 0, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa]">Dollar-Days</span>
                    <span className="mono tabular-nums text-[#dde1ed]">
                      {(exposure?.exposure_dollar_days ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa]">Avg Duration</span>
                    <span className="mono tabular-nums text-[#dde1ed]">
                      {(exposure?.exposure_duration_hours_avg ?? 0).toFixed(2)}h
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] border-t border-[#1f2335] pt-1 mt-1">
                    <span className="text-[#7e8aaa] font-semibold">Open Positions</span>
                    <span className="mono tabular-nums text-[#dde1ed] font-semibold">
                      {exposure?.open_position_count ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Config KPI strip ── */}
          <div className="bg-[#0e1015] rounded p-3 border border-[#1f2335]">
            <SectionHeader
              icon={Settings}
              title="Allocator Parameters"
              tone="neutral"
              description="saturating-edge curve constants"
              trailing={
                <span className="badge badge-dim text-[9px]">read-only</span>
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1.5">
              {[
                {
                  label: 'k (half-sat)',
                  value: fmtPct100(liveConfig.k, 1),
                  icon: Crosshair,
                  tone: 'info' as Tone,
                },
                {
                  label: 'α (v_max)',
                  value: fmtUsd(liveConfig.alpha, 2),
                  icon: TrendingUp,
                  tone: 'info' as Tone,
                },
                {
                  label: 'Max Edge',
                  value: fmtPct100(liveConfig.max_edge, 0),
                  icon: Activity,
                  tone: 'info' as Tone,
                },
                {
                  label: 'Max Position',
                  value: fmtUsd(liveConfig.max_position_size, 2),
                  icon: Banknote,
                  tone: 'good' as Tone,
                },
                {
                  label: 'Max Exposure',
                  value: fmtUsd(liveConfig.max_exposure, 2),
                  icon: Wallet,
                  tone: 'warn' as Tone,
                },
                {
                  label: 'Operating Cap',
                  value: fmtUsd(liveConfig.operating_capital, 0),
                  icon: Coins,
                  tone: 'info' as Tone,
                },
              ].map((kpi) => (
                <KpiTile
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  tone={kpi.tone}
                  testId="capital-allocator-kpi-config"
                />
              ))}
            </div>
          </div>

          {/* ── Per-strategy allocation + Breakdown multipliers ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Per-strategy allocation bar chart */}
            <div className="lg:col-span-2 bg-[#0e1015] rounded p-3 border border-[#1f2335]">
              <SectionHeader
                icon={Layers}
                title="Capital Split by Strategy"
                tone="info"
                description="per-strategy deployed USD"
                trailing={
                  <span className="text-[9px] text-[#5a637a] mono tabular-nums">
                    {strategySplit.length} active
                  </span>
                }
              />
              {strategySplit.length === 0 ? (
                <div className="text-[10.5px] text-[#5a637a] text-center py-6 mono">
                  No open exposure — capital is idle.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
                  {strategySplit.map((s) => {
                    const stratPctOfCap =
                      operatingCapital > 0
                        ? (s.value / operatingCapital) * 100
                        : 0
                    const sTone = utilizationTone(stratPctOfCap)
                    const sStyle = utilizationStyle(stratPctOfCap)
                    return (
                      <div
                        key={s.name}
                        className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-cyan-500/[0.04] transition-colors"
                        data-tone={sTone}
                        title={`${s.name} — ${fmtUsd(s.value, 2)} (${s.pct.toFixed(1)}% of total deployed, ${stratPctOfCap.toFixed(1)}% of cap)`}
                      >
                        <span
                          className="text-[10px] text-[#dde1ed] w-32 truncate shrink-0 mono"
                          title={s.name}
                        >
                          {s.name || '<unknown>'}
                        </span>
                        <div className="flex-1 h-3 bg-[#080910] rounded-sm overflow-hidden border border-[#181c28]">
                          <div
                            className="h-full rounded-sm transition-all duration-500"
                            style={{
                              width: `${Math.max(2, s.pct)}%`,
                              background: sStyle.stroke,
                              boxShadow: `0 0 8px ${sStyle.ring}`,
                            }}
                          />
                        </div>
                        <span className="mono text-[10px] text-cyan-300 font-semibold w-12 text-right shrink-0 tabular-nums">
                          {fmtUsd(s.value, 2)}
                        </span>
                        <span className="mono text-[9px] text-[#5a637a] w-10 text-right shrink-0 tabular-nums">
                          {s.pct.toFixed(0)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Latest what-if multiplier breakdown */}
            {breakdown && (
              <div className="bg-[#0e1015] rounded p-3 border border-[#1f2335]">
                <SectionHeader
                  icon={Zap}
                  title="Latest What-If Multipliers"
                  tone="warn"
                  description="sizing stack"
                />
                <div className="space-y-1">
                  {[
                    { name: 'raw_size', val: breakdown.components.raw_size, suffix: '$' },
                    { name: 'confidence', val: breakdown.components.confidence_mult, suffix: '×' },
                    { name: 'calibration', val: breakdown.components.calibration_mult, suffix: '×' },
                    { name: 'drawdown', val: breakdown.components.drawdown_mult, suffix: '×' },
                    { name: 'correlation', val: breakdown.components.correlation_mult, suffix: '×' },
                    { name: 'performance', val: breakdown.components.performance_mult, suffix: '×' },
                    { name: 'liquidity', val: breakdown.components.liquidity_mult, suffix: '×' },
                  ].map((m) => {
                    const mTone: Tone =
                      m.val >= 0.9 ? 'good' : m.val >= 0.5 ? 'warn' : 'poor'
                    return (
                      <div
                        key={m.name}
                        className="flex justify-between text-[10px] rounded-sm px-1 py-0.5 hover:bg-[#1f2335]/40 transition-colors"
                        data-tone={mTone}
                        title={`${m.name} multiplier — ${m.val.toFixed(4)}${m.suffix === '$' ? '' : m.suffix}`}
                      >
                        <span className="text-[#7e8aaa]">{m.name}</span>
                        <span
                          className={`mono font-semibold tabular-nums ${TONE[mTone].text}`}
                        >
                          {m.suffix === '$'
                            ? fmtUsd(m.val, 4)
                            : m.val.toFixed(3) + m.suffix}
                        </span>
                      </div>
                    )
                  })}
                  <div className="border-t border-[#1f2335] mt-1 pt-1 flex justify-between text-[10px]">
                    <span className="text-[#7e8aaa] font-semibold">product</span>
                    <span className="mono font-bold text-cyan-300 tabular-nums">
                      {breakdown.components.product_mult.toFixed(4)}×
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-[#7e8aaa] font-semibold">→ size</span>
                    <span className="mono font-bold text-amber-400 tabular-nums">
                      {fmtUsd(breakdown.size_usd, 4)}
                    </span>
                  </div>
                  {breakdown.model_brier != null && (
                    <div className="flex justify-between text-[9.5px] text-[#5a637a] mono mt-1 tabular-nums">
                      <span>model_brier</span>
                      <span>{breakdown.model_brier.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Recent allocations table ── */}
          <div className="bg-[#0e1015] rounded border border-[#1f2335] overflow-hidden">
            <div className="card-header p-2.5 border-b border-[#1f2335] flex justify-between items-center">
              <SectionHeader
                icon={History}
                title={`Recent Allocations (last ${RECENT_ALLOCATIONS_LIMIT})`}
                tone="info"
                trailing={
                  <span className="badge badge-dim text-[9px]">
                    {allocations.length} closed
                  </span>
                }
              />
            </div>
            <div className="max-h-80 table-responsive scrollbar-thin">
              <table className="data-table" aria-label="Capital allocation history">
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">Strategy</th>
                    <th scope="col">Edge</th>
                    <th scope="col">Conf</th>
                    <th scope="col">Size</th>
                    <th scope="col">% Cap</th>
                    <th scope="col">P&amp;L</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <PolishedEmptyState />
                      </td>
                    </tr>
                  ) : (
                    allocations.map((p) => {
                      const slug =
                        (p.data?.slug as string | undefined) ??
                        (typeof p.data?.market_slug === 'string' ? p.data.market_slug : '') ??
                        p.token_id?.slice(0, 14) ??
                        '—'
                      const sizeUsd =
                        p.entry_price != null && p.shares != null
                          ? p.entry_price * p.shares
                          : null
                      const pctCap =
                        sizeUsd != null
                          ? (sizeUsd / liveConfig.max_position_size) * 100
                          : null
                      const edge = p.predicted_edge
                      const conf = p.confidence
                      const pnl = p.pnl
                      // Tone-coloured allocation status — green optimal /
                      // amber over-allocated / red danger — derived from
                      // the per-trade % of cap.
                      const allocTone: Tone =
                        pctCap == null
                          ? 'neutral'
                          : pctCap > 80
                            ? 'poor'
                            : pctCap >= 50
                              ? 'warn'
                              : 'good'
                      return (
                        <tr
                          key={`${p.id}-${p.position_id ?? p.token_id}`}
                          data-tone={allocTone}
                          className={TONE[allocTone].rowHover}
                        >
                          <td className="label-col" title={p.token_id}>
                            <div className="max-w-[180px] truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {slug || '—'}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-dim text-[9px]">
                              {(p.strategy || '—').slice(0, 16)}
                            </span>
                          </td>
                          <td>
                            {edge == null ? (
                              <span className="text-[#3e4560]">—</span>
                            ) : (
                              <span
                                className={`tabular-nums ${
                                  edge > 0 ? TONE.good.text : TONE.poor.text
                                }`}
                              >
                                {(edge * 100).toFixed(2)}%
                              </span>
                            )}
                          </td>
                          <td>
                            {conf == null ? (
                              <span className="text-[#3e4560]">—</span>
                            ) : (
                              <span
                                className={`tabular-nums ${
                                  conf >= 0.7
                                    ? TONE.good.text
                                    : conf >= 0.5
                                      ? TONE.warn.text
                                      : TONE.poor.text
                                }`}
                              >
                                {(conf * 100).toFixed(0)}%
                              </span>
                            )}
                          </td>
                          <td className={`text-cyan-300 tabular-nums`}>
                            {sizeUsd == null ? '—' : fmtUsd(sizeUsd, 4)}
                          </td>
                          <td>
                            {pctCap == null ? (
                              <span className="text-[#3e4560]">—</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <div className="w-10 h-1 bg-[#1f2335] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${TONE[allocTone].bar}`}
                                    style={{
                                      width: `${Math.min(100, pctCap)}%`,
                                    }}
                                  />
                                </div>
                                <span className={`text-[9.5px] tabular-nums ${TONE[allocTone].text}`}>
                                  {pctCap.toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            {pnl == null || pnl === 0 ? (
                              <span className="text-[#3e4560]">—</span>
                            ) : (
                              <span className={`tabular-nums ${pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                {pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(4)}
                              </span>
                            )}
                          </td>
                          <td className="text-[#7e8aaa] tabular-nums">
                            {fmtAge(p.timestamp)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Config editor confirmation dialog (shadcn/ui AlertDialog) ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-[#13161e] border border-[#2d3450] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#dde1ed] flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Allocator Configuration
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#7e8aaa] text-xs">
              Adjust the saturating edge curve parameters. Changes will be POSTed
              to <code className="mono text-cyan-400">/api/capital/config</code>.
              The current backend (<code className="mono">capital_allocator.py</code>)
              treats these as read-only module constants — the POST endpoint may
              not be registered. Each field carries a slider + numeric input
              for tactile scrubbing.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            ref={configFormRef}
            className="grid grid-cols-2 gap-3 py-1"
            onSubmit={(e) => {
              e.preventDefault()
              handleConfirmSubmit()
            }}
          >
            {/* k (half-saturation edge) */}
            <ConfigField
              id="cfg-k"
              label="k (half-saturation edge)"
              hint="decimal (0.05 = 5%)"
              value={draftConfig.k}
              min={0.005}
              max={0.5}
              step={0.005}
              format={(v) => fmtPct100(v, 1)}
              onChange={(v) => setDraftConfig({ ...draftConfig, k: v })}
            />
            {/* α (asymptotic max size, $) */}
            <ConfigField
              id="cfg-alpha"
              label="α (asymptotic max size, $)"
              hint="V_MAX in $"
              value={draftConfig.alpha}
              min={0.5}
              max={20}
              step={0.25}
              format={(v) => fmtUsd(v, 2)}
              onChange={(v) => setDraftConfig({ ...draftConfig, alpha: v })}
            />
            {/* max edge (display range) */}
            <ConfigField
              id="cfg-max-edge"
              label="Max edge (display range)"
              hint="decimal (0.20 = 20%)"
              value={draftConfig.max_edge}
              min={0.05}
              max={1}
              step={0.01}
              format={(v) => fmtPct100(v, 0)}
              onChange={(v) => setDraftConfig({ ...draftConfig, max_edge: v })}
            />
            {/* max position size */}
            <ConfigField
              id="cfg-max-pos"
              label="Max position size ($)"
              hint="per-market cap"
              value={draftConfig.max_position_size}
              min={0.5}
              max={20}
              step={0.25}
              format={(v) => fmtUsd(v, 2)}
              onChange={(v) =>
                setDraftConfig({ ...draftConfig, max_position_size: v })
              }
            />
            {/* max exposure */}
            <ConfigField
              id="cfg-max-exp"
              label="Max exposure ($)"
              hint="per-market concentration"
              value={draftConfig.max_exposure}
              min={1}
              max={50}
              step={0.5}
              format={(v) => fmtUsd(v, 2)}
              onChange={(v) =>
                setDraftConfig({ ...draftConfig, max_exposure: v })
              }
            />
            {/* operating capital */}
            <ConfigField
              id="cfg-cap"
              label="Operating capital ($)"
              hint="bankroll ceiling"
              value={draftConfig.operating_capital}
              min={10}
              max={10000}
              step={10}
              format={(v) => fmtUsd(v, 0)}
              onChange={(v) =>
                setDraftConfig({ ...draftConfig, operating_capital: v })
              }
            />

            {/* Status / message */}
            {submitMsg && (
              <div
                className={`col-span-2 banner-${
                  submitMsg.kind === 'ok' ? 'info' : 'danger'
                } text-[10.5px] flex items-start gap-2`}
                role={submitMsg.kind === 'ok' ? 'status' : 'alert'}
              >
                {submitMsg.kind === 'ok' ? (
                  <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <span className="mono">{submitMsg.text}</span>
              </div>
            )}
          </form>

          <AlertDialogFooter>
            <AlertDialogCancel className="btn btn-ghost">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmSubmit()
              }}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                'Save Config'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfigField — refined allocation control (range slider + numeric input)
//
// Each field in the AlertDialog config editor now carries a slider alongside
// the existing number input, so the operator can scrub the value continuously
// with tactile feedback. The slider's value is bidirectionally synced with
// the numeric input — both update the same draftConfig field. Tone-coloured
// when the value is at the min/max of its range so the operator reads the
// saturation state at a glance.
// ─────────────────────────────────────────────────────────────────────────────
interface ConfigFieldProps {
  id: string
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function ConfigField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: ConfigFieldProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const tone: Tone = pct >= 90 ? 'poor' : pct >= 70 ? 'warn' : 'good'
  const cfg = TONE[tone]
  return (
    <div className="form-group mb-0">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        max={max}
        className="input input-sm"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {/* Range slider — bidirectionally synced with the number input */}
      <input
        type="range"
        step={step}
        min={min}
        max={max}
        value={Math.max(min, Math.min(max, value))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        aria-label={`${label} slider`}
        className="w-full h-1.5 mt-1.5 appearance-none rounded-full bg-[#1f2335] accent-cyan-400 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="form-hint">{hint}</span>
        <span className={`mono text-[9px] font-semibold tabular-nums ${cfg.text}`}>
          {format(value)}
        </span>
      </div>
    </div>
  )
}

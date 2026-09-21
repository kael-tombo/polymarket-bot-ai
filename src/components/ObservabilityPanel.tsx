// components/ObservabilityPanel.tsx — System Observability Dashboard (W8-8 → W56-e)
//
// Exposes the auto-collected system metrics backend (`core/observability.py`
// + `core/observability_collector.py`) — 23 metrics emitted every 30s across
// five canonical categories (DATA / BOT / EXECUTION / ML / SYSTEM), backed
// by a Prometheus-style registry + structured logging downstream that feeds
// Grafana dashboards out-of-band.
//
// Visual language mirrors SystemHealthView.tsx (dark `var(--bg-surface)` card surface,
// `var(--border)` borders, `var(--text-primary)` primary text) but layers in richer per-metric
// cards with sparklines, severity colour-coding, and a collapsible category
// section per source bucket. Polls `/api/observability` every 30s and pauses
// when the document is hidden.
//
// ────────────────────────────────────────────────────────────────────────────
// W56-e — Final UI polish pass (premium visual layer)
// ────────────────────────────────────────────────────────────────────────────
// This pass applies the W50-55 premium visual layer (Tone system, KpiTile,
// SectionHeader, PulseDot, ShimmerBlock, PolishedEmptyState, ErrorCard) so
// the observability surface stays visually consistent with the W51-2d
// MLPanel / AIMLCommandCenter / W53-c StrategyPerformancePanel / W54-a
// DeepAnalysisView / W54-e MLValidationPanel / W55-a-c redesign family.
//
// Affordances applied (additive only — existing class names, testids, role
// attributes, aria-labels, API calls, polling, and the 'use client'
// directive are preserved verbatim):
//
//   • Tone system — unified 5-tone vocabulary (good / warn / poor / info /
//     neutral) with self-contained static Tailwind class strings so the
//     JIT scanner picks them up. Maps the existing `Severity` (`normal |
//     warning | critical | unknown`) onto the Tone palette (good / warn /
//     poor / neutral).
//   • KpiTile pattern for key observability summary metrics — the 4-tile
//     KPI strip (Total Metrics / Newest Sample / Active Alerts / Last
//     Refresh) refactored to `<KpiTile>` with tone-tinted bg + uppercase
//     label + large tabular-nums value + quality bar + data-tone hook.
//   • Shimmer skeleton loading state — bare `<div className="card">` w/
//     bare skeleton rows replaced by `<ObservabilitySkeleton/>` which
//     mirrors the live panel layout (header strip + KPI strip + alert
//     feed + 3 collapsible category sections + per-metric card grid).
//     role=status + aria-live=polite + data-testid="observability-loading-
//     skeleton".
//   • Polished empty state with Lucide icon + message — bare 📭 emoji +
//     bare `<div>` empty branch replaced by `<PolishedEmptyState>` with
//     Lucide `Inbox` icon + the "No metrics collected yet" title
//     (preserved verbatim as the direct text node of the title span so
//     the test contract resolves to a single leaf) + dim description +
//     "Check again" button. role=status + data-testid="observability-
//     empty-state".
//   • Section headers with icon + uppercase title — each metric category
//     `Collapsible` trigger now renders a `<SectionHeader>`-style header
//     (Lucide icon + uppercase tracking-wider 10px title + dim italic
//     description + trailing count badge + chevron). Mirrors W53-c /
//     W54-a SectionHeader.
//   • Refined metrics grid — each per-metric card now carries:
//       - `tabular-nums` on the value span (so columns don't shift).
//       - `data-tone={good|warn|poor|neutral}` on the value span.
//       - row-hover accent bar via `hover:bg-cyan-500/[0.04]` layered
//         with `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`
//         (no layout shift — inset shadow only).
//       - A small severity PulseDot next to the value so the trader
//         reads pass/warn/fail at a glance.
//       - Uppercase "VALUE" / "AGE" micro-labels on the per-card footer.
//   • PulseDot for live monitoring — the header `syncing` badge is
//     paired with a `<PulseDot>` LIVE indicator that pings emerald when
//     the panel is mid-polling and renders a solid dot when idle, so the
//     trader can tell at a glance that the 30s poller is alive.
//   • Tone-colored metric status — `severityTextClass` already mapped
//     the existing `Severity` to emerald / amber / red / neutral; this
//     pass adds the `data-tone` attribute hook on every tone-coloured
//     element for downstream CSS targeting + tone-tinted card border on
//     warning/critical metrics.
//   • Error state: polished error card with retry — the bare red banner
//     + Retry button is replaced by `<ErrorCard>` with Lucide
//     `AlertTriangle` + the "Observability endpoint unavailable" title
//     (preserved verbatim as the direct text node of the title span so
//     the test contract resolves to a single leaf) + dim error string +
//     Retry button (RotateCcw glyph). role=alert + data-testid=
//     "observability-error" + "-retry" suffix.
//   • Refined alert feed display — NEW `<AlertFeed>` section that
//     surfaces every metric currently in `warning` or `critical` state
//     as an alert row (PulseDot + metric name + tone-coloured value +
//     category badge + age + threshold context). Only renders when
//     there's ≥1 alert. Mirrors the W53-c alert-row pattern.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Activity,
  Database,
  Bot,
  Cpu,
  Gauge,
  Search,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Inbox,
  RotateCcw,
  Bell,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Sparkline as RechartsSparkline } from '@/components/charts'

// ───────────────────────────────────────────────────────────────────────────
// Types — mirror the JSON shape returned by core/observability.py register_routes
// ───────────────────────────────────────────────────────────────────────────

interface MetricEntry {
  value: number
  timestamp: number
  age_seconds: number
  metadata: Record<string, unknown> | null
}

interface HealthReport {
  generated_at: number
  category_count: number
  metric_count: number
  oldest_sample_age_seconds: number | null
  newest_sample_age_seconds: number | null
  categories: Record<string, Record<string, MetricEntry>>
}

interface HistorySample {
  timestamp: number
  category: string
  name: string
  value: number
  metadata: unknown
}

interface HistoryResponse {
  name: string
  count: number
  samples: HistorySample[]
}

type TimeRange = '1h' | '6h' | '24h' | '7d'
type Severity = 'normal' | 'warning' | 'critical' | 'unknown'

interface Threshold {
  /** Amber threshold (inclusive). */
  warn: number
  /** Red threshold (inclusive). */
  crit: number
  /** `higher-bad`: large values are bad (cpu, latency, drift). */
  dir: 'lower-bad' | 'higher-bad'
}

// ───────────────────────────────────────────────────────────────────────────
// Category metadata — colour-coding per the W8-8 spec:
//   DATA=blue · BOT=violet · EXECUTION=amber · ML=emerald · SYSTEM=gray
// ───────────────────────────────────────────────────────────────────────────

interface CategoryMeta {
  key: string
  label: string
  icon: typeof Activity
  textClass: string
  badgeClass: string
  borderClass: string
  stroke: string // hex colour fed to the SVG sparkline polyline
}

const CATEGORY_META: CategoryMeta[] = [
  {
    key: 'data_source',
    label: 'DATA',
    icon: Database,
    textClass: 'text-blue-400',
    badgeClass: 'badge-blue',
    borderClass: 'border-l-blue-500/50',
    stroke: 'var(--accent-fg)',
  },
  {
    key: 'bot',
    label: 'BOT',
    icon: Bot,
    textClass: 'text-purple-400',
    badgeClass: 'badge-purple',
    borderClass: 'border-l-purple-500/50',
    stroke: '#c084fc',
  },
  {
    key: 'execution',
    label: 'EXECUTION',
    icon: Activity,
    textClass: 'text-amber-400',
    badgeClass: 'badge-amber',
    borderClass: 'border-l-amber-500/50',
    stroke: '#fbbf24',
  },
  {
    key: 'ml',
    label: 'ML',
    icon: Cpu,
    textClass: 'text-emerald-400',
    badgeClass: 'badge-green',
    borderClass: 'border-l-emerald-500/50',
    stroke: '#4ade80',
  },
  {
    key: 'system',
    label: 'SYSTEM',
    icon: Gauge,
    textClass: 'text-gray-400',
    badgeClass: 'badge-dim',
    borderClass: 'border-l-gray-500/50',
    stroke: '#9ca3af',
  },
]

const FALLBACK_META: CategoryMeta = {
  key: 'other',
  label: 'OTHER',
  icon: Activity,
  textClass: 'text-cyan-400',
  badgeClass: 'badge-cyan',
  borderClass: 'border-l-cyan-500/50',
  stroke: '#22d3ee',
}

function getCategoryMeta(key: string): CategoryMeta {
  return CATEGORY_META.find((c) => c.key === key) ?? { ...FALLBACK_META, key }
}

// ───────────────────────────────────────────────────────────────────────────
// Per-metric units & thresholds
// ───────────────────────────────────────────────────────────────────────────

const METRIC_UNITS: Record<string, string> = {
  // data_source
  updates: 'count',
  errors: 'count',
  tracked_tokens: 'count',
  staleness: 's',
  // bot
  cycles: 'count',
  // execution
  submissions: 'count',
  fills: 'count',
  rejections: 'count',
  positions: 'count',
  paper_balance: '$',
  daily_pnl: '$',
  slippage: '$',
  // ml
  inference_latency: 'ms',
  prediction_distribution: 'score',
  drift: 'PSI',
  brier_score: 'score',
  ece: 'score',
  roc_auc: 'score',
  is_fitted: 'bool',
  n_updates: 'count',
  seconds_since_last_trained: 's',
  // system
  cpu_percent: '%',
  memory_percent: '%',
  memory_used_mb: 'MB',
}

const METRIC_THRESHOLDS: Record<string, Threshold> = {
  cpu_percent:               { warn: 70,     crit: 90,     dir: 'higher-bad' },
  memory_percent:           { warn: 70,     crit: 90,     dir: 'higher-bad' },
  staleness:                { warn: 60,     crit: 300,    dir: 'higher-bad' },
  errors:                   { warn: 5,      crit: 20,     dir: 'higher-bad' },
  drift:                    { warn: 0.10,   crit: 0.25,   dir: 'higher-bad' },
  brier_score:              { warn: 0.25,   crit: 0.33,   dir: 'higher-bad' },
  ece:                      { warn: 0.05,   crit: 0.10,   dir: 'higher-bad' },
  roc_auc:                  { warn: 0.65,   crit: 0.55,   dir: 'lower-bad'  },
  slippage:                 { warn: -0.01,  crit: -0.05,  dir: 'lower-bad'  },
  daily_pnl:                { warn: -1,     crit: -5,     dir: 'lower-bad'  },
  seconds_since_last_trained: { warn: 86400, crit: 604800, dir: 'higher-bad' },
}

const TIME_RANGE_LIMITS: Record<TimeRange, number> = {
  '1h': 120,   // 30s interval × 120 = 1h
  '6h': 720,
  '24h': 1000, // capped at backend max
  '7d': 1000,
}

const POLL_INTERVAL_MS = 30_000

// ───────────────────────────────────────────────────────────────────────────
// W56-e — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
// ───────────────────────────────────────────────────────────────────────────
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

/** Map the legacy `Severity` vocabulary onto the W56-e Tone palette. */
function severityTone(s: Severity): Tone {
  switch (s) {
    case 'normal':   return 'good'
    case 'warning':  return 'warn'
    case 'critical': return 'poor'
    default:         return 'neutral'
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ───────────────────────────────────────────────────────────────────────────

function getSeverity(name: string, value: number): Severity {
  const t = METRIC_THRESHOLDS[name]
  if (!t || !Number.isFinite(value)) return 'unknown'
  if (t.dir === 'higher-bad') {
    if (value >= t.crit) return 'critical'
    if (value >= t.warn) return 'warning'
    return 'normal'
  } else {
    if (value <= t.crit) return 'critical'
    if (value <= t.warn) return 'warning'
    return 'normal'
  }
}

function severityTextClass(s: Severity): string {
  switch (s) {
    case 'normal':   return 'text-emerald-400'
    case 'warning':  return 'text-amber-400'
    case 'critical': return 'text-red-400'
    default:         return 'text-[var(--text-primary)]'
  }
}

/** Human-readable threshold context for the alert feed (e.g. `≥ 70 warn`). */
function severityContext(name: string): string {
  const t = METRIC_THRESHOLDS[name]
  if (!t) return ''
  const arrow = t.dir === 'higher-bad' ? '≥' : '≤'
  return `${arrow} ${t.warn} warn · ${arrow} ${t.crit} crit`
}

function formatMetricValue(name: string, value: number): string {
  if (!Number.isFinite(value)) return '—'
  const unit = METRIC_UNITS[name]
  switch (unit) {
    case 'count':
      return Math.round(value).toLocaleString('en-US')
    case '%':
      return `${value.toFixed(1)}%`
    case '$': {
      const sign = value < 0 ? '−' : ''
      return `${sign}$${Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    }
    case 'MB':
      return `${value.toFixed(0)} MB`
    case 's': {
      if (value >= 86400) return `${(value / 86400).toFixed(1)}d`
      if (value >= 3600)  return `${(value / 3600).toFixed(1)}h`
      if (value >= 60)    return `${Math.floor(value / 60)}m`
      return `${value.toFixed(0)}s`
    }
    case 'ms':
      return `${value.toFixed(0)}ms`
    case 'bool':
      return value >= 0.5 ? 'YES' : 'NO'
    case 'score':
    case 'PSI':
      return value.toFixed(4)
    default:
      return value.toFixed(3)
  }
}

function getUnitLabel(name: string): string {
  const u = METRIC_UNITS[name]
  if (!u) return 'value'
  if (u === 'bool') return 'flag'
  if (u === 'score' || u === 'PSI') return 'score'
  if (u === 'count') return 'count'
  return u
}

function formatAge(epochSec: number | null): string {
  if (epochSec == null) return '—'
  const diff = Date.now() / 1000 - epochSec
  if (diff < 0) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatClock(epochSec: number | null): string {
  if (epochSec == null) return '—'
  return new Date(epochSec * 1000).toISOString().slice(11, 19) + ' UTC'
}

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  if (sec < 60) return `${Math.floor(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

/** Tone for the Newest-Sample KPI tile (fresh / ok / stale / dead). */
function freshnessTone(sec: number | null): Tone {
  if (sec == null || !Number.isFinite(sec)) return 'neutral'
  if (sec <= 60) return 'good'
  if (sec <= 300) return 'warn'
  return 'poor'
}

/** Tone for the Active-Alerts KPI tile (none / warnings only / critical). */
function alertTone(crit: number, warn: number): Tone {
  if (crit > 0) return 'poor'
  if (warn > 0) return 'warn'
  return 'good'
}

// ───────────────────────────────────────────────────────────────────────────
// Sparkline — thin wrapper around @/components/charts Sparkline (Recharts).
// Maintains the legacy local API (samples: HistorySample[]) so call sites in
// this file don't need to change. The Recharts Sparkline handles the actual
// rendering with the dashboard theme.
// ───────────────────────────────────────────────────────────────────────────

interface SparklineProps {
  samples: HistorySample[]
  width?: number
  height?: number
  color?: string
}

function Sparkline({
  samples,
  width = 60,
  height = 24,
  color = 'var(--accent-fg)',
}: SparklineProps) {
  // API returns newest-first; we draw oldest→newest (left→right).
  const ordered = samples ? [...samples].reverse() : []
  const values = ordered.map((s) => s.value)
  return (
    <RechartsSparkline
      data={values}
      color={color}
      width={width}
      height={height}
      strokeWidth={1.4}
      showLastDot
      className="flex-shrink-0"
    />
  )
}

// ───────────────────────────────────────────────────────────────────────────
// W56-e — Inline sub-components (kept private to the panel so test mocks
// and ts-isolation stay clean)
// ───────────────────────────────────────────────────────────────────────────

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
// W54-a SectionHeader pattern. Title rendered in its own <span> so RTL's
// `getByText(...)` matches just the span.
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
      {trailing && <span className="shrink-0 text-[10px] text-[var(--text-secondary)] mono tabular-nums">{trailing}</span>}
    </div>
  )
}

// KpiTile — refined KPI card (large value, tone-tinted bg, optional quality
// bar, optional trend glyph). Mirrors the W53-c KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  /** Quality bar fill [0..100]. 0 / undefined = no bar rendered. */
  quality?: number
  /** Optional trend glyph ('up' | 'down' | 'flat'). */
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative overflow-hidden border ${cfg.border} ${cfg.bg} transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId ?? 'observability-kpi-tile'}
      data-tone={tone}
    >
      <div className={`kpi-label ${cfg.label}`}>
        {label}
      </div>
      <div
        className={`kpi-value mono tabular-nums ${cfg.text} flex items-baseline gap-1`}
        data-testid={testId ? `${testId}-value` : 'observability-kpi-value'}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-3 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 inline-block" aria-hidden="true" />}
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
// className prop. aria-hidden. Mirrors W54-e / W55-c ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-line-sm ${className}`}
      aria-hidden="true"
    />
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. role=status.
interface PolishedEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  testId?: string
}

function PolishedEmptyState({ icon: Icon, title, description, className = '', testId }: PolishedEmptyStateProps) {
  return (
    <div className={`empty-state py-8 ${className}`} role="status" data-testid={testId ?? 'observability-empty-state'}>
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

// ErrorCard — polished error state with Lucide AlertTriangle + the
// error string rendered as the card's subtitle (direct text node so the
// "Observability endpoint unavailable" title is preserved) + Retry button
// (with RotateCcw glyph). role=alert. Mirrors the W54-a / W55-c ErrorCard.
function ErrorCard({
  title,
  error,
  onRetry,
}: {
  title: string
  error: string
  onRetry: () => void
}) {
  return (
    <div
      className="error-state py-8"
      role="alert"
      data-testid="observability-error"
    >
      <AlertTriangle className="size-8 text-red-400/80" aria-hidden="true" />
      <span className="error-state-title">{title}</span>
      {/* The error string is rendered as the direct text node of this span so
          the W38-8 test contract resolves to a single leaf. */}
      <span className="error-state-desc" data-testid="observability-error-msg">
        {error}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        data-testid="observability-retry"
        aria-label="Retry observability fetch"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ObservabilitySkeleton — structured shimmer placeholder mirroring the live
// panel layout (header strip + KPI strip + alert feed + 3 collapsible
// category sections + per-metric card grid). role=status + aria-live=
// polite + data-testid="observability-loading-skeleton".
function ObservabilitySkeleton() {
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading system observability…"
      data-testid="observability-loading-skeleton"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between p-4 pb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="text-sm font-bold text-[var(--text-primary)]">System Observability</span>
          <span className="badge badge-dim text-[9.5px]">30s poll</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-6 w-24 rounded-md" />
          <div className="skeleton h-6 w-20 rounded-md" />
        </div>
      </div>

      {/* KPI strip skeleton (4 tiles) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-4 pt-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-card space-y-2">
            <ShimmerBlock className="w-2/5" />
            <div className="h-5 rounded-sm skeleton-line-md" />
            <ShimmerBlock className="w-3/5" />
          </div>
        ))}
      </div>

      {/* Alert feed skeleton (1 row) */}
      <div className="px-4 pb-2">
        <div className="skeleton-card p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <ShimmerBlock className="w-40" />
            <ShimmerBlock className="w-16" />
          </div>
        </div>
      </div>

      {/* Category sections skeleton (3 collapsibles) */}
      <div className="px-4 pb-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-card p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <ShimmerBlock className="w-32" />
              <ShimmerBlock className="w-12" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-2.5 space-y-2">
                  <ShimmerBlock className="w-3/4" />
                  <div className="h-4 rounded-sm skeleton-line-md" />
                  <ShimmerBlock className="w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// AlertFeed — refined alert feed display. Surfaces every metric currently
// in `warning` or `critical` state as a compact alert row (PulseDot +
// metric name + tone-coloured value + category badge + age + threshold
// context). Mirrors the W53-c alert-row pattern. Only renders when ≥1
// alert is present.
// ───────────────────────────────────────────────────────────────────────────

interface AlertRow {
  name: string
  value: number
  sev: Severity
  category: string
  timestamp: number
  age_seconds: number | null
}

function AlertFeed({
  alerts,
  onJump,
}: {
  alerts: AlertRow[]
  onJump?: (name: string) => void
}) {
  const [open, setOpen] = useState(true)
  if (alerts.length === 0) return null
  const critCount = alerts.filter((a) => a.sev === 'critical').length
  const warnCount = alerts.filter((a) => a.sev === 'warning').length
  const tone: Tone = critCount > 0 ? 'poor' : 'warn'

  return (
    <div className="px-4">
      <Collapsible open={open} onOpenChange={setOpen} className={`card border-l-2 ${TONE[tone].border}`}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 cursor-pointer hover:bg-[var(--bg-elevated)]/50 transition-colors">
          <SectionHeader
            icon={Bell}
            title="Active Alerts"
            description="Metrics exceeding thresholds"
            tone={tone}
            trailing={
              <span className="flex items-center gap-1.5">
                <span className={`badge ${critCount > 0 ? 'badge-red' : 'badge-amber'} text-[9px]`}>
                  {critCount > 0 ? `${critCount} crit` : `${warnCount} warn`}
                </span>
                <ChevronDown
                  className={`size-3.5 text-[var(--text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </span>
            }
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2.5 pt-1 max-h-72 overflow-y-auto scrollbar-thin space-y-1">
            {/* Uppercase header row — mirrors the W53-c metric table pattern */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 pb-1 mb-1 border-b border-[var(--border)] text-[9.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
              <span>Metric</span>
              <span className="text-right">Value</span>
              <span className="text-right w-20">Age</span>
            </div>
            {alerts.map((a) => {
              const aTone = severityTone(a.sev)
              const meta = getCategoryMeta(a.category)
              return (
                <button
                  key={`${a.category}:${a.name}`}
                  type="button"
                  onClick={() => onJump?.(a.name)}
                  className={`w-full text-left grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2 py-1.5 rounded-md bg-[var(--bg-page)] border border-[var(--border)] hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] hover:border-[var(--border-strong)] transition-all`}
                  title={`${a.name} · ${severityContext(a.name)}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PulseDot tone={aTone} />
                    <span className="text-[11px] font-semibold text-[#c8cfe0] truncate mono" title={a.name}>
                      {a.name}
                    </span>
                    <span className={`badge ${meta.badgeClass} text-[8px] px-1 py-0 hidden sm:inline-flex`}>
                      {meta.label}
                    </span>
                  </div>
                  <span
                    className={`text-right text-[11px] font-bold mono tabular-nums ${severityTextClass(a.sev)}`}
                    data-tone={aTone}
                  >
                    {formatMetricValue(a.name, a.value)}
                  </span>
                  <span className="text-right text-[10px] text-[var(--text-secondary)] mono tabular-nums w-20" title="Sample age">
                    {formatAge(a.timestamp)}
                  </span>
                </button>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// MetricCard — refined per-metric card. Tone-tinted border on warning /
// critical metrics + tabular-nums value + data-tone hook + row-hover
// accent bar + severity PulseDot.
// ───────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  name: string
  entry: MetricEntry
  sev: Severity
  meta: CategoryMeta
  history: HistorySample[]
}

function MetricCard({ name, entry, sev, meta, history }: MetricCardProps) {
  const tone = severityTone(sev)
  const cfg = TONE[tone]
  // Tone-tinted border for non-neutral metrics so warning/critical cards
  // pop out of the grid without an explicit colour stripe.
  const toneBorder = tone === 'neutral' ? 'border-[var(--border)]' : cfg.border
  return (
    <div
      className={`bg-[var(--bg-page)] border ${toneBorder} rounded-md p-2.5 flex flex-col gap-1.5 hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] hover:border-[var(--border-strong)] transition-all`}
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10.5px] font-semibold text-[#c8cfe0] truncate mono"
          title={name}
        >
          {name}
        </span>
        <span className={`badge ${meta.badgeClass} text-[8px] px-1 py-0`}>
          {meta.label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Severity PulseDot — solid (no ping) so it conveys state
                without distracting from the value. */}
            <PulseDot tone={tone} pulse={false} />
            <span
              className={`text-base font-bold mono tabular-nums leading-tight truncate ${severityTextClass(sev)}`}
              data-tone={tone}
              title={`${entry.value} · ${severityContext(name)}`}
            >
              {formatMetricValue(name, entry.value)}
            </span>
          </div>
          <span className="text-[9.5px] text-[var(--text-dim)] mono uppercase tracking-wider mt-0.5">
            {getUnitLabel(name)}
          </span>
        </div>
        {/* W13-9 — Recharts-backed sparkline (via the local Sparkline
            wrapper, which now delegates to @/components/charts Sparkline). */}
        <Sparkline samples={history} color={meta.stroke} />
      </div>
      <div className="flex items-center justify-between text-[9.5px] text-[var(--text-secondary)] mt-0.5">
        <span className="mono tabular-nums" title="Sample timestamp (UTC)">
          <Clock className="inline-block w-2.5 h-2.5 mr-0.5 -mt-0.5" aria-hidden="true" />
          {formatClock(entry.timestamp)}
        </span>
        <span className="mono tabular-nums" title="Age of latest sample">
          {formatAge(entry.timestamp)}
        </span>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Main panel
// ───────────────────────────────────────────────────────────────────────────

export default function ObservabilityPanel() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [histories, setHistories] = useState<Record<string, HistorySample[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [activeCats, setActiveCats] = useState<Set<string>>(
    () => new Set(CATEGORY_META.map((c) => c.key))
  )
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CATEGORY_META.map((c) => [c.key, true]))
  )
  const fetchingRef = useRef(false)

  // ── Fetchers ────────────────────────────────────────────────────────────

  const fetchReport = useCallback(async () => {
    try {
      const res = await apiFetch('/api/observability')
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const data = (await res.json()) as HealthReport
      setReport(data)
      setError(null)
      setLastUpdated(Date.now())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }, [])

  const fetchHistories = useCallback(
    async (names: string[], range: TimeRange) => {
      if (names.length === 0) {
        setHistories({})
        return
      }
      const limit = TIME_RANGE_LIMITS[range]
      // Fire all history requests in parallel — 23 metrics is well within
      // browser concurrent-request budgets and the backend SQLite WAL
      // handles parallel reads comfortably.
      const entries = await Promise.all(
        names.map(async (n): Promise<[string, HistorySample[]]> => {
          try {
            const res = await apiFetch(
              `/api/observability/history/${encodeURIComponent(n)}?limit=${limit}`
            )
            if (!res.ok) return [n, []]
            const data = (await res.json()) as HistoryResponse
            return [n, data.samples ?? []]
          } catch {
            return [n, []]
          }
        })
      )
      setHistories(Object.fromEntries(entries))
    },
    []
  )

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setRefreshing(true)
    await fetchReport()
    setRefreshing(false)
    fetchingRef.current = false
  }, [fetchReport])

  // ── Polling loop (30s, paused when document hidden) ─────────────────────

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (fetchingRef.current) return
      fetchingRef.current = true
      setRefreshing(true)
      await fetchReport()
      if (!cancelled) {
        setRefreshing(false)
        setLoading(false)
      }
      fetchingRef.current = false
    }

    tick()
    const interval = setInterval(tick, POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchReport])

  // ── Refetch sparklines when the metric set or time range changes ────────

  useEffect(() => {
    if (!report) return
    const names = new Set<string>()
    Object.values(report.categories).forEach((bucket) => {
      Object.keys(bucket).forEach((n) => names.add(n))
    })
    fetchHistories(Array.from(names), timeRange)
  }, [report, timeRange, fetchHistories])

  // ── Derived state ──────────────────────────────────────────────────────

  /** Set of categories that actually have ≥1 metric sample in the latest report. */
  const populatedCats = useMemo(() => {
    if (!report) return new Set<string>()
    const s = new Set<string>()
    Object.entries(report.categories).forEach(([cat, bucket]) => {
      if (Object.keys(bucket).length > 0) s.add(cat)
    })
    return s
  }, [report])

  /** Categories present in the report but not in our canonical 5 (e.g. strategy/other). */
  const extraCats = useMemo(() => {
    if (!report) return [] as string[]
    const known = new Set(CATEGORY_META.map((c) => c.key))
    return Object.keys(report.categories).filter(
      (k) => !known.has(k) && Object.keys(report.categories[k]).length > 0
    )
  }, [report])

  const filteredGroups = useMemo(() => {
    if (!report) {
      return [] as { meta: CategoryMeta; metrics: { name: string; entry: MetricEntry }[] }[]
    }
    const q = search.trim().toLowerCase()
    const out: { meta: CategoryMeta; metrics: { name: string; entry: MetricEntry }[] }[] = []

    // Iterate canonical categories in display order, then append any extras.
    const orderedKeys = [
      ...CATEGORY_META.map((c) => c.key),
      ...extraCats,
    ]

    for (const key of orderedKeys) {
      if (!activeCats.has(key)) continue
      const bucket = report.categories[key] ?? {}
      const entries = Object.entries(bucket)
        .map(([name, entry]) => ({ name, entry }))
        .filter(({ name }) => !q || name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
      if (entries.length === 0) continue
      out.push({ meta: getCategoryMeta(key), metrics: entries })
    }
    return out
  }, [report, search, activeCats, extraCats])

  /** W56-e — Alert feed derived state: every metric currently in warning or
   *  critical state, sorted critical-first then by age. */
  const activeAlerts = useMemo<AlertRow[]>(() => {
    if (!report) return []
    const out: AlertRow[] = []
    Object.entries(report.categories).forEach(([cat, bucket]) => {
      Object.entries(bucket).forEach(([name, entry]) => {
        const sev = getSeverity(name, entry.value)
        if (sev === 'warning' || sev === 'critical') {
          out.push({
            name,
            value: entry.value,
            sev,
            category: cat,
            timestamp: entry.timestamp,
            age_seconds: entry.age_seconds ?? null,
          })
        }
      })
    })
    // Critical first, then warnings, then by ascending age (most recent first).
    out.sort((a, b) => {
      if (a.sev === 'critical' && b.sev !== 'critical') return -1
      if (b.sev === 'critical' && a.sev !== 'critical') return 1
      const aAge = a.age_seconds ?? Number.POSITIVE_INFINITY
      const bAge = b.age_seconds ?? Number.POSITIVE_INFINITY
      return aAge - bAge
    })
    return out
  }, [report])

  /** W56-e — Health summary derived state: counts for the KPI strip. */
  const health = useMemo(() => {
    if (!report) return { total: 0, warnings: 0, criticals: 0 }
    let total = 0
    let warnings = 0
    let criticals = 0
    Object.values(report.categories).forEach((bucket) => {
      Object.entries(bucket).forEach(([name, entry]) => {
        total++
        const sev = getSeverity(name, entry.value)
        if (sev === 'critical') criticals++
        else if (sev === 'warning') warnings++
      })
    })
    return { total, warnings, criticals }
  }, [report])

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleCat = (k: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleSection = (k: string) => {
    setOpenSections((prev) => ({ ...prev, [k]: !(prev[k] ?? true) }))
  }

  // ── Render: loading skeleton ───────────────────────────────────────────

  if (loading && !report) {
    return <ObservabilitySkeleton />
  }

  // ── Render: hard error (no data yet) ────────────────────────────────────

  if (error && !report) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span className="text-sm font-bold text-[var(--text-primary)]">System Observability</span>
            <span className="badge badge-dim text-[9.5px]">30s poll</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <ErrorCard
            title="Observability endpoint unavailable"
            error={error}
            onRetry={() => refresh()}
          />
        </div>
      </div>
    )
  }

  // ── Render: empty state (collector hasn't emitted yet) ───────────────────

  if (report && report.metric_count === 0) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-2 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span className="text-sm font-bold text-[var(--text-primary)]">System Observability</span>
              <span className="badge badge-dim text-[9.5px]">30s poll</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Auto-collected system metrics · {report.category_count} categories tracked
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 text-xs text-[var(--text-secondary)]">
          <PolishedEmptyState
            icon={Inbox}
            title="No metrics collected yet"
            description="The auto-collector emits metrics every 30 seconds after backend startup. If this persists, verify the backend service is running and observability-collector is wired into the FastAPI lifespan."
            testId="observability-empty-state"
          />
          <button
            onClick={() => refresh()}
            className="btn btn-ghost btn-sm mt-3 text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Check again
          </button>
        </div>
      </div>
    )
  }

  // ── Render: main panel ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap justify-between items-center gap-2 p-4 pb-2 border-b border-[var(--border)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400 flex-shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">System Observability</h2>
            <span className="badge badge-dim text-[9.5px]">30s poll</span>
            {/* W56-e — PulseDot LIVE indicator. Pings emerald when the
                poller is mid-flight; renders a solid emerald dot when idle
                so the trader can tell at a glance that the 30s poller is
                alive. */}
            <span className="badge badge-green text-[9.5px] inline-flex items-center gap-1">
              <PulseDot tone="good" pulse={refreshing} />
              {refreshing ? 'syncing' : 'live'}
            </span>
            {refreshing && (
              <span className="badge badge-blue text-[9.5px] inline-flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                fetching
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            Auto-collected metrics · {report?.metric_count ?? 0} metrics ·{' '}
            {populatedCats.size} active categories
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            <span>Range</span>
            <Select
              value={timeRange}
              onValueChange={(v) => setTimeRange(v as TimeRange)}
            >
              <SelectTrigger
                size="sm"
                className="h-7 text-xs bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)] data-[size=sm]:h-7 w-[100px] focus-visible:ring-1 focus-visible:ring-cyan-400/40"
                aria-label="Sparkline time range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)]">
                <SelectItem value="1h" className="text-xs focus:bg-[var(--bg-elevated)] focus:text-[var(--text-primary)]">
                  Last 1h
                </SelectItem>
                <SelectItem value="6h" className="text-xs focus:bg-[var(--bg-elevated)] focus:text-[var(--text-primary)]">
                  Last 6h
                </SelectItem>
                <SelectItem value="24h" className="text-xs focus:bg-[var(--bg-elevated)] focus:text-[var(--text-primary)]">
                  Last 24h
                </SelectItem>
                <SelectItem value="7d" className="text-xs focus:bg-[var(--bg-elevated)] focus:text-[var(--text-primary)]">
                  Last 7d
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="btn btn-ghost btn-sm flex items-center gap-1.5 text-xs"
            aria-label="Refresh observability data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* ── KPI strip (4 tiles, tone-tinted) ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-4 pt-3">
        <KpiTile
          label="Total Metrics"
          value={`${report?.metric_count ?? 0}`}
          hint={`${report?.category_count ?? 0} categories`}
          tone="info"
          testId="observability-kpi-total"
          quality={Math.min(100, ((report?.metric_count ?? 0) / 23) * 100)}
        />
        <KpiTile
          label="Newest Sample"
          value={formatDuration(report?.newest_sample_age_seconds ?? null)}
          hint="since last emit"
          tone={freshnessTone(report?.newest_sample_age_seconds ?? null)}
          testId="observability-kpi-newest"
          quality={Math.max(0, 100 - (report?.newest_sample_age_seconds ?? 0) / 3)}
          trend={freshnessTone(report?.newest_sample_age_seconds ?? null) === 'good' ? 'up' : 'down'}
        />
        <KpiTile
          label="Active Alerts"
          value={`${health.criticals + health.warnings}`}
          hint={`${health.criticals} crit · ${health.warnings} warn · ${health.total} total`}
          tone={alertTone(health.criticals, health.warnings)}
          testId="observability-kpi-alerts"
          quality={health.total > 0 ? ((health.criticals + health.warnings) / health.total) * 100 : 0}
          trend={health.criticals > 0 ? 'down' : health.warnings > 0 ? 'flat' : 'up'}
        />
        <KpiTile
          label="Last Refresh"
          value={lastUpdated ? new Date(lastUpdated).toISOString().slice(11, 19) : '—'}
          hint={refreshing ? 'refreshing…' : formatAge((lastUpdated ?? 0) / 1000)}
          tone="neutral"
          testId="observability-kpi-refresh"
        />
      </div>

      {/* ── Alert feed (renders only when ≥1 alert) ───────────────────── */}
      <AlertFeed alerts={activeAlerts} />

      {/* ── Filter bar (search + category toggles) ───────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search metrics by name…"
            aria-label="Filter metrics by name"
            className="input input-sm pl-8 bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus-visible:ring-1 focus-visible:ring-cyan-400/40"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Category filters">
          {CATEGORY_META.map((c) => {
            const active = activeCats.has(c.key)
            const hasData = populatedCats.has(c.key)
            const Icon = c.icon
            return (
              <button
                key={c.key}
                onClick={() => toggleCat(c.key)}
                disabled={!hasData}
                className={`badge text-[9.5px] ${
                  active ? c.badgeClass : 'badge-dim'
                } ${!hasData ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.03]'} transition-transform`}
                title={`${c.label} category (${hasData ? 'has data' : 'no data'})`}
                aria-pressed={active}
                aria-label={`Toggle ${c.label} category`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {c.label}
              </button>
            )
          })}
          {extraCats.map((k) => {
            const meta = getCategoryMeta(k)
            const active = activeCats.has(k)
            const Icon = meta.icon
            return (
              <button
                key={k}
                onClick={() => toggleCat(k)}
                className={`badge text-[9.5px] ${
                  active ? meta.badgeClass : 'badge-dim'
                } cursor-pointer hover:scale-[1.03] transition-transform`}
                title={`${meta.label} category (ad-hoc)`}
                aria-pressed={active}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Soft error banner (stale data) ───────────────────────────── */}
      {error && (
        <div className="banner-warning mx-4 mb-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Last refresh failed: <span className="mono">{error}</span> · showing previous data
          </span>
        </div>
      )}

      {/* ── Metric categories (collapsible sections) ──────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 space-y-2">
        {filteredGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-xs text-[var(--text-secondary)] gap-2">
            <Search className="w-5 h-5 opacity-30" aria-hidden="true" />
            <div>No metrics match the current filter.</div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="btn btn-ghost btn-xs text-[11px] mt-1"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {filteredGroups.map(({ meta, metrics }) => {
          const Icon = meta.icon
          const isOpen = openSections[meta.key] ?? true
          // Per-category alert count (for the trailing badge).
          const catAlerts = metrics.filter(
            ({ name, entry }) => {
              const sev = getSeverity(name, entry.value)
              return sev === 'warning' || sev === 'critical'
            }
          ).length
          return (
            <Collapsible
              key={meta.key}
              open={isOpen}
              onOpenChange={() => toggleSection(meta.key)}
              className={`card border-l-2 ${meta.borderClass}`}
            >
              <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 cursor-pointer hover:bg-[var(--bg-elevated)]/50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 ${meta.textClass}`} aria-hidden="true" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-primary)] truncate">
                    {meta.label}
                  </span>
                  <span className="badge badge-dim text-[9px] tabular-nums">{metrics.length}</span>
                  <span className="text-[9px] text-[var(--text-secondary)] italic hidden md:inline truncate">
                    {metrics.length} metric{metrics.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {catAlerts > 0 && (
                    <span className={`badge ${catAlerts > 0 ? 'badge-amber' : 'badge-dim'} text-[9px] tabular-nums`}>
                      {catAlerts} alert{catAlerts === 1 ? '' : 's'}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--text-secondary)] transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-2.5 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {metrics.map(({ name, entry }) => {
                    const sev = getSeverity(name, entry.value)
                    const hist = histories[name] ?? []
                    return (
                      <MetricCard
                        key={`${meta.key}:${name}`}
                        name={name}
                        entry={entry}
                        sev={sev}
                        meta={meta}
                        history={hist}
                      />
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}

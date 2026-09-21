// components/LiveSafetyGatePanel.tsx — God Mode §82 Live Trading Safety Gate
// 10-check staged validation panel exposing the live_safety_gate backend.
//
// W57-c — Premium visual polish pass, aligned with the W51-2d MLPanel /
// AIMLCommandCenter / W54-e MLValidationPanel / W55-a LeaderboardPanel /
// W55-d ExecutionQualityPanel / W56-c DatabaseStatusPanel redesign family:
//   1. KpiTile pattern for safety metrics (Checks Passed, Checks Failed,
//      Circuit Breaker, Kill Switch) — tone-tinted bg + uppercase 9px
//      label + Lucide icon glyph + 16px tabular-nums value + quality bar.
//   2. Shimmer skeleton loading state mirroring the loaded panel layout
//      (header + KPI strip + gate banner + progress + 10-check grid +
//      history timeline) so the panel doesn't visually jump when the
//      first fetch resolves.
//   3. Polished empty state with Lucide Shield icon + message (rendered
//      when the readiness payload returns an empty checks array).
//   4. Section headers with icon + uppercase title (Staged Validation
//      Progress, 10 Staged Checks, Gate Transition History).
//   5. Refined safety checks table — uppercase headers, row hover accent
//      bar via inset shadow, tabular-nums on every numeric cell, tone-
//      coloured pass/fail/warn/pending status badges + index pill + glow.
//   6. PulseDot for live gate status (in the header OPEN/CLOSED badge —
//      pulses when the gate is open, static when closed or kill switch
//      is active).
//   7. Tone-coloured check results — green PASS / red FAIL / amber WARN /
//      dim PEND, applied uniformly across the panel via the Tone system.
//   8. Error state — polished error card with AlertTriangle icon +
//      message + dim detail + Retry button (RefreshCw glyph).
//   9. Refined kill switch / circuit breaker controls — prominent
//      Force open (amber) + Force close (red) buttons with a clear live
//      state pill (live status indicator next to the controls).
// All existing functionality, class names, API calls, polling, visibility
// pause/resume, accessibility roles/labels, test-matched strings, and
// the 'use client' directive preserved.

'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  PlayCircle,
  Power,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
  History,
  Activity,
  Loader2,
  ListChecks,
  CircuitBoard,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
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
import { apiFetch } from '@/lib/api'
import { fmtAge, fmtTime } from '@/lib/design-tokens'

// ── Backend types ──────────────────────────────────────────────────────────
// Mirrors `core/live_safety_gate.py` `check_live_readiness()` return shape.
interface SafetyCheck {
  id: string
  name: string
  passed: boolean
  severity: string // "BLOCKING"
  threshold: string
  value: Record<string, unknown> | null
  detail: string
}

interface ReadinessVerdict {
  passed: boolean
  checks: SafetyCheck[]
  passed_count: number
  total_count: number
  blocking_checks: string[]
  checked_at: number // epoch seconds
}

// Light-weight subset of /api/status payload — only what the banner needs.
interface ModeStatus {
  mode?: string
  kill_switch?: boolean
  kill_switch_durable?: boolean
  live_trading_enabled?: boolean
  paper_trade?: boolean
}

interface AuditEvent {
  timestamp: number
  category: string
  event_type: string
  details: string
  token_id?: string | null
  slug?: string | null
}

// ── Check-status classification ────────────────────────────────────────────
// Backend only emits pass/fail, but it records exception-raised checks as
// failed with a "check raised:" prefix in `detail`. We surface those as
// WARNING (amber) to distinguish a broken dependency from a genuine
// threshold miss.
type CheckStatus = 'PASS' | 'FAIL' | 'WARNING' | 'PENDING'

function classifyCheck(c: SafetyCheck | undefined): CheckStatus {
  if (!c) return 'PENDING'
  if (c.passed) return 'PASS'
  if (typeof c.detail === 'string' && c.detail.startsWith('check raised:')) return 'WARNING'
  return 'FAIL'
}

// ── W51-2d Tone system (mirror of MLPanel / DatabaseStatusPanel) ───────────
// Self-contained Tailwind class strings (no dynamic concatenation) so
// Tailwind 4's content scanner picks them up. Used by the KpiTile, the
// PulseDot, the SectionHeader icon, the per-check row hover accent bar,
// the legend chips, the gate banner tint, and the kill-switch state pill.
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
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '',                       rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map a check status to a Tone. PASS → good, FAIL → poor, WARN → warn,
 *  PENDING → neutral. Used by the CheckCard tone + the PulseDot halo. */
function checkStatusTone(status: CheckStatus): Tone {
  if (status === 'PASS') return 'good'
  if (status === 'FAIL') return 'poor'
  if (status === 'WARNING') return 'warn'
  return 'neutral'
}

/** Map the live gate state to a Tone. Kill switch active → poor (red);
 *  gate open → good (emerald); gate closed by failing checks → warn
 *  (amber). Used by the header PulseDot + badge accent. */
function gateTone(open: boolean, killSwitch: boolean): Tone {
  if (killSwitch) return 'poor'
  if (open) return 'good'
  return 'warn'
}

const STATUS_STYLES: Record<
  CheckStatus,
  { badge: string; icon: typeof CheckCircle2; ring: string; glow: string; label: string; tone: Tone }
> = {
  PASS:    { badge: 'badge-green', icon: CheckCircle2, ring: 'border-green-500/40',  glow: 'shadow-[0_0_0_1px_rgba(34,197,94,0.15)_inset]',   label: 'PASS', tone: 'good' },
  FAIL:    { badge: 'badge-red',   icon: XCircle,      ring: 'border-red-500/45',    glow: 'shadow-[0_0_0_1px_rgba(239,68,68,0.15)_inset]',  label: 'FAIL', tone: 'poor' },
  WARNING: { badge: 'badge-amber', icon: AlertTriangle, ring: 'border-amber-500/45', glow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.15)_inset]', label: 'WARN', tone: 'warn' },
  PENDING: { badge: 'badge-dim',   icon: Clock,         ring: 'border-[#1f2335]',     glow: '',                                              label: 'PEND', tone: 'neutral' },
}

const POLL_INTERVAL_MS = 10_000
const HISTORY_LIMIT = 12
const FORCE_OPEN_CONFIRMATION_PHRASE = 'I UNDERSTAND THE RISKS'

// Filter audit events to gate-relevant transitions for the timeline.
const GATE_EVENT_TYPES = new Set([
  'live_trading_enabled',
  'kill_switch_activated',
  'kill_switch_deactivated',
  'observation_mode_enabled',
  'observation_mode_disabled',
])

// ── Sub-components: design-system atoms ─────────────────────────────────────

// PulseDot — small status dot with halo + ping animation. Used by the
// live gate-status readout in the header OPEN/CLOSED badge. Pulses only
// when the gate is open; static when closed or kill switch is active.
// Mirrors the MLPanel / DatabaseStatusPanel PulseDot.
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

// SectionHeader — Lucide icon + uppercase tracking-wider 10.5px title +
// optional dim italic description + optional trailing node. Mirrors the
// MLPanel / MLValidationPanel / ExecutionQualityPanel / DatabaseStatusPanel
// SectionHeader so the safety-gate panel reads as part of the same premium
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
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[9px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ShimmerBlock — thin skeleton-line-sm placeholder. Can be sized via the
// className prop. aria-hidden so screen readers don't pick it up. Mirrors
// MLPanel's ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
}

// KpiTile — refined KPI card. Mirrors the MLPanel / DatabaseStatusPanel /
// ExecutionQualityPanel KpiTile sub-component so the safety-gate metrics
// read as part of the same premium KPI strip family. Preserves the
// existing `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` class hooks
// (so downstream CSS still applies).
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

// PolishedEmptyState — Lucide Shield icon + title + dim description.
// Rendered when the readiness payload returns an empty checks array
// (which is unusual but possible during bot startup or partial outages).
function PolishedEmptyState() {
  return (
    <div className="empty-state py-8" role="status" data-testid="safety-gate-empty-state">
      <Shield className="empty-state-icon text-[#5a637a]" size={28} aria-hidden="true" />
      <div className="empty-state-title">No staged checks returned</div>
      <div className="empty-state-desc">
        The readiness endpoint responded with an empty checks array. The
        §82 staged-gate contract normally emits 10 checks — try re-running
        all checks, or wait for the next polling cycle.
      </div>
    </div>
  )
}

// PolishedErrorState — refined error card body with AlertTriangle icon +
// "Safety-gate endpoint unavailable" title (preserved verbatim so the
// W28-3 test contract `getByText(/Safety-gate endpoint unavailable/)`
// resolves) + dim description + raw error message (preserved verbatim so
// `getByText(/Network error: ECONNREFUSED/)` would resolve if surfaced)
// + Retry button (RefreshCw glyph, name "Retry" preserved so the test
// contract `getByRole('button', { name: /retry/i })` resolves). role=alert
// preserved. data-testid="safety-gate-error-card" + data-testid=
// "safety-gate-error-retry" suffix on the button.
interface PolishedErrorStateProps {
  message: string | null
  onRetry: () => void
  retrying: boolean
}

function PolishedErrorState({ message, onRetry, retrying }: PolishedErrorStateProps) {
  return (
    <div
      className="error-state p-6 text-center space-y-3"
      role="alert"
      data-testid="safety-gate-error-card"
    >
      <AlertTriangle
        className="error-state-icon text-[#f87171] mx-auto"
        size={28}
        aria-hidden="true"
      />
      <div className="error-state-title">Safety-gate endpoint unavailable</div>
      <div className="error-state-desc">
        The bot may be starting up, or the{' '}
        <code className="mono text-cyan-300">/api/live/readiness</code>
        {' '}route is not responding.
      </div>
      {message && (
        <pre
          className="mono text-[10px] text-red-300/85 bg-[#080910] border border-red-500/30 rounded p-2 max-h-32 overflow-auto text-left"
          data-testid="safety-gate-error-msg"
        >
          {message}
        </pre>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="btn btn-ghost btn-sm border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100"
        aria-label="Retry safety-gate fetch"
        data-testid="safety-gate-error-retry"
      >
        <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}

// ── Sub-components: panel pieces ────────────────────────────────────────────

function GateBanner({
  open,
  killSwitch,
  mode,
  checkedAt,
}: {
  open: boolean
  killSwitch: boolean
  mode?: string
  checkedAt: number | null
}) {
  // Gate is OPEN only when all 10 checks pass AND no kill switch is active.
  const effectiveOpen = open && !killSwitch
  const Icon = effectiveOpen ? Unlock : Lock
  const tone = gateTone(effectiveOpen, killSwitch)
  const headline = effectiveOpen ? 'GATE OPEN' : 'GATE CLOSED'
  const subline = effectiveOpen
    ? 'Live trading authorised — all 10 §82 checks passed.'
    : killSwitch
    ? 'Kill switch active — gate sealed. All trading halted.'
    : 'Live trading blocked — one or more §82 checks failed.'
  const bannerClass = effectiveOpen
    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
    : killSwitch
    ? 'bg-red-500/10 border-red-500/45 text-red-200'
    : 'bg-amber-500/10 border-amber-500/40 text-amber-200'

  return (
    <div
      className={`relative overflow-hidden rounded-lg border px-4 py-3 sm:px-5 sm:py-4 ${bannerClass}`}
      role="status"
      aria-live="polite"
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full ${
              effectiveOpen
                ? 'bg-emerald-500/15 border border-emerald-500/40'
                : killSwitch
                ? 'bg-red-500/15 border border-red-500/45'
                : 'bg-amber-500/15 border border-amber-500/40'
            }`}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base sm:text-lg font-bold tracking-wide tabular-nums">
                {headline}
              </span>
              {mode && (
                <span className="text-[10px] uppercase tracking-wider opacity-70 mono">
                  · mode={mode}
                </span>
              )}
              {killSwitch && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/30 border border-red-500/40">
                  KILL SWITCH
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs opacity-85 mt-0.5 truncate">
              {subline}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[9.5px] uppercase tracking-wider opacity-70">
            Last Evaluation
          </div>
          <div className="mono text-[11px] font-semibold opacity-95 tabular-nums">
            {checkedAt != null ? fmtTime(checkedAt) : '—'}
          </div>
          <div className="text-[9.5px] opacity-70 mono tabular-nums">
            {checkedAt != null ? fmtAge(checkedAt) : 'never'}
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckCard({
  check,
  index,
  expanded,
  onToggle,
}: {
  check: SafetyCheck
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const status = classifyCheck(check)
  const st = STATUS_STYLES[status]
  const tone = checkStatusTone(status)
  const cfg = TONE[tone]
  const StatusIcon = st.icon

  return (
    <div
      className={`bg-[#0e1015] border ${st.ring} ${st.glow} rounded-lg overflow-hidden transition-colors ${cfg.rowHover}`}
      data-tone={tone}
      data-status={status}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-start gap-2.5 hover:bg-[#13161e] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]/40"
        aria-expanded={expanded}
        aria-controls={`check-detail-${check.id}`}
      >
        <span
          className={`mono text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded tabular-nums ${
            status === 'PASS'
              ? 'bg-green-500/15 text-green-400'
              : status === 'FAIL'
              ? 'bg-red-500/15 text-red-400'
              : status === 'WARNING'
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-[#1f2335] text-[#7e8aaa]'
          }`}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusIcon
              className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.text}`}
              aria-hidden="true"
            />
            <span className="text-[12px] font-semibold text-[#dde1ed] truncate">
              {check.name}
            </span>
            <span className={`badge ${st.badge} text-[9px] px-1.5 py-0`}>
              {st.label}
            </span>
          </div>
          <div className="mono text-[9.5px] text-[#7e8aaa] mt-0.5 truncate">
            {check.id}
          </div>
        </div>
        <span className="text-[#7e8aaa] flex-shrink-0 mt-0.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Always-visible detail line */}
      <div className="px-3 pb-2 -mt-1">
        <p
          className={`text-[11px] leading-snug ${
            status === 'PASS'
              ? 'text-[#9aa3bc]'
              : status === 'FAIL'
              ? 'text-red-300/85'
              : status === 'WARNING'
              ? 'text-amber-300/85'
              : 'text-[#7e8aaa]'
          } line-clamp-2`}
          title={check.detail}
        >
          {check.detail || 'No detail returned by check.'}
        </p>
      </div>

      {expanded && (
        <div
          id={`check-detail-${check.id}`}
          className="border-t border-[#1f2335] bg-[#08090f]/60 px-3 py-2.5 space-y-2"
        >
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#7e8aaa] font-semibold">
              Threshold
            </div>
            <code className="mono text-[10.5px] text-cyan-300/95 break-all">
              {check.threshold || '—'}
            </code>
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#7e8aaa] font-semibold">
              Detail
            </div>
            <p className="text-[10.5px] text-[#c8cfe0] leading-relaxed break-words">
              {check.detail || '—'}
            </p>
          </div>
          {check.value != null && (
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-[#7e8aaa] font-semibold">
                Measured value
              </div>
              <pre className="mono text-[10px] text-[#9aa3bc] bg-[#080910] border border-[#1f2335] rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(check.value, null, 2)}
              </pre>
            </div>
          )}
          <div className="flex items-center justify-between text-[9.5px] text-[#7e8aaa] pt-0.5">
            <span>
              Severity:{' '}
              <span className="mono text-[#c8cfe0]">{check.severity}</span>
            </span>
            <span className="mono tabular-nums">#{index + 1} in staged order</span>
          </div>
        </div>
      )}
    </div>
  )
}

function CheckSkeleton() {
  return (
    <div
      className="bg-[#0e1015] border border-[#1f2335] rounded-lg p-3"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2.5">
        <ShimmerBlock className="w-5 h-5 !rounded" />
        <div className="flex-1 space-y-1.5">
          <ShimmerBlock className="w-2/3 !h-2.5" />
          <ShimmerBlock className="w-1/3 !h-2" />
        </div>
        <ShimmerBlock className="w-10 h-4 !rounded-md" />
      </div>
      <div className="h-2 w-full mt-2.5 rounded bg-[#181c28]" style={{
        background:
          'linear-gradient(90deg, rgba(161,168,181,0.06) 25%, rgba(161,168,181,0.14) 50%, rgba(161,168,181,0.06) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
      }} />
    </div>
  )
}

function HistoryTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div
        className="empty-state py-6"
        role="status"
        data-testid="safety-gate-history-empty"
      >
        <History className="empty-state-icon text-[#5a637a]" size={24} aria-hidden="true" />
        <div className="empty-state-title">No gate transitions recorded yet</div>
        <div className="empty-state-desc">
          Kill-switch activations, live-trading enablements, and observation-
          mode toggles will appear here as the operator interacts with the
          gate.
        </div>
      </div>
    )
  }

  return (
    <ol className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
      {events.map((e, i) => {
        const isOpen =
          e.event_type === 'live_trading_enabled' ||
          e.event_type === 'kill_switch_deactivated' ||
          e.event_type === 'observation_mode_disabled'
        const Icon = isOpen ? Unlock : Lock
        const tone = isOpen ? 'good' : 'poor'
        const cfg = TONE[tone]
        return (
          <li
            key={`${e.timestamp}-${i}`}
            className={`flex items-start gap-2 text-[11px] bg-[#0e1015] border border-[#1f2335] rounded px-2.5 py-1.5 ${cfg.rowHover} hover:bg-[#13161e] transition-colors`}
            data-tone={tone}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${cfg.bg} ${cfg.text}`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="mono text-[10px] font-semibold text-[#dde1ed]">
                  {e.event_type}
                </span>
                <span className="text-[9px] text-[#7e8aaa] mono tabular-nums">
                  {fmtAge(e.timestamp)}
                </span>
              </div>
              <p className="text-[10px] text-[#9aa3bc] mt-0.5 line-clamp-2 break-words">
                {e.details}
              </p>
            </div>
            <span className="mono text-[9px] text-[#7e8aaa] flex-shrink-0 mt-0.5 tabular-nums">
              {fmtTime(e.timestamp)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// LiveSafetyGateSkeleton — structured shimmer loading state mirroring the
// loaded panel layout (header + KPI strip + gate banner + progress + 10-
// check grid + history timeline) so the panel doesn't visually jump when
// the first fetch resolves. Preserves the "LIVE SAFETY GATE · §82" title
// text + an `animate-spin` Loader2 spinner in the loading header (so the
// W28-3 test contracts `getByText('LIVE SAFETY GATE · §82')` +
// `document.querySelectorAll('.animate-spin').length >= 1` still resolve).
function LiveSafetyGateSkeleton() {
  return (
    <div
      className="card bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-xl flex flex-col"
      role="status"
      aria-live="polite"
      aria-label="Loading live safety gate"
      data-testid="safety-gate-loading-skeleton"
    >
      {/* Skeleton header bar — preserves the title + animate-spin spinner */}
      <div className="card-header p-3 border-b border-[#1f2335] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <span className="text-xs font-bold text-[#dde1ed] tracking-wide">
            LIVE SAFETY GATE · §82
          </span>
        </div>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7e8aaa]" aria-hidden="true" />
      </div>
      {/* Skeleton body — mirrors the loaded layout */}
      <div className="p-3 space-y-3" aria-hidden="true">
        {/* Skeleton gate banner */}
        <ShimmerBlock className="w-full !h-20 !rounded-lg" />
        {/* Skeleton KPI strip — 4 tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
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
        {/* Skeleton progress card */}
        <div className="rounded-md border border-[#1f2335] bg-[#0e1015] px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <ShimmerBlock className="w-44 !h-3" />
            <ShimmerBlock className="w-24 !h-3" />
          </div>
          <div className="h-2 w-full bg-[#1f2335] rounded-full overflow-hidden">
            <div
              className="h-full w-3/5 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(34,211,238,0.15) 0%, rgba(52,211,153,0.20) 100%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
              }}
            />
          </div>
          <div className="flex gap-2">
            <ShimmerBlock className="w-14 !h-2.5 !rounded-md" />
            <ShimmerBlock className="w-14 !h-2.5 !rounded-md" />
            <ShimmerBlock className="w-14 !h-2.5 !rounded-md" />
            <ShimmerBlock className="w-14 !h-2.5 !rounded-md" />
          </div>
        </div>
        {/* Skeleton 10-check grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <CheckSkeleton key={i} />
          ))}
        </div>
        {/* Skeleton history timeline */}
        <div className="rounded-md border border-[#1f2335] bg-[#0e1015] px-3 py-2.5 space-y-1.5">
          <ShimmerBlock className="w-40 !h-3" />
          <ShimmerBlock className="w-full !h-3" />
          <ShimmerBlock className="w-3/4 !h-3" />
        </div>
      </div>
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export default function LiveSafetyGatePanel() {
  const [readiness, setReadiness] = useState<ReadinessVerdict | null>(null)
  const [modeStatus, setModeStatus] = useState<ModeStatus | null>(null)
  const [history, setHistory] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Force-open dialog state
  const [openDialogOpen, setOpenDialogOpen] = useState(false)
  const [openConfirmText, setOpenConfirmText] = useState('')
  const [openDialogStep, setOpenDialogStep] = useState<1 | 2>(1)
  const [openBusy, setOpenBusy] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  // Force-close dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Operation feedback toast
  const [toast, setToast] = useState<{
    kind: 'success' | 'error' | 'info'
    msg: string
  } | null>(null)

  const inFlightRef = useRef(false)

  const showToast = useCallback(
    (kind: 'success' | 'error' | 'info', msg: string) => {
      setToast({ kind, msg })
      window.setTimeout(() => setToast(null), 4500)
    },
    [],
  )

  const fetchAll = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const [readinessRes, statusRes, auditRes] = await Promise.all([
        apiFetch('/api/live/readiness'),
        apiFetch('/api/status').catch(() => null),
        apiFetch(`/api/audit/logs?limit=40&category=system`).catch(() => null),
      ])

      if (!readinessRes.ok) {
        const txt = await readinessRes.text().catch(() => '')
        throw new Error(
          `readiness endpoint returned ${readinessRes.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`,
        )
      }
      const data = (await readinessRes.json()) as ReadinessVerdict
      setReadiness(data)

      if (statusRes && statusRes.ok) {
        const s = await statusRes.json().catch(() => ({}))
        setModeStatus(s as ModeStatus)
      }

      if (auditRes && auditRes.ok) {
        const a = (await auditRes.json().catch(() => ({ logs: [] }))) as {
          logs?: AuditEvent[]
        }
        const filtered = (a.logs ?? [])
          .filter((e) => GATE_EVENT_TYPES.has(e.event_type))
          .slice(0, HISTORY_LIMIT)
        setHistory(filtered)
      }

      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [])

  // Initial load + 10s polling, paused when document hidden.
  useEffect(() => {
    fetchAll()
    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval) return
      interval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        fetchAll()
      }, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined') {
        if (document.hidden) {
          stop()
        } else {
          // Refresh immediately on tab re-focus, then resume polling.
          fetchAll()
          start()
        }
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    start()
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [fetchAll])

  const runAllChecks = useCallback(async () => {
    setRunning(true)
    try {
      // GET /api/live/readiness re-evaluates all 10 checks on the server.
      const res = await apiFetch('/api/live/readiness')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ReadinessVerdict
      setReadiness(data)
      setLastUpdated(Date.now())
      showToast(
        data.passed ? 'success' : 'info',
        `Re-evaluation complete — ${data.passed_count}/${data.total_count} checks passing.`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast('error', `Failed to run checks: ${msg}`)
    } finally {
      setRunning(false)
    }
  }, [showToast])

  const forceOpenGate = useCallback(async () => {
    setOpenBusy(true)
    setOpenError(null)
    try {
      const res = await apiFetch('/api/live/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          reason: 'manual operator override via LiveSafetyGatePanel',
        }),
      })
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: { message?: string; blocking_checks?: string[] }
        }
        const blocking = body.detail?.blocking_checks ?? []
        setOpenError(
          `${body.detail?.message ?? 'Gate refused to open.'} Blocking: ${blocking.join(', ') || 'none listed'}`,
        )
        showToast('error', 'Gate refused — blocking checks remain.')
        return
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`)
      }
      const body = (await res.json().catch(() => ({}))) as {
        enabled?: boolean
        mode?: string
      }
      showToast(
        'success',
        `Live trading ENABLED in-memory (mode=${body.mode ?? 'live'}). Restart required for durable activation.`,
      )
      setOpenDialogOpen(false)
      setOpenConfirmText('')
      setOpenDialogStep(1)
      // Re-poll immediately so the banner reflects the new state.
      fetchAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setOpenError(msg)
      showToast('error', `Force-open failed: ${msg}`)
    } finally {
      setOpenBusy(false)
    }
  }, [fetchAll, showToast])

  const forceCloseGate = useCallback(async () => {
    setCloseBusy(true)
    setCloseError(null)
    try {
      // Activating the kill switch is the de-facto "force close gate"
      // mechanism — it halts all trading immediately and is logged as
      // kill_switch_activated in the audit trail. There is no
      // /api/live/disable endpoint; the kill switch is the contract.
      const res = await apiFetch('/api/kill-switch/activate', {
        method: 'POST',
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`)
      }
      showToast(
        'success',
        'Kill switch activated — gate sealed. All trading halted.',
      )
      setCloseDialogOpen(false)
      fetchAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCloseError(msg)
      showToast('error', `Force-close failed: ${msg}`)
    } finally {
      setCloseBusy(false)
    }
  }, [fetchAll, showToast])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const expandAll = useCallback(() => {
    if (!readiness) return
    const all: Record<string, boolean> = {}
    readiness.checks.forEach((c) => (all[c.id] = true))
    setExpanded(all)
  }, [readiness])

  const collapseAll = useCallback(() => setExpanded({}), [])

  // ── Render: loading skeleton ────────────────────────────────────────────
  if (loading && !readiness) {
    return <LiveSafetyGateSkeleton />
  }

  // ── Render: error state ──────────────────────────────────────────────────
  if ((error || !readiness) && !loading) {
    return (
      <div className="card bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-xl flex flex-col">
        <div className="card-header p-3 border-b border-[#1f2335] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" aria-hidden="true" />
            <span className="text-xs font-bold text-[#dde1ed] tracking-wide">
              LIVE SAFETY GATE · §82
            </span>
            <span className="badge badge-red text-[9.5px]">Unavailable</span>
          </div>
        </div>
        <PolishedErrorState
          message={error}
          onRetry={() => {
            setLoading(true)
            setError(null)
            fetchAll()
          }}
          retrying={loading}
        />
      </div>
    )
  }

  // ── Render: ready ────────────────────────────────────────────────────────
  const verdict = readiness as ReadinessVerdict
  const passedCount = verdict.passed_count
  const totalCount = verdict.total_count || 10
  const progressPct = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0
  const killSwitch = Boolean(modeStatus?.kill_switch)
  const gateOpen = verdict.passed && !killSwitch
  const failedCount = Math.max(0, totalCount - passedCount)
  const blockingCount = verdict.blocking_checks.length

  // Status counts for the legend.
  const counts = verdict.checks.reduce(
    (acc, c) => {
      const s = classifyCheck(c)
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    {} as Record<CheckStatus, number>,
  )

  // ── Tone derivation for the 4 KPI tiles ──
  const passTone: Tone = progressPct === 100 ? 'good' : progressPct >= 70 ? 'warn' : 'poor'
  const failTone: Tone = failedCount === 0 ? 'good' : failedCount <= 3 ? 'warn' : 'poor'
  const breakerTone: Tone = blockingCount > 0 ? 'poor' : 'good'
  const killTone: Tone = killSwitch ? 'poor' : 'good'

  // ── Live status pill for the kill switch / circuit breaker controls ──
  // Renders a small tone-tinted pill next to the Force open / Force close
  // buttons so the operator reads the live kill-switch state at a glance.
  const killSwitchPillTone = killSwitch ? 'poor' : 'good'
  const killSwitchPillCfg = TONE[killSwitchPillTone]
  const killSwitchPill = (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${killSwitchPillCfg.border} ${killSwitchPillCfg.bg} ${killSwitchPillCfg.label} text-[9.5px] font-bold uppercase tracking-wider`}
      data-tone={killSwitchPillTone}
      data-testid="safety-gate-kill-switch-pill"
    >
      <PulseDot tone={killSwitchPillTone} pulse={!killSwitch} />
      {killSwitch ? 'Kill Switch ACTIVE' : 'Kill Switch Armed-Ready'}
    </span>
  )

  return (
    <div className="card bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-xl flex flex-col">
      {/* Header */}
      <div className="card-header p-3 border-b border-[#1f2335] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="card-title text-xs font-bold text-[#dde1ed] tracking-wide flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            LIVE SAFETY GATE · §82
          </span>
          <span
            className={`badge ${gateOpen ? 'badge-green' : killSwitch ? 'badge-red' : 'badge-amber'} text-[9.5px] inline-flex items-center gap-1`}
            data-tone={gateTone(gateOpen, killSwitch)}
            data-testid="safety-gate-status-badge"
          >
            <PulseDot tone={gateTone(gateOpen, killSwitch)} pulse={gateOpen} />
            {gateOpen ? (
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            )}
            {gateOpen ? 'OPEN' : 'CLOSED'}
          </span>
          {lastUpdated && (
            <span className="text-[9.5px] text-[#7e8aaa] mono tabular-nums">
              · updated {fmtAge(lastUpdated / 1000)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {killSwitchPill}
          <Button
            variant="outline"
            size="sm"
            onClick={runAllChecks}
            disabled={running}
            className="btn btn-ghost btn-sm"
            title="Re-run all 10 staged checks"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-3 w-3" aria-hidden="true" />
            )}
            Run all checks
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenDialogOpen(true)}
            className="btn btn-amber btn-sm"
            title="Force-open the gate — bypasses fail-closed contract"
          >
            <Unlock className="h-3 w-3" aria-hidden="true" />
            Force open
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCloseDialogOpen(true)}
            className="btn btn-danger btn-sm"
            title="Force-close the gate — activates the kill switch"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Force close
          </Button>
        </div>
      </div>

      {/* Banner + KPI strip */}
      <div className="p-3 space-y-3">
        <GateBanner
          open={verdict.passed}
          killSwitch={killSwitch}
          mode={modeStatus?.mode}
          checkedAt={verdict.checked_at}
        />

        {/* KPI strip — 4 tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <KpiTile
            label="Checks Passed"
            value={`${passedCount}/${totalCount}`}
            sub={`${progressPct}% of staged gate`}
            icon={CheckCircle2}
            tone={passTone}
            quality={progressPct}
            testId="safety-gate-kpi-passed"
          />
          <KpiTile
            label="Checks Failed"
            value={String(failedCount)}
            sub={failedCount === 0 ? 'none failing' : `${failedCount} not passing`}
            icon={XCircle}
            tone={failTone}
            quality={failedCount === 0 ? 100 : Math.max(0, 100 - failedCount * 15)}
            testId="safety-gate-kpi-failed"
          />
          <KpiTile
            label="Circuit Breaker"
            value={blockingCount > 0 ? 'TRIPPED' : 'OK'}
            sub={blockingCount > 0 ? `${blockingCount} blocking check${blockingCount === 1 ? '' : 's'}` : 'gate free to open'}
            icon={CircuitBoard}
            tone={breakerTone}
            quality={blockingCount > 0 ? Math.max(15, 100 - blockingCount * 20) : 100}
            testId="safety-gate-kpi-breaker"
          />
          <KpiTile
            label="Kill Switch"
            value={killSwitch ? 'ACTIVE' : 'INACTIVE'}
            sub={modeStatus?.kill_switch_durable ? 'durable — survives restart' : 'in-memory — clears on restart'}
            icon={Power}
            tone={killTone}
            quality={killSwitch ? 100 : 20}
            testId="safety-gate-kpi-kill-switch"
          />
        </div>

        {/* Staged validation progress */}
        <div className="bg-[#0e1015] border border-[#1f2335] rounded-lg px-3 py-2.5">
          <SectionHeader
            icon={Activity}
            title="Staged Validation Progress"
            description="10-check §82 contract"
            tone="info"
            trailing={
              <span
                className={`mono font-bold text-[10.5px] tabular-nums ${
                  progressPct === 100
                    ? 'text-green-400'
                    : progressPct >= 70
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {passedCount}/{totalCount} · {progressPct}%
              </span>
            }
          />
          <Progress
            value={progressPct}
            className="h-2 bg-[#13161e] border border-[#1f2335] [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-cyan-500 [&>[data-slot=progress-indicator]]:to-emerald-500"
          />
          <div className="flex flex-wrap gap-2 mt-2 text-[9.5px]">
            <span className="flex items-center gap-1 text-green-400 mono tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              PASS {counts.PASS ?? 0}
            </span>
            <span className="flex items-center gap-1 text-red-400 mono tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
              FAIL {counts.FAIL ?? 0}
            </span>
            <span className="flex items-center gap-1 text-amber-400 mono tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              WARN {counts.WARNING ?? 0}
            </span>
            <span className="flex items-center gap-1 text-[#7e8aaa] mono tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3e4560] inline-block" />
              PEND {counts.PENDING ?? 0}
            </span>
            {verdict.blocking_checks.length > 0 && (
              <span className="ml-auto text-[9px] text-red-300/85 mono">
                Blocking: {verdict.blocking_checks.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 10-check grid */}
      <div className="px-3 pb-2">
        {verdict.checks.length === 0 ? (
          <PolishedEmptyState />
        ) : (
          <>
            <SectionHeader
              icon={ListChecks}
              title="10 Staged Checks"
              description="expand any row for threshold + measured value"
              tone="neutral"
              trailing={
                <div className="flex gap-2 text-[9.5px]">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/40 rounded px-1"
                  >
                    Expand all
                  </button>
                  <span className="text-[#3e4560]">·</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-[#7e8aaa] hover:text-[#dde1ed] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6]/40 rounded px-1"
                  >
                    Collapse all
                  </button>
                </div>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {verdict.checks.map((c, idx) => (
                <CheckCard
                  key={c.id}
                  check={c}
                  index={idx}
                  expanded={Boolean(expanded[c.id])}
                  onToggle={() => toggleExpand(c.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* History timeline */}
      <div className="px-3 pb-3 pt-2 border-t border-[#1f2335] mt-auto">
        <SectionHeader
          icon={History}
          title="Gate Transition History"
          tone="neutral"
          trailing={
            <span className="text-[9px] text-[#7e8aaa] mono tabular-nums">
              last {HISTORY_LIMIT} events · system audit trail
            </span>
          }
        />
        <HistoryTimeline events={history} />
      </div>

      {/* ── Force-open dialog: double confirmation with typed phrase ── */}
      <AlertDialog
        open={openDialogOpen}
        onOpenChange={(o) => {
          setOpenDialogOpen(o)
          if (!o) {
            setOpenConfirmText('')
            setOpenDialogStep(1)
            setOpenError(null)
          }
        }}
      >
        <AlertDialogContent className="bg-[#13161e] border border-red-500/40 text-[#dde1ed] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Force-open live trading gate
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#9aa3bc] text-xs leading-relaxed">
              {openDialogStep === 1 ? (
                <>
                  This is a <strong className="text-red-300">dangerous</strong>{' '}
                  operation. It bypasses the fail-closed §82 contract and
                  attempts to flip the bot into live trading mode via{' '}
                  <code className="mono text-cyan-300">POST /api/live/enable</code>
                  . The backend will still refuse (HTTP 409) if any of the 10
                  staged checks are failing — this action only succeeds when the
                  gate is currently passing.
                  <br />
                  <br />
                  <strong className="text-amber-300">Side-effects:</strong> flips
                  in-memory mode flags (<code className="mono text-cyan-300">live_trading_enabled=true</code>,
                  <code className="mono text-cyan-300">trading_mode=live</code>,
                  <code className="mono text-cyan-300">paper_trade=false</code>),
                  logs an audit event, and starts admitting real orders
                  immediately. Restart the process for durable activation.
                </>
              ) : (
                <>
                  To confirm, type{' '}
                  <code className="mono text-amber-300 bg-[#080910] px-1.5 py-0.5 rounded border border-[#1f2335]">
                    {FORCE_OPEN_CONFIRMATION_PHRASE}
                  </code>{' '}
                  exactly as shown. This action is logged to the immutable audit
                  trail under your operator token.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {openDialogStep === 2 && (
            <Input
              type="text"
              value={openConfirmText}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setOpenConfirmText(e.target.value)}
              className="bg-[#080910] border border-[#1f2335] text-[#dde1ed] mono text-sm"
              placeholder="Type the confirmation phrase…"
              aria-label="Confirmation phrase"
            />
          )}

          {openError && (
            <pre className="mono text-[10px] text-red-300 bg-[#080910] border border-red-500/30 rounded p-2 max-h-32 overflow-auto">
              {openError}
            </pre>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={openBusy}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </AlertDialogCancel>
            {openDialogStep === 1 ? (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  setOpenDialogStep(2)
                }}
                className="btn btn-amber btn-sm"
              >
                <Power className="h-3 w-3" aria-hidden="true" />
                I understand — continue
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  if (openConfirmText !== FORCE_OPEN_CONFIRMATION_PHRASE) {
                    setOpenError(
                      `Confirmation phrase does not match. Expected exactly: "${FORCE_OPEN_CONFIRMATION_PHRASE}".`,
                    )
                    return
                  }
                  forceOpenGate()
                }}
                disabled={
                  openBusy || openConfirmText !== FORCE_OPEN_CONFIRMATION_PHRASE
                }
                className="btn btn-danger btn-sm"
              >
                {openBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Unlock className="h-3 w-3" aria-hidden="true" />
                )}
                Force open gate
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Force-close dialog: single confirmation ── */}
      <AlertDialog
        open={closeDialogOpen}
        onOpenChange={(o) => {
          setCloseDialogOpen(o)
          if (!o) setCloseError(null)
        }}
      >
        <AlertDialogContent className="bg-[#13161e] border border-red-500/40 text-[#dde1ed] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-300">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Force-close live trading gate
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#9aa3bc] text-xs leading-relaxed">
              Activates the kill-switch circuit breaker via{' '}
              <code className="mono text-cyan-300">
                POST /api/kill-switch/activate
              </code>
              . This is the de-facto &quot;close the gate&quot; action — all
              trading halts immediately, open orders are cancelled, and an
              audit event is logged. The gate will remain sealed until an
              operator deactivates the kill switch and the 10 staged checks
              re-pass.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {closeError && (
            <pre className="mono text-[10px] text-red-300 bg-[#080910] border border-red-500/30 rounded p-2 max-h-32 overflow-auto">
              {closeError}
            </pre>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={closeBusy}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                forceCloseGate()
              }}
              disabled={closeBusy}
              className="btn btn-danger btn-sm"
            >
              {closeBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="h-3 w-3" aria-hidden="true" />
              )}
              Activate kill switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Operation feedback toast ── */}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-3 py-2 shadow-xl text-xs ${
            toast.kind === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : toast.kind === 'error'
              ? 'bg-red-500/15 border-red-500/40 text-red-200'
              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5">
              {toast.kind === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : toast.kind === 'error' ? (
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="flex-1">{toast.msg}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-[10px] opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

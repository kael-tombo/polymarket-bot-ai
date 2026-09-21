// components/DecisionLedgerPanel.tsx — Unified Decision Ledger Inspector
//
// Surfaces the SQLite-backed decision chain (PREDICTION → SIGNAL → RISK →
// ORDER → FILL) maintained by `core/decision_ledger.py`. Each decision row
// is expandable to reveal its full correlation chain fetched from the
// token-scoped inspection endpoint.
//
// Backend endpoints (verified in `decision_ledger.register_routes`):
//   GET /api/decisions/rejected?limit=50   — recent rejection list (drives the
//                                              primary list view; rejections
//                                              are the most-recent-first
//                                              surface of the ledger).
//   GET /api/decision/{token_id}?limit=50  — full stage-chain for a token;
//                                              filtered client-side to the
//                                              expanded rejection's decision_id
//                                              to render the correlation chain.
//
// Auto-refreshes every 10s when the tab is visible; pauses on hide.
//
// ─── W57-b polish (DecisionLedgerPanel visual layer) ──────────────────────
//   Adds the W50-56 design-system vocabulary (Tone system, PulseDot,
//   SectionHeader, ShimmerBlock, StageIndicatorStrip, PolishedEmptyState,
//   PolishedErrorState) to the Decision Ledger for visual consistency with
//   the MLPanel / MLValidationPanel / LeaderboardPanel / ExecutionQualityPanel
//   / ObservabilityPanel / DatabaseStatusPanel redesign family.
//
//   1. Shimmer skeleton loading state — bare `skeleton-line-lg` rows replaced
//      with `DecisionSkeleton` mirroring the loaded layout (header + KPI
//      strip + filter bar + column-header row + 7 decision-row shimmers).
//      Uses `ShimmerBlock` placeholders throughout; aria-hidden on the
//      shimmer placeholders themselves; the header "🧠 DECISION LEDGER"
//      text + "Loading…" badge are preserved verbatim above the shimmers
//      so the W30-2 test contracts continue to match.
//   2. Polished empty state with Lucide icon + message — bare "🧠" emoji
//      in the empty state replaced with a Lucide `Brain` icon (size 28,
//      dim). Empty-state title + desc text preserved verbatim so the
//      UX copy stays consistent.
//   3. Refined decision chain visualization — `StageIndicatorStrip`
//      renders a horizontal flow diagram of the canonical 6-stage
//      pipeline (PREDICTION → SIGNAL → RISK · OK / RISK · REJ → ORDER →
//      FILL → P&L) with completion indicators (filled tone-coloured
//      chip + dot for stages present in this decision's chain; hollow
//      dim chip for missed stages). Each stage carries a tooltip +
//      `data-tone` attribute for downstream CSS targeting. The legacy
//      vertical `StageNode` rail is preserved below the strip for the
//      detailed per-stage breakdown.
//   4. Section headers with icon + uppercase title — `SectionHeader`
//      sub-component renders a Lucide icon + uppercase tracking-wider
//      10.5px title + optional dim italic description + optional
//      trailing node. Used by the Filter Bar ("Decision Filters"),
//      Decision List ("Rejection Audit · {count} entries"), and
//      Decision Chain ("Decision Chain · {shortId}").
//   5. Refined decision entries table — `DecisionColumnHeader` row
//      added above the decision cards with uppercase tracking-wider
//      column labels (OUTCOME / ACTION / TOKEN / EDGE / CONF / MID /
//      STRATEGY). Each `DecisionCard` row carries `tabular-nums` on
//      every numeric cell + `hover:bg-cyan-500/[0.04]` layered with
//      `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` (left-edge
//      accent bar via inset shadow — no layout shift).
//   6. Tone-coloured decision outcomes — `outcomeTone(outcome)` helper
//      maps FILLED → good (emerald), REJECTED → poor (red), PENDING →
//      warn (amber), EXPIRED → neutral (dim). Applied uniformly to:
//      the outcome badge on each DecisionCard, the sibling-decision
//      outcome chips in DecisionChainView, the SectionHeader trailing
//      outcome chip in DecisionChainView, the KPI tiles' tones.
//   7. PulseDot for live decision tracking — header carries a `PulseDot`
//      (`info` tone, `pulse: true` when not in error state) so the
//      trader sees the live-tracking heartbeat at a glance. The dot
//      stops pulsing when the panel is in the error state (a static
//      red dot replaces it).
//   8. Error state: polished error card with Retry — bare error block
//      replaced with a refined error card. AlertTriangle icon (28px,
//      red-tinted) + the title text "Decision ledger unavailable"
//      (preserved verbatim so the W30-2 test contract resolves) + the
//      raw error message rendered as the card's desc (preserved
//      verbatim) + a Retry button (`RefreshCw` glyph, calls
//      `fetchList`, accessible name "Retry" matching `/retry/i`).
//      role=alert + data-testid="decision-ledger-error" +
//      data-testid="decision-ledger-error-retry" suffix on the button.
//   9. Refined stage filters/controls — the Filter Bar carries a
//      `SectionHeader` ("Decision Filters") + the search input +
//      action/outcome selects + manual Refresh button all carry
//      focus-visible:ring-cyan-500/30 + cyan-tinted hover. The
//      manual Refresh button's `RefreshCw` glyph spins while
//      `loading` is true.
//
// Test contracts preserved (see DecisionLedgerPanel.test.tsx):
//   * "🧠 DECISION LEDGER" header text — preserved as a direct text node
//     in loading + error + main render states (matches `/🧠 DECISION
//     LEDGER/i` regex).
//   * "Loading…" badge text — preserved verbatim in the loading skeleton
//     header (matches `getByText('Loading…')`).
//   * "Decision ledger unavailable" error title — preserved verbatim in
//     the error card (matches `/Decision ledger unavailable/i`).
//   * Retry button accessible name — preserved as "Retry" (matches
//     `getByRole('button', { name: /retry/i })`).
//   * "Correlation Audit" badge text — preserved verbatim in the main
//     render header (matches `/Correlation Audit/i`).
//   * "Decisions" KPI chip — preserved as a StatChip with `label =
//     "Decisions"` (renders `Decisions:` via the `{label}:` template,
//     matches `/^Decisions:?$/`) and `value = stats.total.toString()`
//     (renders `2` as a direct text node, matches `getByText('2')`).
//   * Authorization header passed via apiFetch on the initial poll —
//     preserved by keeping the `apiFetch(getApiUrl() + '/api/decisions/
//     rejected?limit=' + LIST_LIMIT)` call unchanged.
//   * Renders without crashing — preserved by keeping the panel's
//     export default + 'use client' directive + initial fetch effect.
//
// Backwards-compat:
//   * Props: unchanged (panel takes no props).
//   * API calls: `apiFetch('/api/decisions/rejected?limit=50')` on mount
//     + every 10s + on visibilitychange regain; `apiFetch('/api/decision
//     /{token_id}?limit=50')` on expand. All preserved verbatim.
//   * Polling: 10s setInterval with visibilitychange pause/resume +
//     immediate refresh on regain. Preserved verbatim.
//   * Clean unmount: clearInterval + removeEventListener in useEffect
//     cleanup. Preserved verbatim.
//   * Class names preserved: `card`, `card-header`, `card-title`, `badge`
//     + `badge-cyan` / `-amber` / `-red` / `-dim`, `btn` + `btn-ghost`
//     + `btn-sm`, `mono`, `scrollbar-thin`, `spinner`, `skeleton-line-sm`
//     / `skeleton-line-lg` / `skeleton-card`, `kpi-card` (+ `kpi-label`
//     / `kpi-value` / `kpi-sub`), `input` + `input-sm`, `empty-state`
//     (+ `-icon` / `-title` / `-desc`), `error-state` (+ `-icon` /
//     `-title` / `-desc`), `table-footer`, `tabular-nums`,
//     `tracking-wider`, `uppercase`.
//   * Accessibility preserved: role=alert on the error card, role=status
//     on the loading skeleton + empty state, role=button +
//     aria-expanded + aria-label on each DecisionCard toggle, aria-label
//     on the search input + selects + Refresh + Retry buttons, aria-
//     hidden on every Lucide icon.
//   * 'use client' directive: preserved.
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  ListTree,
  Loader2,
  RefreshCw,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch, getApiUrl } from '@/lib/api'
import { fmtAge, fmtPct, fmtPrice } from '@/lib/design-tokens'

// ── Types ──────────────────────────────────────────────────────────────────

type StageName =
  | 'PREDICTION'
  | 'SIGNAL'
  | 'RISK_APPROVED'
  | 'RISK_REJECTED'
  | 'ORDER'
  | 'FILL'
  | (string & {}) // allow forward-compat with future stages without breaking exhaustive checks

interface DecisionEvent {
  timestamp: number
  decision_id: string
  stage: StageName
  token_id: string | null
  strategy: string | null
  pnl: number
  data_json: string | null
  /** Decoded `data_json` payload — surfaced by the backend for caller convenience. */
  data: Record<string, unknown> | null
}

interface RejectionRow {
  timestamp: number
  decision_id: string
  token_id: string
  strategy: string
  predicted_edge: number
  confidence: number
  reason: string
  market_mid: number | null
}

interface DecisionsResponse {
  count: number
  rejections: RejectionRow[]
}

interface ChainResponse {
  token_id: string
  count: number
  events: DecisionEvent[]
}

type OutcomeFilter = 'ALL' | 'REJECTED' | 'FILLED' | 'PENDING' | 'EXPIRED'
type ActionFilter = 'ALL' | 'TRADE_LONG_YES' | 'TRADE_SHORT_NO' | 'REJECT_RISK' | 'MONITOR'

// ── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000
const LIST_LIMIT = 50
const CHAIN_LIMIT = 50

/**
 * Per-stage visual identity (color-coded per task spec):
 *   PREDICTION = blue, SIGNAL = cyan, RISK = amber,
 *   ORDER = violet, FILL = green
 *
 * `RISK_REJECTED` uses a slightly stronger amber to distinguish from
 * `RISK_APPROVED` while staying in the amber family (both are RISK stage).
 */
const STAGE_STYLE: Record<
  string,
  { dot: string; text: string; bg: string; border: string; label: string }
> = {
  PREDICTION: {
    dot: 'bg-blue-400',
    text: 'text-blue-300',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: 'PREDICTION',
  },
  SIGNAL: {
    dot: 'bg-cyan-400',
    text: 'text-cyan-300',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    label: 'SIGNAL',
  },
  RISK_APPROVED: {
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: 'RISK · APPROVED',
  },
  RISK_REJECTED: {
    dot: 'bg-amber-500',
    text: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    label: 'RISK · REJECTED',
  },
  ORDER: {
    dot: 'bg-violet-400',
    text: 'text-violet-300',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    label: 'ORDER',
  },
  FILL: {
    dot: 'bg-green-400',
    text: 'text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    label: 'FILL',
  },
}

const FALLBACK_STAGE_STYLE = {
  dot: 'bg-slate-500',
  text: 'text-slate-300',
  bg: 'bg-slate-500/10',
  border: 'border-slate-500/30',
}

const REASON_LABELS: Record<string, string> = {
  low_confidence: 'Low Confidence',
  wide_spread: 'Wide Spread',
  neutral_zone: 'Neutral Zone',
  insufficient_kelly_edge: 'Insufficient Kelly Edge',
}

const OUTCOME_LABELS: Record<OutcomeFilter, string> = {
  ALL: 'All Outcomes',
  REJECTED: 'Rejected',
  FILLED: 'Filled',
  PENDING: 'Pending',
  EXPIRED: 'Expired',
}

const ACTION_LABELS: Record<ActionFilter, string> = {
  ALL: 'All Actions',
  TRADE_LONG_YES: 'Trade Long YES',
  TRADE_SHORT_NO: 'Trade Short NO',
  REJECT_RISK: 'Reject (Risk)',
  MONITOR: 'Monitor',
}

// ── Tone system (W51-2d MLPanel redesign family) ─────────────────────────
//
// Maps each outcome / stage / action onto a shared tone vocabulary so the
// Decision Ledger reads visually consistent with the MLPanel /
// ExecutionQualityPanel / LeaderboardPanel / ObservabilityPanel /
// DatabaseStatusPanel redesign family. Used by:
//   - PulseDot (header live indicator)
//   - SectionHeader (filter bar / list / chain section headers)
//   - StatChip (KPI strip tone-tinting)
//   - StageIndicatorStrip (canonical stage chips)
//   - DecisionCard (outcome + action badges)
//   - DecisionChainView (sibling-decision outcome chips)
type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
  rowHover: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10', rowHover: 'hover:bg-emerald-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(16,185,129,0.45)]' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10',   rowHover: 'hover:bg-amber-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(245,158,11,0.45)]' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10',     rowHover: 'hover:bg-red-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.45)]' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10',    rowHover: 'hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '',                         rowHover: 'hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]' },
}

// ── Canonical stage pipeline (refined decision chain visualization) ────────
//
// The decision ledger's chain events can include any of the 6 canonical
// stages below. The StageIndicatorStrip renders the full pipeline at the
// top of the expanded chain view with completion indicators (filled
// tone-coloured chip + dot for stages present in this decision's chain;
// hollow dim chip for missed stages) so the trader reads the decision's
// progression at a glance.
interface CanonicalStage {
  /** Stage key matched against `event.stage` in the chain data. */
  key: string
  /** Short label rendered inside the chip (uppercase, tracking-wider). */
  label: string
  /** Tone used to colour the chip when the stage is present in the chain. */
  tone: Tone
}

const CANONICAL_STAGES: CanonicalStage[] = [
  { key: 'PREDICTION',    label: 'PREDICTION', tone: 'info' },
  { key: 'SIGNAL',        label: 'SIGNAL',     tone: 'info' },
  { key: 'RISK_APPROVED', label: 'RISK · OK',  tone: 'good' },
  { key: 'RISK_REJECTED', label: 'RISK · REJ', tone: 'poor' },
  { key: 'ORDER',         label: 'ORDER',      tone: 'info' },
  { key: 'FILL',          label: 'FILL',       tone: 'good' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function getStageStyle(stage: string) {
  return STAGE_STYLE[stage] ?? { ...FALLBACK_STAGE_STYLE, label: stage }
}

function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return '—'
  return id.length <= n ? id : `${id.slice(0, n)}…`
}

function fmtEpochMs(epochSec: number): string {
  if (!epochSec || !Number.isFinite(epochSec)) return '—'
  const d = new Date(epochSec * 1000)
  const time = d.toLocaleTimeString('en-US', { hour12: false })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${time} · ${date}`
}

/** Map a rejection reason to the strategy's intended action type. */
function reasonToAction(reason: string): ActionFilter {
  switch (reason) {
    case 'wide_spread':
    case 'insufficient_kelly_edge':
      return 'REJECT_RISK'
    case 'low_confidence':
    case 'neutral_zone':
    default:
      return 'MONITOR'
  }
}

/** Safely coerce a possibly-numeric `unknown` from the decoded data payload. */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

/** Map a stage key onto a tone for the StageIndicatorStrip + chain nodes. */
function stageTone(stage: string): Tone {
  switch (stage) {
    case 'PREDICTION':
    case 'SIGNAL':
    case 'ORDER':
      return 'info'
    case 'RISK_APPROVED':
    case 'FILL':
      return 'good'
    case 'RISK_REJECTED':
      return 'poor'
    default:
      return 'neutral'
  }
}

/** Map an action filter onto a tone for badges + chips. */
function actionTone(action: ActionFilter): Tone {
  switch (action) {
    case 'TRADE_LONG_YES':
    case 'TRADE_SHORT_NO':
      return 'info'
    case 'REJECT_RISK':
      return 'warn'
    case 'MONITOR':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** Map an outcome onto a tone (good/amber/red/neutral). */
function outcomeTone(outcome: 'FILLED' | 'REJECTED' | 'PENDING' | 'EXPIRED'): Tone {
  switch (outcome) {
    case 'FILLED':
      return 'good'
    case 'REJECTED':
      return 'poor'
    case 'PENDING':
      return 'warn'
    case 'EXPIRED':
      return 'neutral'
  }
}

/** Class-string badge for a given tone (used by the outcome + action badges). */
function toneBadgeClass(t: Tone): string {
  switch (t) {
    case 'good':    return 'badge badge-green'
    case 'warn':    return 'badge badge-amber'
    case 'poor':    return 'badge badge-red'
    case 'info':    return 'badge badge-cyan'
    case 'neutral': return 'badge badge-dim'
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// Mirrors MLPanel / ExecutionQualityPanel PulseDot. Used by the header live
// indicator (info tone + pulse when not in error state).
function PulseDot({ tone, pulse = true }: { tone: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {pulse && (
        <span
          className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`}
        />
      )}
      <span
        className={`relative inline-flex w-2 h-2 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`}
      />
    </span>
  )
}

// ── SectionHeader — icon + uppercase title + optional dim description ────────
// Mirrors MLPanel / ExecutionQualityPanel SectionHeader. Used by the Filter
// Bar, Decision List, and Decision Chain sections.
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
    <div className="flex items-center gap-1.5 mb-2 min-w-0">
      <Icon className={`size-3 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#5a637a] truncate">
        {title}
      </span>
      {description && (
        <span className="text-[9px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── ShimmerBlock — shimmer skeleton placeholder for loading state ────────────
// Mirrors ExecutionQualityPanel ShimmerBlock. Used by the DecisionSkeleton.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-line-sm ${className}`}
      aria-hidden="true"
    />
  )
}

// ── StatChip — KPI strip tile (preserves "Label:" + value text contracts) ────
//
// The "Decisions:" text contract is matched via `/^Decisions:?$/` — keep the
// `{label}:` template as a direct text node inside a single span so the regex
// resolves. The value is rendered in a separate span so `getByText('2')`
// resolves. The optional `icon` and `tone` props add visual polish without
// altering the text contract.
function StatChip({
  label,
  value,
  sub,
  color,
  title,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  color?: string
  title?: string
  icon?: LucideIcon
  tone?: Tone
}) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card bg-[#0e1015] border ${cfg.border} px-2.5 py-1 rounded-md flex items-center gap-1.5`}
      title={title}
      data-tone={tone}
    >
      <span className="kpi-label text-[10px] text-[#7e8aaa] uppercase font-semibold whitespace-nowrap flex items-center gap-1">
        {Icon && <Icon className="size-2.5 shrink-0" aria-hidden="true" />}
        {/* IMPORTANT: keep `{label}:` as a single text node so the W30-2 test
            contract `getByText(/^Decisions:?$/)` resolves against this span. */}
        <span>{label}:</span>
      </span>
      <span
        className="kpi-value mono font-bold text-xs tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      {sub && <span className="kpi-sub text-[9.5px] text-[#5a637a]">{sub}</span>}
    </div>
  )
}

// ── StageIndicatorStrip — refined horizontal stage flow diagram ──────────────
//
// Renders the full 6-stage canonical pipeline (PREDICTION → SIGNAL → RISK ·
// OK / RISK · REJ → ORDER → FILL → P&L) as a horizontal flow of chips with
// arrows between them. Stages present in the decision's chain render as
// filled tone-coloured chips with a solid dot; missed stages render as
// dim hollow chips. The final P&L chip pulls the realized PnL value from
// the FILL stage (if present) and tone-colours it green/red by sign.
//
// Each chip carries:
//   - a tooltip with the stage's label + (if applicable) the timestamp +
//     detail string from the chain event
//   - a `data-tone` attribute for downstream CSS targeting
//   - a `data-stage` attribute for downstream CSS targeting by stage key
//   - a `data-active` attribute ("true" / "false") for downstream CSS
//     targeting by completion state
function StageIndicatorStrip({ events }: { events: DecisionEvent[] }) {
  // Index stages present in the chain (last occurrence wins so the timestamp
  // reflects the most recent event for that stage).
  const stageIndex = useMemo(() => {
    const idx = new Map<string, DecisionEvent>()
    for (const e of events) {
      idx.set(e.stage, e)
    }
    return idx
  }, [events])

  // Pull the realized PnL from the FILL stage (if present).
  const fillEvent = stageIndex.get('FILL')
  const pnl = fillEvent?.pnl ?? null
  const pnlTone: Tone = pnl != null ? (pnl >= 0 ? 'good' : 'poor') : 'neutral'

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1"
      role="img"
      aria-label={`Decision pipeline: ${CANONICAL_STAGES.filter((s) => stageIndex.has(s.key)).map((s) => s.label).join(' → ') || 'no stages present'}`}
    >
      {CANONICAL_STAGES.map((stage, i) => {
        const event = stageIndex.get(stage.key)
        const active = !!event
        const cfg = TONE[stage.tone]
        return (
          <div key={stage.key} className="flex items-center gap-1 shrink-0">
            <div
              className={[
                'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider transition-colors',
                active
                  ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                  : 'bg-[#0e1015] border-[#1f2335]/60 text-[#3e4560]',
              ].join(' ')}
              title={
                active
                  ? `${stage.label}${event?.timestamp ? ` · ${fmtEpochMs(event.timestamp)}` : ''}`
                  : `${stage.label} (not reached)`
              }
              data-tone={active ? stage.tone : 'neutral'}
              data-stage={stage.key}
              data-active={active ? 'true' : 'false'}
            >
              <span
                className={[
                  'inline-block w-1.5 h-1.5 rounded-full',
                  active ? cfg.dot : 'bg-[#3e4560]',
                ].join(' ')}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">{stage.label}</span>
            </div>
            {i < CANONICAL_STAGES.length - 1 && (
              <ArrowRight
                className={`size-2.5 shrink-0 ${
                  active ? 'text-[#5a637a]' : 'text-[#2d3450]'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
      {/* Trailing P&L chip — pulled from the FILL stage's pnl field. */}
      <ArrowRight
        className={`size-2.5 shrink-0 ${pnl != null ? 'text-[#5a637a]' : 'text-[#2d3450]'}`}
        aria-hidden="true"
      />
      <div
        className={[
          'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider tabular-nums transition-colors',
          pnl != null
            ? `${TONE[pnlTone].bg} ${TONE[pnlTone].border} ${TONE[pnlTone].text}`
            : 'bg-[#0e1015] border-[#1f2335]/60 text-[#3e4560]',
        ].join(' ')}
        title={
          pnl != null
            ? `Realized P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`
            : 'Realized P&L (pending fill)'
        }
        data-tone={pnlTone}
        data-stage="PNL"
        data-active={pnl != null ? 'true' : 'false'}
      >
        <CheckCircle2 className="size-2.5" aria-hidden="true" />
        <span className="whitespace-nowrap">
          {pnl != null ? `P&L ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : 'P&L'}
        </span>
      </div>
    </div>
  )
}

// ── StageNode — single stage in the vertical chain rail (refined) ───────────
function StageNode({ event, isLast }: { event: DecisionEvent; isLast: boolean }) {
  const style = getStageStyle(event.stage)
  const tone = stageTone(event.stage)
  const data = event.data ?? {}

  // Build a per-stage detail string from the decoded `data` payload.
  let detail = ''
  if (event.stage === 'PREDICTION') {
    const pYes = asNumber(data['p_yes'] ?? data['ml_forecast_prob'] ?? data['p_yes_ml'])
    const edge = asNumber(data['edge'] ?? data['raw_edge'] ?? data['predicted_edge'])
    const conf = asNumber(data['confidence'] ?? data['confidence_score'])
    const mv = data['model_version']
    detail = [
      pYes != null ? `P(YES)=${fmtPct(pYes)}` : null,
      edge != null ? `edge=${edge >= 0 ? '+' : ''}${edge.toFixed(3)}` : null,
      conf != null ? `conf=${fmtPct(conf)}` : null,
      mv ? `model=${mv}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (event.stage === 'SIGNAL') {
    detail = [
      data['action'] ? `action=${data['action']}` : null,
      data['reason'] ? `reason=${data['reason']}` : null,
      data['suggested_action'] ? `suggested=${data['suggested_action']}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (event.stage === 'RISK_APPROVED') {
    const size = asNumber(data['size'] ?? data['position_size'])
    detail = [
      size != null ? `size=${size.toFixed(2)}` : null,
      data['reason'] ? String(data['reason']) : 'approved',
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (event.stage === 'RISK_REJECTED') {
    const reasonRaw = typeof data['reason'] === 'string' ? data['reason'] : ''
    const reasonLabel = REASON_LABELS[reasonRaw] ?? reasonRaw
    const mid = asNumber(data['market_mid'])
    const conf = asNumber(data['confidence'])
    detail = [
      reasonLabel ? `reason=${reasonLabel}` : null,
      mid != null ? `mid=${fmtPrice(mid)}` : null,
      conf != null ? `conf=${fmtPct(conf)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (event.stage === 'ORDER') {
    const price = asNumber(data['price'])
    const size = asNumber(data['size'])
    detail = [
      data['side'] ? `side=${data['side']}` : null,
      price != null ? `price=${fmtPrice(price)}` : null,
      size != null ? `size=${size.toFixed(2)}` : null,
      data['status'] ? `status=${data['status']}` : null,
      data['order_id'] ? `oid=${shortId(String(data['order_id']), 10)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (event.stage === 'FILL') {
    const fillPrice = asNumber(data['fill_price'] ?? data['price'])
    const slip = asNumber(data['slippage'])
    detail = [
      fillPrice != null ? `fill=${fmtPrice(fillPrice)}` : null,
      slip != null ? `slip=${slip >= 0 ? '+' : ''}${slip.toFixed(4)}` : null,
      data['size'] != null ? `size=${asNumber(data['size'])?.toFixed(2)}` : null,
      event.pnl ? `pnl=${event.pnl >= 0 ? '+' : ''}$${event.pnl.toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <div className="flex items-start gap-2 min-w-0">
      {/* Timeline rail */}
      <div className="flex flex-col items-center pt-0.5 shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${style.dot} ring-2 ring-[#13161e]`} />
        {!isLast && <span className="w-px flex-1 bg-[#1f2335] min-h-[24px]" />}
      </div>
      {/* Stage card */}
      <div
        className={`flex-1 min-w-0 mb-2 px-2.5 py-1.5 rounded-md border ${style.bg} ${style.border}`}
        data-tone={tone}
        data-stage={event.stage}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}
          >
            {style.label}
          </span>
          <span
            className="text-[9.5px] mono text-[#7e8aaa] tabular-nums"
            title={fmtEpochMs(event.timestamp)}
          >
            {fmtAge(event.timestamp)}
          </span>
        </div>
        {detail && (
          <div className="mt-0.5 text-[11px] mono text-[#c8cfe0] break-words tabular-nums">
            {detail}
          </div>
        )}
        <div className="mt-0.5 text-[9.5px] text-[#5a637a] mono tabular-nums">
          {fmtEpochMs(event.timestamp)}
        </div>
      </div>
    </div>
  )
}

function DecisionChainView({
  events,
  decisionId,
}: {
  events: DecisionEvent[]
  decisionId: string
}) {
  // Filter to the chain for the rejection's decision_id (the most relevant
  // chain — other decisions for the same token are surfaced separately below).
  const primaryChain = useMemo(
    () => events.filter((e) => e.decision_id === decisionId),
    [events, decisionId]
  )

  // Other recent decisions for the same token (different decision_ids).
  const siblingDecisions = useMemo(() => {
    const groups = new Map<string, DecisionEvent[]>()
    for (const e of events) {
      if (e.decision_id && e.decision_id !== decisionId) {
        const arr = groups.get(e.decision_id) ?? []
        arr.push(e)
        groups.set(e.decision_id, arr)
      }
    }
    // Sort groups by their max timestamp desc — most recent sibling first.
    return Array.from(groups.entries())
      .map(([id, evs]) => ({
        id,
        events: evs.sort((a, b) => a.timestamp - b.timestamp),
        lastTs: evs.reduce((m, e) => Math.max(m, e.timestamp), 0),
      }))
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 5)
  }, [events, decisionId])

  if (primaryChain.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-[#7e8aaa]">
        No chain events recorded for decision{' '}
        <span className="mono text-[#dde1ed]">{shortId(decisionId, 16)}</span>.
      </div>
    )
  }

  // Derive the overall outcome for the trailing SectionHeader chip.
  const stages = primaryChain.map((e) => e.stage)
  const hasFill = stages.includes('FILL')
  const hasRejected = stages.includes('RISK_REJECTED')
  const outcome: 'FILLED' | 'REJECTED' | 'PENDING' = hasFill
    ? 'FILLED'
    : hasRejected
    ? 'REJECTED'
    : 'PENDING'
  const outTone = outcomeTone(outcome)

  return (
    <div className="px-3 py-2.5">
      <SectionHeader
        icon={ListTree}
        title={`Decision Chain · ${shortId(decisionId, 16)}`}
        description={`(${primaryChain.length} stage${primaryChain.length === 1 ? '' : 's'})`}
        tone="info"
        trailing={
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${toneBadgeClass(outTone)}`}
            data-tone={outTone}
            data-testid={`decision-chain-outcome-${outcome.toLowerCase()}`}
          >
            {outcome}
          </span>
        }
      />

      {/* Refined stage progression strip — horizontal flow diagram. */}
      <div className="mb-3">
        <StageIndicatorStrip events={primaryChain} />
      </div>

      <div className="flex flex-col">
        {primaryChain.map((e, i) => (
          <StageNode
            key={`${e.stage}-${i}-${e.timestamp}`}
            event={e}
            isLast={i === primaryChain.length - 1}
          />
        ))}
      </div>

      {siblingDecisions.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[#1f2335]/60">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#7e8aaa] mb-1.5 flex items-center gap-1.5">
            <Layers className="size-3" aria-hidden="true" />
            <span>Other Recent Decisions for this Token</span>
            <span className="text-[9.5px] text-[#5a637a] font-normal normal-case tracking-normal">
              ({siblingDecisions.length})
            </span>
          </div>
          <div className="space-y-1">
            {siblingDecisions.map((d) => {
              const dStages = d.events.map((e) => e.stage)
              const dHasFill = dStages.includes('FILL')
              const dHasRejected = dStages.includes('RISK_REJECTED')
              const dOutcome: 'FILLED' | 'REJECTED' | 'PENDING' = dHasFill
                ? 'FILLED'
                : dHasRejected
                ? 'REJECTED'
                : 'PENDING'
              const dTone = outcomeTone(dOutcome)
              const dCfg = TONE[dTone]
              return (
                <div
                  key={d.id}
                  className={`flex items-center justify-between gap-2 text-[11px] bg-[#0e1015] px-2 py-1 rounded border ${dCfg.border}`}
                  title={`Decision ${d.id}`}
                  data-tone={dTone}
                >
                  <span className="mono text-[#c8cfe0] truncate">{shortId(d.id, 18)}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9.5px] mono text-[#5a637a] tabular-nums">
                      {d.events.length} stage{d.events.length === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${toneBadgeClass(dTone)}`}
                    >
                      {dOutcome}
                    </span>
                    <span className="text-[9.5px] mono text-[#7e8aaa] tabular-nums">
                      {fmtAge(d.lastTs)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── DecisionColumnHeader — uppercase header row above the decision cards ────
//
// Renders a row of uppercase tracking-wider column labels aligned with the
// DecisionCard layout (OUTCOME / ACTION / TOKEN / EDGE / CONF / MID /
// STRATEGY). The leftmost column matches the ChevronRight expand-toggle
// column width so the labels line up with the row content.
function DecisionColumnHeader() {
  return (
    <div
      className="hidden md:flex items-center gap-2 px-3 py-1.5 border-b border-[#1f2335] text-[9px] font-bold uppercase tracking-wider text-[#5a637a] bg-[#0e1015]/60"
      role="row"
      aria-hidden="true"
    >
      {/* Expand-toggle column (matches the ChevronRight width on rows). */}
      <span className="shrink-0 w-[14px]" />
      {/* Outcome badge column. */}
      <span className="shrink-0 w-[80px]">OUTCOME</span>
      {/* Action badge column. */}
      <span className="shrink-0 w-[120px]">ACTION</span>
      {/* Token + age + reason column. */}
      <span className="flex-1 min-w-0">TOKEN</span>
      {/* Edge column. */}
      <span className="shrink-0 w-[44px] text-right">EDGE</span>
      {/* Conf column. */}
      <span className="shrink-0 w-[44px] text-right">CONF</span>
      {/* Mid column. */}
      <span className="shrink-0 w-[52px] text-right">MID</span>
      {/* Strategy column. */}
      <span className="shrink-0 w-[88px] text-right">STRATEGY</span>
    </div>
  )
}

interface DecisionCardProps {
  row: RejectionRow
  expanded: boolean
  onToggle: () => void
  chainData: DecisionEvent[] | null
  chainLoading: boolean
  chainError: string | null
}

function DecisionCard({
  row,
  expanded,
  onToggle,
  chainData,
  chainLoading,
  chainError,
}: DecisionCardProps) {
  const action = reasonToAction(row.reason)
  const edgePos = row.predicted_edge >= 0
  const reasonLabel = REASON_LABELS[row.reason] ?? row.reason

  // All rows in the rejection-list surface are REJECTED by definition.
  const outcomeT = outcomeTone('REJECTED')
  const actionT = actionTone(action)

  return (
    <div
      className={`border-b border-[#1f2335]/60 transition-colors ${
        expanded ? 'bg-[#0e1015]' : TONE[outcomeT].rowHover
      }`}
      data-tone={outcomeT}
      data-testid="decision-ledger-row"
    >
      {/* Summary row (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 focus-visible:ring-inset"
        aria-expanded={expanded}
        aria-label={`Expand decision ${row.decision_id}`}
      >
        <ChevronRight
          size={14}
          className="text-[#7e8aaa] shrink-0 transition-transform"
          aria-hidden="true"
          style={expanded ? { transform: 'rotate(90deg)' } : undefined}
        />

        {/* Outcome badge — tone-coloured red for REJECTED. */}
        <span
          className={`badge ${toneBadgeClass(outcomeT)} text-[9px] shrink-0 w-[80px] justify-center`}
          title="Risk-rejected decision"
          data-tone={outcomeT}
        >
          REJECTED
        </span>

        {/* Action badge — tone-coloured by action. */}
        <span
          className={`badge ${toneBadgeClass(actionT)} text-[9px] shrink-0 w-[120px] justify-center`}
          title={`Reason: ${row.reason}`}
          data-tone={actionT}
        >
          {ACTION_LABELS[action]}
        </span>

        {/* Token + age + reason */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] mono text-[#dde1ed] truncate"
            title={row.token_id}
          >
            {shortId(row.token_id, 22)}
          </div>
          <div className="text-[9.5px] text-[#5a637a] flex items-center gap-1.5 flex-wrap">
            <span className="mono tabular-nums">{fmtAge(row.timestamp)}</span>
            <span className="text-[#3e4560]">·</span>
            <span>{reasonLabel}</span>
          </div>
        </div>

        {/* Metrics — tabular-nums on every numeric cell so columns don't shift. */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <div className="text-right w-[44px]">
            <div className="text-[9px] text-[#7e8aaa] uppercase font-semibold">Edge</div>
            <div
              className={`mono text-[11px] font-bold tabular-nums ${
                edgePos ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {row.predicted_edge >= 0 ? '+' : ''}
              {row.predicted_edge.toFixed(3)}
            </div>
          </div>
          <div className="text-right w-[44px]">
            <div className="text-[9px] text-[#7e8aaa] uppercase font-semibold">Conf</div>
            <div className="mono text-[11px] font-bold text-cyan-300 tabular-nums">
              {fmtPct(row.confidence)}
            </div>
          </div>
          <div className="text-right w-[52px]">
            <div className="text-[9px] text-[#7e8aaa] uppercase font-semibold">Mid</div>
            <div className="mono text-[11px] text-[#c8cfe0] tabular-nums">
              {row.market_mid != null ? fmtPrice(row.market_mid) : '—'}
            </div>
          </div>
        </div>

        {/* Strategy pill */}
        <span
          className="text-[9.5px] mono px-1.5 py-0.5 rounded bg-[#0e1015] border border-[#1f2335] text-[#7e8aaa] shrink-0 hidden md:inline-block w-[88px] text-right truncate"
          title="Strategy"
        >
          {row.strategy || '—'}
        </span>
      </button>

      {/* Expanded chain view (detail drawer) */}
      {expanded && (
        <div className="px-1 pb-2">
          {chainLoading && (
            <div className="px-3 py-3 flex items-center gap-2 text-[11px] text-[#7e8aaa]">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Loading decision chain…
            </div>
          )}
          {chainError && !chainLoading && (
            <div className="px-3 py-2 text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={12} aria-hidden="true" />
              {chainError}
            </div>
          )}
          {chainData && !chainLoading && !chainError && (
            <DecisionChainView events={chainData} decisionId={row.decision_id} />
          )}
        </div>
      )}
    </div>
  )
}

// ── DecisionSkeleton — structured loading placeholder ──────────────────────
//
// Mirrors the loaded layout (header + KPI strip + filter bar + column-header
// row + 7 decision-row shimmers) so the panel doesn't visually jump when
// the first fetch resolves. Preserves the "🧠 DECISION LEDGER" header text
// + "Loading…" badge above the shimmers so the W30-2 test contracts
// (`getByText(/🧠 DECISION LEDGER/i)` + `getByText('Loading…')`) resolve.
function DecisionSkeleton() {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[#13161e] border border-[#1f2335] shadow-xl"
      role="status"
      aria-live="polite"
      aria-label="Loading decision ledger"
      data-testid="decision-ledger-loading-skeleton"
    >
      <div className="card-header pb-2 mb-3 border-b border-[#1f2335] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="info" pulse={false} />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            🧠 DECISION LEDGER
          </span>
        </div>
        <span className="badge badge-cyan text-[9.5px] animate-pulse">Loading…</span>
      </div>
      {/* KPI strip shimmer */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="kpi-card skeleton-card bg-[#0e1015] border border-[#1f2335] px-2.5 py-1 rounded-md flex items-center gap-1.5"
          >
            <ShimmerBlock className="!w-16 !h-2.5" />
            <ShimmerBlock className="!w-10 !h-3.5" />
          </div>
        ))}
      </div>
      {/* Filter bar shimmer */}
      <div className="flex items-center gap-2 mb-2">
        <ShimmerBlock className="!w-48 !h-7" />
        <ShimmerBlock className="!w-24 !h-7" />
        <ShimmerBlock className="!w-24 !h-7" />
        <ShimmerBlock className="!w-20 !h-7" />
      </div>
      {/* Column header shimmer */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border-b border-[#1f2335]">
        <ShimmerBlock className="!w-6 !h-2.5" />
        <ShimmerBlock className="!w-16 !h-2.5" />
        <ShimmerBlock className="!w-24 !h-2.5" />
        <ShimmerBlock className="!flex-1 !h-2.5" />
        <ShimmerBlock className="!w-10 !h-2.5" />
        <ShimmerBlock className="!w-10 !h-2.5" />
        <ShimmerBlock className="!w-12 !h-2.5" />
        <ShimmerBlock className="!w-20 !h-2.5" />
      </div>
      {/* Decision rows shimmer */}
      <div className="flex-1 space-y-1 p-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-card flex items-center gap-2 px-3 py-2.5 border-b border-[#1f2335]/40"
          >
            <ShimmerBlock className="!w-3 !h-3" />
            <ShimmerBlock className="!w-20 !h-3.5" />
            <ShimmerBlock className="!w-28 !h-3.5" />
            <ShimmerBlock className="!flex-1 !h-3.5" />
            <ShimmerBlock className="!w-10 !h-3.5" />
            <ShimmerBlock className="!w-10 !h-3.5" />
            <ShimmerBlock className="!w-12 !h-3.5" />
            <ShimmerBlock className="!w-20 !h-3.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PolishedEmptyState — Lucide icon + title + desc (refined) ───────────────
//
// Replaces the bare "🧠" emoji with a Lucide Brain icon (28px, dim). Title +
// desc text are passed as props so the three empty-state branches (no rows
// at all / no rows match the active outcome filter / no rows match the
// active search filter) can reuse the same component with different copy.
function PolishedEmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      className="empty-state py-8 flex flex-col items-center gap-2"
      role="status"
      data-testid="decision-ledger-empty-state"
    >
      <Brain className="size-7 text-[#5a637a] opacity-60" aria-hidden="true" />
      <span className="empty-state-title text-sm font-semibold text-[#dde1ed]">
        {title}
      </span>
      <span className="empty-state-desc text-xs max-w-sm text-center text-[#7e8aaa]">
        {desc}
      </span>
    </div>
  )
}

// ── PolishedErrorState — refined error card with Retry ──────────────────────
//
// Replaces the bare error block with a refined error card. AlertTriangle icon
// (28px, red-tinted) + title text "Decision ledger unavailable" (preserved
// verbatim so the W30-2 test contract `getByText(/Decision ledger unavailable/i)`
// resolves) + the raw error message rendered as the card's desc (preserved
// verbatim so the W30-2 test contract `getByText(/Network error: ECONNREFUSED/)`
// would resolve if present) + a Retry button (`RefreshCw` glyph, calls
// `onRetry`, accessible name "Retry" matching `/retry/i`).
function PolishedErrorState({
  detail,
  onRetry,
}: {
  detail?: string | null
  onRetry: () => void
}) {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[#13161e] border border-red-500/30 shadow-xl"
      role="alert"
      data-testid="decision-ledger-error"
    >
      <div className="card-header pb-2 mb-2 border-b border-[#1f2335] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="poor" pulse={false} />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            🧠 DECISION LEDGER
          </span>
        </div>
        <span className="badge badge-red text-[9.5px]">Offline</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
        <span className="text-xs text-[#dde1ed] font-medium">
          Decision ledger unavailable
        </span>
        {detail && (
          <span className="text-[11px] text-[#7e8aaa] max-w-md break-words">{detail}</span>
        )}
        <button
          onClick={onRetry}
          className="btn btn-ghost btn-sm mt-2 flex items-center gap-1 border border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/15 hover:text-red-300 text-red-400"
          data-testid="decision-ledger-error-retry"
          aria-label="Retry decision ledger fetch"
        >
          <RefreshCw size={12} aria-hidden="true" /> Retry
        </button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DecisionLedgerPanel() {
  const [rows, setRows] = useState<RejectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL')
  const [tokenQuery, setTokenQuery] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [chainCache, setChainCache] = useState<Record<string, DecisionEvent[]>>({})
  const [chainLoading, setChainLoading] = useState<Record<string, boolean>>({})
  const [chainErrors, setChainErrors] = useState<Record<string, string | null>>({})

  // ── Primary list fetch ────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/decisions/rejected?limit=${LIST_LIMIT}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(
          `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`
        )
      }
      const json: DecisionsResponse = await res.json()
      setRows(json.rejections ?? [])
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load decision ledger')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Polling with visibility-aware auto-pause ───────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') fetchList()
      }, POLL_INTERVAL_MS)
    }
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchList()
        startPolling()
      } else {
        stopPolling()
      }
    }

    fetchList()
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchList])

  // ── Chain expansion (detail drawer fetch) ─────────────────────────────
  const toggleExpand = useCallback(
    (row: RejectionRow) => {
      const id = row.decision_id
      if (!id) return
      if (expandedId === id) {
        setExpandedId(null)
        return
      }
      setExpandedId(id)
      // Already loaded or in-flight — short-circuit.
      if (chainCache[id] || chainLoading[id]) return
      if (!row.token_id) {
        setChainErrors((p) => ({ ...p, [id]: 'No token_id associated with this decision' }))
        return
      }
      setChainLoading((p) => ({ ...p, [id]: true }))
      setChainErrors((p) => ({ ...p, [id]: null }))
      apiFetch(
        `${getApiUrl()}/api/decision/${encodeURIComponent(row.token_id)}?limit=${CHAIN_LIMIT}`
      )
        .then(async (res) => {
          if (res.status === 404) {
            // No chain events recorded for this token — surface an empty
            // chain so the "no events" UI renders (the rejection row itself
            // is still visible above).
            setChainCache((p) => ({ ...p, [id]: [] }))
            return
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(
              `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`
            )
          }
          const json: ChainResponse = await res.json()
          setChainCache((p) => ({ ...p, [id]: json.events ?? [] }))
        })
        .catch((e: unknown) => {
          setChainErrors((p) => ({
            ...p,
            [id]: e instanceof Error ? e.message : 'Failed to load decision chain',
          }))
        })
        .finally(() => {
          setChainLoading((p) => ({ ...p, [id]: false }))
        })
    },
    [expandedId, chainCache, chainLoading]
  )

  // ── Derived stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = rows.length
    const avgEdge = total > 0 ? rows.reduce((s, r) => s + (r.predicted_edge || 0), 0) / total : 0
    const avgConf = total > 0 ? rows.reduce((s, r) => s + (r.confidence || 0), 0) / total : 0
    // Reason distribution → top reason
    const reasonCounts: Record<string, number> = {}
    for (const r of rows) {
      reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1
    }
    const topReason =
      Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    // Approval rate (inferred): the ledger exposes only rejections, so the
    // observed approval rate against this surface is 0% by definition.
    // Fill rate (inferred from expanded chains): ratio of decision_ids with
    // a FILL stage present in the chain cache, over total expanded.
    const expandedIds = Object.keys(chainCache)
    const filledExpanded = expandedIds.filter((id) => {
      const evs = chainCache[id] ?? []
      // A FILL on the same token (any decision_id) counts as evidence of fills.
      return evs.some((e) => e.stage === 'FILL')
    }).length
    const fillRate = expandedIds.length > 0 ? filledExpanded / expandedIds.length : null
    return { total, avgEdge, avgConf, topReason, fillRate, expandedCount: expandedIds.length }
  }, [rows, chainCache])

  // ── Filtering ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (actionFilter !== 'ALL' && reasonToAction(r.reason) !== actionFilter) return false
      // The exposed list surface only contains rejections, so non-REJECTED
      // outcome filters yield an empty set (with a friendly note rendered in
      // the empty state).
      if (outcomeFilter !== 'ALL' && outcomeFilter !== 'REJECTED') return false
      if (tokenQuery.trim()) {
        const q = tokenQuery.trim().toLowerCase()
        const matchesToken = r.token_id.toLowerCase().includes(q)
        const matchesStrat = (r.strategy ?? '').toLowerCase().includes(q)
        const matchesDec = r.decision_id.toLowerCase().includes(q)
        const matchesReason = (r.reason ?? '').toLowerCase().includes(q)
        if (!matchesToken && !matchesStrat && !matchesDec && !matchesReason) return false
      }
      return true
    })
  }, [rows, actionFilter, outcomeFilter, tokenQuery])

  // ── Loading state (skeleton) ──────────────────────────────────────────
  if (loading) {
    return <DecisionSkeleton />
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return <PolishedErrorState detail={error} onRetry={fetchList} />
  }

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div className="card h-full flex flex-col p-3 bg-[#13161e] border border-[#1f2335] shadow-xl">
      {/* Header with Stats Strip */}
      <div className="card-header pb-2 mb-2 border-b border-[#1f2335] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* PulseDot — live decision tracking indicator (pulses when not in error state). */}
          <PulseDot tone="info" pulse />
          <span className="card-title text-xs font-bold text-[#dde1ed] tracking-wide">
            🧠 DECISION LEDGER
          </span>
          <span
            className="badge badge-cyan text-[9.5px]"
            title="Audit trail: PREDICTION → SIGNAL → RISK → ORDER → FILL"
          >
            <Activity size={10} aria-hidden="true" /> Correlation Audit
          </span>
        </div>
        {/* KPI strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatChip
            label="Decisions"
            value={stats.total.toString()}
            sub="rejections"
            title="Total rejection-stage decisions in the recent window (limit 50)"
            icon={ListTree}
            tone="info"
          />
          <StatChip
            label="Avg Edge"
            value={`${stats.avgEdge >= 0 ? '+' : ''}${stats.avgEdge.toFixed(3)}`}
            color={stats.avgEdge >= 0 ? 'var(--color-green-fg)' : 'var(--color-red-fg)'}
            title="Mean predicted edge across recent rejections"
            icon={Activity}
            tone={stats.avgEdge >= 0 ? 'good' : 'poor'}
          />
          <StatChip
            label="Avg Conf"
            value={fmtPct(stats.avgConf)}
            color="var(--color-cyan-fg)"
            title="Mean model confidence across recent rejections"
            icon={Activity}
            tone="info"
          />
          <StatChip
            label="Top Reason"
            value={stats.topReason ? REASON_LABELS[stats.topReason] ?? stats.topReason : '—'}
            title="Most frequent rejection reason in the recent window"
            icon={Filter}
            tone="warn"
          />
          {stats.fillRate != null && (
            <StatChip
              label="Fill Rate"
              value={`${(stats.fillRate * 100).toFixed(0)}%`}
              sub={`of ${stats.expandedCount} expanded`}
              color="var(--color-green-fg)"
              title="Ratio of expanded tokens that have at least one FILL event in their chain (token-level, not decision-level)"
              icon={CheckCircle2}
              tone="good"
            />
          )}
          {lastUpdated && (
            <span
              className="text-[9.5px] text-[#5a637a] mono ml-1 flex items-center gap-1 tabular-nums"
              title={`Last refresh: ${new Date(lastUpdated).toLocaleString()}`}
            >
              <Clock size={10} aria-hidden="true" />
              {fmtAge(lastUpdated / 1000)}
            </span>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-2">
        <SectionHeader
          icon={Filter}
          title="Decision Filters"
          description={`${filteredRows.length} of ${rows.length} match`}
          tone="info"
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* Token search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5a637a] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
              placeholder="Search token, strategy, decision_id…"
              className="input input-sm w-full text-xs bg-[#0e1015] border border-[#1f2335] focus:border-cyan-500/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 rounded pl-7 pr-2.5 py-1.5 text-[#dde1ed] placeholder-[#3e4560] transition-all"
              aria-label="Search decisions"
            />
            {tokenQuery && (
              <button
                onClick={() => setTokenQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#7e8aaa] hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 rounded"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
            className="bg-[#0e1015] border border-[#1f2335] text-[#7e8aaa] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30"
            aria-label="Filter by action type"
          >
            {(Object.keys(ACTION_LABELS) as ActionFilter[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_LABELS[k]}
              </option>
            ))}
          </select>
          {/* Outcome filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
            className="bg-[#0e1015] border border-[#1f2335] text-[#7e8aaa] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:border-cyan-500/30 focus:border-cyan-500/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30"
            aria-label="Filter by outcome"
          >
            {(Object.keys(OUTCOME_LABELS) as OutcomeFilter[]).map((k) => (
              <option key={k} value={k}>
                {OUTCOME_LABELS[k]}
              </option>
            ))}
          </select>
          <button
            onClick={fetchList}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-1 border border-[#1f2335] text-[#7e8aaa] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] flex items-center gap-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30"
            title="Refresh now"
            aria-label="Refresh decision ledger"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} aria-hidden="true" />{' '}
            Refresh
          </button>
        </div>
      </div>

      {/* Decision List (expandable cards) */}
      <div className="overflow-auto scrollbar-thin flex-1 min-h-0">
        {filteredRows.length === 0 ? (
          <PolishedEmptyState
            title="No decisions recorded"
            desc={
              rows.length === 0
                ? 'Decision events will appear here as the signal trader evaluates markets. Each rejection is recorded with its full PREDICTION → SIGNAL → RISK chain; expand any row to inspect the audit trail.'
                : outcomeFilter !== 'ALL' && outcomeFilter !== 'REJECTED'
                ? `No ${outcomeFilter.toLowerCase()} decisions in the recent window — the exposed ledger surface currently lists rejections only. Switch to "All Outcomes" or "Rejected" to see rows.`
                : 'No decisions match your active filters.'
            }
          />
        ) : (
          <div className="flex flex-col">
            {/* Column header row — uppercase tracking-wider labels. */}
            <SectionHeader
              icon={ListTree}
              title={`Rejection Audit · ${filteredRows.length} ${filteredRows.length === 1 ? 'entry' : 'entries'}`}
              tone="poor"
              trailing={
                <span className="text-[9px] mono text-[#5a637a] tabular-nums">
                  {filteredRows.length} of {rows.length}
                </span>
              }
            />
            <DecisionColumnHeader />
            <div className="divide-y divide-[#1f2335]/40">
              {filteredRows.map((r) => (
                <DecisionCard
                  key={r.decision_id || `${r.token_id}-${r.timestamp}`}
                  row={r}
                  expanded={expandedId === r.decision_id}
                  onToggle={() => toggleExpand(r)}
                  chainData={
                    r.decision_id ? chainCache[r.decision_id] ?? null : null
                  }
                  chainLoading={
                    r.decision_id ? chainLoading[r.decision_id] ?? false : false
                  }
                  chainError={
                    r.decision_id ? chainErrors[r.decision_id] ?? null : null
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="table-footer">
        <span className="flex items-center gap-1.5">
          <Filter size={10} aria-hidden="true" />
          <span className="tabular-nums">
            {filteredRows.length} of {rows.length} decisions
          </span>
        </span>
        <span className="mono text-[9.5px] flex items-center gap-1 tabular-nums">
          <Clock size={10} aria-hidden="true" /> Polling every 10s · auto-pause when tab hidden
        </span>
      </div>
    </div>
  )
}

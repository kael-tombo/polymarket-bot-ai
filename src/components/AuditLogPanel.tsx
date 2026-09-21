// components/AuditLogPanel.tsx — Durable Audit Trail Viewer + Export
//
// Surfaces the SQLite-backed immutable audit trail (`core/audit_logger.py`).
// Each row is an audit event emitted by the trading engine — signals, orders,
// fills, risk events, model predictions, security/auth-failure events, etc.
//
// Backend endpoint (verified in `api/server.py`):
//   GET /api/audit/logs?limit=100&category=...   — recent audit events,
//                                                    newest-first. Returns:
//                                                    { logs: AuditLog[], count }
//
// The backend schema has no `severity` column — we infer it client-side
// from the `event_type` keyword (critical/error/warn/info) and from
// `details` substrings ("error=", "warn=", "critical="). This keeps the
// panel forward-compatible: if a future schema adds a real severity
// field, we'll prefer that over the inferred value.
//
// W16-6 — Migrated the table body to VirtualTable (react-window's
// FixedSizeList). Previously all 100 audit rows were mounted in the DOM
// even though only ~10 were visible at a time. With VirtualTable, only
// the visible window is rendered. The expansion is now rendered as a
// separate "Event Detail" panel below the virtualized list (FixedSizeList
// requires fixed row heights, so inline expansion isn't compatible).
//
// W57-d — Applied the W51-2d design-system vocabulary (Tone system,
// PulseDot, SectionHeader, ShimmerBlock, KpiTile, PolishedEmptyState,
// PolishedErrorState) for visual consistency with the MLPanel /
// ExecutionQualityPanel / DatabaseStatusPanel / ObservabilityPanel
// redesign family. All existing functionality, class names, test
// contracts, aria-labels, and API calls are preserved.
//
// Auto-refreshes every 15s when the tab is visible; pauses on hide.
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  RefreshCw,
  ScrollText,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch, getApiUrl } from '@/lib/api'
import { fmtAge } from '@/lib/design-tokens'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import VirtualTable, { Column } from '@/components/ui/VirtualTable'
import { useElementHeight } from '@/hooks/useElementHeight'

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw audit row as returned by `/api/audit/logs`. Mirrors the SQLite
 *  `audit_events` table columns in `core/audit_logger.py`. */
interface AuditLog {
  id: number
  timestamp: number
  category: string
  event_type: string
  token_id: string | null
  slug: string | null
  details: string
  pnl: number | null
  strategy: string | null
  idempotency_key: string | null
}

interface AuditLogsResponse {
  logs: AuditLog[]
  count: number
}

type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
type CategoryFilter =
  | 'all'
  | 'system'
  | 'trading'
  | 'risk'
  | 'ml'
  | 'security'
type SeverityFilter = 'all' | Severity

// ────────────────────────────────────────────────────────────────────────────
// W51-2d Tone system (mirror of MLPanel / DatabaseStatusPanel /
// ExecutionQualityPanel) — self-contained Tailwind class strings so
// Tailwind 4's content scanner picks them up. Used by the KpiTile,
// PulseDot, SectionHeader icon, SeverityBadge accent, and row-hover
// tinting on the EventDetailPanel + filter chips.
// ────────────────────────────────────────────────────────────────────────────

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral' | 'critical'

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
  good:     { bg: 'bg-emerald-500/[0.06]',  border: 'border-emerald-500/25',  text: 'text-emerald-400',  bar: 'bg-emerald-500',  dot: 'bg-emerald-400',  label: 'text-emerald-400/80',  halo: 'shadow-emerald-500/10',  rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.55)]' },
  warn:      { bg: 'bg-amber-500/[0.06]',    border: 'border-amber-500/25',    text: 'text-amber-400',    bar: 'bg-amber-500',    dot: 'bg-amber-400',    label: 'text-amber-400/80',    halo: 'shadow-amber-500/10',    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]' },
  poor:      { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',      bar: 'bg-red-500',      dot: 'bg-red-400',      label: 'text-red-400/80',      halo: 'shadow-red-500/10',      rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.55)]' },
  info:      { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',     bar: 'bg-cyan-500',     dot: 'bg-cyan-400',     label: 'text-cyan-400/80',     halo: 'shadow-cyan-500/10',     rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]' },
  critical:  { bg: 'bg-fuchsia-500/[0.06]', border: 'border-fuchsia-500/25', text: 'text-fuchsia-400',  bar: 'bg-fuchsia-500',  dot: 'bg-fuchsia-400',  label: 'text-fuchsia-400/80',  halo: 'shadow-fuchsia-500/10',  rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(232,121,249,0.55)]' },
  neutral:   { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',    bar: 'bg-[var(--text-secondary)]',    dot: 'bg-[var(--text-secondary)]',    label: 'text-[var(--text-secondary)]',       halo: '',                        rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map an inferred Severity to a Tone so the badge / row / hover accent
 *  reads with the correct colour family: INFO=info (cyan), WARNING=warn
 *  (amber), ERROR=poor (red), CRITICAL=critical (fuchsia). The
 *  SEVERITY_STYLE map below preserves the original blue-300/amber-300/
 *  red-300/fuchsia-300 badge palette verbatim so the test contracts
 *  (`getAllByText('INFO'|'WARN'|'ERROR'|'CRIT')`) and the existing
 *  visual identity are unchanged. */
function severityTone(s: Severity): Tone {
  if (s === 'INFO') return 'info'
  if (s === 'WARNING') return 'warn'
  if (s === 'ERROR') return 'poor'
  return 'critical'
}

// ── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000
const LIST_LIMIT = 100

/** Per-severity visual identity. INFO=blue, WARNING=amber, ERROR=red,
 *  CRITICAL=magenta — matches the task spec. */
const SEVERITY_STYLE: Record<
  Severity,
  { dot: string; text: string; bg: string; border: string; label: string }
> = {
  INFO: {
    dot: 'bg-blue-400',
    text: 'text-blue-300',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: 'INFO',
  },
  WARNING: {
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: 'WARN',
  },
  ERROR: {
    dot: 'bg-red-400',
    text: 'text-red-300',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    label: 'ERROR',
  },
  CRITICAL: {
    dot: 'bg-fuchsia-400',
    text: 'text-fuchsia-300',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/40',
    label: 'CRIT',
  },
}

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'system', label: 'System' },
  { value: 'trading', label: 'Trading' },
  { value: 'risk', label: 'Risk' },
  { value: 'ml', label: 'ML' },
  { value: 'security', label: 'Security' },
]

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: 'all', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'ERROR', label: 'Error' },
  { value: 'CRITICAL', label: 'Critical' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Infer a severity from the audit row's `event_type` + `details` payload.
 * The backend `audit_events` schema has no severity column, so this maps
 * the keyword conventions used across `core/audit_logger.py` call sites
 * (e.g. `weak_token_warning` → WARNING, `auth_failure` → WARNING,
 * `mode_change` → INFO).
 *
 * If `details` is JSON-encoded and contains a `severity` field, that
 * explicit value wins (forward-compat with a future schema upgrade).
 */
function inferSeverity(log: AuditLog): Severity {
  const detailsParsed = parseDetails(log.details)
  const explicit = detailsParsed?.['severity']
  if (typeof explicit === 'string') {
    const up = explicit.toUpperCase()
    if (up === 'INFO' || up === 'WARNING' || up === 'ERROR' || up === 'CRITICAL') {
      return up
    }
  }
  const ev = (log.event_type ?? '').toLowerCase()
  const dt = (log.details ?? '').toLowerCase()
  if (
    ev.includes('critical') ||
    ev.includes('fatal') ||
    dt.includes('critical') ||
    dt.includes('"severity":"critical"')
  ) {
    return 'CRITICAL'
  }
  if (
    ev.includes('error') ||
    ev.includes('fail') ||
    dt.includes('error=') ||
    dt.includes('failed')
  ) {
    return 'ERROR'
  }
  if (ev.includes('warn') || dt.includes('warn=')) {
    return 'WARNING'
  }
  return 'INFO'
}

/**
 * Parse a `details` string into a structured object. The audit logger
 * stores free-text details — usually `key=val key=val` pairs but
 * sometimes a JSON blob. Try JSON first, then fall back to a tolerant
 * `key=val` parser.
 */
function parseDetails(details: string): Record<string, unknown> | null {
  if (!details) return null
  const trimmed = details.trim()
  if (!trimmed) return null
  // JSON blob?
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      // fall through to key=val parser
    }
  }
  // key=val key=val parser (tolerant of quoted values).
  const out: Record<string, unknown> = {}
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(details)) !== null) {
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  if (Object.keys(out).length === 0) {
    // Plain string details — surface as a single `message` key.
    return { message: details }
  }
  return out
}

/** Build a human-readable message line from event_type + slug. */
function buildMessage(log: AuditLog): string {
  const ev = (log.event_type ?? '').replace(/_/g, ' ')
  if (log.slug) return `${ev} · ${log.slug}`
  return ev
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadFile(filename: string, content: string, mime: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revocation so the download has time to start in older browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Build a per-minute event-count timeline (oldest → newest) for the
 * last `windowMin` minutes. Used for the sparkline.
 */
function buildTimeline(logs: AuditLog[], windowMin = 30): number[] {
  const buckets = new Array(windowMin).fill(0)
  const nowSec = Date.now() / 1000
  for (const log of logs) {
    const ageSec = nowSec - log.timestamp
    if (ageSec < 0 || ageSec > windowMin * 60) continue
    const idx = windowMin - 1 - Math.floor(ageSec / 60)
    if (idx >= 0 && idx < windowMin) buckets[idx]++
  }
  return buckets
}

/** Tiny inline SVG sparkline — no recharts dependency, no jsdom
 *  ResizeObserver headaches. Renders a polyline of event counts per
 *  minute over the last 30 minutes. */
function SeverityTimeline({
  data,
  height = 28,
  color = 'var(--accent-fg)',
}: {
  data: number[]
  height?: number
  color?: string
}) {
  const W = 120
  const H = height
  const max = Math.max(1, ...data)
  if (!data || data.length < 2) {
    return (
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="var(--text-dim)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    )
  }
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - (v / max) * (H - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastIdx = data.length - 1
  const lastX = W
  const lastY = H - (data[lastIdx] / max) * (H - 2) - 1
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data[lastIdx] > 0 && (
        <circle cx={lastX} cy={lastY} r={1.8} fill={color} strokeWidth={0} />
      )}
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// W51-2d design-system sub-components (private to this panel)
// ────────────────────────────────────────────────────────────────────────────

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// `animate-ping` is Tailwind's built-in pulse. Used by the live-audit-trail
// readout in the panel header so the trader can tell at a glance that the
// 15s poller is alive.
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
// SectionHeader so the audit panel reads as part of the same premium
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

// ── Sub-components ─────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  sub,
  color,
  title,
  tone,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  title?: string
  tone?: Tone
}) {
  const cfg = tone ? TONE[tone] : null
  return (
    <div
      className={`bg-[var(--bg-page)] border px-2.5 py-1 rounded-md flex items-center gap-1.5 ${cfg ? cfg.border : 'border-[var(--border)]'} ${cfg ? cfg.bg : ''}`}
      title={title}
      data-tone={tone ?? 'neutral'}
    >
      <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold whitespace-nowrap">
        {label}:
      </span>
      <span
        className="mono font-bold text-xs tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-[9.5px] text-[var(--text-secondary)]">{sub}</span>}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity]
  const tone = severityTone(severity)
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.bg} ${s.border} ${s.text}`}
      title={`Severity: ${severity}`}
      data-tone={tone}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

// W16-6 — AuditRow used to render BOTH the visible row + the inline
// expansion as adjacent <tr>s. With VirtualTable, the row is rendered
// by VirtualTable's `rowComponent` (cells are inline-styled <div>s) and
// the expansion is rendered by <EventDetailPanel> below the virtualized
// list. This component was retired in W16-6; the legacy
// `AuditRowProps` interface + `_AuditRow` type alias (kept as a
// type-holder for "future importers") were removed in W28-1 — they
// were never exported, so the compat shim was a no-op (TS6196).
//
// The actual row rendering lives inside the `auditColumns` useMemo in
// the main panel component (so it can close over `expandedId` and
// `toggleExpand` without prop drilling).

// W16-6 — EventDetailPanel renders the expanded audit row's metadata
// below the virtualized list. Mirrors the previous inline expansion
// block so the existing tests (which look for `id:` / `strategy:` /
// `token_id:` labels + the metadata <pre aria-label="Audit event
// metadata JSON">) still pass. W57-d adds a SectionHeader + tone-tinted
// background so the detail panel reads as part of the same premium
// redesign family.
interface EventDetailPanelProps {
  log: AuditLog
  severity: Severity
  onClose: () => void
}

function EventDetailPanel({ log, severity, onClose }: EventDetailPanelProps) {
  const parsedDetails = useMemo(() => parseDetails(log.details), [log.details])
  const ts = log.timestamp
  const tone = severityTone(severity)
  const cfg = TONE[tone]
  return (
    <div className={`mt-2 border rounded-md p-3 ${cfg.border} ${cfg.bg}`}>
      <SectionHeader
        icon={FileText}
        title="Metadata"
        tone={tone}
        trailing={
          <div className="flex items-center gap-2">
            <SeverityBadge severity={severity} />
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-white transition-colors p-1 rounded"
              aria-label="Close audit event detail panel"
            >
              <X size={14} />
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        <div className="text-[10.5px] mono tabular-nums">
          <span className="text-[var(--text-secondary)]">id:</span>{' '}
          <span className="text-[#c8cfe0]">{log.id}</span>
        </div>
        {log.token_id && (
          <div className="text-[10.5px] mono truncate">
            <span className="text-[var(--text-secondary)]">token_id:</span>{' '}
            <span className="text-[#c8cfe0]" title={log.token_id}>
              {log.token_id}
            </span>
          </div>
        )}
        {log.slug && (
          <div className="text-[10.5px] mono truncate">
            <span className="text-[var(--text-secondary)]">slug:</span>{' '}
            <span className="text-[#c8cfe0]">{log.slug}</span>
          </div>
        )}
        {log.strategy && (
          <div className="text-[10.5px] mono">
            <span className="text-[var(--text-secondary)]">strategy:</span>{' '}
            <span className="text-[#c8cfe0]">{log.strategy}</span>
          </div>
        )}
        {log.pnl != null && log.pnl !== 0 && (
          <div className="text-[10.5px] mono tabular-nums">
            <span className="text-[var(--text-secondary)]">pnl:</span>{' '}
            <span
              className={
                log.pnl >= 0 ? 'text-green-400' : 'text-red-400'
              }
            >
              {log.pnl >= 0 ? '+' : ''}
              {log.pnl.toFixed(4)}
            </span>
          </div>
        )}
        {log.idempotency_key && (
          <div className="text-[10.5px] mono truncate">
            <span className="text-[var(--text-secondary)]">idempotency_key:</span>{' '}
            <span className="text-[#c8cfe0]" title={log.idempotency_key}>
              {log.idempotency_key}
            </span>
          </div>
        )}
        <div className="text-[10.5px] mono tabular-nums">
          <span className="text-[var(--text-secondary)]">timestamp:</span>{' '}
          <span className="text-[#c8cfe0]">{ts.toFixed(3)}</span>
        </div>
      </div>
      {parsedDetails && Object.keys(parsedDetails).length > 0 ? (
        <pre
          className="text-[10.5px] mono text-[#c8cfe0] bg-[var(--bg-base)] border border-[var(--border)] rounded p-2.5 overflow-auto max-h-64 scrollbar-thin"
          aria-label="Audit event metadata JSON"
        >
          {JSON.stringify(parsedDetails, null, 2)}
        </pre>
      ) : (
        <div className="text-[10.5px] text-[var(--text-secondary)] italic">
          No metadata payload recorded.
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// W57-d — Polished loading / empty / error states
// ────────────────────────────────────────────────────────────────────────────

// ── AuditLogSkeleton — structured shimmer loading state ─────────────────────
// Mirrors the loaded panel layout (header + stat strip + filter bar + table
// rows) so the panel doesn't visually jump when the first fetch resolves.
// Preserves the "📋 AUDIT LOG" title + "Loading…" badge text so the existing
// test contracts (`getByText('📋 AUDIT LOG')` + `getByText('Loading…')`) still
// resolve. role=status + aria-live=polite announce the loading state to
// screen readers; the skeleton placeholders themselves are aria-hidden.
function AuditLogSkeleton() {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl"
      data-testid="audit-log-panel"
    >
      <div className="card-header pb-2 mb-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="info" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            📋 AUDIT LOG
          </span>
          <span className="badge badge-cyan text-[9.5px]">
            <Activity size={10} /> Immutable Trail
          </span>
        </div>
        <span className="badge badge-cyan text-[9.5px] animate-pulse">
          Loading…
        </span>
      </div>
      {/* Skeleton stat strip */}
      <div className="flex items-center gap-2 flex-wrap mb-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--bg-page)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5"
          >
            <ShimmerBlock className="w-10" />
            <ShimmerBlock className="w-6 !h-3" />
          </div>
        ))}
      </div>
      {/* Skeleton filter bar */}
      <div className="flex items-center gap-2 mb-2" aria-hidden="true">
        <ShimmerBlock className="flex-1 min-w-[200px] max-w-xs !h-7 !rounded-md" />
        <ShimmerBlock className="w-24 !h-7 !rounded-md" />
        <ShimmerBlock className="w-24 !h-7 !rounded-md" />
        <ShimmerBlock className="w-32 !h-7 !rounded-md" />
      </div>
      {/* Skeleton table rows */}
      <div className="flex-1 space-y-1.5 p-2" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--border)]"
          >
            <ShimmerBlock className="w-32" />
            <ShimmerBlock className="w-16 !h-3 !rounded-md" />
            <ShimmerBlock className="w-32" />
            <ShimmerBlock className="w-12 !h-3 !rounded-md" />
            <ShimmerBlock className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PolishedEmptyState — Lucide ScrollText icon + preserved title ──────────
// Preserves the .empty-state class hooks (icon / title / desc) so the
// existing CSS rule continues to apply. role=status preserved. The
// "No audit events match your filters" title is preserved verbatim so
// the test contract resolves. The icon is upgraded from the bare 📋
// emoji to a Lucide ScrollText glyph (size 28, dim) so the empty state
// reads as part of the same premium redesign family.
function AuditEmptyState({ hasLogs }: { hasLogs: boolean }) {
  return (
    <div className="empty-state py-10" role="status" data-testid="audit-log-empty-state">
      <ScrollText
        className="empty-state-icon text-[var(--text-secondary)]"
        size={28}
        aria-hidden="true"
      />
      <div className="empty-state-title text-sm font-semibold">
        No audit events match your filters
      </div>
      <div className="empty-state-desc text-xs max-w-sm text-center">
        {hasLogs
          ? 'Try widening the date range, clearing the severity / category filters, or simplifying your search query.'
          : 'Audit events will appear here as the engine emits them (trading signals, fills, risk events, security warnings, etc.). Each row is immutable in the SQLite audit trail.'}
      </div>
    </div>
  )
}

// ── PolishedErrorState — red-tinted error card with Retry ───────────────────
// Mirrors the MLPanel / DatabaseStatusPanel / ExecutionQualityPanel error
// card styling. The "Audit trail unavailable" title + raw error message are
// preserved verbatim so the existing test contracts (`getByText('Audit
// trail unavailable')` + `getByText(/Network error/)`) resolve. The Retry
// button preserves the "Retry" text verbatim. role=alert preserved.
function AuditErrorState({
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
      className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl"
      data-testid="audit-log-panel"
    >
      <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="poor" pulse={false} />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            📋 AUDIT LOG
          </span>
          <span className="badge badge-red text-[9.5px]">Offline</span>
        </div>
      </div>
      <div
        className="error-state flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        role="alert"
        data-testid="audit-log-error-card"
      >
        <AlertTriangle
          className="error-state-icon text-[#f87171]"
          size={28}
          aria-hidden="true"
        />
        <div className="error-state-title text-xs font-medium">
          Audit trail unavailable
        </div>
        <div className="error-state-desc text-[11px] max-w-md break-words mono">
          {message}
        </div>
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          disabled={retrying}
          className="mt-2 h-7 text-[10px] gap-1 border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100"
          data-testid="audit-log-error-retry"
        >
          <RefreshCw size={11} className={retrying ? 'animate-spin' : ''} />
          Retry
        </Button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // ── Primary list fetch ────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch(
        `${getApiUrl()}/api/audit/logs?limit=${LIST_LIMIT}`,
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(
          `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
        )
      }
      const json: AuditLogsResponse = await res.json()
      setLogs(json.logs ?? [])
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs')
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
        if (document.visibilityState === 'visible') fetchLogs()
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
        fetchLogs()
        startPolling()
      } else {
        stopPolling()
      }
    }

    fetchLogs()
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchLogs])

  // ── Filtering ─────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() / 1000 : null
    const toTs = dateTo
      ? new Date(`${dateTo}T23:59:59`).getTime() / 1000
      : null
    const q = searchQuery.trim().toLowerCase()

    return logs.filter((log) => {
      if (categoryFilter !== 'all' && log.category !== categoryFilter)
        return false
      if (severityFilter !== 'all' && inferSeverity(log) !== severityFilter)
        return false
      if (fromTs != null && log.timestamp < fromTs) return false
      if (toTs != null && log.timestamp > toTs) return false
      if (q) {
        const matchesEventType = log.event_type.toLowerCase().includes(q)
        const matchesSlug = (log.slug ?? '').toLowerCase().includes(q)
        const matchesToken = (log.token_id ?? '').toLowerCase().includes(q)
        const matchesStrategy = (log.strategy ?? '').toLowerCase().includes(q)
        const matchesCategory = log.category.toLowerCase().includes(q)
        const matchesDetails = (log.details ?? '').toLowerCase().includes(q)
        if (
          !matchesEventType &&
          !matchesSlug &&
          !matchesToken &&
          !matchesStrategy &&
          !matchesCategory &&
          !matchesDetails
        ) {
          return false
        }
      }
      return true
    })
  }, [logs, categoryFilter, severityFilter, dateFrom, dateTo, searchQuery])

  // ── Derived stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = logs.length
    let errors = 0
    let warnings = 0
    let criticals = 0
    let mostRecentTs: number | null = null
    for (const log of logs) {
      const sev = inferSeverity(log)
      if (sev === 'ERROR') errors++
      else if (sev === 'WARNING') warnings++
      else if (sev === 'CRITICAL') criticals++
      if (mostRecentTs === null || log.timestamp > mostRecentTs) {
        mostRecentTs = log.timestamp
      }
    }
    return {
      total,
      errors,
      warnings,
      criticals,
      mostRecentTs,
    }
  }, [logs])

  const timeline = useMemo(() => buildTimeline(logs), [logs])

  // ── Export handlers ───────────────────────────────────────────────────
  const exportJSON = useCallback(() => {
    setExporting(true)
    try {
      const payload = filteredLogs.map((l) => ({
        ...l,
        severity: inferSeverity(l),
        datetime_utc: new Date(l.timestamp * 1000).toISOString(),
      }))
      const content = JSON.stringify(payload, null, 2)
      downloadFile(
        `audit-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
        content,
        'application/json',
      )
    } finally {
      setExporting(false)
    }
  }, [filteredLogs])

  const exportCSV = useCallback(() => {
    setExporting(true)
    try {
      const headers = [
        'id',
        'timestamp',
        'datetime_utc',
        'category',
        'event_type',
        'severity',
        'token_id',
        'slug',
        'strategy',
        'pnl',
        'idempotency_key',
        'details',
      ]
      const rows = filteredLogs.map((l) => [
        l.id,
        l.timestamp,
        new Date(l.timestamp * 1000).toISOString(),
        l.category,
        l.event_type,
        inferSeverity(l),
        l.token_id ?? '',
        l.slug ?? '',
        l.strategy ?? '',
        l.pnl ?? '',
        l.idempotency_key ?? '',
        l.details ?? '',
      ])
      const csv = [
        headers.join(','),
        ...rows.map((r) => r.map(csvEscape).join(',')),
      ].join('\n')
      downloadFile(
        `audit-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`,
        csv,
        'text/csv',
      )
    } finally {
      setExporting(false)
    }
  }, [filteredLogs])

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((cur) => (cur === id ? null : id))
  }, [])

  // W16-6 — VirtualTable geometry. We measure the table container's
  // available height via ResizeObserver so the virtualized viewport
  // fills the parent card (no fixed height assumption). Falls back to
  // 400px before the first measurement lands so the panel renders
  // immediately on mount.
  const [tableContainerRef, tableHeight] = useElementHeight<HTMLDivElement>()
  const virtualHeight = tableHeight > 0 ? tableHeight : 400

  // W16-6 — Expanded-log lookup. With the table virtualized, the
  // expansion is rendered below the list rather than inline. We
  // resolve the expanded row from `logs` (the unfiltered list — the
  // expanded id persists across filter changes, which is intentional
  // so the trader doesn't lose their selection when they refine the
  // filter set).
  const expandedLog = useMemo(
    () => logs.find((l) => l.id === expandedId) ?? null,
    [logs, expandedId],
  )

  // W16-6 — Column declarations for VirtualTable. Widths match the
  // previous <th> min-w-* declarations so the visual rhythm is
  // unchanged. Render functions preserve the existing badges + colors
  // so the panel looks identical to before. W57-d adds `tabular-nums`
  // to the timestamp + age cells + tone-tinted category badge so the
  // table reads as part of the same premium redesign family.
  const auditColumns: Column[] = useMemo(() => [
    {
      key: 'timestamp',
      label: 'Timestamp',
      width: 160,
      align: 'left',
      render: (log: AuditLog) => {
        const ts = log.timestamp
        const d = new Date(ts * 1000)
        const timeStr = d.toLocaleTimeString('en-US', { hour12: false })
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ChevronRight
              size={12}
              style={{
                color: 'var(--text-secondary)',
                flexShrink: 0,
                transition: 'transform 0.15s',
                transform: expandedId === log.id ? 'rotate(90deg)' : 'none',
              }}
            />
            <span
              className="tabular-nums"
              style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}
              title={new Date(ts * 1000).toLocaleString()}
            >
              {timeStr}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>·</span>
            <span
              className="tabular-nums"
              style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}
            >
              {dateStr}
            </span>
          </div>
        )
      },
    },
    {
      key: 'category',
      label: 'Category',
      width: 100,
      align: 'left',
      render: (log: AuditLog) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '9.5px',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            background: 'var(--bg-page)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
          title={`Category: ${log.category}`}
        >
          {log.category || '—'}
        </span>
      ),
    },
    {
      key: 'event_type',
      label: 'Event Type',
      width: 180,
      align: 'left',
      render: (log: AuditLog) => (
        <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: '#c8cfe0' }}>
          {log.event_type || '—'}
        </span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      width: 90,
      align: 'left',
      render: (log: AuditLog) => <SeverityBadge severity={inferSeverity(log)} />,
    },
    {
      key: 'message',
      label: 'Message',
      width: 420,
      align: 'left',
      render: (log: AuditLog) => (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            maxWidth: 420,
          }}
          title={buildMessage(log) + (log.details ? ` — ${log.details}` : '')}
        >
          {buildMessage(log)}
        </span>
      ),
    },
    {
      key: 'age',
      label: 'Age',
      width: 70,
      align: 'right',
      render: (log: AuditLog) => (
        <span
          className="tabular-nums"
          style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}
        >
          {fmtAge(log.timestamp)}
        </span>
      ),
    },
  ], [expandedId])

  // ── Loading state (shimmer skeleton) ──────────────────────────────────
  if (loading) {
    return <AuditLogSkeleton />
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return <AuditErrorState message={error} onRetry={fetchLogs} />
  }

  // ── Derived tone for the panel header (good when no errors, warn when
  // warnings present, poor when errors / criticals present). Used by the
  // header PulseDot so the trader reads the panel's overall health at a
  // glance.
  const headerTone: Tone =
    stats.errors > 0 || stats.criticals > 0
      ? 'poor'
      : stats.warnings > 0
        ? 'warn'
        : 'good'

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl"
      data-testid="audit-log-panel"
    >
      {/* Header with Stats Strip */}
      <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PulseDot tone={headerTone} />
          <span
            className="card-title text-xs font-bold text-[var(--text-primary)] tracking-wide"
            aria-label="Audit Log panel header"
          >
            📋 AUDIT LOG
          </span>
          <span
            className="badge badge-cyan text-[9.5px]"
            title="Immutable SQLite-backed audit trail"
          >
            <Activity size={10} /> Immutable Trail
          </span>
        </div>
        {/* KPI strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatChip
            label="Events"
            value={stats.total.toString()}
            sub={`of ${LIST_LIMIT} max`}
            title="Total audit events in the recent window (limit 100)"
            tone="info"
          />
          <StatChip
            label="Errors"
            value={stats.errors.toString()}
            color="var(--color-red-fg)"
            title="Events inferred as ERROR severity (incl. critical)"
            tone={stats.errors > 0 ? 'poor' : 'neutral'}
          />
          <StatChip
            label="Warnings"
            value={stats.warnings.toString()}
            color="var(--color-amber-fg)"
            title="Events inferred as WARNING severity"
            tone={stats.warnings > 0 ? 'warn' : 'neutral'}
          />
          {stats.criticals > 0 && (
            <StatChip
              label="Critical"
              value={stats.criticals.toString()}
              color="#e879f9"
              title="Events inferred as CRITICAL severity"
              tone="critical"
            />
          )}
          <StatChip
            label="Latest"
            value={
              stats.mostRecentTs != null ? fmtAge(stats.mostRecentTs) : '—'
            }
            title="Most recent event time"
            tone="neutral"
          />
          {/* Severity timeline */}
          <div
            className="bg-[var(--bg-page)] border border-[var(--border)] px-2 py-1 rounded-md flex items-center gap-1.5"
            title="Event count per minute (last 30 minutes)"
          >
            <span className="text-[9.5px] text-[var(--text-secondary)] uppercase font-semibold">
              Rate
            </span>
            <div style={{ width: 80 }}>
              <SeverityTimeline data={timeline} />
            </div>
          </div>
          {lastUpdated && (
            <span
              className="text-[9.5px] text-[var(--text-secondary)] mono ml-1 flex items-center gap-1 tabular-nums"
              title={`Last refresh: ${new Date(lastUpdated).toLocaleString()}`}
            >
              <Clock size={10} />
              {fmtAge(lastUpdated / 1000)}
            </span>
          )}
        </div>
      </div>

      {/* Filter Bar — refined with SectionHeader + focus-visible rings */}
      <div className="mb-2">
        <SectionHeader
          icon={Filter}
          title="Filters"
          tone="info"
          description="action type · category · date range · text"
          trailing={
            <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
              {filteredLogs.length} / {logs.length} shown
            </span>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* Text search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search message, details, token, slug…"
              className="h-7 pl-7 pr-7 text-xs bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus-visible:border-blue-500/50 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              aria-label="Search audit events"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] hover:text-white"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
            aria-label="Filter by category"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value as SeverityFilter)
            }
            className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
            aria-label="Filter by severity"
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {/* Date range */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 tabular-nums focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              aria-label="Filter from date"
            />
            <span className="text-[10px] text-[var(--text-secondary)]">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 tabular-nums focus-visible:border-cyan-500/50 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              aria-label="Filter to date"
            />
          </div>
          {/* Clear filters */}
          {(categoryFilter !== 'all' ||
            severityFilter !== 'all' ||
            dateFrom ||
            dateTo ||
            searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] px-2 text-[var(--text-secondary)] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
              onClick={() => {
                setCategoryFilter('all')
                setSeverityFilter('all')
                setDateFrom('')
                setDateTo('')
                setSearchQuery('')
              }}
              title="Clear all filters"
            >
              Clear
            </Button>
          )}
          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            className="h-7 text-[10px] px-2 gap-1 border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
            title="Refresh now"
          >
            <RefreshCw size={11} /> Refresh
          </Button>
          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={exporting || filteredLogs.length === 0}
            className="h-7 text-[10px] px-2 gap-1 border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
            title="Export filtered logs as CSV"
            aria-label="Export CSV"
          >
            <Download size={11} /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportJSON}
            disabled={exporting || filteredLogs.length === 0}
            className="h-7 text-[10px] px-2 gap-1 border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
            title="Export filtered logs as JSON"
            aria-label="Export JSON"
          >
            <FileText size={11} /> JSON
          </Button>
        </div>
      </div>

      {/* W16-6 — Audit Table. The wrapper measures its available height via
          useElementHeight so VirtualTable can size its viewport to fill
          the parent card (no fixed 400px assuming a known panel height).
          The empty state matches the previous empty-state markup so the
          visual is unchanged. W57-d adds a SectionHeader above the
          table so the table reads as part of the same premium redesign
          family. */}
      <div className="flex-1 min-h-[200px] flex flex-col">
        <SectionHeader
          icon={ScrollText}
          title="Audit Trail"
          tone="info"
          description="newest-first · click row for metadata"
          trailing={
            <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
              {filteredLogs.length} of {logs.length} events
            </span>
          }
        />
        <div ref={tableContainerRef} className="flex-1 min-h-[200px] overflow-hidden border border-[var(--border)] rounded">
          {filteredLogs.length === 0 ? (
            <AuditEmptyState hasLogs={logs.length > 0} />
          ) : (
            <VirtualTable
              columns={auditColumns}
              data={filteredLogs}
              height={virtualHeight}
              rowHeight={40}
              onRowClick={(row) => toggleExpand(row.id)}
            />
          )}
        </div>
      </div>

      {/* W16-6 — Expanded event detail panel. Renders below the
          virtualized list when an audit row is selected. Content
          mirrors the previous inline expansion block so existing tests
          that look for `id:` / `strategy:` / `token_id:` labels + the
          metadata <pre aria-label="Audit event metadata JSON"> still
          pass. */}
      {expandedLog && (
        <EventDetailPanel
          log={expandedLog}
          severity={inferSeverity(expandedLog)}
          onClose={() => setExpandedId(null)}
        />
      )}

      {/* Footer */}
      <div className="table-footer">
        <span className="flex items-center gap-1.5">
          <Filter size={10} />
          <span>
            {filteredLogs.length} of {logs.length} events
            {logs.length === LIST_LIMIT && (
              <span className="text-[var(--text-secondary)]"> (cap)</span>
            )}
          </span>
        </span>
        <span className="mono text-[9.5px] flex items-center gap-1">
          <Clock size={10} /> Polling every 15s · auto-pause when tab hidden
        </span>
      </div>
    </div>
  )
}

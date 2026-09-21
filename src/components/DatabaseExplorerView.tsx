// components/DatabaseExplorerView.tsx — Time-Series Data Explorer
//
// W22-2 — Database explorer with table-selector tabs + 5s polling +
//   CSV export + fetch-error banner (previously swallowed silently).
//
// W56-b — Premium visual polish pass, aligned with the W51-2d MLPanel
//   / AIMLCommandCenter / W54-e MLValidationPanel / W55-a LeaderboardPanel
//   redesign family:
//   1. Shimmer skeleton loading state (`TableSkeleton`) mirroring the
//      table column layout so the panel doesn't visually jump when the
//      first fetch resolves. The "Querying table records…" caption is
//      preserved verbatim above the skeleton rows.
//   2. Polished empty state (`PolishedEmptyState`) with a Lucide
//      `Database` icon (28px, dim) + `.empty-state-title` direct text
//      node + `.empty-state-desc` dim description.
//   3. Refined table display — uppercase tracking-wider headers (via
//      the `.data-table` CSS layer) + row-hover accent bar (cyan tint
//      via `hover:bg-cyan-500/[0.04]`) + `tabular-nums` on every
//      numeric cell.
//   4. Section headers (`SectionHeader`) with a Lucide icon + uppercase
//      tracking-wider title + optional dim italic description + optional
//      trailing node (badge / count).
//   5. Refined table selector — schema-explorer sidebar with a Lucide
//      icon per table (BarChart3 / Zap / Newspaper / Brain) replacing
//      the bare emoji tabs, plus an active-state ring + cyan tint.
//   6. Tone-colored row counts (cyan/info when populated / dim/neutral
//      when empty) + a `~N KB` size-estimate badge on the table header
//      so the trader can read the cache footprint at a glance.
//   7. Polished error card (`PolishedErrorCard`) with an `AlertTriangle`
//      icon + the wrapped error string + dim detail + Retry button
//      (calls `fetchRecords`) + Dismiss button.
//   8. Refined query-results display — sticky-header `.data-table` with
//      zebra striping, hover accent bar, `tabular-nums`, scrollable
//      container with the `scrollbar-thin` class.
// All existing functionality, class names, API calls (apiFetch + the
// Authorization header), 5s polling, accessibility roles/labels,
// test-matched strings, and the 'use client' directive preserved.

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Database,
  Download,
  ListOrdered,
  Newspaper,
  RefreshCw,
  Table as TableIcon,
  Timer,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'

type TableName = 'market_snapshots' | 'orderbook_ticks' | 'fundamental_news' | 'ml_feature_store'

const TABLE_DESCRIPTIONS: Record<TableName, string> = {
  market_snapshots: 'Periodic snapshots of top-of-book prices, spreads, and implied probabilities.',
  orderbook_ticks: 'L2 book depth updates and order flow imbalance (OFI) calculations.',
  fundamental_news: 'Fundamental news headlines, sentiment scores, and event tags.',
  ml_feature_store: '38-dimensional feature vectors computed from live microstructure data.',
}

interface TableMeta {
  id: TableName
  label: string
  icon: LucideIcon
}

// W56-b — table metadata with a Lucide icon per table, replacing the
// bare emoji tabs in the table-selector strip. The label is preserved
// verbatim so the existing test contracts (`getByRole('button', { name:
// /Market Snapshots/i })` etc.) still resolve.
const TABLES: TableMeta[] = [
  { id: 'market_snapshots', label: 'Market Snapshots',       icon: BarChart3 },
  { id: 'orderbook_ticks',  label: 'Orderbook Ticks (OFI)',  icon: Zap },
  { id: 'fundamental_news', label: 'Fundamental News',       icon: Newspaper },
  { id: 'ml_feature_store', label: 'ML Feature Store (38D)', icon: Brain },
]

// ── W51-2d Tone system (mirror of MLPanel / LeaderboardPanel) ─────────────

type Tone = 'good' | 'warn' | 'fail' | 'info' | 'neutral'

const TONE: Record<Tone, { text: string }> = {
  good:    { text: 'text-emerald-400' },
  warn:    { text: 'text-amber-400' },
  fail:    { text: 'text-red-400' },
  info:    { text: 'text-cyan-300' },
  neutral: { text: 'text-[#dde1ed]' },
}

// ── Sub-components ─────────────────────────────────────────────────────────

// W54-e / W55-a — ShimmerBlock is a thin skeleton-line-sm placeholder
// that can be sized via the className prop. aria-hidden so screen
// readers don't pick it up.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
}

// W51-2d / W55-a — SectionHeader renders a Lucide icon + uppercase
// tracking-wider 9.5px title + optional dim italic description +
// optional trailing node (badge / count). Mirrors the MLPanel and
// LeaderboardPanel SectionHeader so the explorer reads as part of the
// same premium trading-terminal family.
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
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className={`size-3 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a] shrink-0">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// W56-b — TableSkeleton renders shimmer rows mirroring the data-table
// layout (5 skeleton columns x N rows) so the panel doesn't visually
// jump when the first fetch resolves. Uses the design-system
// `.skeleton-line-sm` class. The "Querying table records..." caption
// is preserved verbatim above the skeleton rows so the W22-2 test
// contract (`getByText(/Querying table records/)`) resolves. The
// skeleton rows themselves are aria-hidden (the caption + role=status
// + aria-live=polite already announce the loading state to screen
// readers).
function TableSkeleton({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div
      className="p-3 space-y-2"
      role="status"
      aria-live="polite"
      aria-label="Querying database table records"
      data-testid="database-loading-skeleton"
    >
      <div className="text-[10.5px] text-[#7e8aaa] flex items-center gap-2 pb-1">
        <span className="spinner" aria-hidden="true" />
        <span>Querying table records…</span>
      </div>
      {/* Skeleton header row mirroring the .data-table column layout */}
      <div
        className="flex items-center gap-3 px-2 py-1.5 border-b border-[#1f2335]"
        aria-hidden="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerBlock key={i} className="w-16 shrink-0" />
        ))}
      </div>
      {/* Skeleton rows */}
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-2 py-1.5 rounded border border-[#1f2335] bg-[#0e1015]"
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, j) => (
            <ShimmerBlock key={j} className="w-16 shrink-0" />
          ))}
        </div>
      ))}
    </div>
  )
}

// W56-b — PolishedEmptyState replaces the bare file-cabinet emoji with
// a Lucide `Database` icon (28px, dim) + `.empty-state-title` direct
// text node + `.empty-state-desc` dim description. role=status
// preserved. The "No records in {selectedTable}" title is preserved
// verbatim so the existing W22-2 test contract (`getByText(/No records
// in market_snapshots/i)`) resolves.
function PolishedEmptyState({ tableName }: { tableName: TableName }) {
  return (
    <div
      className="empty-state py-12"
      role="status"
      data-testid="database-empty-state"
    >
      <Database
        className="empty-state-icon text-[#5a637a] opacity-60"
        size={28}
        aria-hidden="true"
      />
      <div className="empty-state-title">No records in {tableName}</div>
      <div className="empty-state-desc">
        Data is currently buffered in memory or writing to storage. Persisted records will appear here as ticks occur.
      </div>
    </div>
  )
}

// W56-b — PolishedErrorCard replaces the bare `banner-danger` strip
// with a refined error card. Lucide `AlertTriangle` icon + the wrapped
// error string + dim detail + Retry button (calls `fetchRecords`) +
// Dismiss button. The `Retry table fetch` and `Dismiss error`
// aria-labels are preserved verbatim.
interface PolishedErrorCardProps {
  message: string
  detail: string
  onRetry: () => void
  onDismiss: () => void
}

function PolishedErrorCard({ message, detail, onRetry, onDismiss }: PolishedErrorCardProps) {
  return (
    <div
      className="px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 flex items-start gap-2.5"
      role="alert"
      data-testid="database-error-card"
    >
      <AlertTriangle
        className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="text-red-200 font-semibold text-xs leading-snug break-words">
          {message}
        </div>
        <div className="text-red-300/60 text-[10.5px] mt-0.5 leading-snug">
          {detail}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 btn btn-xs font-semibold border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:border-red-500/60 transition-colors"
          aria-label="Retry table fetch"
          data-testid="database-error-retry"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Retry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-red-300/60 hover:text-red-200 hover:bg-red-500/15 transition-colors"
          aria-label="Dismiss error"
          data-testid="database-error-dismiss"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DatabaseExplorerView() {
  const [selectedTable, setSelectedTable] = useState<TableName>('market_snapshots')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // W22-1 — surface fetch failures instead of silently swallowing.
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = async (table: TableName) => {
    setLoading(true)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/database/records?table=${table}&limit=30`)
      if (res.ok) {
        const json = await res.json()
        setRecords(json.records || [])
        setError(null)
      } else {
        setError(`Failed to load ${table} records (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[DatabaseExplorerView] Failed to fetch table records:', e)
      setError(e instanceof Error ? e.message : `Network error loading ${table} records`)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRecords(selectedTable)
    const timer = setInterval(() => fetchRecords(selectedTable), 5000)
    return () => clearInterval(timer)
  }, [selectedTable])

  // W56-b — compute a rough serialized size of the current record set
  // so the trader can tell at a glance whether the in-memory cache is
  // growing or shrinking. Tone-colored: cyan when populated, dim when
  // empty (mirrors the row-count badge tone).
  const recordCount = records.length
  const sizeBytes = recordCount > 0 ? JSON.stringify(records).length : 0
  const sizeLabel =
    sizeBytes >= 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`
  const countTone: Tone = recordCount > 0 ? 'info' : 'neutral'

  return (
    <div className="flex flex-col h-full bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden overflow-y-auto scrollbar-thin">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start gap-3 p-3 border-b border-[#1f2335]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold text-[#dde1ed]">
              Database &amp; Time-Series Explorer
            </span>
          </div>
          <p className="text-xs text-[#7e8aaa] mt-0.5">
            Inspect persisted historical tables, tick depth records, and ML feature stores
          </p>
        </div>
      </div>

      {/* ── Body: schema-explorer sidebar + main panel ─────────────────────── */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* Schema explorer sidebar — replaces the bare emoji tab strip */}
        <aside
          className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-[#1f2335] bg-[#0e1015] p-2 space-y-1"
          aria-label="Database tables"
        >
          <div className="px-1.5 pb-1.5">
            <SectionHeader
              icon={ListOrdered}
              title="Schema"
              description="persisted tables"
              tone="info"
            />
          </div>
          <div className="space-y-1 max-h-64 md:max-h-96 overflow-y-auto scrollbar-thin">
            {TABLES.map((t) => {
              const active = selectedTable === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTable(t.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded border transition-colors ${
                    active
                      ? 'bg-cyan-500/[0.08] border-cyan-500/40 text-[#dde1ed] shadow-[inset_2px_0_0_0_rgba(34,211,238,0.55)]'
                      : 'bg-transparent border-transparent text-[#7e8aaa] hover:bg-cyan-500/[0.04] hover:text-[#dde1ed] hover:border-cyan-500/20'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  aria-pressed={active}
                >
                  <Icon
                    className={`size-3.5 shrink-0 ${active ? 'text-cyan-300' : 'text-[#7e8aaa]'}`}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium truncate">{t.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Main panel — table records */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Section header — Lucide icon + uppercase title + table name
              (mono cyan) + tone-colored record-count badge + size
              estimate + polling-interval badge + CSV export. */}
          <div className="px-3 pt-2.5 pb-2 border-b border-[#1f2335] flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TableIcon className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]">
                    Table
                  </span>
                  <span className="mono text-cyan-400 text-xs font-medium">
                    {selectedTable}
                  </span>
                  <span
                    className={`badge ${recordCount > 0 ? 'badge-blue' : 'badge-dim'} text-[9px] tabular-nums`}
                    data-tone={countTone}
                    title={`${recordCount} record${recordCount === 1 ? '' : 's'} in the current result set`}
                  >
                    ({recordCount} records)
                  </span>
                  {recordCount > 0 && (
                    <span
                      className="badge badge-dim text-[9px] tabular-nums"
                      data-tone="neutral"
                      title="Estimated serialized size of the current record set"
                    >
                      ~{sizeLabel}
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] text-[#7e8aaa] block mt-0.5 leading-snug">
                  {TABLE_DESCRIPTIONS[selectedTable]}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="inline-flex items-center gap-1 text-[10px] text-[#7e8aaa] mono tabular-nums"
                title="Polling interval"
              >
                <Timer className="w-3 h-3" aria-hidden="true" />
                Polled every 5s
              </span>
              <button
                type="button"
                onClick={() => {
                  if (records.length === 0) return
                  const cols = Object.keys(records[0])
                  const rows = records.map((r) =>
                    cols
                      .map((col) => {
                        const v = r[col]
                        return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '')
                      })
                      .join(','),
                  )
                  const csvContent =
                    'data:text/csv;charset=utf-8,' + [cols.join(','), ...rows].join('\n')
                  const encodedUri = encodeURI(csvContent)
                  const link = document.createElement('a')
                  link.setAttribute('href', encodedUri)
                  link.setAttribute('download', `${selectedTable}_${Date.now()}.csv`)
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                }}
                disabled={records.length === 0}
                className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[#1f2335] text-[#7e8aaa] hover:text-white hover:border-cyan-500/30 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Export ${selectedTable} CSV`}
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                CSV
              </button>
            </div>
          </div>

          {/* W22-1 / W56-b — fetch-error card (previously a banner-danger
              strip). PolishedErrorCard surfaces the wrapped error
              string + dim detail + Retry (calls fetchRecords) + Dismiss
              (clears the local error state). */}
          {error && (
            <div className="p-3">
              <PolishedErrorCard
                message={error}
                detail="Database API couldn't be reached or returned an error. Check connectivity and retry."
                onRetry={() => fetchRecords(selectedTable)}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {/* ── Loading / empty / loaded states ─────────────────────────── */}
          {loading && records.length === 0 ? (
            <TableSkeleton rowCount={5} />
          ) : records.length === 0 ? (
            <PolishedEmptyState tableName={selectedTable} />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin table-container">
              <table
                className="data-table text-xs"
                role="table"
                aria-label={`Database table ${selectedTable}`}
              >
                <thead>
                  <tr>
                    {Object.keys(records[0] || {}).map((col) => (
                      <th
                        key={col}
                        scope="col"
                        className="mono capitalize tabular-nums"
                      >
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr
                      key={i}
                      className="hover:bg-cyan-500/[0.04] transition-colors"
                    >
                      {Object.entries(r).map(([k, val]: [string, any], j) => (
                        <td
                          key={j}
                          className="mono text-xs max-w-[200px] truncate tabular-nums"
                          title={`${k.replace(/_/g, ' ')}: ${
                            typeof val === 'number' ? val : String(val ?? '')
                          }`}
                        >
                          {typeof val === 'number'
                            ? val.toFixed(k.includes('time') ? 0 : 4)
                            : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

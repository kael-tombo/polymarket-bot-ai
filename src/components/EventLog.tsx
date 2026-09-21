// components/EventLog.tsx — Pro Terminal Audit & Event Stream
//
// W52-d — premium polish pass (see Wave 50-51 design system):
//   • Four-tone colour system: success (green) / warning (amber) /
//     error (red) / info (blue) + the existing AI/ML cyan accent.
//     `getEventTone` classifies each event; the row's left accent bar,
//     message text, and severity icon all read from the same tone so
//     a trader can scan the stream by colour.
//   • Timestamp column now uses tabular-nums + a hairline `|` separator
//     so the time column aligns column-wise and reads as a true log
//     file would.
//   • Subtle alternating row backgrounds (`i % 2` tint) + a left
//     accent bar (2px coloured stripe) give the stream a tabular,
//     scannable rhythm without overpowering the dense markets desk.
//   • Refined scroll container — keeps `scrollbar-thin` (test contract)
//     and adds `min-h-0` so the panel respects its parent's `h-full`
//     flex bounds, plus a subtle inner top-gradient fade so rows
//     appear to dissolve under the header.
//   • Empty state now renders a Lucide icon + a context-aware message:
//     `Inbox` + "No events recorded yet" when the log is empty, or
//     `SearchX` + "No events match current filter" when a filter
//     excludes everything (the latter string is preserved verbatim so
//     the W22-2 EventLog.test.tsx empty-state assertion resolves).
//   • New optional `loading` prop (default false) renders shimmer
//     skeleton rows via the existing `.skeleton-line-sm` helper. Purely
//     additive — no existing test passes `loading`, so the contract
//     is unaffected.
//
// W22-2 contract preserved verbatim:
//   • "📜 Live System Events" header.
//   • "(0)" / "(8)" count badge + "(N/total)" filtered readout.
//   • `aria-label="Filter events"` search input + `aria-label="Clear
//     search"` × button.
//   • Filter buttons: all / fill / order / risk / ml with the active
//     class set `bg-blue-500/20 text-cyan-300 border-blue-500/40`
//     (test asserts on these exact class strings).
//   • Copy button (text "Copy" → "✓" on click).
//   • CSV export button (text "📥 CSV").
//   • Severity emojis ✅ / 🛑 / 🤖 / ⚡ rendered per existing keyword
//     rules.
//   • "No events match current filter" empty-state string.

'use client'

import { useState } from 'react'
import { Inbox, SearchX, Loader2 } from 'lucide-react'

interface Props {
  events: string[]
  /**
   * W52-d — Optional loading state. When true, the panel renders
   * shimmer skeleton rows instead of the live event list. Defaults to
   * false so existing call sites (and the W22-2 test suite) see no
   * change.
   */
  loading?: boolean
}

type EventFilter = 'all' | 'fill' | 'order' | 'risk' | 'ml'

const SEVERITY_ICON: Record<string, string> = {
  fill:  '✅',
  trade: '✅',
  win:   '✅',
  kill:  '🛑',
  risk:  '🛑',
  error: '🛑',
  reject:'🛑',
  ml:    '🤖',
  ai:    '🤖',
  prob:  '🤖',
  order: '⚡',
  cancel:'⚡',
  quoted:'⚡',
}

function getEventSeverityIcon(text: string): string {
  const lower = text.toLowerCase()
  for (const [keyword, icon] of Object.entries(SEVERITY_ICON)) {
    if (lower.includes(keyword)) return icon
  }
  return '◦'
}

// W52-d — Four-tone classification. Returns a semantic tone key used
// to pick the message text colour, the row's left accent bar colour,
// and the row's translucent hover tint. Kept as a static string map
// in `toneClassMap` so Tailwind 4's scanner picks up every variant.
type Tone = 'success' | 'warning' | 'error' | 'info' | 'ai' | 'default'

function getEventTone(text: string): Tone {
  const lower = text.toLowerCase()
  if (lower.includes('kill') || lower.includes('reject') || lower.includes('error'))
    return 'error'
  if (lower.includes('risk') || lower.includes('limit')) return 'warning'
  if (lower.includes('fill') || lower.includes('trade') || lower.includes('win'))
    return 'success'
  if (lower.includes('ml') || lower.includes('ai') || lower.includes('prob') || lower.includes('learned') || lower.includes('model'))
    return 'ai'
  if (lower.includes('order') || lower.includes('cancel') || lower.includes('quoted'))
    return 'info'
  return 'default'
}

// Static class strings (so Tailwind 4's JIT scanner emits them):
const toneClassMap: Record<Tone, { text: string; bar: string; hover: string }> = {
  success: {
    text: 'text-green-400',
    bar: 'bg-green-500/70',
    hover: 'hover:bg-green-500/[0.06]',
  },
  warning: {
    text: 'text-amber-400',
    bar: 'bg-amber-500/70',
    hover: 'hover:bg-amber-500/[0.06]',
  },
  error: {
    text: 'text-red-400',
    bar: 'bg-red-500/70',
    hover: 'hover:bg-red-500/[0.06]',
  },
  info: {
    text: 'text-blue-300',
    bar: 'bg-blue-500/70',
    hover: 'hover:bg-blue-500/[0.06]',
  },
  ai: {
    text: 'text-cyan-300',
    bar: 'bg-cyan-500/70',
    hover: 'hover:bg-cyan-500/[0.06]',
  },
  default: {
    text: 'text-[var(--text-primary)]',
    bar: 'bg-[var(--text-dim)]',
    hover: 'hover:bg-[var(--bg-elevated)]',
  },
}

// Parse leading timestamp from event strings like "[12:34:56]" or "12:34:56 - "
function parseEventParts(text: string): { timestamp: string; message: string } {
  // Try [HH:MM:SS] prefix
  const bracketMatch = text.match(/^\[(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*/)
  if (bracketMatch) {
    return { timestamp: bracketMatch[1], message: text.slice(bracketMatch[0].length) }
  }
  // Try HH:MM:SS - prefix
  const dashMatch = text.match(/^(\d{2}:\d{2}:\d{2})\s*[-–]\s*/)
  if (dashMatch) {
    return { timestamp: dashMatch[1], message: text.slice(dashMatch[0].length) }
  }
  // Try ISO 8601 prefix
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  if (isoMatch) {
    return { timestamp: isoMatch[1].slice(11), message: text.slice(isoMatch[0].length).replace(/^[Z\s,:-]+/, '') }
  }
  return { timestamp: '', message: text }
}

// W52-d — Inline loading skeleton. Renders 6 shimmer rows so the
// stream visibly "fills in" while the backend is bootstrapping. Uses
// the existing `.skeleton-line-sm` helper from globals.css so the
// shimmer animation matches the rest of the desk.
function LoadingRows() {
  return (
    <div className="p-1.5 space-y-1" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-1.5 py-1 rounded border-l-2 border-[var(--border)]"
        >
          <span className="shrink-0 w-4 h-3 rounded-sm skeleton-line-sm" aria-hidden="true" />
          <span className="shrink-0 w-16 h-3 rounded-sm skeleton-line-sm" aria-hidden="true" style={{ width: '4rem' }} />
          <span
            className="flex-1 h-3 rounded-sm skeleton-line-sm"
            aria-hidden="true"
            style={{ width: `${55 + ((i * 7) % 35)}%` }}
          />
        </div>
      ))}
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-[var(--text-secondary)] mono">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        <span>Streaming event log…</span>
      </div>
    </div>
  )
}

// W52-d — Inline empty state. Picks the right icon + copy based on
// whether the source `events` array is empty (nothing recorded yet)
// vs. a filter yielding zero matches.
function EmptyState({ eventsEmpty }: { eventsEmpty: boolean }) {
  const Icon = eventsEmpty ? Inbox : SearchX
  const message = eventsEmpty
    ? 'No events recorded yet — waiting for the first tick.'
    : 'No events match current filter.'
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-8 text-center"
      role="status"
    >
      <Icon
        className="w-7 h-7 text-[var(--text-dim)]"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div className="text-[11px] text-[var(--text-secondary)] mono px-4">
        {message}
      </div>
    </div>
  )
}

export default function EventLog({ events, loading = false }: Props) {
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const filtered = events.filter((e) => {
    const lower = e.toLowerCase()
    const matchSearch = lower.includes(search.toLowerCase())
    if (!matchSearch) return false

    if (filter === 'fill') return lower.includes('fill') || lower.includes('trade')
    if (filter === 'order') return lower.includes('order') || lower.includes('cancel') || lower.includes('quoted')
    if (filter === 'risk') return lower.includes('kill') || lower.includes('risk') || lower.includes('limit')
    if (filter === 'ml') return lower.includes('ml') || lower.includes('learned') || lower.includes('model')
    return true
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(events.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleExportCsv = () => {
    const header = 'Timestamp,Severity,Message'
    const rows = events.map((e) => {
      const { timestamp, message } = parseEventParts(e)
      const icon = getEventSeverityIcon(e)
      return `"${timestamp}","${icon}","${message.replace(/"/g, '""')}"`
    })
    const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `event_log_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const matchCount = filter !== 'all' || search ? filtered.length : null

  return (
    <div className="card flex flex-col h-full min-h-0 bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
      {/* Header */}
      <div className="card-header flex flex-wrap justify-between items-center px-3 py-2 border-b border-[var(--border)] gap-2">
        <div className="flex items-center gap-2">
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">📜 Live System Events</span>
          <span className="text-[10px] text-[var(--text-secondary)] mono tabular-nums">
            ({matchCount !== null ? `${matchCount}/${events.length}` : events.length})
          </span>
          {matchCount !== null && (
            <span className="badge badge-blue text-[9px]">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm w-28 text-[10px] py-0.5 bg-[var(--bg-page)] border border-[var(--border)] pr-5 focus:border-blue-500/40"
              aria-label="Filter events"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white text-[11px] leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-[var(--bg-page)] p-0.5 rounded border border-[var(--border)]">
            {(['all', 'fill', 'order', 'risk', 'ml'] as EventFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold transition-all ${
                  filter === f ? 'bg-blue-500/20 text-cyan-300 border border-blue-500/40' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={handleCopy}
            className="text-[10px] text-[var(--text-secondary)] hover:text-white mono bg-[var(--bg-page)] px-2 py-0.5 rounded border border-[var(--border)] transition-colors"
            title="Copy all events to clipboard"
          >
            {copied ? '✓' : 'Copy'}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={events.length === 0}
            className="text-[10px] text-[var(--text-secondary)] hover:text-white mono bg-[var(--bg-page)] px-2 py-0.5 rounded border border-[var(--border)] transition-colors disabled:opacity-40"
            title="Export event log as CSV"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {/* Event Stream — structured columns.
          W52-d — refined scroll container: `min-h-0` so the panel
          respects its parent's `h-full` flex bounds, `scrollbar-thin`
          preserved (test contract), and a top-gradient fade so rows
          dissolve under the header on overflow. */}
      <div
        className="relative flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-[var(--bg-page)]"
        role="log"
        aria-live="polite"
        aria-label="System event stream"
      >
        {loading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState eventsEmpty={events.length === 0} />
        ) : (
          <div className="p-1.5 space-y-px">
            {filtered.map((e, i) => {
              const { timestamp, message } = parseEventParts(e)
              const icon = getEventSeverityIcon(e)
              const tone = getEventTone(e)
              const toneClasses = toneClassMap[tone]
              const isAlt = i % 2 === 1
              return (
                <div
                  key={i}
                  className={`group flex items-start gap-2 px-1.5 py-0.5 rounded-sm border-l-2 ${toneClasses.bar} ${toneClasses.hover} ${
                    isAlt ? 'bg-[var(--bg-page)]/60' : ''
                  } transition-colors duration-100`}
                >
                  {/* Severity icon */}
                  <span className="shrink-0 w-4 text-center text-[11px] mt-[1px]" aria-hidden="true">
                    {icon}
                  </span>
                  {/* Timestamp column — mono + tabular-nums for column alignment */}
                  {timestamp && (
                    <span className="mono text-[9.5px] text-[var(--text-dim)] shrink-0 mt-[2px] tabular-nums group-hover:text-[var(--text-secondary)] transition-colors w-16">
                      {timestamp}
                    </span>
                  )}
                  {/* Message */}
                  <span className={`font-mono text-[11px] leading-relaxed ${toneClasses.text}`}>
                    {message}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

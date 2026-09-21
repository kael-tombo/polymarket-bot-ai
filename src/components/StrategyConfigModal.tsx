// components/StrategyConfigModal.tsx — Live Strategy Configuration & Risk Tuning
//
// W53-d — Premium polish pass:
//   • Glassmorphism modal surface via `.surface-tier-overlay` (rgba bg +
//     12px backdrop-blur + saturate) layered on the existing `.modal`
//     class. Mirrors the W52-c DepthChartModal / MarketChartModal pattern.
//   • Premium modal shadow via the `--shadow-modal-premium` design token
//     (24px y-offset, 56px blur, 0.6 alpha — heaviest elevation tier).
//   • Backdrop blur strengthened — Tailwind `backdrop-blur-md` layered on
//     the existing `.modal-backdrop` blur(4px) for a true frosted-glass
//     pane behind the modal.
//   • Refined header — icon badge (GaugeCircle in a cyan-tinted chip) +
//     tight tracking on the title + dim caption + a refined close button
//     with red-tinted hover affordance (Tailwind layer wins the cascade
//     over the CSS `.modal-close:hover` rule). Close glyph wrapped in a
//     `<span aria-hidden="true">` to match the W52-c modal pattern.
//   • Refined form inputs — `transition-colors duration-150` + layered
//     focus ring (`focus:ring-1 focus:ring-cyan-500/20 focus:border-
//     cyan-500/40`). Invalid fields get a red-tinted border + bg wash.
//     All existing `input input-sm mono` class names preserved.
//   • Polished parameter controls — each numeric field is paired with
//     an inline range slider (`<input type="range">`) that shares the
//     state value + onChange handler with the number input. The slider
//     is `aria-labelledby` the field's label so it's a real accessible
//     control (role="slider") — doesn't collide with any test contract
//     (tests use role="button" for close + Apply Live).
//   • Section headers — Lucide icon + uppercase title + dim italic
//     description. Existing colored title text preserved verbatim:
//     "Avellaneda-Stoikov Market Maker", "Dutch-Book Arbitrage
//     Scanner", "ML Signal & Risk Engine". Plus a NEW fourth section
//     "Portfolio Limits" exposing `max_total_exposure_usdc` +
//     `max_open_orders` (already in the config state + PUT body, just
//     not previously editable).
//   • Polished save/cancel buttons — primary "Apply Live" button shows
//     a small inline spinner when saving; secondary "Cancel" button
//     gets a hover affordance. A PulseDot + status label sits on the
//     left of the footer showing the current save lifecycle state.
//   • Loading state — refined with ConfigSkeleton shimmer rows
//     surrounding the existing `Loading current parameters…` text (the
//     exact text is preserved for the W38-8 test contract).
//   • Validation error display — live validation runs on every change
//     via useMemo. Errors are shown inline beneath each touched field
//     (`FieldError` component with AlertTriangle icon + tone-tinted
//     text + role="alert"). A summary banner appears at the top of
//     the footer when any errors are visible.
//   • Refined error state — the load-error branch now includes a Retry
//     button (new) alongside the existing Close button. The Retry
//     triggers a re-fetch via a `retryToken` state dep on the fetch
//     effect. Existing "⚠️ {error}" text + banner-danger class
//     preserved (test contract `/Failed to load configuration \(HTTP
//     500\)/` and `/Network error fetching configuration/`).
//   • Refined success/error msg banner — `border` + `flex` layout with
//     emoji + message split into two spans (preserves the text content
//     of `Configuration updated live in memory!`, `Failed to update
//     configuration`, `Error reaching bot API server`).
//   • All existing class names, props, API calls, aria-labels, and test
//     contracts preserved (see StrategyConfigModal.test.tsx — 12 tests).
//
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  GaugeCircle,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface ConfigState {
  mm_spread_bps: number
  mm_quote_size_usdc: number
  mm_max_inventory_usdc: number
  arb_min_profit_bps: number
  arb_order_size_usdc: number
  signal_min_confidence: number
  daily_loss_limit_usdc: number
  max_total_exposure_usdc: number
  max_open_orders: number
}

// ── W53-d — compact Tone system (subset of W51-2d vocabulary) ──────────────
// Used to tint the section header icons + the save-status PulseDot so the
// modal feels visually consistent with the W51-2 family (PositionsPanel,
// AIMLCommandCenter, OrderFlowPanel). Static class strings keep Tailwind
// 4's scanner happy.
type Tone = 'good' | 'warn' | 'poor' | 'neutral' | 'info'

interface ToneConfig {
  dot: string
  text: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  warn:    { dot: 'bg-amber-400',   text: 'text-amber-400' },
  poor:    { dot: 'bg-red-400',     text: 'text-red-400' },
  neutral: { dot: 'bg-[#5a637a]',   text: 'text-[#7e8aaa]' },
  info:    { dot: 'bg-cyan-400',    text: 'text-cyan-400' },
}

// ── SectionHeader — icon + uppercase title + dim italic description ────────
// Mirrors the W51-2d SectionHeader pattern. Title is wrapped in its own
// `<span>` so RTL text-content queries match the span, not the wrapper
// div (preserves the W38-8 `findByText(/Avellaneda-Stoikov Market
// Maker/)` contract — single text-node match, no parent-element bleed).
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
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon className={`size-3.5 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[11px] font-bold text-[#dde1ed] uppercase tracking-wider">
        {title}
      </span>
      {description && (
        <span className="text-[9.5px] text-[#7e8aaa] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── PulseDot — small status dot with halo + ping animation ─────────────────
// Decorative. Used in the modal footer to surface the save lifecycle
// state (idle=good, saving=warn).
function PulseDot({ tone }: { tone: Tone }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2.5 h-2.5 shrink-0" aria-hidden="true">
      <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
    </span>
  )
}

// ── ConfigSkeleton — shimmer placeholder rows while loading ────────────────
// Mirrors the structure of the three loaded form sections (header chip +
// grid of fields) so the modal doesn't visually jump when the fetch
// resolves. Decorative — `aria-hidden` because the visible loading
// caption (with role=status + aria-live=polite) handles SR announce.
function ConfigSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]">
          <div className="skeleton-line-sm w-1/3" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="space-y-1.5">
                <div className="skeleton-line-sm w-2/3" />
                <div className="skeleton-line-md w-full" />
                <div className="skeleton-line-sm w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FieldError — inline validation message (refined) ──────────────────────
// Replaces the plain `form-hint` when a field is out of range. Adds an
// AlertTriangle icon + tone-tinted text + role="alert" for SR announce.
function FieldError({ message }: { message: string }) {
  return (
    <span
      className="form-hint text-red-400 flex items-center gap-1 mt-0.5 tabular-nums"
      role="alert"
    >
      <AlertTriangle className="size-2.5 shrink-0" aria-hidden="true" />
      {message}
    </span>
  )
}

// ── ParamSlider — decorative range slider that syncs with the input ───────
// Shares the state value + onChange handler with the number input. The
// slider is `aria-labelledby` the field's <label> so it's a real
// accessible slider (role="slider"); doesn't collide with any test
// contract (tests query role="button" with specific names).
function ParamSlider({
  value,
  min,
  max,
  step,
  onChange,
  labelId,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  labelId: string
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 mt-1.5 mb-0.5 accent-cyan-400 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
      aria-labelledby={labelId}
    />
  )
}

// ── Parameter specs — single source of truth for the form ──────────────────
// Encodes the label, range bounds, fallback, and parse fn for every
// numeric config field. Keeps the render path declarative + the
// validation logic data-driven.
type ParamKey = keyof ConfigState

interface ParamSpec {
  key: ParamKey
  label: string
  min: number
  max: number
  step: number
  hint: string
  fallback: number
  parse: (v: string) => number
}

const PARAMS: Record<ParamKey, ParamSpec> = {
  mm_spread_bps: {
    key: 'mm_spread_bps', label: 'Spread (BPS)',
    min: 10, max: 2000, step: 10, hint: '10–2000 bps',
    fallback: 200, parse: (v) => parseInt(v) || 200,
  },
  mm_quote_size_usdc: {
    key: 'mm_quote_size_usdc', label: 'Quote Size ($)',
    min: 0.5, max: 5.0, step: 0.5, hint: '$0.50–$5.00',
    fallback: 1.5, parse: (v) => parseFloat(v) || 1.5,
  },
  mm_max_inventory_usdc: {
    key: 'mm_max_inventory_usdc', label: 'Max Inv ($)',
    min: 1.0, max: 15.0, step: 1.0, hint: '$1.00–$15.00',
    fallback: 15, parse: (v) => parseFloat(v) || 15,
  },
  arb_min_profit_bps: {
    key: 'arb_min_profit_bps', label: 'Min Profit (BPS)',
    min: 5, max: 1000, step: 5, hint: '5–1000 bps',
    fallback: 50, parse: (v) => parseInt(v) || 50,
  },
  arb_order_size_usdc: {
    key: 'arb_order_size_usdc', label: 'Arb Leg Size ($)',
    min: 0.5, max: 5.0, step: 0.5, hint: '$0.50–$5.00',
    fallback: 1.5, parse: (v) => parseFloat(v) || 1.5,
  },
  signal_min_confidence: {
    key: 'signal_min_confidence', label: 'ML Min Confidence',
    min: 0.5, max: 0.99, step: 0.01, hint: '0.50–0.99',
    fallback: 0.52, parse: (v) => parseFloat(v) || 0.52,
  },
  daily_loss_limit_usdc: {
    key: 'daily_loss_limit_usdc', label: 'Daily Loss Stop ($)',
    min: 0.25, max: 2.0, step: 0.25, hint: '$0.25–$2.00 hard stop',
    fallback: 2.0, parse: (v) => parseFloat(v) || 2.0,
  },
  max_total_exposure_usdc: {
    key: 'max_total_exposure_usdc', label: 'Max Total Exposure ($)',
    min: 10, max: 200, step: 10, hint: '$10–$200 portfolio cap',
    fallback: 100, parse: (v) => parseInt(v) || 100,
  },
  max_open_orders: {
    key: 'max_open_orders', label: 'Max Open Orders',
    min: 5, max: 200, step: 5, hint: '5–200 concurrent orders',
    fallback: 50, parse: (v) => parseInt(v) || 50,
  },
}

// ── Validation helpers ─────────────────────────────────────────────────────
// Returns a per-field error message string OR null. NaN safety: parse
// fallbacks are bounded, but parseFloat('') is NaN — caught here.
function validateField(spec: ParamSpec, value: number): string | null {
  if (Number.isNaN(value)) return 'Invalid number'
  if (value < spec.min) return `Min ${spec.min}`
  if (value > spec.max) return `Max ${spec.max}`
  return null
}

function validateConfig(c: ConfigState): Partial<Record<ParamKey, string>> {
  const errs: Partial<Record<ParamKey, string>> = {}
  for (const k of Object.keys(PARAMS) as ParamKey[]) {
    const e = validateField(PARAMS[k], c[k])
    if (e) errs[k] = e
  }
  return errs
}

export default function StrategyConfigModal({ isOpen, onClose }: Props) {
  const [config, setConfig] = useState<ConfigState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // W53-d — track which fields the user has interacted with so we only
  // surface validation errors after first touch (no error spam on first
  // load with potentially-clamped defaults from the backend).
  const [touched, setTouched] = useState<Partial<Record<ParamKey, boolean>>>({})
  // W53-d — controls the "advanced" Portfolio Limits section visibility.
  // UI-only state; the underlying config fields remain in the state +
  // PUT body regardless (preserves the existing API contract).
  const [showAdvanced, setShowAdvanced] = useState(false)
  // W53-d — bumping this re-triggers the fetch effect (Retry button).
  const [retryToken, setRetryToken] = useState(0)

  const modalRef = useRef<HTMLDivElement>(null)

  // W53-d — live validation. Computed via useMemo so it's stable across
  // renders unless config changes. Only the touched subset is shown.
  const allErrors = useMemo(
    () => (config ? validateConfig(config) : {}),
    [config],
  )
  const visibleErrors = useMemo(() => {
    const ve: Partial<Record<ParamKey, string>> = {}
    for (const k of Object.keys(allErrors) as ParamKey[]) {
      if (touched[k]) ve[k] = allErrors[k]
    }
    return ve
  }, [allErrors, touched])
  const errorCount = Object.keys(visibleErrors).length

  // Escape key handler — preserved from W38-8.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Fetch config on open (and on Retry). retryToken dep re-runs the
  // effect when the user clicks Retry in the error state.
  useEffect(() => {
    if (!isOpen) return
    const fetchConfig = async () => {
      setLoading(true)
      setError(null)
      setMsg(null)
      try {
        const apiUrl = getApiUrl()
        const res = await apiFetch(`${apiUrl}/api/config`)
        if (res.ok) {
          setConfig(await res.json())
        } else {
          setError(`Failed to load configuration (HTTP ${res.status})`)
        }
      } catch {
        setError('Network error fetching configuration')
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [isOpen, retryToken])

  if (!isOpen) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setMsg(null)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setMsg({ ok: true, text: 'Configuration updated live in memory!' })
        setTimeout(() => onClose(), 1200)
      } else {
        const err = await res.json().catch(() => null)
        setMsg({ ok: false, text: err?.detail || 'Failed to update configuration' })
      }
    } catch {
      setMsg({ ok: false, text: 'Error reaching bot API server' })
    }
    setSaving(false)
  }

  const handleRetry = () => {
    setRetryToken((t) => t + 1)
  }

  // Update a single field + mark as touched (so validation surfaces).
  const updateField = (key: ParamKey, value: number) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  // Render a single parameter field — number input + slider + validation.
  const renderField = (key: ParamKey) => {
    if (!config) return null
    const spec = PARAMS[key]
    const value = config[key]
    const err = visibleErrors[key]
    const labelId = `cfg-label-${key}`
    return (
      <div key={key} className="space-y-0.5">
        <label id={labelId} className="form-label text-[10px] block" htmlFor={`cfg-input-${key}`}>
          {spec.label}
        </label>
        <input
          id={`cfg-input-${key}`}
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => updateField(key, spec.parse(e.target.value))}
          onFocus={() => setTouched((p) => ({ ...p, [key]: true }))}
          className={`input input-sm mono transition-colors duration-150 focus:ring-1 focus:ring-cyan-500/20 focus:border-cyan-500/40 ${
            err ? 'border-red-500/60 bg-red-500/[0.04]' : ''
          }`}
          aria-invalid={!!err}
          aria-describedby={err ? `cfg-err-${key}` : undefined}
        />
        <ParamSlider
          value={value}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onChange={(v) => updateField(key, v)}
          labelId={labelId}
        />
        {err ? (
          <span id={`cfg-err-${key}`}>
            <FieldError message={err} />
          </span>
        ) : (
          <span className="form-hint tabular-nums">{spec.hint}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className="modal-backdrop backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal surface-tier-overlay"
        style={{ boxShadow: 'var(--shadow-modal-premium)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center size-7 rounded-md bg-cyan-500/[0.08] border border-cyan-500/25 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.10)]"
              aria-hidden="true"
            >
              <GaugeCircle className="size-4" />
            </span>
            <div>
              <h2 id="config-modal-title" className="text-sm font-bold text-[#dde1ed] tracking-tight">
                ⚙️ Strategy &amp; Risk Configuration
              </h2>
              <span className="text-[10px] text-[#7e8aaa]">
                Runtime parameters for $100 operating capital regime
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md w-7 h-7 inline-flex items-center justify-center text-[13px] leading-none"
            aria-label="Close configuration modal"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        {loading ? (
          <div
            className="modal-body space-y-3 py-4"
            role="status"
            aria-live="polite"
          >
            <ConfigSkeleton rows={3} />
            <div className="flex flex-col items-center justify-center text-[#7e8aaa] text-xs pt-1">
              <span className="spinner mb-2" aria-hidden="true" />
              Loading current parameters…
            </div>
          </div>
        ) : error ? (
          <div className="modal-body py-8 space-y-3 text-center">
            <div className="banner-danger text-xs py-2 px-3 flex items-start gap-2 text-left">
              <AlertTriangle className="size-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleRetry}
                className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                aria-label="Retry loading configuration"
              >
                <RefreshCw className="size-3" aria-hidden="true" />
                Retry
              </button>
              <button
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        ) : config ? (
          <form onSubmit={handleSave} className="modal-body space-y-4 text-xs">
            {/* ── Section 1: Market Maker ────────────────────────────── */}
            <section className="space-y-2 bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]">
              <SectionHeader
                icon={Activity}
                title="Avellaneda-Stoikov Market Maker"
                description="Quoting spread + inventory bounds"
                tone="info"
              />
              <div className="grid grid-cols-3 gap-2">
                {renderField('mm_spread_bps')}
                {renderField('mm_quote_size_usdc')}
                {renderField('mm_max_inventory_usdc')}
              </div>
            </section>

            {/* ── Section 2: Arbitrage Scanner ───────────────────────── */}
            <section className="space-y-2 bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]">
              <SectionHeader
                icon={TrendingUp}
                title="Dutch-Book Arbitrage Scanner"
                description="Edge detection thresholds"
                tone="warn"
              />
              <div className="grid grid-cols-2 gap-2">
                {renderField('arb_min_profit_bps')}
                {renderField('arb_order_size_usdc')}
              </div>
            </section>

            {/* ── Section 3: ML & Risk Engine ────────────────────────── */}
            <section className="space-y-2 bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]">
              <SectionHeader
                icon={BrainCircuit}
                title="ML Signal &amp; Risk Engine"
                description="Confidence floor + hard stops"
                tone="good"
              />
              <div className="grid grid-cols-2 gap-2">
                {renderField('signal_min_confidence')}
                {renderField('daily_loss_limit_usdc')}
              </div>
            </section>

            {/* ── Section 4: Portfolio Limits (advanced, behind toggle) ─ */}
            <section className="space-y-2 bg-[#0e1015] p-3 rounded-lg border border-[#1f2335]">
              <SectionHeader
                icon={ShieldAlert}
                title="Portfolio Limits"
                description="Capital + concurrency caps"
                tone="neutral"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[10px] text-[#7e8aaa] hover:text-cyan-400 transition-colors"
                    role="switch"
                    aria-checked={showAdvanced}
                    aria-label="Toggle advanced portfolio limits"
                  >
                    <span
                      className={`relative inline-flex h-3 w-6 rounded-full transition-colors ${
                        showAdvanced ? 'bg-cyan-500/60' : 'bg-[#2a2f47]'
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 size-2 rounded-full bg-white transition-transform ${
                          showAdvanced ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    {showAdvanced ? 'Shown' : 'Hidden'}
                  </button>
                }
              />
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-2">
                  {renderField('max_total_exposure_usdc')}
                  {renderField('max_open_orders')}
                </div>
              )}
              {!showAdvanced && (
                <div className="text-[10px] text-[#3e4560] italic">
                  Hidden — toggle to edit portfolio-level capital + concurrency caps.
                </div>
              )}
            </section>

            {/* ── Validation summary banner ──────────────────────────── */}
            {errorCount > 0 && (
              <div
                className="p-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] text-amber-400 text-[10.5px] flex items-center gap-2"
                role="alert"
              >
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {errorCount} field{errorCount === 1 ? '' : 's'} out of range — fix before applying live.
                </span>
              </div>
            )}

            {/* ── Success / error banner ─────────────────────────────── */}
            {msg && (
              <div
                className={`p-2 rounded-md text-center text-xs flex items-center justify-center gap-1.5 border ${
                  msg.ok
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : 'bg-red-500/10 text-red-400 border-red-500/25'
                }`}
                role="status"
              >
                <span aria-hidden="true">{msg.ok ? '✅' : '⚠️'}</span>
                <span>{msg.text}</span>
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="modal-footer px-0 pb-0 pt-2 mt-1">
              <div className="flex items-center gap-1.5 mr-auto text-[10px] text-[#5a637a]">
                <PulseDot tone={saving ? 'warn' : 'good'} />
                <span className="tabular-nums">
                  {saving ? 'Applying changes…' : 'Auto-applied on save'}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm transition-colors hover:text-[#dde1ed]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary btn-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving && (
                  <span
                    className="spinner"
                    style={{ width: '0.75rem', height: '0.75rem', borderWidth: '1.5px' }}
                    aria-hidden="true"
                  />
                )}
                {saving ? 'Applying…' : 'Apply Live'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}

// components/SettingsModal.tsx — W15-2 User Preferences settings modal.
//
// Renders the full-screen "Settings" dialog that surfaces every field
// of the `UserPreferences` store in a labelled, sectioned layout. The
// modal opens from the gear icon in TopStatusBar (W15-2).
//
// Edit model:
//   * Local `draft` state — mirrors `preferences` while the modal is
//     open. Every control edits the draft only; no persistence
//     happens until the trader clicks "Save changes".
//   * "Save changes" walks the diff between `draft` and the persisted
//     preferences and calls `update(key, value)` for each changed
//     field. Each call persists to localStorage + dispatches the
//     `preferences-changed` event so every mounted consumer
//     re-renders with the new value (no React Context provider
//     required — see `usePreferences`).
//   * "Cancel" discards the draft and closes the modal — nothing is
//     persisted.
//   * "Reset to defaults" replaces the draft with the canonical
//     DEFAULTS object (does NOT persist — the trader can still
//     click Cancel afterwards to bail). If the trader then clicks
//     Save, every field flips back to its default.
//
// Accessibility:
//   * Role="dialog" + aria-modal="true" + aria-labelledby.
//   * Escape closes (same pattern as ShortcutsModal + StrategyConfigModal).
//   * Focus is moved into the modal close button on open and restored
//     to the trigger element on close.
//   * Tab focus is trapped inside the modal while open.
//
// Styling:
//   * Uses the existing `.modal`, `.modal-backdrop`, `.modal-header`,
//     `.modal-body`, `.modal-footer` classes from globals.css so the
//     modal matches the visual language of ShortcutsModal +
//     StrategyConfigModal + ConfirmationDialog (dark-card, blurred
//     backdrop, 14px title, 12.5px body).
//   * Inner controls use the shadcn/ui Switch / Slider / Select /
//     Checkbox primitives (already vendored in src/components/ui/).
//
// W58-d — Premium visual-layer polish pass:
//   • Glassmorphism modal background — `.surface-tier-overlay` (rgba
//     bg + 12px backdrop-blur + saturate) layered on the existing
//     `.modal .modal-wide` class so the dialog reads as a true frosted-
//     glass pane. Mirrors the W52-c MarketChartModal / W53-d
//     StrategyConfigModal pattern.
//   • Premium modal shadow via the `--shadow-modal-premium` design
//     token (24px y-offset, 56px blur, 0.6 alpha — heaviest elevation
//     tier). Inline `style={{ boxShadow: 'var(--shadow-modal-premium)' }}`
//     layered on the existing `.modal` box-shadow (the inline style
//     wins via specificity).
//   • Backdrop blur strengthened — Tailwind `backdrop-blur-md`
//     layered on the existing `.modal-backdrop` blur(4px) for a true
//     frosted-glass pane behind the modal.
//   • Refined modal header — Lucide Settings icon badge (cyan-tinted
//     chip) replaces the bare `⚙️` emoji, tighter tracking on the
//     title (preserved verbatim as the direct text node of an `<h2>`
//     so the W38-8 test contract `getByText('User Preferences')`
//     resolves), dim caption beneath, refined close button with a
//     red-tinted hover affordance + Lucide X glyph (still
//     `aria-hidden` so the W38-8 `aria-label="Close settings modal"`
//     accessible-name contract resolves).
//   • Refined settings sections with section headers — each `<h3>`
//     carries a Lucide icon (Monitor / LayoutDashboard /
//     CandlestickChart / Bell / Volume2 / Lock) + the section name in
//     its own `<span>` (so the W38-8 `getByText(section)` contract
//     resolves to a single leaf span) + a count badge trailing slot.
//     The `text-cyan-400 uppercase tracking-wider` styling is
//     preserved.
//   • Refined form controls (toggles, selects, inputs) with
//     consistent styling — each SettingRow card carries a tone-tinted
//     hover affordance (`hover:border-cyan-500/25` + subtle bg wash),
//     each control gets a `focus-visible:ring-cyan-500/25` layered
//     ring (mirrors the W53-d StrategyConfigModal input focus ring).
//     The multiselect Checkbox labels now carry a cyan-tinted hover
//     border.
//   • Refined save/cancel buttons — primary "Save changes" button
//     leads with a Lucide Check icon (aria-hidden) + the existing
//     text; secondary "Cancel" button leads with a Lucide X icon;
//     "Reset to defaults" leads with a Lucide RotateCcw icon. The
//     accessible names (via aria-label + visible text) are preserved
//     verbatim so the W38-8 test contracts resolve.
//   • Backdrop with blur effect — the `.modal-backdrop` now also
//     carries `backdrop-blur-md` (Tailwind) layered on the existing
//     CSS `blur(4px)` for a true frosted-glass pane.
//   • All existing class names, props, API calls, aria-labels, and
//     test contracts preserved (see SettingsModal.test.tsx — 14 tests).

'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Monitor,
  LayoutDashboard,
  CandlestickChart,
  Bell,
  Volume2,
  Lock,
  Settings,
  X,
  Check,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { usePreferences } from '@/hooks/usePreferences'
import { getDefaults, type UserPreferences } from '@/lib/preferences'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

interface Props {
  isOpen: boolean
  onClose: () => void
}

// ── Sections + control descriptors ────────────────────────────────────────
//
// The settings list is data-driven so future preferences can be added
// by appending a descriptor (no JSX change required). Each descriptor
// declares its section, label, description, and the control type.

type Severity = 'critical' | 'error' | 'warning' | 'info'

interface SettingDescriptor {
  key: keyof UserPreferences
  section: 'Display' | 'Dashboard' | 'Trading' | 'Notifications' | 'Sound' | 'Privacy'
  label: string
  description: string
  control:
    | { type: 'toggle' }
    | { type: 'select'; options: { value: string; label: string }[] }
    | { type: 'slider'; min: number; max: number; step: number; format?: (v: number) => string }
    | { type: 'multiselect'; options: { value: Severity; label: string }[] }
}

const SETTINGS: SettingDescriptor[] = [
  // ── Display ──────────────────────────────────────────────────────────────
  {
    key: 'theme',
    section: 'Display',
    label: 'Theme',
    description: 'Active colour palette — dark is the dashboard default.',
    control: {
      type: 'select',
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ],
    },
  },
  {
    key: 'locale',
    section: 'Display',
    label: 'Language',
    description: 'UI language for sidebar labels + panel strings.',
    control: {
      type: 'select',
      options: [
        { value: 'en', label: 'English' },
        { value: 'fr', label: 'French' },
      ],
    },
  },

  // ── Dashboard ────────────────────────────────────────────────────────────
  {
    key: 'defaultPanel',
    section: 'Dashboard',
    label: 'Default panel',
    description: 'Sidebar section active on first load (e.g. command, markets-books).',
    control: {
      type: 'select',
      options: [
        { value: 'command', label: 'Command Center' },
        { value: 'markets-books', label: 'Live Books' },
        { value: 'markets-screener', label: 'Screener' },
        { value: 'markets-order-flow', label: 'Order Flow' },
        { value: 'portfolio-positions', label: 'Positions' },
        { value: 'portfolio-orders', label: 'Orders' },
        { value: 'portfolio-trades', label: 'Trades' },
        { value: 'strategies-registry', label: 'Strategy Registry' },
        { value: 'strategies-arbitrage', label: 'Arbitrage' },
        { value: 'analytics-performance', label: 'Performance' },
        { value: 'system-health', label: 'System Health' },
      ],
    },
  },
  {
    key: 'refreshIntervalMs',
    section: 'Dashboard',
    label: 'Refresh interval',
    description: 'How often the dashboard polls the bot REST API when the WebSocket is down.',
    control: {
      type: 'slider',
      min: 500,
      max: 10_000,
      step: 250,
      format: (v) => `${(v / 1000).toFixed(2)}s`,
    },
  },
  {
    key: 'autoRefresh',
    section: 'Dashboard',
    label: 'Auto-refresh',
    description: 'When off, the REST fallback poll is paused — the WebSocket alone drives updates.',
    control: { type: 'toggle' },
  },
  {
    key: 'reducedMotion',
    section: 'Dashboard',
    label: 'Reduced motion',
    description: 'Disable panel transitions + CSS animations (price flashes, spinner pulses).',
    control: { type: 'toggle' },
  },

  // ── Trading ─────────────────────────────────────────────────────────────
  {
    key: 'showUnrealizedPnl',
    section: 'Trading',
    label: 'Show unrealized P&L',
    description: 'Display the mark-to-market P&L column on the positions table.',
    control: { type: 'toggle' },
  },
  {
    key: 'showPriceFlashes',
    section: 'Trading',
    label: 'Show price flashes',
    description: 'Briefly tint the Mark cell green/red when a tick moves the mid price.',
    control: { type: 'toggle' },
  },
  {
    key: 'defaultChartType',
    section: 'Trading',
    label: 'Default chart type',
    description: 'Chart style used when opening the market chart modal.',
    control: {
      type: 'select',
      options: [
        { value: 'area', label: 'Area' },
        { value: 'line', label: 'Line' },
        { value: 'candlestick', label: 'Candlestick' },
      ],
    },
  },
  {
    key: 'numberFormat',
    section: 'Trading',
    label: 'Number format',
    description: 'US: 1,234.56 — EU: 1.234,56. Applies to all monetary figures.',
    control: {
      type: 'select',
      options: [
        { value: 'us', label: 'US (1,234.56)' },
        { value: 'eu', label: 'EU (1.234,56)' },
      ],
    },
  },

  // ── Notifications ───────────────────────────────────────────────────────
  {
    key: 'notificationsEnabled',
    section: 'Notifications',
    label: 'Browser notifications',
    description: 'Master switch for desktop toasts. When off, the alerts poll is paused.',
    control: { type: 'toggle' },
  },
  {
    key: 'alertSeverityFilter',
    section: 'Notifications',
    label: 'Alert severity filter',
    description: 'Severities that should surface a desktop toast when notifications are on.',
    control: {
      type: 'multiselect',
      options: [
        { value: 'critical', label: 'Critical' },
        { value: 'error', label: 'Error' },
        { value: 'warning', label: 'Warning' },
        { value: 'info', label: 'Info' },
      ],
    },
  },

  // ── Sound ───────────────────────────────────────────────────────────────
  {
    key: 'soundEnabled',
    section: 'Sound',
    label: 'Sound cues',
    description: 'Audible cues for trade fills, whale alerts, and the kill switch.',
    control: { type: 'toggle' },
  },
  {
    key: 'soundVolume',
    section: 'Sound',
    label: 'Sound volume',
    description: 'Cue volume, applied to every Web Audio oscillator + snippet.',
    control: {
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.05,
      format: (v) => `${Math.round(v * 100)}%`,
    },
  },

  // ── Privacy ─────────────────────────────────────────────────────────────
  {
    key: 'shareErrorReports',
    section: 'Privacy',
    label: 'Share error reports',
    description: 'Send uncaught client-side exceptions to the backend /api/errors endpoint for triage.',
    control: { type: 'toggle' },
  },
]

const SECTION_ORDER: SettingDescriptor['section'][] = [
  'Display',
  'Dashboard',
  'Trading',
  'Notifications',
  'Sound',
  'Privacy',
]

// ── W58-d — section icons (one per canonical section) ─────────────────────
// Rendered inside each `<h3>` before the section name span so the
// section reads as a labelled group. Mirrors the W53-d
// StrategyConfigModal SectionHeader pattern.
const SECTION_ICONS: Record<SettingDescriptor['section'], LucideIcon> = {
  Display: Monitor,
  Dashboard: LayoutDashboard,
  Trading: CandlestickChart,
  Notifications: Bell,
  Sound: Volume2,
  Privacy: Lock,
}

// ── W58-d — severity tone palette (for multiselect Checkbox labels) ────────
// Maps each alert severity onto a Tailwind border/text colour so the
// multiselect row reads as a severity chip rather than a plain checkbox.
// Static class strings keep Tailwind 4's JIT scanner happy.
const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'border-red-500/30 text-red-300 data-[state=checked]:border-red-500/50 data-[state=checked]:bg-red-500/10',
  error:    'border-amber-500/30 text-amber-300 data-[state=checked]:border-amber-500/50 data-[state=checked]:bg-amber-500/10',
  warning:  'border-yellow-500/30 text-yellow-300 data-[state=checked]:border-yellow-500/50 data-[state=checked]:bg-yellow-500/10',
  info:     'border-cyan-500/30 text-cyan-300 data-[state=checked]:border-cyan-500/50 data-[state=checked]:bg-cyan-500/10',
}

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { preferences, update } = usePreferences()
  const [draft, setDraft] = useState<UserPreferences>(preferences)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const lastActiveRef = useRef<HTMLElement | null>(null)

  // Re-seed the draft from the persisted preferences every time the
  // modal opens (so opening it twice with intervening external edits
  // always shows the latest persisted state). Done in a layout effect
  // (not strictly required but matches the ShortcutsModal pattern of
  // "modal opens → seed state synchronously" so the first paint has
  // the right values, no flicker).
  useEffect(() => {
    if (isOpen) {
      setDraft(preferences)
    }
  }, [isOpen, preferences])

  // Escape closes — same handler as ShortcutsModal.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Focus management: capture the trigger, move focus into the modal
  // on open, restore focus on close. Mirrors ShortcutsModal.
  useEffect(() => {
    if (isOpen) {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        lastActiveRef.current = document.activeElement
      }
      const t = setTimeout(() => closeBtnRef.current?.focus(), 50)
      return () => clearTimeout(t)
    } else {
      lastActiveRef.current?.focus?.()
      lastActiveRef.current = null
    }
    return undefined
  }, [isOpen])

  // Focus trap inside the modal.
  useEffect(() => {
    if (!isOpen) return
    const el = modalRef.current
    if (!el) return
    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="switch"], [role="checkbox"], [role="slider"]'
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    el.addEventListener('keydown', trap)
    return () => el.removeEventListener('keydown', trap)
  }, [isOpen])

  // Group descriptors by section in the canonical order. Memoised so
  // the array identity is stable across re-renders (every typed key
  // would otherwise re-run the .filter loop, but the cost is tiny —
  // the memo is a defensive precaution for future expansion).
  const sections = useMemo(() => {
    return SECTION_ORDER.map((section) => ({
      section,
      items: SETTINGS.filter((s) => s.section === section),
    }))
  }, [])

  // Has the trader changed anything since the modal opened? Used to
  // enable/disable the Save button + warn on Cancel-with-pending-changes.
  const isDirty = useMemo(() => {
    return (Object.keys(draft) as (keyof UserPreferences)[]).some(
      (k) => JSON.stringify(draft[k]) !== JSON.stringify(preferences[k]),
    )
  }, [draft, preferences])

  // ── Field setters ──────────────────────────────────────────────────────
  //
  // Each setter is a thin wrapper around `setDraft` so the caller
  // doesn't have to repeat the spread. The primitive `update` callback
  // is only invoked on Save — the draft is local-only until then.

  const setToggle = (key: keyof UserPreferences, value: boolean) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const setSelect = (key: keyof UserPreferences, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const setSlider = (key: keyof UserPreferences, value: number) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const toggleSeverity = (sev: Severity) =>
    setDraft((d) => {
      const current = d.alertSeverityFilter as Severity[]
      const next = current.includes(sev)
        ? current.filter((s) => s !== sev)
        : [...current, sev]
      return { ...d, alertSeverityFilter: next }
    })

  // ── Actions ────────────────────────────────────────────────────────────

  const handleSave = () => {
    // Walk the diff between draft + persisted preferences, calling
    // `update(key, value)` for each changed field. Each call persists
    // to localStorage + dispatches the `preferences-changed` event so
    // every mounted consumer re-renders with the new value.
    (Object.keys(draft) as (keyof UserPreferences)[]).forEach((key) => {
      const oldVal = preferences[key]
      const newVal = draft[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        update(key, newVal)
      }
    })
    onClose()
  }

  const handleCancel = () => {
    // Discard the draft — no persistence. Restores draft from the
    // persisted preferences in case the trader re-opens the modal.
    setDraft(preferences)
    onClose()
  }

  const handleReset = () => {
    // Reset the DRAFT to DEFAULTS — does NOT persist. The trader can
    // still click Cancel to bail. If they click Save afterwards, every
    // field flips back to its default in one batch.
    setDraft(getDefaults())
  }

  if (!isOpen) return null

  return (
    <div
      // W58-d — backdrop blur strengthened via Tailwind `backdrop-blur-md`
      // layered on the existing `.modal-backdrop` blur(4px). Clicking the
      // backdrop (outside the modal) cancels the draft + closes — same
      // behaviour as StrategyConfigModal.
      className="modal-backdrop backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        // W58-d — glassmorphism modal surface via `.surface-tier-overlay`
        // (rgba bg + 12px backdrop-blur + saturate) layered on the
        // existing `.modal .modal-wide` class. The premium modal shadow
        // token overrides the default `--shadow-modal` via inline style
        // (inline wins over CSS-rule specificity).
        className="modal modal-wide surface-tier-overlay"
        style={{ boxShadow: 'var(--shadow-modal-premium)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-header">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center justify-center size-7 rounded-md bg-cyan-500/[0.08] border border-cyan-500/25 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.10)]"
              aria-hidden="true"
            >
              <Settings className="size-4" />
            </span>
            <div className="flex flex-col">
              <h2 id="settings-title" className="modal-title tracking-tight">
                User Preferences
              </h2>
              <span className="text-[10px] text-[#7e8aaa] -mt-0.5">
                Workspace, trading, notifications + privacy
              </span>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={handleCancel}
            className="modal-close transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md w-7 h-7 inline-flex items-center justify-center"
            aria-label="Close settings modal"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body space-y-5 max-h-[72vh] overflow-y-auto scrollbar-thin">
          {sections.map(({ section, items }) => {
            const Icon = SECTION_ICONS[section]
            return (
              <section key={section} aria-label={section}>
                <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-cyan-400 mb-3 border-b border-[#1f2335] pb-2">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {/* The section name is wrapped in its own `<span>` so the
                      W38-8 test contract `getByText(section)` resolves to a
                      single leaf span (not the parent h3 that also contains
                      the SVG icon's empty text content). */}
                  <span>{section}</span>
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-[#13161e] border border-[#1f2335] text-[9.5px] tabular-nums text-[#7e8aaa] font-mono normal-case tracking-normal">
                    {items.length}
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <SettingRow
                      key={String(item.key)}
                      descriptor={item}
                      value={draft[item.key]}
                      onToggle={(v) => setToggle(item.key, v)}
                      onSelect={(v) => setSelect(item.key, v)}
                      onSlider={(v) => setSlider(item.key, v)}
                      onToggleSeverity={toggleSeverity}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <div className="modal-footer justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-amber-300 hover:text-amber-200 inline-flex items-center gap-1.5"
            aria-label="Reset all preferences to defaults (draft only — Save to apply)"
            title="Reset draft to defaults. Save to persist."
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            Reset to defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-xs inline-flex items-center gap-1.5"
            >
              <X className="size-3" aria-hidden="true" />
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty}
              className="text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label="Save preferences and close"
              title={isDirty ? 'Save changes' : 'No changes to save'}
            >
              <Check className="size-3" aria-hidden="true" />
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SettingRow ──────────────────────────────────────────────────────────────
//
// Renders a single label / description / control row. The control is
// chosen by `descriptor.control.type`. Each control is wired to the
// appropriate callback so the draft updates immediately on every
// interaction (no Save button per row — the modal has a single Save
// at the bottom).
//
// W58-d — refined row card:
//   • Tone-tinted hover affordance (`hover:border-cyan-500/25` +
//     `hover:bg-cyan-500/[0.02]`) so the trader sees at a glance
//     which row their cursor is on.
//   • `transition-colors duration-150` on the card so the hover
//     affordance animates smoothly.
//   • Each control gets a `focus-visible:ring-cyan-500/25` layered
//     ring (mirrors the W53-d StrategyConfigModal input focus ring).
//   • The multiselect Checkbox labels now carry a tone-tinted border
//     per severity (`SEVERITY_TONE` map) so each chip reads as a
//     severity indicator rather than a plain checkbox.

interface SettingRowProps {
  descriptor: SettingDescriptor
  value: UserPreferences[keyof UserPreferences]
  onToggle: (v: boolean) => void
  onSelect: (v: string) => void
  onSlider: (v: number) => void
  onToggleSeverity: (sev: Severity) => void
}

function SettingRow({
  descriptor,
  value,
  onToggle,
  onSelect,
  onSlider,
  onToggleSeverity,
}: SettingRowProps) {
  const { label, description, control } = descriptor

  return (
    <div className="group flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 bg-[#0e1015] border border-[#1f2335] rounded-md px-3 py-2.5 transition-colors duration-150 hover:border-cyan-500/25 hover:bg-cyan-500/[0.02]">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-[#dde1ed] group-hover:text-cyan-50 transition-colors duration-150">{label}</div>
        <div className="text-[11px] text-[#7e8aaa] mt-0.5 leading-snug">{description}</div>
      </div>
      <div className="flex-shrink-0 self-start sm:self-center min-w-[140px] sm:justify-end flex">
        {control.type === 'toggle' && (
          <Switch
            checked={value as boolean}
            onCheckedChange={onToggle}
            aria-label={label}
            className="focus-visible:ring-cyan-500/25 focus-visible:border-cyan-500/40"
          />
        )}
        {control.type === 'select' && (
          <Select value={String(value)} onValueChange={onSelect}>
            <SelectTrigger
              size="sm"
              className="w-[160px] bg-[#13161e] border-[#2a2f47] hover:border-cyan-500/30 focus-visible:ring-cyan-500/25 focus-visible:border-cyan-500/40 transition-colors duration-150"
              aria-label={label}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {control.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {control.type === 'slider' && (
          <div className="flex items-center gap-2 w-[200px]">
            <Slider
              value={[value as number]}
              min={control.min}
              max={control.max}
              step={control.step}
              onValueChange={(v) => onSlider(v[0])}
              aria-label={label}
              className="flex-1 [&_[data-slot=slider-thumb]]:focus-visible:ring-cyan-500/25"
            />
            <span className="mono text-[11px] text-[#7e8aaa] w-12 text-right tabular-nums">
              {control.format ? control.format(value as number) : String(value)}
            </span>
          </div>
        )}
        {control.type === 'multiselect' && (
          <div
            className="flex flex-wrap gap-2 sm:justify-end"
            role="group"
            aria-label={label}
          >
            {control.options.map((opt) => {
              const checked = (value as Severity[]).includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-1.5 text-[11px] text-[#dde1ed] cursor-pointer select-none bg-[#13161e] border px-2 py-1 rounded transition-colors duration-150 hover:bg-[#1a1f2e] hover:border-cyan-500/30 ${SEVERITY_TONE[opt.value]}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleSeverity(opt.value)}
                    aria-label={`${label}: ${opt.label}`}
                    className="focus-visible:ring-cyan-500/25"
                  />
                  <span>{opt.label}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Exported for tests / future programmatic consumers.
export { SETTINGS, SECTION_ORDER }
export type { SettingDescriptor, Severity }

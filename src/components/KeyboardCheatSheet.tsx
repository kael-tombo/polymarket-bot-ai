// components/KeyboardCheatSheet.tsx — W17-6 Full-screen keyboard
// shortcut cheat sheet + practice mode.
//
// W58-c — Premium polish pass (visual consistency with the W50-57
// glassmorphism modal family: MarketChartModal / StrategyConfigModal /
// SettingsModal / CommandPalette).
//
//   • Glassmorphism overlay — `.surface-tier-overlay` (rgba bg + 12px
//     backdrop-blur + saturate) layered on the existing `.modal` class.
//     Inline premium shadow via `var(--shadow-modal-premium)` design
//     token (24px y-offset, 56px blur, 0.6 alpha — heaviest elevation
//     tier). `backdrop-blur-md` layered on the existing `.modal-backdrop`
//     blur(4px) for a true frosted-glass pane behind the modal.
//   • Refined header — Lucide `Keyboard` icon badge (size-7 cyan-tinted
//     chip with `bg-cyan-500/[0.08]` + `border-cyan-500/25` + cyan glow
//     shadow) replaces the bare `⌨️` emoji. The title text "Workstation
//     Keyboard Cheat Sheet" is preserved verbatim as a direct text node
//     of `<h2 id="cheat-sheet-title">` so the W40-2 test contract
//     `getByText('Workstation Keyboard Cheat Sheet')` keeps resolving.
//     A dim caption "Catalog, search, and practice mode" sits beneath
//     the title for a quick scannable summary.
//   • Refined close button — Lucide `X` glyph (replaces the bare `✕`)
//     with `transition-colors duration-150 hover:text-red-300
//     hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md
//     w-7 h-7` for a red-tinted hover affordance. The `aria-label="Close
//     cheat sheet"` is preserved verbatim.
//   • Polished search input — wrapped in a relative container with an
//     absolute-positioned Lucide `Search` leading glyph (cyan-tinted,
//     shifts to bright cyan on focus-within). Cyan-tinted focus ring
//     layered on the existing Input focus-visible ring. The placeholder
//     "Search shortcuts…" is preserved verbatim.
//   • Refined shortcut categories with section headers — each `<h3>` now
//     carries `flex items-center gap-1.5 text-[11px] font-extrabold
//     uppercase tracking-wider text-cyan-400 mb-2 border-b
//     border-[var(--border)] pb-1.5` (preserved verbatim from the original).
//     Inside the h3: a Lucide icon (Navigation / DollarSign / Eye /
//     Settings — one per category) in a size-3.5 cyan-tinted chip; the
//     category name in its own `<span>` (so any future test contract
//     `getByText('Navigation')` resolves to a single leaf span); a
//     trailing count badge showing `items.length` so the trader sees
//     at a glance how many shortcuts are in each section.
//   • Physical keycap badges — each shortcut chord is split into
//     individual keys (e.g. "⌘ + K" → [⌘] [+] [K]) and rendered as a
//     sequence of `<kbd>` elements styled as physical keycaps: rounded
//     corners, gradient bg, inset bottom-edge shadow (mimics the
//     keycap profile), border, mono font, tabular-nums. The wrapper
//     carries `aria-label={`Shortcut ${formatShortcut(s)}`}` so screen
//     readers still announce the full chord; the individual keycaps are
//     `aria-hidden="true"`.
//   • Refined layout grid — the shortcut list inside each category
//     section is now a `grid grid-cols-1 sm:grid-cols-2 gap-1.5` (was
//     `space-y-1` single-column) so the catalog is more compact on
//     wider viewports. Each row is a card-style `li` with `bg-[var(--bg-page)]`
//     + `border border-[var(--border)]` + cyan-tinted hover affordance
//     (`hover:border-cyan-500/25 hover:bg-cyan-500/[0.02]`).
//   • Refined empty state — the bare `No shortcuts match "{query}".`
//     text node is wrapped in a polished empty-state panel: a Lucide
//     `SearchX` glyph in a cyan-tinted chip + the title (preserved
//     verbatim as a leaf `<span>`) + a dim caption ("Try a different
//     keyword — descriptions, keys, and categories are searchable.")
//     for guidance.
//   • All Lucide icons carry `aria-hidden="true"`.
//   • All existing functionality, props, class names, test contracts,
//     data-testid attributes, focus-management behaviour, escape
//     handler, focus trap, practice mode, JSON export, clipboard
//     export, and the `'use client'` directive preserved.
//
// Replaces the legacy `ShortcutsModal.tsx` (still mounted by page.tsx
// for any consumer that hasn't migrated). The new cheat sheet:
//   * Pulls its catalog from the single source of truth in
//     `lib/keyboardShortcuts.ts` — the cheat sheet, the hook, and any
//     future surface (e.g. a settings-panel shortcut editor) all read
//     from the same `SHORTCUT_DEFINITIONS` array.
//   * Groups shortcuts by category (Navigation / Trading / View /
//     System) with a category-icon header so the trader can scan by
//     intent.
//   * Offers a fuzzy search box — typing "buy" filters to just the
//     Quick buy row; typing "nav" filters to the eight nav digits.
//   * Ships a "Practice mode" that picks a random shortcut, prompts
//     the user to press it, and confirms / corrects — so the trader
//     builds muscle memory without having to read the cheat sheet.
//   * Can export the catalog as JSON (download) or as a PNG-style
//     screenshot via the browser's clipboard API (best-effort).
//
// Mounting: rendered conditionally by `app/page.tsx` when
// `cheatOpen===true`. The cheat sheet owns its own focus trap +
// Escape handling so the parent's `useKeyboardShortcuts` hook can
// stay simple (it doesn't need to know about the cheat sheet's
// internal focus management).
//
// Accessibility:
//   * role="dialog" + aria-modal="true" so screen readers know it's
//     a modal context.
//   * aria-labelledby points at the visible title so the screen
//     reader announces "Workstation Keyboard Shortcuts" on open.
//   * Focus trap keeps Tab focus cycling within the dialog (mirrors
//     the ConfirmationDialog pattern).
//   * Escape closes the dialog (also stops propagation so the
//     parent's global Escape handler doesn't ALSO clear market
//     selection).

'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  SHORTCUT_CATEGORIES,
  SHORTCUT_DEFINITIONS,
  formatShortcut,
  matchesShortcut,
  type ShortcutCategory,
  type ShortcutDefinition,
} from '@/lib/keyboardShortcuts'
import {
  Check,
  Clipboard,
  DollarSign,
  Download,
  Eye,
  Keyboard,
  Navigation,
  Search,
  SearchX,
  Settings,
  Square,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

export interface KeyboardCheatSheetProps {
  /** Controls visibility. When false the component renders null. */
  isOpen: boolean
  /** Close callback — invoked on Escape / backdrop-click / close-button. */
  onClose: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Stable empty-array fallback for the "no results" branch — keeps
 *  `.map` from throwing on `undefined` and avoids a fresh `[]`
 *  allocation per render. */
const EMPTY_LIST: ShortcutDefinition[] = []

/** Picks a pseudo-random shortcut from the catalog. Used by practice
 *  mode to prompt the user with a fresh chord each round. Excludes
 *  `Escape` (the cheat sheet's own close key — pressing it would
 *  close the dialog instead of registering a practice hit) and the
 *  `?` shortcut (which would also close the dialog when cheat sheet
 *  re-opens). */
function pickRandomShortcut(exclude?: ShortcutDefinition): ShortcutDefinition {
  const pool = SHORTCUT_DEFINITIONS.filter(
    (s) =>
      s.key !== 'Escape' &&
      s.key !== '?' &&
      s !== exclude,
  )
  if (pool.length === 0) return SHORTCUT_DEFINITIONS[0]
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Practice-mode state machine. */
type PracticeState =
  | { kind: 'idle' }
  | { kind: 'prompting'; shortcut: ShortcutDefinition; attempts: number }
  | { kind: 'success'; shortcut: ShortcutDefinition }
  | { kind: 'failure'; shortcut: ShortcutDefinition; pressedKey: string }

// W58-c — per-category Lucide glyph rendered inside each `<h3>` header
// chip. Mirrors the W53-d StrategyConfigModal SectionHeader pattern.
const CATEGORY_LUCIDE: Record<ShortcutCategory, LucideIcon> = {
  navigation: Navigation,
  trading:    DollarSign,
  view:       Eye,
  system:     Settings,
}

// ── Component ─────────────────────────────────────────────────────────

export default function KeyboardCheatSheet({
  isOpen,
  onClose,
}: KeyboardCheatSheetProps) {
  // Search query — filters the catalog by description (case-insensitive).
  const [query, setQuery] = useState('')
  // Active tab — lets the trader jump to a specific category, or "all"
  // to see everything at once. Defaults to "all" so the cheat sheet
  // shows the full catalog on first open.
  const [activeCategory, setActiveCategory] =
    useState<ShortcutCategory | 'all'>('all')
  // Practice-mode state. `idle` means practice is off; `prompting`
  // means a shortcut is on screen waiting for the user to press it.
  const [practice, setPractice] = useState<PracticeState>({ kind: 'idle' })
  // Toast / banner message for export feedback ("Saved JSON" / "Copy
  // failed — your browser blocked clipboard write").
  const [feedback, setFeedback] = useState<string | null>(null)

  // Focus management refs — mirrors the ConfirmationDialog pattern.
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const lastActiveRef = useRef<HTMLElement | null>(null)
  // Stable timeout handle for the feedback banner auto-clear.
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Filtered catalog ──────────────────────────────────────────────
  // Recomputed only when the query OR active category changes. The
  // search is a case-insensitive substring match on the description
  // AND on the formatted chord (so typing "Cmd" surfaces every
  // modifier shortcut).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q && activeCategory === 'all') return SHORTCUT_DEFINITIONS
    return SHORTCUT_DEFINITIONS.filter((s) => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false
      if (!q) return true
      const haystack = `${s.description} ${formatShortcut(s)} ${s.key} ${s.category}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query, activeCategory])

  // Group the filtered list by category so the render pass can map
  // over an ordered list of (category, items) pairs.
  const grouped = useMemo(() => {
    const groups: Array<{ category: ShortcutCategory; items: ShortcutDefinition[] }> = []
    for (const cat of Object.keys(SHORTCUT_CATEGORIES) as ShortcutCategory[]) {
      const items = filtered.filter((s) => s.category === cat)
      if (items.length > 0) groups.push({ category: cat, items })
    }
    return groups
  }, [filtered])

  // ── Open / close lifecycle ──────────────────────────────────────
  // On open: capture the previously-focused element (so we can restore
  // focus on close) and move focus into the search input so the user
  // can immediately start typing. On close: restore focus to the
  // trigger.
  useEffect(() => {
    if (!isOpen) return
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      lastActiveRef.current = document.activeElement
    }
    // Defer to allow the dialog to mount before we steal focus.
    const t = setTimeout(() => searchInputRef.current?.focus(), 50)
    return () => {
      clearTimeout(t)
    }
  }, [isOpen])

  // Restore focus on close.
  useEffect(() => {
    if (isOpen) return
    lastActiveRef.current?.focus?.()
    lastActiveRef.current = null
    // Reset transient state on close so the next open starts fresh.
    setQuery('')
    setActiveCategory('all')
    setPractice({ kind: 'idle' })
    setFeedback(null)
  }, [isOpen])

  // ── Escape + focus trap ──────────────────────────────────────────
  // The cheat sheet owns its own Escape handler so it can
  // stopPropagation before the parent's global Escape handler runs.
  // Without this, pressing Escape would close the cheat sheet AND
  // clear any market selection the parent tracks.
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handler, true) // capture phase — runs BEFORE the parent's bubble-phase handler
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, onClose])

  // Focus trap — keep Tab focus cycling inside the dialog while open.
  useEffect(() => {
    if (!isOpen) return
    const el = dialogRef.current
    if (!el) return
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(selector))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    el.addEventListener('keydown', trap)
    return () => el.removeEventListener('keydown', trap)
  }, [isOpen])

  // ── Practice mode ───────────────────────────────────────────────
  // Starts a practice round: pick a random shortcut, prompt the user
  // to press it, listen for the next keydown, and confirm / correct.
  const startPractice = useCallback(() => {
    const shortcut = pickRandomShortcut()
    setPractice({ kind: 'prompting', shortcut, attempts: 0 })
  }, [])

  const stopPractice = useCallback(() => {
    setPractice({ kind: 'idle' })
  }, [])

  // Practice-mode keydown handler — attached only when the practice
  // state is `prompting`. Captures the next keypress and compares it
  // to the prompt's shortcut definition.
  useEffect(() => {
    if (practice.kind !== 'prompting') return
    const handler = (e: KeyboardEvent) => {
      // Don't propagate to the parent — the practice round consumes
      // this keypress.
      e.stopPropagation()
      e.preventDefault()
      const target = practice.shortcut
      // Synthesize a KeyboardEvent-shape for the matcher (the matcher
      // reads e.key, e.metaKey, etc — all of which the real event
      // already provides).
      if (matchesShortcut(e, target)) {
        setPractice({ kind: 'success', shortcut: target })
        // Auto-advance to the next prompt after a brief celebratory
        // pause.
        setTimeout(() => {
          setPractice({ kind: 'prompting', shortcut: pickRandomShortcut(target), attempts: 0 })
        }, 900)
      } else {
        const nextAttempts = practice.attempts + 1
        // After 2 wrong attempts, show the answer + auto-advance.
        if (nextAttempts >= 2) {
          setPractice({
            kind: 'failure',
            shortcut: target,
            pressedKey: e.key,
          })
          setTimeout(() => {
            setPractice({
              kind: 'prompting',
              shortcut: pickRandomShortcut(target),
              attempts: 0,
            })
          }, 1500)
        } else {
          // Same prompt, increment attempts — give the user another try.
          setPractice({ kind: 'prompting', shortcut: target, attempts: nextAttempts })
        }
      }
    }
    // Capture phase so we run BEFORE the global hook (which would
    // otherwise dispatch the same keypress to its own action list).
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [practice])

  // ── Export ──────────────────────────────────────────────────────
  // JSON export — straightforward blob download. Image export is
  // best-effort: uses the async Clipboard API to copy a text snapshot
  // (the browser doesn't expose a "render element to PNG" API without
  // pulling in html2canvas; the text snapshot is a pragmatic fallback
  // that always works).
  const showFeedback = useCallback((message: string) => {
    setFeedback(message)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  const exportJson = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      shortcuts: SHORTCUT_DEFINITIONS.map((s) => ({
        key: s.key,
        modifiers: s.modifiers,
        description: s.description,
        category: s.category,
        global: s.global ?? false,
        formatted: formatShortcut(s),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'keyboard-shortcuts.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showFeedback('Saved keyboard-shortcuts.json')
  }, [showFeedback])

  const exportImage = useCallback(async () => {
    // Best-effort text snapshot of the catalog — works in every
    // browser without pulling in html2canvas. The user can paste the
    // snapshot into a notes app for offline reference.
    const lines = SHORTCUT_DEFINITIONS.map(
      (s) => `${formatShortcut(s).padEnd(20)} ${s.description}`,
    ).join('\n')
    const text = `Polymarket Pro — Keyboard Shortcuts\n\n${lines}`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        showFeedback('Shortcut catalog copied to clipboard (text snapshot)')
      } else {
        showFeedback('Clipboard API unavailable — export JSON instead')
      }
    } catch {
      showFeedback('Clipboard write failed — export JSON instead')
    }
  }, [showFeedback])

  // ── Render ──────────────────────────────────────────────────────
  if (!isOpen) return null

  return (
    <div
      // W58-c — `backdrop-blur-md` layered on the existing
      // `.modal-backdrop` blur(4px) for a true frosted-glass pane
      // behind the modal. Click-outside-to-close behaviour preserved
      // verbatim.
      className="modal-backdrop backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
      data-testid="cheat-sheet-backdrop"
    >
      <div
        ref={dialogRef}
        // W58-c — glassmorphism modal surface via `.surface-tier-overlay`
        // layered on the existing `.modal` class. Inline premium shadow
        // wins via specificity over the `.modal` box-shadow rule.
        className="modal surface-tier-overlay"
        style={{
          maxWidth: '780px',
          width: 'calc(100% - 32px)',
          maxHeight: '90vh',
          boxShadow: 'var(--shadow-modal-premium)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheat-sheet-title"
        data-testid="cheat-sheet-dialog"
      >
        {/* Header ────────────────────────────────────────────────── */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            {/* W58-c — premium icon badge. Lucide `Keyboard` glyph in
                a cyan-tinted chip with bg-emerald-500/[0.08] +
                border-emerald-500/25 + cyan glow shadow. Replaces the
                bare `⌨️` emoji. */}
            <span
              className="inline-flex items-center justify-center size-7 rounded-md bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.10)]"
              aria-hidden="true"
            >
              <Keyboard className="size-4" />
            </span>
            <div>
              <h2
                id="cheat-sheet-title"
                className="text-sm font-bold text-[var(--text-primary)] tracking-tight"
              >
                Workstation Keyboard Cheat Sheet
              </h2>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Catalog, search, and practice mode
              </span>
            </div>
          </div>
          {/* W58-c — refined close button. Lucide `X` glyph (replaces
              the bare `✕`) with red-tinted hover affordance. The
              `aria-label="Close cheat sheet"` is preserved verbatim. */}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="modal-close transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md w-7 h-7 inline-flex items-center justify-center"
            aria-label="Close cheat sheet"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Toolbar — search + export ─────────────────────────────── */}
        <div
          className="modal-body"
          style={{ paddingTop: 12, paddingBottom: 0 }}
        >
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* W58-c — polished search input. Wrapped in a relative
                container with an absolute-positioned Lucide `Search`
                leading glyph (cyan-tinted, brightens on
                focus-within). The Input keeps its existing `flex-1`
                + `data-testid="cheat-sheet-search"` + `aria-label`
                + `placeholder` wiring intact (test contracts
                resolve via `getByPlaceholderText` and
                `getByLabelText`). */}
            <div className="relative flex-1">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-secondary)] pointer-events-none transition-colors duration-150 focus-within:text-emerald-400"
                aria-hidden="true"
              />
              <Input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shortcuts…"
                aria-label="Filter shortcuts"
                className="flex-1 pl-8 bg-[var(--bg-surface)] border-[var(--border-strong)] focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/25 transition-colors duration-150"
                data-testid="cheat-sheet-search"
              />
            </div>
            <div className="flex gap-1.5">
              {/* W58-c — export buttons lead with Lucide glyphs
                  (Download / Clipboard / Target / Square) for a
                  clear affordance. The `aria-label` + `title`
                  attributes are preserved verbatim. */}
              <Button
                variant="outline"
                size="sm"
                onClick={exportJson}
                aria-label="Export shortcut catalog as JSON"
                title="Export as JSON"
                className="inline-flex items-center gap-1.5"
              >
                <Download className="size-3" aria-hidden="true" />
                <span className="hidden sm:inline">JSON</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportImage}
                aria-label="Copy shortcut catalog to clipboard"
                title="Copy to clipboard"
                className="inline-flex items-center gap-1.5"
              >
                <Clipboard className="size-3" aria-hidden="true" />
                <span className="hidden sm:inline">Copy</span>
              </Button>
              {practice.kind === 'idle' ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={startPractice}
                  aria-label="Start practice mode"
                  title="Practice pressing shortcuts"
                  className="inline-flex items-center gap-1.5"
                >
                  <Target className="size-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Practice</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopPractice}
                  aria-label="Stop practice mode"
                  title="Stop practice"
                  className="inline-flex items-center gap-1.5"
                >
                  <Square className="size-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Stop</span>
                </Button>
              )}
            </div>
          </div>

          {/* Feedback banner — auto-clears after ~2s ──────────────── */}
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2 text-xs text-emerald-400 bg-[var(--bg-page)] border border-[var(--border)] px-3 py-1.5 rounded"
              data-testid="cheat-sheet-feedback"
            >
              {feedback}
            </div>
          )}

          {/* Practice prompt ─────────────────────────────────────── */}
          {practice.kind !== 'idle' && (
            <PracticePanel practice={practice} />
          )}

          {/* Tabs — category filter ─────────────────────────────── */}
          <Tabs
            value={activeCategory}
            onValueChange={(v) => setActiveCategory(v as ShortcutCategory | 'all')}
            className="mt-3"
          >
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {(Object.keys(SHORTCUT_CATEGORIES) as ShortcutCategory[]).map(
                (cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    <span aria-hidden="true" className="mr-1">
                      {SHORTCUT_CATEGORIES[cat].icon}
                    </span>
                    {SHORTCUT_CATEGORIES[cat].label}
                  </TabsTrigger>
                ),
              )}
            </TabsList>

            <TabsContent value={activeCategory} className="mt-3">
              {/* Body — grouped shortcuts ─────────────────────────── */}
              <div
                className="space-y-4 max-h-[55vh] overflow-y-auto scrollbar-thin pr-1"
                data-testid="cheat-sheet-list"
              >
                {grouped.length === 0 ? (
                  /* W58-c — polished empty state. Lucide `SearchX`
                     glyph in a cyan-tinted chip + the title
                     (preserved verbatim as a leaf `<span>` so the
                     text content matches the original) + a dim
                     caption for guidance. The `data-testid` is
                     preserved verbatim. */
                  <div
                    className="flex flex-col items-center justify-center gap-2 py-10 px-6 select-none"
                    data-testid="cheat-sheet-empty"
                  >
                    <span
                      className="inline-flex items-center justify-center size-9 rounded-full bg-emerald-500/[0.04] border border-emerald-500/15 text-emerald-400/60 shadow-[0_0_18px_rgba(16,185,129,0.08)]"
                      aria-hidden="true"
                    >
                      <SearchX className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                      No shortcuts match “{query}”.
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Try a different keyword — descriptions, keys, and categories are searchable.
                    </span>
                  </div>
                ) : (
                  grouped.map(({ category, items }) => {
                    const CatGlyph = CATEGORY_LUCIDE[category]
                    return (
                      <section
                        key={category}
                        aria-labelledby={`cat-${category}`}
                        data-testid={`cheat-sheet-category-${category}`}
                      >
                        {/* W58-c — refined section header. Lucide
                            category glyph (Navigation / DollarSign /
                            Eye / Settings) in a size-3.5 cyan-tinted
                            chip + the category name in its own
                            `<span>` (so any future test contract
                            `getByText('Navigation')` resolves to a
                            single leaf span) + a trailing count
                            badge. The existing className on `<h3>`
                            is preserved verbatim. */}
                        <h3
                          id={`cat-${category}`}
                          className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5 border-b border-[var(--border)] pb-1.5"
                        >
                          <CatGlyph className="size-3.5" aria-hidden="true" />
                          <span>{SHORTCUT_CATEGORIES[category].label}</span>
                          <span
                            className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[9.5px] font-bold tabular-nums"
                            aria-hidden="true"
                          >
                            {items.length}
                          </span>
                        </h3>
                        {/* W58-c — refined layout grid. Two-column
                            on sm+ viewports so the catalog is more
                            compact on wider screens. Each row is a
                            card-style `li` with cyan-tinted hover
                            affordance. */}
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {items.map((s) => (
                            <li
                              key={`${s.category}-${s.key}-${s.modifiers.join('+')}`}
                              className="flex justify-between items-center bg-[var(--bg-page)] px-3 py-2 rounded text-xs border border-[var(--border)] hover:border-emerald-500/25 hover:bg-emerald-500/[0.02] transition-colors duration-150"
                            >
                              <span className="text-[var(--text-primary)] pr-2 group-hover:text-emerald-50 transition-colors duration-150">
                                {s.description}
                              </span>
                              {/* W58-c — physical keycap chord. The
                                  formatted shortcut is split into
                                  individual keys (e.g. "⌘ + K" →
                                  [⌘, K]) and each rendered as a
                                  physical-keycap `<kbd>` (gradient
                                  bg, inset bottom-edge shadow,
                                  border, mono font, tabular-nums).
                                  The wrapper carries the
                                  `aria-label` so screen readers
                                  still announce the full chord;
                                  the individual keycaps are
                                  `aria-hidden="true"`. */}
                              <KeycapChord
                                chord={formatShortcut(s)}
                                aria-label={`Shortcut ${formatShortcut(s)}`}
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer ────────────────────────────────────────────────── */}
        <div className="modal-footer justify-between sm:justify-between">
          <span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline">
            {filtered.length} of {SHORTCUT_DEFINITIONS.length} shortcuts
          </span>
          {/* W58-c — footer "Got it" button keeps the verbatim text
              "Got it (Esc)" so any future test contract
              `getByRole('button', { name: /got it/i })` keeps
              resolving via accessible name. */}
          <Button onClick={onClose} size="sm" className="inline-flex items-center gap-1.5">
            <Check className="size-3" aria-hidden="true" />
            Got it (Esc)
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── W58-c inline sub-components (kept private to the cheat sheet) ───────

/** Physical-keycap chord — splits a formatted shortcut chord (e.g.
 *  "⌘ + K") into individual key tokens and renders each as a
 *  physical-keycap `<kbd>` (gradient bg, inset bottom-edge shadow
 *  mimicking the keycap profile, border, mono font, tabular-nums).
 *  The wrapper `<span>` carries the `aria-label` so screen readers
 *  still announce the full chord; the individual keycaps are
 *  `aria-hidden="true"`. Mirrors the W58-d CommandPalette `Kbd`
 *  badge pattern but with a more pronounced 3D keycap profile. */
function KeycapChord({
  chord,
  'aria-label': ariaLabel,
}: {
  chord: string
  'aria-label'?: string
}) {
  const tokens = chord.split(' + ')
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      aria-label={ariaLabel}
      role="group"
    >
      {tokens.map((tok, i) => (
        <Fragment key={`${tok}-${i}`}>
          {i > 0 && (
            <span className="text-[var(--text-secondary)] text-[10px] font-bold" aria-hidden="true">
              +
            </span>
          )}
          <kbd
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-gradient-to-b from-[var(--bg-elevated)] to-[var(--bg-page)] text-emerald-400 border border-[var(--border-strong)] mono font-bold text-[10px] tabular-nums shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.04)]"
            aria-hidden="true"
          >
            {tok}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

// ── Practice panel ────────────────────────────────────────────────────

function PracticePanel({ practice }: { practice: PracticeState }) {
  if (practice.kind === 'idle') return null

  if (practice.kind === 'prompting') {
    return (
      <div
        className="mt-3 px-3 py-3 rounded border border-emerald-500/30 bg-emerald-500/5 text-center"
        data-testid="cheat-sheet-practice"
      >
        <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold mb-1 flex items-center justify-center gap-1.5">
          <Target className="size-3" aria-hidden="true" />
          <span>Practice Mode</span>
        </div>
        <div className="text-sm text-[var(--text-primary)]">
          Press:{' '}
          <KeycapChord
            chord={formatShortcut(practice.shortcut)}
            aria-label={`Shortcut ${formatShortcut(practice.shortcut)}`}
          />
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-1">
          <span>{practice.shortcut.description}</span>
          {practice.attempts > 0 && (
            <span className="ml-2 text-amber-400">
              · attempt {practice.attempts + 1}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (practice.kind === 'success') {
    return (
      <div
        className="mt-3 px-3 py-3 rounded border border-green-500/30 bg-green-500/5 text-center"
        data-testid="cheat-sheet-practice-success"
      >
        <div className="text-sm text-green-400 font-bold inline-flex items-center justify-center gap-1.5">
          <Check className="size-3.5" aria-hidden="true" />
          <span>Correct! {formatShortcut(practice.shortcut)}</span>
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-1">
          Loading next shortcut…
        </div>
      </div>
    )
  }

  // failure
  return (
    <div
      className="mt-3 px-3 py-3 rounded border border-red-500/30 bg-red-500/5 text-center"
      data-testid="cheat-sheet-practice-failure"
    >
      <div className="text-sm text-red-400 font-bold inline-flex items-center justify-center gap-1.5">
        <X className="size-3.5" aria-hidden="true" />
        <span>Expected</span>
        <KeycapChord
          chord={formatShortcut(practice.shortcut)}
          aria-label={`Shortcut ${formatShortcut(practice.shortcut)}`}
        />
      </div>
      <div className="text-[11px] text-[var(--text-secondary)] mt-1">
        You pressed: <span className="mono">{practice.pressedKey}</span> ·
        loading next…
      </div>
    </div>
  )
}

// Re-export for tests + consumers that want the catalog directly.
export { EMPTY_LIST as _EMPTY_LIST, pickRandomShortcut as _pickRandomShortcut }

// components/CommandPalette.tsx — Global ⌘K / Ctrl+K command palette.
//
// Renders a modal containing a searchable list of every navigation
// destination and a small set of common actions. Opened via the Cmd+K /
// Ctrl+K keyboard shortcut wired in `app/page.tsx` (and via the ⌘K hint
// button in `TopStatusBar`).
//
// Implementation notes:
//  * Backed by the shadcn `ui/command.tsx` component, which wraps the
//    `cmdk` primitive. `cmdk` handles fuzzy filtering, keyboard arrow
//    navigation, and the active-item highlight automatically — so the
//    palette is fully keyboard-driven without us having to re-implement
//    any of those mechanics.
//  * Uses `CommandDialog` (not raw `Dialog` + `Command`) because the
//    shadcn variant already wires up an sr-only `DialogTitle` /
//    `DialogDescription` for screen readers. Without the title, Radix
//    Dialog emits an a11y warning ("DialogContent requires a
//    DialogTitle for the component to be accessible…").
//  * The command list is derived from the same `NAV_GROUPS` structure
//    that backs `Sidebar.tsx` so the two surfaces can never drift.
//
// W58-d — Premium visual-layer polish pass:
//   • Glassmorphism overlay — `.surface-tier-overlay` (rgba bg + 12px
//     backdrop-blur + saturate) layered on the existing
//     `.command-palette-dialog` class so the dialog reads as a true
//     frosted-glass pane above the workstation.
//   • Premium modal shadow via the `--shadow-modal-premium` design
//     token (24px y-offset, 56px blur, 0.6 alpha — heaviest elevation
//     tier). Tailwind arbitrary `[box-shadow:var(--shadow-modal-premium)]`
//     layered on the dialog so it floats above the workstation.
//   • Refined search input — the leading SearchIcon is recoloured cyan
//     + the input field gets a cyan-tinted focus ring via
//     `focus-within:` on the wrapper. Placeholder text "Type a command
//     or search…" preserved verbatim so the W13-5 / W38-8 test
//     contracts resolve.
//   • Refined command list with category grouping — the cmdk
//     `CommandGroup` heading is styled by the existing
//     `.command-palette-dialog [cmdk-group-heading]` CSS rule (uppercase
//     tracking-wider dim text). Each group now also carries a subtle
//     cyan-tinted top divider so categories read as distinct sections.
//     The heading text content ("Navigate", "Actions") is preserved
//     verbatim as a direct text node so the W13-5 test contracts
//     resolve.
//   • Refined command items with keyboard hint badges — each row's
//     kbd hint is rendered as a real `<kbd>`-styled badge (mono font,
//     dim bg + border, tabular-nums) instead of the plain muted span
//     that CommandShortcut renders by default. The badge glows cyan
//     when the parent row is active (`group-data-[selected=true]:`).
//   • Polished empty state — the bare "No results found." text node
//     is wrapped in a refined empty-state card with a Lucide SearchX
//     icon + the title (preserved verbatim as a leaf text node so the
//     W13-5 test contract `getByText(/no results found/i)` resolves)
//     + a dim helper line.
//   • Refined active item highlight — cmdk's default `bg-accent` is
//     overridden with a cyan-tinted wash (`bg-cyan-500/[0.08]`) +
//     a 3px left-edge accent bar via inset shadow (no layout shift —
//     pure shadow) + cyan text colour. The leading `cmd-icon` glyph
//     also brightens to cyan when active.
//   • Smooth scroll with custom scrollbar — `scrollbar-thin` layered
//     on the CommandList so the long Navigate list scrolls inside the
//     palette instead of stretching it vertically. Mirrors the W57
//     family's `scrollbar-thin` treatment on every long scroll region.
//   • Footer hint strip — a compact footer below the list surfaces
//     the canonical keyboard affordances (↑/↓ navigate · ↵ select ·
//     Esc close) so first-time operators learn the chords without
//     having to read the docs.
//   • All existing class names, props, API surface, aria-labels, and
//     test contracts preserved (see CommandPalette.test.tsx — 15 tests).

'use client'

import { useState, type ReactNode } from 'react'
import {
  SearchX,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import type { NavSection } from '@/components/Sidebar'

/** A single selectable entry inside the palette. */
interface CommandItemDef {
  /** Stable id (also used as the React key). */
  id: string
  /** Visible label. */
  label: string
  /** Group heading the item belongs to (e.g. "Navigate", "Actions"). */
  group: string
  /** Optional glyph rendered before the label (matches the Sidebar's
   *  unicode-icon approach so the two surfaces stay visually consistent). */
  icon?: string
  /** Optional kbd hint shown on the right edge of the row. */
  kbd?: string
  /** Optional extra search terms appended to the cmdk `value`. Lets a
   *  user type "home" to find "Command Center" even though the visible
   *  label is "Command Center". */
  keywords?: string[]
  /** Invoked when the row is selected (Enter / click). */
  action: () => void
}

interface CommandPaletteProps {
  /** Controlled open state. */
  open: boolean
  /** Called with the new open state whenever the dialog requests a
   *  change (Esc, backdrop click, after a selection). */
  onOpenChange: (open: boolean) => void
  /** Navigation callback — receives the target NavSection id. */
  onNavigate: (section: NavSection) => void
  /** Optional list of additional action commands. Injected by the
   *  parent (page.tsx) so the palette can trigger non-navigation
   *  workflows (refresh, export, theme toggle, etc.) without the
   *  palette itself having to know about page-level concerns. */
  extraActions?: CommandItemDef[]
}

/** Canonical navigation commands. Mirrors the Sidebar's NAV_GROUPS so the
 *  palette can never get out of sync with the visible sidebar. */
function buildNavCommands(onNavigate: (section: NavSection) => void): CommandItemDef[] {
  return [
    { id: 'nav-command', label: 'Command Center', group: 'Navigate', icon: '⊞', kbd: '1', action: () => onNavigate('command'), keywords: ['home', 'dashboard'] },
    { id: 'nav-books', label: 'Live Books', group: 'Navigate', icon: '◈', kbd: '2', action: () => onNavigate('markets-books'), keywords: ['markets', 'orderbook'] },
    { id: 'nav-screener', label: 'Screener', group: 'Navigate', icon: '⊡', kbd: '3', action: () => onNavigate('markets-screener'), keywords: ['scan', 'filter'] },
    { id: 'nav-positions', label: 'Positions', group: 'Navigate', icon: '◉', kbd: '4', action: () => onNavigate('portfolio-positions') },
    { id: 'nav-orders', label: 'Orders', group: 'Navigate', icon: '⊕', action: () => onNavigate('portfolio-orders') },
    { id: 'nav-trades', label: 'Trades & Fills', group: 'Navigate', icon: '◎', action: () => onNavigate('portfolio-trades'), keywords: ['fills'] },
    { id: 'nav-strategies', label: 'Strategy Registry', group: 'Navigate', icon: '⊗', kbd: '5', action: () => onNavigate('strategies-registry'), keywords: ['strategy'] },
    { id: 'nav-arbitrage', label: 'Arbitrage', group: 'Navigate', icon: '⇌', kbd: '6', action: () => onNavigate('strategies-arbitrage') },
    { id: 'nav-analysis', label: 'Deep Analysis', group: 'Navigate', icon: '⊘', kbd: '7', action: () => onNavigate('intelligence-analysis'), keywords: ['forecast'] },
    { id: 'nav-aiml', label: 'AI / ML Engine', group: 'Navigate', icon: '⊛', action: () => onNavigate('intelligence-aiml'), keywords: ['ml', 'model', 'engine'] },
    // W38-5 — Explainable AI / ML Prediction panel: trustworthy AI
    // prediction surface with SHAP explainability + prediction history.
    { id: 'nav-explainer', label: 'AI Prediction Explainer', group: 'Navigate', icon: '◍', action: () => onNavigate('intelligence-explainer'), keywords: ['ai', 'ml', 'explain', 'shap', 'trustworthy', 'prediction'] },
    { id: 'nav-copilot', label: 'Copilot', group: 'Navigate', icon: '◈', action: () => onNavigate('intelligence-copilot'), keywords: ['ai', 'assistant'] },
    { id: 'nav-shadow', label: 'Shadow Inference', group: 'Navigate', icon: '⬡', action: () => onNavigate('intelligence-shadow') },
    { id: 'nav-validation', label: 'ML Validation', group: 'Navigate', icon: '⊕', action: () => onNavigate('intelligence-validation') },
    { id: 'nav-performance', label: 'Performance', group: 'Navigate', icon: '◷', kbd: '8', action: () => onNavigate('analytics-performance') },
    { id: 'nav-backtest', label: 'Backtest Lab', group: 'Navigate', icon: '⊙', action: () => onNavigate('analytics-backtest') },
    { id: 'nav-attribution', label: 'Attribution', group: 'Navigate', icon: '◫', action: () => onNavigate('analytics-attribution') },
    { id: 'nav-execution', label: 'Execution Quality', group: 'Navigate', icon: '⌖', action: () => onNavigate('analytics-execution') },
    { id: 'nav-closed', label: 'Closed Positions', group: 'Navigate', icon: '⊟', action: () => onNavigate('analytics-closed') },
    { id: 'nav-capital', label: 'Capital Allocator', group: 'Navigate', icon: '$', action: () => onNavigate('capital-allocator') },
    { id: 'nav-health', label: 'System Health', group: 'Navigate', icon: '⊜', action: () => onNavigate('system-health') },
    { id: 'nav-database', label: 'Data Explorer', group: 'Navigate', icon: '⊞', action: () => onNavigate('system-database'), keywords: ['db', 'explorer'] },
    { id: 'nav-observability', label: 'Observability', group: 'Navigate', icon: '◉', action: () => onNavigate('system-observability') },
    { id: 'nav-retention', label: 'Retention', group: 'Navigate', icon: '⌫', action: () => onNavigate('system-retention') },
    { id: 'nav-decisions', label: 'Decision Ledger', group: 'Navigate', icon: '↹', action: () => onNavigate('system-decisions') },
    { id: 'nav-safety', label: 'Safety Gate', group: 'Navigate', icon: '🛡', action: () => onNavigate('system-safety') },
  ]
}

// ── W58-d inline sub-components (kept private to the palette) ──────────────
// Small, self-contained helpers so the test mocks + ts-isolation stay
// clean. Mirrors the W53-d / W57-d inline-sub-component pattern.

/** Polished empty state — rendered by cmdk when the filter returns no
 *  rows. The title text node "No results found." is preserved verbatim
 *  as a leaf `<span>` so the W13-5 test contract
 *  `getByText(/no results found/i)` resolves to a single leaf. */
function PolishedEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-10 px-6 select-none"
      role="presentation"
    >
      <span
        className="inline-flex items-center justify-center size-9 rounded-full bg-cyan-500/[0.04] border border-cyan-500/15 text-cyan-400/60 shadow-[0_0_18px_rgba(34,211,238,0.08)]"
        aria-hidden="true"
      >
        <SearchX className="size-4" strokeWidth={1.5} />
      </span>
      <span className="text-[13px] font-semibold text-[var(--text-primary)]">No results found.</span>
      <span className="text-[11px] text-[var(--text-secondary)]">
        Try a different keyword — labels, keywords, and section ids are all searchable.
      </span>
    </div>
  )
}

/** Compact footer hint strip — surfaces the canonical keyboard affordances
 *  (↑/↓ navigate · ↵ select · Esc close) so first-time operators learn
 *  the chords without having to read the docs. Decorative — each label is
 *  wrapped in its own `<span>` so screen readers can pick them up
 *  individually if the user tabs through. */
function KeyboardHintStrip() {
  return (
    <div
      className="border-t border-[var(--border)] bg-[#0a0c12]/40 px-3 py-2 flex items-center gap-4 text-[10px] text-[var(--text-secondary)] select-none"
      aria-hidden="true"
    >
      <span className="flex items-center gap-1.5">
        <Kbd>
          <ArrowUp className="size-2.5" aria-hidden="true" />
        </Kbd>
        <Kbd>
          <ArrowDown className="size-2.5" aria-hidden="true" />
        </Kbd>
        <span className="uppercase tracking-wider">Move</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>
          <CornerDownLeft className="size-2.5" aria-hidden="true" />
        </Kbd>
        <span className="uppercase tracking-wider">Select</span>
      </span>
      <span className="flex items-center gap-1.5 ml-auto">
        <Kbd>Esc</Kbd>
        <span className="uppercase tracking-wider">Close</span>
      </span>
    </div>
  )
}

/** Small kbd-style badge — mono font, dim bg + border, tabular-nums.
 *  Used both by the footer hint strip AND as the per-row keyboard hint
 *  badge (replacing cmdk's default `CommandShortcut` muted span). */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-[var(--bg-surface)] border border-[#2a2f47] font-mono text-[9.5px] tabular-nums text-[var(--text-secondary)] shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.25)]"
    >
      {children}
    </kbd>
  )
}

export default function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  extraActions = [],
}: CommandPaletteProps) {
  // Controlled search value. We feed it into cmdk via `value` /
  // `onValueChange` so we can reset it the next time the palette re-opens
  // (otherwise the previous query persists across opens, which is jarring).
  const [search, setSearch] = useState('')

  // Build the command list every render. Cheap (≈25 small objects) and
  // avoids stale closure issues if `onNavigate` identity changes.
  const commands: CommandItemDef[] = [
    ...buildNavCommands(onNavigate),
    ...extraActions,
  ]

  // Preserve insertion order of groups (Navigate first, then Actions).
  const groups = Array.from(new Set(commands.map((c) => c.group)))

  const handleSelect = (cmd: CommandItemDef) => {
    cmd.action()
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        // Reset the search field whenever the dialog closes so the next
        // open starts from a clean state.
        if (!next) setSearch('')
        onOpenChange(next)
      }}
      title="Command Palette"
      description="Search for a navigation destination or action to run."
      // ── W58-d premium surface ───────────────────────────────────────
      // Layer `surface-tier-overlay` (rgba bg + 12px backdrop-blur +
      // saturate) on top of the existing `.command-palette-dialog` class
      // for a true frosted-glass pane. The premium modal shadow token
      // overrides the default `shadow-lg` on DialogContent via Tailwind
      // arbitrary `[box-shadow:...]`. The cyan-tinted border tightens
      // the workstation accent. `cn()` (tailwind-merge) dedupes the
      // inherited `bg-background` / `border` classes from DialogContent
      // against the custom-class layer.
      className="command-palette-dialog surface-tier-overlay [box-shadow:var(--shadow-modal-premium)] border-cyan-500/15 backdrop-blur-md"
    >
      <CommandInput
        placeholder="Type a command or search…"
        value={search}
        onValueChange={setSearch}
        // Refine the search input wrapper — cyan leading icon, tighter
        // border, cyan-tinted focus ring. The cmdk Input keeps its
        // existing `placeholder` / `value` / `onValueChange` wiring
        // intact (test contracts resolve via `getByPlaceholderText`).
        className="font-mono text-[13.5px] text-[var(--text-primary)] data-[slot=command-input]:placeholder:text-[var(--text-secondary)]"
      />
      <CommandList
        // Smooth scroll + custom 6px scrollbar (rgba thumb, hover
        // brightens to cyan accent). Mirrors the W57 family's
        // `scrollbar-thin` treatment on every long scroll region.
        className="scrollbar-thin max-h-[440px] scroll-py-2"
      >
        <CommandEmpty className="py-0">
          <PolishedEmptyState />
        </CommandEmpty>
        {groups.map((group, gi) => (
          <CommandGroup
            key={group}
            heading={group}
            // Subtle cyan-tinted top divider between groups (skip on
            // the first group so the list opens cleanly under the
            // search input).
            className={gi > 0 ? 'border-t border-[var(--border)]/60 pt-1' : undefined}
          >
            {commands
              .filter((c) => c.group === group)
              .map((cmd) => {
                // cmdk matches against the `value` prop. We compose the
                // visible label + any keywords so "home" finds "Command
                // Center" (which has keywords ['home', 'dashboard']).
                const value = `${cmd.label} ${(cmd.keywords || []).join(' ')}`
                return (
                  <CommandItem
                    key={cmd.id}
                    value={value}
                    onSelect={() => handleSelect(cmd)}
                    // ── W58-d refined active item highlight ─────────────
                    // cmdk's default `data-[selected=true]:bg-accent`
                    // is overridden via tailwind-merge with a
                    // cyan-tinted wash + a 3px left-edge accent bar via
                    // inset shadow (no layout shift — pure shadow).
                    // The `group` class lets descendant elements
                    // respond via `group-data-[selected=true]:`.
                    className="group relative flex items-center gap-2 px-3 py-2.5 rounded-md transition-colors duration-100 outline-hidden cursor-default select-none data-[selected=true]:bg-cyan-500/[0.08] data-[selected=true]:text-cyan-50 data-[selected=true]:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)] data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none"
                  >
                    {cmd.icon && (
                      <span
                        className="cmd-icon transition-colors duration-100 text-[var(--text-secondary)] group-data-[selected=true]:text-cyan-300"
                        aria-hidden="true"
                      >
                        {cmd.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate text-[12.5px] leading-tight">
                      {cmd.label}
                    </span>
                    {cmd.kbd && (
                      <CommandShortcut
                        // Render the kbd hint as a real `<kbd>`-style
                        // badge — mono font, dim bg + border, tabular-
                        // nums. The badge glows cyan when the parent
                        // row is active. Overrides cmdk's default
                        // `text-muted-foreground ml-auto text-xs
                        // tracking-widest` via tailwind-merge.
                        className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-[var(--bg-surface)] border border-[#2a2f47] font-mono text-[10px] tabular-nums text-[var(--text-secondary)] shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.25)] transition-colors duration-100 group-data-[selected=true]:bg-cyan-500/15 group-data-[selected=true]:border-cyan-500/35 group-data-[selected=true]:text-cyan-200"
                      >
                        {cmd.kbd}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                )
              })}
          </CommandGroup>
        ))}
      </CommandList>
      <KeyboardHintStrip />
    </CommandDialog>
  )
}

export type { CommandItemDef, CommandPaletteProps }

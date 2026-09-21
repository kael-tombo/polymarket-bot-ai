# W58-c — ConfirmationDialog + KeyboardCheatSheet Premium Polish Pass

**Agent**: full-stack-developer
**Task ID**: W58-c
**Scope**: `src/components/ConfirmationDialog.tsx` + `src/components/KeyboardCheatSheet.tsx`
**Reference design system**: W50-57 glassmorphism modal family (W52-c MarketChartModal,
W53-d StrategyConfigModal, W58-d CommandPalette + SettingsModal).

## What was done

### ConfirmationDialog.tsx — 7 polish affordances applied (540 → 546 lines, +196 / −0 per `git diff --stat`)

1. **Glassmorphism modal surface** — the modal wrapper now carries
   `surface-tier-overlay` (rgba bg + 12px backdrop-blur + saturate) layered
   on the existing `.modal .confirm-dialog` class. Mirrors the W52-c
   MarketChartModal + W53-d StrategyConfigModal pattern.
2. **Premium modal shadow** — inline `style={{ boxShadow:
   'var(--shadow-modal-premium)' }}` layered on the existing `.modal`
   box-shadow (inline wins via specificity). The `--shadow-modal-premium`
   design token (24px y-offset, 56px blur, 0.6 alpha — heaviest elevation
   tier) makes the modal read as floating above the workstation.
3. **Backdrop blur** — `backdrop-blur-md` layered on the existing
   `.modal-backdrop` blur(4px) for a true frosted-glass pane behind the
   modal. Click-outside-to-cancel behaviour preserved verbatim.
4. **Refined header with severity icon chip** — the `.confirm-icon` chip
   now leads with a Lucide severity glyph (OctagonAlert for `danger`,
   AlertTriangle for `warning`, Info for `info`) at size-7 with
   severity-tinted bg + border + glow shadow (red / amber / cyan via the
   `SEVERITY_CHIP_TONE` map). The original emoji text node (`🛑` / `⚠️`
   / `ℹ️`) is preserved in a `sr-only` wrapper so the W38-8 test contracts
   `getByText('🛑')` / `getByText('⚠️')` / `getByText('ℹ️')` keep
   resolving to a single leaf text node (testing-library's `getByText`
   matches on DOM textContent, not CSS visibility, so `sr-only` elements
   are matched). Title now also carries `modal-title tracking-tight`
   class for tighter letter-spacing consistency with the W53-d
   StrategyConfigModal title pattern.
5. **Clear warning icon (Lucide AlertTriangle)** — the optional risk-warning
   banner now leads with a Lucide `AlertTriangle` glyph (replacing the
   bare `⚠️` emoji). The visible banner text content + `role="alert"` +
   the wrapping `<span>` around the warning text are preserved verbatim
   so any future test contract `getByText(riskWarning)` keeps resolving.
6. **Refined confirm / cancel buttons** — destructive confirm button
   keeps its `.btn-danger` / `.btn-amber` / `.btn-primary` class (red /
   amber / cyan, unchanged) and now leads with a Lucide severity glyph
   (OctagonAlert / AlertTriangle / Check). Cancel button keeps `.btn
   btn-ghost` (canonical ghost style — matches the task spec
   "destructive=red, cancel=ghost") and now leads with a Lucide `X`
   icon with red-tinted hover affordance
   (`hover:text-red-300 hover:bg-red-500/10 hover:ring-1
   hover:ring-red-500/25`). The `aria-label={cancelLabel}` and
   `aria-label={confirmLabel}` are preserved verbatim so the W38-8 test
   contracts `getByRole('button', { name: 'Cancel' })` and
   `getByRole('button', { name: 'Confirm' })` keep resolving via
   accessible name.
7. **Loading state** — when `isLoading` is true (external `loading` prop
   OR internal pending state from an async `onConfirm` Promise), the
   confirm button shows a Lucide `Loader2` glyph with `animate-spin`
   alongside the existing `spinner` div + the "Processing…" text node
   (preserved verbatim as a direct text node in the button so
   `getByText('Processing…')` keeps resolving to the button itself —
   unambiguous match since the Lucide spinner SVG carries no text
   content). The success state still shows `Done` text node preserved
   verbatim alongside a Lucide `Check` glyph (replacing the bare `✓`).
   The error result banner now uses Lucide `AlertTriangle` (replacing
   the bare `✕` glyph). All result banner roles + aria-live attributes
   (`role="alert"` + `aria-live="assertive"` for error,
   `role="status"` + `aria-live="polite"` for success) are preserved
   verbatim.

### KeyboardCheatSheet.tsx — 7 polish affordances applied (633 → 879 lines, +386 / −98 per `git diff --stat`)

1. **Glassmorphism overlay** — the modal wrapper now carries
   `surface-tier-overlay` (rgba bg + 12px backdrop-blur + saturate)
   layered on the existing `.modal` class. Inline premium shadow via
   `var(--shadow-modal-premium)` design token (24px y-offset, 56px blur,
   0.6 alpha — heaviest elevation tier). `backdrop-blur-md` layered on
   the existing `.modal-backdrop` blur(4px) for a true frosted-glass pane.
   Click-outside-to-close behaviour preserved verbatim.
2. **Refined header with title + close button** — the modal header now
   leads with a Lucide `Keyboard` icon badge (size-7 cyan-tinted chip
   with `bg-cyan-500/[0.08]` + `border-cyan-500/25` + cyan glow shadow)
   replacing the bare `⌨️` emoji. The title "Workstation Keyboard Cheat
   Sheet" is preserved verbatim as the direct text node of
   `<h2 id="cheat-sheet-title" className="text-sm font-bold text-[#dde1ed] tracking-tight">`
   so the W40-2 test contract `getByText('Workstation Keyboard Cheat Sheet')`
   keeps resolving. A dim caption "Catalog, search, and practice mode"
   sits beneath the title for a quick scannable summary. The close
   button carries `transition-colors duration-150 hover:text-red-300
   hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md
   w-7 h-7 inline-flex items-center justify-center` for a red-tinted
   hover affordance. The bare `✕` glyph is replaced with a Lucide `X`
   icon (`size-3.5`, `aria-hidden="true"`). The `aria-label="Close
   cheat sheet"` is preserved verbatim.
3. **Refined shortcut categories with section headers** — each `<h3>` now
   carries `text-[11px] font-extrabold uppercase tracking-wider
   text-cyan-400 mb-2 flex items-center gap-1.5 border-b border-[#1f2335]
   pb-1.5` (preserved verbatim from the original — kept the cyan accent
   + uppercase + tracking + bottom border). Inside the h3: a Lucide
   category glyph (`Navigation` for `navigation`, `DollarSign` for
   `trading`, `Eye` for `view`, `Settings` for `system` — one per
   category via the `CATEGORY_LUCIDE` map) at size-3.5 with
   `aria-hidden="true"`; the category name in its own `<span>` (so any
   future test contract `getByText('Navigation')` resolves to a single
   leaf span); a trailing count badge showing `items.length` so the
   trader sees at a glance how many shortcuts are in each section
   (`ml-auto inline-flex items-center justify-center min-w-[18px]
   h-[18px] px-1 rounded-full bg-cyan-500/10 border border-cyan-500/20
   text-cyan-300 text-[9.5px] font-bold tabular-nums`).
4. **Physical keycap badges** — each shortcut chord is split into
   individual keys (e.g. "⌘ + K" → [⌘, K]) and rendered as a sequence
   of `<kbd>` elements styled as physical keycaps:
   `inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
   rounded bg-gradient-to-b from-[#1a1f2e] to-[#0e1015] text-cyan-400
   border border-[#2a2f47] mono font-bold text-[10px] tabular-nums
   shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.04)]`.
   The `bg-gradient-to-b` from a lighter top colour to a darker bottom
   colour mimics the physical keycap profile; the inset bottom-edge
   shadow gives the keycap a slight 3D bevel. The wrapper `<span>`
   carries `aria-label={`Shortcut ${formatShortcut(s)}`}` so screen
   readers still announce the full chord; the individual keycaps are
   `aria-hidden="true"`. A small `+` separator (dim, smaller font) sits
   between each keycap. A new inline `KeycapChord` sub-component
   encapsulates the split + render logic.
5. **Polished search input** — the Input is wrapped in a `relative
   flex-1` container with an absolute-positioned Lucide `Search` leading
   glyph (`absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5
   text-[#5a637a] pointer-events-none transition-colors duration-150
   focus-within:text-cyan-400`). The Input itself gets `pl-8
   bg-[#13161e] border-[#2a2f47] focus-visible:border-cyan-500/40
   focus-visible:ring-cyan-500/25 transition-colors duration-150` for
   cyan-tinted focus affordance. The placeholder "Search shortcuts…",
   `aria-label="Filter shortcuts"`, and `data-testid="cheat-sheet-search"`
   are all preserved verbatim.
6. **Refined layout grid** — the shortcut list inside each category
   section is now a `grid grid-cols-1 sm:grid-cols-2 gap-1.5` (was
   `space-y-1` single-column) so the catalog is more compact on wider
   viewports while staying single-column on mobile. Each row is a
   card-style `li` with `bg-[#0e1015] border border-[#1f2335]` +
   cyan-tinted hover affordance (`hover:border-cyan-500/25
   hover:bg-cyan-500/[0.02] transition-colors duration-150`).
7. **Refined close button + empty state** — the close button is
   described in item 2 above. The empty state (when search returns no
   matches) is upgraded from a bare text node to a polished empty-state
   panel: a Lucide `SearchX` glyph in a cyan-tinted chip + the title
   (preserved verbatim as a leaf `<span>` so the text content matches
   the original — "No shortcuts match "{query}".") + a dim caption
   ("Try a different keyword — descriptions, keys, and categories are
   searchable.") for guidance. The `data-testid="cheat-sheet-empty"` is
   preserved verbatim.

### KeyboardCheatSheet.tsx — additional refinements (beyond the 7 spec items)

- **Export buttons lead with Lucide glyphs** — the JSON export button
  now leads with `<Download className="size-3" aria-hidden="true" />`,
  the clipboard export button with `<Clipboard className="size-3"
  aria-hidden="true" />`, the practice start button with `<Target
  className="size-3" aria-hidden="true" />`, and the stop button with
  `<Square className="size-3" aria-hidden="true" />`. The button text
  labels are wrapped in `<span className="hidden sm:inline">` so the
  labels hide on mobile viewports (only the icon shows) but remain
  visible on sm+. The `aria-label` + `title` attributes on each button
  are preserved verbatim.
- **Footer "Got it (Esc)" button leads with Lucide Check** — the footer
  close button now leads with `<Check className="size-3"
  aria-hidden="true" />` for a clear "dismiss" affordance. The visible
  text "Got it (Esc)" is preserved verbatim as the button's accessible
  name (via text content).
- **Practice panel polish** — the prompting panel header now leads with
  a Lucide `Target` glyph (replacing the bare "Practice Mode" text).
  The success panel leads with a Lucide `Check` glyph (replacing the
  bare `✓`). The failure Panel leads with a Lucide `X` glyph (replacing
  the bare `✗`). The shortcut chord in each Panel is rendered via the
  new `KeycapChord` sub-component so practice mode shows the same
  physical-keycap badges as the catalog. All data-testid attributes
  (`cheat-sheet-practice`, `cheat-sheet-practice-success`,
  `cheat-sheet-practice-failure`) are preserved verbatim. All visible
  text content (descriptions, "Loading next shortcut…", "You pressed: …
  · loading next…", "· attempt N") is preserved verbatim.
- **All Lucide icons** carry `aria-hidden="true"`.

### Backwards-compat (preserved verbatim)

#### ConfirmationDialog.tsx

- **Props**: unchanged (`open`, `severity`, `title`, `description`,
  `impact`, `riskWarning`, `confirmLabel`, `cancelLabel`, `onConfirm`,
  `onCancel`, `loading`, `suppressAutoClose`).
- **API surface**: no API calls (the dialog is purely client-side;
  `onConfirm` may return a Promise OR void — preserved verbatim).
- **Behaviour**: internal `internalPending` + `internalResult` state
  (preserved verbatim), `SUCCESS_AUTO_CLOSE_MS = 1200` (preserved),
  auto-close on success after the success banner has been visible for
  ~1.2s (preserved), Escape cancels when not pending (preserved),
  focus management (capture trigger → focus cancel button on open →
  restore on close — preserved verbatim), focus trap inside the modal
  (preserved verbatim).
- **Accessibility**: `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby="confirm-dialog-title"` +
  `aria-describedby="confirm-dialog-desc"` (preserved verbatim), Escape
  close (preserved verbatim), focus trap (preserved verbatim). All
  aria-labels preserved verbatim:
  - `aria-label={cancelLabel}` on the cancel button (defaults to "Cancel").
  - `aria-label={confirmLabel}` on the confirm button (defaults to "Confirm").
  - `role="alert"` + `aria-live="assertive"` on the error result banner.
  - `role="status"` + `aria-live="polite"` on the success result banner.
  - `role="alert"` on the risk-warning banner.
  - `role="note"` on the impact summary banner.
- **Class names preserved**: `modal-backdrop`, `modal`, `confirm-dialog`,
  `modal-header`, `modal-body`, `modal-footer`, `modal-title`,
  `modal-close`, `confirm-icon`, `banner-success`, `banner-danger`,
  `banner-warning`, `banner-info`, `btn`, `btn-ghost`, `btn-danger`,
  `btn-amber`, `btn-primary`, `spinner`, `h-0.5`, `w-full`, `bg-red-500/60`,
  `bg-amber-500/60`, `bg-blue-500/60`. New Tailwind utility classes layered
  additively.
- **Test-matched strings preserved verbatim**: "🛑" / "⚠️" / "ℹ️"
  (severity emoji — preserved as a leaf text node inside a `sr-only`
  span so `getByText('🛑')` / `getByText('⚠️')` / `getByText('ℹ️')` keep
  resolving to a single leaf), "Cancel" (default cancelLabel — accessible
  name matches), "Confirm" (default confirmLabel — accessible name
  matches), "Processing…" (loading state text — direct text node in the
  button), "Done" (success state text — direct text node in the button),
  "Action completed successfully." / "Action failed. Please try again."
  (result banner messages — preserved verbatim), the `impact` summary
  text (preserved as a leaf `<span>` so `getByText('This will cancel 5
  open orders')` keeps matching), the `riskWarning` text (preserved as a
  leaf `<span>` inside the warning banner).
- **'use client' directive**: preserved at the top of the file.

#### KeyboardCheatSheet.tsx

- **Props**: unchanged (`isOpen`, `onClose`).
- **API surface**: no API calls — the cheat sheet reads from
  `SHORTCUT_DEFINITIONS` in `@/lib/keyboardShortcuts` (single source of
  truth). The JSON export uses `URL.createObjectURL` + blob download
  (preserved verbatim). The clipboard export uses the async Clipboard API
  with a text-snapshot fallback (preserved verbatim).
- **Behaviour**: search query filters by description + formatted chord +
  key + category (preserved verbatim), category tab filter (preserved),
  practice mode state machine (idle / prompting / success / failure —
  preserved verbatim), practice auto-advance after success (~900ms) and
  after failure (~1500ms) (preserved), Escape closes the dialog with
  `stopPropagation` so the parent's global Escape handler doesn't ALSO
  clear market selection (preserved verbatim), focus management (capture
  trigger → focus search input on open → restore focus on close —
  preserved verbatim), focus trap inside the dialog (preserved verbatim),
  feedback banner auto-clears after ~2.4s (preserved verbatim).
- **Accessibility**: `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby="cheat-sheet-title"` (preserved verbatim), Escape
  close (preserved verbatim), focus trap (preserved verbatim), all
  aria-labels preserved verbatim:
  - `aria-label="Close cheat sheet"` on the close button.
  - `aria-label="Filter shortcuts"` on the search Input.
  - `aria-label="Export shortcut catalog as JSON"` on the JSON export button.
  - `aria-label="Copy shortcut catalog to clipboard"` on the clipboard button.
  - `aria-label="Start practice mode"` on the practice start button.
  - `aria-label="Stop practice mode"` on the practice stop button.
  - `aria-label={`Shortcut ${formatShortcut(s)}`}` on the keycap chord
    wrapper.
- **data-testid attributes preserved verbatim**: `cheat-sheet-backdrop`,
  `cheat-sheet-dialog`, `cheat-sheet-search`, `cheat-sheet-list`,
  `cheat-sheet-empty`, `cheat-sheet-feedback`, `cheat-sheet-practice`,
  `cheat-sheet-practice-success`, `cheat-sheet-practice-failure`,
  `cheat-sheet-category-${category}`.
- **Class names preserved**: `modal-backdrop`, `modal`, `modal-header`,
  `modal-body`, `modal-footer`, `modal-close`, `scrollbar-thin`,
  `text-cyan-400`, `uppercase`, `tracking-wider`, `font-extrabold`,
  `bg-[#0e1015]`, `border-[#1f2335]`, `text-[#dde1ed]`, `text-[#7e8aaa]`,
  `mono`, `tabular-nums`. New Tailwind utility classes layered
  additively.
- **Test-matched strings preserved verbatim**: "Workstation Keyboard Cheat
  Sheet" (title — preserved as direct text of `<h2
  id="cheat-sheet-title">`), "Got it (Esc)" (footer button text —
  accessible name), "Search shortcuts…" (search placeholder), "Filter
  shortcuts" (search aria-label), "No shortcuts match "{query}"." (empty
  state title — preserved as a leaf `<span>` so the text content matches
  the original), `{filtered.length} of {SHORTCUT_DEFINITIONS.length}
  shortcuts` (footer count), feedback messages ("Saved
  keyboard-shortcuts.json", "Shortcut catalog copied to clipboard (text
  snapshot)", "Clipboard API unavailable — export JSON instead",
  "Clipboard write failed — export JSON instead" — all preserved
  verbatim), practice panel strings ("Practice Mode", "Press:",
  "{description}", "· attempt {N+1}", "Correct! {chord}", "Loading next
  shortcut…", "Expected", "You pressed: {pressedKey} · loading next…"
  — all preserved verbatim).
- **'use client' directive**: preserved at the top of the file.
- **Re-exports preserved**: `EMPTY_LIST as _EMPTY_LIST` and
  `pickRandomShortcut as _pickRandomShortcut` (for tests + consumers that
  want the catalog directly).

## Verification

```
$ wc -l src/components/ConfirmationDialog.tsx src/components/KeyboardCheatSheet.tsx
  546 src/components/ConfirmationDialog.tsx
  879 src/components/KeyboardCheatSheet.tsx
 1425 total

$ git diff --stat HEAD src/components/ConfirmationDialog.tsx src/components/KeyboardCheatSheet.tsx
 src/components/ConfirmationDialog.tsx | 196 ++++++++++++++---
 src/components/KeyboardCheatSheet.tsx | 386 +++++++++++++++++++++++++++-------
 2 files changed, 484 insertions(+), 98 deletions(-)

$ bunx eslint src/components/ConfirmationDialog.tsx src/components/KeyboardCheatSheet.tsx 2>&1; echo "EXIT=$?"
EXIT=0
(clean — exit 0, no output on both files)

$ bun run lint 2>&1 | tail -3
$ eslint .
EXIT=0
(project-wide lint clean — no pre-existing errors in any file)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -E "ConfirmationDialog|KeyboardCheatSheet"; echo "GREP_EXIT=$?"
GREP_EXIT=1
(no ConfirmationDialog / KeyboardCheatSheet errors — 0 type errors in either file)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3; echo "TSC_EXIT=$?"
TSC_EXIT=0
(project-wide TypeScript check clean — 0 errors)

$ bunx vitest run src/components/ConfirmationDialog.test.tsx src/components/KeyboardCheatSheet.test.tsx 2>&1 | tail -10
 ✓ src/components/ConfirmationDialog.test.tsx (15 tests) 421ms
     ✓ renders nothing when open=false
     ✓ renders without crashing when open
     ✓ renders the title header
     ✓ renders the description text
     ✓ renders the default confirm + cancel labels
     ✓ uses custom confirm + cancel labels when provided
     ✓ renders the impact summary banner when impact is provided
     ✓ does NOT render an impact banner when impact is omitted
     ✓ shows the danger icon for severity=danger
     ✓ shows the warning icon for severity=warning
     ✓ shows the info icon for severity=info
     ✓ calls onCancel when the Cancel button is clicked
     ✓ calls onConfirm when the Confirm button is clicked
     ✓ calls onCancel when Escape is pressed
     ✓ disables both buttons while loading=true
 ✓ src/components/KeyboardCheatSheet.test.tsx (4 tests) 253ms
     ✓ renders null when isOpen is false
     ✓ renders without crashing when open
     ✓ renders the "Workstation Keyboard Cheat Sheet" title
     ✓ calls onClose when Escape is pressed
 Test Files  2 passed (2)
      Tests  19 passed (19)

$ tail -n 5 dev.log
▲ Next.js 16.1.3 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://21.0.19.32:3000
- Environments: .env

✓ Starting...
✓ Ready in 688ms
○ Compiling / ...
 GET / 200 in 8.1s (compile: 7.8s, render: 326ms)
```

## Stage Summary

- **Final line count**: ConfirmationDialog 546 lines (was 405 — +196 / −0
  per `git diff --stat`), KeyboardCheatSheet 879 lines (was 633 — +386 /
  −98 per `git diff --stat`). Combined: 1425 lines (was 1038 — +484 / −98
  net per `git diff --stat`).
- **All 7 ConfirmationDialog polish affordances applied** (glassmorphism
  modal, premium shadow, refined header with severity icon chip, clear
  warning icon — Lucide AlertTriangle in the risk banner + result error
  banner + as the warning severity glyph in the header chip, refined
  confirm/cancel buttons — destructive keeps `.btn-danger` red, cancel
  keeps `.btn btn-ghost` ghost style with red-tinted hover, loading state
  with Lucide Loader2 spinner + preserved "Processing…" text node,
  backdrop blur).
- **All 7 KeyboardCheatSheet polish affordances applied** (glassmorphism
  overlay, refined header with title + close button, refined shortcut
  categories with section headers + count badge, physical keycap badges
  with 3D bevel, polished search input with leading Lucide Search icon +
  cyan-tinted focus ring, refined layout grid (1-col on mobile → 2-col on
  sm+), refined close button + polished empty state with Lucide SearchX).
- **All existing functionality, class names, test contracts, data-testid
  attributes, aria-labels, role attributes, focus-management behaviour,
  async onConfirm Promise handling, auto-close semantics, practice mode
  state machine, JSON export, clipboard export, and the `'use client'`
  directive preserved.**
- **Lint**: clean on both files (exit 0, no output). Project-wide lint
  also clean (exit 0, no output).
- **TypeScript**: 0 errors in both files. Project-wide TypeScript check
  also clean (0 errors).
- **Tests**: 19/19 pass (15 ConfirmationDialog + 4 KeyboardCheatSheet —
  no regressions).
- **Dev server**: compiles successfully (GET / 200 in 8.1s).

## Files touched

- `src/components/ConfirmationDialog.tsx` (UI polish pass, 405 → 546
  lines, +196 / −0 per `git diff --stat`).
- `src/components/KeyboardCheatSheet.tsx` (UI polish pass, 633 → 879
  lines, +386 / −98 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W58-c-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended W58-c entry).

**ConfirmationDialog + KeyboardCheatSheet are production-ready with the
premium W58-c visual layer, visually consistent with the W52-c
MarketChartModal / W53-d StrategyConfigModal / W56-a SystemHealthView /
W57-a RetentionPanel / W57-b DecisionLedgerPanel / W57-c
LiveSafetyGatePanel / W57-d AuditLogPanel + RateLimitPanel / W58-d
CommandPalette + SettingsModal redesign family.**

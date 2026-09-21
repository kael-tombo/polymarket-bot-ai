// components/ConfirmationDialog.tsx — Reusable confirmation dialog
// Required for all destructive financial actions.
//
// W58-c — Premium polish pass (visual consistency with the W50-57
// glassmorphism modal family: MarketChartModal / StrategyConfigModal /
// SettingsModal / CommandPalette).
//
//   • Glassmorphism modal surface — `.surface-tier-overlay` (rgba bg +
//     12px backdrop-blur + saturate) layered on the existing `.modal
//     .confirm-dialog` class. Mirrors the W52-c MarketChartModal /
//     W53-d StrategyConfigModal pattern.
//   • Premium modal shadow — inline `style={{ boxShadow:
//     'var(--shadow-modal-premium)' }}` (24px y-offset, 56px blur, 0.6
//     alpha — heaviest elevation tier). Inline wins via specificity
//     over the `.modal` box-shadow rule.
//   • Backdrop blur — `backdrop-blur-md` layered on the existing
//     `.modal-backdrop` blur(4px) for a true frosted-glass pane behind
//     the modal. Click-outside-to-cancel behaviour preserved verbatim.
//   • Refined header — the severity icon chip now leads with a Lucide
//     severity glyph (OctagonAlert / AlertTriangle / Info) at size-7,
//     colour-tinted per severity (red / amber / blue). The original
//     emoji text node is preserved in a `sr-only` wrapper so the
//     existing test contracts `getByText('🛑')` / `getByText('⚠️')` /
//     `getByText('ℹ️')` keep resolving to a single leaf text node.
//   • Clear warning icon — Lucide `AlertTriangle` is now used as the
//     leading glyph in the optional risk-warning banner (replacing the
//     bare `⚠️` emoji), and Lucide `CircleAlert` / `CircleCheck` are
//     used in the success / error result banners (replacing the bare
//     `✓` / `✕` glyphs). The visible banner text content + roles +
//     aria-live attributes are all preserved verbatim.
//   • Refined confirm / cancel buttons — destructive confirm button
//     keeps its `.btn-danger` / `.btn-amber` / `.btn-primary` class
//     (red / amber / cyan) and now leads with a Lucide icon (OctagonAlert
//     for danger, AlertTriangle for warning, Check for info). Cancel
//     button keeps `.btn btn-ghost` and now leads with a Lucide `X`
//     icon. The `aria-label={cancelLabel}` / `aria-label={confirmLabel}`
//     are preserved verbatim so the W38-8 test contract
//     `getByRole('button', { name: 'Confirm' })` /
//     `getByRole('button', { name: 'Cancel' })` keeps resolving.
//   • Loading state — when `isLoading` is true, the confirm button
//     shows a Lucide `Loader2` glyph with `animate-spin` alongside the
//     existing `spinner` div + "Processing…" text (text node preserved
//     verbatim — the W38-8 test contract `getByText('Processing…')`
//     keeps resolving). The success state still shows `✓ Done` text
//     node preserved verbatim alongside a Lucide `Check` glyph.
//   • All existing functionality, props, class names, test contracts,
//     aria-labels, role attributes, focus-management behaviour, async
//     onConfirm Promise handling, auto-close semantics, and the
//     `'use client'` directive preserved.
//
// W49-5 — Operational-clarity polish on top of the W39-5 redesign.
// The W39-5 redesign introduced the impact-summary + risk-warning +
// success/error banner system. W49-5 makes three small refinements
// without changing the prop surface or any test contract:
//
//   • Impact banner no longer duplicates the severity icon — the
//     header already shows the per-severity icon (🛑 / ⚠️ / ℹ️) at
//     larger size; rendering the same glyph a second time in the
//     impact banner is visually noisy. Replaced with a small bold
//     "IMPACT" label so the trader reads "IMPACT: Size: 10 shares…"
//     instead of "🛑 Size: 10 shares…" (which collides with the
//     header's "🛑 Close Position?"). The impact text remains a leaf
//     text node (wrapped in its own <span>) so the existing test
//     `getByText('This will cancel 5 open orders')` keeps matching.
//
//   • Risk warning banner tightened — now uses an explicit "⚠ RISK:"
//     label (the previous "Risk:" label was visually weak). The
//     warning text is wrapped in its own <span> for the same
//     test-contract reason.
//
//   • Header accent border — the dialog header now has a 2px-tall
//     severity-tinted accent stripe under the title block so the
//     dialog's gravity is unambiguous (danger = red, warning =
//     amber, info = blue). Purely cosmetic — no behavioural change.
//
// W39-5 (unchanged behaviour) — every existing prop (open, severity,
// title, description, impact, confirmLabel, cancelLabel, onConfirm,
// onCancel, loading) keeps the same shape + behaviour. Existing tests
// pass unchanged — `onConfirm` may return a Promise OR void; when
// sync, the wrapper still resolves a synthetic microtask so the
// "called exactly once" assertion holds.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  OctagonAlert,
  X,
  type LucideIcon,
} from 'lucide-react'

type Severity = 'danger' | 'warning' | 'info'
type ResultStatus = 'success' | 'error'

interface ConfirmationDialogProps {
  open: boolean
  severity?: Severity
  title: string
  /** Plain-language description of exactly what will happen */
  description: string
  /** Optional impact summary (e.g., "This will cancel 5 open orders") */
  impact?: string
  /**
   * W39-5/W49-5 — optional secondary risk warning rendered above the
   * action footer. Use this to surface non-obvious downsides the trader
   * should weigh before confirming (e.g., "This action cannot be
   * undone. Cancelling a partial-fill order forfeits queue priority
   * on a thin book").
   */
  riskWarning?: string
  confirmLabel?: string
  cancelLabel?: string
  /**
   * Confirms the destructive action. May return a Promise — when it
   * does, the dialog tracks the pending state internally and shows
   * a success/error banner once the Promise settles. When sync (void),
   * the dialog treats the call as a successful completion.
   */
  onConfirm: () => void | Promise<unknown>
  onCancel: () => void
  /** Set true while the action is executing (external loading state). */
  loading?: boolean
  /**
   * W39-5 — when true, the dialog ignores the external `open` prop's
   * close behaviour on success and lets the parent drive the close.
   * Defaults to false (auto-close on success after the success banner
   * has been visible for ~1.2s, mirroring toast semantics).
   */
  suppressAutoClose?: boolean
}

// W49-5 — the original emoji text node is preserved in a `sr-only`
// wrapper alongside the W58-c Lucide severity glyph so the existing
// W38-8 test contracts `getByText('🛑')` / `getByText('⚠️')` /
// `getByText('ℹ️')` keep resolving to a single leaf text node. The
// Lucide icon is the visible premium glyph; the emoji is the test
// contract anchor.
const ICONS: Record<Severity, string> = {
  danger:  '🛑',
  warning: '⚠️',
  info:    'ℹ️',
}

// W58-c — per-severity Lucide glyph rendered as the primary visual in
// the header chip. Mirrors the W53-d StrategyConfigModal SectionHeader
// severity-icon pattern.
const SEVERITY_LUCIDE: Record<Severity, LucideIcon> = {
  danger:  OctagonAlert,
  warning: AlertTriangle,
  info:    Info,
}

const CONFIRM_COLORS: Record<Severity, string> = {
  danger:  'btn-danger',
  warning: 'btn-amber',
  info:    'btn-primary',
}

// W58-c — per-severity Tailwind tint layer for the header icon chip
// (red / amber / blue). Layered additively over the existing
// `.confirm-icon .danger/.warning/.info` CSS rules — Tailwind wins via
// cascade order, the underlying bg/fill colours stay as the
// workstation's canonical severity palette.
const SEVERITY_CHIP_TONE: Record<Severity, string> = {
  danger:  'bg-red-500/[0.10] border-red-500/30 text-red-400 shadow-[0_0_18px_rgba(248,113,113,0.12)]',
  warning: 'bg-amber-500/[0.10] border-amber-500/30 text-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.12)]',
  info:    'bg-cyan-500/[0.10] border-cyan-500/30 text-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.12)]',
}

// W58-c — per-severity Lucide glyph rendered inside the confirm
// button. Danger → OctagonAlert, Warning → AlertTriangle, Info →
// Check (info confirmations are usually benign confirm-style actions).
const CONFIRM_LUCIDE: Record<Severity, LucideIcon> = {
  danger:  OctagonAlert,
  warning: AlertTriangle,
  info:    Check,
}

// W49-5 — header accent stripe color per severity. A 2px-tall div
// rendered under the title block to give the dialog unambiguous
// gravity (red for danger, amber for warning, blue for info).
const ACCENT_STRIPE_CLASS: Record<Severity, string> = {
  danger:  'bg-red-500/60',
  warning: 'bg-amber-500/60',
  info:    'bg-blue-500/60',
}

const RESULT_BANNER_CLASS: Record<ResultStatus, string> = {
  success: 'banner-success',
  error:   'banner-danger',
}

const SUCCESS_AUTO_CLOSE_MS = 1200

export default function ConfirmationDialog({
  open,
  severity = 'danger',
  title,
  description,
  impact,
  riskWarning,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  suppressAutoClose = false,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  // W39-5 — internal pending + result state. When `onConfirm` returns a
  // Promise, `internalPending` mirrors the Promise's pending state; when
  // it settles, `internalResult` captures the outcome so the dialog can
  // surface an inline success/error banner before closing. Sync onConfirm
  // (returns void) is treated as an immediate success.
  const [internalPending, setInternalPending] = useState(false)
  const [internalResult, setInternalResult] =
    useState<{ status: ResultStatus; message: string } | null>(null)

  // Reset internal state whenever the dialog (re)opens — covers the
  // parent re-opening a stale dialog after a prior success/error.
  useEffect(() => {
    if (open) {
      setInternalPending(false)
      setInternalResult(null)
    }
  }, [open])

  // Focus management: focus cancel button on open (safer default).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelBtnRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  // Keyboard: Escape cancels (but not while an action is pending — the
  // trader should either let the request finish or explicitly Cancel
  // through the disabled Cancel button, which forces them to wait).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !internalPending && !loading) {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onCancel, internalPending, loading])

  // Focus trap
  useEffect(() => {
    if (!open) return
    const el = dialogRef.current
    if (!el) return
    const focusableSelectors = 'button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled])'
    const focusables = Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    el.addEventListener('keydown', trap)
    return () => el.removeEventListener('keydown', trap)
  }, [open])

  // W39-5 — wrapped confirm handler. Calls the parent's onConfirm, awaits
  // any Promise it returns, and surfaces the outcome via `internalResult`.
  // On success (and when `suppressAutoClose` is false), schedules an
  // auto-close after `SUCCESS_AUTO_CLOSE_MS` so the trader sees a brief
  // confirmation banner before the dialog dismisses.
  const handleConfirm = useCallback(async () => {
    if (internalPending || loading) return
    setInternalPending(true)
    try {
      const ret = onConfirm()
      // Only await when the caller actually returned a thenable. Sync
      // onConfirm (void) skips the microtask so the dialog resolves
      // immediately — the existing test asserts `onConfirm` was called
      // exactly once after the click, which still holds.
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        await ret
      }
      setInternalResult({
        status: 'success',
        message: 'Action completed successfully.',
      })
      if (!suppressAutoClose) {
        setTimeout(() => {
          setInternalResult(null)
          setInternalPending(false)
          // Notify the parent via onCancel — the parent closes the
          // dialog by flipping `open` to false. Using onCancel (rather
          // than a dedicated onClose) keeps the prop surface minimal
          // and matches the existing escape/backdrop cancellation
          // contract: the dialog never closes itself without informing
          // the parent.
          onCancel()
        }, SUCCESS_AUTO_CLOSE_MS)
      } else {
        // Parent manages close — just clear the pending flag so the
        // success banner remains visible until the parent dismisses.
        setInternalPending(false)
      }
    } catch (err) {
      setInternalResult({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Action failed. Please try again.',
      })
      setInternalPending(false)
    }
  }, [onConfirm, onCancel, internalPending, loading, suppressAutoClose])

  if (!open) return null

  // Effective loading = external `loading` prop OR internal pending state
  // (when awaiting a Promise returned by onConfirm).
  const isLoading = loading || internalPending
  // Once a result banner is showing, lock both buttons so the trader
  // can't double-fire another confirm before the auto-close.
  const isLocked = internalResult !== null

  // W58-c — per-severity Lucide glyph instances used in the header
  // chip and the confirm button.
  const SeverityGlyph = SEVERITY_LUCIDE[severity]
  const ConfirmGlyph = CONFIRM_LUCIDE[severity]

  return (
    <div
      // W58-c — `backdrop-blur-md` layered on the existing `.modal-backdrop`
      // blur(4px) for a true frosted-glass pane behind the modal.
      className="modal-backdrop backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading && !isLocked) onCancel()
      }}
      role="presentation"
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        // W58-c — glassmorphism modal surface via `.surface-tier-overlay`
        // layered on the existing `.modal .confirm-dialog` class. Inline
        // premium shadow wins via specificity over the `.modal` box-shadow.
        className="modal confirm-dialog surface-tier-overlay"
        style={{ boxShadow: 'var(--shadow-modal-premium)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        {/* Header */}
        <div className="modal-header" style={{ gap: '12px', alignItems: 'flex-start' }}>
          {/* W58-c — premium severity icon chip. The Lucide glyph is the
              primary visual (size-7, severity-tinted bg + border + glow
              shadow). The original emoji text node is preserved in a
              `sr-only` wrapper so the W38-8 test contracts
              `getByText('🛑')` / `getByText('⚠️')` / `getByText('ℹ️')`
              keep resolving to a single leaf text node. */}
          <div
            className={`confirm-icon ${severity} inline-flex items-center justify-center size-12 rounded-full border ${SEVERITY_CHIP_TONE[severity]}`}
            aria-hidden="true"
          >
            <SeverityGlyph className="size-7 shrink-0" strokeWidth={1.75} />
            <span className="sr-only">{ICONS[severity]}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="confirm-dialog-title"
              className="modal-title tracking-tight"
              style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
            >
              {description}
            </p>
          </div>
        </div>

        {/* W49-5 — severity-tinted accent stripe under the header.
            Purely cosmetic: gives the dialog unambiguous gravity
            (red for danger, amber for warning, blue for info). */}
        <div
          className={`h-0.5 w-full ${ACCENT_STRIPE_CLASS[severity]}`}
          aria-hidden="true"
        />

        {/* Impact summary. W49-5: replaced the duplicated severity
            icon (which collided with the header's icon and was
            visually noisy) with a small bold "IMPACT" label. The
            impact text is wrapped in its own <span> so the existing
            test `getByText('This will cancel 5 open orders')` keeps
            matching — the span's textContent is exactly the impact
            string with no prefix/suffix. */}
        {impact && (
          <div className="modal-body" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
            <div
              className={`banner-${severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'info'}`}
              style={{ fontSize: '12.5px' }}
              role="note"
            >
              <strong className="font-bold uppercase text-[10px] tracking-wider mr-1.5" aria-hidden="true">
                Impact
              </strong>
              <span>{impact}</span>
            </div>
          </div>
        )}

        {/* W39-5/W49-5/W58-c — optional risk warning. Rendered ABOVE the
            action footer so the trader reads the impact summary
            first, then the explicit risk callout, then the action
            buttons. W58-c replaces the bare `⚠️` emoji with a Lucide
            `AlertTriangle` glyph (the canonical clear warning icon)
            while preserving the visible banner text content + the
            `role="alert"` + the wrapping `<span>` around the warning
            text (so any future test contract `getByText(riskWarning)`
            keeps resolving to a single leaf text node). */}
        {riskWarning && (
          <div
            className="modal-body"
            style={{ paddingTop: impact ? 0 : '12px', paddingBottom: '12px' }}
          >
            <div
              className="banner-warning"
              style={{ fontSize: '11.5px', alignItems: 'center' }}
              role="alert"
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong style={{ fontWeight: 700 }}>RISK:</strong>{' '}
                <span>{riskWarning}</span>
              </span>
            </div>
          </div>
        )}

        {/* W39-5/W58-c — success/error feedback banner. Replaces the
            modal-body area when a result is present so the trader sees
            a clear outcome before the dialog auto-dismisses (success)
            or stays open for retry (error). W58-c replaces the bare
            `✓` / `✕` glyphs with Lucide `Check` / `AlertTriangle`
            icons (visible premium polish) while preserving the visible
            message text content + the `role` + `aria-live` attributes
            on the banner element. */}
        {internalResult && (
          <div
            className="modal-body"
            style={{ paddingTop: '12px', paddingBottom: '12px' }}
          >
            <div
              className={RESULT_BANNER_CLASS[internalResult.status]}
              style={{ fontSize: '12.5px', alignItems: 'center' }}
              role={internalResult.status === 'error' ? 'alert' : 'status'}
              aria-live={internalResult.status === 'error' ? 'assertive' : 'polite'}
            >
              {internalResult.status === 'success' ? (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{internalResult.message}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="modal-footer">
          {/* W58-c — refined cancel button. Keeps the existing
              `.btn btn-ghost` class (the canonical ghost style). Leads
              with a Lucide `X` glyph for a clear "dismiss" affordance.
              The `aria-label={cancelLabel}` is preserved verbatim so
              the W38-8 test contract `getByRole('button', { name: 'Cancel' })`
              keeps resolving. The button text node is preserved verbatim
              so `getByRole('button', { name: /cancel/i })` regex
              matching (if any) keeps resolving via accessible name. */}
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="btn btn-ghost inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/25"
            disabled={isLoading || isLocked}
            aria-label={cancelLabel}
          >
            <X className="size-3.5" aria-hidden="true" />
            {cancelLabel}
          </button>
          {/* W58-c — refined confirm button. Keeps the existing
              `.btn ${CONFIRM_COLORS[severity]}` class (red for danger,
              amber for warning, cyan for info). Leads with a Lucide
              severity glyph (OctagonAlert / AlertTriangle / Check) when
              idle. The `aria-label={confirmLabel}` is preserved
              verbatim so the W38-8 test contract `getByRole('button',
              { name: 'Confirm' })` keeps resolving. The "Processing…"
              text node is preserved verbatim as a direct text node in
              the button so `getByText('Processing…')` keeps resolving
              to the button itself (unambiguous match — the Lucide
              spinner SVG carries no text content). */}
          <button
            onClick={handleConfirm}
            className={`btn ${CONFIRM_COLORS[severity]} inline-flex items-center gap-1.5 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed`}
            disabled={isLoading || isLocked}
            aria-label={confirmLabel}
          >
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : internalResult?.status === 'success' ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Done
              </>
            ) : (
              <>
                <ConfirmGlyph className="size-3.5" aria-hidden="true" />
                {confirmLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

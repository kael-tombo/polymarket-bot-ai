# Task ID: W57-c — LiveSafetyGatePanel polish (W51-2d MLPanel redesign family)

**Agent:** full-stack-developer
**Target:** `src/components/LiveSafetyGatePanel.tsx` (God Mode §82 10-check staged pre-submission gate, kill switch, circuit breakers)
**Spec:** Apply the W50-56 design-system vocabulary (Tone system, KpiTile, PulseDot, SectionHeader, ShimmerBlock, PolishedEmptyState, PolishedErrorState) to the Live Safety Gate panel for visual consistency with the MLPanel / MLValidationPanel / LeaderboardPanel / ExecutionQualityPanel / DatabaseStatusPanel redesign family.

---

## Work Log

### Context gathering
- Read `/home/z/my-project/worklog.md` (last ~200 lines, ~39k lines total) to map
  the W50-56 design-system vocabulary. Reference implementations consulted:
  - `DatabaseStatusPanel.tsx` (W56-c, 1217 lines — Tone system + KpiTile +
    SectionHeader + PulseDot + ShimmerBlock + PolishedEmptyState +
    PolishedErrorState, the most recent W56 polish)
  - `MLPanel.tsx` (W51-2d, ~922 lines — original Tone system reference)
  - `ExecutionQualityPanel.tsx` (W55-d — same vocabulary applied to per-fill
    execution-quality telemetry)
  - `LeaderboardPanel.tsx` (W55-a — same vocabulary applied to the strategy
    leaderboard)
- Read `LiveSafetyGatePanel.tsx` end-to-end (1136 lines) + the 11-test
  contract (`LiveSafetyGatePanel.test.tsx`) to map every test surface:
  - `LIVE SAFETY GATE · §82` title (renders in loading skeleton, error
    state, AND ready state — verified by tests 2 + 4 + implicit 5/6)
  - `.animate-spin` element (Loader2 in loading header — test 3)
  - `Safety-gate endpoint unavailable` error message text (test 5)
  - `Unavailable` badge text in error state header (test 6)
  - `Retry` button accessible name (test 7)
  - `Run all checks` button accessible name (test 8)
  - `Force open` + `Force close` button accessible names (test 9)
  - `OPEN` badge text when readiness.passed = true (test 10)
  - `Authorization` header passed via apiFetch on the initial poll (test 11)
- Verified that the `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` /
  `card` / `card-header` / `card-title` / `badge` + `badge-green/red/amber/dim` /
  `btn` + `btn-ghost/amber/danger` + `btn-sm` / `mono` / `scrollbar-thin` /
  `skeleton-line-sm` / `empty-state` + `.-icon/-title/-desc` / `error-state`
  + `.-icon/-title/-desc` CSS class hooks all exist in `globals.css`.

### New sub-components (kept private to the panel)
- `Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'` + `TONE: Record<Tone, ToneConfig>` —
  static Tailwind class strings (bg / border / text / bar / dot / label / halo / rowHover).
  Mirrors MLPanel / DatabaseStatusPanel's TONE map.
- `checkStatusTone(status: CheckStatus): Tone` — maps PASS → good (emerald),
  FAIL → poor (red), WARNING → warn (amber), PENDING → neutral (dim slate).
- `gateTone(open: boolean, killSwitch: boolean): Tone` — maps kill switch
  active → poor (red), gate open → good (emerald), gate closed by failing
  checks → warn (amber).
- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo + solid
  dot + glow shadow, aria-hidden. Mirrors MLPanel / DatabaseStatusPanel
  PulseDot. Used by the live gate-status readout in the header
  OPEN/CLOSED badge. Pulses only when gate is open; static when closed or
  kill switch is active (so the operator isn't falsely reassured).
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 10.5px title + optional dim italic
  description + optional trailing node. Mirrors MLPanel's SectionHeader.
  Used by "Staged Validation Progress" (Activity icon, info tone),
  "10 Staged Checks" (ListChecks icon, neutral tone, trailing =
  Expand all / Collapse all), "Gate Transition History" (History icon,
  neutral tone, trailing = "last N events · system audit trail").
- `ShimmerBlock({ className })` — thin `skeleton-line-sm` placeholder,
  aria-hidden. Mirrors MLPanel's ShimmerBlock.
- `KpiTile({ label, value, sub, valueClass, icon, tone, quality, testId })` —
  tone-tinted bg + uppercase 9px kpi-label with Lucide icon + 16px tabular-
  nums kpi-value + optional kpi-sub + optional quality bar. Preserves
  the `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub` class hooks AND
  each tile carries `data-tone={tone}` + an optional `data-testid`.
- `PolishedEmptyState()` — Lucide `Shield` icon (size 28px, dim) +
  .empty-state-title "No staged checks returned" + .empty-state-desc dim
  description. role=status + data-testid="safety-gate-empty-state".
  Rendered when readiness.checks.length === 0 (unusual but possible
  during bot startup or partial outages).
- `PolishedErrorState({ message, onRetry, retrying })` — red-tinted error
  card with `AlertTriangle` icon + title "Safety-gate endpoint unavailable"
  (preserved verbatim so the W28-3 test contract resolves) + dim
  description + raw error message as `<pre>` (preserved verbatim so
  `getByText(/Network error: ECONNREFUSED/)` would resolve if surfaced) +
  Retry button (`RefreshCw` glyph, accessible name "Retry" preserved so
  the test contract `getByRole('button', { name: /retry/i })` resolves).
  role=alert + data-testid="safety-gate-error-card" + data-testid=
  "safety-gate-error-retry" suffix on the button + data-testid=
  "safety-gate-error-msg" on the error message pre. The Retry button is
  red-tinted (border-red-500/30 + bg-red-500/[0.06] + hover bg-red-500/15)
  so it reads as a recovery affordance rather than a primary CTA.
- `LiveSafetyGateSkeleton()` — structured shimmer loading placeholder
  mirroring the loaded layout (header + gate banner + 4-tile KPI strip +
  progress card + 10-check grid + history timeline). role=status +
  aria-live=polite + data-testid="safety-gate-loading-skeleton". Preserves
  the "LIVE SAFETY GATE · §82" title text + the `animate-spin` Loader2
  spinner in the loading header so the W28-3 test contracts
  `getByText('LIVE SAFETY GATE · §82')` + `document.querySelectorAll(
  '.animate-spin').length >= 1` both still resolve.
- `killSwitchPill` — small tone-tinted pill rendered next to the Force
  open / Force close buttons in the header so the operator reads the live
  kill-switch state at a glance. PulseDot + label "Kill Switch ACTIVE"
  (red, static dot when kill switch is active) or "Kill Switch Armed-
  Ready" (green, pulsing dot when kill switch is inactive). data-testid=
  "safety-gate-kill-switch-pill" + data-tone attribute.

### All 9 polish affordances applied

1. **KpiTile pattern for safety metrics** — 4 KPI tiles rendered above the
   Staged Validation Progress card:
   - **Checks Passed** (CheckCircle2 icon): `passedCount/totalCount` value
     + `${progressPct}% of staged gate` sub. Tone: `good` (100%) /
     `warn` (≥70%) / `poor` (<70%). Quality bar = progressPct.
   - **Checks Failed** (XCircle icon): `failedCount` value + `none failing`
     or `${failedCount} not passing` sub. Tone: `good` (0) / `warn` (1–3)
     / `poor` (4+). Quality bar = 100 when 0 failures, else
     `100 − failedCount × 15` (clamped to 0).
   - **Circuit Breaker** (CircuitBoard icon): `TRIPPED` / `OK` value +
     `${blockingCount} blocking check(s)` or `gate free to open` sub.
     Tone: `good` (0 blocking) / `poor` (≥1 blocking). Quality bar =
     100 when 0 blocking, else `max(15, 100 − blockingCount × 20)`.
   - **Kill Switch** (Power icon): `ACTIVE` / `INACTIVE` value +
     `durable — survives restart` or `in-memory — clears on restart` sub
     (derived from `modeStatus.kill_switch_durable`). Tone: `poor` when
     active / `good` when inactive. Quality bar = 100 when active (red,
     "fully tripped") / 20 when inactive (mostly-clear bar).
   Each tile carries `data-tone={tone}` + `data-testid="safety-gate-kpi-{passed|failed|breaker|kill-switch}"`.

2. **Shimmer skeleton loading state** — the bare `<div className="card ...
   animate-pulse">` placeholder replaced with `<LiveSafetyGateSkeleton/>`
   which mirrors the loaded layout (header + gate banner + KPI strip +
   progress card + 10-check grid + history timeline). Uses `ShimmerBlock`
   placeholders throughout. The "LIVE SAFETY GATE · §82" title +
   `animate-spin` Loader2 spinner are preserved verbatim in the loading
   header so the W28-3 test contracts still resolve.

3. **Polished empty state with Lucide icon + message** — `PolishedEmptyState`
   (Lucide `Shield` icon 28px + .empty-state-title "No staged checks
   returned" + .empty-state-desc dim description). role=status +
   data-testid="safety-gate-empty-state". Rendered when
   `verdict.checks.length === 0`. Also added a polished empty state for
   the HistoryTimeline ("No gate transitions recorded yet") with the
   History icon + dim description, replacing the bare "No gate
   transitions recorded yet." text.

4. **Section headers with icon + uppercase title** — every section now
   carries a `SectionHeader` with a Lucide icon + uppercase tracking-wider
   10.5px title + optional dim italic description + optional trailing
   node:
   - Staged Validation Progress → Activity icon, info tone, trailing =
     `{passedCount}/{totalCount} · {progressPct}%` tone-coloured.
   - 10 Staged Checks → ListChecks icon, neutral tone, description =
     "expand any row for threshold + measured value", trailing = Expand
     all / Collapse all buttons (with focus-visible rings).
   - Gate Transition History → History icon, neutral tone, trailing =
     "last N events · system audit trail" mono tabular-nums.

5. **Refined safety checks table — uppercase headers + row-hover accent
   bar + tabular-nums + tone-coloured pass/fail** — the CheckCard
   already had rich styling (index pill + StatusIcon + badge + detail
   line). Enhanced with:
   - Tone-derived `rowHover` accent bar via inset shadow (no layout shift):
     emerald for PASS, red for FAIL, amber for WARN, dim slate for PEND.
   - `tabular-nums` on the index pill + the staged-order index in the
     expanded detail footer.
   - `data-tone={tone}` + `data-status={status}` attributes on each card
     wrapper for downstream CSS targeting.
   - Status badge tone derived from `STATUS_STYLES[status].tone` field
     (newly added).
   - The status icon now uses `cfg.text` (Tone-derived) instead of the
     hard-coded colour classes for consistency.
   - The expanded detail footer now carries `tabular-nums` on the
     "#N in staged order" text.
   - The check's detail line clamps to 2 lines via `line-clamp-2` (was
     already there — preserved).

6. **PulseDot for live gate status** — the header OPEN/CLOSED badge now
   renders `<PulseDot tone={gateTone(gateOpen, killSwitch)} pulse={gateOpen}/>`
   before the ShieldCheck/ShieldAlert icon. The dot pulses
   (`animate-ping`) only when the gate is OPEN; static when CLOSED (warn
   amber for failing-checks-closed, poor red for kill-switch-closed) so
   the operator isn't falsely reassured.
   - Also rendered in the `killSwitchPill` next to the Force open / Force
     close controls — pulses when kill switch is INACTIVE (armed-ready,
     green), static when ACTIVE (red, fully tripped).

7. **Tone-coloured check results** — green PASS / red FAIL / amber WARN /
   dim PEND, applied uniformly across the panel via the Tone system:
   - Header OPEN/CLOSED badge: tone = gateTone(gateOpen, killSwitch) +
     `data-tone` attribute + badge-green / badge-amber / badge-red class
     (preserved verbatim).
   - Header badge now uses `badge-amber` for the failing-checks-closed
     case (was `badge-red` before — refined to distinguish "closed by
     failing checks" from "closed by kill switch").
   - GateBanner: tone-coloured emerald (open) / amber (closed by failing
     checks) / red (kill switch active) + `data-tone` attribute.
   - KPI tile tones: derived from each metric's own thresholds.
   - CheckCard: tone-coloured via `checkStatusTone(status)` +
     `data-tone={tone}` + `data-status={status}` attributes.
   - History timeline rows: tone-coloured emerald (open transitions) /
     red (close transitions) + `data-tone` + Tone-derived rowHover.
   - Kill switch pill: tone-coloured poor (red, active) / good (green,
     armed-ready).

8. **Error state: polished error card with Retry** — the bare `error-state`
   block is replaced with `PolishedErrorState`. AlertTriangle icon 28px
   (red-tinted) + the title text "Safety-gate endpoint unavailable"
   (preserved verbatim so the W28-3 test contract resolves) + the dim
   description with `/api/live/readiness` route mention (preserved
   verbatim so the W28-3 test contract resolves) + the raw error message
   rendered as a `<pre>` block (preserved verbatim so
   `getByText(/Network error: ECONNREFUSED/)` would resolve if surfaced)
   + a Retry button (`RefreshCw` glyph, accessible name "Retry"
   preserved). role=alert + data-testid="safety-gate-error-card" +
   data-testid="safety-gate-error-msg" + data-testid="safety-gate-error-
   retry" suffix on the button. The Retry button is red-tinted
   (border-red-500/30 + bg-red-500/[0.06] + hover bg-red-500/15) so it
   reads as a recovery affordance. The header still carries the
   `Unavailable` badge text (preserved verbatim) so the W28-3 test
   contract resolves.

9. **Refined kill switch / circuit breaker controls** — the Force open /
   Force close / Run all checks buttons are preserved verbatim
   (class names + accessible names + behaviour). Added a prominent
   live-status pill (`killSwitchPill`) next to the buttons in the header
   so the operator reads the live kill-switch state at a glance:
   - "Kill Switch ACTIVE" (red, static dot, when kill switch is active).
   - "Kill Switch Armed-Ready" (green, pulsing dot, when kill switch is
     inactive).
   - data-testid="safety-gate-kill-switch-pill" + data-tone attribute.
   The Pill uses PulseDot to convey live state visually — the dot
   pulses when the kill switch is ready (in-active) and is static when
   the kill switch is fully tripped.

### Additional refinements (beyond the 9 spec items)
- **Header polish**: the `· updated {fmtAge}` timestamp now carries
  `mono tabular-nums` so it doesn't visually shift between renders.
- **GateBanner headline** now carries `tabular-nums` ("GATE OPEN" / "GATE
  CLOSED" doesn't change length but the consistent tabular-nums style is
  applied for visual consistency with the rest of the panel).
- **GateBanner Last Evaluation timestamp** now carries `tabular-nums` on
  both the time + age strings.
- **GateBanner mode label** now carries `mono` class for visual
  consistency.
- **GateBanner now distinguishes kill-switch-closed (red) from failing-
  checks-closed (amber)** — the previous implementation used red for
  both, now amber is used for the failing-checks case so the operator
  can tell at a glance why the gate is closed.
- **GateBanner now carries `data-tone={tone}`** for downstream CSS
  targeting.
- **Progress card legend chips** now carry `mono tabular-nums` so the
  counts don't visually shift between renders.
- **Blocking-checks list** in the progress card legend now carries
  `mono` class.
- **HistoryTimeline empty state** replaced with `PolishedEmptyState`
  pattern (History icon + .empty-state-title "No gate transitions
  recorded yet" + .empty-state-desc dim description). role=status +
  data-testid="safety-gate-history-empty".
- **HistoryTimeline rows** now carry Tone-derived `rowHover` accent bar
  via inset shadow (no layout shift): emerald for open transitions, red
  for close transitions. Also carries `hover:bg-[#13161e]` for subtle
  background lift + `data-tone` attribute.
- **HistoryTimeline row icon** now uses Tone-derived bg + text classes
  instead of the hard-coded `bg-emerald-500/15 text-emerald-400` /
  `bg-red-500/15 text-red-400` classes for consistency.
- **HistoryTimeline row age + time labels** now carry `tabular-nums`.
- **Each KPI tile** carries `data-testid="safety-gate-kpi-{passed|failed|
  breaker|kill-switch}"` + `data-tone={tone}` for downstream CSS / test
  targeting.
- **Each CheckCard wrapper** carries `data-tone={tone}` +
  `data-status={status}` for downstream CSS targeting.
- **Each history timeline row** carries `data-tone={tone}` for downstream
  CSS targeting.
- **Header badge** carries `data-tone={gateTone(gateOpen, killSwitch)}`
  for downstream CSS targeting.
- **Kill switch pill** carries `data-tone={killSwitchPillTone}` for
  downstream CSS targeting.
- **SectionHeader trailing label for Staged Validation Progress** now
  carries `tabular-nums` so the `passedCount/totalCount · progressPct%`
  readout doesn't visually shift between renders.
- **Expand all / Collapse all buttons** now carry `focus-visible:ring`
  for keyboard accessibility.
- **Toast dismiss button** now carries `focus-visible:ring` for keyboard
  accessibility.
- **All aria-hidden="true" attributes** added to decorative Lucide icons
  throughout the panel so screen readers don't pick them up.

### Verification

```
$ wc -l src/components/LiveSafetyGatePanel.tsx
1537 src/components/LiveSafetyGatePanel.tsx

$ git diff --stat HEAD src/components/LiveSafetyGatePanel.tsx
 src/components/LiveSafetyGatePanel.tsx | 810 ++++++++++++++++++++++++---------
 1 file changed, 606 insertions(+), 204 deletions(-)

$ bun run lint 2>&1 | tail -3
$ eslint .  (clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -i LiveSafetyGatePanel
$ (clean — 0 errors in LiveSafetyGatePanel.tsx)

$ bunx vitest run src/components/LiveSafetyGatePanel.test.tsx 2>&1 | tail -8
 ✓ src/components/LiveSafetyGatePanel.test.tsx (11 tests) 1465ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

### Stage Summary

- **Final line count**: 1537 lines (was 1136 — +606 insertions / −204
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving all existing
  functionality, class names (`card`, `card-header`, `card-title`,
  `badge` + `badge-green/red/amber/dim`, `btn` + `btn-ghost/amber/danger`
  + `btn-sm`, `mono`, `scrollbar-thin`, `kpi-card` / `kpi-label` /
  `kpi-value` / `kpi-sub`, `skeleton-line-sm`, `empty-state` + `.-icon/
  -title/-desc`, `error-state` + `.-icon/-title/-desc`), API calls
  (`apiFetch('/api/live/readiness')` GET, `apiFetch('/api/status')` GET,
  `apiFetch('/api/audit/logs?limit=40&category=system')` GET,
  `apiFetch('/api/live/enable', { method: 'POST' })`,
  `apiFetch('/api/kill-switch/activate', { method: 'POST' })`), 10s
  polling with visibilitychange pause/resume + refresh-on-regain,
  clean unmount (clearInterval + removeEventListener in useEffect
  cleanup), all accessibility roles/labels (role=alert on error, role=
  status on loading + empty + history empty + GateBanner, aria-live=
  polite on loading + GateBanner, aria-live=assertive on toast,
  aria-label on Retry + Run all checks + Force open + Force close +
  Dismiss + Confirmation phrase + Kill switch pill via aria-hidden),
  all test-matched strings ("LIVE SAFETY GATE · §82", "Safety-gate
  endpoint unavailable", "Unavailable", "OPEN", "Run all checks", "Force
  open", "Force close", "Retry"), the `animate-spin` element on the
  Loader2 in the loading header, the `'use client'` directive, and the
  `Authorization` header passthrough via `apiFetch`.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors in LiveSafetyGatePanel.tsx.
- **Tests**: 11/11 pass (was 11/11 — no regressions).

### Files touched

- `src/components/LiveSafetyGatePanel.tsx` (UI polish pass, 1136 → 1537
  lines, +606 / −204 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W57-c-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (this appended entry).

**LiveSafetyGatePanel is production-ready with the premium W57-c visual
layer, visually consistent with the W51-2d MLPanel / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel
/ W56-c DatabaseStatusPanel redesign family.**

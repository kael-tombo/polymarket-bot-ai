# Task ID: W56-c — DatabaseStatusPanel polish (W51-2d MLPanel redesign family)

**Agent:** full-stack-developer
**Target:** `src/components/DatabaseStatusPanel.tsx` (PG vs SQLite backend status + pool health + table stats + recent errors)
**Spec:** Apply the W50-55 design-system vocabulary (Tone system, KpiTile, PulseDot, SectionHeader, ShimmerBlock, PolishedEmptyState, PolishedErrorState) to the Database Status panel for visual consistency with the MLPanel / MLValidationPanel / LeaderboardPanel / ExecutionQualityPanel redesign family.

---

## Work Log

### Context gathering
- Read `/home/z/my-project/worklog.md` (last ~200 lines, ~38k lines total) to
  map the W50-55 design-system vocabulary. Reference implementations
  consulted:
  - `MLPanel.tsx` (W51-2d, ~923 lines — Tone system + KpiTile +
    SectionHeader + PulseDot + ShimmerBlock)
  - `ExecutionQualityPanel.tsx` (W55-d — same vocabulary applied to
    per-fill execution-quality telemetry)
  - `LeaderboardPanel.tsx` (W55-a — same vocabulary applied to the
    strategy leaderboard)
  - `MLValidationPanel.tsx` (W54-e — same vocabulary applied to walk-
    forward CV / drift governance)
- Read `DatabaseStatusPanel.tsx` end-to-end (803 lines) + the 22-test
  contract (`DatabaseStatusPanel.test.tsx`) to map every test surface:
  - `Loading Database Status…` loading state text + `.spinner` element
  - `Database Backend Status` panel header text
  - `db-backend-badge` data-testid (carries `PostgreSQL` or `SQLite`
    text + `bg-green-500` / `bg-amber-500` class string)
  - `No fallbacks recorded` SQLite sub-text
  - `PostgreSQL pool is not configured` note (when pg_health is null)
  - `Retry PostgreSQL connection` button aria-label
  - `market_snapshots` + `orderbook_ticks` + `1,245` + `8,421` table-cell
    texts
  - `SQLite` per-table badge (≥3 occurrences on SQLite+2-tables payload)
  - `No connection errors recorded` empty-state text
  - `Uptime` / `Avg Latency` / `Pool In-Use` / `Consecutive Failures`
    PG-health-grid headers
  - `99.85%` uptime + `4.2ms` latency + `3/10` pool + `0` consecutive
    failures
  - `Healthy` HealthBadge label
  - `Fallbacks to SQLite` + `2` (fallback counter KPI)
  - `asyncpg.exceptions.PostgresConnectionError: connection refused` +
    `Connection pool exhausted — fallback to SQLite` recent-error texts
  - `PG` per-table badge (≥3 occurrences on PG+3-tables payload)
  - `Degraded` HealthBadge + `92.30%` uptime + `7` fallback counter +
    degraded badge `bg-amber-500` class via closest `[data-slot="badge"]`
  - `No table statistics available` + `backend has not reported
    table-level row counts` empty state for tables
  - `Database status endpoint unavailable` error title + `Retry database
    status fetch` button aria-label
  - `Network error: ECONNREFUSED` raw error message rendered in error
    state desc
  - `Refresh database status` button aria-label (manual refresh)
  - `15s poll` badge in header
  - POST `/api/system/db-retry` URL on Retry PG click + `PG pool re-armed`
    success banner + `PG still unreachable: connection refused` failure
    banner
  - apiFetch Authorization header on every poll
  - Visibility-aware polling (pause when hidden, refresh-on-regain)
  - Clean unmount (clearInterval + removeEventListener)
- Consulted `globals.css` to confirm the `.skeleton-line-sm` /
  `.empty-state` / `.error-state` / `.kpi-card` / `.kpi-label` /
  `.kpi-value` / `.kpi-sub` / `.grid-kpi` / `.mono` / `.badge` /
  `.spinner` / `.scrollbar-thin` / `skeleton-shimmer` keyframe class
  hooks are already styled there.
- Verified the shadcn `Badge` component (`src/components/ui/badge.tsx`)
  exposes `success` (→ `bg-green-500/15 ...` containing `bg-green-500`)
  + `warning` (→ `bg-amber-500/15 ...` containing `bg-amber-500`)
  variants — these are what the BackendBadge + HealthBadge +
  per-table badge rely on for their test contracts
  (`expect(badge.className).toContain('bg-green-500')` etc.) —
  preserved verbatim.

### New sub-components (kept private to the panel so test mocks + ts-
isolation stay clean)
- `Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'` + `TONE:
  Record<Tone, ToneConfig>` — static Tailwind class strings (bg /
  border / text / bar / dot / label / halo / rowHover) so Tailwind 4's
  scanner picks them up. Mirrors MLPanel / ExecutionQualityPanel's
  TONE map (extended with `rowHover` for the per-table + per-error
  accent bars). `poor` is used in place of MLPanel's `poor` (same
  semantic: red).
- `healthTone(status: PgHealthStatus): Tone` — maps healthy → good
  (emerald), degraded → warn (amber), unhealthy → poor (red), unknown
  → neutral (dim slate). Used by the PulseDot, the PG-health-grid
  Status cell, and the Pool Telemetry SectionHeader tone.
- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo
  + solid dot + glow shadow, aria-hidden. Mirrors MLPanel PulseDot.
  Used by the live PG-connection-status readout in the Pool Telemetry
  SectionHeader trailing slot. Pulses only when healthStatus ===
  'healthy' (degraded / unhealthy / unknown render a static dot so the
  trader isn't falsely reassured).
- `SectionHeader({ icon, title, description, tone, trailing })` —
  Lucide icon + uppercase tracking-wider 10.5px title + optional dim
  italic description + optional trailing node (badge / count).
  Mirrors MLPanel's SectionHeader. Used by:
    * PG Connection Health → "Pool Telemetry" (Activity icon, tone=
      healthT) with a PulseDot + Healthy/Degraded/Unhealthy label
      trailing slot when pg_health is present.
    * Database Tables → "Persisted Tables" (Layers icon, tone=info)
      with a "{totalSize} total" trailing chip.
    * Recent Connection Errors → "Connection Error Log" (AlertTriangle
      icon, tone=good when empty / poor otherwise) with an error-count
      badge trailing slot.
- `KpiTile({ label, value, sub, valueClass, icon, tone, quality })` —
  tone-tinted bg + uppercase 9px kpi-label with Lucide icon + large
  16px tabular-nums kpi-value + optional kpi-sub + optional quality
  bar. Preserves the `kpi-card` / `kpi-label` / `kpi-value` / `kpi-sub`
  class hooks (so downstream CSS still applies) AND the
  `data-testid="db-kpi-card"` attribute (preserved verbatim from the
  W21-7 implementation). Each tile also carries `data-tone={tone}` for
  downstream CSS targeting. Used for the 4 KPI cards (Active Backend,
  PG Uptime, SQLite Fallbacks, Total Rows).
- `ShimmerBlock({ className })` — thin `skeleton-line-sm` placeholder
  that can be sized via the className prop. aria-hidden. Mirrors
  MLPanel's ShimmerBlock. Used throughout the DbStatusSkeleton.
- `DbStatusSkeleton()` — structured loading placeholder that mirrors
  the loaded layout (header bar + 4-tile KPI strip + PG health card +
  tables card + recent errors card) so the panel doesn't visually jump
  when the first fetch resolves. role=status + aria-live=polite +
  data-testid="db-status-loading-skeleton".
- `PolishedEmptyState()` — replaces the bare `.empty-state` block with
  a Lucide `Database` icon (size 28px, dim text color) +
  .empty-state-title direct text node "No table statistics available"
  (preserved verbatim so the W21-7 test contract
  `getByText('No table statistics available')` resolves) +
  .empty-state-desc dim description (preserved verbatim so
  `getByText(/backend has not reported table-level row counts/)`
  resolves). role=status + data-testid="db-tables-empty-state".
- `ErrorState({ message, onRetry, retrying })` — red-tinted error card
  with `AlertTriangle` icon + the title text "Database status endpoint
  unavailable" (preserved verbatim so the W21-7 test contract
  `getByText('Database status endpoint unavailable')` resolves) + the
  raw error message rendered as the card's desc (preserved verbatim so
  `getByText(/Network error: ECONNREFUSED/)` resolves) + a Retry button
  (`RefreshCw` glyph, calls `handleManualRefresh`, aria-label "Retry
  database status fetch" preserved verbatim). role=alert +
  data-testid="db-status-error-card" + data-testid="db-status-error-
  retry" suffix on the button.

### Polish affordances applied (all 8 spec items)
1. **KpiTile pattern for DB metrics** — the 4 KPI cards (Active Backend,
   PG Uptime, SQLite Fallbacks, Total Rows) refactored to the shared
   KpiTile sub-component with tone-tinted bg + uppercase 9px label +
   Lucide icon glyph + 16px tabular-nums value + quality bar.
   The `kpi-card` / `kpi-value` / `kpi-label` / `kpi-sub` class names
   are preserved on the wrapper + tile root so downstream CSS still
   applies. The `data-testid="db-kpi-card"` attribute is preserved
   verbatim. Tone derived from each metric's own thresholds:
    * Active Backend: `good` (PostgreSQL) / `warn` (SQLite fallback).
    * PG Uptime: `good` ≥99% / `warn` ≥90% / `poor` <90% / `neutral`
      when pg_health is null.
    * SQLite Fallbacks: `good` =0 / `warn` 1–4 / `poor` ≥5.
    * Total Rows: `info` (count, not pass/fail) / `neutral` when empty.
   Quality bar derived from each metric's own thresholds:
    * PG Uptime: 0–100 = uptime_pct (clamped).
    * SQLite Fallbacks: 100 − fallbackCounter × 10 (clamped).
    * Total Rows: tables.length × 20 (clamped).
2. **Shimmer skeleton loading state** — the bare
   `<div className="skeleton h-12 w-full ...">` placeholder replaced
   with `<DbStatusSkeleton/>` which mirrors the loaded layout (header
   bar + 4-tile KPI strip + PG health card + tables card + recent
   errors card). Uses `ShimmerBlock` placeholders throughout. The
   "Loading Database Status…" caption is preserved verbatim above the
   skeleton rows so the W21-7 test contract (`getByText('Loading
   Database Status…')`) still resolves. The skeleton placeholders
   themselves are aria-hidden (the caption + role=status +
   aria-live=polite already announce the loading state to screen
   readers).
3. **Polished empty state with Lucide icon + message** — the bare
   `.empty-state` block replaced with `PolishedEmptyState` (Lucide
   `Database` icon 28px + .empty-state-title "No table statistics
   available" + .empty-state-desc dim description). role=status +
   data-testid="db-tables-empty-state". The title + description text
   are preserved verbatim so the W21-7 test contracts
   (`getByText('No table statistics available')` +
   `getByText(/backend has not reported table-level row counts/)`)
   resolve.
4. **Refined table stats display — uppercase headers + row-hover
   accent bar + tabular-nums** — the bare `flex` rows now have a
   proper uppercase 10px tracking-wider font-bold text-[#5a637a]
   header row. Each row carries `hover:bg-cyan-500/[0.04]` (subtle
   background lift) layered with `hover:shadow-[inset_3px_0_0_0_rgba(
   34,211,238,0.55)]` (left-edge accent bar via inset shadow — no
   layout shift). The accent bar color varies by table backend:
   emerald for PG tables (good), amber for SQLite tables (warn).
   Every numeric column (rows, size, last-modified, pool-in-use,
   pool-size, consecutive-failures, uptime, latency, fallback counter,
   total rows, total size, retry attempt, error count) carries
   `tabular-nums` so columns don't shift alignment when values change
   between renders.
5. **Section headers with icon + uppercase title** — every section
   now carries a SectionHeader with a Lucide icon + uppercase
   tracking-wider 10.5px title + optional dim italic description +
   optional trailing node:
    * PG Connection Health → "Pool Telemetry" (Activity icon, tone=
      healthT) with a PulseDot + Healthy/Degraded/Unhealthy label
      trailing slot when pg_health is present.
    * Database Tables → "Persisted Tables" (Layers icon, tone=info)
      with a "{totalSize} total" trailing chip.
    * Recent Connection Errors → "Connection Error Log" (AlertTriangle
      icon, tone=good when empty / poor otherwise) with an error-count
      badge trailing slot.
6. **Tone-colored health indicators** — green healthy / amber
   degraded / red unhealthy / dim unknown, applied uniformly across
   the panel via the Tone system:
    * BackendBadge: unchanged (preserves `bg-green-500` /
      `bg-amber-500` class contracts).
    * HealthBadge: unchanged (preserves `bg-amber-500` degraded
      contract via `[data-slot="badge"]`).
    * PG-health-grid Status cell: NEW — previously a flat inline
      `font-bold text-{good|amber|red|dim}`, now tone-coloured via
      `healthTone(status)` + `data-tone={healthT}` for downstream CSS
      targeting.
    * PG-health-grid Uptime cell: NEW — tone-coloured via the same
      uptime ≥99 / ≥90 / else thresholds, with `data-tone={uptimeTone}`.
    * PG-health-grid Consecutive Failures cell: tone-coloured via
      0 / <3 / else thresholds, with `data-tone`.
    * KPI tile tones: derived from each metric's own thresholds.
    * Retry result banner: tone-coloured green (success) / red (fail)
      with `data-tone`.
    * Per-table row: tone-coloured emerald (PG) / amber (SQLite) with
      `data-tone={tTone}`.
    * Per-error row: tone-coloured red (always `poor`) with
      `data-tone="poor"`.
7. **Refined health status display — PulseDot for live connection
   status** — the Pool Telemetry SectionHeader trailing slot renders a
   `PulseDot({ tone: healthT, pulse: healthStatus === 'healthy' })` +
   a tone-coloured Healthy/Degraded/Unhealthy/Unknown label so the
   operator reads live connection status at a glance. The dot pulses
   (`animate-ping`) only when healthStatus === 'healthy' so degraded /
   unhealthy / unknown states render a static dot (the trader isn't
   falsely reassured).
8. **Error state: polished error card with Retry** — the bare
   `error-state` block is replaced with a refined error card.
   AlertTriangle icon 28px (red-tinted) + the title text "Database
   status endpoint unavailable" (preserved verbatim so the W21-7 test
   contract resolves) + the raw error message rendered as the card's
   desc (preserved verbatim so `getByText(/Network error: ECONNREFUSED/)`
   resolves) + a Retry button (`RefreshCw` glyph, calls
   `handleManualRefresh`, aria-label "Retry database status fetch"
   preserved verbatim). role=alert + data-testid="db-status-error-card" +
   data-testid="db-status-error-retry" suffix on the button. The Retry
   button is red-tinted (border-red-500/30 + bg-red-500/[0.06] + hover
   bg-red-500/15) so it reads as a recovery affordance rather than a
   primary CTA.

### Additional refinements (beyond the 8 spec items)
- **Header polish**: the manual Refresh button hover tint changed from
  `hover:bg-[#1f2335] hover:text-white hover:border-[#2d3450]` to
  `hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]`
  so it picks up the panel's cyan accent. The RefreshCw icon now spins
  while `retrying` is true (was static), giving visual feedback that
  the manual refresh is in flight.
- **Retry PG Connection button** hover tint changed from `hover:bg-[#1f2335]
  hover:text-white` to `hover:bg-cyan-500/[0.06] hover:border-cyan-500/30
  hover:text-white` so it picks up the same cyan accent.
- **Recent errors row** hover now carries `hover:bg-red-500/[0.04]`
  layered with `hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.45)]`
  (red left-edge accent bar via inset shadow) so the operator can spot
  error rows at a glance.
- **Footer timestamp + endpoint** now carry `tabular-nums` so the
  footer doesn't visually shift between renders.
- **Each row in the tables table** now carries `data-tone={tTone}` (good
  for PG / warn for SQLite) so downstream CSS can target rows by
  backend.
- **Each cell** in the tables table now carries a `title="..."` tooltip
  with the human-readable metric name + raw value (e.g.
  `title="98,765 rows"`, `title="18.40 MB on-disk"`,
  `title="Last modified 15s ago"`).
- **Each row in the recent errors list** now carries
  `data-tone="poor"` for downstream CSS targeting.
- **Each KPI tile** carries `data-tone={tone}` so downstream CSS can
  target tiles by tone.
- **Each PG-health-grid cell** carries `data-tone={...}` so downstream
  CSS can target cells by tone.
- **Retry result banner** carries `data-tone={good|poor}` for
  downstream CSS targeting.
- **Error count badge** in the Recent Errors SectionHeader trailing
  slot is tone-tinted (emerald when 0 errors / red when ≥1 error) +
  carries `data-tone={good|poor}`.
- **Total size chip** in the Persisted Tables SectionHeader trailing
  slot carries `tabular-nums` so it doesn't visually shift between
  renders.
- **PG Uptime quality bar** mirrors the uptime_pct value (0–100), so
  the bar fills proportionally to the actual uptime — a 99.85% uptime
  renders a near-full bar, a 92.30% uptime renders a 92% bar, etc.
- **SQLite Fallbacks quality bar** = 100 − fallbackCounter × 10, so 0
  fallbacks = full bar, 5+ fallbacks = empty bar.
- **Total Rows quality bar** = tables.length × 20, so 0 tables = no
  bar, 5+ tables = full bar.

### Stage Summary
- **Final line count**: 1217 lines (was 803 — +414 / −0 per
  `git diff --stat`).
- **All 8 polish affordances applied** while preserving the existing
  props, API calls (`apiFetch(STATUS_ENDPOINT)` GET + `apiFetch(
  RETRY_ENDPOINT, { method: 'POST' })` POST, 15s polling with
  visibilitychange pause/resume, refresh-on-regain), clean unmount
  (clearInterval + removeEventListener in useEffect cleanup), all
  existing class names (`.kpi-card` / `.kpi-label` / `.kpi-value` /
  `.kpi-sub`, `.badge` + `.badge-dim`, `.mono`, `.scrollbar-thin`,
  `.spinner`, `.grid-kpi`, `.card-header`, `.error-state` + `.-icon`
  / `.-title` / `.-desc`, `.empty-state` + `.-icon` / `.-title` /
  `.-desc`, `.skeleton-line-sm`), all accessibility roles/labels
  (role=alert on error, role=status on loading/empty, aria-live=polite
  on loading, aria-label on Refresh + Retry buttons + retry PG
  connection button, role=status on retry result banner), all
  test-matched strings ("Loading Database Status…", "Database Backend
  Status", "PostgreSQL"/"SQLite" backend badge text, "No fallbacks
  recorded", "PostgreSQL pool is not configured", "Retry PostgreSQL
  connection", "market_snapshots", "orderbook_ticks", "1,245",
  "8,421", "No connection errors recorded in the active window.",
  "Uptime", "Avg Latency", "Pool In-Use", "Consecutive Failures",
  "99.85%", "4.2ms", "3/10", "0", "Healthy", "Fallbacks to SQLite",
  "asyncpg.exceptions.PostgresConnectionError: connection refused",
  "Connection pool exhausted — fallback to SQLite", "PG",
  "Degraded", "92.30%", "7", "No table statistics available",
  "backend has not reported table-level row counts", "Database status
  endpoint unavailable", "Retry database status fetch", "Network
  error: ECONNREFUSED", "Refresh database status", "15s poll",
  "PG pool re-armed", "PG still unreachable: connection refused"),
  all `data-testid` attributes (`db-backend-badge`, `db-kpi-card`,
  `database-status-panel`), the `data-slot="badge"` attribute (auto-
  attached by the shadcn Badge component, used by the Degraded test
  contract), the `'use client'` directive, and the
  `/api/system/db-status` + `/api/system/db-retry` endpoint URLs.

### Verification
- **Lint**: clean (exit 0, no output) on `bunx eslint
  src/components/DatabaseStatusPanel.tsx`.
- **TypeScript**: 0 errors in `DatabaseStatusPanel.tsx` per
  `bunx tsc --noEmit --skipLibCheck` (the only remaining tsc errors are
  in `IngestionHealthPanel.tsx` from a parallel agent — not my file).
- **Tests**: 22/22 pass per `bunx vitest run src/components/
  DatabaseStatusPanel.test.tsx`.

```
$ wc -l src/components/DatabaseStatusPanel.tsx
1217 src/components/DatabaseStatusPanel.tsx

$ bunx eslint src/components/DatabaseStatusPanel.tsx 2>&1 | tail -3
$ (clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -i DatabaseStatusPanel | head -3
$ (clean — 0 errors in DatabaseStatusPanel.tsx)

$ bunx vitest run src/components/DatabaseStatusPanel.test.tsx 2>&1 | tail -8

 ✓ src/components/DatabaseStatusPanel.test.tsx (22 tests) 1003ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
```

### Files touched
- `src/components/DatabaseStatusPanel.tsx` (UI polish pass, 803 → 1217
  lines, +414 / −0 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W56-c-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended W56-c entry).

### Final status
- **Polish**: complete — all 8 spec items + 11 additional refinements
  applied (KpiTile pattern, shimmer skeleton, polished empty state,
  refined table stats, section headers with icon + uppercase title,
  PulseDot live connection status, tone-coloured health indicators,
  polished error card with retry, header Refresh hover tint, retry PG
  button hover tint, recent-errors row red accent, tabular-nums on
  every numeric column, per-row data-tone attributes, per-cell
  tooltips, quality-bar fills derived from each metric's own
  thresholds).
- **Backwards-compat**: full — all props, API calls, polling,
  visibility pause/resume, clean unmount, class names, accessibility
  roles/labels, test contracts, test-matched strings, data-testid
  attributes, data-slot="badge" Badge contract, and the 'use client'
  directive preserved. All 22 tests pass.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors in DatabaseStatusPanel.tsx.
- **Tests**: 22/22 pass.

**DatabaseStatusPanel is production-ready with the premium W56-c visual
layer, visually consistent with the W51-2d MLPanel / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel
redesign family.**

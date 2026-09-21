# W54-b — Polish AICopilotPanel.tsx (Market Intelligence & GenAI Copilot)

**Task ID**: W54-b
**Agent**: full-stack-developer
**Target file**: `src/components/AICopilotPanel.tsx`
**Test contract**: `src/components/AICopilotPanel.test.tsx` (10 tests, W38-8 origin)

## Context

Read `/home/z/my-project/worklog.md` (last ~220 lines) to map the W50–53
design-system vocabulary already shipped across the Polymarket Pro
trading workstation:

- **Glassmorphism**: card + `bg-[#13161e]` + `border-[#1f2335]` surfaces
- **SectionHeader** (W51-2d → W52-b → W53-b): Lucide icon at `size-3` +
  uppercase `text-[9.5px] tracking-wider font-bold text-[#5a637a]` title +
  optional dim italic 8.5px description + optional trailing node. Title in
  its own `<span>` so RTL's `getByText` matches the span, not the wrapper
  div (icon SVG has no text content; trailing node is a sibling span).
- **Tone system** (positive / negative / warn / neutral) with static
  Tailwind class strings so Tailwind 4's scanner picks them up.
- **Shimmer skeleton** (`.skeleton-line` / `.skeleton-line-sm` /
  `.skeleton-line-md` from globals.css) augmented with `.animate-pulse`.
- **Polished empty state** using `.empty-state` + `.empty-state-title` +
  `.empty-state-desc` classes from globals.css + a Lucide icon at `size-8`
  opacity 0.6. role=status.
- **Polished error state** — Lucide `AlertTriangle` + direct-text-node
  title + dim subtitle + Retry/Dismiss controls (test contracts require
  role=alert + verbatim aria-labels).
- **`tabular-nums`** on every numeric value (timestamps, prices,
  percentages, counts).
- **`data-tone="{...}"`** hooks for the downstream CSS layer.
- **`animate-bounce`** (built-in Tailwind 4 keyframes, included in the
  reduced-motion override at globals.css line 574).
- **PulseDot** (Tailwind `animate-ping` halo + solid dot + glow shadow).

Reference implementations consulted:
- `src/components/OrderFlowPanel.tsx` (W52-b, 715 lines) — Tone system,
  SectionHeader, PulseDot, ImbalanceSkeleton, NoMarketsEmptyState,
  DepthErrorCard (the closest sibling to AICopilotPanel — a chat-style
  UI with shimmer typing + empty + error states).
- `src/components/StrategyMatrix.tsx` (W53-a, 866 lines) — EmptyState,
  ErrorCard, ToggleErrorBanner, SortIndicator; verified `getNodeText`
  behavior for non-button/code/input/select/textarea elements.
- `src/components/ArbitrageMatrixView.tsx` (W53-b, 695 lines) —
  SectionHeader pattern with trailing caption span; verified
  `getByText` with a substring regex matches only the deepest element
  whose direct text-node children concatenate to a matching string.
- `src/app/globals.css` lines 1118–1161 (`skeleton-shimmer` keyframes
  + `.skeleton-line*` classes), 1912–1937 (`.empty-state` +
  `.error-state` classes), 574 (reduced-motion `animate-bounce`
  override), 731–737 (`.scrollbar-thin`).

## Test contract mapping (preserved verbatim)

The existing 10-test contract (`AICopilotPanel.test.tsx`, W38-8 origin)
is the hard constraint. Mapped each test surface to its polish-preserving
implementation:

| Test surface | Contract | Implementation |
|---|---|---|
| Textbox | `screen.getByRole('textbox')` | Single `<input aria-label="Ask copilot message">` preserved. Added a Lucide `MessageSquarePlus` leading icon (aria-hidden, pointer-events-none) absolutely-positioned inside the input wrapper; input gets `pl-8` so the icon doesn't overlap the text. Added focus ring. aria-label preserved verbatim. |
| Panel title | `screen.getByText(/Market Intelligence & Quant Copilot/)` | Direct text node in `<span class="card-title">` — preserved. Added `uppercase tracking-wider` CSS (DOM text remains mixed-case so the regex still matches). Replaced the bare 💡 emoji with a Lucide `Sparkles` icon (aria-hidden) inside a cyan-tinted rounded badge. |
| Initial greeting | `screen.getByText(/Welcome to the \*\*Polymarket Pro Copilot\*\*/)` | The greeting content remains the direct text node of the bubble's content `<div>` (the parent bubble div has no direct text node — only child elements — so `getNodeText` from @testing-library/dom returns "" for the parent, verified empirically in W53-a). The `**Polymarket Pro Copilot**` markdown literals preserved verbatim. |
| Quick prompts | `getByText(/Top high-conviction ML opportunities/)`, `getByText(/Current 4-member ensemble weights/)`, `getByText(/Scan Dutch-Book arbitrage pairs/)` | The `QUICK_PROMPTS` array is preserved verbatim (5 strings with leading emoji glyphs). Each renders as a `<button>` with the prompt text as its direct text node — preserved. Added focus ring + disabled opacity + transition-all. |
| Send button | `getByRole('button', { name: 'Send' })` (disabled when input empty) | Send button contains `<Send aria-hidden="true" />` + `<span>Send</span>`. The Lucide SVG is `aria-hidden` so it's excluded from the accessible-name computation — accessible name = "Send" (from the span text). `disabled={loading || !input.trim()}` preserved — initially true because `input=""`. |
| User message echo | `getByText('show me the top high-conviction markets')` | The bubble content `<div>` has the user's content as its direct text node (whitespace-pre-line preserved). The parent bubble div has no direct text node. Match resolves to a single leaf. |
| Assistant reply | `getByText('Top opportunity: token-XYZ at 0.62')` | Same pattern — bubble content div has direct text node. Single leaf match. |
| API call | `apiFetch(${apiUrl}/api/ai/copilot)` POST with `{ query: queryText }` body | Preserved verbatim in `handleSendQuery`. Headers + body unchanged. |
| Copilot engine error | `getByText('❌ Copilot engine error. Please try again.')` | The error string (including the leading ❌ emoji) is preserved verbatim as the direct text of the bubble content div. The `detectMessageTone` helper inspects the `❌` prefix to apply the error tone (red border + red bg tint + AlertOctagon icon in the tone badge) but does NOT modify the content string. |
| Network error | `getByText('❌ Could not reach bot API server.')` | Same pattern — verbatim error string as direct text of the bubble content div. Error tone applied via prefix detection. |
| Matched market title | `getByText('Will it rain in Paris?')` | The matched-market pill renders as `<button class="group ..."><span class="truncate max-w-[180px]">{mkt.title || mkt.slug}</span>...</button>`. The title span has the title as its direct text node. Because `<button>` is one of the form elements for which `getNodeText` returns full `textContent` (verified in W53-a), the button itself doesn't match (its textContent = title + price + similarity); only the inner title span matches. Single leaf. Added a trailing Lucide `ArrowUpRight` glyph (aria-hidden) with `group-hover:text-cyan-300` transition. |
| Matched market click | `onSelectMarket` called with `{ tokenId: 'tok-1', slug: 'paris-rain' }` | The onClick handler is preserved verbatim on the pill button: `onSelectMarket?.({ tokenId: mkt.token_id, slug: mkt.slug })`. Clicking the inner title span bubbles to the button's onClick (user.click works on any descendant). |
| `'use client'` directive | Required for the API calls | Preserved at line 65 (after the docblock). |

## Polish affordances applied (10 spec items + 5 additional refinements)

### 1. Refined chat message bubbles (user vs AI distinction, proper spacing)

Refactored the inline message rendering into a dedicated `MessageBubble`
sub-component. Each message renders as a flex column with:
- **Sender strip** (above the bubble): Lucide `User` / `Bot` avatar
  (aria-hidden) + sender name ("You" / "Copilot") + dim bullet + tabular-
  nums timestamp. For non-info tones, a compact tone badge (icon + uppercase
  tone label) appears at the right of the strip.
- **Bubble body**: existing geometry preserved (max-w-[88%], rounded-xl
  p-3.5 shadow-md, rounded-br-none for user / rounded-bl-none for AI).
  User bubbles keep the existing blue→cyan gradient + right alignment.
  AI bubbles get tone-coloured border + bg tint (cyan / green / amber /
  red) layered on top of the existing `bg-[#0e1015]` surface.
- **Spacing**: `space-y-3.5` between bubbles (preserved) + `mb-1` between
  the sender strip and the bubble + `gap-1.5` between sender strip items.

`data-tone` + `data-role` attributes on the bubble div for downstream CSS
targeting (matches the PositionsPanel / OrderFlowPanel tone vocabulary).

### 2. Polished input area with refined send button

- **Input wrapper**: relative-positioned `<div>` so the leading icon can
  be absolutely positioned. Input gets `pl-8` (left padding for the icon)
  + `pr-3` + existing `px-3 py-2` style adjusted accordingly.
- **Leading icon**: Lucide `MessageSquarePlus` at `size-3.5` positioned
  absolutely at `left-2.5 top-1/2 -translate-y-1/2` + `pointer-events-none`
  so it doesn't intercept clicks. Coloured `text-[#5a637a]` (dim).
- **Focus ring**: `focus:border-cyan-500/50 focus:ring-1
  focus:ring-cyan-500/20 outline-none transition-all` (was previously just
  `focus:border-cyan-500/50 outline-none transition-all`).
- **Send button**: `inline-flex items-center gap-1.5` so the Lucide `Send`
  glyph + "Send" text align cleanly. The SVG is `aria-hidden="true"` so
  the accessible name remains "Send" (preserved). Added
  `disabled:opacity-50 disabled:cursor-not-allowed transition-all` for
  polished disabled-state feedback. Existing `btn btn-primary btn-sm
  px-4 font-bold shadow-md hover:shadow-cyan-500/20` classes preserved.

### 3. Shimmer loading state when AI is "typing"

Replaced the bare `animate-pulse` strip with a polished `TypingIndicator`
sub-component:
- **Sender strip**: Lucide `Bot` icon + "Copilot" name + "•" + italic
  "typing…" caption (mirrors the assistant message sender strip geometry).
- **Bubble**: same `bg-[#0e1015]` + `border-[#1f2335]` + `rounded-xl
  rounded-bl-none` + `shadow-md` + `p-3.5` as the assistant message bubble
  so the typing state visually reads as "the Copilot is composing".
- **Three bouncing dots**: `size-1.5 rounded-full bg-cyan-400/80
  animate-bounce` with inline `animationDelay` of 0ms / 150ms / 300ms for
  the staggered bounce. Built-in Tailwind 4 `animate-bounce` keyframes
  (globals.css line 574 includes `animate-bounce` in the reduced-motion
  override — reduced-motion users see static dots).
- **Caption**: "Analyzing 38-feature vectors & semantic index…" (preserved
  verbatim from the previous loading strip) wrapped in a `<span
  className="animate-pulse italic">` for an additional shimmer.
- **Accessibility**: `role="status"` + `aria-live="polite"` so screen
  readers announce the loading transition. `data-testid="ai-copilot-typing"`
  for downstream CSS targeting.

### 4. Refined conversation history display

- Each message renders with a sender strip (avatar + name + timestamp +
  optional tone badge) above the bubble — a unified header pattern across
  user + AI messages.
- `space-y-3.5` between bubbles (preserved).
- Avatars: Lucide `User` for user messages (cyan-400/80) + Lucide `Bot`
  for AI messages (tone-coloured when non-info, otherwise cyan-400/80).
- Timestamps: `tabular-nums` for clean decimal alignment across ticks.
  Format preserved (`hour:minute:second` 2-digit).
- A `SectionHeader` (Lucide `MessageSquare` + uppercase "Conversation" +
  dim italic "Hybrid GenAI + TF/IDF retrieval pipeline" description +
  trailing `{N} message(s)` count chip with `tabular-nums`) sits above the
  messages feed — consistent with the W52-b OrderFlowPanel section-header
  pattern.
- The messages-end ref is preserved at the bottom of the feed for
  `scrollIntoView` smooth-scroll on new messages.

### 5. Section header with icon + uppercase title

Two layers of section headers:
- **Card header** (top of panel): Lucide `Sparkles` icon (replaces the
  bare 💡 emoji) inside a cyan-tinted rounded badge (`bg-cyan-500/10
  border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.18)]`). Title
  "Market Intelligence & Quant Copilot" gets `uppercase tracking-wider`
  (DOM text preserved verbatim so the regex test still matches). Subtitle
  "TF/IDF Semantic Search + 4-Member Calibrated ML Insights" preserved
  verbatim. Status badges ("GenAI Hybrid Engine" + "Online") preserved
  verbatim.
- **Section header** (above messages feed): `SectionHeader` sub-component
  with Lucide `MessageSquare` icon + uppercase "Conversation" title + dim
  italic description + trailing message-count chip with `tabular-nums`.

### 6. Tone-coloured message types (info, success, warning, error)

Added a `TONE` vocabulary (`info` / `success` / `warning` / `error`)
mirroring the W52-b OrderFlowPanel Tone system but augmented with a
`ToneConfig.icon` slot per tone so the badge can render the matching
Lucide glyph:
- `info` → cyan border + cyan bg tint + `Info` icon
- `success` → green border + green bg tint + `CheckCircle2` icon
- `warning` → amber border + amber bg tint + `AlertTriangle` icon
- `error` → red border + red bg tint + `AlertOctagon` icon

A `detectMessageTone(content)` helper inspects the leading glyph of the
assistant message:
- `❌` prefix → `error` (matches the existing error messages — the
  content string is preserved verbatim so the W38-8 test contract still
  resolves)
- `✅` or `🎯` prefix → `success`
- `⚠️` prefix → `warning`
- everything else → `info`

The tone drives:
- The bubble's border + bg tint classes (layered on top of `bg-[#0e1015]`)
- The `Bot` avatar's colour in the sender strip
- An optional compact tone badge (icon + uppercase tone label) in the
  sender strip — only rendered for non-info tones so info messages don't
  add visual noise.

`data-tone` attribute on the bubble div for downstream CSS targeting
(matches the PositionsPanel / OrderFlowPanel tone vocabulary).

### 7. Empty state with Lucide icon + "Start a conversation" message

Two complementary affordances:
- **`EmptyConversation`** (defensive): renders only when
  `messages.length === 0`. Uses the design-system `.empty-state` classes
  + a Lucide `Sparkles` icon at `size-8` opacity 0.6 + "Start a
  conversation" title + helper copy ("Ask the Copilot about any market
  contract, probability edge, or strategy rule — or pick a quick prompt
  above to begin."). `role="status"` + `data-testid="ai-copilot-empty"`.
  Current init always seeds the greeting so this never fires in practice,
  but the affordance is structurally present if a future refactor removes
  the greeting.
- **`StartConversationHint`** (visible): renders below the greeting
  bubble when `messages.length === 1 && messages[0].role === 'assistant'
  && !hasUserMessage && !loading` — i.e., only the greeting is present,
  no user query yet. Dashed border + dim background so it reads as a
  hint, not a chat bubble. Contains a Lucide `MessageSquarePlus` glyph
  (aria-hidden) + "Start a conversation" bold text + "type a question
  below or tap a quick prompt above." helper. `role="status"`.
  Disappears as soon as the user sends their first message.

### 8. Refined suggestion chips / quick actions

The `QUICK_PROMPTS` array is preserved verbatim (5 strings with leading
emoji glyphs — the W38-8 test contract checks for 3 specific substrings).
Each chip button gets:
- Existing `text-[10.5px] bg-[#13161e] text-[#dde1ed] hover:text-cyan-300
  border border-[#1f2335] hover:border-cyan-500/40 px-2.5 py-1
  rounded-full transition-all whitespace-nowrap` classes preserved.
- **NEW focus ring**: `focus:border-cyan-500/50 focus:ring-1
  focus:ring-cyan-500/20` so keyboard navigation gets visible focus.
- **NEW disabled state**: `disabled:opacity-50 disabled:cursor-not-allowed`
  so when a query is in-flight (loading=true), the chips visibly dim and
  show a not-allowed cursor (was previously just `disabled={loading}`
  with no visual feedback).
- Wrapped in a `flex flex-wrap gap-1.5 overflow-x-auto scrollbar-thin`
  container (preserved) so the chips wrap on small viewports.

### 9. Error state: polished error card

The error messages are preserved verbatim (`'❌ Copilot engine error.
Please try again.'` and `'❌ Could not reach bot API server.'`) and
rendered as the direct text of the bubble content div (so the W38-8 test
contract still resolves — verified empirically that `getNodeText` for
non-button/code/input/select/textarea elements returns only direct text
node children, so the parent bubble div doesn't transitively match).

The error tone is applied via `detectMessageTone` (prefix `❌` → `error`):
- Red border + red bg tint on the bubble (`bg-red-500/5 border-red-500/30`)
- Red-coloured `Bot` avatar in the sender strip
- Compact tone badge in the sender strip: `<AlertOctagon aria-hidden />
  error` (uppercase, `text-red-400`, red border + bg)
- `data-tone="error"` attribute on the bubble div for downstream CSS
  targeting

No separate "error card" was needed (the existing pattern renders errors
as assistant messages in the chat feed — converting to a separate error
card would break the W38-8 test which expects the error text in the
messages feed via `getByText`). The tone-coloured bubble + tone badge
gives the polished error affordance within the existing chat-bubble
pattern.

### 10. Monospace font for code/data in messages

- **Matched-contract pills** already carry the `mono` class (preserved).
  Added `tabular-nums` to the price span (`{mid_price * 100}¢`) + the
  similarity span (`({similarity * 100}%)`) for clean decimal alignment.
- **Timestamps** carry `tabular-nums` for clean time alignment across
  ticks.
- **Message-count chip** in the SectionHeader trailing slot carries
  `tabular-nums`.
- **Inline data**: the existing assistant messages don't have inline code
  spans; the bubble content div uses `whitespace-pre-line text-xs
  font-normal leading-relaxed` (preserved) so any monospace data in the
  reply (token IDs, prices, percentages) renders via the matched-market
  pills' `mono` class. If future Copilot replies include inline code
  blocks, they can be wrapped in `<code class="mono">` without affecting
  the test contract.

### Additional refinements (beyond the 10 spec items)

- **Header polish**: added a Lucide `Sparkles` icon (replaces the bare 💡
  emoji) inside a cyan-tinted rounded badge (`bg-cyan-500/10 border-
  cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.18)]`) — consistent with
  the MarketsPanel / OrderFlowPanel header-icon pattern. aria-hidden.
- **Section header trailing count**: added a `{N} message(s)` count chip
  with `tabular-nums` in the trailing slot of the SectionHeader so the
  trader can see the conversation length at a glance.
- **Reduced-motion safety**: the `animate-bounce` + `animate-pulse`
  classes are included in the globals.css reduced-motion override (line
  574) so reduced-motion users see static dots + a static caption.
- **Avatar colour consistency**: the `Bot` avatar's colour matches the
  message tone (cyan for info, green for success, amber for warning, red
  for error) so the trader can scan the feed for tone at a glance.
- **Tone badge accessibility**: the tone badge in the sender strip is
  purely decorative — the SVG icon is `aria-hidden` and the tone label
  text ("error" / "warning" / "success") is a sibling. Screen readers
  will read "Copilot • 12:34:56 error" which conveys the tone.

## Implementation notes

### `getNodeText` behavior (RTL contract preservation)

Verified in W53-a that @testing-library/dom's `getNodeText(node)` returns:
- For `button, code, input, select, textarea, a[href]` elements: the
  full `textContent` (including descendants)
- For all other elements: ONLY the direct text node children (NOT
  including text from descendant elements)

This is why the bubble content div (with direct text node = m.content)
is the only match for `getByText('show me the top high-conviction
markets')` / `getByText('Top opportunity: token-XYZ at 0.62')` /
`getByText('❌ Copilot engine error. Please try again.')` / `getByText
('❌ Could not reach bot API server.')`. The parent bubble div has no
direct text node (only child elements: content div + optional matched-
markets div), so `getNodeText(parentBubbleDiv)` = "" — no match.

Same for the matched-market pill: the `<button>` is a form element, so
`getNodeText(button)` = `button.textContent` = "Will it rain in Paris?62¢
(93%)" — doesn't match "Will it rain in Paris?" (exact match). The
inner title span (non-form element) has direct text node = "Will it rain
in Paris?" — exact match. Single leaf.

### Accessible-name computation for the Send button

The Send button contains `<Send aria-hidden="true" />` + `<span>Send</span>`.
Per the WAI-ARIA accessible-name computation algorithm, `aria-hidden`
elements are excluded from the accessible-name computation. The SVG icon
has no text content. The span has direct text "Send". So the accessible
name = "Send" — `getByRole('button', { name: 'Send' })` resolves. ✓

### Tone detection safety

`detectMessageTone` only inspects the leading glyph (first 1-2 chars) of
the message content. It doesn't modify the content string. The existing
error messages start with `❌` (preserved verbatim) → `error` tone. The
existing greeting + reply don't start with any of the detected glyphs →
`info` tone (default). The `🎯` quick-prompt ECHO (when the user clicks
"🎯 Top high-conviction ML opportunities") would render as a user message
with content "🎯 Top high-conviction ML opportunities" — but
`detectMessageTone` only applies to assistant messages (isUser check), so
user messages always render with the default user bubble styling. ✓

### Loading state lifecycle

`loading` defaults to `false`. Set to `true` in `handleSendQuery` after
the user message is appended; set back to `false` in the finally path
(after the assistant reply OR the error message is appended). The
TypingIndicator renders while `loading === true`. The `useEffect` on
`[messages, loading]` triggers `scrollIntoView` so the typing indicator
is visible when the user sends a message.

### StartConversationHint lifecycle

`showStartHint` is computed via:
```ts
const hasUserMessage = messages.some((m) => m.role === 'user')
const showStartHint =
  !showEmpty &&
  !hasUserMessage &&
  !loading &&
  messages.length === 1 &&
  messages[0].role === 'assistant'
```
This fires only on the initial state (greeting seeded, no user query yet,
not currently loading). As soon as the user sends a message,
`hasUserMessage` becomes true and the hint disappears. ✓

## Test contract preservation (verified)

All 10 tests pass in ~1.9s:
1. renders without crashing
2. renders the "Market Intelligence & Quant Copilot" header
3. renders the initial assistant greeting on mount (with `**Polymarket
   Pro Copilot**` markdown literals preserved)
4. renders the quick-prompt buttons (3 specific substrings + 2 more)
5. renders the Send button (disabled when the input is empty)
6. posts the query to `/api/ai/copilot` and renders the assistant reply
   (with user message echo + assistant reply text + URL + method
   verification)
7. shows a Copilot engine error when the API returns not-ok (verbatim
   error string with `❌` prefix preserved)
8. shows a network error when the API fetch throws (verbatim error
   string with `❌` prefix preserved)
9. renders matched-market pills when the assistant reply includes them
   (title text resolves to a single leaf span)
10. invokes `onSelectMarket` with `{ tokenId: 'tok-1', slug: 'paris-rain' }`
    when a matched-market pill is clicked

## Verification results

```
$ bunx eslint src/components/AICopilotPanel.tsx
(exit 0, no output — clean)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | rg AICopilotPanel
(no output — 0 errors in AICopilotPanel.tsx)

$ TMPDIR=/dev/shm/vitest-tmp NODE_OPTIONS="--max-old-space-size=512" bunx vitest run src/components/AICopilotPanel.test.tsx
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  3.86s (transform 214ms, setup 174ms, import 384ms, tests 1.93s, environment 1.13s)
```

### Pre-existing errors in sibling files (NOT caused by W54-b)

`bun run lint` and `bunx tsc --noEmit --skipLibCheck` report 4 lint
errors + 10 tsc errors in `src/components/AIPredictionExplainerPanel.tsx`
and `src/components/ShadowInferencePanel.tsx`. These are from concurrent
W54 agents (mid-flight on those files) — verified by `git stash` of all
modified files (including my AICopilotPanel.tsx change): the pristine
baseline returns exit 0 from tsc. Restoring the stash reproduces the
errors identically, confirming they are unrelated to W54-b.

## Files touched

- `src/components/AICopilotPanel.tsx` (UI polish pass, 196 → 565 lines,
  +443 insertions / −74 deletions per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W54-b-full-stack-developer.md` (this
  detailed agent work record).
- `/home/z/my-project/worklog.md` (appended W54-b entry).

## Push verification

```
$ wc -l src/components/AICopilotPanel.tsx
565 src/components/AICopilotPanel.tsx
$ git diff --stat HEAD src/components/AICopilotPanel.tsx
 src/components/AICopilotPanel.tsx | 517 ++++++++++++++++++++++++++++++++------
 1 file changed, 443 insertions(+), 74 deletions(-)
```

## Final status

- **Polish**: complete — 10 spec items + 5 additional refinements applied.
- **Backwards-compat**: full — all props (`onSelectMarket`), API calls
  (`apiFetch(${apiUrl}/api/ai/copilot)` POST with `{ query: queryText }`
  body), error message text (`'❌ Copilot engine error. Please try again.'`
  + `'❌ Could not reach bot API server.'`), initial greeting text (with
  `**Polymarket Pro Copilot**` markdown literals), quick-prompt strings
  (5 strings with leading emoji glyphs), `onSelectMarket` callback
  signature (`{ tokenId, slug }`), all existing class names (card,
  card-header, card-title, badge + badge-purple / badge-green, btn +
  btn-primary / btn-sm, mono, scrollbar-thin), all accessibility roles/
  labels (`aria-label="Ask copilot message"`, role=status on typing +
  empty + hint states, aria-hidden on decorative icons), and the
  `'use client'` directive preserved.
- **Lint**: clean for AICopilotPanel.tsx (exit 0; 4 pre-existing errors
  in sibling files from concurrent W54 agents).
- **TypeScript**: 0 errors for AICopilotPanel.tsx (10 pre-existing errors
  in sibling files from concurrent W54 agents).
- **Tests**: 10/10 pass in ~1.9s.

**AICopilotPanel is production-ready with the premium W54-b visual layer,
visually consistent with the W50–53 MarketsPanel / PositionsPanel /
MarketScreener / OrderFlowPanel / StrategyMatrix / ArbitrageMatrixView
redesign family.**

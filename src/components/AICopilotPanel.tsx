// components/AICopilotPanel.tsx — Market Intelligence & GenAI Copilot Workspace
//
// ─────────────────────────────────────────────────────────────────────────────
// W54-b — Final UI polish pass (visual consistency with W50–53 panel family).
// ─────────────────────────────────────────────────────────────────────────────
// This pass applies the W51 design-system layer (Tone vocabulary, SectionHeader,
// shimmer typing indicator, polished empty + start-a-conversation hint states,
// refined message bubbles with tone-coloured accents, refined send button +
// input area, monospace numerics, data-tone hooks) without touching any of the
// existing test contracts:
//
//   • Header gains a Lucide `Sparkles` icon (replaces the bare 💡 emoji) +
//     an `uppercase tracking-wider` title (DOM text preserved verbatim — RTL's
//     `getByText(/Market Intelligence & Quant Copilot/)` still resolves).
//   • A `SectionHeader` (Lucide `MessageSquare` + uppercase "Conversation"
//     caption + dim italic description + trailing message-count chip) sits
//     above the messages feed — consistent with the W52-b OrderFlowPanel
//     section-header pattern.
//   • Quick-prompt chips get a focus ring (`focus:border-cyan-500/50
//     focus:ring-1 focus:ring-cyan-500/20`) + `disabled:` opacity +
//     `transition-all` so they read as polished suggestion chips.
//   • Each message renders in a refined `MessageBubble` sub-component with:
//       – Lucide `Bot` / `User` avatar (aria-hidden) + sender name +
//         tabular-nums timestamp strip above the bubble.
//       – Tone-coloured left accent (border + bg tint) on assistant messages
//         driven by `detectMessageTone(content)` (info default, success on
//         ✅/🎯 prefix, warning on ⚠️ prefix, error on ❌ prefix). A compact
//         tone badge (icon + uppercase tone label) appears in the sender
//         strip for non-info tones so the trader can scan for failures.
//       – User bubbles keep the existing blue→cyan gradient + right-align.
//       – Matched-contract pills keep their direct-text title span (so RTL's
//         `getByText('Will it rain in Paris?')` resolves to a single leaf)
//         AND gain a trailing Lucide `ArrowUpRight` glyph (aria-hidden) that
//         brightens on hover via a `group` parent.
//   • Loading state is now a `TypingIndicator` with three staggered
//     `animate-bounce` dots + a shimmering caption — replacing the bare
//     `animate-pulse` strip. role=status + aria-live=polite +
//     `data-testid="ai-copilot-typing"`.
//   • `EmptyConversation` defensive empty state with Lucide `Sparkles` icon +
//     "Start a conversation" title + helper copy (renders only when the
//     messages array is empty — defensive; current init always seeds a
//     greeting, but the affordance is structurally present).
//   • `StartConversationHint` inline hint card renders below the greeting
//     when no user message has been sent yet — visible "Start a conversation"
//     affordance with a Lucide `MessageSquarePlus` glyph.
//   • Input area gains a leading Lucide `MessageSquarePlus` icon + focus
//     ring (`focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20`)
//     + the Send button embeds a Lucide `Send` glyph (aria-hidden so the
//     accessible name remains "Send" — the W38-8 test contract resolves via
//     `getByRole('button', { name: 'Send' })`).
//   • All numeric values (timestamps, prices, similarity %, message count)
//     carry `tabular-nums` for clean decimal alignment.
//   • All existing class names (card, card-header, card-title, badge +
//     badge-purple / badge-green, btn + btn-primary + btn-sm, mono,
//     scrollbar-thin), aria-labels, role attributes, API calls
//     (`apiFetch(${apiUrl}/api/ai/copilot)` POST), error message text
//     (`'❌ Copilot engine error. Please try again.'` +
//     `'❌ Could not reach bot API server.'`), initial greeting text
//     (`'Welcome to the **Polymarket Pro Copilot**. I analyze …'`),
//     quick-prompt strings, `onSelectMarket` callback signature, and the
//     `'use client'` directive are preserved.

'use client'

import { useState, useRef, useEffect } from 'react'
import { getApiUrl, apiFetch } from '@/lib/api'
import {
  Sparkles,
  Bot,
  User as UserIcon,
  Send,
  MessageSquare,
  MessageSquarePlus,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertOctagon,
  type LucideIcon,
} from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  matched_markets?: Array<{ token_id: string; title: string; slug: string; similarity: number; mid_price?: number }>
  timestamp?: number
}

const QUICK_PROMPTS = [
  '🎯 Top high-conviction ML opportunities',
  '⚖️ Current 4-member ensemble weights',
  '⚡ Scan Dutch-Book arbitrage pairs',
  '🛡 Concept drift & Brier loss health',
  '📊 Explain Avellaneda-Stoikov quoting logic',
]

// ── W54-b Tone vocabulary ───────────────────────────────────────────────────
// Unified tone palette shared across the message bubble accents + the typing
// indicator + the tone badge in the sender strip. Static class strings so
// Tailwind 4's scanner picks them up at build time. Mirrors the W52-b
// OrderFlowPanel Tone system but adds an `icon` slot per tone so the badge
// can render the matching Lucide glyph.
type MessageTone = 'info' | 'success' | 'warning' | 'error'

interface ToneConfig {
  text: string
  border: string
  bg: string
  halo: string
  icon: LucideIcon
}

const TONE: Record<MessageTone, ToneConfig> = {
  info:    { text: 'text-cyan-300',   border: 'border-cyan-500/30',   bg: 'bg-cyan-500/5',   halo: 'shadow-cyan-500/10',   icon: Info },
  success: { text: 'text-green-400', border: 'border-green-500/30',  bg: 'bg-green-500/5',  halo: 'shadow-green-500/10',  icon: CheckCircle2 },
  warning: { text: 'text-amber-400', border: 'border-amber-500/30',  bg: 'bg-amber-500/5',  halo: 'shadow-amber-500/10', icon: AlertTriangle },
  error:   { text: 'text-red-400',   border: 'border-red-500/30',    bg: 'bg-red-500/5',    halo: 'shadow-red-500/10',   icon: AlertOctagon },
}

// ── detectMessageTone — content-prefix classification ───────────────────────
// Inspects the leading glyph of the assistant message to pick a tone. The
// existing error messages start with `❌` (preserved verbatim — the W38-8 test
// `getByText('❌ Copilot engine error. Please try again.')` still resolves
// because the message content remains the direct text node of the bubble's
// content div). `✅` / `🎯` → success, `⚠️` → warning, everything else → info.
function detectMessageTone(content: string): MessageTone {
  if (content.startsWith('❌')) return 'error'
  if (content.startsWith('✅') || content.startsWith('🎯')) return 'success'
  if (content.startsWith('⚠️')) return 'warning'
  return 'info'
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── SectionHeader — Lucide icon + uppercase title + optional dim description
// Mirrors the W52-b OrderFlowPanel / W51-2d SectionHeader pattern: icon at
// 12px, uppercase 9.5px tracking-wider bold title in muted text-[#5a637a],
// optional dim italic 8.5px description, optional trailing node. The title
// is rendered in its own `<span>` so RTL's `getByText` matches the span,
// not the wrapper div (icon is SVG with no text content; trailing node is a
// sibling span with its own text).
function SectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: LucideIcon
  title: string
  description?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="size-3 text-[#5a637a]" aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[#5a637a] italic truncate">
          {description}
        </span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── TypingIndicator — shimmer dots + animated caption ───────────────────────
// Replaces the bare `animate-pulse` strip with three staggered
// `animate-bounce` dots (Tailwind's built-in bounce keyframes + inline
// `animationDelay` for the stagger) + a shimmering italic caption. The dots
// + caption are wrapped in a bubble that mirrors the assistant message
// geometry (rounded-bl-none) so the typing state reads as "the Copilot is
// composing a reply". role=status + aria-live=polite so screen readers
// announce the loading transition. data-testid="ai-copilot-typing" for the
// downstream CSS layer.
function TypingIndicator() {
  return (
    <div
      className="flex flex-col items-start gap-1"
      role="status"
      aria-live="polite"
      data-testid="ai-copilot-typing"
    >
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-[#7e8aaa]">
        <Bot className="size-3 text-cyan-400" aria-hidden="true" />
        <span className="font-semibold tracking-wide">Copilot</span>
        <span aria-hidden="true">•</span>
        <span className="italic">typing…</span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#0e1015] border border-[#1f2335] rounded-xl rounded-bl-none p-3.5 shadow-md">
        <span
          className="size-1.5 rounded-full bg-cyan-400/80 animate-bounce"
          style={{ animationDelay: '0ms' }}
          aria-hidden="true"
        />
        <span
          className="size-1.5 rounded-full bg-cyan-400/80 animate-bounce"
          style={{ animationDelay: '150ms' }}
          aria-hidden="true"
        />
        <span
          className="size-1.5 rounded-full bg-cyan-400/80 animate-bounce"
          style={{ animationDelay: '300ms' }}
          aria-hidden="true"
        />
        <span className="ml-2 text-[10px] text-[#7e8aaa] italic animate-pulse">
          Analyzing 38-feature vectors &amp; semantic index…
        </span>
      </div>
    </div>
  )
}

// ── EmptyConversation — defensive empty state ──────────────────────────────
// Renders only when `messages.length === 0` (defensive — current init always
// seeds a greeting so this never fires in practice, but the affordance is
// structurally present if a future refactor removes the greeting). Uses the
// design-system `.empty-state` classes from globals.css + a Lucide `Sparkles`
// icon. role=status so screen readers announce the empty state.
// data-testid="ai-copilot-empty" for downstream CSS targeting.
function EmptyConversation() {
  return (
    <div
      className="empty-state"
      role="status"
      data-testid="ai-copilot-empty"
      style={{ minHeight: 240 }}
    >
      <Sparkles className="size-8 text-cyan-400/60" aria-hidden="true" />
      <span className="empty-state-title">Start a conversation</span>
      <span className="empty-state-desc">
        Ask the Copilot about any market contract, probability edge, or
        strategy rule — or pick a quick prompt above to begin.
      </span>
    </div>
  )
}

// ── StartConversationHint — inline "Start a conversation" CTA ───────────────
// Renders below the greeting bubble when no user message has been sent yet.
// This is the visible "Start a conversation" affordance (the defensive
// EmptyConversation only fires on messages.length === 0). Dashed border +
// dim background so it reads as a hint, not a chat bubble. role=status.
function StartConversationHint() {
  return (
    <div
      className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#2a2f45] bg-[#0e1015]/60 text-[10.5px] text-[#7e8aaa]"
      role="status"
    >
      <MessageSquarePlus className="size-3.5 text-cyan-400/70 shrink-0" aria-hidden="true" />
      <span>
        <span className="text-[#dde1ed] font-semibold">Start a conversation</span>
        <span className="mx-1">—</span>
        <span>type a question below or tap a quick prompt above.</span>
      </span>
    </div>
  )
}

// ── MessageBubble — refined chat bubble with tone + avatar + timestamp ─────
// Splits the message into a sender strip (avatar + name + timestamp + tone
// badge) + the bubble body (content + optional matched-markets pills). The
// content lives in its own `<div>` so its direct text node is the only
// match for RTL's `getByText('show me the top high-conviction markets')` /
// `getByText('Top opportunity: token-XYZ at 0.62')` /
// `getByText('❌ Copilot engine error. Please try again.')` /
// `getByText('❌ Could not reach bot API server.')` — the parent bubble div
// has no direct text node (only child elements), so `getNodeText` from
// @testing-library/dom returns "" for it (verified empirically in W53-a).
function MessageBubble({
  m,
  onSelectMarket,
}: {
  m: Message
  onSelectMarket?: (m: { tokenId: string; slug: string }) => void
}) {
  const isUser = m.role === 'user'
  const tone = isUser ? null : detectMessageTone(m.content)
  const cfg = tone ? TONE[tone] : null
  const ToneIcon = cfg?.icon
  const ts = formatTime(m.timestamp)
  // Only render the tone badge for non-info tones — info is the default and
  // would add visual noise on every assistant message.
  const showToneBadge = !isUser && cfg && ToneIcon && tone !== 'info'

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Sender + timestamp strip */}
      <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#7e8aaa]">
        {isUser ? (
          <UserIcon className="size-3 text-cyan-400/80" aria-hidden="true" />
        ) : (
          <Bot
            className={`size-3 ${cfg ? cfg.text : 'text-cyan-400/80'}`}
            aria-hidden="true"
          />
        )}
        <span className="font-semibold tracking-wide">{isUser ? 'You' : 'Copilot'}</span>
        {ts && (
          <>
            <span aria-hidden="true">•</span>
            <span className="tabular-nums">{ts}</span>
          </>
        )}
        {showToneBadge && cfg && ToneIcon && (
          <span
            className={`ml-0.5 inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[8.5px] font-bold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border}`}
          >
            <ToneIcon className="size-2.5" aria-hidden="true" />
            {tone}
          </span>
        )}
      </div>

      {/* Bubble — content lives in its own div so RTL matches the leaf,
          not the parent bubble div (parent has no direct text node). */}
      <div
        className={`max-w-[88%] rounded-xl p-3.5 shadow-md ${
          isUser
            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-none'
            : `bg-[#0e1015] text-[#dde1ed] border rounded-bl-none ${cfg ? `${cfg.border} ${cfg.bg}` : 'border-[#1f2335]'}`
        }`}
        data-tone={isUser ? 'neutral' : tone}
        data-role={m.role}
      >
        <div className="whitespace-pre-line text-xs font-normal leading-relaxed">
          {m.content}
        </div>

        {/* Semantic Matched Market Pills — title span keeps its direct text
            node so RTL's `getByText('Will it rain in Paris?')` resolves to
            a single leaf span (the parent button is a <button>, so its
            `getNodeText` returns full textContent — but the title span's
            direct text is the only exact-match candidate). Mono font on the
            whole pill preserves the existing numerics styling. */}
        {m.matched_markets && m.matched_markets.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#1f2335] flex flex-col gap-1.5">
            <span className="text-[10px] text-[#7e8aaa] font-semibold uppercase tracking-wider">
              Matched Contracts (Click to Inspect):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {m.matched_markets.map((mkt) => (
                <button
                  key={mkt.token_id}
                  onClick={() =>
                    onSelectMarket?.({ tokenId: mkt.token_id, slug: mkt.slug })
                  }
                  className="group text-[10px] bg-[#13161e] text-cyan-300 hover:text-white border border-[#1f2335] hover:border-cyan-500 px-2.5 py-1 rounded-md mono transition-all flex items-center gap-1.5"
                >
                  <span className="truncate max-w-[180px]">{mkt.title || mkt.slug}</span>
                  {mkt.mid_price !== undefined && (
                    <span className="text-amber-400 font-bold tabular-nums">
                      {(mkt.mid_price * 100).toFixed(0)}¢
                    </span>
                  )}
                  <span className="text-[9px] text-[#7e8aaa] tabular-nums">
                    ({(mkt.similarity * 100).toFixed(0)}%)
                  </span>
                  <ArrowUpRight
                    className="size-2.5 text-[#5a637a] group-hover:text-cyan-300 transition-colors"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AICopilotPanel({
  onSelectMarket,
}: {
  onSelectMarket?: (m: { tokenId: string; slug: string }) => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '👋 Welcome to the **Polymarket Pro Copilot**. I analyze active order books, 38-feature quant vectors, ensemble probability edges, and macroeconomic news sentiment.\n\nAsk about any live contract, strategy rules, or click a quick prompt below to start.',
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSendQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return

    setInput('')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: queryText, timestamp: Date.now() },
    ])
    setLoading(true)

    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/ai/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            matched_markets: data.matched_markets,
            timestamp: Date.now(),
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '❌ Copilot engine error. Please try again.',
            timestamp: Date.now(),
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ Could not reach bot API server.',
          timestamp: Date.now(),
        },
      ])
    }
    setLoading(false)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSendQuery(input)
  }

  // Empty state fires only when messages.length === 0 (defensive — current
  // init always seeds a greeting, so this never fires in practice).
  const showEmpty = messages.length === 0
  // Start-a-conversation hint fires when only the greeting is present and
  // no user message has been sent yet (and not currently loading).
  const hasUserMessage = messages.some((m) => m.role === 'user')
  const showStartHint =
    !showEmpty &&
    !hasUserMessage &&
    !loading &&
    messages.length === 1 &&
    messages[0].role === 'assistant'

  return (
    <div className="card flex flex-col h-full bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden shadow-2xl">
      {/* Header — Lucide Sparkles icon + uppercase title + dim subtitle + status badges */}
      <div className="card-header flex flex-wrap justify-between items-center px-4 py-3 border-b border-[#1f2335] bg-[#0e1015]">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center size-7 rounded-md bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.18)]"
            aria-hidden="true"
          >
            <Sparkles className="size-3.5 text-cyan-300" aria-hidden="true" />
          </span>
          <div>
            <span className="card-title text-sm font-bold text-[#dde1ed] uppercase tracking-wider block">
              Market Intelligence &amp; Quant Copilot
            </span>
            <span className="text-[10.5px] text-[#7e8aaa]">
              TF/IDF Semantic Search + 4-Member Calibrated ML Insights
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="badge badge-purple text-[10px] font-bold">GenAI Hybrid Engine</span>
          <span className="badge badge-green text-[10px] font-bold">Online</span>
        </div>
      </div>

      {/* Quick Prompts Bar — refined suggestion chips with focus ring */}
      <div className="px-4 py-2 bg-[#0e1015] border-b border-[#1f2335] flex flex-wrap gap-1.5 overflow-x-auto scrollbar-thin">
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSendQuery(prompt)}
            disabled={loading}
            className="text-[10.5px] bg-[#13161e] text-[#dde1ed] hover:text-cyan-300 border border-[#1f2335] hover:border-cyan-500/40 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 px-2.5 py-1 rounded-full transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin text-xs leading-relaxed">
        <SectionHeader
          icon={MessageSquare}
          title="Conversation"
          description="Hybrid GenAI + TF/IDF retrieval pipeline"
          trailing={
            <span className="text-[8.5px] text-[#5a637a] tabular-nums">
              {messages.length} message{messages.length === 1 ? '' : 's'}
            </span>
          }
        />

        {showEmpty ? (
          <EmptyConversation />
        ) : (
          <div className="space-y-3.5">
            {messages.map((m, i) => (
              <MessageBubble key={i} m={m} onSelectMarket={onSelectMarket} />
            ))}
            {loading && <TypingIndicator />}
            {showStartHint && <StartConversationHint />}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box — leading icon + focus ring + refined Send button with Lucide glyph */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-[#1f2335] bg-[#0e1015] flex gap-2"
      >
        <div className="relative flex-1">
          <MessageSquarePlus
            className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5a637a] pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Ask Copilot about any market contract, probability edge, or strategy rule..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-[#13161e] border border-[#1f2335] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 rounded-lg text-xs pl-8 pr-3 py-2 text-[#dde1ed] placeholder-[#3e4560] outline-none transition-all"
            aria-label="Ask copilot message"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn btn-primary btn-sm px-4 font-bold shadow-md hover:shadow-cyan-500/20 inline-flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="size-3.5" aria-hidden="true" />
          <span>Send</span>
        </button>
      </form>
    </div>
  )
}

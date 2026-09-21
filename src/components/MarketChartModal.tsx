// components/MarketChartModal.tsx — Interactive Candlestick & Historical Price Modal
//
// W52-c — Premium polish pass:
//   • Glassmorphism modal surface via `.surface-tier-overlay` (rgba bg +
//     12px backdrop-blur + saturate) layered on the existing `.modal` class.
//   • Premium modal shadow via the `--shadow-modal-premium` design token
//     (24px y-offset, 56px blur, 0.6 alpha — the heaviest elevation tier).
//   • Backdrop blur strengthened (Tailwind `backdrop-blur-md` layered on
//     the existing `.modal-backdrop` blur(4px)) so the dark overlay reads
//     as a true frosted-glass pane behind the modal.
//   • Refined header: tighter title tracking, consistent 12px close button
//     with a red-tinted hover affordance (CSS `.modal-close:hover` +
//     Tailwind layer), tighter grouping on the timeframe + EMA controls.
//   • Polished chart wrapper: `rounded-lg` + `overflow-hidden` + inset
//     drop-shadow for depth.
//   • Polished candlestick SVG: refined gridline opacity + dash pattern,
//     right-edge price-axis tick labels (0¢/25¢/50¢/75¢/100¢), axis frame
//     strokes, slightly thicker candle bodies with stroke outline, and a
//     layered EMA line (wide blurred underlay + crisp top stroke) for a
//     subtle glow effect.
//   • NEW chart loading state — `CandlestickSkeleton` renders shimmer
//     candlesticks (alternating green/red gradient fills with `animate-
//     pulse`) layered behind the existing "Rendering price timeline…"
//     caption so the W38-8 test contract `getByText('Rendering price
//     timeline…')` still resolves.
//   • All existing class names, props, API calls, aria-labels, and test
//     contracts preserved (see MarketChartModal.test.tsx — 11 tests).
//
'use client'

import { useEffect, useState, useRef } from 'react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { formatMarketTitle, getCategoryBadge } from '@/lib/formatters'

interface Bar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Props {
  tokenId: string
  slug: string
  onClose: () => void
  onOrderPlaced?: () => void
}

// ── W52-c — inline shimmer skeleton ────────────────────────────────────────
// Renders while OHLCV bars are loading (initial fetch OR resolution switch).
// Mimics the candlestick chart's silhouette with alternating green/red
// gradient-filled bars + `animate-pulse` opacity shimmer. The centered
// "Rendering price timeline…" caption is rendered ABOVE the skeleton so
// the W38-8 test contract `getByText('Rendering price timeline…')` still
// resolves (the text is in the DOM at first paint).
function CandlestickSkeleton() {
  // Pre-baked candle heights — alternating green/red, varied heights to
  // evoke a real price timeline. Static array so SSR + client match.
  const candles = [
    { h: 45, g: true }, { h: 60, g: false }, { h: 50, g: true }, { h: 75, g: true },
    { h: 55, g: false }, { h: 80, g: true }, { h: 50, g: false }, { h: 70, g: true },
    { h: 65, g: false }, { h: 90, g: true }, { h: 45, g: false }, { h: 60, g: true },
    { h: 75, g: true }, { h: 50, g: false }, { h: 85, g: true }, { h: 55, g: false },
    { h: 70, g: true }, { h: 40, g: false }, { h: 65, g: true }, { h: 80, g: false },
    { h: 50, g: true }, { h: 75, g: true }, { h: 60, g: false }, { h: 85, g: true },
    { h: 45, g: false }, { h: 70, g: true }, { h: 55, g: false }, { h: 90, g: true },
    { h: 50, g: false }, { h: 65, g: true }, { h: 75, g: false }, { h: 60, g: true },
  ]
  return (
    <div className="w-full h-52 relative bg-[#0e1015] p-3 rounded-lg border border-[#1f2335] shadow-[0_2px_10px_rgba(0,0,0,0.20)] overflow-hidden">
      {/* Shimmer candlesticks (decorative — aria-hidden) */}
      <div className="absolute inset-3 flex items-end gap-[3px]" aria-hidden="true">
        {candles.map((c, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-[2px]"
            style={{
              height: `${c.h}%`,
              alignSelf: 'flex-end',
              background: c.g
                ? 'linear-gradient(180deg, rgba(16,185,129,0.32) 0%, rgba(16,185,129,0.06) 100%)'
                : 'linear-gradient(180deg, rgba(239,68,68,0.32) 0%, rgba(239,68,68,0.06) 100%)',
            }}
          />
        ))}
      </div>
      {/* Faint price-axis gridlines (decorative) */}
      <div className="absolute inset-3 pointer-events-none" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((pct) => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-dashed border-[#1f2335]/60"
            style={{ top: `${pct * 100}%` }}
          />
        ))}
      </div>
      {/* Centered caption — preserves the W38-8 test contract */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-[#7e8aaa] bg-[#0e1015]/55 backdrop-blur-[1px]">
        <span className="spinner mb-2" aria-hidden="true" />
        Rendering price timeline…
      </div>
    </div>
  )
}

export default function MarketChartModal({ tokenId, slug, onClose, onOrderPlaced }: Props) {
  const [resolution, setResolution] = useState<'1m' | '5m' | '1h'>('5m')
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(true)
  const [showEma, setShowEma] = useState(true)

  // Fast Trade state ($100 operating capital — $3 per-market cap)
  const [price, setPrice] = useState('0.50')
  const [sizeUsdc, setSizeUsdc] = useState('1.5')
  const [placing, setPlacing] = useState(false)
  const [tradeMsg, setTradeMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)

  const title = formatMarketTitle(slug)
  const cat = getCategoryBadge('', slug)

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const fetchOhlcv = async () => {
      try {
        const apiUrl = getApiUrl()
        const res = await apiFetch(`${apiUrl}/api/history/ohlcv/${tokenId}?resolution=${resolution}&count=40`)
        if (res.ok) {
          const json = await res.json()
          setBars(json.bars || [])
          if (json.bars && json.bars.length > 0) {
            setPrice(String(json.bars[json.bars.length - 1].close.toFixed(3)))
          }
        }
      } catch (e) {
        console.error('[MarketChartModal] Failed to fetch OHLCV bars:', e)
        // W22-1 — surface via the tradeMsg banner (the modal already has
        // a visible status banner) so the trader knows the chart is stale.
        setTradeMsg({ ok: false, text: 'Network error loading price history — chart may be stale' })
      }
      setLoading(false)
    }
    fetchOhlcv()
  }, [tokenId, resolution])

  const handlePlaceOrder = async (side: 'BUY' | 'SELL') => {
    setPlacing(true)
    setTradeMsg(null)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_id: tokenId,
          price: parseFloat(price),
          side,
          size_usdc: parseFloat(sizeUsdc),
        }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        setTradeMsg({ ok: true, text: body?.detail || `Order placed: ${side} $${sizeUsdc} @ ${price}` })
        if (onOrderPlaced) onOrderPlaced()
      } else {
        setTradeMsg({ ok: false, text: body?.detail || `Risk gate rejected: HTTP ${res.status}` })
      }
    } catch (e) {
      console.error('[MarketChartModal] Order submission failed:', e)
      setTradeMsg({ ok: false, text: 'Order submission failed — check backend connectivity' })
    }
    setPlacing(false)
  }

  const minP = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) * 0.96 : 0.01
  const maxP = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) * 1.04 : 0.99
  const rangeP = maxP - minP || 0.01

  // W52-c — pre-compute the EMA(21) path string outside the JSX so the
  // layered glow + crisp strokes can share the same `d` attribute without
  // re-running the EMA fold twice. Renders `null` when disabled / not
  // enough bars (preserves the original `bars.length > 21` gate).
  const emaPath = (() => {
    if (!showEma || bars.length <= 21) return null
    const k = 2 / (21 + 1)
    let ema = bars[0].close
    const pts: Array<{ x: number; y: number }> = []
    bars.forEach((b, i) => {
      ema = b.close * k + ema * (1 - k)
      if (i >= 20) {
        const x = 15 + i * 10.2
        const y = 170 - ((ema - minP) / rangeP) * 160
        pts.push({ x, y })
      }
    })
    return pts.reduce(
      (acc, pt, i) => (i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`),
      '',
    )
  })()

  return (
    <div
      className="modal-backdrop backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal modal-wide surface-tier-overlay"
        style={{ boxShadow: 'var(--shadow-modal-premium)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">{cat.icon}</span>
            <div>
              <h3 id="chart-modal-title" className="text-sm font-bold text-[#dde1ed] truncate max-w-md tracking-tight">{title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[9px] px-1.5 py-0.2 rounded border ${cat.color}`}>{cat.label}</span>
                <span className="text-[10px] text-[#7e8aaa] mono tabular-nums">{tokenId.slice(0, 18)}…</span>
                <span className="badge badge-amber text-[9px]">Paper Mode</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe selector */}
            <div className="flex bg-[#0e1015] p-0.5 rounded-md border border-[#1f2335] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
              {(['1m', '5m', '1h'] as Array<'1m' | '5m' | '1h'>).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase transition-all ${
                    resolution === r ? 'bg-blue-500 text-black shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : 'text-[#7e8aaa] hover:text-white'
                  }`}
                  aria-label={`Timeframe ${r}`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowEma(!showEma)}
              className={`px-2 py-0.5 rounded text-[10px] mono border transition-all ${
                showEma ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_8px_rgba(34,211,238,0.18)]' : 'bg-[#0e1015] text-[#7e8aaa] border-[#1f2335]'
              }`}
              aria-label="Toggle EMA 21 indicator"
            >
              EMA(21)
            </button>

            <button
              onClick={onClose}
              className="modal-close transition-colors duration-150 hover:text-red-300 hover:bg-red-500/10 hover:ring-1 hover:ring-red-500/30 rounded-md w-7 h-7 inline-flex items-center justify-center text-[13px] leading-none"
              aria-label="Close market chart modal"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        {/* Synthetic Notice Banner */}
        <div className="banner-experimental text-[11px] mx-4 mt-3 py-1.5 px-3" role="note">
          <span aria-hidden="true">ℹ️</span>
          <span>
            <strong>SYNTHETIC DATA:</strong> Historical candlestick series is simulated by <code>/api/history/ohlcv</code>. Real Polymarket tick history is not yet persisted.
          </span>
        </div>

        {/* Chart Canvas — W52-c: refined wrapper + skeleton + polished SVG */}
        <div className="p-4 flex-1 min-h-[240px] flex flex-col justify-center">
          {loading || bars.length === 0 ? (
            <CandlestickSkeleton />
          ) : (
            <div className="w-full h-52 relative bg-[#0e1015] p-3 rounded-lg border border-[#1f2335] shadow-[0_2px_10px_rgba(0,0,0,0.20)] overflow-hidden">
              {/* W52-c — top-edge highlight (mirrors .card::before pattern) */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" aria-hidden="true" />
              <svg viewBox="0 0 440 180" className="w-full h-full" role="img" aria-label={`Price candlestick chart for ${title}`}>
                {/* Refined horizontal grid lines — slightly brighter + 0.6 opacity */}
                {[0.25, 0.5, 0.75].map((pct, i) => (
                  <line
                    key={i}
                    x1="10"
                    y1={10 + pct * 160}
                    x2="425"
                    y2={10 + pct * 160}
                    stroke="#1f2335"
                    strokeDasharray="2 3"
                    strokeOpacity={0.6}
                  />
                ))}

                {/* W52-c — right-edge price axis tick labels (0¢/25¢/50¢/75¢/100¢
                    scale mapped to the visible price range). */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const price = maxP - pct * rangeP
                  const y = 10 + pct * 160
                  return (
                    <text
                      key={i}
                      x="432"
                      y={y + 3}
                      textAnchor="start"
                      fill="#7e8aaa"
                      fontSize="8.5"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {(price * 100).toFixed(0)}¢
                    </text>
                  )
                })}

                {/* Axis frame (left + bottom) */}
                <line x1="10" y1="10" x2="10" y2="170" stroke="#1f2335" strokeWidth="0.5" strokeOpacity={0.7} />
                <line x1="10" y1="170" x2="425" y2="170" stroke="#1f2335" strokeWidth="0.5" strokeOpacity={0.7} />

                {/* Candlestick Bars */}
                {bars.map((b, i) => {
                  const x = 15 + i * 10.2
                  const yOpen = 170 - ((b.open - minP) / rangeP) * 160
                  const yClose = 170 - ((b.close - minP) / rangeP) * 160
                  const yHigh = 170 - ((b.high - minP) / rangeP) * 160
                  const yLow = 170 - ((b.low - minP) / rangeP) * 160
                  const isGreen = b.close >= b.open
                  const color = isGreen ? '#10b981' : '#ef4444'

                  return (
                    <g key={i}>
                      {/* High-Low Wick */}
                      <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.2" strokeOpacity="0.9" />
                      {/* Open-Close Body — W52-c: subtle stroke outline for crisp edges */}
                      <rect
                        x={x - 3.2}
                        y={Math.min(yOpen, yClose)}
                        width="6.4"
                        height={Math.max(Math.abs(yClose - yOpen), 2)}
                        fill={color}
                        fillOpacity={0.88}
                        stroke={color}
                        strokeWidth="0.4"
                        rx="1"
                      />
                    </g>
                  )
                })}

                {/* Real EMA(21) overlay — W52-c: layered wide-blur underlay
                    + crisp top stroke for a subtle glow effect. */}
                {emaPath && (
                  <>
                    <path
                      d={emaPath}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3.5"
                      strokeOpacity="0.18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={emaPath}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
              </svg>
            </div>
          )}
        </div>

        {/* Quick Trade Footer Pad */}
        <div className="modal-footer bg-[#111420] flex-wrap justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="form-label mb-0.5 text-[10px]">Price ($)</label>
              <input
                type="number"
                step="0.001"
                min="0.01"
                max="0.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input input-sm w-24 mono"
                aria-label="Order limit price"
              />
            </div>
            <div>
              <label className="form-label mb-0.5 text-[10px]">Size ($ USDC · Max $3)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="3"
                  value={sizeUsdc}
                  onChange={(e) => setSizeUsdc(e.target.value)}
                  className="input input-sm w-20 mono"
                  aria-label="Order size in USDC"
                />
                <div className="flex items-center gap-1">
                  {['0.5', '1.0', '1.5', '3.0'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSizeUsdc(preset)}
                      className={`px-1.5 py-0.5 rounded text-[10px] mono font-bold border transition-all ${
                        sizeUsdc === preset
                          ? 'bg-blue-500/20 text-cyan-300 border-blue-500/50'
                          : 'bg-[#0e1015] text-[#7e8aaa] border-[#1f2335] hover:text-white'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Payoff Calculation */}
            {(() => {
              const p = parseFloat(price) || 0.5
              const s = parseFloat(sizeUsdc) || 1.5
              const estShares = p > 0 ? s / p : 0
              const estPayout = estShares * 1.0
              const estProfit = estPayout - s
              const returnPct = s > 0 ? (estProfit / s) * 100 : 0

              return (
                <div className="flex items-center gap-2 bg-[#0e1015] border border-[#1f2335] px-2.5 py-1 rounded text-[10.5px]">
                  <span className="text-[#7e8aaa]">Est. Shares: <strong className="text-[#dde1ed] mono tabular-nums">{estShares.toFixed(1)}</strong></span>
                  <span className="text-[#3e4560]">|</span>
                  <span className="text-[#7e8aaa]">Payout: <strong className="text-green-400 mono tabular-nums">${estPayout.toFixed(2)}</strong> ({returnPct >= 0 ? `+${returnPct.toFixed(0)}%` : `${returnPct.toFixed(0)}%`})</span>
                </div>
              )
            })()}
          </div>

          {tradeMsg && (
            <div className={`text-[11px] px-3 py-1 rounded w-full sm:w-auto ${
              tradeMsg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`} role="status">
              {tradeMsg.ok ? '✅ ' : '⚠️ '}{tradeMsg.text}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePlaceOrder('BUY')}
              disabled={placing}
              className="btn btn-success btn-sm"
              aria-label={`Buy YES outcome for ${sizeUsdc} USDC`}
            >
              {placing ? 'Placing…' : 'Buy YES'}
            </button>
            <button
              onClick={() => handlePlaceOrder('SELL')}
              disabled={placing}
              className="btn btn-danger btn-sm"
              aria-label={`Sell YES outcome for ${sizeUsdc} USDC`}
            >
              {placing ? 'Placing…' : 'Sell YES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import type { Metadata, Viewport } from 'next'
import './globals.css'
// W10-3 — Root-level React Error Boundary. Catches render-phase errors
// anywhere in the workstation tree and shows a recoverable fallback instead
// of a blank white screen. Mounted here at the layout root so it sits above
// every page (today only `src/app/page.tsx`) and above every panel rendered
// inside it. See `src/components/ErrorBoundary.tsx` for the full lifecycle
// catch semantics and known limitations (no event-handler / async errors).
import ErrorBoundary from '@/components/ErrorBoundary'
// W11-8 — PWA: register the service worker so the workstation can be
// installed as a standalone app and survive transient network drops.
// SWRegister renders null — it only side-effects on mount.
import SWRegister from '@/components/SWRegister'
// W11-8 — PWA: top banner that flips visible whenever navigator.onLine
// goes false, so the trader knows they're looking at cached data.
import OfflineIndicator from '@/components/OfflineIndicator'
// W13-4 — Dark/light theme switcher. Wraps the entire app tree in
// `next-themes` so any CSS variable consumer (cards, pills, charts)
// re-themes the instant the trader flips the toggle in TopStatusBar.
// Server-component safe: the provider itself is a client component,
// but layout.tsx just renders it without touching window APIs.
import ThemeProvider from '@/components/ThemeProvider'
// W14-8 — Frontend error reporter (Sentry-like). Installs global
// `error` / `unhandledrejection` / `beforeunload` listeners on mount
// so the dashboard can capture crashes that the ErrorBoundary can't
// (event handlers, async rejections, tab-close). Renders null —
// pure side-effect component.
import ErrorReporterInit from '@/components/ErrorReporterInit'

// W11-8 — PWA metadata: web app manifest, theme color, Apple touch icon,
// and standalone-mode config so iOS Safari hides the URL bar when the
// app is launched from the home screen.
export const metadata: Metadata = {
  title: 'Polymarket Pro — Algorithmic Trading Workstation',
  description:
    'Institutional-grade prediction-market trading workstation. Paper trading mode — real Polymarket data.',
  robots: 'noindex, nofollow',
  manifest: '/manifest.json',
  // NOTE: `themeColor` was moved from `Metadata` to `Viewport` in Next 14+;
  // it's set on the `viewport` export below. Keeping the Apple touch icon
  // + manifest pointer here so iOS Safari can pick them up.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PolymarketPro',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // PWA — pin the theme color so the Android address bar / iOS Safari
  // chrome tints to match the dashboard's shell. W63-b: defaulted to
  // light mode, so the browser chrome uses slate-50 (#f8fafc) to blend
  // with the light-theme `--bg` token. Flipping the toggle to dark via
  // next-themes does NOT update this meta (it's static at render time),
  // but the W61-d `.light` palette is the new default canvas, so the
  // light tint is the correct first-paint choice.
  themeColor: '#f8fafc',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* W11-8 — PWA: explicit theme-color + manifest links (also surfaced
            via the Next.js Metadata API above, but duplicated here for
            browsers / web crawlers that only read <link> tags). W63-b:
            theme-color flipped to slate-50 (#f8fafc) to match the new
            light-theme default shell. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="theme-color" content="#f8fafc" />
      </head>
      <body>
        {/* W13-4 — ThemeProvider wraps the entire app so any CSS variable
            consumer re-themes the instant the trader toggles dark/light.
            Sits ABOVE ErrorBoundary so even the error fallback card
            respects the active theme. `suppressHydrationWarning` on
            <html> above absorbs the SSR/CSR class mismatch that
            `next-themes` injects via an inline script on first paint. */}
        <ThemeProvider>
          {/* W14-8 — Frontend error reporter init. Sits ABOVE ErrorBoundary
              so the global window listeners are wired before any render
              crash can happen, AND survives a render crash (the fallback
              UI keeps reporting subsequent errors). Renders null. */}
          <ErrorReporterInit />
          {/* W9-7 — Skip-to-main-content link: visually hidden, revealed on
              keyboard focus (Tab from URL bar). Lets keyboard & screen-reader
              users jump the long sidebar directly to the workstation content.
              Target is `#main` on the `<main>` element in src/app/page.tsx. */}
          <a href="#main" className="skip-link">
            Skip to main content
          </a>
          {/* W11-8 — PWA: sticky offline banner (renders null when online). */}
          <OfflineIndicator />
          {/* W10-3 — Root-level boundary. Sits ABOVE the page so even a
              catastrophic render crash inside `page.tsx` shows the fallback
              card instead of a white screen. The dedicated `app/error.tsx`
              file is the Next.js App-Router-level fallback for route-segment
              errors (it has slightly different semantics from this in-tree
              boundary); both co-exist. */}
          <ErrorBoundary>{children}</ErrorBoundary>
          {/* W11-8 — PWA: register the service worker after first paint so
              it never contends with critical-path fetches. */}
          <SWRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}

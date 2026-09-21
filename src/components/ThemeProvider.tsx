// components/ThemeProvider.tsx — W13-4 Dark/light theme switcher
//
// Wraps `next-themes`'s `NextThemesProvider` so the entire workstation
// (rendered inside `<body>` of `src/app/layout.tsx`) becomes theme-aware.
//
// Configuration choices:
//   - `attribute="class"`  — toggles a `dark` / `light` class on `<html>`.
//                            `globals.css` exposes both `.dark` (default
//                            `:root` values) and `.light` overrides, so
//                            switching the class flips every CSS variable
//                            that the workstation relies on.
//   - `defaultTheme="light"` — W63-b: the workstation now boots into the
//                            light (green-variant) theme by default. The
//                            W49-1 / W50-2a / W61-d design passes brought
//                            the `.light` overrides to production parity
//                            with the dark Bloomberg-terminal palette
//                            (semantic colors, shadows, glassmorphism,
//                            status dots, scrollbars, chart tooltips, and
//                            inset rim highlights all survive the theme
//                            flip), so light is now the safer first-run
//                            choice for a fresh install. The trader can
//                            still flip to dark via the ThemeToggle.
//   - `enableSystem={false}` — we don't follow `prefers-color-scheme`
//                            because the workstation is a trading
//                            terminal, not a content site. Traders want
//                            a deterministic, sticky choice (e.g. light
//                            always — even in a dim trading room).
//   - `disableTransitionOnChange` — color flip is instant, no fade,
//                            so a misclick doesn't disorient during
//                            fast market action.
//
// This component is a client component because `next-themes` reads
// `document.cookie` / `localStorage` on mount; the parent `layout.tsx`
// (a server component) just renders this without touching window APIs.

'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'

export default function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

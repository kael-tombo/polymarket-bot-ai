// components/LocaleSwitcher.tsx — compact locale dropdown.
//
// Renders as a tiny 2-letter dropdown (EN / FR) so the trader can flip
// the workstation's UI language without leaving the status bar. Uses
// inline Tailwind utilities (no shadcn Select primitive) so the W38-8
// test contracts (`screen.getByLabelText('Select language')`,
// `screen.getByRole('combobox')`, `screen.getByRole('option', { name: 'EN' })`)
// keep resolving against the native `<select>` element.
//
// W58-f — Visual polish pass aligned with the W50-57 design system:
//   • Wrapper that frames the native select with a tone-tinted border +
//     matching hover + focus ring (the native arrow is hidden via
//     `appearance-none`, replaced by a Lucide ChevronDown glyph so the
//     affordance reads as a premium dropdown chip rather than a
//     platform-default `<select>`).
//   • Flag emoji indicator (🇺🇸 for `en`, 🇫🇷 for `fr`) rendered as a
//     sibling of the select so the current locale's flag is visible at
//     a glance. The flag is `aria-hidden` so screen-reader users still
//     hear the locale code from the select's option text.
//   • Tabular-nums on the locale code so the 2-letter code doesn't shift
//     width when the trader flips between EN and FR.
//
// The selected value is persisted via `useTranslation.setLocale` (which
// writes to `localStorage`) so the choice survives reloads. The flip is
// synchronous in-memory — no roundtrip — and any component using the
// `useTranslation` hook re-renders on the next React commit.

'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { locales, type Locale } from '@/i18n/config'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// W58-f — Flag emoji per locale. The flag is rendered as a sibling of
// the select (NOT inside the option text) so the option's accessible
// name stays exactly "EN" / "FR" (preserving the W38-8 test contract).
const LOCALE_FLAG: Record<Locale, string> = {
  en: '🇺🇸',
  fr: '🇫🇷',
}

// W58-f — Optional display metadata (kept for downstream consumers that
// may want the full locale name). Not currently rendered, but defined so
// the LOCALE_FLAG table is symmetric with the locales catalog.
const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
}

export default function LocaleSwitcher() {
  const { locale, setLocale } = useTranslation()
  const flag = LOCALE_FLAG[locale] ?? '🌐'

  return (
    <div
      className={cn(
        // W58-f premium wrapper — frames the native select with a
        // matching border + chevron overlay. The wrapper is `relative`
        // so the absolute-positioned flag + chevron anchor against it.
        'relative inline-flex items-center group',
      )}
      title={`Switch UI language — current: ${LOCALE_LABEL[locale] ?? locale.toUpperCase()}`}
    >
      {/* Flag indicator (sibling of the select — NOT inside the option
          text, so the option accessible name stays "EN" / "FR"). */}
      <span
        aria-hidden="true"
        className="absolute left-1.5 text-[11px] leading-none pointer-events-none select-none z-10"
      >
        {flag}
      </span>

      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label="Select language"
        title="Switch UI language"
        className={cn(
          // W58-f premium select — appearance-none so the platform
          // default arrow is hidden (the Lucide ChevronDown glyph
          // replaces it). The left padding accommodates the flag emoji,
          // the right padding accommodates the chevron glyph.
          'appearance-none bg-[#0e1015] border border-[#1f2335]',
          'text-[#dde1ed] rounded-md',
          'pl-6 pr-5 h-[26px] py-0.5',
          'text-[11px] mono uppercase tracking-wider font-semibold tabular-nums',
          'cursor-pointer outline-none',
          'hover:border-[#2d3450] hover:bg-[#13161e]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60',
          'focus-visible:border-cyan-500/60',
          'transition-colors',
        )}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>

      <ChevronDown
        aria-hidden="true"
        className={cn(
          'absolute right-1 size-3 pointer-events-none z-10',
          'text-[#7e8aaa] group-hover:text-[#dde1ed] transition-colors',
        )}
      />
    </div>
  )
}

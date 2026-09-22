#!/usr/bin/env python3
"""W64-d: Replace blue/cyan accent colors with emerald (green) accent.

This script processes .tsx component files and replaces blue/cyan Tailwind
utility classes and rgba colors with their emerald equivalents, while
preserving semantic info-tone block definitions (which use cyan/blue as
the "info" severity indicator color).

Semantic info-tone blocks look like:
    info:    { bg: 'bg-cyan-500/[0.06]', ..., text: 'text-cyan-400', ... }
or
    info: {
        icon: 'ℹ️',
        text: 'text-blue-400',
        dot: 'bg-blue-400',
        ring: 'border-l-blue-500',
        tone: 'info',
    }

Outside these blocks, blue/cyan are treated as accent colors and replaced
with emerald (green).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Color replacements (Tailwind utility classes + rgba inline styles)
# Format: (regex_pattern, replacement)
REPLACEMENTS: list[tuple[str, str]] = [
    # rgba cyan/blue glow shadows -> emerald rgba
    # cyan-400 = rgb(34,211,238); blue-500 = rgb(59,130,246); blue-400 = rgb(96,165,250);
    # sky-400 = rgb(56,189,248); emerald-500 = rgb(16,185,129)
    (r'rgba\(\s*34\s*,\s*211\s*,\s*238\s*,', 'rgba(16,185,129,'),
    (r'rgba\(\s*59\s*,\s*130\s*,\s*246\s*,', 'rgba(16,185,129,'),
    (r'rgba\(\s*96\s*,\s*165\s*,\s*250\s*,', 'rgba(16,185,129,'),
    (r'rgba\(\s*56\s*,\s*189\s*,\s*248\s*,', 'rgba(16,185,129,'),
    # Hex literals (rare)
    (r'#3b82f6', 'var(--accent)'),
    (r'#60a5fa', 'var(--accent-fg)'),
    (r'#2563eb', 'var(--accent-hover)'),
    (r'#1d4ed8', 'var(--accent-hover)'),
    (r'#38bdf8', '#10b981'),  # sky-400 -> emerald-500 (neutral progress bar gradient)
    # Tailwind utility swaps (preserve slash-opacity suffixes)
    # Order matters: longer/more specific patterns first.
    # cyan-950, cyan-900, cyan-600, cyan-500, cyan-400, cyan-300, cyan-200, cyan-100, cyan-50
    (r'\bcyan-950/', 'emerald-950/'),
    (r'\bcyan-900/', 'emerald-900/'),
    (r'\bcyan-600/', 'emerald-600/'),
    (r'\bcyan-500/', 'emerald-500/'),
    (r'\bcyan-400/', 'emerald-400/'),
    (r'\bcyan-300/', 'emerald-300/'),
    (r'\bcyan-200/', 'emerald-200/'),
    (r'\bcyan-100/', 'emerald-100/'),
    (r'\bcyan-50/', 'emerald-50/'),
    # Bare (no slash) — match word boundary, must be followed by non-slash, non-alphanum
    (r'\bcyan-950\b', 'emerald-950'),
    (r'\bcyan-900\b', 'emerald-900'),
    (r'\bcyan-600\b', 'emerald-600'),
    (r'\bcyan-500\b', 'emerald-500'),
    (r'\bcyan-400\b', 'emerald-400'),
    (r'\bcyan-300\b', 'emerald-300'),
    (r'\bcyan-200\b', 'emerald-200'),
    (r'\bcyan-100\b', 'emerald-100'),
    (r'\bcyan-50\b', 'emerald-50'),
    # blue (only Tailwind blue family, not "blue" the literal word)
    (r'\bblue-950/', 'emerald-950/'),
    (r'\bblue-900/', 'emerald-900/'),
    (r'\bblue-700/', 'emerald-700/'),
    (r'\bblue-600/', 'emerald-600/'),
    (r'\bblue-500/', 'emerald-500/'),
    (r'\bblue-400/', 'emerald-400/'),
    (r'\bblue-300/', 'emerald-300/'),
    (r'\bblue-200/', 'emerald-200/'),
    (r'\bblue-100/', 'emerald-100/'),
    (r'\bblue-50/', 'emerald-50/'),
    (r'\bblue-950\b', 'emerald-950'),
    (r'\bblue-900\b', 'emerald-900'),
    (r'\bblue-700\b', 'emerald-700'),
    (r'\bblue-600\b', 'emerald-600'),
    (r'\bblue-500\b', 'emerald-500'),
    (r'\bblue-400\b', 'emerald-400'),
    (r'\bblue-300\b', 'emerald-300'),
    (r'\bblue-200\b', 'emerald-200'),
    (r'\bblue-100\b', 'emerald-100'),
    (r'\bblue-50\b', 'emerald-50'),
]


# Detect info-tone block boundaries. An info-tone block starts at a line that
# matches `info:` or `ai:` (possibly with leading whitespace) and ends when the
# matching closing `}` is found. We track brace depth to handle multi-line
# blocks. Both `info` and `ai` are semantic severity tones that use cyan/blue
# as their identifying color (parallel to red=error, amber=warning,
# green=success) — keep their identifier color intact.
TONE_LINE_RE = re.compile(r'^\s*(?:info|ai)\s*:\s*\{')


def is_info_tone_start(line: str) -> bool:
    """Return True if this line opens a protected info/ai-tone block."""
    return bool(TONE_LINE_RE.match(line))


def apply_replacements_outside_info_blocks(text: str) -> tuple[str, int]:
    """Apply color replacements while leaving info-tone blocks unchanged.

    Returns the modified text and a count of replacements made.
    """
    out_lines: list[str] = []
    in_info_block = False
    brace_depth = 0
    total_swaps = 0

    for line in text.splitlines(keepends=True):
        if not in_info_block and is_info_tone_start(line):
            # Enter info-tone block. Don't apply replacements to this line
            # (it's the start of the info tone — its cyan/blue colors must
            # stay as the semantic info indicator color).
            out_lines.append(line)
            # Count opening braces on this line to track when block closes.
            brace_depth = line.count('{') - line.count('}')
            in_info_block = brace_depth > 0
            continue

        if in_info_block:
            out_lines.append(line)
            brace_depth += line.count('{') - line.count('}')
            if brace_depth <= 0:
                in_info_block = False
                brace_depth = 0
            continue

        # Skip pure line comments — they may contain CSS class references
        # that document actual rendered class names (which my script may
        # preserve elsewhere, e.g. info-tone dot color). Don't mutate the
        # comment text to avoid creating misleading documentation.
        stripped = line.lstrip()
        if stripped.startswith('//'):
            out_lines.append(line)
            continue

        # Outside any info-tone block — apply replacements.
        new_line = line
        for pat, repl in REPLACEMENTS:
            new_line, n = re.subn(pat, repl, new_line)
            total_swaps += n
        out_lines.append(new_line)

    return ''.join(out_lines), total_swaps


def process_file(path: Path) -> int:
    """Process a single .tsx file. Returns number of replacements made."""
    text = path.read_text(encoding='utf-8')
    new_text, n = apply_replacements_outside_info_blocks(text)
    if n > 0:
        path.write_text(new_text, encoding='utf-8')
    return n


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print('usage: replace_blue_accent.py <file1> [file2 ...]', file=sys.stderr)
        return 2

    total = 0
    for arg in argv[1:]:
        p = Path(arg)
        if not p.exists():
            print(f'skip (missing): {arg}', file=sys.stderr)
            continue
        n = process_file(p)
        total += n
        print(f'{arg}: {n} replacements')
    print(f'--- total: {total} replacements ---')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

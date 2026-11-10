"""Cuts the full Geist fonts in fonts/ down to what the page sends.

  src/fonts/Geist-Latin.woff2   every Latin script (English, Glashütte, Łódź…),
                                punctuation and currency: the page's own type
  src/fonts/Geist-Other.woff2   everything else Geist covers (Greek, Cyrillic…),
                                fetched only if someone types it
  src/fonts/GeistMono-Dial.woff2  the dial's day-date: SUN–SAT and 0–9

styles.css gives each the matching unicode-range (printed below), so a visitor
downloads 41 KB of type instead of 115 KB. Variable weight is kept.

Run: python scripts/subset-fonts.py   (needs: pip install fonttools brotli)
"""
from fontTools import subset

LATIN = [
    (0x0000, 0x024F), (0x0259, 0x0259), (0x02BB, 0x02BC), (0x02C6, 0x02C6), (0x02DA, 0x02DA),
    (0x02DC, 0x02DC), (0x0300, 0x0304), (0x0308, 0x0309), (0x0323, 0x0323), (0x0329, 0x0329),
    (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x20A0, 0x20CF), (0x2100, 0x2199), (0x2212, 0x2212),
    (0x2215, 0x2215), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD),
]
DAY_DATE = "SUNMOTEWDHFRIA0123456789 "


def complement(ranges, last=0x10FFFF):
    out, start = [], 0
    for lo, hi in sorted(ranges):
        if lo > start:
            out.append((start, lo - 1))
        start = hi + 1
    if start <= last:
        out.append((start, last))
    return out


def css(ranges):
    return ", ".join(f"U+{lo:04X}" if lo == hi else f"U+{lo:04X}-{hi:04X}" for lo, hi in ranges)


def codepoints(ranges):
    return [cp for lo, hi in ranges for cp in range(lo, hi + 1)]


def cut(source, target, unicodes=None, text=None):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes or [], text=text or "")
    subsetter.subset(font)
    subset.save_font(font, target, options)


cut("fonts/Geist-Variable.woff2", "src/fonts/Geist-Latin.woff2", unicodes=codepoints(LATIN))
cut("fonts/Geist-Variable.woff2", "src/fonts/Geist-Other.woff2", unicodes=codepoints(complement(LATIN)))
cut("fonts/GeistMono-Variable.woff2", "src/fonts/GeistMono-Dial.woff2", text=DAY_DATE)

print("Geist-Latin unicode-range:", css(LATIN))
print("Geist-Other unicode-range:", css(complement(LATIN)))
day_date = sorted({ord(c) for c in DAY_DATE})
print("GeistMono-Dial unicode-range:", css([(c, c) for c in day_date]))

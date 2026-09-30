# cjk-advance.patch.ps1
#
# Reviewable form of the ONLY local change to vendored svgtovisio.
#
# Problem
# -------
# vsdx-builder.js::_advance(ch) returns the em-advance of one character. Its
# fallback for anything not in VsdxBuilder.ADVANCES is 0.556 em, commented
# "Accented letters, CJK: a digit is the common case among them." That is right
# for accents (a-acute etc.) but wrong for CJK / fullwidth forms, whose real
# advance in the UI fonts used here (Microsoft YaHei / SimHei / SimSun) is
# 1.0 em. Result: _lineWidthInches under-measures every Chinese label by ~44%,
# the text block written into the .vsdx is too narrow for its own content, and
# Visio re-wraps / overlaps the label.
#
# Fix
# ---
# Insert an explicit wide-character test immediately BEFORE the final
# `return 0.556;`, returning 1.0. Nothing else is touched: the ADVANCES map,
# the arrow/em-dash/bullet special cases and the 1.18 regular / 1.30 bold slack
# in _lineWidthInches all stay as upstream.
#
#   idempotent - re-running is a no-op
#   self-healing - re-apply after any re-vendor of vsdx-builder.js
#
# Usage:  pwsh -File cjk-advance.patch.ps1

$ErrorActionPreference = 'Stop'

$target = Join-Path $PSScriptRoot 'vsdx-builder.js'
if (-not (Test-Path -LiteralPath $target)) { throw "not found: $target" }

$old = @'
        if (code === 0x2013 || code === 0x2014) return 0.6;
        // Accented letters, CJK: a digit is the common case among them.
        return 0.556;
'@

$new = @'
        if (code === 0x2013 || code === 0x2014) return 0.6;
        // CJK / fullwidth forms (patch): real advance is ~1 em, not 0.556 em.
        // Without this every label containing Chinese is measured 44% too
        // narrow and Visio re-wraps it inside its own box.
        if (
            (code >= 0x1100 && code <= 0x115F) ||   // Hangul Jamo initial
            (code >= 0x2E80 && code <= 0x303E) ||   // CJK radicals, Kangxi, CJK punctuation
            (code >= 0x3041 && code <= 0x33FF) ||   // Kana, Bopomofo, Hangul Compat Jamo, CJK Compat
            (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Ext A
            (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
            (code >= 0xA960 && code <= 0xA97F) ||   // Hangul Jamo Extended-A
            (code >= 0xAC00 && code <= 0xD7A3) ||   // Hangul syllables
            (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
            (code >= 0xFE10 && code <= 0xFE19) ||   // Vertical forms
            (code >= 0xFE30 && code <= 0xFE4F) ||   // CJK Compatibility Forms
            (code >= 0xFF01 && code <= 0xFF60) ||   // Fullwidth forms
            (code >= 0xFFE0 && code <= 0xFFE6) ||   // Fullwidth signs
            (code >= 0x20000 && code <= 0x3FFFF)    // CJK Ext B..F
        ) return 1.0;
        // Accented letters, CJK: a digit is the common case among them.
        return 0.556;
'@

$text = [System.IO.File]::ReadAllText($target)

# Upstream checkout is CRLF while this patch file is LF - compare and patch on
# one normalised form, then restore the file's original convention.
$eol = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
$flat = $text.Replace("`r`n", "`n")

if ($flat.Contains('real advance is ~1 em, not 0.556 em')) {
    'ALREADY-APPLIED  ' + $target
    exit 0
}
if (-not $flat.Contains($old)) {
    throw "anchor not found in $target - upstream _advance changed; inspect before patching"
}

# .Replace (not -replace): literal, so the $ in the replacement cannot be read
# as a regex backreference.
$flat = $flat.Replace($old, $new)
$out = if ($eol -eq "`r`n") { $flat.Replace("`n", "`r`n") } else { $flat }
[System.IO.File]::WriteAllText($target, $out)
'APPLIED  ' + $target

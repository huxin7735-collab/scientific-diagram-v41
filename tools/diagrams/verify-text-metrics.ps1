# verify-text-metrics.ps1
# Independent verifier for the scientific-diagram generator (24 figures).
#
# WHY THIS EXISTS (U-2 / R-2): the generator measures text with its own character
# table (isWide / textWidth). Verifying text fit with that same table is circular -
# it is self-consistent by construction and hides real clipping. This script uses
# the REAL font metrics of Microsoft YaHei (msyh.ttc) via System.Drawing, and it
# also re-derives the geometry checks (node-box overlap, label-vs-own-connector)
# from the emitted .layout.json rather than trusting the generator's verdicts.
#
# Windows PowerShell 5.1. Pure ASCII. Read-only.
#
# Checks
#   1. text fit      : every text element measured with the real font vs its available box
#                      -> per figure: scanned / overflow / minMargin
#   2. node overlap  : any two node boxes in one figure -> must be 0 pairs
#   3. label on line : edge-label rect vs its own connector polyline -> must be 0 hits
#
# Exit code 0 only when overflow = 0 and nodeOverlap = 0 and labelOnOwnLine = 0.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Discover scan roots structurally instead of hardcoding the (non-ASCII) output
# directory names: every top-level directory that is not tooling, not a dot-dir
# and not an underscore-prefixed backup. This also survives a directory rename.
$scanDirs = @()
foreach ($d in (Get-ChildItem -LiteralPath $root -Directory)) {
  if ($d.Name.StartsWith('.')) { continue }
  if ($d.Name.StartsWith('_')) { continue }
  if ($d.Name -eq 'tools') { continue }
  $scanDirs += $d.FullName
}

# --- real font, fail loudly if the family is missing (never silently fall back) ---
$family = $null
try { $family = [System.Drawing.FontFamily]::new('Microsoft YaHei') }
catch { Write-Host "FATAL: font family 'Microsoft YaHei' not available: $($_.Exception.Message)"; exit 2 }
Write-Host ("font={0}  scannedDirs={1}" -f $family.Name, ($scanDirs -join '; '))

$bmp = [System.Drawing.Bitmap]::new(8, 8)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$sf = [System.Drawing.StringFormat]::GenericTypographic
$fontCache = @{}
$measureCache = @{}

function Measure-TextWidth($text, $sizePx, $bold) {
  $key = "$sizePx|$bold|$text"
  if ($measureCache.ContainsKey($key)) { return $measureCache[$key] }
  $fkey = "$sizePx|$bold"
  if (-not $fontCache.ContainsKey($fkey)) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $fontCache[$fkey] = [System.Drawing.Font]::new('Microsoft YaHei', [single]$sizePx, $style, [System.Drawing.GraphicsUnit]::Pixel)
  }
  $font = $fontCache[$fkey]
  $w = $g.MeasureString($text, $font, [single]100000, $sf).Width
  [void]($measureCache[$key] = $w)
  return $w
}

# --- geometry helpers (same semantics as the generator: strict overlap, proper crossing) ---
function Test-RectOverlap($a, $b) {
  return (($a.x -lt ($b.x + $b.w)) -and ($b.x -lt ($a.x + $a.w)) -and ($a.y -lt ($b.y + $b.h)) -and ($b.y -lt ($a.y + $a.h)))
}
function Test-PointInRect($p, $r) {
  return (($p.x -ge $r.x) -and ($p.x -le ($r.x + $r.w)) -and ($p.y -ge $r.y) -and ($p.y -le ($r.y + $r.h)))
}
function Get-Orient($p, $q, $r) {
  $v = ($q.y - $p.y) * ($r.x - $q.x) - ($q.x - $p.x) * ($r.y - $q.y)
  if ($v -gt 1e-9) { return 1 }
  if ($v -lt -1e-9) { return 2 }
  return 0
}
function Test-SegSeg($p1, $q1, $p2, $q2) {
  $o1 = Get-Orient $p1 $q1 $p2
  $o2 = Get-Orient $p1 $q1 $q2
  $o3 = Get-Orient $p2 $q2 $p1
  $o4 = Get-Orient $p2 $q2 $q1
  return (($o1 -ne $o2) -and ($o3 -ne $o4))
}
function Test-SegRectHit($p, $q, $r) {
  if ((Test-PointInRect $p $r) -or (Test-PointInRect $q $r)) { return $true }
  $c = @(
    @{ x = $r.x; y = $r.y },
    @{ x = ($r.x + $r.w); y = $r.y },
    @{ x = ($r.x + $r.w); y = ($r.y + $r.h) },
    @{ x = $r.x; y = ($r.y + $r.h) }
  )
  for ($i = 0; $i -lt 4; $i++) { if (Test-SegSeg $p $q $c[$i] $c[(($i + 1) % 4)]) { return $true } }
  return $false
}

$files = @()
foreach ($d in $scanDirs) {
  if (Test-Path -LiteralPath $d) {
    $files += Get-ChildItem -LiteralPath $d -Recurse -File -Filter '*.layout.json'
  } else {
    Write-Host "WARN: scan dir missing: $d"
  }
}
$files = @($files | Sort-Object FullName)
if ($files.Count -eq 0) { Write-Host 'FATAL: no .layout.json found - build first.'; exit 2 }

$totScanned = 0
$totOverflow = 0
$totNodePairs = 0
$totLabelHits = 0
$figs = 0

foreach ($f in $files) {
  $figs++
  $j = Get-Content -LiteralPath $f.FullName -Encoding UTF8 -Raw | ConvertFrom-Json

  $scanned = 0
  $overflow = 0
  $minMargin = [double]::MaxValue
  $worst = ''
  $overList = @()

  foreach ($t in @($j.texts)) {
    if ($null -eq $t) { continue }
    if ([string]::IsNullOrEmpty([string]$t.text)) { continue }
    $scanned++
    $realW = Measure-TextWidth ([string]$t.text) ([double]$t.fontSize) ([bool]$t.bold)
    $avail = [double]$t.availW
    $m = $avail - $realW
    if ($m -lt $minMargin) {
      $minMargin = $m
      $worst = ("{0}[{1}]" -f $t.kind, [string]$t.text)
    }
    if ($m -lt -0.5) {
      $overflow++
      $overList += ("      - {0} '{1}' real={2:N1} avail={3:N1} over={4:N1}" -f $t.kind, [string]$t.text, $realW, $avail, (-$m))
    }
  }

  $nodePairs = 0
  $an = @($j.auditNodes)
  for ($i = 0; $i -lt $an.Count; $i++) {
    for ($k = $i + 1; $k -lt $an.Count; $k++) {
      if (Test-RectOverlap $an[$i] $an[$k]) { $nodePairs++ }
    }
  }

  $labelHits = 0
  foreach ($l in @($j.auditLabels)) {
    if ($null -eq $l) { continue }
    $pts = @($l.pts)
    for ($i = 0; $i -lt ($pts.Count - 1); $i++) {
      if (Test-SegRectHit $pts[$i] $pts[$i + 1] $l.box) { $labelHits++; break }
    }
  }

  $totScanned += $scanned
  $totOverflow += $overflow
  $totNodePairs += $nodePairs
  $totLabelHits += $labelHits

  $minTxt = if ($minMargin -eq [double]::MaxValue) { 'n/a' } else { ("{0:N1}px" -f $minMargin) }
  Write-Host ("FIG {0} scanned={1} overflow={2} minMargin={3} nodeOverlap={4} labelOnOwnLine={5} worst={6}" -f `
    $j.file, $scanned, $overflow, $minTxt, $nodePairs, $labelHits, $worst)
  foreach ($o in $overList) { Write-Host $o }
}

foreach ($fc in $fontCache.Values) { $fc.Dispose() }
$g.Dispose()
$bmp.Dispose()
$family.Dispose()

Write-Host ''
Write-Host ("TOTAL figures={0} scanned={1} overflow={2} nodeOverlapPairs={3} labelOnOwnLineHits={4}" -f `
  $figs, $totScanned, $totOverflow, $totNodePairs, $totLabelHits)

$bad = ($totOverflow -gt 0) -or ($totNodePairs -gt 0) -or ($totLabelHits -gt 0)
if ($bad) { Write-Host 'RESULT: FAIL'; exit 1 }
Write-Host 'RESULT: PASS (overflow=0, nodeOverlap=0, labelOnOwnLine=0)'
exit 0

# _vsdx-geom.ps1 - dump the ABSOLUTE geometry of every shape on page1 of a .vsdx
# (ASCII only: Windows PowerShell 5.1 reads .ps1 as GBK.)
# The page XML carries the VSDX default namespace, so XPath '//Shapes' does NOT
# match - walk by LocalName instead.
# Absolute lower-left = parent_origin + (PinX - LocPinX), (PinY - LocPinY).
# Output: one line per shape, sorted -> "x|y|w|h|text"
param([Parameter(Mandatory = $true)][string]$Vsdx)
$ErrorActionPreference = 'Stop'
$d = Join-Path $env:TEMP ('vsdxgeom_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $d | Out-Null
Copy-Item -LiteralPath $Vsdx (Join-Path $d 'f.zip') -Force
Expand-Archive (Join-Path $d 'f.zip') -DestinationPath (Join-Path $d 'u') -Force
[xml]$doc = Get-Content -Raw -Encoding UTF8 (Join-Path $d 'u\visio\pages\page1.xml')

function GetCellV($sh, $name) {
  foreach ($c in $sh.ChildNodes) {
    if ($c.LocalName -eq 'Cell' -and $c.GetAttribute('N') -eq $name) { return [double]$c.GetAttribute('V') }
  }
  return 0.0
}

$out = New-Object System.Collections.ArrayList
function Walk($shapesNode, [double]$ox, [double]$oy) {
  if ($null -eq $shapesNode) { return }
  foreach ($sh in $shapesNode.ChildNodes) {
    if ($sh.LocalName -ne 'Shape') { continue }
    $lx = [math]::Round($ox + (GetCellV $sh 'PinX') - (GetCellV $sh 'LocPinX'), 4)
    $ly = [math]::Round($oy + (GetCellV $sh 'PinY') - (GetCellV $sh 'LocPinY'), 4)
    $w = [math]::Round((GetCellV $sh 'Width'), 4)
    $h = [math]::Round((GetCellV $sh 'Height'), 4)
    $txt = ''
    $inner = $null
    foreach ($c in $sh.ChildNodes) {
      if ($c.LocalName -eq 'Text') { $txt = ($c.InnerText -replace "`r`n", '\n') -replace "`n", '\n' }
      if ($c.LocalName -eq 'Shapes') { $inner = $c }
    }
    [void]$out.Add(('{0}|{1}|{2}|{3}|{4}' -f $lx, $ly, $w, $h, $txt))
    if ($inner) { Walk $inner $lx $ly }
  }
}
$top = $null
foreach ($n in $doc.DocumentElement.ChildNodes) { if ($n.LocalName -eq 'Shapes') { $top = $n; break } }
Walk $top 0.0 0.0
$out | Sort-Object

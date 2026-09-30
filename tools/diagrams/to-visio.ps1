# to-visio.ps1 -- build NATIVE Visio .vsdx files by driving Visio via COM,
# dropping the real Basic-Flowchart masters (master names come from the layout
# JSON, because this machine reads .ps1 as GBK and this file must stay ASCII).
#
# Usage (from workspace root):
#   & tools\diagrams\to-visio.ps1 -Root "refs" -Stencil "C:\Program Files\Microsoft Office\root\Office16\Visio Content\2052\BASFLO_M.VSSX"
#
# Input: <figure>.layout.json produced by tools/diagrams/build.mjs
#        fields: pageW,pageH,groups[],nodes[],edges[],connector
# Output: <figure>.vsdx (native Visio, masters + dynamic connectors)
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$Stencil
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Root)) { throw "dir not found: $Root" }
if (-not (Test-Path -LiteralPath $Stencil)) { throw "stencil not found: $Stencil" }

$layouts = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter '*.layout.json'
if (-not $layouts) { throw "no *.layout.json under: $Root" }

$VIS_AUTOCONNECT_NONE = 0
$app = $null
$ok = 0
$bad = 0
try {
  $app = New-Object -ComObject Visio.Application
  $app.Visible = $false
  # suppress modal dialogs so the script can never hang waiting for a click
  try { $app.AlertResponse = 7 } catch {}
  try { $app.EventsEnabled = $false } catch {}
  $stn = $app.Documents.OpenEx($Stencil, 2 + 4)   # visOpenDocked + visOpenRO
  foreach ($lf in $layouts) {
    $tag = $lf.Name
    try {
      $j = Get-Content -LiteralPath $lf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $doc = $app.Documents.Add("")
      $page = $doc.Pages.Item(1)
      $page.PageSheet.CellsU("PageWidth").FormulaU = "$($j.pageW) in"
      $page.PageSheet.CellsU("PageHeight").FormulaU = "$($j.pageH) in"

      # groups (containers) first so they sit behind the nodes
      foreach ($g in $j.groups) {
        $sh = $page.Drop($stn.Masters.ItemU($g.master), $g.cx, $g.cy)
        $sh.Text = $g.text
        $sh.SendToBack()
      }
      # nodes
      $byId = @{}
      foreach ($n in $j.nodes) {
        $sh = $page.Drop($stn.Masters.ItemU($n.master), $n.cx, $n.cy)
        $sh.Text = $n.text
        $byId[$n.id] = $sh
      }
      # edges: real dynamic connectors, auto-routed and glued by Visio
      $connMaster = $stn.Masters.ItemU($j.connector)
      foreach ($e in $j.edges) {
        $a = $byId[$e.from]
        $b = $byId[$e.to]
        if (-not $a -or -not $b) { continue }
        $a.AutoConnect($b, $VIS_AUTOCONNECT_NONE, $connMaster) | Out-Null
        $cn = $page.Shapes.Item($page.Shapes.Count)
        if ($e.label) { $cn.Text = $e.label }
      }
      $base = $lf.FullName.Substring(0, $lf.FullName.Length - '.layout.json'.Length)
      $out = $base + '.vsdx'
      $doc.SaveAs($out)
      $n = $page.Shapes.Count
      $doc.Close()
      Write-Output ("OK   {0}  shapes={1}" -f $tag, $n)
      $ok++
    } catch {
      Write-Output ("FAIL {0}  {1}" -f $tag, $_.Exception.Message)
      $bad++
    }
  }
  $stn.Close()
  $app.Quit()
} finally {
  if ($app) { try { $app.Quit() } catch {} }
}
Write-Output ("==== visio vsdx ok={0} bad={1} ====" -f $ok, $bad)
if ($bad -gt 0) { exit 1 }

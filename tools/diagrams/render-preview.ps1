# render-preview.ps1 - render every SVG under -ResultsDir to a sibling PNG (visual self-check, skill §7).
# NOTE 1: kept ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as GBK, so Chinese
#         literals inside the file would be corrupted. Pass Chinese paths in via parameters.
# NOTE 2: the SVG is INLINED into a wrapper page that lives in a space-free ASCII temp dir.
#         Chromium rejects file:// URLs containing spaces, and folder names such as
#         "2021_E..._p09_图31 任务一流程图" contain both a space and a U+00AD soft hyphen.
#         So we never hand Chromium a path that contains a space.
# Usage: & tools\diagrams\render-preview.ps1 -ResultsDir "结果"
param(
  [Parameter(Mandatory = $true)][string]$ResultsDir
)
$ErrorActionPreference = 'Stop'
$Root = (Get-Location).Path
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { throw "Edge not found: $edge" }

$src = Join-Path $Root $ResultsDir
$tmp = Join-Path $Root '.preview-tmp'          # ASCII, no spaces
$prof = Join-Path $Root 'tools\.edge-prof'
New-Item -ItemType Directory -Force -Path $tmp, $prof | Out-Null
Get-ChildItem $tmp -File -ErrorAction SilentlyContinue | Remove-Item -Force

$ok = 0; $bad = 0; $i = 0
Get-ChildItem -Recurse $src -Filter *.svg | ForEach-Object {
  $svg = $_
  $i++
  $svgText = Get-Content -Raw -Encoding UTF8 $svg.FullName
  if ($svgText -match 'width="(\d+)" height="(\d+)"') {
    $w = [int]$Matches[1]; $h = [int]$Matches[2]
    $page = Join-Path $tmp ("p$i.html")
    $out = Join-Path $tmp ("p$i.png")
    # 内联 SVG：包装页不引用任何外部文件，彻底规避路径中的空格/软连字符
    $html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}svg{display:block}</style></head><body>' + $svgText + '</body></html>'
    Set-Content -Path $page -Value $html -Encoding UTF8
    $url = 'file:///' + ($page -replace '\\', '/')
    $a = @('--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
           '--disable-crash-reporter', '--single-process', '--no-sandbox',
           "--user-data-dir=$prof", "--window-size=$w,$h", "--screenshot=$out", $url)
    Start-Process -FilePath $edge -ArgumentList $a -PassThru -Wait -WindowStyle Hidden | Out-Null
    Start-Sleep -Milliseconds 300
    $dest = Join-Path $svg.DirectoryName ($svg.BaseName + '.png')
    if (Test-Path $out) {
      Move-Item -Force $out $dest
      'OK   {0,-34} {1}x{2}  {3}B' -f $svg.BaseName, $w, $h, (Get-Item $dest).Length; $ok++
    } else { 'FAIL {0}' -f $svg.BaseName; $bad++ }
  } else { 'PARSE-FAIL {0}' -f $svg.BaseName; $bad++ }
}
Get-ChildItem $tmp -File -ErrorAction SilentlyContinue | Remove-Item -Force
"==== preview ok=$ok bad=$bad ===="

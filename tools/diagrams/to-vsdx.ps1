# to-vsdx.ps1 - route B: SVG -> real vector Visio (.vsdx) via vendored svgtovisio (Node + jsdom, no browser, no Visio COM).
#
#   pwsh -File to-vsdx.ps1 -Root <dir> [-NoRecurse]
#
# For every *.svg under -Root (subdirectories included by default): write
# <same dir>\<same basename>.vsdx.
# The vendored CLI also emits .drawio/.fodg next to its input, so each run uses a
# private staging dir and only the .vsdx is copied back - the source tree is not
# otherwise touched.
#
# Prints  OK <relative name> <bytes>  per file and ends with  ==== vsdx ok=N bad=M ====
# Exits 1 if anything failed.
# Exits 1 as well when ZERO *.svg are found: a run that converted nothing is a
# failure, not a silent success (it used to print ok=0 bad=0 and exit 0).
# Pass -NoRecurse to scan only the top level of -Root.
# -Recurse is still accepted (it is the default) so old call sites keep working.
#
# ASCII only by design (the source tree has soft hyphens / CJK in its names).

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$Recurse,     # accepted for compatibility; recursion is the default
    [switch]$NoRecurse    # scan only the top level of -Root
)

# The reference SVG trees keep one figure per subdirectory, so a top-level-only
# scan found nothing. Recurse unless the caller explicitly opts out.
$doRecurse = -not $NoRecurse

$ErrorActionPreference = 'Continue'

$VendorRel = 'vendor\svgtovisio'
$Exporter  = 'tools\export.js'
$NodeExe   = 'node'

function Get-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# ---------------------------------------------------------------------------

$rootFull = (Resolve-Path -LiteralPath $Root).ProviderPath
if (-not (Test-Path -LiteralPath $rootFull -PathType Container)) {
    Write-Host "FATAL root is not a directory: $rootFull"
    exit 1
}

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$vendor = Join-Path $here $VendorRel
$expJs  = Join-Path $vendor $Exporter

if (-not (Test-Path -LiteralPath $expJs)) {
    Write-Host "FATAL vendored exporter missing: $expJs"
    exit 1
}
$node = Get-NodeExe
if (-not $node) {
    Write-Host "FATAL node.exe not found on PATH"
    exit 1
}

$nodeDir = Split-Path -Parent $node
"ROOT   $rootFull"
"VENDOR $vendor"
"NODE   $node ($(& $node --version))"
""

# jsdom / jszip / pako are required by tools/load.js from the vendor tree.
$env:NODE_PATH = (Join-Path $vendor 'node_modules') + ';' + $env:NODE_PATH
if ($env:PATH -notlike "*$nodeDir*") { $env:PATH = $nodeDir + ';' + $env:PATH }

$items = Get-ChildItem -LiteralPath $rootFull -Filter '*.svg' -File -Recurse:$doRecurse
if (-not $items) {
    "NO SVG under $rootFull"
    exit 1
}

$ok = 0; $bad = 0

foreach ($item in $items) {
    $base    = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
    $destDir = $item.DirectoryName
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ('vsdxstage_' + [Guid]::NewGuid().ToString('N'))

    $status = 'ok'; $reason = ''
    try {
        New-Item -ItemType Directory -Force -Path $staging | Out-Null

        # Stage under an ASCII name: the CLI derives the output basename from the
        # input filename and some of the sources contain CJK / soft hyphens.
        $svgIn = Join-Path $staging 'in.svg'
        $svgText = [System.IO.File]::ReadAllText($item.FullName)
        try { $svgText = $svgText.Normalize([System.Text.NormalizationForm]::FormC) } catch { }
        # Cosmetic cleanup only (defusedxml/ElementTree rejects undeclared xlink).
        $svgText = [regex]::Replace($svgText, 'xmlns:xlink\s*=\s*"[^"]*"\s*', '')
        if ($svgText -match 'xlink:href' -and $svgText -notmatch 'xmlns:xlink') {
            $svgText = [regex]::Replace($svgText, '<svg\b', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"', 1)
        }
        [System.IO.File]::WriteAllText($svgIn, $svgText)

        $out = & $node $expJs $svgIn $staging 2>&1
        $code = $LASTEXITCODE

        $made = Join-Path $staging 'in.vsdx'
        if ($code -ne 0) {
            $status = 'bad'; $reason = "export.js exit=$code :: " + (($out | Out-String).Trim() -replace '\r?\n', ' | ')
        } elseif (-not (Test-Path -LiteralPath $made)) {
            $status = 'bad'; $reason = "no .vsdx produced :: " + (($out | Out-String).Trim() -replace '\r?\n', ' | ')
        } else {
            $dest = Join-Path $destDir ($base + '.vsdx')
            Copy-Item -LiteralPath $made -Destination $dest -Force
            $bytes = (Get-Item -LiteralPath $dest).Length
            if ($bytes -le 0) { $status = 'bad'; $reason = 'zero byte output' }
            else { $ok++; "OK $base $bytes" }
        }
    } catch {
        $status = 'bad'; $reason = $_.Exception.Message
    } finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
    }

    if ($status -ne 'ok') {
        $bad++
        $rel = $item.FullName.Substring($rootFull.Length).TrimStart('\')
        "FAIL $rel :: $reason"
    }
}

""
"==== vsdx ok=$ok bad=$bad ===="
if ($bad -gt 0) { exit 1 }
exit 0

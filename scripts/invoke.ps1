[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("scan", "login", "preview", "run", "pipeline", "status", "resolve", "help")]
    [string]$Command = "status",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$skillRoot = Split-Path -Parent $PSScriptRoot
$defaultToolRoot = Join-Path $skillRoot "tool"
$toolRoot = if ($env:TRIPO_STUDIO_QUEUE_ROOT) {
    $env:TRIPO_STUDIO_QUEUE_ROOT
}
else {
    $defaultToolRoot
}

$startScript = Join-Path $toolRoot "start.ps1"
if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw "Queue tool missing: $startScript. Set TRIPO_STUDIO_QUEUE_ROOT to the tool directory."
}

& $startScript $Command @RemainingArgs
exit $LASTEXITCODE

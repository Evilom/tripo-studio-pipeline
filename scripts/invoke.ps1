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
    throw "找不到 Tripo 队列工具：$startScript。请设置 TRIPO_STUDIO_QUEUE_ROOT 指向工具目录。"
}

& $startScript $Command @RemainingArgs
exit $LASTEXITCODE

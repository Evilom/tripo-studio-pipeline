[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("scan", "login", "preview", "run", "pipeline", "status", "resolve", "help")]
    [string]$Command = "status",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $toolDir "config.json"
$exampleConfigPath = Join-Path $toolDir "config.example.json"
$dependencyPath = Join-Path $toolDir "node_modules\playwright-core"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 or newer is required."
}

if ([int](& node -p "process.versions.node.split('.')[0]") -lt 20) {
    throw "Node.js 20 or newer is required."
}

if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
    New-Item -ItemType Directory -Force -Path (Join-Path $toolDir "inputs") | Out-Null
    Write-Host "Created config: $configPath"
    Write-Host "Created input directory: $(Join-Path $toolDir "inputs")"
    Write-Host "Add asset folders and edit config.json, then run the command again."
    exit 0
}

Push-Location $toolDir
try {
    if (-not (Test-Path -LiteralPath $dependencyPath)) {
        Write-Host "Installing locked dependencies..."
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    & node "src/cli.js" $Command --config $configPath @RemainingArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

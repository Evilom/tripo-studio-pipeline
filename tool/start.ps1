[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("scan", "login", "preview", "run", "pipeline", "status", "resolve", "help")]
    [string]$Command = "status",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $toolDir "config.json"
$exampleConfigPath = Join-Path $toolDir "config.example.json"
$dependencyPath = Join-Path $toolDir "node_modules\playwright-core"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
}

if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
    New-Item -ItemType Directory -Force -Path (Join-Path $toolDir "inputs") | Out-Null
    Write-Host "已创建配置：$configPath"
    Write-Host "已创建输入目录：$(Join-Path $toolDir "inputs")"
    Write-Host "请放入资产子目录，并按需修改 config.json 的 views，然后重新运行命令。"
    exit 0
}

Push-Location $toolDir
try {
    if (-not (Test-Path -LiteralPath $dependencyPath)) {
        Write-Host "首次运行，正在安装本地依赖……"
        & npm install --no-audit --no-fund
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

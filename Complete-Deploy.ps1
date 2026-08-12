[CmdletBinding()]
param(
    [string]$PriceWatchPath = (Join-Path $PSScriptRoot "..\stock-alerts")
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "PriceWatch environment file was not found: $Path"
    }
    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }
        $parts = $line.Split("=", 2)
        $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
    return $values
}

function ConvertFrom-PrivatePrompt {
    param([Parameter(Mandatory)][string]$Prompt)

    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$priceWatchEnv = Read-DotEnv -Path (Join-Path $PriceWatchPath ".env")
foreach ($required in @("ALPACA_KEY_ID", "ALPACA_SECRET_KEY", "API_TOKEN")) {
    if (-not $priceWatchEnv[$required]) {
        throw "$required is missing from the PriceWatch .env file."
    }
}

Write-Host "MarketScanner needs three values that Cloudflare cannot export." -ForegroundColor Cyan
Write-Host "Input is hidden and is never printed or placed in a command argument."
$telegramToken = ConvertFrom-PrivatePrompt "Telegram bot token"
$telegramChatId = ConvertFrom-PrivatePrompt "Telegram chat ID"
$webPassword = ConvertFrom-PrivatePrompt "New MarketScanner web password (16+ characters)"

if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') {
    throw "The Telegram bot token does not have the expected format."
}
if ($telegramChatId -notmatch '^-?\d+$') {
    throw "The Telegram chat ID must contain only an optional minus sign and digits."
}
if ($webPassword.Length -lt 16) {
    throw "WEB_PASSWORD must contain at least 16 characters."
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$wrangler = Join-Path $PSScriptRoot "node_modules\wrangler\bin\wrangler.js"
if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
    throw "Wrangler is not installed. Run npm install in $PSScriptRoot first."
}

$temporarySecrets = Join-Path ([IO.Path]::GetTempPath()) (
    "market-scanner-secrets-{0}.json" -f [guid]::NewGuid().ToString("N")
)
try {
    $payload = [ordered]@{
        ALPACA_KEY_ID = $priceWatchEnv["ALPACA_KEY_ID"]
        ALPACA_SECRET_KEY = $priceWatchEnv["ALPACA_SECRET_KEY"]
        TELEGRAM_BOT_TOKEN = $telegramToken
        TELEGRAM_CHAT_ID = $telegramChatId
        API_TOKEN = $priceWatchEnv["API_TOKEN"]
        WEB_PASSWORD = $webPassword
    } | ConvertTo-Json
    [IO.File]::WriteAllText($temporarySecrets, $payload, [Text.UTF8Encoding]::new($false))

    Push-Location $PSScriptRoot
    try {
        & $node $wrangler deploy --secrets-file $temporarySecrets
        if ($LASTEXITCODE -ne 0) {
            throw "Wrangler deploy failed with exit code $LASTEXITCODE."
        }
        & $node $wrangler secret list --format pretty
        if ($LASTEXITCODE -ne 0) {
            throw "Deployment succeeded, but secret verification failed."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    if (Test-Path -LiteralPath $temporarySecrets) {
        Remove-Item -LiteralPath $temporarySecrets -Force
    }
    $telegramToken = $null
    $telegramChatId = $null
    $webPassword = $null
    $payload = $null
}

Write-Host "MarketScanner was deployed. Open the workers.dev URL printed above." -ForegroundColor Green


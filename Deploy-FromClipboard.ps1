[CmdletBinding()]
param(
    [string]$TokenFile
)

$ErrorActionPreference = "Stop"
$secretFile = $null
$botToken = $null
$chatId = $null
$webPassword = $null
$secretPayload = $null

function Read-DotEnv {
    param([Parameter(Mandatory)][string]$Path)

    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }
        $parts = $line.Split("=", 2)
        $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
    return $values
}

try {
    if (-not $TokenFile -or -not (Test-Path -LiteralPath $TokenFile -PathType Leaf)) {
        throw "A temporary Telegram token file is required."
    }
    $resolvedTokenFile = (Resolve-Path -LiteralPath $TokenFile).Path
    $expectedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (
        -not $resolvedTokenFile.StartsWith($expectedTempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedTokenFile) -notlike "market-scanner-token-*.tmp"
    ) {
        throw "The Telegram token file is outside the expected temporary location."
    }
    $botToken = (Get-Content -LiteralPath $resolvedTokenFile -Raw).Trim()
    if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') {
        throw "The clipboard does not contain a complete Telegram bot token."
    }

    try {
        $botInfo = Invoke-RestMethod -Uri (
            "https://api.telegram.org/bot{0}/getMe" -f $botToken
        ) -TimeoutSec 20
        $updates = Invoke-RestMethod -Uri (
            "https://api.telegram.org/bot{0}/getUpdates" -f $botToken
        ) -TimeoutSec 20
    }
    catch {
        throw "Telegram could not validate the recovered bot token."
    }
    if (-not $botInfo.ok) {
        throw "Telegram rejected the recovered bot token."
    }

    $chatId = $updates.result |
        Sort-Object update_id -Descending |
        ForEach-Object {
            if ($_.message -and $_.message.chat) {
                [string]$_.message.chat.id
            }
        } |
        Select-Object -First 1
    if ($chatId -notmatch '^-?\d+$') {
        throw "No Telegram chat ID was found. Send /start to the bot and retry."
    }

    $priceWatchEnv = Read-DotEnv -Path (
        "C:\Users\Agu\Documents\Claude Local Session\stock-alerts\.env"
    )
    foreach ($requiredName in @("ALPACA_KEY_ID", "ALPACA_SECRET_KEY", "API_TOKEN")) {
        if (-not $priceWatchEnv[$requiredName]) {
            throw "$requiredName is missing from the local PriceWatch environment."
        }
    }

    $webPassword = (
        [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
    ).Substring(0, 40)
    $secretFile = Join-Path ([IO.Path]::GetTempPath()) (
        "market-scanner-secrets-{0}.json" -f [guid]::NewGuid().ToString("N")
    )
    $secretPayload = [ordered]@{
        ALPACA_KEY_ID = $priceWatchEnv["ALPACA_KEY_ID"]
        ALPACA_SECRET_KEY = $priceWatchEnv["ALPACA_SECRET_KEY"]
        TELEGRAM_BOT_TOKEN = $botToken
        TELEGRAM_CHAT_ID = $chatId
        API_TOKEN = $priceWatchEnv["API_TOKEN"]
        WEB_PASSWORD = $webPassword
    } | ConvertTo-Json
    [IO.File]::WriteAllText(
        $secretFile,
        $secretPayload,
        [Text.UTF8Encoding]::new($false)
    )

    $nodeExe = "C:\Users\Agu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    $wrangler = Join-Path $PSScriptRoot "node_modules\wrangler\bin\wrangler.js"
    $deployOutput = @(
        & $nodeExe $wrangler deploy --secrets-file $secretFile 2>&1 |
            ForEach-Object { $_.ToString() }
    )
    $deployExit = $LASTEXITCODE
    $deployOutput | Write-Output
    if ($deployExit -ne 0) {
        throw "Wrangler deploy failed with exit code $deployExit."
    }

    $urlMatch = [regex]::Match(
        ($deployOutput -join "`n"),
        'https://[A-Za-z0-9.-]+\.workers\.dev'
    )
    $workerUrl = if ($urlMatch.Success) {
        $urlMatch.Value
    }
    else {
        "https://market-scanner-620.agu-tools.workers.dev"
    }
    $apiHeaders = @{
        Authorization = "Bearer $($priceWatchEnv['API_TOKEN'])"
        "x-market-scanner" = "confirm"
    }

    $testResult = Invoke-RestMethod -Method Post `
        -Uri "$workerUrl/api/scanner/test-notification" `
        -Headers $apiHeaders -TimeoutSec 30
    if (-not $testResult.deliveryOk) {
        throw "The Worker deployed, but its Telegram test was not delivered."
    }

    $passwordResult = Invoke-RestMethod -Method Post `
        -Uri "$workerUrl/api/scanner/send-web-password" `
        -Headers $apiHeaders -TimeoutSec 30
    if (-not $passwordResult.delivery.ok) {
        throw "The Worker deployed, but could not deliver the web password."
    }

    $health = Invoke-RestMethod -Method Get `
        -Uri "$workerUrl/api/scanner/health" `
        -Headers @{ Authorization = "Bearer $($priceWatchEnv['API_TOKEN'])" } `
        -TimeoutSec 30

    [pscustomobject]@{
        WorkerUrl = $workerUrl
        BotVerified = [bool]$botInfo.ok
        ChatDetected = $true
        TestDelivered = [bool]$testResult.deliveryOk
        PasswordDelivered = [bool]$passwordResult.delivery.ok
        Health = $health.status
    }
}
finally {
    if ($secretFile -and (Test-Path -LiteralPath $secretFile)) {
        Remove-Item -LiteralPath $secretFile -Force
    }
    if (
        $TokenFile -and
        [IO.Path]::GetFileName($TokenFile) -like "market-scanner-token-*.tmp" -and
        (Test-Path -LiteralPath $TokenFile)
    ) {
        Remove-Item -LiteralPath $TokenFile -Force
    }
    $botToken = $null
    $chatId = $null
    $webPassword = $null
    $secretPayload = $null
}

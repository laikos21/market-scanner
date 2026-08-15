# MarketScanner 620

Private intraday timing scanner for bullish 620 sequences on US equities. It runs as an
independent Cloudflare Worker, stores state in its own D1 database and sends early/confirmed
signals to a fixed Telegram chat.

It intentionally does **not** generate a complete trading thesis. You select a ticker because
its Daily chart and location are already interesting; MarketScanner answers when the 5-minute
timing sequence appears.

## PBA 620 revision

The previous GitHub revision implemented the older conservative interpretation: signal period
10 by default and one global 3/4 continuation-quality gate for both the early MACD cross and the
later EMA confirmation. That gate systematically favored a later entry and could suppress the
low-risk turn PBA was trying to capture.

This revision is the new PBA-focused 620 model. It was derived from a direct review of PBA's
Planet Labs five-minute screenshot and video transcript, followed by replays of multiple rule
variants across two sessions and the 89 live MarketScanner setups. The selected policy preserves
closed-bar safety while moving early acceptance to observable base/risk geometry. TypeScript,
the Worker dry build and 27 offline tests validate the publication checkout.

## Signal contract

Default configuration:

- timeframe: 5 minutes;
- session: NYSE/Nasdaq regular trading hours only;
- MACD line: `EMA(close, 6) - EMA(close, 20)`;
- signal line: `EMA(MACD, 9)` by default for the PBA profile; period 10 remains available;
- early signal: MACD crosses bullish while EMA6 is still at/below EMA20, after a stable
  five-minute base, a rounded histogram turn and a firm micropivot recovery;
- confirmation: EMA6 crosses above EMA20 within 6 bars (configurable 1–24);
- low-risk gate: the reference close must be no more than `SCANNER_PBA_MAX_RISK_PCT`
  (default `1.25%`) above the recent base low;
- continuation quality: the existing 4-point score remains visible and filters a late EMA
  confirmation only when no PBA early alert was sent;
- evaluation: closed bars only;
- warm-up: 60 or more historical bars, always silent.

State flow:

```text
priming → waiting_macd → waiting_ema → confirmed
                         ↘ expired / invalidated → waiting_macd
confirmed → both MACD and EMA bearish → waiting_macd
```

The panel lets you add, pause, resume and remove tickers, choose signal period 9/10, set the
confirmation window and record the Daily/location context. It also supports a safe bulk import:
paste a ticker list or rich text copied from an AGU-PULSE screener, review the preview, and then
confirm the new setups. Existing symbols are skipped, duplicates are reported, and symbols are
never paused or removed automatically when they leave the screener.

The scanner keeps the raw sequence state internally. A PBA early alert requires an established
base low, three rising histogram readings into the cross, a green recovery through the previous
bar high, a close in the upper 35% of its range and risk within the configured limit. The
four-point continuation score remains diagnostic and `SCANNER_MIN_QUALITY` (default `3` of `4`)
can still admit a later EMA confirmation when the early geometry was absent. A ticker can
produce at most one accepted 620 sequence per New York session; filtered or invalidated raw
crosses no longer consume that session.

For one-click screener capture, drag the **Importar Screener PULSE con un clic** link from the
panel to Chrome's bookmarks bar. When clicked on any PULSE screener it reads the visible cards,
walks through pagination, and opens MarketScanner with the symbols in the preview. The final
import still requires the explicit confirmation button.

## Important data limitation

The free Alpaca feed is IEX, a single exchange. A TradingView chart may use consolidated SIP
data, so candle OHLCV and exact cross times can differ. Treat the scanner as an execution aid,
not an exact reproduction of every TradingView feed and not an order-execution system.

## Local verification

Requires Node.js. From PowerShell:

```powershell
npm install
npm run check
```

For local Worker execution, copy the example and fill it without committing credentials:

```powershell
Copy-Item ".dev.vars.example" ".dev.vars"
npm run db:migrate:local
npm run dev
```

Then open the local URL printed by Wrangler.

## Cloudflare deployment

These commands do not require Administrator privileges, but they create resources in your
Cloudflare account.

The D1 database ID in this checkout is already provisioned. On this workstation, the safest
completion path is the interactive helper: it reads Alpaca and `API_TOKEN` from the sibling
PriceWatch `.env`, prompts privately for the three values Cloudflare cannot export, uploads
all six secrets alongside the code, and removes its temporary secrets file.

```powershell
.\Complete-Deploy.ps1
```

Use the same Telegram bot token/chat ID as PriceWatch if both services should notify the same
conversation. Choose a new web password of at least 16 characters.

For a fresh Cloudflare account or manual deployment, use the steps below.

1. Authenticate Wrangler if necessary:

   ```powershell
   npx wrangler login
   ```

2. Create the independent D1 database:

   ```powershell
   npx wrangler d1 create market-scanner-620
   ```

   Put the returned `database_id` in `wrangler.jsonc`, replacing
   `REPLACE_WITH_D1_DATABASE_ID`.

3. Apply the schema:

   ```powershell
   npm run db:migrate:remote
   ```

4. Store secrets. The Alpaca and Telegram values may be the same ones used by PriceWatch, but
   Cloudflare stores them separately for this Worker:

   ```powershell
   npx wrangler secret put ALPACA_KEY_ID
   npx wrangler secret put ALPACA_SECRET_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put API_TOKEN
   npx wrangler secret put WEB_PASSWORD
   ```

   Use independently generated values of at least 16 characters for `API_TOKEN` and
   `WEB_PASSWORD`. Do not pass secrets as command-line arguments.

5. Deploy:

   ```powershell
   npm run deploy
   ```

6. Open the Worker URL, add one ticker, press **Ejecutar ahora** to prime it, then press
   **Probar Telegram**. A newly added ticker never alerts on a historical cross.

## Operations

The cron runs one minute after every 5-minute boundary on weekdays and immediately exits
outside the New York scanner window. The last 15:55 bar is processed at approximately 16:01.
Early-close sessions are included in the bundled 2026–2031 market calendar.
New or reset setups are warmed in bounded batches (`SCANNER_WARMUP_BATCH_SIZE`, default `3`)
so a large bulk import cannot exhaust a single Worker invocation. Deferred setups remain queued
and are initialized automatically by subsequent cycles without emitting historical alerts.
An explicitly forced cycle may complete this silent warm-up outside RTH; stale historical bars
remain forbidden for every already-initialized setup.
The enabled watchlist limit is controlled by `SCANNER_SETUP_LIMIT` and defaults to `120`.
The PBA entry risk limit is controlled by `SCANNER_PBA_MAX_RISK_PCT` and defaults to `1.25`.

Health states:

- **green:** credentials present, no delivery failures and fresh cycle state;
- **amber:** missing/stale market bars or an armed scanner that has not completed a cycle;
- **red:** cycle failure, overdue RTH cycle, missing credentials, pending event or Telegram
  dead letter.

Delivery attempts are bounded to three immediate tries. A failed event is retained as a dead
letter and is not silently retried forever.

## API

Every scanner endpoint accepts either the web session or `Authorization: Bearer <API_TOKEN>`.
Mutations from the web also require same-origin headers.

```text
GET    /api/scanner/health
GET    /api/scanner/setups
POST   /api/scanner/setups
POST   /api/scanner/import/preview
POST   /api/scanner/import
PATCH  /api/scanner/setups/:id
DELETE /api/scanner/setups/:id
GET    /api/scanner/events
GET    /api/scanner/deadletters
POST   /api/scanner/deadletters/:id/ack
POST   /api/scanner/run?force=1
POST   /api/scanner/test-notification
POST   /api/scanner/send-web-password
```

Example setup payload:

```json
{
  "symbol": "NVDA",
  "signalPeriod": 10,
  "confirmationWindowBars": 6,
  "note": "Pullback constructivo a EMA21 Daily"
}
```

Bulk import payloads use the same `signalPeriod`, `confirmationWindowBars`, and `note` fields,
plus `source` (for example `PULSE Leaders`) and `text` containing the copied screener content.
Call `/api/scanner/import/preview` first; the write endpoint requires the usual confirmation
header and commits all new setups atomically.

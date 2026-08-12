# MarketScanner 620

Private intraday timing scanner for bullish 620 sequences on US equities. It runs as an
independent Cloudflare Worker, stores state in its own D1 database and sends early/confirmed
signals to a fixed Telegram chat.

It intentionally does **not** generate a complete trading thesis. You select a ticker because
its Daily chart and location are already interesting; MarketScanner answers when the 5-minute
timing sequence appears.

## Signal contract

Default configuration:

- timeframe: 5 minutes;
- session: NYSE/Nasdaq regular trading hours only;
- MACD line: `EMA(close, 6) - EMA(close, 20)`;
- signal line: `EMA(MACD, 10)`, optionally 9 per ticker;
- early signal: MACD crosses bullish while EMA6 is still at/below EMA20;
- confirmation: EMA6 crosses above EMA20 within 6 bars (configurable 1â€“24);
- quality gate: Telegram alerts default to score 3/4 (EMA20 slope, local breakout, volume
  support and MACD histogram strength);
- evaluation: closed bars only;
- warm-up: 60 or more historical bars, always silent.

State flow:

```text
priming â†’ waiting_macd â†’ waiting_ema â†’ confirmed
                         â†˜ expired / invalidated â†’ waiting_macd
confirmed â†’ both MACD and EMA bearish â†’ waiting_macd
```

The panel lets you add, pause, resume and remove tickers, choose signal period 9/10, set the
confirmation window and record the Daily/location context. It also supports a safe bulk import:
paste a ticker list or rich text copied from an AGU-PULSE screener, review the preview, and then
confirm the new setups. Existing symbols are skipped, duplicates are reported, and symbols are
never paused or removed automatically when they leave the screener.

The scanner keeps the raw sequence state internally, but Telegram notifications are filtered by
`SCANNER_MIN_QUALITY` (default `3` of `4`). A ticker can produce at most one 620 sequence alert
per New York session; it becomes eligible again on the next session. This reduces repeated chop
without changing the underlying EMA/MACD calculation.

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
Early-close sessions are included in the bundled 2026â€“2031 market calendar.

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


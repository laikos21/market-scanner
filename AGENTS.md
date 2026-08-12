# MarketScanner contributor notes

MarketScanner is deliberately separate from the sibling PriceWatch project. Do not add
indicator logic to PriceWatch and do not import PriceWatch runtime modules. Sharing the same
Alpaca account and Telegram bot is a deployment choice, not a code dependency.

## Product boundary

The current product detects one setup only: bullish 620 timing on closed 5-minute US-equity
RTH bars. The thesis/location is supplied by the user as a note; this service does not claim
to discover a complete trade setup and never places orders.

The sequence is strict:

1. MACD `EMA(6) - EMA(20)` crosses above its EMA signal (9 or 10).
2. EMA6 crosses above EMA20 in the configured confirmation window.

An EMA cross that happened before the MACD cross does not count as confirmation.

## Reliability rules

- Never evaluate an open or stale bar.
- Historical warm-up must never emit a notification.
- Persist state and event in one D1 batch before Telegram delivery.
- Never automatically retry a dead letter after the bounded immediate attempts.
- Never log or commit credentials.
- Symbol changes are human decisions; never fuzzy-match or infer a replacement ticker.

## Verification

```powershell
npm run check
```

Tests are offline. Any test that depends on the current date or live credentials is broken.
Code and comments are in English; user-facing UI and Telegram messages are in Spanish.


# Decisions

## D1. Separate service, shared delivery channel

MarketScanner is a sibling Cloudflare Worker, not a PriceWatch feature. It has its own D1
database and state, while the deployment may reuse the same Alpaca credentials, Telegram bot
and fixed chat. This preserves PriceWatch's closed scope and failure contract.

## D2. Location remains a human input in the MVP

A raw 620 cross is timing, not a trade thesis. The scanner watches only tickers deliberately
armed by the user, with a free-text location/setup note. It does not scan the whole market.

## D3. Closed RTH bars only

Evaluation uses 5-minute Alpaca bars whose interval has fully closed and whose start is within
the NYSE/Nasdaq regular session. The cron runs one minute after each five-minute boundary. No
premarket, after-hours or forming-candle signal is accepted.

## D4. PBA 6/20/9 is the default

The default signal period is 9, matching the documented PBA chart coordinates. Period 10 remains
explicitly supported per setup for the Morales variant. Changing it
resets and re-primes the indicator so values from two formulas are never mixed.

## D5. Historical priming is silent

At least 60 closed bars initialize the recursive EMAs. Every bar in a priming batch is used
only for indicator state, even if it contains a valid historical cross. The first possible
alert must come from a later closed bar.

## D6. Strict sequence and bounded confirmation

The early event requires a bullish MACD cross while EMA6 is not already above EMA20. The
confirmation requires a later EMA6/EMA20 bullish cross, or both crosses in the same bar. The
default window is six bars. A bearish MACD cross or window expiry invalidates the pending
sequence without a Telegram message.

## D7. Commit before delivery

Setup state and event are committed together through an optimistic-revision D1 batch. Telegram
delivery happens after the commit. A crash leaves a recoverable pending event rather than a
lost signal; a bounded delivery failure becomes a visible dead letter.

## D8. Alpaca IEX is a known data limitation

The free feed represents IEX, not the consolidated SIP tape. Its OHLCV and therefore its EMA
and MACD values can differ from a TradingView chart using consolidated data. The application
does not hide or correct that difference.

## D9. Screener imports are explicit and add-only

AGU-PULSE is a separate, client-rendered application and does not expose a stable server-side
sync contract for this Worker. MarketScanner therefore accepts pasted screener text and offers a
bookmarklet that captures the visible screener cards and pagination into the same preview-then-
confirm flow. The parser is tolerant of rich card copy, while the import only creates missing
setups; it never pauses or deletes a ticker because a later screener refresh no longer contains
it. This keeps the screener as a source of candidates and the scanner as the owner of alert state.

## D10. Continuation quality and one-accepted-sequence policy

The four-point score measures continuation evidence: EMA20 slope, a local three-bar breakout,
relative volume and MACD histogram strength. It remains visible on every alert and a score 3/4
is required by default only for a later EMA confirmation whose PBA early geometry was rejected.
After the first accepted sequence of a New York session, later re-crosses for that ticker are
suppressed until the next session. A filtered or invalidated raw cross does not consume the day.

## D11. PBA early alert is defined by risk geometry

The early Telegram alert models PBA's low-risk adaptation rather than mature trend confirmation.
It requires a bullish MACD cross with EMA6 still at/below EMA20, a recent low established at
least two bars earlier, a histogram that rose on each of the last three transitions, a green
recovery close above the prior bar high, a close in the upper 35% of the trigger candle and
distance to the base low no greater than `SCANNER_PBA_MAX_RISK_PCT` (default 1.25%). The base low,
risk per share and risk percentage are included in the alert. EMA6/EMA20 remains a follow-up
confirmation and is always reported when a PBA early alert was already delivered.

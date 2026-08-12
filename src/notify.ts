import { integerSetting } from "./config";
import type { DeliveryResult, Env, EventRow } from "./types";

type Fetcher = typeof fetch;
type Sleeper = (milliseconds: number) => Promise<void>;

const sleep: Sleeper = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function safeError(error: unknown): string {
  return `${error instanceof Error ? error.name : "Error"}: ${
    error instanceof Error ? error.message : String(error)
  }`.slice(0, 300);
}

export async function sendTelegram(
  message: string,
  env: Env,
  fetcher: Fetcher = fetch,
  sleeper: Sleeper = sleep,
): Promise<DeliveryResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return {
      channel: "telegram",
      ok: false,
      attempts: 0,
      latencyMs: 0,
      error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured",
    };
  }
  const attempts = integerSetting("NOTIFY_MAX_ATTEMPTS", env.NOTIFY_MAX_ATTEMPTS, 3, 1, 3);
  const backoffMs = integerSetting(
    "NOTIFY_RETRY_BACKOFF_MS",
    env.NOTIFY_RETRY_BACKOFF_MS,
    2000,
    0,
    10_000,
  );
  const started = performance.now();
  let lastError = "no attempt";
  const endpoint = `${env.TELEGRAM_API_URL.replace(/\/$/, "")}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: env.TELEGRAM_CHAT_ID,
    text: message.slice(0, 4096),
    disable_web_page_preview: true,
  });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const raw = await response.text();
      let payload: { ok?: boolean; description?: string } = {};
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        // Keep the bounded raw response below.
      }
      if (response.ok && payload.ok === true) {
        return {
          channel: "telegram",
          ok: true,
          attempts: attempt,
          latencyMs: Math.round(performance.now() - started),
          error: "",
        };
      }
      lastError = `HTTP ${response.status}: ${(payload.description ?? raw).slice(0, 160)}`;
    } catch (error) {
      lastError = safeError(error).replaceAll(env.TELEGRAM_BOT_TOKEN, "[REDACTED]");
    }
    if (attempt < attempts) await sleeper(backoffMs * 2 ** (attempt - 1));
  }
  return {
    channel: "telegram",
    ok: false,
    attempts,
    latencyMs: Math.round(performance.now() - started),
    error: lastError,
  };
}

async function claimEvent(
  db: D1Database,
  id: number,
  now: Date,
): Promise<EventRow | null> {
  const leaseUntil = new Date(now.getTime() + 4 * 60_000).toISOString();
  return db
    .prepare(
      `UPDATE scanner_events
       SET delivery_status = 'sending', delivery_lease_until = ?
       WHERE id = ? AND (
         delivery_status = 'pending' OR
         (delivery_status = 'sending' AND delivery_lease_until < ?)
       )
       RETURNING *`,
    )
    .bind(leaseUntil, id, now.toISOString())
    .first<EventRow>();
}

export async function deliverEvent(
  db: D1Database,
  eventId: number,
  env: Env,
  now = new Date(),
): Promise<DeliveryResult | null> {
  const event = await claimEvent(db, eventId, now);
  if (!event) return null;
  const result = await sendTelegram(event.message, env);
  const payload = JSON.stringify(result);
  if (result.ok) {
    await db
      .prepare(
        `UPDATE scanner_events
         SET delivery_status = 'delivered', delivery_lease_until = NULL,
             delivery_json = ?
         WHERE id = ? AND delivery_status = 'sending'`,
      )
      .bind(payload, event.id)
      .run();
  } else {
    await db.batch([
      db
        .prepare(
          `UPDATE scanner_events
           SET delivery_status = 'failed', delivery_lease_until = NULL,
               delivery_json = ?
           WHERE id = ? AND delivery_status = 'sending'`,
        )
        .bind(payload, event.id),
      db
        .prepare(
          `INSERT INTO scanner_deadletter
           (event_id, channel, error, attempts, last_try_at)
           VALUES (?, 'telegram', ?, ?, ?)`,
        )
        .bind(event.id, result.error, result.attempts, now.toISOString()),
    ]);
  }
  return result;
}

export async function recoverPendingDeliveries(
  db: D1Database,
  env: Env,
  now = new Date(),
): Promise<number[]> {
  const rows = await db
    .prepare(
      `SELECT id FROM scanner_events
       WHERE delivery_status = 'pending' OR
             (delivery_status = 'sending' AND delivery_lease_until < ?)
       ORDER BY id
       LIMIT 20`,
    )
    .bind(now.toISOString())
    .all<{ id: number }>();
  const recovered: number[] = [];
  for (const row of rows.results) {
    if (await deliverEvent(db, row.id, env, now)) recovered.push(row.id);
  }
  return recovered;
}


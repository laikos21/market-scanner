import { isScannerWindow } from "./calendar";
import { recordCycleFailure, runCycle, sendTestNotification } from "./cycle";
import { sendTelegram } from "./notify";
import { deleteSetup, addSetup, updateSetup } from "./setups";
import { importBulkSetups, previewBulkImport, BULK_IMPORT_MAX_TEXT } from "./bulk";
import { loadState, SetupNotFoundError } from "./storage";
import type { Env } from "./types";
import {
  clearSessionCookie,
  createSessionCookie,
  validSameOriginMutation,
  verifyWebPassword,
  verifyWebSession,
  webPasswordConfigured,
} from "./web-auth";
import { WEB_CSS, WEB_HTML, WEB_JS } from "./web";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function webResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-cache",
      "content-type": contentType,
      "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "cross-origin-opener-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

function staticRoute(request: Request, pathname: string): Response | null {
  if (request.method !== "GET") return null;
  if (pathname === "/" || pathname === "/index.html") {
    return webResponse(WEB_HTML, "text/html; charset=utf-8");
  }
  if (pathname === "/app.css") return webResponse(WEB_CSS, "text/css; charset=utf-8");
  if (pathname === "/app.js") return webResponse(WEB_JS, "text/javascript; charset=utf-8");
  return null;
}

type AuthorizationMode = "bearer" | "session" | null;

async function authorizationMode(request: Request, env: Env): Promise<AuthorizationMode> {
  if (env.API_TOKEN && request.headers.get("authorization") === `Bearer ${env.API_TOKEN}`) {
    return "bearer";
  }
  return (await verifyWebSession(request, env)) ? "session" : null;
}

async function sessionRoute(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/session") return null;
  if (request.method === "POST") {
    if (!validSameOriginMutation(request)) return json({ error: "invalid request origin" }, 403);
    if (!webPasswordConfigured(env)) {
      return json({ error: "web login password is not configured" }, 503);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("valid JSON body required");
    }
    const password =
      body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string"
        ? (body as { password: string }).password
        : "";
    if (!(await verifyWebPassword(password, env))) {
      return json({ error: "invalid credentials" }, 401);
    }
    return Response.json(
      { authenticated: true },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": await createSessionCookie(env),
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
  if (request.method === "DELETE") {
    if (!validSameOriginMutation(request)) return json({ error: "invalid request origin" }, 403);
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store", "set-cookie": clearSessionCookie() },
    });
  }
  return json({ error: "method not allowed" }, 405);
}

function validateSetupInput(value: unknown):
  | {
      symbol: string;
      signalPeriod: 9 | 10;
      confirmationWindowBars: number;
      note: string;
      source: string;
    }
  | string {
  if (!value || typeof value !== "object") return "JSON object required";
  const body = value as Record<string, unknown>;
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!/^[A-Z0-9.\-]{1,16}$/.test(symbol)) {
    return "symbol must be an exact US equity ticker";
  }
  const signalPeriod = body.signalPeriod === undefined ? 9 : Number(body.signalPeriod);
  if (signalPeriod !== 9 && signalPeriod !== 10) return "signalPeriod must be 9 or 10";
  const confirmationWindowBars =
    body.confirmationWindowBars === undefined ? 6 : Number(body.confirmationWindowBars);
  if (
    !Number.isInteger(confirmationWindowBars) ||
    confirmationWindowBars < 1 ||
    confirmationWindowBars > 24
  ) {
    return "confirmationWindowBars must be an integer from 1 to 24";
  }
  const note = body.note === undefined ? "" : String(body.note).trim();
  if (note.length > 200) return "note cannot exceed 200 characters";
  const source = body.source === undefined ? "" : String(body.source).trim();
  if (source.length > 80) return "source cannot exceed 80 characters";
  return {
    symbol,
    signalPeriod: signalPeriod as 9 | 10,
    confirmationWindowBars,
    note,
    source,
  };
}

function validateBulkInput(value: unknown):
  | {
      text: string;
      signalPeriod: 9 | 10;
      confirmationWindowBars: number;
      note: string;
      source: string;
    }
  | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "JSON object required";
  const body = value as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return "text with ticker symbols is required";
  if (text.length > BULK_IMPORT_MAX_TEXT) return "bulk import text cannot exceed 30000 characters";
  const signalPeriod = body.signalPeriod === undefined ? 9 : Number(body.signalPeriod);
  if (signalPeriod !== 9 && signalPeriod !== 10) return "signalPeriod must be 9 or 10";
  const confirmationWindowBars =
    body.confirmationWindowBars === undefined ? 6 : Number(body.confirmationWindowBars);
  if (
    !Number.isInteger(confirmationWindowBars) ||
    confirmationWindowBars < 1 ||
    confirmationWindowBars > 24
  ) {
    return "confirmationWindowBars must be an integer from 1 to 24";
  }
  const note = body.note === undefined ? "" : String(body.note).trim();
  if (note.length > 200) return "note cannot exceed 200 characters";
  const source = body.source === undefined ? "PULSE Leaders" : String(body.source).trim();
  if (source.length > 80) return "source cannot exceed 80 characters";
  return {
    text,
    signalPeriod: signalPeriod as 9 | 10,
    confirmationWindowBars,
    note,
    source,
  };
}

function validateSetupPatch(value: unknown):
  | {
      enabled?: boolean;
      signalPeriod?: 9 | 10;
      confirmationWindowBars?: number;
      note?: string;
    }
  | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "JSON object required";
  const body = value as Record<string, unknown>;
  const allowed = new Set(["enabled", "signalPeriod", "confirmationWindowBars", "note"]);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
    return "PATCH supports enabled, signalPeriod, confirmationWindowBars and note";
  }
  const patch: {
    enabled?: boolean;
    signalPeriod?: 9 | 10;
    confirmationWindowBars?: number;
    note?: string;
  } = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return "enabled must be boolean";
    patch.enabled = body.enabled;
  }
  if (body.signalPeriod !== undefined) {
    const value = Number(body.signalPeriod);
    if (value !== 9 && value !== 10) return "signalPeriod must be 9 or 10";
    patch.signalPeriod = value as 9 | 10;
  }
  if (body.confirmationWindowBars !== undefined) {
    const value = Number(body.confirmationWindowBars);
    if (!Number.isInteger(value) || value < 1 || value > 24) {
      return "confirmationWindowBars must be an integer from 1 to 24";
    }
    patch.confirmationWindowBars = value;
  }
  if (body.note !== undefined) {
    const value = String(body.note).trim();
    if (value.length > 200) return "note cannot exceed 200 characters";
    patch.note = value;
  }
  return patch;
}

function apiFailure(error: unknown): Response {
  if (error instanceof SetupNotFoundError) return json({ error: error.message }, 404);
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("already has") ||
    message.includes("limit reached") ||
    message.includes("would exceed enabled setup limit") ||
    message.includes("changed concurrently")
  ) {
    return json({ error: message }, 409);
  }
  if (message.includes("no valid ticker") || message.includes("bulk import text")) {
    return json({ error: message }, 400);
  }
  return json({ error: message }, 500);
}

async function health(env: Env): Promise<Response> {
  const loaded = await loadState(env.DB);
  const counts = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM scanner_deadletter WHERE resolved = 0) AS deadletters,
         (SELECT COUNT(*) FROM scanner_events
          WHERE delivery_status IN ('pending', 'sending')) AS undelivered`,
    )
    .first<{ deadletters: number; undelivered: number }>();
  const red: string[] = [];
  const amber: string[] = [];
  const now = new Date();
  const enabled = loaded.document.setups.filter((setup) => setup.enabled).length;
  if (!loaded.document.lastCycle) {
    if (enabled) amber.push("no scanner cycle has completed");
  } else {
    const cycle = loaded.document.lastCycle;
    if (cycle.result === "error") red.push(cycle.detail);
    if (cycle.stale) amber.push(`${cycle.stale} setup(s) have stale bars`);
    if (cycle.missing) amber.push(`${cycle.missing} setup(s) have no bars`);
    if (enabled && isScannerWindow(now)) {
      const ageMs = now.getTime() - new Date(cycle.startedAt).getTime();
      if (!Number.isFinite(ageMs) || ageMs > 12 * 60_000) {
        red.push("last scanner cycle is older than 12 minutes during RTH");
      }
    }
  }
  if (Number(counts?.deadletters ?? 0) > 0) red.push("unresolved Telegram delivery failures");
  if (Number(counts?.undelivered ?? 0) > 0) red.push("undelivered events exist");
  if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) red.push("Alpaca credentials are missing");
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) red.push("Telegram credentials are missing");
  if (!webPasswordConfigured(env)) red.push("web login password is not configured");
  const status = red.length ? "red" : amber.length ? "amber" : "green";
  return json(
    {
      status,
      problems: [...red, ...amber],
      revision: loaded.row.revision,
      setups: loaded.document.setups.length,
      enabledSetups: enabled,
      deadletters: Number(counts?.deadletters ?? 0),
      undelivered: Number(counts?.undelivered ?? 0),
      lastCycle: loaded.document.lastCycle,
    },
    red.length ? 503 : 200,
  );
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const served = staticRoute(request, url.pathname);
  if (served) return served;
  const session = await sessionRoute(request, env, url);
  if (session) return session;
  if (!url.pathname.startsWith("/api/scanner/")) return new Response("Not found", { status: 404 });
  const auth = await authorizationMode(request, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (
    auth === "session" &&
    !["GET", "HEAD"].includes(request.method) &&
    !validSameOriginMutation(request)
  ) {
    return json({ error: "invalid request origin" }, 403);
  }

  if (request.method === "GET" && url.pathname === "/api/scanner/health") return health(env);
  if (request.method === "GET" && url.pathname === "/api/scanner/setups") {
    const loaded = await loadState(env.DB);
    return json({ revision: loaded.row.revision, setups: loaded.document.setups });
  }
  if (
    request.method === "POST" &&
    (url.pathname === "/api/scanner/import/preview" || url.pathname === "/api/scanner/import")
  ) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("valid JSON body required");
    }
    const input = validateBulkInput(body);
    if (typeof input === "string") return badRequest(input);
    if (url.pathname === "/api/scanner/import" && request.headers.get("x-market-scanner") !== "confirm") {
      return badRequest("x-market-scanner: confirm header required");
    }
    try {
      if (url.pathname.endsWith("/preview")) return json({ preview: await previewBulkImport(env, input) });
      return json(await importBulkSetups(env, input), 201);
    } catch (error) {
      return apiFailure(error);
    }
  }
  if (request.method === "GET" && url.pathname === "/api/scanner/events") {
    const events = await env.DB
      .prepare(
        `SELECT id, setup_id, kind, symbol, bar_ts_utc, created_at_utc, price,
                message, delivery_status
         FROM scanner_events ORDER BY id DESC LIMIT 50`,
      )
      .all();
    return json({ events: events.results });
  }
  if (request.method === "GET" && url.pathname === "/api/scanner/deadletters") {
    const deadletters = await env.DB
      .prepare(
        `SELECT d.id, d.event_id, d.channel, d.error, d.attempts, d.last_try_at,
                e.kind, e.symbol, e.message
         FROM scanner_deadletter d
         JOIN scanner_events e ON e.id = d.event_id
         WHERE d.resolved = 0
         ORDER BY d.id DESC LIMIT 50`,
      )
      .all();
    return json({ deadletters: deadletters.results });
  }
  if (request.method === "POST" && url.pathname === "/api/scanner/setups") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("valid JSON body required");
    }
    const input = validateSetupInput(body);
    if (typeof input === "string") return badRequest(input);
    try {
      return json({ setup: await addSetup(env, input) }, 201);
    } catch (error) {
      return apiFailure(error);
    }
  }
  const setupRoute = url.pathname.match(/^\/api\/scanner\/setups\/(\d+)$/);
  if (setupRoute) {
    const id = Number(setupRoute[1]);
    if (!Number.isSafeInteger(id) || id < 1) return badRequest("setup id must be positive");
    if (request.method === "PATCH") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return badRequest("valid JSON body required");
      }
      const patch = validateSetupPatch(body);
      if (typeof patch === "string") return badRequest(patch);
      try {
        return json({ setup: await updateSetup(env, id, patch) });
      } catch (error) {
        return apiFailure(error);
      }
    }
    if (request.method === "DELETE") {
      try {
        await deleteSetup(env, id);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      } catch (error) {
        return apiFailure(error);
      }
    }
  }
  const deadletterRoute = url.pathname.match(/^\/api\/scanner\/deadletters\/(\d+)\/ack$/);
  if (request.method === "POST" && deadletterRoute) {
    const id = Number(deadletterRoute[1]);
    if (!Number.isSafeInteger(id) || id < 1) return badRequest("dead letter id must be positive");
    if (request.headers.get("x-market-scanner") !== "confirm") {
      return badRequest("x-market-scanner: confirm header required");
    }
    const result = await env.DB
      .prepare("UPDATE scanner_deadletter SET resolved = 1 WHERE id = ? AND resolved = 0")
      .bind(id)
      .run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      return json({ error: `unresolved dead letter ${id} was not found` }, 404);
    }
    return json({ acknowledged: id });
  }
  if (request.method === "POST" && url.pathname === "/api/scanner/run") {
    if (request.headers.get("x-market-scanner") !== "confirm") {
      return badRequest("x-market-scanner: confirm header required");
    }
    try {
      const result = await runCycle(env, new Date(), url.searchParams.get("force") === "1");
      console.log("scanner_cycle_done", result);
      return json(result);
    } catch (error) {
      await recordCycleFailure(env, error);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/scanner/test-notification") {
    if (request.headers.get("x-market-scanner") !== "confirm") {
      return badRequest("x-market-scanner: confirm header required");
    }
    const result = await sendTestNotification(env);
    return json(result, result.deliveryOk ? 200 : 502);
  }
  if (request.method === "POST" && url.pathname === "/api/scanner/send-web-password") {
    if (auth !== "bearer") return json({ error: "bearer authorization required" }, 403);
    if (request.headers.get("x-market-scanner") !== "confirm") {
      return badRequest("x-market-scanner: confirm header required");
    }
    if (!webPasswordConfigured(env)) {
      return json({ error: "web login password is not configured" }, 503);
    }
    const delivery = await sendTelegram(
      [
        "🔐 MarketScanner web access",
        `Password: ${env.WEB_PASSWORD}`,
        "Guardala en tu administrador de contraseñas y luego eliminá este mensaje.",
      ].join("\n"),
      env,
    );
    return json({ delivery }, delivery.ok ? 200 : 502);
  }
  return json({ error: "not found" }, 404);
}

export default {
  fetch: handleFetch,
  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    try {
      if (!isScannerWindow(now)) return;
      const result = await runCycle(env, now);
      console.log("scanner_cycle_done", result);
    } catch (error) {
      console.error("scanner_cycle_failed", error);
      await recordCycleFailure(env, error, now);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

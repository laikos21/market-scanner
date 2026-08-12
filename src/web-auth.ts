import { integerSetting } from "./config";
import type { Env } from "./types";

const COOKIE_NAME = "__Host-market_scanner_session";
const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=");
  }
  return null;
}

export function webPasswordConfigured(env: Env): boolean {
  return typeof env.WEB_PASSWORD === "string" && env.WEB_PASSWORD.length >= 16;
}

export async function verifyWebPassword(candidate: string, env: Env): Promise<boolean> {
  if (!webPasswordConfigured(env)) return false;
  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(env.WEB_PASSWORD),
  ]);
  return constantTimeEqual(candidateDigest, expectedDigest);
}

export async function createSessionCookie(env: Env, now = new Date()): Promise<string> {
  const ttlDays = integerSetting(
    "WEB_SESSION_TTL_DAYS",
    env.WEB_SESSION_TTL_DAYS,
    30,
    1,
    90,
  );
  const maxAge = ttlDays * 86_400;
  const expiresAt = Math.floor(now.getTime() / 1000) + maxAge;
  const signed = String(expiresAt);
  const token = `${signed}.${await signature(signed, env.API_TOKEN)}`;
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function verifyWebSession(
  request: Request,
  env: Env,
  now = new Date(),
): Promise<boolean> {
  const value = cookieValue(request);
  if (!value) return false;
  const [expiresText, suppliedSignature, extra] = value.split(".");
  if (extra !== undefined || !/^\d{10}$/.test(expiresText ?? "") || !suppliedSignature) {
    return false;
  }
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now.getTime() / 1000)) {
    return false;
  }
  const expectedSignature = await signature(expiresText, env.API_TOKEN);
  return constantTimeEqual(encoder.encode(suppliedSignature), encoder.encode(expectedSignature));
}

export function validSameOriginMutation(request: Request): boolean {
  const url = new URL(request.url);
  return (
    request.headers.get("origin") === url.origin &&
    request.headers.get("x-market-scanner-web") === "confirm"
  );
}


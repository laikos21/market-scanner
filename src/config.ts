export function integerSetting(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function numberSetting(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be a number from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function requireRuntimeSecrets(env: {
  ALPACA_KEY_ID?: string;
  ALPACA_SECRET_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}): void {
  const missing = [
    ["ALPACA_KEY_ID", env.ALPACA_KEY_ID],
    ["ALPACA_SECRET_KEY", env.ALPACA_SECRET_KEY],
    ["TELEGRAM_BOT_TOKEN", env.TELEGRAM_BOT_TOKEN],
    ["TELEGRAM_CHAT_ID", env.TELEGRAM_CHAT_ID],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) throw new Error(`missing required secrets: ${missing.join(", ")}`);
}

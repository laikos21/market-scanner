import type {
  EventDraft,
  ScannerSetup,
  ScannerStateDocument,
  StateRow,
} from "./types";

const MAX_STATE_BYTES = 500_000;

export class StateConflictError extends Error {
  constructor() {
    super("scanner state changed concurrently; cycle was not committed");
    this.name = "StateConflictError";
  }
}

function parseDocument(raw: string): ScannerStateDocument {
  const value = JSON.parse(raw) as Partial<ScannerStateDocument>;
  if (
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.nextSetupId) ||
    Number(value.nextSetupId) < 1 ||
    !Array.isArray(value.setups)
  ) {
    throw new Error("scanner_state contains an unsupported document");
  }
  const symbols = new Set<string>();
  for (const setup of value.setups) {
    if (
      !setup ||
      typeof setup !== "object" ||
      !Number.isSafeInteger(setup.id) ||
      !/^[A-Z0-9.\-]{1,16}$/.test(setup.symbol) ||
      typeof setup.enabled !== "boolean" ||
      (setup.signalPeriod !== 9 && setup.signalPeriod !== 10) ||
      !Number.isInteger(setup.confirmationWindowBars) ||
      setup.confirmationWindowBars < 1 ||
      setup.confirmationWindowBars > 24 ||
      (setup.source !== undefined &&
        (typeof setup.source !== "string" || setup.source.length > 80)) ||
      !setup.state ||
      typeof setup.state !== "object"
    ) {
      throw new Error("scanner_state contains an invalid setup");
    }
    if (symbols.has(setup.symbol)) {
      throw new Error(`scanner_state contains duplicate symbol ${setup.symbol}`);
    }
    symbols.add(setup.symbol);
  }
  return value as ScannerStateDocument;
}

export async function loadState(
  db: D1Database,
): Promise<{ row: StateRow; document: ScannerStateDocument; rowsRead: number }> {
  const result = await db
    .prepare("SELECT revision, state_json, commit_token FROM scanner_state WHERE id = 1")
    .all<StateRow>();
  const row = result.results[0];
  if (!row) throw new Error("scanner_state row is missing; apply D1 migrations");
  return {
    row,
    document: parseDocument(row.state_json),
    rowsRead: Number(result.meta.rows_read ?? 0),
  };
}

function eventInsert(
  db: D1Database,
  event: EventDraft,
  token: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO scanner_events
       (setup_id, kind, symbol, bar_ts_utc, created_at_utc, price, message,
        delivery_status, delivery_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', '{}'
       WHERE (SELECT commit_token FROM scanner_state WHERE id = 1) = ?`,
    )
    .bind(
      event.setupId,
      event.kind,
      event.symbol,
      event.barTsUtc,
      event.createdAtUtc,
      event.price,
      event.message,
      token,
    );
}

export async function commitState(
  db: D1Database,
  previous: StateRow,
  document: ScannerStateDocument,
  events: EventDraft[] = [],
): Promise<{ revision: number; eventIds: number[]; rowsWritten: number }> {
  const encoded = JSON.stringify(document);
  const bytes = new TextEncoder().encode(encoded).byteLength;
  if (bytes > MAX_STATE_BYTES) {
    throw new Error(`scanner state is ${bytes} bytes; hard limit is ${MAX_STATE_BYTES}`);
  }
  const token = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        `UPDATE scanner_state
         SET revision = revision + 1, state_json = ?, commit_token = ?, updated_at = ?
         WHERE id = 1 AND revision = ?`,
      )
      .bind(encoded, token, new Date().toISOString(), previous.revision),
    ...events.map((event) => eventInsert(db, event, token)),
  ];
  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new StateConflictError();
  const eventIds: number[] = [];
  for (const result of results.slice(1)) {
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new Error("event insert was not committed with scanner state");
    }
    eventIds.push(Number(result.meta.last_row_id));
  }
  return {
    revision: previous.revision + 1,
    eventIds,
    rowsWritten: results.reduce(
      (total, result) => total + Number(result.meta.rows_written ?? 0),
      0,
    ),
  };
}

export function findSetup(document: ScannerStateDocument, id: number): ScannerSetup {
  const setup = document.setups.find((candidate) => candidate.id === id);
  if (!setup) throw new SetupNotFoundError(id);
  return setup;
}

export class SetupNotFoundError extends Error {
  constructor(id: number) {
    super(`scanner setup ${id} was not found`);
    this.name = "SetupNotFoundError";
  }
}

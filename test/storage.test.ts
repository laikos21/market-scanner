import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { emptyRuntimeState } from "../src/engine";
import { commitState, loadState } from "../src/storage";

async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM scanner_deadletter"),
    env.DB.prepare("DELETE FROM scanner_events"),
    env.DB
      .prepare(
        `UPDATE scanner_state SET revision = 0, commit_token = '', updated_at = ?,
         state_json = ? WHERE id = 1`,
      )
      .bind(
        "1970-01-01T00:00:00.000Z",
        '{"schemaVersion":1,"nextSetupId":1,"setups":[],"lastCycle":null}',
      ),
  ]);
}

describe("D1 commit boundary", () => {
  beforeEach(resetDatabase);

  it("commits the setup state and pending event together", async () => {
    const loaded = await loadState(env.DB);
    loaded.document.setups.push({
      id: 1,
      symbol: "NVDA",
      enabled: true,
      signalPeriod: 10,
      confirmationWindowBars: 6,
      note: "",
      createdAt: "2026-08-11T13:00:00Z",
      state: emptyRuntimeState(),
    });
    loaded.document.nextSetupId = 2;
    const committed = await commitState(env.DB, loaded.row, loaded.document, [
      {
        setupId: 1,
        kind: "early",
        symbol: "NVDA",
        barTsUtc: "2026-08-11T14:00:00Z",
        createdAtUtc: "2026-08-11T14:01:00Z",
        price: 100,
        message: "test signal",
      },
    ]);
    expect(committed.eventIds).toHaveLength(1);
    const state = await loadState(env.DB);
    expect(state.document.setups).toHaveLength(1);
    const event = await env.DB
      .prepare("SELECT delivery_status, message FROM scanner_events WHERE id = ?")
      .bind(committed.eventIds[0])
      .first<{ delivery_status: string; message: string }>();
    expect(event).toEqual({ delivery_status: "pending", message: "test signal" });
  });
});


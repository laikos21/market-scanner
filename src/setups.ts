import { integerSetting } from "./config";
import { emptyRuntimeState } from "./engine";
import { commitState, findSetup, loadState, StateConflictError } from "./storage";
import type { Env, ScannerSetup } from "./types";

export interface SetupInput {
  symbol: string;
  signalPeriod?: 9 | 10;
  confirmationWindowBars?: number;
  note?: string;
  source?: string;
}

function enabledLimit(env: Env): number {
  return integerSetting("SCANNER_SETUP_LIMIT", env.SCANNER_SETUP_LIMIT, 120, 1, 200);
}

export async function addSetup(
  env: Env,
  input: SetupInput,
  now = new Date(),
): Promise<ScannerSetup> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadState(env.DB);
    if (loaded.document.setups.some((setup) => setup.symbol === input.symbol)) {
      throw new Error(`${input.symbol} already has a 620 setup`);
    }
    if (loaded.document.setups.filter((setup) => setup.enabled).length >= enabledLimit(env)) {
      throw new Error(`enabled setup limit reached (${enabledLimit(env)})`);
    }
    const setup: ScannerSetup = {
      id: loaded.document.nextSetupId,
      symbol: input.symbol,
      enabled: true,
      signalPeriod: input.signalPeriod ?? 9,
      confirmationWindowBars: input.confirmationWindowBars ?? 6,
      note: input.note ?? "",
      source: input.source?.trim() || undefined,
      createdAt: now.toISOString(),
      state: emptyRuntimeState(),
    };
    loaded.document.nextSetupId += 1;
    loaded.document.setups.push(setup);
    try {
      await commitState(env.DB, loaded.row, loaded.document);
      return setup;
    } catch (error) {
      if (!(error instanceof StateConflictError) || attempt === 2) throw error;
    }
  }
  throw new StateConflictError();
}

export interface SetupPatch {
  enabled?: boolean;
  signalPeriod?: 9 | 10;
  confirmationWindowBars?: number;
  note?: string;
}

export async function updateSetup(
  env: Env,
  id: number,
  patch: SetupPatch,
): Promise<ScannerSetup> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadState(env.DB);
    const source = findSetup(loaded.document, id);
    const index = loaded.document.setups.findIndex((setup) => setup.id === id);
    if (
      patch.enabled === true &&
      !source.enabled &&
      loaded.document.setups.filter((setup) => setup.enabled).length >= enabledLimit(env)
    ) {
      throw new Error(`enabled setup limit reached (${enabledLimit(env)})`);
    }
    const setup = structuredClone(source);
    const formulaChanged =
      patch.signalPeriod !== undefined && patch.signalPeriod !== setup.signalPeriod;
    const resumed = patch.enabled === true && !setup.enabled;
    if (patch.enabled !== undefined) setup.enabled = patch.enabled;
    if (patch.signalPeriod !== undefined) setup.signalPeriod = patch.signalPeriod;
    if (patch.confirmationWindowBars !== undefined) {
      setup.confirmationWindowBars = patch.confirmationWindowBars;
    }
    if (patch.note !== undefined) setup.note = patch.note;
    if (formulaChanged || resumed) {
      setup.state = emptyRuntimeState();
      setup.state.detail = formulaChanged
        ? "indicator formula changed; re-priming from closed bars"
        : "resumed; re-priming from closed bars";
    } else if (!setup.enabled) {
      setup.state.detail = "paused by user";
    }
    loaded.document.setups[index] = setup;
    try {
      await commitState(env.DB, loaded.row, loaded.document);
      return setup;
    } catch (error) {
      if (!(error instanceof StateConflictError) || attempt === 2) throw error;
    }
  }
  throw new StateConflictError();
}

export async function deleteSetup(env: Env, id: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadState(env.DB);
    findSetup(loaded.document, id);
    loaded.document.setups = loaded.document.setups.filter((setup) => setup.id !== id);
    try {
      await commitState(env.DB, loaded.row, loaded.document);
      return;
    } catch (error) {
      if (!(error instanceof StateConflictError) || attempt === 2) throw error;
    }
  }
  throw new StateConflictError();
}

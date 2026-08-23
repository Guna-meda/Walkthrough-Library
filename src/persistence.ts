const STORAGE_KEY = "__walkthrough-lib:state";

export interface PersistedState {
  flowId: string;
  stepIndex: number;
  flowVersion: number;
  timestamp: number;
}

/** Type-guards a value parsed from storage before trusting its shape. */
function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.flowId === "string" &&
    typeof v.stepIndex === "number" &&
    typeof v.flowVersion === "number" &&
    typeof v.timestamp === "number"
  );
}

/** Persists exactly { flowId, stepIndex, flowVersion, timestamp } — never the full
 * Flow object or any selector/PII data. Best-effort: silently no-ops if sessionStorage
 * is unavailable (privacy mode, disabled storage, etc.). */
export function writeState(state: PersistedState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable — persistence is best-effort, never required
  }
}

/** Reads back the persisted state, or null if none exists or it's malformed. */
export function readState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Default expiry window for persisted state: 30 minutes. */
export const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

export function isExpired(state: PersistedState, expiryMs: number = DEFAULT_EXPIRY_MS): boolean {
  return Date.now() - state.timestamp > expiryMs;
}

/** Reads the persisted state back only if it matches the given flow's id/version and
 * hasn't expired — otherwise null. Never resumes silently against mismatched or stale
 * state: a version bump or a stale timestamp both count as "nothing to resume." */
export function readValidState(
  flow: { id: string; version: number },
  expiryMs: number = DEFAULT_EXPIRY_MS
): PersistedState | null {
  const state = readState();
  if (!state) return null;
  if (state.flowId !== flow.id || state.flowVersion !== flow.version) return null;
  if (isExpired(state, expiryMs)) return null;
  return state;
}

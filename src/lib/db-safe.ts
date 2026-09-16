/**
 * Safe Database Query Runner with Circuit Breaker
 * Prevents socket hanging and network timeouts while allowing full query latency on production PostgreSQL
 */

let dbCircuitOpen = false;
let dbLastFailureTime = 0;
const DB_CIRCUIT_COOLDOWN_MS = 15000; // 15 seconds cooldown before retrying DB

// Production cloud databases (e.g. Render, Supabase, Neon) over SSL need realistic query allowances
const CONFIG_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS || '15000', 10) || 15000;

export function isDatabaseCircuitOpen(): boolean {
  if (dbCircuitOpen) {
    if (Date.now() - dbLastFailureTime > DB_CIRCUIT_COOLDOWN_MS) {
      dbCircuitOpen = false;
      return false;
    }
    return true;
  }
  return false;
}

export function tripDatabaseCircuit(): void {
  dbCircuitOpen = true;
  dbLastFailureTime = Date.now();
}

export function resetDatabaseCircuit(): void {
  dbCircuitOpen = false;
}

export async function queryWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = CONFIG_TIMEOUT_MS
): Promise<T | null> {
  if (isDatabaseCircuitOpen()) {
    return null;
  }

  // Ensure production cloud database calls have at least CONFIG_TIMEOUT_MS to negotiate SSL and execute
  const effectiveTimeout = Math.max(timeoutMs, CONFIG_TIMEOUT_MS);

  try {
    let timer: any;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        tripDatabaseCircuit();
        resolve(null);
      }, effectiveTimeout);
    });

    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    if (result !== null) {
      dbCircuitOpen = false;
    }
    return result;
  } catch (err) {
    tripDatabaseCircuit();
    return null;
  }
}


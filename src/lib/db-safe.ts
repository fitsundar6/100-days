/**
 * Safe Database Query Runner with Circuit Breaker
 * Prevents socket hanging and network timeouts when PostgreSQL is offline
 */

let dbCircuitOpen = false;
let dbLastFailureTime = 0;
const DB_CIRCUIT_COOLDOWN_MS = 25000; // 25 seconds cooldown before retrying DB

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

export async function queryWithTimeout<T>(promise: Promise<T>, timeoutMs: number = 800): Promise<T | null> {
  if (isDatabaseCircuitOpen()) {
    return null;
  }

  try {
    let timer: any;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        tripDatabaseCircuit();
        resolve(null);
      }, timeoutMs);
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

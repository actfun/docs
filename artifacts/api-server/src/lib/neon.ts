import pg from "pg";
import { logger } from "./logger";

const { Pool } = pg;

/**
 * Dedicated connection pool for the external Neon Postgres database that the
 * Goldsky `actfun-analytics` pipeline writes decoded on-chain events into.
 *
 * This is intentionally separate from `@workspace/db` (which targets the
 * Replit-managed Postgres via DATABASE_URL). The events table is owned and
 * populated by Goldsky, so we only ever read from it here.
 */

let _pool: pg.Pool | null = null;

export function getNeonPool(): pg.Pool {
  if (_pool) return _pool;

  const connectionString = process.env["NEON_DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "NEON_DATABASE_URL must be set to serve on-chain event data.",
    );
  }

  _pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Hard caps so a stalled query can never hang a caller forever:
    // statement_timeout aborts server-side, query_timeout aborts client-side.
    statement_timeout: 12_000,
    query_timeout: 12_000,
  });

  _pool.on("error", (err) => {
    logger.error({ err }, "Neon pool error");
  });

  return _pool;
}

/** True when the underlying Postgres error means the table has not been created yet. */
export function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "42P01"
  );
}

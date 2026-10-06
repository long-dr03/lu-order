import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResult, types } from "pg";

// Amounts and IDs stay numbers in the API; reject lossy conversions.
function numeric(value: string) {
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER)
    throw new Error("Database numeric value exceeds safe range");
  return result;
}
types.setTypeParser(20, numeric);
types.setTypeParser(1700, numeric);
type TransactionContext = { client: PoolClient; queue: Promise<unknown> };
const context = new AsyncLocalStorage<TransactionContext>();
let pool: Pool | undefined;
function connection() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: "-c timezone=Asia/Ho_Chi_Minh -c statement_timeout=30000",
  });
  pool.on("error", () =>
    console.error("PostgreSQL idle connection disconnected"),
  );
  return pool;
}

// Keep bound values separate from SQL, including legacy named parameters.
export function bind(sql: string, args: unknown[]) {
  const values: unknown[] = [];
  let position = 0;
  const named =
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === "object" &&
    !Buffer.isBuffer(args[0])
      ? (args[0] as Record<string, unknown>)
      : undefined;
  const text = sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|\?|@[a-zA-Z_][\w]*/g,
    (token) => {
      if (token === "?" || token.startsWith("@")) {
        const value =
          token === "?" ? args[position++] : named?.[token.slice(1)];
        if (value === undefined) throw new Error("Missing SQL parameter");
        values.push(value);
        return `$${values.length}`;
      }
      return token;
    },
  );
  return { text, values };
}
async function execute(text: string, values?: unknown[]): Promise<QueryResult> {
  const active = context.getStore();
  if (!active) return connection().query(text, values);
  const pending = active.queue.then(() => active.client.query(text, values));
  active.queue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}
async function query(sql: string, args: unknown[] = []) {
  const { text, values } = bind(sql, args);
  return execute(text, values);
}
const identityTables = new Set([
  "lines",
  "order_variants",
  "order_stages",
  "production_logs",
  "audit_logs",
  "qc_records",
  "operation_records",
  "production_adjustments",
  "stage_events",
  "order_work_items",
  "pending_packing_pay",
]);
export const db = {
  prepare(sql: string) {
    return {
      async all(...args: unknown[]): Promise<unknown[]> {
        return (await query(sql, args)).rows;
      },
      async get(...args: unknown[]): Promise<unknown> {
        return (await query(sql, args)).rows[0];
      },
      async run(...args: unknown[]) {
        const table = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql)?.[1];
        const text =
          table && identityTables.has(table) && !/\bRETURNING\b/i.test(sql)
            ? sql.trim().replace(/;$/, "") + " RETURNING id"
            : sql;
        const result = await query(text, args);
        return {
          changes: result.rowCount ?? 0,
          lastInsertRowid: result.rows[0]?.id as number | undefined,
        };
      },
    };
  },
  async exec(sql: string) {
    await execute(sql);
  },
  transaction<T>(
    operation: () => T | Promise<T>,
    options: { readOnly?: boolean } = {},
  ) {
    const run = async (): Promise<T> => {
      if (context.getStore()) return operation();
      const client = await connection().connect();
      try {
        await client.query(
          options.readOnly
            ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
            : "BEGIN",
        );
        // Preserve the original single-writer guarantees across replicas. Reads stay concurrent.
        if (!options.readOnly)
          await client.query("SELECT pg_advisory_xact_lock(71824019)");
        const result = await context.run(
          { client, queue: Promise.resolve() },
          operation,
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
    return Object.assign(run, { immediate: run });
  },
  async close() {
    await pool?.end();
    pool = undefined;
  },
};

import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  var __remixSql: Sql | undefined;
}

function connect(): Sql {
  if (global.__remixSql) return global.__remixSql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Put it in web/.env.local (or your host's environment variables) pointing at your Postgres database."
    );
  }
  // SSL is driven by the connection string itself (Neon's connection strings
  // include `sslmode=require`; a local dev Postgres typically won't).
  // Neon's pooled endpoint ("-pooler" in the host) is PgBouncer in
  // transaction mode, where a prepared statement can outlive the connection
  // it was made on — so don't prepare there.
  const client = postgres(connectionString, { prepare: !/-pooler\./.test(connectionString) });
  // Kept across dev hot reloads (and, harmlessly, for the life of a
  // production server process) so there's one pool, not one per reload.
  global.__remixSql = client;
  return client;
}

// Connects on first use rather than at import, so the app can be built
// without a database — a first deploy happens before one is attached.
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply: (_target, _this, args: Parameters<Sql>) => connect()(...args),
  get: (_target, property) => {
    const client = connect();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default sql;

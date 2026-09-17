import postgres from "postgres";

declare global {
  var __remixSql: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres database."
  );
}

// SSL is driven by the connection string itself (Neon's connection strings
// include `sslmode=require`; a local dev Postgres typically won't).
export const sql = global.__remixSql ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") global.__remixSql = sql;

export default sql;

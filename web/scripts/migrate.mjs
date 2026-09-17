// One-off schema setup: `node scripts/migrate.mjs`
// Requires DATABASE_URL in the environment (or .env.local, loaded below).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadDotEnvLocal();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set (checked env and .env.local).");
  process.exit(1);
}

const sql = postgres(connectionString);
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Schema applied.");
} finally {
  await sql.end();
}

// `npm test`: runs everything under tests/ against a real app.
//
// Sets up what the end-to-end tests need and throws it away afterwards: a
// throwaway database (<your database>_test, on the same Postgres as
// DATABASE_URL in .env.local — local ones only; set TEST_DATABASE_URL to use
// another), a temporary storage folder (local-disk storage, whatever
// .env.local says), and a dev server of its own on a free port.
import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function envLocal(name) {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^["']|["']$/g, "");
}

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? envLocal("DATABASE_URL");
  if (!base) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL in .env.local) to a Postgres the tests can use");
  const url = new URL(base);
  // The tests create users and delete queued songs: never near a real database.
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`DATABASE_URL isn't a local database (${url.hostname}) — set TEST_DATABASE_URL to a throwaway one`);
  }
  url.pathname = `${url.pathname.replace(/^\//, "") || "postgres"}_test`;
  return url.toString();
}

async function prepareDatabase(url) {
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const server = postgres(admin.toString(), { onnotice: () => {} });
  try {
    const [exists] = await server`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!exists) await server.unsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await server.end();
  }
  const db = postgres(url, { onnotice: () => {} });
  try {
    await db.unsafe(fs.readFileSync(path.join(root, "scripts", "schema.sql"), "utf8"));
  } finally {
    await db.end();
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitFor(url, server, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error("The dev server exited before it was ready");
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The dev server didn't answer at ${url} in time`);
}

const databaseUrl = testDatabaseUrl();
await prepareDatabase(databaseUrl);

const storage = fs.mkdtempSync(path.join(os.tmpdir(), "remixt-test-storage-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;

// Local-disk storage, whatever the environment says: no Blob or R2.
const serverEnv = { ...process.env, DATABASE_URL: databaseUrl, STORAGE_DIR: storage, SESSION_SECRET: "test-secret" };
for (const name of Object.keys(serverEnv)) {
  if (name.endsWith("READ_WRITE_TOKEN") || name.startsWith("R2_")) serverEnv[name] = "";
}
delete serverEnv.NODE_ENV;

const log = [];
const server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port)], {
  cwd: root,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
});
server.stdout.on("data", (chunk) => log.push(chunk));
server.stderr.on("data", (chunk) => log.push(chunk));

function stopServer() {
  if (server.exitCode !== null) return;
  try {
    // The whole group: next dev runs its server in a child process.
    if (process.platform !== "win32") process.kill(-server.pid, "SIGTERM");
    else server.kill();
  } catch {
    // Already gone.
  }
}
process.on("exit", () => {
  stopServer();
  fs.rmSync(storage, { recursive: true, force: true });
});
process.on("SIGINT", () => process.exit(130));

let code = 1;
try {
  console.log(`Starting a dev server for the tests on ${baseUrl}…`);
  // Asked for once first, so the tests don't wait on compiling it.
  await waitFor(`${baseUrl}/api/auth/me`, server);
  const files = fs
    .readdirSync(path.join(root, "tests"))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => path.join("tests", f));
  const tests = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files, ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, BASE_URL: baseUrl, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  code = await new Promise((resolve) => tests.on("exit", (c) => resolve(c ?? 1)));
} catch (err) {
  console.error(String(err));
  console.error(Buffer.concat(log).toString().slice(-4000));
} finally {
  stopServer();
}
process.exit(code);

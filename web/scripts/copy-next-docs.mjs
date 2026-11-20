// Copies the Next.js docs that ship with the installed `next` package
// (node_modules/next/dist/docs) to .next-docs/, so they can be read without
// opening node_modules (agents are denied that folder). The folder is wiped
// and copied again on every run, so it always matches the installed version.
// Runs from "postinstall" (see package.json); .next-docs/ is gitignored.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "next", "dist", "docs");
const to = path.join(root, ".next-docs");

fs.rmSync(to, { recursive: true, force: true });
if (!fs.existsSync(from)) {
  // Older or trimmed `next` builds have no docs: don't fail the install.
  console.log("copy-next-docs: node_modules/next/dist/docs not found, nothing copied");
  process.exit(0);
}
fs.cpSync(from, to, { recursive: true });

const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "node_modules", "next", "package.json"), "utf8"),
);
fs.writeFileSync(
  path.join(to, "VERSION"),
  `Copied from node_modules/next/dist/docs of next@${version} by scripts/copy-next-docs.mjs.\n`,
);
let count = 0;
for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
  if (entry.isFile()) count++;
}
console.log(`copied ${count} Next.js ${version} doc files to .next-docs/`);

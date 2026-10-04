// Lets the tests import the app's TypeScript the way Next.js does: the
// "@/…" alias for src/, and relative imports without the ".ts" ending.
//
//   node --import ./tests/support/register.mjs --test tests/…
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = new URL("../../src/", import.meta.url);

function withExtension(url) {
  const file = fileURLToPath(url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return url;
  for (const ending of [".ts", ".tsx", "/index.ts"]) {
    if (fs.existsSync(file + ending)) return pathToFileURL(file + ending).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const found = withExtension(new URL(specifier.slice(2), src).href);
    if (found) return next(found, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const found = withExtension(new URL(specifier, context.parentURL).href);
    if (found) return next(found, context);
  }
  return next(specifier, context);
}

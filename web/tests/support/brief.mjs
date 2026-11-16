// A test reporter that says only what went wrong, and the totals — for a
// quick check (or a reader paying by the word): `npm test -- --brief`.
// Everything that passed is one number at the end.

import path from "node:path";

export default async function* brief(source) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const startedAt = Date.now();
  for await (const event of source) {
    const data = event.data;
    // A suite passes or fails with its tests: only the tests are counted.
    if (data?.details?.type === "suite") continue;
    if (event.type === "test:pass") {
      if (data.skip !== undefined || data.todo !== undefined) counts.skipped++;
      else counts.passed++;
    } else if (event.type === "test:fail") {
      counts.failed++;
      const error = data.details?.error;
      const cause = error?.cause ?? error;
      const message = String(cause?.message ?? cause ?? "failed").split("\n").slice(0, 12).join("\n    ");
      const where = data.file ? `${path.relative(process.cwd(), data.file)}:${data.line ?? "?"}` : "";
      yield `✖ ${data.name}\n    ${where}\n    ${message}\n`;
    }
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  yield `${counts.failed ? "✖" : "✔"} ${counts.passed} passed, ${counts.failed} failed${counts.skipped ? `, ${counts.skipped} skipped` : ""} (${seconds} s)\n`;
}

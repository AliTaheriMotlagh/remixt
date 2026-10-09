// Names this build, for the "new version" prompt (components/UpdatePrompt).
// Written to .build-id before `build` and read by next.config.ts as the
// deploymentId, so `next build` and a later `next start` agree on it (a
// value made inside next.config would differ between the two). Gitignored.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || `b${Date.now().toString(36)}`;
fs.writeFileSync(path.join(root, ".build-id"), id);
console.log(`build id ${id}`);

// Copies the ONNX Runtime Web files the song splitter loads at runtime into
// public/ort/, so they're served from this app rather than a CDN. Runs
// before `dev` and `build` (see package.json); public/ort is gitignored.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "onnxruntime-web", "dist");
const to = path.join(root, "public", "ort");

// The standard runtime build and its "JSEP" WebAssembly backend, which
// does both WebGPU and the CPU fallback. (ort.webgpu.min.mjs pairs with a
// different backend build, "asyncify" — the two must match.)
const files = [
  "ort.min.mjs",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];

fs.mkdirSync(to, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
console.log(`copied ${files.length} ONNX Runtime files to public/ort`);

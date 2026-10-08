// Copies the ONNX Runtime Web files the song splitter and the beat model
// load at runtime into public/ort/, so they're served from this app rather
// than a CDN, and the high-quality stretcher's AudioWorklet module into
// public/stretch/ (one URL every render reuses). Runs before `dev` and
// `build` (see package.json); both folders are gitignored.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fixStretchWorklet } from "./stretchFix.mjs";

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

const stretchFrom = path.join(root, "node_modules", "signalsmith-stretch", "SignalsmithStretch.mjs");
const stretchTo = path.join(root, "public", "stretch");
fs.mkdirSync(stretchTo, { recursive: true });
const stretch = fixStretchWorklet(fs.readFileSync(stretchFrom, "utf8"));
fs.writeFileSync(path.join(stretchTo, "SignalsmithStretch.mjs"), stretch);
console.log("copied the stretcher's worklet to public/stretch");

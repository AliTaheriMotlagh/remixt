import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party libraries copied as they ship (minified builds served to the browser):
    // ONNX Runtime Web (the splitter's model runtime) and Signalsmith Stretch (time-stretch).
    // They're never edited here, so their own style isn't ours to lint.
    "public/ort/**",
    "public/stretch/**",
  ]),
]);

export default eslintConfig;

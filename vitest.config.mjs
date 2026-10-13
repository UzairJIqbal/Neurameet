import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Unit suite for pure transcript-generation logic (Bug 1-3 regression guards)
// plus component tests (AfterMeetingRecap). Mirrors the project's
// `@/*` -> `./src/*` path alias so tests import the real source modules. Runs
// in Node (no browser); deterministic, no live server. The React plugin
// transforms JSX in `.tsx` test files and the components they import.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

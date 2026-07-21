import { defineConfig } from "vitest/config";

// Tests import { describe, it, expect } from "vitest" explicitly, so globals stay off.
// The whole simulation lives in @iron/shared and runs in plain Node, so the default
// node environment is correct.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "packages/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});

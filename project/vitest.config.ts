import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/pdf/**"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

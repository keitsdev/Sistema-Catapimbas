import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    setupFiles: ["./server/test.setup.ts"],
  },
});

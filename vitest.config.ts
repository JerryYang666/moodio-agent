import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    env: {
      // Some helpers transitively import @/lib/db (which throws at module load
      // when DATABASE_URL is unset). Tests that exercise those modules don't
      // actually hit the DB — providing a placeholder lets them load.
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

import { defineConfig } from "vitest/config";

/**
 * Unit tests only, beside the code they cover. Nothing here starts Next.js, reads the
 * store or touches the network — `npm test` has to pass on a laptop with no .env and no
 * connection, which is also what makes it safe in CI.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

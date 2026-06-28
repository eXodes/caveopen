import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^(\..+)\.js$/, replacement: "$1" }],
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "src/test/**"],
  },
});

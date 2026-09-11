import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "test-results",
});

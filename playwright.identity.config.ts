import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/identity-e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4310", headless: true, trace: "off", ...(process.env.IDENTITY_BROWSER_CHANNEL ? { channel: process.env.IDENTITY_BROWSER_CHANNEL } : {}) },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4310",
    url: "http://127.0.0.1:4310/login",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/analytics-e2e", workers: 1, timeout: 90000,
  use: { baseURL: "http://127.0.0.1:4313", headless: true, trace: "off", ...(process.env.IDENTITY_BROWSER_CHANNEL ? { channel: process.env.IDENTITY_BROWSER_CHANNEL } : {}) },
  webServer: { command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4313", url: "http://127.0.0.1:4313/login", reuseExistingServer: false, timeout: 30000 },
});

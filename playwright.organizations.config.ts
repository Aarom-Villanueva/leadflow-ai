import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/organizations-e2e", workers: 1, timeout: 90000,
 use: { baseURL: "http://127.0.0.1:4314", headless: true, trace: "off", ...(process.env.IDENTITY_BROWSER_CHANNEL ? { channel: process.env.IDENTITY_BROWSER_CHANNEL } : {}) },
 webServer: { command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4314", url: "http://127.0.0.1:4314/login", reuseExistingServer: false, timeout: 30000 },
});

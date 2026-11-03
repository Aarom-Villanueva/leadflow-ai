import { expect, test } from "@playwright/test";

test("home identifies the product and supports keyboard navigation", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/LeadFlow AI/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mejores próximos pasos.");
  await expect(page.getByText("las funciones comerciales todavía no están disponibles.", { exact: false })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.getByRole("link", { name: "Explorar la visión" }).click();
  await expect(page).toHaveURL(/#vision$/);
});
test("home fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("health returns minimal uncached liveness and security headers", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", service: "leadflow-ai" });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
test("unknown pages return 404 without internal details", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
});

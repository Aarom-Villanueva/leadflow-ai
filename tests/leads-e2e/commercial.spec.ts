import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

test("real commercial lifecycle persists across reloads, with accessibility on desktop and mobile", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await page.goto("/register");
  await page.getByLabel("Nombre completo").fill("Persona Browser Comercial");
  await page.getByLabel("Correo").fill(`browser-${suffix}@commercial-test.invalid`);
  await page.getByLabel("Contraseña").fill("Synthetic-browser-password-026!");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations$/);
  await page.getByRole("link", { name: "Crear organización", exact: true }).click();
  await page.getByLabel("Nombre de la organización").fill("Equipo Comercial Browser");
  await page.getByLabel("Identificador").fill("commercial-browser-" + suffix);
  await page.getByRole("button", { name: "Crear organización", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu espacio de trabajo" })).toBeVisible();
  const workspace = page.url();
  await page.getByRole("link", { name: "Prospectos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nuevo prospecto" })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Nuevo prospecto" }).click();
  await page.getByLabel("Nombre del prospecto").fill("Prospecto Browser");
  await page.getByLabel("Correo", { exact: true }).fill("lead@commercial-test.invalid");
  await page.getByLabel("Teléfono").fill("+51912345678");
  await page.getByLabel("Responsable", { exact: true }).last().selectOption({ label: "Persona Browser Comercial" });
  await page.getByRole("button", { name: "Crear prospecto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prospecto Browser", exact: true })).toBeVisible();
  const detail = page.url();
  await page.reload();
  await expect(page.getByLabel("Nombre del prospecto")).toHaveValue("Prospecto Browser");
  await page.getByLabel("Nombre del prospecto").fill("Prospecto actualizado");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await expect(page.getByRole("link", { name: "Prospecto actualizado", exact: true })).toBeVisible();
  await Promise.all([page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("/leads/")), page.getByLabel("Mover Prospecto actualizado").selectOption({ label: "Ganado" })]);
  await expect(page.getByLabel("Mover Prospecto actualizado")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Mover Prospecto actualizado").locator('option:checked')).toHaveText("Ganado");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto(detail);
  await expect(page.getByText("Nuevo → Ganado", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Archivar prospecto", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar archivo" }).click();
  await expect(page.getByText("Este prospecto está archivado. Su historial se conserva.")).toBeVisible();
  await page.goto(workspace + "/leads");
  await expect(page.getByRole("button", { name: "Nuevo prospecto" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Prospecto actualizado", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("true");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("link", { name: "Prospecto actualizado", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Etapas", exact: true }).click();
  await page.getByLabel("Nombre de nueva etapa").fill("Seguimiento técnico");
  await page.getByRole("button", { name: "Crear etapa", exact: true }).click();
  await expect(page.getByRole("form", { name: "Editar etapa Seguimiento técnico" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("moving a lead after loading a second board page preserves all loaded cards", async ({ page }) => {
  const origin = "http://127.0.0.1:4311", suffix = randomUUID().slice(0, 8);
  const headers = { origin };
  const signup = await page.request.post("/api/auth/sign-up/email", { headers, data: { name: "Persona Pagination", email: `pagination-${suffix}@commercial-test.invalid`, password: "Synthetic-pagination-password-026!" } });
  expect(signup.status()).toBe(200);
  const response = await page.request.post("/api/organizations", { headers, data: { name: "Equipo Pagination", slug: "pagination-" + suffix, timezone: "America/Lima" } });
  expect(response.status()).toBe(201); const { id } = await response.json();
  const metadata = await (await page.request.get(`/api/organizations/${id}/pipeline`)).json();
  for (let index = 0; index < 51; index++) {
    const created = await page.request.post(`/api/organizations/${id}/leads`, { headers, data: { name: "Page " + String(index).padStart(3, "0"), stageId: metadata.stages[0].id, email: null, phoneE164: null, source: null, assignedUserId: null } });
    expect(created.status()).toBe(201);
  }
  await page.goto(`/app/${id}/pipeline`);
  await expect(page.getByText("50 prospectos cargados; hay más resultados.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cargar más", exact: true }).click();
  await expect(page.getByText("51 prospectos cargados.", { exact: true })).toBeVisible();
  await Promise.all([page.waitForResponse(value => value.request().method() === "PATCH" && value.url().includes("/leads/")), page.getByLabel("Mover Page 000", { exact: false }).selectOption({ label: "Propuesta" })]);
  await expect(page.getByLabel("Mover Page 000")).toBeEnabled();
  await expect(page.getByText("51 prospectos cargados.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mover Page 000").locator("option:checked")).toHaveText("Propuesta");
});

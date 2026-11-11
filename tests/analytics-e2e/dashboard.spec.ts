import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:4313", headers = { origin };
const api = "**/api/organizations/*/dashboard*";
async function account(page: Page, label: string) {
  const suffix = randomUUID().slice(0, 8);
  const signup = await page.request.post("/api/auth/sign-up/email", { headers, data: { name: "Persona Dashboard", email: `${label}-${suffix}@dashboard-test.invalid`, password: "Synthetic-dashboard-password-028!" } });
  expect(signup.status()).toBe(200);
  const created = await page.request.post("/api/organizations", { headers, data: { name: "Equipo Dashboard", slug: `${label}-${suffix}`, timezone: "America/Lima" } });
  expect(created.status()).toBe(201); return (await created.json()).id as string;
}

test("real dashboard: empty, exact figures, interval, refresh, reload, errors, isolation and accessibility", async ({ page, browser }) => {
  const org = await account(page, "dash"), base = `/api/organizations/${org}`;
  const post = async (path: string, data: unknown, method: "post" | "patch" = "post") => { const response = await page.request[method](base + path, { headers, data }); expect(response.ok()).toBe(true); return response.json(); };

  // Loading state, then a real empty organization: no invented figures and no 0 % for a zero denominator.
  await page.route(api, async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await page.goto(`/app/${org}`); await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cargando" })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  const stages = page.getByRole("region", { name: "Prospectos por etapa" }), conversion = page.getByRole("region", { name: "Conversión a ganado por cohorte" }), followups = page.getByRole("region", { name: "Seguimientos pendientes" }), summary = page.getByRole("group", { name: "Resumen" });
  await expect(stages.getByText("Aún no hay prospectos activos")).toBeVisible();
  await expect(conversion.getByText("Sin datos para este intervalo")).toBeVisible();
  await expect(conversion.getByText(/\d+ de \d+ · /)).toHaveCount(0);
  await expect(followups.getByText("No hay seguimientos pendientes.")).toBeVisible();
  await expect(page.getByText("Zona horaria: America/Lima")).toBeVisible();
  await expect(page.getByText(/^Intervalo: últimos 90 días, del .+ al .+/)).toBeVisible();
  await expect(page.getByText(/^Corte: /)).toBeVisible();
  await expect(summary).toContainText(/Prospectos activos\s*0/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Real data through the real API: a lead that enters won twice, one created in won, one open, one archived.
  const meta = await (await page.request.get(base + "/pipeline")).json();
  const stage = (name: string) => meta.stages.find((value: { name: string }) => value.name === name).id as string, me = meta.members[0].userId as string;
  const lead = async (stageId: string) => (await post("/leads", { name: "Prospecto dashboard", stageId, email: null, phoneE164: null, source: null, assignedUserId: null })).lead as { id: string };
  const repeated = await lead(stage("Nuevo"));
  for (const [version, target] of [[1, "Ganado"], [2, "Calificación"], [3, "Ganado"]] as const) await post(`/leads/${repeated.id}`, { version, stageId: stage(target) }, "patch");
  await lead(stage("Ganado")); const open = await lead(stage("Nuevo")), archived = await lead(stage("Calificación"));
  const followup = (leadId: string, dueAt: string) => post("/followups", { leadId, creationKey: randomUUID(), title: "Seguimiento dashboard", detail: null, assignedUserId: me, dueAt });
  await followup(open.id, "2020-01-01T00:00:00Z"); await followup(open.id, "2099-01-01T00:00:00Z"); await followup(archived.id, "2020-01-01T00:00:00Z");
  await post(`/leads/${archived.id}/archive`, { version: 1 });

  // Updating keeps the previous cutoff visible, announces the refresh and then shows exact figures.
  await page.route(api, async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Actualizando métricas…" })).toBeVisible();
  await expect(stages.getByText("Aún no hay prospectos activos")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  const exact = async () => {
    await expect(summary).toContainText(/Prospectos activos\s*3/); await expect(summary).toContainText(/Creados en el intervalo\s*4/); await expect(summary).toContainText(/Seguimientos vencidos\s*2/);
    await expect(stages).toContainText(/Nuevo\s*1 · 33%/); await expect(stages).toContainText(/Ganado\s*2 · 67%/); await expect(stages).toContainText(/Calificación\s*0 · 0%/);
    await expect(conversion.getByText("2 de 4 · 50 %", { exact: true })).toHaveCount(2);
    await expect(conversion).toContainText("Incluye prospectos archivados (1 en este intervalo)");
    await expect(followups).toContainText(/Vencidos\s*2 · 67%/); await expect(followups).toContainText(/Próximos\s*1 · 33%/);
    await expect(followups).toContainText("Pendientes en total: 3. En prospectos archivados, todavía abiertos: 1.");
  };
  await exact();
  const month = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "America/Lima" }).format(new Date());
  await expect(conversion.getByText(`Creados en ${month}`, { exact: true })).toBeVisible();
  // Earlier months of the interval have no created leads: «Sin datos», never 0 %.
  await expect(conversion.getByText("Sin datos", { exact: true }).first()).toBeVisible();
  await expect(conversion.getByText(/· 0 %/)).toHaveCount(0);

  // Interval change recalculates on the server; the state-at-cutoff cards do not depend on it.
  await page.getByLabel("Intervalo", { exact: true }).selectOption("30");
  await expect(page.getByText(/^Intervalo: últimos 30 días, del .+ al .+/)).toBeVisible(); await exact();
  await page.getByLabel("Intervalo", { exact: true }).selectOption("180");
  await expect(page.getByText(/^Intervalo: últimos 180 días, del .+ al .+/)).toBeVisible(); await exact();

  // Persistence across reload; the follow-ups link leads to the real list.
  await page.reload(); await exact();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // A failed refresh keeps the previous figures and says so; retry recovers.
  await page.route(api, route => route.abort());
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos actualizar las métricas" })).toBeVisible(); await exact();
  await page.unrouteAll({ behavior: "wait" }); await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos" })).toHaveCount(0); await exact();
  // A failed first load shows the error state with no figures, then recovers.
  await page.route(api, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "DEPENDENCY_UNAVAILABLE", message: "x" }) }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos cargar las métricas" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Resumen" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.unrouteAll({ behavior: "wait" }); await page.getByRole("button", { name: "Reintentar" }).click(); await exact();

  // Saving a cutoff: the server computes and stores it; the screen then shows exactly the stored figures.
  const saved = page.getByRole("region", { name: "Cortes guardados" }), snapshotApi = "**/api/organizations/*/dashboard/snapshots";
  await expect(saved.getByText("Aún no hay cortes guardados.")).toBeVisible();
  await page.getByRole("button", { name: "Guardar corte", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Corte guardado: .+ Las cifras mostradas son las guardadas\.$/ })).toBeVisible(); await exact();
  await expect(saved.getByRole("listitem")).toHaveCount(1);
  await expect(saved.getByRole("listitem")).toContainText(/Corte .+ · últimos 90 días · America\/Lima/);
  await expect(saved.getByRole("listitem")).toContainText("3 activos · conversión: 2 de 4 · 50 % · vencidos: 2 de 3 pendientes · guardado por Persona Dashboard");
  // A failed save stores nothing and says so; retrying reuses the same key, so exactly one new cutoff appears.
  let attempts = 0; const keys: string[] = [];
  await page.route(snapshotApi, async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().creationKey);
    if (++attempts === 1) { await route.fetch(); return route.abort(); } // the server stored it, but the response was lost
    return route.continue();
  });
  await page.getByRole("button", { name: "Guardar corte", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos guardar el corte" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos guardar el corte" })).toHaveCount(0);
  await expect(saved.getByRole("listitem")).toHaveCount(2);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  await page.unrouteAll({ behavior: "wait" });
  expect(((await (await page.request.get(`${base}/dashboard/snapshots`)).json()).snapshots as unknown[]).length).toBe(2);
  // Saved cutoffs survive a reload and later changes to the source data.
  await post(`/leads/${open.id}`, { version: 1, stageId: stage("Ganado") }, "patch");
  await page.reload(); await expect(saved.getByRole("listitem")).toHaveCount(2);
  await expect(saved.getByRole("listitem").first()).toContainText("conversión: 2 de 4 · 50 %");
  await expect(conversion.getByText("3 de 4 · 75 %", { exact: true })).toHaveCount(2);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await followups.getByText("Vencidos").waitFor(); await page.getByRole("link", { name: "Ver seguimientos" }).click(); await expect(page).toHaveURL(new RegExp(`/app/${org}/followups$`));

  // Another account cannot read this organization's dashboard, and its own starts empty.
  const other = await browser.newContext({ baseURL: origin }), stranger = await other.newPage();
  const ownOrg = await account(stranger, "other");
  expect((await stranger.request.get(`${base}/dashboard`)).status()).toBe(404);
  expect((await stranger.request.get(`${base}/dashboard/snapshots`)).status()).toBe(404);
  expect((await stranger.request.post(`${base}/dashboard/snapshots`, { headers, data: { interval: 30, creationKey: randomUUID() } })).status()).toBe(404);
  expect((await stranger.goto(`/app/${org}/dashboard`))!.status()).toBe(404);
  await stranger.goto(`/app/${ownOrg}/dashboard`);
  await expect(stranger.getByRole("region", { name: "Prospectos por etapa" }).getByText("Aún no hay prospectos activos")).toBeVisible();
  await other.close();
  const anonymous = await browser.newContext({ baseURL: origin });
  expect((await anonymous.request.get(`${base}/dashboard`)).status()).toBe(401);
  const guest = await anonymous.newPage(); await guest.goto(`/app/${org}/dashboard`); await expect(guest).toHaveURL(/\/login$/);
  await anonymous.close();
});

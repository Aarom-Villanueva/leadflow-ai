import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * State coordination of the real dashboard (docs/specs/LF-028.md, contrato v3).
 * Every response used here is the server's real response: requests are forwarded, and the test only decides
 * when (or whether) the browser receives it. What the screen claims is then compared with the rows and audit
 * entries actually stored, read straight from the laboratory database.
 */
const origin = "http://127.0.0.1:4313", headers = { origin };
type Kind = "metrics" | "list" | "save";
interface Served { status: number; body: any } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Hold { served: Promise<Served>; deliver: () => Promise<void>; lose: () => Promise<void> }
let admin: Pool;
let errors: string[];

test.beforeAll(() => {
  const url = process.env.ANALYTICS_TEST_ADMIN_URL;
  if (!url) throw Error("ANALYTICS_TEST_ADMIN_URL required: these tests verify persisted cutoffs and audit entries, never only the screen");
  admin = new Pool({ connectionString: url, max: 2 });
});
test.afterAll(async () => { await admin?.end(); });
test.beforeEach(({ page }) => { errors = []; page.on("pageerror", error => errors.push(error.message)); });
test.afterEach(() => { expect(errors).toEqual([]); });

/** Forwards dashboard traffic and lets a test hold one matching real response until it decides to deliver or drop it. */
class Traffic {
  readonly saves: { interval: number; creationKey: string }[] = [];
  private rules: { kind: Kind; interval?: string; take: (route: Route) => void }[] = [];
  constructor(private page: Page) {}
  async start() {
    await this.page.route(/\/api\/organizations\/[^/]+\/dashboard(\/snapshots)?(\?.*)?$/, route => {
      const request = route.request(), url = new URL(request.url());
      const kind: Kind = url.pathname.endsWith("/snapshots") ? (request.method() === "POST" ? "save" : "list") : "metrics";
      if (kind === "save") this.saves.push(request.postDataJSON());
      const index = this.rules.findIndex(rule => rule.kind === kind && (rule.interval === undefined || rule.interval === url.searchParams.get("interval")));
      if (index < 0) return route.continue();
      this.rules.splice(index, 1)[0].take(route);
    });
  }
  /** Holds the next matching request: `served` resolves once the server has really answered. */
  hold(kind: Kind, interval?: string): Hold {
    let decide!: (deliver: boolean) => void; const decision = new Promise<boolean>(resolve => { decide = resolve; });
    let done!: () => void; const finished = new Promise<void>(resolve => { done = resolve; });
    let resolveServed!: (value: Served) => void; const served = new Promise<Served>(resolve => { resolveServed = resolve; });
    this.rules.push({ kind, interval, take: async route => {
      try {
        const response = await route.fetch();
        resolveServed({ status: response.status(), body: await response.json().catch(() => null) });
        if (await decision) await route.fulfill({ response }); else await route.abort();
      } catch { /* The page already aborted this request: nothing to deliver. */ }
      done();
    } });
    return { served, deliver: async () => { decide(true); await finished; }, lose: async () => { decide(false); await finished; } };
  }
}

async function start(page: Page, options: { beforeOpen?: (traffic: Traffic) => void | Promise<void>; viewport?: { width: number; height: number } } = {}) {
  if (options.viewport) await page.setViewportSize(options.viewport);
  const suffix = randomUUID().slice(0, 8);
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data: { name: "Persona Estado", email: `state-${suffix}@dashboard-test.invalid`, password: "Synthetic-dashboard-password-028!" } })).status()).toBe(200);
  const created = await page.request.post("/api/organizations", { headers, data: { name: "Equipo Estado", slug: `state-${suffix}`, timezone: "America/Lima" } });
  expect(created.status()).toBe(201); const org = (await created.json()).id as string, base = `/api/organizations/${org}`;
  const meta = await (await page.request.get(base + "/pipeline")).json();
  const stage = (name: string) => meta.stages.find((value: { name: string }) => value.name === name).id as string;
  const lead = async (name: string) => expect((await page.request.post(base + "/leads", { headers, data: { name: "Prospecto estado", stageId: stage(name), email: null, phoneE164: null, source: null, assignedUserId: null } })).status()).toBe(201);
  await lead("Ganado"); await lead("Nuevo");
  const traffic = new Traffic(page); await traffic.start(); await options.beforeOpen?.(traffic);
  await page.goto(`/app/${org}/dashboard`);
  return { org, base, traffic, lead };
}
const ui = (page: Page) => ({
  summary: page.getByRole("group", { name: "Resumen" }),
  saved: page.getByRole("region", { name: "Cortes guardados" }),
  status: page.locator('p[role="status"][aria-live="polite"]'),
  cutoff: page.locator("[data-as-of]"),
  interval: page.getByLabel("Intervalo", { exact: true }),
  save: page.getByRole("button", { name: "Guardar corte", exact: true }),
  refresh: page.getByRole("button", { name: "Actualizar", exact: true }),
  retry: page.getByRole("button", { name: /^Reintentar guardado/ }),
  shown: (days: number) => page.getByText(new RegExp(`^Intervalo: últimos ${days} días, del `)),
});
/** Two animation frames after a response was handed to the page: any state update it could cause has been rendered. */
const settled = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const stored = async (org: string) => (await admin.query("select id,interval_days days,creation_key key,metrics from dashboard_snapshots where organization_id=$1 order by created_at,id", [org])).rows as { id: string; days: number; key: string; metrics: { asOf: string; conversion: { created: number; won: number } } }[];
const audits = async (org: string) => (await admin.query("select count(*)::int n from organization_audit where organization_id=$1 and action='dashboard.snapshot_saved'", [org])).rows[0].n as number;

test("regresión 1: un corte de 90 días confirmado tras cambiar a 30 no se atribuye a las cifras de 30 días", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  const post = traffic.hold("save"); await $.save.click();
  const answer = await post.served; expect(answer.status).toBe(201);
  const get30 = traffic.hold("metrics", "30"); await $.interval.selectOption("30"); await get30.served;
  await post.deliver(); await settled(page);
  await get30.deliver(); await expect($.shown(30)).toBeVisible(); await settled(page);
  // The reported defect: 30-day figures under a claim that they are the saved ones.
  await expect(page.getByText("Las cifras mostradas son las guardadas")).toHaveCount(0);
  await expect($.status).toContainText("últimos 90 días. Las cifras mostradas no son las de ese corte");
  await expect($.interval).toHaveValue("30"); await expect($.cutoff).toHaveAttribute("data-snapshot-id", "");
  await expect($.status).toHaveAttribute("data-saved-snapshot", answer.body.snapshot.id);
  await expect($.saved.getByRole("listitem")).toHaveCount(1); await expect($.saved.getByRole("listitem")).toContainText("últimos 90 días");
  const rows = await stored(org); expect(rows.map(row => [row.id, row.days])).toEqual([[answer.body.snapshot.id, 90]]); expect(await audits(org)).toBe(1);
});

test("guardar 90 y cambiar a 30 con el orden inverso (GET antes que POST) termina en el mismo estado", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  const post = traffic.hold("save"); await $.save.click(); const answer = await post.served;
  const get30 = traffic.hold("metrics", "30"); await $.interval.selectOption("30"); const figures = await get30.served;
  await get30.deliver(); await expect($.shown(30)).toBeVisible(); await expect($.status).toContainText("Guardando corte de los últimos 90 días");
  await post.deliver(); await expect($.status).toContainText("últimos 90 días. Las cifras mostradas no son las de ese corte");
  await expect($.shown(30)).toBeVisible(); await expect($.cutoff).toHaveAttribute("data-as-of", figures.body.asOf); await expect($.cutoff).toHaveAttribute("data-snapshot-id", "");
  expect((await stored(org)).map(row => [row.id, row.days])).toEqual([[answer.body.snapshot.id, 90]]);
});

test("regresión 2: una lista vacía pedida antes de guardar no borra el corte confirmado", async ({ page }) => {
  let list!: Hold;
  const { org } = await start(page, { beforeOpen: traffic => { list = traffic.hold("list"); } }), $ = ui(page);
  const stale = await list.served; expect(stale.body.snapshots).toEqual([]);
  await expect($.summary).toBeVisible(); await $.save.click();
  await expect($.status).toContainText("Las cifras mostradas son las guardadas"); await expect($.saved.getByRole("listitem")).toHaveCount(1);
  await list.deliver(); await settled(page);
  // The reported defect: the stale empty list replaced the confirmed cutoff.
  await expect($.saved.getByRole("listitem")).toHaveCount(1);
  await expect($.saved.getByText("Aún no hay cortes guardados.")).toHaveCount(0);
  const rows = await stored(org); expect(rows).toHaveLength(1);
  await expect($.saved.getByRole("listitem")).toHaveAttribute("data-snapshot-id", rows[0].id); await expect($.cutoff).toHaveAttribute("data-snapshot-id", rows[0].id);
});

test("regresión 3: una respuesta perdida es un resultado desconocido y se resuelve reintentando la misma clave, aunque cambie el intervalo", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  const post = traffic.hold("save"); await $.save.click();
  expect((await post.served).status).toBe(201); expect(await stored(org)).toHaveLength(1);
  await post.lose(); await expect($.retry).toBeVisible();
  // The reported defect: claiming nothing was saved while the cutoff exists.
  await expect(page.getByText("No se guardó ningún corte nuevo")).toHaveCount(0);
  await expect(page.getByText("No sabemos si el corte se guardó")).toBeVisible(); await expect(page.getByText("puede haberse guardado o no")).toBeVisible();
  await expect($.save).toBeDisabled(); await expect($.status).not.toContainText("Corte guardado");
  // Changing the interval must not turn the retry into a different request.
  await $.interval.selectOption("30"); await expect($.shown(30)).toBeVisible();
  await expect($.retry).toHaveAccessibleName("Reintentar guardado de los últimos 90 días"); await expect(page.getByText("el reintento sigue siendo el de 90 días")).toBeVisible();
  await expect($.save).toBeDisabled();
  await $.retry.click();
  await expect($.status).toContainText("últimos 90 días. Las cifras mostradas no son las de ese corte"); await expect(page.getByText("No sabemos si el corte se guardó")).toHaveCount(0);
  await expect($.save).toBeEnabled(); await expect($.shown(30)).toBeVisible();
  expect(traffic.saves).toHaveLength(2); expect(traffic.saves[1]).toEqual(traffic.saves[0]); expect(traffic.saves[0].interval).toBe(90);
  const rows = await stored(org); expect(rows.map(row => [row.days, row.key])).toEqual([[90, traffic.saves[0].creationKey]]); expect(await audits(org)).toBe(1);
  await expect($.saved.getByRole("listitem")).toHaveCount(1); await expect($.status).toHaveAttribute("data-saved-snapshot", rows[0].id);
});

test("un reintento que también se pierde conserva la identidad; al confirmarse con el mismo intervalo muestra las cifras guardadas", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  for (const attempt of [1, 2]) {
    const post = traffic.hold("save"); await (attempt === 1 ? $.save : $.retry).click();
    expect((await post.served).status).toBe(201); await post.lose();
    await expect(page.getByText("No sabemos si el corte se guardó")).toBeVisible(); await expect($.save).toBeDisabled();
  }
  await $.retry.click(); await expect($.status).toContainText("Las cifras mostradas son las guardadas");
  expect(new Set(traffic.saves.map(save => save.creationKey)).size).toBe(1); expect(traffic.saves).toHaveLength(3);
  const rows = await stored(org); expect(rows).toHaveLength(1); expect(await audits(org)).toBe(1);
  await expect($.cutoff).toHaveAttribute("data-snapshot-id", rows[0].id); await expect($.cutoff).toHaveAttribute("data-as-of", rows[0].metrics.asOf);
});

test("guardar frente a actualizar: en ambos órdenes de llegada la pantalla dice exactamente qué cifras muestra", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  // Refresh answered first, save second: the screen ends on the saved cutoff.
  let get = traffic.hold("metrics", "90"), post = traffic.hold("save");
  await $.refresh.click(); await $.save.click(); await get.served; const first = await post.served;
  await get.deliver(); await post.deliver();
  await expect($.status).toContainText("Las cifras mostradas son las guardadas");
  await expect($.cutoff).toHaveAttribute("data-snapshot-id", first.body.snapshot.id); await expect($.cutoff).toHaveAttribute("data-as-of", first.body.snapshot.metrics.asOf);
  // Save answered first, refresh second: the screen ends on live figures and says they are not the saved ones.
  get = traffic.hold("metrics", "90"); post = traffic.hold("save");
  await $.refresh.click(); await $.save.click(); const live = await get.served; const second = await post.served;
  await post.deliver(); await expect($.cutoff).toHaveAttribute("data-snapshot-id", second.body.snapshot.id);
  await get.deliver(); await expect($.cutoff).toHaveAttribute("data-snapshot-id", "");
  await expect($.cutoff).toHaveAttribute("data-as-of", live.body.asOf); await expect($.status).toContainText("Las cifras mostradas no son las de ese corte");
  await expect($.status).toHaveAttribute("data-saved-snapshot", second.body.snapshot.id);
  const rows = await stored(org); expect(rows.map(row => row.id)).toEqual([first.body.snapshot.id, second.body.snapshot.id]); expect(await audits(org)).toBe(2);
  await expect($.saved.getByRole("listitem")).toHaveCount(2);
});

test("cambios rápidos de intervalo: solo la última elección llega a la pantalla, sea cual sea el orden de las respuestas", async ({ page }) => {
  const { traffic } = await start(page), $ = ui(page);
  await expect($.shown(90)).toBeVisible();
  const holds = { "180": traffic.hold("metrics", "180"), "90": traffic.hold("metrics", "90"), "30": traffic.hold("metrics", "30") };
  await $.interval.selectOption("180"); await $.interval.selectOption("90"); await $.interval.selectOption("30");
  const latest = await holds["30"].served;
  await holds["30"].deliver(); await expect($.shown(30)).toBeVisible();
  await holds["90"].deliver(); await holds["180"].deliver(); await settled(page);
  await expect($.shown(30)).toBeVisible(); await expect($.interval).toHaveValue("30");
  await expect($.cutoff).toHaveAttribute("data-as-of", latest.body.asOf); await expect($.summary).toContainText("Últimos 30 días, archivados incluidos");
  await expect(page.getByText("No pudimos actualizar las métricas")).toHaveCount(0); await expect($.refresh).toBeEnabled();
});

test("doble clic y doble Enter envían un solo guardado cada uno", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  let post = traffic.hold("save"); await $.save.dblclick(); await post.served;
  await expect($.save).toBeDisabled(); expect(traffic.saves).toHaveLength(1);
  await post.deliver(); await expect($.status).toContainText("Las cifras mostradas son las guardadas");
  post = traffic.hold("save"); await $.save.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await post.served;
  expect(traffic.saves).toHaveLength(2); await post.deliver(); await expect($.saved.getByRole("listitem")).toHaveCount(2);
  expect(new Set(traffic.saves.map(save => save.creationKey)).size).toBe(2);
  expect(await stored(org)).toHaveLength(2); expect(await audits(org)).toBe(2);
});

test("un fallo de la lista no oculta las métricas ni un corte confirmado, y se puede reintentar", async ({ page }) => {
  let list!: Hold;
  const { org } = await start(page, { beforeOpen: traffic => { list = traffic.hold("list"); } }), $ = ui(page);
  await list.served; await list.lose();
  await expect($.saved.getByRole("alert")).toContainText("No pudimos cargar los cortes guardados"); await expect($.summary).toContainText(/Prospectos activos\s*2/);
  await expect($.saved.getByText("Aún no hay cortes guardados.")).toHaveCount(0);
  await $.save.click(); await expect($.status).toContainText("Las cifras mostradas son las guardadas");
  await expect($.saved.getByRole("listitem")).toHaveCount(1); await expect($.saved.getByRole("alert")).toContainText("solo se muestran los confirmados en esta sesión");
  await $.saved.getByRole("button", { name: "Reintentar lista" }).click();
  await expect($.saved.getByRole("alert")).toHaveCount(0); await expect($.saved.getByRole("listitem")).toHaveCount(1);
  await expect($.saved.getByRole("listitem")).toHaveAttribute("data-snapshot-id", (await stored(org))[0].id);
});

test("un rechazo real del servidor (límite de intentos) es un fallo confirmado: no se guarda nada y se puede volver a guardar", async ({ page }) => {
  const { org, base } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  // Exhaust the real shared counter with rejected requests; repeat if the one-minute window rolls over in between.
  let refused = false;
  for (let round = 0; round < 3 && !refused; round++) {
    for (let index = 0; index < 125; index++) if ((await page.request.post(base + "/dashboard/snapshots", { headers, data: {} })).status() === 429) break;
    await $.save.click();
    refused = await Promise.race([page.getByText("El servidor rechazó el guardado").waitFor().then(() => true), $.status.filter({ hasText: "Corte guardado" }).waitFor().then(() => false)]);
  }
  expect(refused).toBe(true);
  await expect(page.getByText("Hay demasiados cambios seguidos; espera un minuto y vuelve a guardar. No se guardó ningún corte nuevo.")).toBeVisible();
  await expect(page.getByText("No sabemos si el corte se guardó")).toHaveCount(0); await expect($.retry).toHaveCount(0); await expect($.save).toBeEnabled();
  const rows = await stored(org); expect(await audits(org)).toBe(rows.length);
  await expect($.saved.getByRole("listitem")).toHaveCount(rows.length); await expect($.summary).toContainText(/Prospectos activos\s*2/);
});

test("salir de la pantalla durante un guardado no produce errores y el corte queda guardado", async ({ page }) => {
  const { org, traffic } = await start(page), $ = ui(page);
  await expect($.summary).toBeVisible();
  const post = traffic.hold("save"), metricsHold = traffic.hold("metrics", "30");
  await $.save.click(); await post.served; await $.interval.selectOption("30");
  await page.getByRole("link", { name: "Ver pipeline completo →" }).click(); await expect(page).toHaveURL(new RegExp(`/app/${org}/pipeline$`));
  await post.deliver(); await metricsHold.deliver(); await settled(page);
  expect(await stored(org)).toHaveLength(1);
  await page.goBack(); await expect($.saved.getByRole("listitem")).toHaveCount(1); await expect($.status).toHaveText("");
});

test("teclado y móvil: guardar, resolver un resultado desconocido y comprobar tras recargar que el corte existe y no cambia", async ({ page }) => {
  const { org, traffic, lead } = await start(page, { viewport: { width: 390, height: 844 } }), $ = ui(page);
  await expect($.summary).toBeVisible();
  // Keyboard only, in document order: interval, refresh, save.
  await $.interval.focus(); await page.keyboard.press("Tab"); await expect($.refresh).toBeFocused(); await page.keyboard.press("Tab"); await expect($.save).toBeFocused();
  const post = traffic.hold("save"); await page.keyboard.press("Enter"); await post.served; await post.lose();
  await expect(page.getByText("No sabemos si el corte se guardó")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await $.retry.focus(); await page.keyboard.press("Enter");
  await expect($.status).toContainText("Las cifras mostradas son las guardadas");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const [row] = await stored(org); expect(await stored(org)).toHaveLength(1);
  const item = $.saved.getByRole("listitem"); await expect(item).toHaveAttribute("data-snapshot-id", row.id);
  await expect(item).toContainText(`conversión: ${row.metrics.conversion.won} de ${row.metrics.conversion.created}`); const text = await item.innerText();
  // New source data and a reload: live figures move, the stored cutoff and its row do not.
  await lead("Ganado"); await page.reload();
  await expect($.summary).toContainText(/Prospectos activos\s*3/); await expect($.status).toHaveText("");
  await expect($.saved.getByRole("listitem")).toHaveCount(1); await expect($.saved.getByRole("listitem")).toHaveAttribute("data-snapshot-id", row.id);
  expect(await $.saved.getByRole("listitem").innerText()).toBe(text);
  expect(await stored(org)).toEqual([row]); expect(await audits(org)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

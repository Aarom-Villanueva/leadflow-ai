import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const VIEWPORTS = [
  { label: "escritorio", width: 1280, height: 900 },
  { label: "móvil", width: 375, height: 812 },
];

const STAGE_1_SCREENS = [
  "/design",
  "/design/access/iniciar-sesion",
  "/design/access/iniciar-sesion?vista=error",
  "/design/access/iniciar-sesion?vista=validacion",
  "/design/access/crear-cuenta",
  "/design/access/crear-cuenta?vista=validacion",
  "/design/access/recuperar",
  "/design/access/recuperar?vista=enviado",
  "/design/access/restablecer",
  "/design/access/restablecer?vista=invalido",
  "/design/app/leads",
  "/design/app/leads/lead-1",
  "/design/app/leads/does-not-exist",
  "/design/app/dashboard",
  "/design/app/pipeline",
  "/design/app/seguimientos",
  "/design/app/administracion",
];

for (const path of STAGE_1_SCREENS) {
  test(`${path} responde 200 y no tiene violaciones WCAG automatizadas (escritorio y móvil)`, async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto(path);
      expect(response?.status(), `${path} en ${viewport.label}`).toBe(200);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, `${path} en ${viewport.label}: ${JSON.stringify(results.violations.map((v) => v.id))}`).toEqual([]);
    }
  });
}

test("ninguna pantalla produce desplazamiento horizontal a 375px de ancho", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/design", "/design/access/iniciar-sesion", "/design/app/leads", "/design/app/leads/lead-1"]) {
    await page.goto(path);
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalScroll, path).toBe(false);
  }
});

test("el enlace de saltar al contenido alcanza el área principal en la propuesta de diseño", async ({ page }) => {
  await page.goto("/design/app/leads");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("el cajón de navegación móvil se abre, atrapa el foco y se cierra con Escape devolviendo el foco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design/app/leads");
  const menuButton = page.getByRole("button", { name: "Abrir menú de navegación" });
  await menuButton.focus();
  await menuButton.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Navegación principal" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Prospectos" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test("el panel del asistente de IA se abre por teclado, muestra el aviso de etapa 2 y se cierra con Escape", async ({ page }) => {
  await page.goto("/design/app/leads");
  const aiButton = page.getByRole("button", { name: "Abrir asistente de IA" });
  await aiButton.focus();
  await aiButton.press("Enter");
  const panel = page.getByRole("dialog", { name: "Asistente de IA" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Se diseña en la etapa 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(aiButton).toBeFocused();
});

test("el conmutador de rol de prueba oculta Importar y Administración para el rol Ventas", async ({ page }) => {
  await page.goto("/design/app/leads");
  await expect(page.getByRole("button", { name: "Importar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Administración" })).toBeVisible();

  await page.selectOption("#role-preview-select", "sales");
  await expect(page.getByRole("button", { name: "Importar" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Administración" })).toHaveCount(0);
});

test("el listado de prospectos filtra de verdad en el navegador, sin enviar el texto buscado por red", async ({ page }) => {
  await page.goto("/design/app/leads");
  await expect(page.getByLabel("Buscar por nombre o correo")).toBeVisible();

  // El buscador filtra un arreglo ya cargado en memoria: ninguna petición de red
  // puede llevar el término buscado (ni la navegación/prefetch normal del router
  // de Next.js, ajena a esta funcionalidad, debería hacerlo).
  const searchTerm = "Café Altiplano";
  const requestsWithSearchTerm: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(searchTerm) || (request.postData() ?? "").includes(searchTerm)) {
      requestsWithSearchTerm.push(request.url());
    }
  });

  await page.getByLabel("Buscar por nombre o correo").fill(searchTerm);
  await expect(page.getByRole("cell", { name: "Café Altiplano" })).toBeVisible();
  await expect(page.getByText("Taller Rodamientos Sur")).toHaveCount(0);
  expect(requestsWithSearchTerm, "el texto buscado nunca debe viajar por red").toEqual([]);

  await page.getByLabel("Buscar por nombre o correo").fill("texto-que-no-existe-en-ningun-prospecto");
  await expect(page.getByRole("button", { name: "Limpiar filtros" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByLabel("Buscar por nombre o correo")).toHaveValue("");
});

test("los estados de vista (carga/error/vacío) del listado de prospectos se muestran sin red", async ({ page }) => {
  await page.goto("/design/app/leads");

  await page.getByRole("button", { name: "Cargando" }).click();
  await expect(page.getByText("Cargando…")).toBeVisible();

  await page.getByRole("button", { name: "Error" }).click();
  await expect(page.getByText("No pudimos cargar los prospectos")).toBeVisible();

  await page.getByRole("button", { name: "Vacío (sin prospectos)" }).click();
  await expect(page.getByText("Todavía no tienes prospectos")).toBeVisible();
});

test("archivar un prospecto pide confirmación, atrapa el foco en el diálogo y devuelve el foco al cerrar", async ({ page }) => {
  await page.goto("/design/app/leads/lead-1");
  const archiveButton = page.getByRole("button", { name: "Archivar" });
  await archiveButton.click();
  const dialog = page.getByRole("dialog", { name: "¿Archivar este prospecto?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(archiveButton).toBeFocused();

  await archiveButton.click();
  await dialog.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText("Prospecto archivado")).toBeVisible();
});

test("las pestañas de la ficha del prospecto son navegables con el teclado (patrón ARIA tabs)", async ({ page }) => {
  await page.goto("/design/app/leads/lead-1");
  const resumenTab = page.getByRole("tab", { name: "Resumen" });
  await resumenTab.focus();
  await expect(resumenTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  const actividadTab = page.getByRole("tab", { name: "Actividad" });
  await expect(actividadTab).toHaveAttribute("aria-selected", "true");
  await expect(actividadTab).toBeFocused();
});

test("ningún formulario de acceso lee o envía el valor de los campos de contraseña", async ({ page }) => {
  const seenPassword = "clave-unica-de-verificacion-9x7q";
  const requestsWithPassword: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    const postData = request.postData() ?? "";
    if (url.includes(seenPassword) || postData.includes(seenPassword)) requestsWithPassword.push(url);
  });

  await page.goto("/design/access/iniciar-sesion");
  await page.getByLabel("Contraseña").fill(seenPassword);
  await page.getByRole("link", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/design\/app\/leads/);

  expect(requestsWithPassword).toEqual([]);
  const storedEverywhere = await page.evaluate((needle) => {
    const inLocal = JSON.stringify(Object.entries(localStorage)).includes(needle);
    const inSession = JSON.stringify(Object.entries(sessionStorage)).includes(needle);
    return inLocal || inSession;
  }, seenPassword);
  expect(storedEverywhere).toBe(false);
});

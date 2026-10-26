/* Production export browser acceptance. Test data lives only in disposable SQLite and
 * explicit Playwright routes. Nothing here is imported by the frontend build.
 * PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE can point at already-installed tooling.
 */
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(__dirname, "../../..");
const artifacts =
  process.env.BROWSER_ARTIFACTS ||
  mkdtempSync(join(tmpdir(), "stargaze-browser-evidence-"));
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { buildApp } = await import(
    pathToFileURL(join(root, "apps/api/dist/app.js"))
  );
  const { loadConfig } = await import(
    pathToFileURL(join(root, "apps/api/dist/config.js"))
  );
  const dir = mkdtempSync(join(tmpdir(), "stargaze-browser-db-"));
  const server = await buildApp(
    loadConfig(
      {
        JWT_SECRET: "temporary-browser-test-secret-".repeat(3),
        GUIDE_BASE_URL: "http://127.0.0.1:9",
        CLEF_BASE_URL: "http://127.0.0.1:9",
        MODERATION_ENABLED: "false",
        DB_PATH: join(dir, "db.sqlite"),
        MEDIA_DIR: join(dir, "media"),
      },
      { dotenv: false },
    ),
    { logger: false },
  );
  const origin = await server.app.listen({ port: 0, host: "127.0.0.1" });
  server.ctx.config.appOrigins = [origin];
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {}),
  });
  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const newContext = async (options = {}) => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ...options,
    });
    ctx.on("page", (page) => {
      page.on("pageerror", (e) => pageErrors.push(e.message));
      page.on("console", (message) => {
        // Anonymous /me and explicit fault-injection cases intentionally return 401/503.
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text());
        if (message.type() === "warning") consoleWarnings.push(message.text());
      });
    });
    return ctx;
  };
  const screenshot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(artifacts, name) });
  };
  const noOverflow = async (page) => {
    const size = await page.evaluate(() => ({
      view: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(size.scroll <= size.view + 1, JSON.stringify(size));
  };
  try {
    // A genuine existing account and a real pending post, in disposable storage only.
    const signup = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: "browser@example.com",
        password: "browser-test-password",
        display_name: "Browser Observer",
      }),
    });
    assert.equal(signup.status, 201);
    const auth = await signup.json();
    const claim = await fetch(`${origin}/api/stars/32263/claim`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "idempotency-key": crypto.randomUUID(),
      },
    });
    assert.equal(claim.status, 201);
    const form = new FormData();
    form.set("hyg_id", "32263");
    form.set("note", "PRIVATE PENDING browser test note");
    const post = await fetch(`${origin}/api/tags`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "idempotency-key": crypto.randomUUID(),
      },
      body: form,
    });
    assert.equal(post.status, 201);
    const ctx = await newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__geoCalls = 0;
      navigator.geolocation.getCurrentPosition = (_success, error) => {
        window.__geoCalls++;
        setTimeout(() => error({ code: 1, message: "Test denial" }), 50);
      };
    });
    await page.route("**/catalog/hyg-*.json", async (route) => {
      await wait(350);
      await route.continue();
    });
    const start = Date.now();
    await page.goto(origin);
    await page.getByText("Opening your sky", { exact: true }).waitFor();
    await page.locator(".sky-loading").waitFor({ state: "detached" });
    const readyMs = Date.now() - start;
    assert.equal(await page.title(), "StarTagger");
    assert.equal(await page.locator("h1").innerText(), "Live sky");
    await page
      .getByText("Location unavailable or denied. Using Starbase.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.evaluate(() => window.__geoCalls), 1);
    check(
      "loading feedback, real catalog, nonblocking location denial and Starbase fallback",
    );
    const timeBefore = await page.locator(".sky-heading time").innerText();
    await page.waitForFunction(
      (old) => document.querySelector(".sky-heading time").textContent !== old,
      timeBefore,
    );
    check("live time advances without preview mode");
    await page
      .getByRole("button", { name: "Starbase, Texas", exact: true })
      .click();
    await page.getByRole("button", { name: /Greenwich, London/ }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Greenwich, London", exact: true })
      .waitFor();
    // Use a real current-night coordinate if Greenwich is in daylight at test time.
    if (!(await page.locator(".visible-stars li").count())) {
      await page
        .getByRole("button", { name: "Greenwich, London", exact: true })
        .click();
      const d = new Date();
      const lon =
        ((180 - (d.getUTCHours() + d.getUTCMinutes() / 60) * 15 + 540) % 360) -
        180;
      await page.getByLabel("Latitude (north + / south −)").fill("0");
      await page.getByLabel("Longitude (east + / west −)").fill(String(lon));
      await page
        .getByRole("button", { name: "Use coordinates", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await page.locator(".visible-stars li").first().waitFor();
    await screenshot(page, "sky-desktop.png");
    const viewfinder = page.getByTestId("globe-viewfinder"),
      rectangleBefore = await viewfinder.innerHTML(),
      readout = page.locator(".camera-readout");
    const before = await readout.innerText();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.notEqual(before, await readout.innerText());
    assert.notEqual(rectangleBefore, await viewfinder.innerHTML());
    const angle = await viewfinder.getAttribute("transform");
    await page.getByRole("button", { name: "Turn 90°", exact: true }).click();
    assert.notEqual(angle, await viewfinder.getAttribute("transform"));
    check("presets, rectangular globe heading and FOV indicator");
    const canvas = page.getByTestId("sky-canvas");
    const box = await canvas.boundingBox();
    const dragBefore = await readout.innerText();
    await page.mouse.move(box.x + 600, box.y + 350);
    await page.mouse.down();
    await page.mouse.move(box.x + 730, box.y + 410, { steps: 10 });
    await page.mouse.up();
    assert.notEqual(dragBefore, await readout.innerText());
    const wheelBefore = await readout.innerText();
    await page.mouse.wheel(0, 150);
    await page.waitForFunction(
      (old) => document.querySelector(".camera-readout").innerText !== old,
      wheelBefore,
    );
    check("drag and wheel zoom alter the real sky camera");
    await canvas.focus();
    const keyboardBefore = await readout.innerText();
    await page.keyboard.press("ArrowRight");
    assert.notEqual(keyboardBefore, await readout.innerText());
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: "Open star page", exact: true })
      .waitFor();
    await page
      .locator(".star-popover .ownership")
      .filter({ hasText: /Unclaimed|Claimed by/ })
      .waitFor();
    await screenshot(page, "preview-desktop.png");
    await page.keyboard.press("Escape");
    await page.locator(".star-popover").waitFor({ state: "hidden" });
    assert.equal(
      await canvas.evaluate((e) => e === document.activeElement),
      true,
    );
    check(
      "keyboard camera, star selection, confirmed preview, Escape and focus return",
    );
    const hoverPoint = await page.locator(".preview-anchor").boundingBox();
    await page.mouse.move(box.x + 8, box.y + box.height - 8);
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    await page
      .getByRole("link", { name: "Open star page", exact: true })
      .waitFor();
    assert.equal(
      await canvas.evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("ArrowLeft");
    await page.locator(".star-popover").waitFor({ state: "hidden" });
    check(
      "hover previews preserve keyboard focus and close when the camera moves",
    );
    const visibleButton = page.locator(".visible-stars button").first();
    await visibleButton.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: "Open star page", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".star-popover").waitFor({ state: "hidden" });
    check("accessible in-view star buttons open a working preview after camera movement");
    await page.goto(`${origin}/star/32263`);
    await page
      .getByText("Claimed by Browser Observer", { exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/star");
    await page.reload();
    await page.getByText("8.6 light years", { exact: true }).waitFor();
    await page.getByText("No approved posts yet.", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByText("PRIVATE PENDING browser test note", { exact: true })
        .count(),
      0,
    );
    check(
      "one static star shell, clean alias, refresh, real owner with no public posts, pending content hidden",
    );
    await page.getByRole("link", { name: "Log in", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill("browser@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page
      .getByText("Email or password is incorrect.", { exact: true })
      .waitFor();
    await page
      .getByLabel("Password", { exact: true })
      .fill("browser-test-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).waitFor();
    assert.equal(new URL(page.url()).search, "?hyg_id=32263");
    const cookie = (await ctx.cookies()).find((c) => c.name === "st_session");
    assert.ok(cookie?.httpOnly);
    assert.equal(
      await page.evaluate(() =>
        Object.keys(localStorage).some((k) => /token|session/i.test(k)),
      ),
      false,
    );
    assert.equal(
      await page
        .getByText("PRIVATE PENDING browser test note", { exact: true })
        .count(),
      0,
    );
    await screenshot(page, "star-desktop.png");
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "unavailable",
            message: "Logout unavailable in test.",
          },
        }),
      }),
    );
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.getByText("Logout unavailable in test.").waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "Log out", exact: true })
        .isVisible(),
    );
    await page.unroute("**/api/auth/logout");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.getByRole("link", { name: "Log in", exact: true }).waitFor();
    assert.equal(
      (await ctx.cookies()).some((c) => c.name === "st_session"),
      false,
    );
    check(
      "real existing-account login, invalid credentials, return URL, HttpOnly cookie, honest logout failure and successful logout",
    );
    await page.goto(`${origin}/star?hyg_id=30365`);
    await page.getByText("Unclaimed", { exact: true }).waitFor();
    await page.route("**/api/public/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unavailable", message: "API unavailable in test." },
        }),
      }),
    );
    await page
      .locator(".ownership")
      .filter({ hasText: /^Unknown$/ })
      .waitFor({ timeout: 12000 });
    assert.equal(await page.getByText("Unclaimed", { exact: true }).count(), 0);
    await page.getByRole("heading", { name: "Star facts" }).waitFor();
    await screenshot(page, "api-failure.png");
    await page.unroute("**/api/public/**");
    await page
      .getByRole("button", { name: "Retry community", exact: true })
      .click();
    await page.getByText("Unclaimed", { exact: true }).waitFor();
    check(
      "confirmed unclaimed becomes unknown on API failure; catalog facts survive and retry recovers",
    );
    const raw = JSON.parse(
      readFileSync(join(root, "catalog/stars.json"), "utf8"),
    );
    const unknown = raw.find((s) => s.dist_ly === null);
    await page.goto(`${origin}/star?hyg_id=${unknown.hyg_id}`);
    await page
      .locator(".facts-list > div")
      .filter({ has: page.getByText("Distance", { exact: true }) })
      .getByText("Unknown", { exact: true })
      .waitFor();
    check("null distance remains unknown, not zero");
    await page.getByRole("link", { name: "Catalog", exact: true }).click();
    await page.getByRole("heading", { name: "Star catalog" }).waitFor();
    await page.getByLabel("Search stars", { exact: true }).fill("hyg 30365");
    await page
      .getByRole("button", { name: /Canopus/ })
      .first()
      .waitFor();
    await page.getByRole("button", { name: "Save Canopus" }).click();
    await page.getByRole("tab", { name: "Saved", exact: true }).click();
    await page
      .getByRole("button", { name: /Canopus/ })
      .first()
      .waitFor();
    await page.reload();
    await page.getByRole("tab", { name: "Saved", exact: true }).click();
    await page
      .getByRole("button", { name: /Canopus/ })
      .first()
      .waitFor();
    await screenshot(page, "catalog-desktop.png");
    check(
      "full accessible catalog, HYG search and saved-star persistence after refresh",
    );
    await page.getByRole("link", { name: "Credits", exact: true }).click();
    await page
      .getByRole("heading", { name: "Credits & about", exact: true })
      .waitFor();
    await page.reload();
    await page.getByText("Natural Earth", { exact: true }).waitFor();
    check("credits are reachable and refreshable");
    await page.goto(origin);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Skip to content",
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Catalog",
    );
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Star catalog" }).waitFor();
    check(
      "visible skip link and sequential Tab/Enter navigation reach the catalog",
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin);
      await page.locator(".sky-loading").waitFor({ state: "detached" });
      await noOverflow(page);
      await screenshot(page, `sky-${width}.png`);
      await page.goto(`${origin}/star?hyg_id=32263`);
      await page
        .getByRole("heading", { name: "Sirius", exact: true })
        .waitFor();
      await page.locator(".facts-list").waitFor();
      await noOverflow(page);
      await screenshot(page, `star-${width}.png`);
      await page.goto(`${origin}/catalog`);
      await page.getByLabel("Search stars", { exact: true }).fill("Canopus");
      await page
        .getByRole("button", { name: /Canopus/ })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
      await page
        .getByRole("link", { name: "Open public star page", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await noOverflow(page);
    }
    check("390px and 320px layouts, catalog sheet and keyboard dismissal");
    await ctx.close();

    const gpsCtx = await newContext();
    const gps = await gpsCtx.newPage();
    await gps.addInitScript(() => {
      window.__geoCalls = 0;
      navigator.geolocation.getCurrentPosition = (success) => {
        window.__geoCalls++;
        window.__gpsSuccess = success;
      };
    });
    await gps.goto(origin);
    await gps.locator(".sky-loading").waitFor({ state: "detached" });
    await gps
      .getByRole("button", { name: "Starbase, Texas", exact: true })
      .click();
    await gps.getByRole("button", { name: /Greenwich, London/ }).click();
    await gps.getByRole("dialog").waitFor({ state: "hidden" });
    await gps.evaluate(() =>
      window.__gpsSuccess({ coords: { latitude: 0, longitude: 0 } }),
    );
    await gps
      .getByRole("button", { name: "Greenwich, London", exact: true })
      .waitFor();
    await gps.getByRole("link", { name: "Credits", exact: true }).click();
    await gps.getByRole("heading", { name: "Credits & about" }).waitFor();
    await gps.getByRole("link", { name: "Sky", exact: true }).click();
    await gps
      .getByRole("button", { name: "Greenwich, London", exact: true })
      .waitFor();
    assert.equal(await gps.evaluate(() => window.__geoCalls), 1);
    check(
      "manual viewpoint wins over late GPS; only one initial location request across navigation",
    );
    await gpsCtx.close();

    const timeoutCtx = await newContext();
    const timeout = await timeoutCtx.newPage();
    await timeout.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_success, error, options) => {
        window.__gpsTimeout = options.timeout;
        setTimeout(() => error({ code: 3, message: "Test timeout" }), 100);
      };
    });
    await timeout.goto(origin);
    await timeout
      .getByText("Location unavailable or denied. Using Starbase.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await timeout.evaluate(() => window.__gpsTimeout), 3000);
    await timeout.locator(".sky-loading").waitFor({ state: "detached" });
    check("geolocation timeout keeps the rendered Starbase sky usable");
    await timeoutCtx.close();

    const touchCtx = await newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const touch = await touchCtx.newPage();
    await touch.goto(`${origin}/?star=101767`);
    await touch.locator(".sky-loading").waitFor({ state: "detached" });
    await touch
      .getByRole("button", { name: "Starbase, Texas", exact: true })
      .click();
    await touch.getByRole("button", { name: /Greenwich, London/ }).click();
    await touch.getByRole("dialog").waitFor({ state: "hidden" });
    await touch.getByRole("button", { name: "Dismiss sky notice" }).click();
    const cb = await touch.getByTestId("sky-canvas").boundingBox();
    const cdp = await touchCtx.newCDPSession(touch);
    const zoomBefore = await touch.locator(".camera-readout").innerText();
    const cy = cb.y + cb.height / 2,
      cx = cb.x + cb.width / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: cx - 35, y: cy, id: 0 },
        { x: cx + 35, y: cy, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: cx - 65, y: cy, id: 0 },
        { x: cx + 65, y: cy, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.notEqual(
      zoomBefore,
      await touch.locator(".camera-readout").innerText(),
    );
    check("two-finger pinch zoom");
    await touch.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await touch
      .getByRole("link", { name: "Open star page", exact: true })
      .waitFor();
    await touch.getByRole("heading", { name: "Deneb", exact: true }).waitFor();
    await noOverflow(touch);
    await screenshot(touch, "touch-preview.png");
    await touch
      .getByRole("link", { name: "Open star page", exact: true })
      .click();
    await touch.getByRole("heading", { name: "Deneb", exact: true }).waitFor();
    check(
      "DPR 2 touch picking agrees with centered star, tap preview and direct detail link; reduced motion",
    );
    await touchCtx.close();

    // Explicit fixture-only approved-media checks, separate from the real API checks above.
    const fixtureCtx = await newContext();
    const fp = await fixtureCtx.newPage();
    const fixture = JSON.parse(
      readFileSync(
        join(root, "packages/shared/fixtures/public-star.200.json"),
        "utf8",
      ),
    );
    await fp.route("**/api/public/stars/32263", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      }),
    );
    await fp.route("**/api/public/media/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await fp.goto(`${origin}/star?hyg_id=32263`);
    await fp
      .getByText("First light from the backyard", { exact: true })
      .waitFor();
    await fp.getByText("Beautiful shot!", { exact: true }).waitFor();
    const image = fp.locator(".image-trigger img");
    await image.evaluate((img) => img.decode());
    assert.ok(
      (
        await fp
          .getByRole("link", { name: /en.wikipedia.org/ })
          .getAttribute("rel")
      ).includes("noopener"),
    );
    await fp.getByRole("button", { name: "Open full-size photo" }).click();
    await fp.getByRole("heading", { name: "Star photo" }).waitFor();
    await fp.keyboard.press("Escape");
    await fp.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      "shared fixture: approved text, image, external link, reaction counts, comment and photo dialog",
    );
    fixture.star.catalog_version = "wrong-version";
    await fp.reload();
    await fp
      .locator(".ownership")
      .filter({ hasText: /^Unknown$/ })
      .waitFor();
    await fp.getByText(/Catalog versions differ/).waitFor();
    assert.equal(
      await fp
        .getByText("First light from the backyard", { exact: true })
        .count(),
      0,
    );
    check("catalog version mismatch prevents ownership/content join");
    fixture.star.catalog_version = "hyg-4.4-mag6.5-20261025";
    fixture.recent_tags[0].moderation_status = "pending";
    await fp.reload();
    await fp.getByText(/Public content could not be verified/).waitFor();
    assert.equal(
      await fp
        .getByText("First light from the backyard", { exact: true })
        .count(),
      0,
    );
    check("malformed public visibility response fails closed");
    await fixtureCtx.close();

    const failureCtx = await newContext();
    const failure = await failureCtx.newPage();
    await failure.route("**/catalog/hyg-*.json", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await failure.goto(origin);
    await failure
      .getByText("The stars couldn’t load.", { exact: true })
      .waitFor();
    await failure.unroute("**/catalog/hyg-*.json");
    await failure
      .getByRole("button", { name: "Retry catalog", exact: true })
      .click();
    await failure.locator(".sky-loading").waitFor({ state: "detached" });
    check(
      "catalog failure exits loading, with working resource-specific retry",
    );
    await failureCtx.close();
    const canvasCtx = await newContext();
    const cp = await canvasCtx.newPage();
    await cp.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await cp.goto(origin);
    await cp.getByText(/This browser cannot draw the sky/).waitFor();
    assert.ok(
      await cp
        .getByRole("link", { name: "Open catalog", exact: true })
        .isVisible(),
    );
    check(
      "canvas unavailable has a usable catalog fallback, no endless loader",
    );
    await canvasCtx.close();
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(consoleWarnings, []);
    check("no uncaught application errors, unexpected console errors/warnings or framework overlay");
    console.log(
      JSON.stringify(
        {
          checks: checks.length,
          readyMs,
          artifacts,
          origin,
          mode: "Real production API with disposable DB; approved-content cases explicitly intercepted shared fixtures",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

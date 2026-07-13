import { expect, test } from "@playwright/test";

const pages = [
  {
    path: "/index.html",
    title: "Dashboard",
    ready: "#food-cta",
    checks: [
      "#freshness-bar .section-panel",
      "text=Each source is tracked independently.",
      "#food-cta",
      "#session-shell",
      "#status-banner",
      "#import-status",
      "#open-deploy-log",
    ],
  },
  {
    path: "/food.html",
    title: "Food",
    ready: "#food-shell",
    checks: [
      "#food-shell",
      "#food-live-shell",
      "#food-live-meta",
      "#food-status",
      "#food-day-count",
      "#food-list",
    ],
  },
  {
    path: "/strength.html",
    title: "Strength",
    ready: "#strength-grid",
    checks: ["#strength-summary", "#strength-controls", "#strength-grid"],
  },
  {
    path: "/speed.html",
    title: "Speed",
    ready: "#speed-table",
    checks: ["#speed-summary", "#speed-table", 'a[href="./food.html"]'],
  },
  {
    path: "/progress.html",
    title: "Progress",
    ready: "#progress-grid",
    checks: [
      "#progress-summary",
      "#progress-trend",
      "#progress-grid",
      'a[href="./food.html"]',
    ],
  },
];

for (const pageSpec of pages) {
  test(`${pageSpec.title} page loads without console errors`, async ({
    page,
  }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.goto(pageSpec.path);
    await expect(
      page.getByRole("heading", { level: 1, name: pageSpec.title }),
    ).toBeVisible();
    await expect(page.locator(pageSpec.ready)).toBeVisible();

    if (pageSpec.path === "/index.html") {
      await page.locator("details.nav-menu").evaluate((menu) => {
        menu.open = true;
      });
      await page.waitForLoadState("networkidle");
    }

    for (const selector of pageSpec.checks) {
      await expect(page.locator(selector)).toBeVisible();
    }

    if (pageSpec.loadedText) {
      await expect(page.locator("#status-banner")).toContainText(
        pageSpec.loadedText,
      );
    }

    await page.waitForLoadState("networkidle");
    expect(
      consoleErrors,
      `${pageSpec.path} produced console errors:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);
  });
}

test("strength page renders at its short route", async ({ page }) => {
  await page.goto("/strength/");
  await expect(page).toHaveURL(/\/strength\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Strength" }),
  ).toBeVisible();

  await page.goto("/strength.html");
  await expect(page).toHaveURL(/\/strength\.html$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Strength" }),
  ).toBeVisible();

  await page.goto("/speed/");
  await expect(page).toHaveURL(/\/speed\.html$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Speed" }),
  ).toBeVisible();

  await page.goto("/food/");
  await expect(page).toHaveURL(/\/food\.html$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Food" }),
  ).toBeVisible();
});

test("favicon is served", async ({ request }) => {
  const response = await request.get("/favicon.png");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).length).toBeGreaterThan(0);
});

test("derived page states are published with the built artifacts", async ({
  request,
}) => {
  const snapshot = await (await request.get("/data/snapshot.json")).json();
  const strength = await (await request.get("/strength.json")).json();
  const speed = await (await request.get("/speed.json")).json();

  expect(snapshot.derived.page_states.food.kind).toMatch(/fresh|stale|missing/);
  expect(snapshot.derived.page_states.strength.kind).toMatch(/fresh|stale|missing/);
  expect(snapshot.derived.page_states.speed.kind).toMatch(/fresh|stale|missing/);
  expect(strength.page_state.kind).toBe(snapshot.derived.page_states.strength.kind);
  expect(speed.page_state.kind).toBe(snapshot.derived.page_states.speed.kind);
});

test("missing page states render explicit unavailable shells", async ({
  page,
}) => {
  const snapshotPayload = {
    snapshot_date: "2026-07-13",
    cronometer: { today: {} },
    recommendation: { Macros: {} },
    derived: {
      page_states: {
        food: {
          kind: "missing",
          label: "Cronometer unavailable",
          detail: "No Cronometer data is available yet.",
        },
      },
    },
  };
  const strengthPayload = {
    source: "Hevy",
    snapshot_date: "2026-07-13",
    entries: [],
    page_state: {
      kind: "missing",
      label: "Hevy unavailable",
      detail: "No strength data is available yet.",
    },
  };
  const speedPayload = {
    source: "Garmin",
    snapshot_date: "2026-07-13",
    entries: [],
    page_state: {
      kind: "missing",
      label: "Garmin unavailable",
      detail: "No speed data is available yet.",
    },
  };

  await page.route("**/data/snapshot.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(snapshotPayload),
    });
  });
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(strengthPayload),
    });
  });
  await page.route("**/speed.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(speedPayload),
    });
  });

  await page.goto("/food.html");
  await expect(page.getByRole("heading", { level: 1, name: "Food" })).toBeVisible();
  await expect(page.locator("#food-live-title")).toHaveText("Live data unavailable");
  await expect(page.locator("#food-live-help")).toContainText("No Cronometer data is available yet.");
  await expect(page.locator("#food-live-status")).toHaveText("Unavailable");
  await expect(page.locator("#food-live-meta")).toHaveText("No imported Cronometer day is available.");

  await page.goto("/strength.html");
  await expect(page.getByRole("heading", { level: 1, name: "Strength" })).toBeVisible();
  await expect(page.locator("#source-label")).toHaveText("Unavailable");
  await expect(page.locator("#status-banner")).toContainText("No strength data is available yet.");
  await expect(page.locator("#strength-grid")).toContainText("Failed to load data");

  await page.goto("/speed.html");
  await expect(page.getByRole("heading", { level: 1, name: "Speed" })).toBeVisible();
  await expect(page.locator("#source-label")).toHaveText("Unavailable");
  await expect(page.locator("#status-banner")).toContainText("No speed data is available yet.");
  await expect(page.locator("#speed-table")).toContainText("Failed to load speed data.");
});

test("manifest is served", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  const body = await response.text();
  expect(response.ok()).toBe(true);
  expect(body).toContain('"name": "Personal Trainer"');
  expect(body).toContain('"display": "standalone"');
});

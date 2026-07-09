import { expect, test } from "@playwright/test";

const pages = [
  {
    path: "/index.html",
    title: "Dashboard",
    ready: "#freshness-bar",
    loadedText: "loaded",
    checks: ["#food-shell", "#session-shell", "#sections"],
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
    checks: ["#speed-summary", "#speed-table"],
  },
  {
    path: "/progress.html",
    title: "Progress",
    ready: "#progress-grid",
    checks: ["#progress-summary", "#progress-trend", "#progress-grid"],
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

test("redirect shells forward to their canonical pages", async ({ page }) => {
  await page.goto("/strength/");
  await expect(page).toHaveURL(/\/strength\.html$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Strength" }),
  ).toBeVisible();

  await page.goto("/speed/");
  await expect(page).toHaveURL(/\/speed\.html$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Speed" }),
  ).toBeVisible();
});

test("favicon is served", async ({ request }) => {
  const response = await request.get("/favicon.svg");
  expect(response.ok()).toBe(true);
  await expect(response.text()).resolves.toContain("<svg");
});

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
    ready: "#history-panel",
    checks: [
      "#strength-analytics",
      "#strength-summary",
      "#strength-analytics-toggle",
      "#strength-tabs",
      "#strength-controls",
      'button[data-tab="history"]',
      'button[data-tab="heatmap"]',
      'button[data-tab="exercises"]',
      "#history-panel",
    ],
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
      await expect(page.locator("#refresh-hevy")).toBeVisible();
      await expect(page.locator("#set-hevy-key")).toBeVisible();
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

test("strength tabs switch between history and exercises", async ({ page }) => {
  await page.goto("/strength.html");
  await expect(page.locator('button[data-tab="history"]')).toBeVisible();
  await expect(page.locator('button[data-tab="exercises"]')).toBeVisible();
  await expect(page.locator("#strength-controls")).toBeVisible();

  await page.locator('button[data-tab="exercises"]').click();
  await expect(page.locator("#exercises-panel")).toBeVisible();
  await expect(page.locator("#strength-grid")).toBeVisible();
  await expect(page.locator("#strength-controls")).toBeVisible();

  await page.locator('button[data-tab="history"]').click();
  await expect(page.locator("#history-panel")).toBeVisible();
});

test("strength history renders nested workout contents", async ({ page }) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
            best_set: {
              weight_kg: 70,
              reps: 4,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: 79.3,
            workout_title: "Upper Body",
          },
        ],
        recent_workouts: [
          {
            title: "Upper Body",
            start_time: "2026-07-13T07:00:00Z",
            end_time: "2026-07-13T08:00:00Z",
            exercises: [
              {
                exercise_template_id: "79D0BB3A",
                name: "Bench Press (Barbell)",
                sets: [
                  { weight_kg: 70, reps: 4, rpe: 8 },
                  { weight_kg: 65, reps: 6 },
                ],
              },
            ],
          },
        ],
      }),
    });
  });

  await page.goto("/strength.html");
  await expect(page.locator("#history-panel")).toBeVisible();
  await expect(page.locator("#history-panel")).toContainText("Upper Body");
  await expect(page.locator("#history-panel")).toContainText(
    "Bench Press (Barbell)",
  );
  await expect(page.locator("#history-panel")).toContainText("70 kg");
  await expect(page.locator("#history-panel")).toContainText("4 reps");
  await expect(page.locator("#history-panel")).toContainText("RPE 8");
});

test("workout exercise opens detail modal from history", async ({ page }) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
            best_set: {
              weight_kg: 70,
              reps: 4,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: 79.3,
            workout_title: "Upper Body",
          },
        ],
        recent_workouts: [
          {
            title: "Upper Body",
            start_time: "2026-07-13T07:00:00Z",
            end_time: "2026-07-13T08:00:00Z",
            exercises: [
              {
                exercise_template_id: "79D0BB3A",
                name: "Bench Press (Barbell)",
                sets: [
                  { weight_kg: 70, reps: 4, rpe: 8 },
                  { weight_kg: 65, reps: 6 },
                ],
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route("**/history/exercises/79D0BB3A.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          date: "2026-07-13",
          weight_kg: 70,
          reps: 4,
          estimated_one_rm_kg: 79.3,
          workout_start_time: "2026-07-13T07:00:00Z",
          workout_title: "Upper Body",
        },
      ]),
    });
  });

  await page.goto("/strength.html");
  await page.locator('button[data-tab="history"]').click();
  await page.locator(".workout-exercise").click();

  const modal = page.locator(".modal-overlay");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Bench Press (Barbell)");
  await expect(modal).toContainText("Upper Body");
  await expect(modal).toContainText("Total reps");
  await expect(modal).toContainText("Best volume set");
  await expect(modal).toContainText("70 kg × 4");
  await expect(modal).toContainText("280 kg total");
});

test("strength page renders live progression state and goal controls", async ({
  page,
}) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
            best_set: {
              weight_kg: 100,
              reps: 5,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: 116.7,
            workout_title: "Upper Body",
          },
        ],
        recent_workouts: [],
      }),
    });
  });
  await page.route("**/history/exercises/_gains.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "79D0BB3A": {
          start: 95,
          current: 100,
          peak: 100,
          gain_pct: 5.3,
          stalled: false,
        },
      }),
    });
  });

  await page.goto("/strength.html");
  await expect(page.locator("#strength-controls")).toBeVisible();
  await expect(page.locator('button[data-goal="strength"]')).toBeVisible();
  await page.locator('button[data-tab="exercises"]').click();
  await expect(page.locator("#strength-grid")).toContainText(
    "Ready to progress",
  );
  await expect(page.locator("#strength-grid")).toContainText("Next 102.5 kg");

  await page.locator('button[data-goal="hypertrophy"]').click();
  await expect(page.locator('button[data-goal="hypertrophy"]')).toHaveClass(
    /is-active/,
  );
  await expect(page.locator("#strength-grid")).toContainText("Hypertrophy");
});

test("bodyweight exercises render a clean history modal", async ({ page }) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "29083183",
            name: "Chin Up",
            category: "Pull",
            best_set: {
              weight_kg: null,
              reps: 6,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: null,
            workout_title: "Upper Body",
          },
        ],
        recent_workouts: [
          {
            title: "Upper Body",
            start_time: "2026-07-13T07:00:00Z",
            end_time: "2026-07-13T08:00:00Z",
            exercises: [
              {
                exercise_template_id: "29083183",
                name: "Chin Up",
                sets: [{ weight_kg: null, reps: 6 }],
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route("**/history/exercises/29083183.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          date: "2026-07-13",
          weight_kg: null,
          reps: 6,
          estimated_one_rm_kg: null,
          workout_start_time: "2026-07-13T07:00:00Z",
          workout_title: "Upper Body",
        },
        {
          date: "2026-07-10",
          weight_kg: null,
          reps: 5,
          estimated_one_rm_kg: null,
          workout_start_time: "2026-07-10T07:00:00Z",
          workout_title: "Upper Body",
        },
      ]),
    });
  });

  await page.goto("/strength.html");
  await page.locator('button[data-tab="exercises"]').click();
  await page.locator(".exercise-card").click();

  const modal = page.locator(".modal-overlay");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Chin Up");
  await expect(modal).toContainText("No estimated 1RM trend yet");
  await expect(modal).toContainText("Best volume set");
  await expect(modal).toContainText("Bodyweight · 6 reps");
  await expect(modal).toContainText("6 reps total");
  await expect(modal).not.toContainText("undefined");
  await expect(modal).not.toContainText("Infinity");
});

test("strength heatmap aggregates volume across windows", async ({ page }) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
            best_set: {
              weight_kg: 70,
              reps: 4,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: 79.3,
            workout_title: "Upper Body",
          },
          {
            templateId: "29083183",
            name: "Chin Up",
            category: "Pull",
            best_set: {
              weight_kg: null,
              reps: 6,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: null,
            workout_title: "Upper Body",
          },
          {
            templateId: "D04AC939",
            name: "Squat (Barbell)",
            category: "Lower body",
            best_set: {
              weight_kg: 100,
              reps: 5,
              workout_start_date: "2026-07-01",
            },
            estimated_one_rm_kg: 116.7,
            workout_title: "Leg Day",
          },
        ],
        recent_workouts: [
          {
            title: "Upper Body",
            start_time: "2026-07-13T07:00:00Z",
            end_time: "2026-07-13T08:00:00Z",
            exercises: [
              {
                exercise_template_id: "79D0BB3A",
                name: "Bench Press (Barbell)",
                sets: [{ weight_kg: 70, reps: 4 }],
              },
              {
                exercise_template_id: "29083183",
                name: "Chin Up",
                sets: [{ weight_kg: null, reps: 6 }],
              },
              {
                exercise_template_id: "28BB4A95",
                name: "Triceps Dip",
                sets: [{ weight_kg: null, reps: 8 }],
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route("**/history/index.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        dates: [
          "2026-05-20",
          "2026-06-20",
          "2026-07-01",
          "2026-07-05",
          "2026-07-13",
        ],
      }),
    });
  });
  await page.route("**/history/2026-05-20.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-05-20",
        athlete: { body_weight_kg: 82.9 },
        hevy: {
          recent_workouts: [
            {
              title: "Full Body",
              start_time: "2026-05-20T07:00:00Z",
              end_time: "2026-05-20T08:00:00Z",
              exercises: [
                {
                  exercise_template_id: "A1B2C3D4",
                  name: "Deadlift",
                  sets: [{ weight_kg: 140, reps: 3 }],
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/history/2026-06-20.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-06-20",
        athlete: { body_weight_kg: 83.5 },
        hevy: {
          recent_workouts: [
            {
              title: "Pull Day",
              start_time: "2026-06-20T07:00:00Z",
              end_time: "2026-06-20T08:00:00Z",
              exercises: [
                {
                  exercise_template_id: "F1E57334",
                  name: "Dumbbell Row",
                  sets: [{ weight_kg: 32.5, reps: 10 }],
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/history/2026-07-01.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-07-01",
        athlete: { body_weight_kg: 83.2 },
        hevy: {
          recent_workouts: [
            {
              title: "Leg Day",
              start_time: "2026-07-01T07:00:00Z",
              end_time: "2026-07-01T08:00:00Z",
              exercises: [
                {
                  exercise_template_id: "D04AC939",
                  name: "Squat (Barbell)",
                  sets: [
                    { weight_kg: 100, reps: 5 },
                    { weight_kg: 102.5, reps: 4 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/history/2026-07-05.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-07-05",
        athlete: { body_weight_kg: 83.4 },
        hevy: {
          recent_workouts: [
            {
              title: "Upper Body",
              start_time: "2026-07-05T07:00:00Z",
              end_time: "2026-07-05T08:00:00Z",
              exercises: [
                {
                  exercise_template_id: "79D0BB3A",
                  name: "Bench Press (Barbell)",
                  sets: [{ weight_kg: 67.5, reps: 5 }],
                },
                {
                  exercise_template_id: "29083183",
                  name: "Chin Up",
                  sets: [{ weight_kg: null, reps: 5 }],
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/history/2026-07-13.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-07-13",
        athlete: { body_weight_kg: 83.5 },
        hevy: {
          recent_workouts: [
            {
              title: "Upper Body",
              start_time: "2026-07-13T07:00:00Z",
              end_time: "2026-07-13T08:00:00Z",
              exercises: [
                {
                  exercise_template_id: "79D0BB3A",
                  name: "Bench Press (Barbell)",
                  sets: [{ weight_kg: 70, reps: 4 }],
                },
                {
                  exercise_template_id: "29083183",
                  name: "Chin Up",
                  sets: [{ weight_kg: null, reps: 6 }],
                },
                {
                  exercise_template_id: "28BB4A95",
                  name: "Triceps Dip",
                  sets: [{ weight_kg: null, reps: 8 }],
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/history/exercises/_gains.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "79D0BB3A": {
          start: 65,
          current: 70,
          peak: 70,
          gain_pct: 7.7,
          stalled: false,
        },
        D04AC939: {
          start: 95,
          current: 100,
          peak: 100,
          gain_pct: 5.3,
          stalled: false,
        },
        "29083183": {
          start: null,
          current: null,
          peak: null,
          gain_pct: 0,
          stalled: false,
        },
      }),
    });
  });

  await page.goto("/strength.html");
  await expect(page.locator("#strength-analytics")).toBeVisible();
  await expect(page.locator("#strength-summary")).toBeVisible();
  await page.locator("#strength-analytics-toggle").click();
  await expect(page.locator("#strength-analytics")).toHaveClass(/is-collapsed/);
  await expect(page.locator("#strength-summary")).toBeHidden();
  await page.reload();
  await expect(page.locator("#strength-analytics")).toHaveClass(/is-collapsed/);
  await expect(page.locator("#strength-summary")).toBeHidden();
  await page.locator('button[data-tab="heatmap"]').click();
  await expect(page.locator("#heatmap-summary")).toContainText("30d");
  await expect(page.locator("#heatmap-summary")).toContainText("4 workouts");
  await expect(page.locator("#heatmap-legend")).toBeVisible();
  await expect(page.locator("#heatmap-legend")).toContainText("Hot");
  await expect(page.locator("#heatmap-figure svg")).toBeVisible();
  await expect(page.locator('[data-heatmap-region="back-lats"]')).toBeVisible();

  await page.locator('button[data-heatmap-window="7d"]').click();
  await expect(page.locator("#heatmap-summary")).toContainText("1 workout");

  await page.locator("#back-lat-left").click();
  await expect(page.locator("#heatmap-detail")).toContainText("Lats");
  await page.locator('button[data-heatmap-window="all"]').click();
  await expect(page.locator("#heatmap-summary")).toContainText("5 workouts");
  await expect(page.locator("#heatmap-detail")).toContainText("Activity");
  await page.locator('[data-heatmap-activity-toggle="true"]').click();
  await expect(page.locator("#heatmap-detail")).toContainText("2026-07-13");
  await expect(page.locator("#heatmap-detail")).toContainText("2026-07-05");
  await page.locator('[data-heatmap-session]').filter({ hasText: "2026-07-05" }).click();
  await expect(page.locator("#heatmap-detail")).toContainText("Bench Press (Barbell)");
  await expect(page.locator("#heatmap-detail")).toContainText("Chin Up");
  await expect(page.locator("#heatmap-detail")).not.toContainText("Triceps Dip");
  await expect(page.locator("#heatmap-detail")).not.toContainText("undefined");
  await page.locator('#heatmap-detail .workout-exercise', { hasText: 'Chin Up' }).click();
  await expect(page.locator(".modal-content")).toContainText("Chin Up");
  await expect(page.locator(".modal-content")).toContainText("Best volume set");

  await page.reload();
  await expect(page.locator('button[data-tab="heatmap"]')).toHaveClass(/is-active/);
  await expect(page.locator("#heatmap-detail")).toContainText("Lats");
  await expect(page.locator("#heatmap-detail")).toContainText("Activity");
});

test("strength heatmap shows a helpful hint when no load exists", async ({
  page,
}) => {
  await page.route("**/strength.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "Hevy exercise history",
        snapshot_date: "2026-07-13",
        page_state: {
          kind: "fresh",
          label: "Strength history ready",
          detail: "Hevy data is available and current.",
        },
        entries: [
          {
            templateId: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
            best_set: {
              weight_kg: 70,
              reps: 4,
              workout_start_date: "2026-07-13",
            },
            estimated_one_rm_kg: 79.3,
            workout_title: "Upper Body",
          },
        ],
        recent_workouts: [],
      }),
    });
  });
  await page.route("**/history/index.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        dates: ["2026-07-13"],
      }),
    });
  });
  await page.route("**/history/2026-07-13.json**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        snapshot_date: "2026-07-13",
        hevy: {
          recent_workouts: [],
        },
      }),
    });
  });

  await page.goto("/strength.html");
  await page.locator('button[data-tab="heatmap"]').click();
  await expect(page.locator("#heatmap-legend")).toBeVisible();
  await expect(page.locator("#heatmap-detail")).toContainText(
    "This window has no recorded load yet",
  );
  await expect(page.locator("#heatmap-detail")).toContainText("gray");
});

test("strength heatmap tab survives a refresh", async ({ page }) => {
  await page.goto("/strength.html");
  await page.locator('button[data-tab="heatmap"]').click();
  await expect(page.locator('button[data-tab="heatmap"]')).toHaveClass(/is-active/);
  await expect(page.locator("#heatmap-panel")).toBeVisible();

  await page.reload();

  await expect(page.locator('button[data-tab="heatmap"]')).toHaveClass(/is-active/);
  await expect(page.locator("#heatmap-panel")).toBeVisible();
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
  expect(snapshot.derived.page_states.strength.kind).toMatch(
    /fresh|stale|missing/,
  );
  expect(snapshot.derived.page_states.speed.kind).toMatch(
    /fresh|stale|missing/,
  );
  expect(strength.page_state.kind).toBe(
    snapshot.derived.page_states.strength.kind,
  );
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Food" }),
  ).toBeVisible();
  await expect(page.locator("#food-live-title")).toHaveText(
    "Live data unavailable",
  );
  await expect(page.locator("#food-live-help")).toContainText(
    "No Cronometer data is available yet.",
  );
  await expect(page.locator("#food-live-status")).toHaveText("Unavailable");
  await expect(page.locator("#food-live-meta")).toHaveText(
    "No imported Cronometer day is available.",
  );

  await page.goto("/strength.html");
  await expect(
    page.getByRole("heading", { level: 1, name: "Strength" }),
  ).toBeVisible();
  await expect(page.locator("#source-label")).toHaveText("Unavailable");
  await expect(page.locator("#status-banner")).toContainText(
    "No strength data is available yet.",
  );
  await expect(page.locator("#strength-grid")).toContainText(
    "Failed to load data",
  );

  await page.goto("/speed.html");
  await expect(
    page.getByRole("heading", { level: 1, name: "Speed" }),
  ).toBeVisible();
  await expect(page.locator("#source-label")).toHaveText("Unavailable");
  await expect(page.locator("#status-banner")).toContainText(
    "No speed data is available yet.",
  );
  await expect(page.locator("#speed-table")).toContainText(
    "Failed to load speed data.",
  );
});

test("manifest is served", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  const body = await response.text();
  expect(response.ok()).toBe(true);
  expect(body).toContain('"name": "Personal Trainer"');
  expect(body).toContain('"display": "standalone"');
});

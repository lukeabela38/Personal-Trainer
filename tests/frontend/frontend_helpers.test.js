import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeHtml as sharedEscapeHtml,
  formatDisplayValue,
  readNumber,
  readText,
  shouldRenderValue,
  summarizeBests,
} from "../../site/data-helpers.js";
import {
  defaultGoals,
  fmtNum,
  goalProgress,
  loadGoals,
  renderSparkline,
  saveGoals,
} from "../../site/goals.js";
import {
  extractBodyWeight,
  extractPriority,
  extractVo2,
  weeklySummary,
} from "../../site/history.js";
import {
  buildHevyStrengthView,
  formatHevyRefreshLabel,
  formatHevyWorkoutWindowLabel,
  mergeHevySnapshot,
  refreshHevyStrength,
  readStoredHevyApiKey,
  readStoredHevyLiveStrength,
  readStoredHevyWorkoutWindow,
  saveStoredHevyApiKey,
  saveStoredHevyWorkoutWindow,
} from "../../site/hevy-live.js";

function createElementStub() {
  const target = {
    classList: {
      add() {},
      remove() {},
      toggle() {
        return false;
      },
    },
    addEventListener() {},
    click() {},
    focus() {},
    removeAttribute() {},
    setAttribute() {},
    querySelectorAll() {
      return [];
    },
    appendChild() {},
    innerHTML: "",
    textContent: "",
    value: "",
    disabled: false,
    checked: false,
    hidden: false,
    dataset: {},
    style: {},
  };

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === "string") {
        throw new Error(`Unexpected element DOM access: ${prop}`);
      }
      return undefined;
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

function createDocumentStub() {
  const target = {
    getElementById: (id) => {
      if (!elementCache.has(id)) {
        elementCache.set(id, createElementStub());
      }
      return elementCache.get(id);
    },
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => createElementStub(),
  };

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === "string") {
        throw new Error(`Unexpected document DOM access: ${prop}`);
      }
      return undefined;
    },
  });
}

const elementCache = new Map();

globalThis.document = createDocumentStub();
globalThis.window = {
  addEventListener() {},
  open() {},
  location: {
    href: "http://127.0.0.1:4173/index.html",
  },
};
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => {
    if (String(url).includes("/history/exercises/index.json")) {
      return {
        exercises: [
          {
            exercise_template_id: "79D0BB3A",
            name: "Bench Press (Barbell)",
            category: "Push",
          },
          {
            exercise_template_id: "D04AC939",
            name: "Squat (Barbell)",
            category: "Lower body",
          },
        ],
      };
    }
    if (String(url).includes("api.hevyapp.com/v1/workouts")) {
      return {
        workouts: [
          {
            title: "Lower body day",
            start_time: "2026-07-13T07:00:00Z",
            exercises: [
              {
                exercise_template_id: "79D0BB3A",
                name: "Bench Press (Barbell)",
                sets: [
                  {
                    weight_kg: 70,
                    reps: 4,
                  },
                ],
              },
              {
                exercise_template_id: "D04AC939",
                name: "Squat (Barbell)",
                sets: [
                  {
                    weight_kg: 100,
                    reps: 8,
                  },
                ],
              },
            ],
          },
        ],
      };
    }
    return { entries: [], recommendation: {}, snapshot: {} };
  },
});

const speed = await import("../../site/speed.js");
const strength = await import("../../site/strength.js");
const app = await import("../../site/app.js");
const progress = await import("../../site/progress.js");
const {
  defaultFoodEntryTime,
  describeImportStatus,
  hasRenderableDashboardSnapshot,
  openDeploymentLogView,
  renderCheckInPanel,
  renderImportStatusBar,
} = app;
const { buildLiveHistorySummary, buildLiveRangeSummary } = progress;

test("shared data helpers format and read values", () => {
  assert.equal(sharedEscapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
  assert.equal(readNumber({ a: { b: "12.5" } }, ["a", "b"]), 12.5);
  assert.equal(readNumber({ a: { b: "NaN" } }, ["a", "b"]), null);
  assert.equal(readNumber({ a: { b: "" } }, ["a", "b"]), null);
  assert.equal(readNumber({ a: undefined }, ["a", "b"]), null);
  assert.equal(readNumber({}, ["missing", "path"]), null);
  assert.equal(readText({ a: { b: 7 } }, ["a", "b"]), "7");
  assert.equal(shouldRenderValue("hello"), true);
  assert.equal(shouldRenderValue(" "), false);
  assert.equal(
    formatDisplayValue("power_and_athleticism"),
    "Power And Athleticism",
  );
  assert.equal(formatDisplayValue("-"), "-");
  assert.equal(
    summarizeBests({
      hevy: { recent_bests: [1, 2] },
      garmin: { recent_bests: [1] },
    }),
    "2 strength / 1 running",
  );
});

test("goals helpers calculate targets and sparklines", () => {
  const goals = defaultGoals();
  assert.equal(goals.length, 5);
  assert.equal(fmtNum(3), "3");
  assert.equal(fmtNum(3.5), "3.5");
  assert.equal(
    goalProgress({ type: "strength", current: 50, target: 100 }),
    50,
  );
  assert.equal(
    goalProgress({ type: "speed", current: "20:00", target: "18:30" }),
    93,
  );
  assert.match(
    renderSparkline([1, 2, 3], 100, 40, { dots: true, labels: true }),
    /<svg/,
  );
});

test("goals loading falls back to defaults when storage is empty", () => {
  const original = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    assert.deepEqual(loadGoals(), defaultGoals());
  } finally {
    globalThis.localStorage = original;
  }
});

test("goals save and load round-trip through localStorage", () => {
  const original = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    const goals = defaultGoals().map((goal) =>
      goal.id === "bench" ? { ...goal, current: 95 } : goal,
    );
    saveGoals(goals);
    assert.deepEqual(loadGoals(), goals);
  } finally {
    globalThis.localStorage = original;
  }
});

test("hevy live refresh normalizes workouts and saves locally", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const store = new Map();
  let liveStrengthDuringFetch = "unset";
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.fetch = async (url, ...args) => {
    if (String(url).includes("api.hevyapp.com/v1/workouts")) {
      liveStrengthDuringFetch = readStoredHevyLiveStrength();
    }
    return originalFetch(url, ...args);
  };
  try {
    store.set(
      "personal-trainer:hevy-live-strength",
      JSON.stringify({ stale: true }),
    );
    saveStoredHevyApiKey("demo-key");
    assert.equal(readStoredHevyApiKey(), "demo-key");
    saveStoredHevyWorkoutWindow(45);
    assert.equal(readStoredHevyWorkoutWindow(), 45);
    assert.equal(formatHevyWorkoutWindowLabel(1), "1 workout");
    assert.equal(formatHevyWorkoutWindowLabel(45), "45 workouts");
    const payload = await refreshHevyStrength(undefined, { workoutWindow: 45 });
    assert.equal(payload.freshness, "fresh");
    assert.equal(payload.refresh_window, 45);
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.recent_bests.length, 2);
    assert.equal(readStoredHevyLiveStrength()?.entries.length, 2);
    assert.equal(liveStrengthDuringFetch, null);
    assert.match(formatHevyRefreshLabel(payload), /ago|just now/);
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
  }
});

test("hevy snapshot merges the live overlay into dashboard freshness", () => {
  const live = buildHevyStrengthView(
    [
      {
        title: "Lower body day",
        start_time: "2026-07-13T07:00:00Z",
        exercises: [
          {
            exercise_template_id: "79D0BB3A",
            name: "Bench Press (Barbell)",
            sets: [
              {
                weight_kg: 70,
                reps: 4,
              },
            ],
          },
        ],
      },
    ],
    new Map([
      [
        "79D0BB3A",
        {
          name: "Bench Press (Barbell)",
          category: "Push",
        },
      ],
    ]),
  );
  assert.equal(live.recent_workouts[0].exercise_count, 1);
  assert.equal(
    live.recent_workouts[0].exercises[0].name,
    "Bench Press (Barbell)",
  );
  assert.equal(live.recent_workouts[0].exercises[0].sets[0].weight_kg, 70);
  const merged = mergeHevySnapshot(
    {
      hevy: { freshness: "missing" },
      derived: { page_states: { strength: { kind: "missing" } } },
    },
    live,
  );
  assert.equal(merged.hevy.freshness, "fresh");
  assert.equal(merged.derived.page_states.strength.kind, "fresh");
});

test("check-in panel renders fixed questions and answer chips", () => {
  const html = renderCheckInPanel({
    snapshotDate: "2026-07-06",
    needsCheckIn: true,
    checkInQuestions: [
      {
        id: "recovery_status",
        prompt: "How recovered do you feel today?",
        options: ["good", "okay", "poor"],
      },
      {
        id: "pain_or_soreness",
        prompt: "Any pain or unusual soreness today?",
        options: ["no", "yes"],
      },
    ],
    responses: {
      recovery_status: "okay",
    },
  });

  assert.match(html, /How recovered do you feel today\?/);
  assert.match(html, /data-checkin-answer="poor"/);
  assert.match(html, /Selected: Okay/);
});

test("import status distinguishes successful and missing live data", () => {
  const liveStatus = describeImportStatus({
    source: "live",
    garmin: { freshness: "fresh", recent_runs: [{ distance_m: 1000 }] },
    hevy: {
      freshness: "fresh",
      recent_workouts: [{ workout_start_date: "2026-07-13" }],
    },
    cronometer: { freshness: "fresh", recent_days: [{ date: "2026-07-13" }] },
    manual_context: { freshness: "fresh", notes: [{ text: "ready" }] },
    derived: {
      page_states: {
        food: { kind: "fresh" },
        strength: { kind: "fresh" },
        speed: { kind: "fresh" },
      },
    },
  });
  assert.equal(liveStatus.kind, "fresh");
  assert.equal(liveStatus.label, "All data fresh");
  assert.match(
    renderImportStatusBar({
      source: "live",
      garmin: { freshness: "fresh", recent_runs: [{ distance_m: 1000 }] },
      hevy: {
        freshness: "fresh",
        recent_workouts: [{ workout_start_date: "2026-07-13" }],
      },
      cronometer: { freshness: "fresh", recent_days: [{ date: "2026-07-13" }] },
      manual_context: { freshness: "fresh", notes: [{ text: "ready" }] },
      derived: {
        page_states: {
          food: { kind: "fresh" },
          strength: { kind: "fresh" },
          speed: { kind: "fresh" },
        },
      },
    }),
    /import-status/,
  );

  const staleStatus = describeImportStatus({
    source: "example",
    garmin: { freshness: "fresh", recent_runs: [{ distance_m: 1000 }] },
    hevy: {
      freshness: "fresh",
      recent_workouts: [{ workout_start_date: "2026-07-10" }],
    },
    cronometer: { freshness: "fresh", recent_days: [{ date: "2026-07-13" }] },
    manual_context: { freshness: "fresh" },
    derived: {
      page_states: {
        food: { kind: "fresh" },
        strength: { kind: "stale" },
        speed: { kind: "fresh" },
      },
    },
  });
  assert.equal(staleStatus.kind, "stale");
  assert.equal(staleStatus.label, "Some sources stale or unavailable");

  const missingStatus = describeImportStatus({ source: "live" });
  assert.equal(missingStatus.kind, "missing");
  assert.equal(missingStatus.label, "No data available");
});

test("example snapshots with derived page states still render the dashboard", () => {
  assert.equal(
    hasRenderableDashboardSnapshot({
      source: "example",
      derived: {
        page_states: {
          food: { kind: "fresh" },
          strength: { kind: "fresh" },
          speed: { kind: "fresh" },
        },
      },
    }),
    true,
  );
  assert.equal(hasRenderableDashboardSnapshot({ source: "example" }), false);
});

test("deployment log link opens the published log artifact", () => {
  const calls = [];
  const originalOpen = globalThis.window.open;
  globalThis.window.open = (...args) => {
    calls.push(args);
  };
  try {
    openDeploymentLogView();
  } finally {
    globalThis.window.open = originalOpen;
  }

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0][0]), "http://127.0.0.1:4173/deploy-log.txt");
  assert.equal(calls[0][1], "_blank");
});

test("default food entry time formats a datetime-local value", () => {
  assert.match(
    defaultFoodEntryTime(new Date("2026-07-10T12:00:00Z")),
    /^2026-07-10T/,
  );
});

test("food page renders the live nutrition snapshot summary", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const snapshot = {
    snapshot_date: "2026-07-13",
    source: "live",
    cronometer: {
      today: {
        calories_consumed: 1640.92,
        calories_target: 1699,
        protein_g: 74.333712342918,
        carbs_g: 107.83969071214,
        fat_g: 54.351795898725996,
        remaining_kcal: 58.07999999999993,
        log_completeness: "complete",
      },
      recent_days: [{ date: "2026-07-13" }],
    },
    recommendation: {
      Macros: {
        calories: 2000,
        protein_g: 150,
        carbs_g: 250,
        fat_g: 60,
      },
    },
  };

  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ snapshot }),
  });

  try {
    await import(`../../site/food.js?test=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(
      elementCache.get("food-live-title").textContent,
      "Today's macros for 2026-07-13",
    );
    assert.equal(
      elementCache.get("food-live-meta").textContent,
      "Cronometer day 2026-07-13",
    );
    assert.match(
      elementCache.get("food-live-targets").innerHTML,
      /74 g logged/,
    );
    assert.match(
      elementCache.get("food-live-targets").innerHTML,
      /108 g logged/,
    );
    assert.match(
      elementCache.get("food-live-targets").innerHTML,
      /54 g logged/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});

test("history helpers summarize snapshots", () => {
  const snapshots = [
    {
      snapshot_date: "2026-07-01",
      athlete: { body_weight_kg: 84 },
      garmin: { current_vo2max: 50 },
      cronometer: { today: { calories_consumed: 2000, protein_g: 160 } },
      recommendation: { Priority: "aerobic_quality" },
    },
    {
      snapshot_date: "2026-07-02",
      athlete: { body_weight_kg: 83.5 },
      garmin: { current_vo2max: 51 },
      cronometer: { today: { calories_consumed: 2100, protein_g: 170 } },
      recommendation: { Priority: "recovery" },
    },
  ];
  assert.deepEqual(extractBodyWeight(snapshots), [
    { date: "2026-07-01", value: 84 },
    { date: "2026-07-02", value: 83.5 },
  ]);
  assert.deepEqual(extractVo2(snapshots), [
    { date: "2026-07-01", value: 50 },
    { date: "2026-07-02", value: 51 },
  ]);
  assert.deepEqual(extractPriority(snapshots), [
    { date: "2026-07-01", value: "aerobic_quality" },
    { date: "2026-07-02", value: "recovery" },
  ]);
  assert.equal(weeklySummary(snapshots)?.hardDays, 1);
  assert.equal(weeklySummary(snapshots)?.recoveryDays, 1);
  assert.equal(weeklySummary(snapshots)?.avgCalories, 2050);
  assert.equal(weeklySummary(snapshots)?.avgProtein, 165);
});

test("live progress summary prefers the current snapshot windows", () => {
  const summary = buildLiveHistorySummary({
    snapshot_date: "2026-07-10",
    hevy: { recent_workouts: [{}, {}, {}] },
    garmin: { recent_runs: [{}, {}] },
    cronometer: {
      recent_days: [
        { date: "2026-07-08", calories_consumed: 1900, protein_g: 160 },
        { date: "2026-07-09", calories_consumed: 2000, protein_g: 170 },
      ],
    },
  });

  assert.deepEqual(summary, {
    days: 2,
    latestDate: "2026-07-09",
    avgCalories: 1950,
    avgProtein: 165,
    vo2: null,
    vo2Trend: "unknown",
  });
});

test("live progress range summary stays on the live recent-day window", () => {
  const summary = buildLiveRangeSummary(
    {
      cronometer: {
        recent_days: [
          {
            date: "2026-07-07",
            calories_consumed: 1800,
            protein_g: 140,
            carbs_g: 220,
            fat_g: 50,
            remaining_kcal: 100,
          },
          {
            date: "2026-07-08",
            calories_consumed: 1900,
            protein_g: 150,
            carbs_g: 230,
            fat_g: 55,
            remaining_kcal: 50,
          },
          {
            date: "2026-07-09",
            calories_consumed: 2100,
            protein_g: 160,
            carbs_g: 240,
            fat_g: 60,
            remaining_kcal: -25,
          },
        ],
      },
      hevy: { recent_workouts: [{ startTimeLocal: "2026-07-08 19:00:00" }] },
      garmin: {
        recent_runs: [{ startTimeGMT: "2026-07-09 06:00:00", distance: 10000 }],
      },
    },
    "2026-07-07",
    "2026-07-09",
  );

  assert.deepEqual(summary, {
    from: "2026-07-07",
    to: "2026-07-09",
    days: 3,
    startDate: "2026-07-07",
    endDate: "2026-07-09",
    startCalories: 1800,
    endCalories: 2100,
    startProtein: 140,
    endProtein: 160,
    startCarbs: 220,
    endCarbs: 240,
    avgCarbs: 230,
    avgFat: 55,
    startRemaining: 100,
    endRemaining: -25,
    avgCalories: 1933,
    avgProtein: 150,
    vo2: null,
    vo2Trend: "unknown",
    latestDate: "2026-07-09",
  });
});

test("speed helpers normalize pace and distance records", () => {
  assert.equal(speed.formatSpeedValue("Fastest 5K", 1234), "20:34");
  assert.equal(speed.formatSpeedValue("Longest Run", 12345), "12.34 km");
  assert.equal(speed.formatDuration(3661), "1:01:01");
  assert.equal(speed.formatDistanceKm(12345), "12.34");
  assert.deepEqual(
    speed
      .sortEntries([
        { name: "Longest Run" },
        { name: "Fastest 10K" },
        { name: "Fastest 1K" },
      ])
      .map((entry) => entry.name),
    ["Fastest 1K", "Fastest 10K", "Longest Run"],
  );
});

test("speed helpers build personal best modal details", () => {
  const detail = speed.buildPersonalBestDetail({
    name: "Fastest 5K",
    value: 1251.10400390625,
    date: "2026-05-01",
    context: {
      raw_value: 1251.10400390625,
      source_run_date: "2026-05-01",
      source_run_duration: "20:51",
      source_run_pace: "4:10 /km",
      source_run_avg_heart_rate_bpm: 164,
      source_run_name: "Track Session",
      source_run_activity_type: "track_running",
      source_run_activity_id: 123,
    },
  });

  assert.equal(detail.kicker, "Personal best");
  assert.equal(detail.title, "Fastest 5K");
  assert.equal(detail.heroValue, "20:51");
  assert.equal(detail.heroMeta, "2026-05-01");
  assert.ok(detail.items.some((item) => item.includes("Duration")));
  assert.ok(detail.items.some((item) => item.includes("Pace")));
  assert.ok(detail.items.some((item) => item.includes("Avg heart rate")));
  assert.ok(!detail.items.some((item) => item.includes("Activity type")));
  assert.ok(!detail.items.some((item) => item.includes("Activity ID")));
  assert.ok(!detail.items.some((item) => item.includes("Raw value")));
});

test("speed helpers filter recent runs by date range", () => {
  const filtered = speed.filterRecentRunsByDateRange(
    [
      { date: "2026-07-01", name: "A" },
      { date: "2026-07-10", name: "B" },
      { date: "2026-07-20", name: "C" },
    ],
    { from: "2026-07-05", to: "2026-07-15" },
  );

  assert.deepEqual(
    filtered.map((run) => run.name),
    ["B"],
  );
});

test("speed helpers default the date range to the latest seven days", () => {
  const range = speed.getDefaultRecentRunDateRange(
    [
      { date: "2026-07-14", name: "A" },
      { date: "2026-07-09", name: "B" },
      { date: "2026-07-03", name: "C" },
    ],
    "2026-07-16",
  );

  assert.deepEqual(range, {
    from: "2026-07-08",
    to: "2026-07-14",
  });
});

test("speed helpers build predictions from recent runs", () => {
  const recentRuns = [
    {
      name: "Tempo Run",
      date: "2026-07-09",
      distance_m: 10000,
      distance: "10.00 km",
      duration_s: 3600,
      duration: "1:00:00",
      pace_s_per_km: 360,
      pace: "6:00 /km",
      age_days: 1,
    },
  ];

  const predictions = speed.buildPredictions(recentRuns, "2026-07-10");
  const summary = speed.buildPredictionSummary(
    predictions,
    recentRuns,
    "2026-07-10",
  );

  assert.equal(predictions.length, 6);
  assert.equal(predictions[2].distance_label, "5K");
  assert.equal(predictions[2].confidence, "high");
  assert.equal(predictions[2].prediction, predictions[2].predicted_time);
  assert.equal(predictions[2].model, "Riegel extrapolation");
  assert.ok(Array.isArray(predictions[2].calibration_points));
  assert.equal(predictions[2].calibration_points[0].name, "Tempo Run");
  assert.match(predictions[2].ci_60, /^±/);
  assert.match(predictions[2].ci_90, /^±/);
  assert.equal(predictions[2].trend, "improving");
  assert.ok(predictions[2].how_to_improve.length > 0);
  assert.equal(summary.stale, false);
  assert.equal(summary.latest_useful_run.distance, "10.00 km");
  assert.equal(summary.useful_run_count, 1);
});

test("speed helpers format Garmin analytics", () => {
  assert.equal(speed.formatVo2max(51), "51.0 ml/kg/min");
  assert.equal(speed.formatTrendLabel("flat_or_rising"), "Flat Or Rising");
  assert.equal(speed.formatSleepMetric(83), "83/100");
  assert.equal(speed.formatSleepMetric(26100), "7h 15m");
  assert.equal(speed.formatHeartRate(162), "162 bpm");
  assert.equal(speed.formatMilliseconds(61), "61 ms");
  const detail = speed.buildPredictionDetail({
    distance_label: "5K",
    predicted_time: "20:45",
    ci_60: "±1:05",
    ci_90: "±2:10",
    trend: "improving",
    confidence: "high",
  });
  assert.match(detail.beforeGrid, /data-prediction-interval-select/);
  assert.equal(detail.items.length, 3);
  assert.match(detail.items[0], /60% CI/);
  assert.match(detail.items[1], /90% CI/);
  assert.match(
    speed.buildAnalyticsNotice(
      {
        currentVo2max: null,
        vo2maxTrendPoints: [],
        trainingLoadTrend: "",
        readiness: {},
      },
      [],
      { stale: false, warning: "" },
    ),
    /VO2 max/,
  );
  assert.equal(
    speed.buildCompletenessSuffix(
      {
        currentVo2max: null,
        vo2maxTrendPoints: [],
        trainingLoadTrend: "",
        readiness: {},
      },
      [],
    ),
    " · partial data (7)",
  );
  assert.deepEqual(
    speed.normalizeReadiness({
      sleep_score: 83,
      resting_heart_rate_bpm: 46,
      raw_hrv_ms: 61,
      hrv: "balanced",
      stress: "low",
      body_battery: 61,
    }),
    {
      sleepScore: 83,
      restingHeartRateBpm: 46,
      rawHrvMs: 61,
      hrv: "balanced",
      stress: "low",
      bodyBattery: 61,
    },
  );
});

test("strength helpers format numbers and resolve templates", () => {
  assert.equal(strength.formatNum(3), "3");
  assert.equal(strength.formatNum(3.25), "3.3");
  assert.equal(strength.findTemplateId("Bench Press (Barbell)"), "79D0BB3A");
  assert.equal(strength.findTemplateId("Unknown Exercise"), null);
  assert.equal(strength.escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("strength modal derives warmup and rest from exercise history", () => {
  const history = [
    { date: "2026-07-01", weight_kg: 50, reps: 5, estimated_one_rm_kg: 56 },
    { date: "2026-07-08", weight_kg: 55, reps: 5, estimated_one_rm_kg: 62 },
  ];
  assert.ok(history.length >= 2);
  const latest = history[history.length - 1];
  assert.equal(latest.weight_kg, 55);
  assert.equal(latest.reps, 5);
});

test("app helpers format guidance and session labels", () => {
  assert.equal(app.formatMacroTarget(2400, "kcal"), "2400 kcal");
  assert.equal(app.formatMacroCurrent(120, "g"), "120 g logged");
  assert.equal(app.formatSentenceValue("fuel now"), "Fuel now");
  assert.equal(app.formatSentenceValue("-"), "-");
  assert.equal(app.formatFoodTimingLabel("before"), "Before training");
  assert.equal(app.formatFoodTimingLabel("unknown"), "Flexible timing");
  assert.equal(app.formatSessionModeLabel("planned"), "Planned");
  assert.equal(app.formatSessionTypeLabel("lift"), "Lift");
  assert.match(
    app.describeSessionContext({
      mode: "planned",
      type: "run",
      time: "2026-07-09T07:00",
    }),
    /^Planned Run at /,
  );
  assert.equal(
    app.describeSessionHelp({ mode: "none" }).includes("Pick a timing mode"),
    true,
  );
});

test("progress helpers format change rows", () => {
  assert.deepEqual(progress.deltaRow("VO2 max", 50, 52), {
    label: "VO2 max",
    value: "50 → 52",
    deltaClass: "delta-up",
    tooltip: "VO2 max increased from 50 to 52 — improvement",
  });
  assert.deepEqual(progress.deltaRow("Fueling", "High", "Moderate"), {
    label: "Fueling",
    value: "High → Moderate",
    deltaClass: "",
    tooltip: "Fueling: High → Moderate",
  });
  assert.equal(progress.deltaRow("Fueling", null, null), null);
  assert.deepEqual(progress.summaryTile("Latest", "2026-07-09", "Snapshot"), {
    label: "Latest",
    value: "2026-07-09",
    subvalue: "Snapshot",
  });
});

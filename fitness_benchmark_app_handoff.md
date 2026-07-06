# Fitness Benchmark App — Coding Agent Handoff

## 1. Objective

Build an app that lets a user import or enter personal fitness bests from Strava and Hevy, then compares the user against wider benchmark data to identify relative strengths, weaknesses, and progress trends.

The app should support two primary domains:

1. Running performance, using Strava activities and race-result / age-grade benchmarks.
2. Strength training performance, using Hevy workout data and strength benchmark datasets.

The output should not simply say “good” or “bad.” It should show percentile-style comparisons against clearly labelled populations, such as:

- Competitive raw powerlifters
- 5K race finishers
- Same-sex and same-age runners
- Same-bodyweight strength athletes
- The user’s own historical trend

The key product value is a “fitness profile” that shows where the user is overperforming, underperforming, or balanced relative to comparable populations.

---

## 2. Product Scope

### MVP

The MVP should include:

- User account and profile
- Manual entry for height, weight, sex, age/date of birth
- Manual entry for strength PRs
- Manual entry for running PRs
- Strava OAuth import for running activities
- Hevy import if technically feasible; otherwise manual CSV/API-key fallback
- Benchmark comparison engine
- Dashboard showing percentile rankings
- “Overperforming / typical / underperforming” categorization
- Clear source labels and caveats for every benchmark

### Out of Scope for MVP

Do not include these in the first build unless explicitly requested later:

- Nutrition tracking
- AI training plan generation
- Social leaderboard
- Medical advice
- Injury prediction
- Scraping third-party apps
- Claiming to compare users to “all gym users” unless the dataset actually supports that

---

## 3. Key Data Sources

### 3.1 User Performance Sources

#### Strava

Use Strava to import a consenting user’s own activity data.

Important constraints:

- Strava API uses OAuth.
- API access is authenticated.
- New apps may start in limited/single-player mode.
- Strava has rate limits.
- Do not use Strava as a benchmark dataset unless the app has explicit rights to aggregate such data.
- Store only the data needed for the user’s own analytics and comply with Strava API terms.

Likely useful fields:

- Activity type
- Distance
- Moving time
- Elapsed time
- Elevation gain
- Start date
- Average pace
- Splits, if available
- Best efforts, if available
- GPS/elevation data, if needed later

#### Hevy

Use Hevy for strength data if available.

Important constraints:

- Hevy’s public API is described as early-stage.
- Current public docs indicate it is available to Hevy Pro users.
- API structure may change.
- If official OAuth is not available, prefer one of:
  - User-provided API key
  - Manual workout import
  - CSV export/import
  - Manual PR entry

Likely useful fields:

- Workout date
- Exercise name
- Sets
- Reps
- Weight
- RPE, if available
- Exercise category / muscle group, if available

---

## 4. Benchmark Sources

### 4.1 Strength

Primary benchmark: OpenPowerlifting.

Use it for:

- Squat
- Bench press
- Deadlift
- Total
- Bodyweight-adjusted comparisons
- Age/sex/bodyweight/equipment-filtered comparisons

Important caveat:

OpenPowerlifting represents competitive powerlifters, not the general gym population. Every comparison must label this clearly.

Recommended OpenPowerlifting filters:

- Sex
- Age band
- Bodyweight band
- Equipment = Raw
- Event = SBD or relevant lift-specific event
- Tested status, if used
- Federation/country/date filters only if needed

Do not compare a casual gym lift directly to equipped or untested competitive totals unless the UI labels that comparison explicitly.

### 4.2 Running

There is no perfect OpenPowerlifting-equivalent for normal runners.

Recommended benchmark sources:

1. Race-result datasets for distance-based percentiles.
2. Age-grading tables for age/sex-normalized performance quality.
3. Ultra-running datasets if supporting trail/ultra performance.

Useful benchmark categories:

- 5K
- 10K
- Half marathon
- Marathon
- Ultra distances, later
- Road vs trail, where available
- Age band
- Sex

Important caveat:

Race-result datasets represent race finishers, not all people who run. Strava activities represent training data, not always race efforts.

---

## 5. User-Facing Comparison Philosophy

Avoid absolute judgments like:

- “You are bad at running”
- “Your squat is weak”
- “You should lose weight”
- “You are underperforming for your body”

Use neutral comparative language:

- “Bench press is above the benchmark median for comparable raw lifters.”
- “5K time is around the 65th percentile for same-sex race finishers in this age band.”
- “Running performance is stronger than strength performance relative to the selected benchmarks.”
- “This comparison is based on competitive powerlifting data, so it may be stricter than a general gym-user comparison.”

Recommended categories:

- 90th percentile or higher: Exceptional
- 75th to 89th percentile: Strong
- 25th to 74th percentile: Typical
- 10th to 24th percentile: Development area
- Below 10th percentile: Major development area
- Insufficient sample size: Not enough benchmark data

Alternative MVP categories:

- Overperforming: >= 75th percentile
- Typical: 25th to 74th percentile
- Underperforming: < 25th percentile
- Insufficient data: sample size too low or benchmark unavailable

---

## 6. Core Metrics

### 6.1 Strength Metrics

For each major exercise:

- Best single
- Estimated 1RM
- Best set by volume
- Bodyweight-relative strength
- Allometric strength score
- Percentile vs benchmark
- Percentile trend over time

Recommended estimated 1RM formula:

```text
e1RM = weight * (1 + reps / 30)
```

Only use estimated 1RM for sets within a reasonable rep range, such as 1–10 reps. For higher reps, mark confidence as lower.

Useful derived metrics:

```text
relative_strength = lift_kg / bodyweight_kg
allometric_strength = lift_kg / (bodyweight_kg ^ 0.67)
```

Initial strength exercises to normalize:

- Bench press
- Squat
- Deadlift
- Overhead press
- Pull-up / weighted pull-up, if available
- Barbell row, optional
- Leg press, optional but hard to standardize

### 6.2 Running Metrics

For each activity or PR:

- Best 1 km
- Best 1 mile
- Best 5K
- Best 10K
- Best half marathon
- Best marathon
- Weekly distance
- Longest run
- Elevation-adjusted pace, later
- Age-grade score
- Percentile vs race-result benchmark

For MVP, prioritize actual PRs and clearly marked “estimated PRs.”

Example distinction:

- Actual 5K race PR: high confidence
- Fastest 5K segment inside training run: medium confidence
- Predicted 5K from shorter effort: low confidence

---

## 7. Benchmark Engine

### 7.1 Inputs

The benchmark engine should accept:

```json
{
  "user_id": "uuid",
  "domain": "strength",
  "metric": "bench_press_1rm_kg",
  "value": 100,
  "sex": "M",
  "age": 32,
  "height_cm": 178,
  "bodyweight_kg": 82,
  "date": "2026-07-02"
}
```

For running:

```json
{
  "user_id": "uuid",
  "domain": "running",
  "metric": "5k_time_seconds",
  "value": 1500,
  "sex": "M",
  "age": 32,
  "height_cm": 178,
  "bodyweight_kg": 82,
  "date": "2026-07-02",
  "surface": "road"
}
```

### 7.2 Output

The benchmark engine should return:

```json
{
  "metric": "bench_press_1rm_kg",
  "user_value": 100,
  "comparison_population": "OpenPowerlifting raw male lifters, 80–85 kg bodyweight",
  "percentile": 62.4,
  "median": 92.5,
  "p25": 75,
  "p75": 120,
  "sample_size": 18420,
  "category": "typical",
  "confidence": "medium",
  "caveat": "Competitive powerlifting data; stricter than general gym population."
}
```

For running, lower times are better, so percentile calculation must invert the direction.

```json
{
  "metric": "5k_time_seconds",
  "user_value": 1500,
  "comparison_population": "Male 30–34 5K race finishers",
  "percentile": 64.1,
  "median": 1620,
  "p25": 1380,
  "p75": 1860,
  "sample_size": 9000,
  "category": "typical",
  "confidence": "medium",
  "caveat": "Race-result data; not representative of all casual runners."
}
```

### 7.3 Percentile Calculation

For metrics where higher is better:

```python
percentile = count(benchmark_values <= user_value) / sample_size * 100
```

For metrics where lower is better:

```python
percentile = count(benchmark_values >= user_value) / sample_size * 100
```

### 7.4 Sample Size Rules

Suggested confidence handling:

- sample_size >= 1000: high confidence
- sample_size 200–999: medium confidence
- sample_size 50–199: low confidence
- sample_size < 50: do not show percentile; show “insufficient benchmark data”

---

## 8. Data Model

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### user_profiles

```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  sex TEXT,
  date_of_birth DATE,
  height_cm NUMERIC,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### bodyweight_measurements

```sql
CREATE TABLE bodyweight_measurements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  measured_at TIMESTAMP NOT NULL,
  weight_kg NUMERIC NOT NULL,
  source TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### connected_accounts

```sql
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMP,
  scopes TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### strength_entries

```sql
CREATE TABLE strength_entries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  source TEXT NOT NULL,
  source_workout_id TEXT,
  performed_at TIMESTAMP NOT NULL,
  exercise_name_raw TEXT NOT NULL,
  exercise_key TEXT NOT NULL,
  weight_kg NUMERIC NOT NULL,
  reps INTEGER NOT NULL,
  estimated_1rm_kg NUMERIC,
  bodyweight_kg NUMERIC,
  confidence TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### running_activities

```sql
CREATE TABLE running_activities (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  source TEXT NOT NULL,
  source_activity_id TEXT,
  started_at TIMESTAMP NOT NULL,
  distance_m NUMERIC NOT NULL,
  moving_time_seconds INTEGER NOT NULL,
  elapsed_time_seconds INTEGER,
  elevation_gain_m NUMERIC,
  activity_type TEXT,
  surface TEXT,
  confidence TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### running_bests

```sql
CREATE TABLE running_bests (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  source_activity_id TEXT,
  metric TEXT NOT NULL,
  value_seconds INTEGER NOT NULL,
  achieved_at TIMESTAMP NOT NULL,
  confidence TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### benchmark_distributions

Precompute benchmark distributions rather than scanning large raw datasets on every request.

```sql
CREATE TABLE benchmark_distributions (
  id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  comparison_population TEXT NOT NULL,
  sex TEXT,
  age_band TEXT,
  bodyweight_band TEXT,
  source TEXT NOT NULL,
  source_version TEXT,
  sample_size INTEGER NOT NULL,
  p01 NUMERIC,
  p05 NUMERIC,
  p10 NUMERIC,
  p25 NUMERIC,
  p50 NUMERIC,
  p75 NUMERIC,
  p90 NUMERIC,
  p95 NUMERIC,
  p99 NUMERIC,
  raw_filter_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### benchmark_results

```sql
CREATE TABLE benchmark_results (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  user_value NUMERIC NOT NULL,
  percentile NUMERIC,
  category TEXT,
  confidence TEXT,
  benchmark_distribution_id UUID REFERENCES benchmark_distributions(id),
  generated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

---

## 9. Exercise Normalization

Hevy exercise names may not match benchmark names directly.

Create a mapping layer:

```json
{
  "bench press": "bench_press",
  "barbell bench press": "bench_press",
  "flat barbell bench press": "bench_press",
  "squat": "squat",
  "barbell back squat": "squat",
  "deadlift": "deadlift",
  "conventional deadlift": "deadlift",
  "sumo deadlift": "deadlift"
}
```

Store both:

- raw exercise name
- normalized exercise key

Allow the user to correct mappings.

---

## 10. Running Best Detection

For MVP, use simple rules:

- If activity distance is within tolerance of known race distance, treat it as a candidate.
- Use moving time for training activities.
- Use official race result/manual entry as higher confidence than Strava training data.

Distance tolerance examples:

```text
5K: 4.95–5.15 km
10K: 9.90–10.30 km
Half marathon: 20.9–21.5 km
Marathon: 41.8–42.6 km
```

Later improvement:

- Use stream data to compute best rolling 5K/10K segments inside longer activities.
- Adjust for elevation.
- Detect downhill-assisted outliers.
- Distinguish treadmill, trail, road, and track.

---

## 11. API Design

### Import Strava Activities

```http
POST /api/integrations/strava/connect
GET /api/integrations/strava/callback
POST /api/integrations/strava/sync
```

### Import Hevy Workouts

```http
POST /api/integrations/hevy/connect
POST /api/integrations/hevy/sync
POST /api/import/hevy-csv
```

### Manual Entries

```http
POST /api/manual/strength
POST /api/manual/running-pr
POST /api/bodyweight
```

### Benchmarking

```http
POST /api/benchmarks/recalculate
GET /api/benchmarks/summary
GET /api/benchmarks/strength
GET /api/benchmarks/running
GET /api/benchmarks/history
```

Example summary response:

```json
{
  "overall_profile": {
    "strength_score": 68,
    "running_score": 54,
    "balance": "strength-biased"
  },
  "highlights": [
    {
      "metric": "bench_press",
      "category": "overperforming",
      "percentile": 82
    },
    {
      "metric": "5k",
      "category": "typical",
      "percentile": 57
    }
  ],
  "development_areas": [
    {
      "metric": "squat",
      "category": "underperforming",
      "percentile": 22
    }
  ]
}
```

---

## 12. Frontend Screens

### 12.1 Onboarding

Collect:

- Sex
- Date of birth
- Height
- Current bodyweight
- Units: kg/lb, km/mi
- Training focus: strength, running, hybrid
- Data sources to connect

### 12.2 Dashboard

Show:

- Overall profile
- Strength score
- Running score
- Top overperforming metrics
- Main development areas
- Data quality warnings
- Last sync time

### 12.3 Strength Detail

For each lift:

- Current best
- Estimated 1RM
- Bodyweight-relative score
- Percentile
- Comparison population
- Trend chart
- Caveat

### 12.4 Running Detail

For each distance:

- Current best
- Pace
- Percentile
- Age-grade score
- Comparison population
- Trend chart
- Caveat

### 12.5 Data Sources

Show:

- Connected integrations
- Last sync
- Permissions
- Delete integration
- Delete imported data

---

## 13. Privacy and Compliance

Minimum requirements:

- Encrypt OAuth/API tokens.
- Allow users to disconnect Strava/Hevy.
- Allow users to delete imported data.
- Do not expose one user’s activity data to another user.
- Do not scrape Strava or Hevy.
- Do not aggregate third-party user data into a benchmark corpus unless licensing and API terms explicitly allow it.
- Keep benchmark datasets separate from user-imported data.
- Clearly label all benchmark sources.

---

## 14. Benchmark Caveats to Display in Product

Use these directly in UI where appropriate:

### OpenPowerlifting Caveat

“This benchmark uses competitive powerlifting results. It may be stricter than comparison against general gym users.”

### Running Dataset Caveat

“This benchmark uses race-result data. It compares you with race finishers, not the general population or all recreational runners.”

### Strava Activity Caveat

“Training runs may not represent all-out race efforts. Manual race PRs are treated as higher confidence.”

### Estimated 1RM Caveat

“Estimated 1RM is calculated from submaximal sets and becomes less reliable at higher rep ranges.”

---

## 15. Implementation Plan

### Phase 1 — Manual MVP

Build:

- User profile
- Manual strength PR entry
- Manual running PR entry
- Static benchmark distributions
- Dashboard
- Percentile calculation
- Caveat display

Do not start with integrations. Validate the benchmark UX first.

### Phase 2 — Strava Integration

Build:

- OAuth flow
- Activity sync
- Running best extraction
- Refresh-token handling
- Rate-limit handling
- Activity deduplication

### Phase 3 — Hevy Integration

Build one of:

- Official API integration if stable enough
- User API-key integration
- CSV import fallback
- Manual PR fallback

### Phase 4 — Better Benchmarking

Add:

- More benchmark datasets
- Age grading
- Better bodyweight filters
- Trend over time
- Confidence intervals
- Sample-size thresholds

### Phase 5 — Recommendation Layer

Only after benchmark accuracy is solid, add:

- Suggested focus areas
- Balanced athlete profile
- Progress insights
- Training emphasis suggestions

Avoid medical or injury claims.

---

## 16. Acceptance Criteria

### User Profile

- User can enter sex, age/date of birth, height, and bodyweight.
- User can update bodyweight over time.
- App uses the bodyweight closest to the performance date where possible.

### Strength

- User can enter a lift manually.
- App computes estimated 1RM.
- App normalizes exercise name.
- App compares the lift against a relevant benchmark population.
- App shows percentile, category, sample size, and caveat.

### Running

- User can enter a running PR manually.
- App computes pace.
- App compares the time against a relevant benchmark population.
- App shows percentile, category, sample size, and caveat.
- Lower time is correctly treated as better.

### Dashboard

- App shows strongest metrics.
- App shows weakest metrics.
- App separates strength and running.
- App shows data quality warnings where needed.

### Integrations

- Strava sync imports activities without duplicates.
- Tokens are encrypted.
- Rate-limit errors are handled gracefully.
- User can disconnect the integration.

### Privacy

- User can delete imported data.
- Benchmarks are not built from private user data without explicit consent.
- Third-party data licensing is respected.

---

## 17. Suggested Tech Stack

Use whatever stack is already preferred. A reasonable default:

- Frontend: Next.js / React
- Backend: FastAPI, Django, Rails, or Node
- Database: Postgres
- Jobs: BullMQ, Celery, Sidekiq, or similar
- Object storage: S3-compatible storage for raw benchmark imports
- Analytics processing: Python scripts or dbt
- Auth: Clerk, Auth0, Supabase Auth, or custom

For benchmark preprocessing, Python + pandas is likely easiest.

---

## 18. Initial Engineering Tasks

1. Create database schema.
2. Implement user profile and bodyweight tracking.
3. Add manual strength PR entry.
4. Add manual running PR entry.
5. Create benchmark distribution seed format.
6. Implement percentile calculator.
7. Implement benchmark result categories.
8. Build dashboard summary endpoint.
9. Build simple dashboard UI.
10. Add caveat display.
11. Add Strava OAuth.
12. Add Strava activity sync.
13. Add running PR extraction.
14. Add Hevy integration or CSV/manual fallback.
15. Add benchmark refresh jobs.

---

## 19. Open Questions

Resolve these before production:

1. Will the first version support only manual entry, or integrations from day one?
2. Which countries/languages should the app support?
3. Will users compare against sex assigned at birth, gender category, or user-selected competition category?
4. Should bodyweight be self-entered only, or imported from connected devices later?
5. Should the app show “underperforming,” or use softer labels like “development area”?
6. Should the app support both metric and imperial units?
7. Will benchmark datasets be periodically refreshed?
8. Will user-imported data ever be aggregated into anonymized internal benchmarks? If yes, explicit consent and a separate privacy design are required.

---

## 20. Reference Sources for the Agent

These are the sources that informed the technical constraints and benchmark choices:

- Strava API Getting Started: https://developers.strava.com/docs/getting-started/
- Strava API Rate Limits: https://developers.strava.com/docs/rate-limits/
- Strava API Authentication: https://developers.strava.com/docs/authentication/
- Hevy Public API Docs: https://api.hevyapp.com/docs/
- OpenPowerlifting data license: https://github.com/sstangl/openpowerlifting/blob/main/LICENSE-DATA
- OpenPowerlifting repository: https://github.com/sstangl/openpowerlifting
- Runalyze age-grade library: https://github.com/Runalyze/age-grade

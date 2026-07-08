# App Blueprint

This document turns the global vision into a practical product blueprint. It defines the first useful app shape before the implementation work expands beyond the current snapshot-first system.

## Product Purpose

Personal Trainer is a rules-based, goal-driven performance companion.

Its job is to help an athlete be in the best possible position to perform by guiding:

- training
- fueling
- recovery
- direct logging

The first iteration should focus on signals the product can capture directly and reliably.

## Product Principles

- The system is rules-based and best-practice driven.
- The system is goal-aware and phase-aware.
- The same food or session can be right or wrong depending on the current goal.
- The system should explain why a target changed.
- The system should keep raw data auditable and derived guidance separate.
- The system should favor clarity and action over abstraction.
- The system should prefer small, understandable recommendations over exhaustive detail.
- The v1 experience should be useful without requiring a backend rewrite.
- The main UI should use small help affordances instead of long citations.

## Product Shape

The core app should answer three questions:

- What should I do today?
- What should I eat today?
- How should I adjust if the day changes?

The product should stay compact on the home screen and use progressive disclosure for detail.

## Goal Model

The app supports both standalone and combined goals.

Example goals:

- weight change
- strength progression
- half marathon performance
- first pull-up
- sport readiness
- general performance

The system must:

- store the active goal or goals
- understand the current phase
- resolve goal conflicts explicitly
- adjust guidance when priorities change
- surface the primary goal first and secondary goals only when relevant

## Nutrition Goal Model

The app should use simple, user-facing nutrition goal labels:

- `lose weight`
- `gain muscle`
- `maintain weight`
- `support performance`
- `mixed goal`

### How the labels should behave

- The user should choose one primary nutrition goal.
- Secondary goals can exist, but the primary label should drive the day's targets.
- The app should explain when a short-term training demand temporarily changes the day's fueling targets.
- The labels should be understandable to non-experts and avoid technical jargon.
- For first-time users, the app should lead with the four most common choices: `lose weight`, `gain muscle`, `maintain weight`, and `support performance`.
- `mixed goal` should stay available, but only when the user genuinely needs to balance two priorities at once.
- If the user does not pick a goal, the app should fall back to `maintain weight` as the neutral default.

### Mapping principle

- The labels should map cleanly to the rule engine behind the scenes.
- The user should see simple language.
- The system should use the label to decide how aggressive or conservative the calorie and macro targets should be.

### Why this set

- It covers body-weight change goals.
- It covers performance-first goals.
- It covers maintenance.
- It supports mixed objectives without forcing users into a technical model.
- It keeps the first decision simple enough for onboarding.
- It gives the app a safe default when the user is not trying to change body weight.

## Nutrition Goal Target Rules

### `lose weight`

- Calories should trend lower than maintenance.
- Protein should stay high to protect lean mass.
- Carbs should still support important sessions, but the app should avoid unnecessary over-fueling.
- The app should be careful not to reduce food so much that training quality collapses.

### `gain muscle`

- Calories should trend above maintenance.
- Protein should stay high and consistent.
- Carbs should support training volume and recovery.
- The app should favor steady surplus over aggressive overeating.

### `maintain weight`

- Calories should stay near maintenance.
- Protein should still be protected.
- Carbs should flex with session demand.
- The app should avoid drifting into accidental loss or gain without intent.

### `support performance`

- Calories should support training quality, recovery, and repeatable output.
- Carbs should get more emphasis around hard sessions and long sessions.
- Protein should still be steady.
- This goal should not try to force body weight change unless that is also an explicit goal.
- The app should bias toward performance over aggressive weight loss.

### `mixed goal`

- The app should resolve which goal is primary in the current phase.
- Targets should reflect the primary goal, but not ignore the secondary one.
- The app should explain the tradeoff briefly.

### General adjustment rules

- Session type modifies the day's demand.
- Recovery state can soften how aggressive targets are.
- Weight trend can shift the baseline over time.
- Performance trend can prevent the app from pushing in the wrong direction.
- Targets should move gradually, not in extreme jumps.

### Tone rule

- The app should avoid making the user feel like they failed if they are a little above or below target.
- The focus should be on trend and adjustment, not perfection.

## Macro Emphasis Rules

### Protein

- Protein should be treated as the anchor macro.
- It should stay consistently high across most goals.
- The app should protect protein first before making other adjustments.

### Carbohydrates

- Carbs should flex the most with session demand.
- Hard runs, long runs, intervals, and demanding sport sessions should raise carb emphasis.
- Recovery days and rest days may reduce carb emphasis if the goal calls for it.
- Carbs should support performance and recovery around key sessions.

### Fat

- Fat should be the main flexible lever after protein is protected.
- It can move up or down to help the app hit the day's calorie target.
- The app should avoid pushing fat too low for too long.

### By goal type

- `lose weight`
  - Protein high
  - Carbs targeted around important sessions
  - Fat used to help create the calorie deficit

- `gain muscle`
  - Protein high
  - Carbs supportive of training volume and recovery
  - Fat kept adequate while calories trend up

- `maintain weight`
  - Protein steady
  - Carbs flex with the day
  - Fat used to keep intake balanced

- `support performance`
  - Protein steady
  - Carbs emphasized around demanding sessions
  - Fat kept compatible with training quality and recovery

## Nutrition Timing Rules

- Timing should depend on session type, session time, and goal.
- The app should speak in simple guidance such as `fuel before`, `fuel around`, `recover after`, or `timing not critical today`.

### Before training

- Harder or longer sessions should get stronger pre-fuel guidance.
- Short, easy, low-demand sessions can stay simpler.

### During training

- Only sessions that are long or demanding enough should trigger during-session fueling guidance.

### After training

- Hard sessions should increase the importance of post-session protein and carbohydrate.
- Recovery after the session should matter more when the training demand was high.

### By session type

- Run
  - Easy: lower timing pressure
  - Long: stronger fueling emphasis
  - Intervals / tempo: strong carbohydrate support around the session

- Lift
  - Upper body: moderate timing emphasis
  - Lower body: stronger recovery and carbohydrate emphasis
  - Full body / strength focus: highest overall importance for post-session fueling

- Sport
  - Training / skills: moderate to strong emphasis depending on duration and intensity

- Recovery
  - Less strict fueling rules

- Rest
  - Least strict timing rules

## Recovery Rules

- Recovery influences both training and fueling.
- The app should consider sleep, soreness, stress, pain, and readiness.
- Good recovery supports harder session recommendations.
- Poor recovery softens the day.
- Pain should override the plan when needed.
- The system should keep recovery practical, not burdensome.

## Session Taxonomy

The core session categories should be:

- `run`
- `lift`
- `mixed`
- `sport`
- `recovery`
- `rest`

Each category can have subtypes when they materially change fueling guidance.

## Body Metrics

The core product should focus on body weight and strength trend.

- Weight is the primary body metric for this iteration.
- Strength trend should be tracked where available, because it is a clearer progress signal than body composition for this iteration.
- Body composition can remain a later optional layer, but it should not be required for the core product.

## V1 Workflow

### 1. Declare the day

- The user states whether a session is planned.
- If a session is planned, the user selects the session type.
- The app uses that input to infer the session demand for the day.

### 1a. Capture session timing

- The app should support three session timing scenarios:
  - the user defines the session there and then
  - the user preplans the session ahead of time
  - the user adds the session retroactively
- The app should always record when the session occurred or is expected to occur.
- Session timing matters because nutrition guidance depends on whether fueling is needed before, during, or after the session.
- The system should use session timing to adjust nutrition timing guidance, not just daily calorie totals.

### 2. Set the working targets

- The system sets calories and macros for the day.
- Targets are adjusted by session type, goal, weight trend, performance trend, and recovery state.
- Targets are working targets, not fixed forever.

### 2a. Establish a baseline

- Onboarding should stay short:
  - ask for the main goal first
  - ask for the baseline calculator only if the user needs a starting point
  - explain why any extra field is being requested
- For users who do not know their starting nutrition numbers, the app can provide a Mayo Clinic-style calorie baseline calculator as an onboarding starting point.
- The baseline uses simple inputs like age, sex, height, weight, and activity level to estimate a starting calorie target.
- The app should ask for these details only when they are needed, and explain why each one matters.
- If the user does not want the baseline yet, the app should let them continue and collect those details later.
- That baseline is not the final answer.
- The system uses it as the starting point for goal-aware adjustments as training and intake data accumulate.
- The baseline should help new users begin with something reasonable instead of forcing them to guess.

### 3. Log food during the day

- The user logs meals throughout the day.
- The user can scan barcodes for fast entry.
- The app should know whether intake is before, around, or after the session.
- The app updates whether the user is on track, behind, or over target.

### 4. Log the training

- The user logs the workout or imports it from connected sources.
- The app updates training load, progression, and fatigue context.
- If the session differs from the original plan, guidance can change.

### 5. Review the day

- The user reviews longer-term trends for body weight, performance, adherence, and recovery.
- The app should surface simple trend statements rather than forcing the user to interpret raw data.

## Frontend Interaction Model

- The home screen should stay simple and task-focused.
- The current primary goal should be visible.
- Today's targets should be visible.
- The next action should appear first.
- Use compact cards for calorie and macro status.
- Use the timeline for sessions and food.
- Use help affordances for reasoning, not a chat interface.
- Avoid overwhelming the home screen with too many metrics.

## Daily Recommendation Output

The daily output should stay readable at a glance and should not turn the home screen into a long report.

Suggested content:

- primary goal
- today's priority
- session recommendation or action
- calorie target
- macro target
- nutrition timing guidance
- short reason
- current status
- timing status

Suggested status labels:

- Current status: `on track`, `behind`, `over target`
- Timing status: `pre`, `during`, `post`, `aligned`, `late`, `missed`

## Rationale Popover

The help affordance should open a short, structured explanation.

Suggested fields:

- Why this target?
- What changed it?
- What should I do now?

Optional extra line:

- What happens if I ignore it?

The rationale popover should stay short and should not become a long article or citation list.

## Storage and Backend Evolution

The system should grow through a series of small, reviewable milestones rather than a few large jumps.

- Keep the current snapshot-first workflow as the stable baseline.
- Make source events, normalized records, and guidance more explicit.
- Preserve raw inputs as auditable records.
- Keep derived recommendations separate from stored source data.
- Add durable storage one domain at a time where the product needs more history.
- Add queryable history one view at a time where the product needs better review.
- Add direct entry one user flow at a time where the app can replace manual imports.
- Expand the rules engine incrementally without forcing a full rewrite.
- Choose implementation details later, based on product needs rather than early technical preference.

Each milestone should improve durability, history, or usability without breaking the daily guidance workflow.

## Later Product Capabilities

- Direct app entry for food and workouts
- More complete historical analysis and trend views
- Additional goal types and richer phase logic
- Optional body-composition inputs and trend views if the product later needs them
- Write paths for derived coaching actions when the product needs them

## Product Promise

The product should:

- capture what happened
- understand the current goal
- set today's training and fueling targets
- let the user log food and training quickly
- adapt targets as the day unfolds
- help the athlete stay in the best possible position to perform

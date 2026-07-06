# Design Principles & Philosophy

This document captures the frontend design decisions made during the UI overhaul. It serves as a reference for future work so the interface stays consistent as it evolves.

## Principles

### 1. Data first, chrome second

Every pixel should either be data or a direct path to data. Decorative elements, gradients, and spacing exist only to make data more readable. If an element doesn't help the user make a decision, it doesn't belong.

This is why:
- The dashboard shows the recommendation card first, not a logo or hero image
- Stats are grouped into labeled sections with no icons — the numbers are the content
- Expandable sections tuck raw JSON away but keep it one click away

### 2. Progressive disclosure from the dashboard

The dashboard is the daily decision center. Deeper analysis lives on dedicated pages. The dashboard should answer "what should I do today" in under 2 seconds. Everything else is a click away.

This is why:
- The recommendation, stats, goals, and weekly summary fit on one scroll
- History features (trends, comparisons) require an explicit "Load" action
- Strength/speed pages are separate views with their own tools

### 3. Self-documenting interface

Every unfamiliar term explains itself on hover. No user should need external documentation to understand what a number means.

This is why:
- `title` attributes explain "Est. 1RM", "% of peak", and delta arrows
- The welcome overlay introduces the four views on first visit
- Empty states show exact commands to generate data
- Tooltips use `cursor: help` to indicate they're interactive

### 4. History is infrastructure, not a feature

A single snapshot is a point in time. Trends, comparisons, goals, and insights all depend on history. The UI should work with one snapshot, but come alive with many.

This is why:
- The history generator is a separate script, not baked into the UI
- History is loaded on demand, not on page load
- Every view degrades gracefully when history isn't available

### 5. Responsive by default, mobile as a first consideration

The four-page layout (dashboard, strength, speed, progress) works on any screen width. Mobile isn't an afterthought — the bottom tab bar, stacked stat groups, and full-width controls are the primary layout at small sizes.

This is why:
- The bottom nav only appears below 768px (phones, small tablets)
- Desktop gets a dropdown nav menu instead
- Touch targets are minimum 44px on mobile (Apple HIG)
- Carousel cards adapt to viewport width

### 6. Every interaction gives feedback

Buttons have hover states, cards are clickable with pointer cursors, modals trap focus and close on Escape, data fades in when loaded. Nothing happens silently.

This is why:
- Skeleton shimmer fills space before content arrives
- Content fades in (0.3s) when skeletons are replaced
- "Log completed" shows an immediate tag
- Clicking an exercise card opens its trend modal instantly

### 7. Goals must be measurable and visible

A goal without a progress bar is just a wish. Every goal (strength target, race time) shows current vs target as a filled bar, with percentage complete and raw numbers.

This is why:
- Goals render as progress bars with the same visual language as nutrition macros
- The biggest-opportunity insight surfaces the single exercise furthest from its peak
- Stall detection flags exercises that haven't improved in 30+ days

## Visual Language

- **Dark theme** with accent gradients — the gradient background and panel cards create depth without heavy shadows
- **Accent colors carry meaning** — green for good/improving, amber for warning/stale, red for decline/missing
- **Category colors** (strength page) — lower body green, push purple, pull amber, accessory gray
- **Typography** — system font stack (Inter via SF/Browser default), uppercase labels with letter-spacing
- **Spacing** — 8px/12px/16px/18px/24px rhythm, cards with `border-radius: 16-24px`
- **Motion** — subtle (0.15-0.3s transitions), never decorative

## Key Components

| Component | Location | Behavior |
|---|---|---|
| Recommendation card | Dashboard | Foreground gradient card with action buttons |
| Stat groups | Dashboard | Grouped into Recommendation, Nutrition, Recovery |
| Macro progress bars | Dashboard | Colored fill relative to daily target |
| Exercise cards | Strength | Clickable, opens trend modal |
| Filter pills | Strength | Category counts, active state |
| Gain/Date/1RM sort | Strength | Three-way sort toggle |
| Trend modal | Strength | Sparklines, progression stats, 10-row history table |
| Record table | Speed | Distance-sorted rows with PB badge |
| Progress date picker | Progress | Two dropdowns with compare button |
| Delta arrows | Progress | Green up / red down for numeric changes |
| Sparklines | Dashboard, Progress | Inline SVG with data dots |
| Goal bars | Dashboard | Progress toward strength and speed targets |
| Insights | Strength | Category health, stall alerts, biggest opportunity |

## Non-Conventions (Intentionally Avoided)

- **No icons or icon libraries** — all visual signaling is done with color and type
- **No charting library** — sparklines are hand-drawn SVG (zero dependencies)
- **No frontend framework** — vanilla HTML/CSS/JS modules
- **No loading spinners** — skeleton shimmer feels faster
- **No pagination** — the data volume (90 days, 34 exercises) doesn't warrant it
- **No login or auth** — the site is a static JSON viewer; personal data never leaves local storage

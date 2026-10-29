# usage-line: Glance Light

## Problem Statement
How might we let a terminal Claude Code user (subscription or API) see in one glance whether they can keep working as they are, without ever running `/usage`, `/context` or `/cost`?

## Recommended Direction
The status line shows **one traffic-light verdict**, worked out from every limit: 5h, weekly, compaction, and the daily $ budget for API users. Only the limit you're closest to gets named. When everything is green the line stays at about 10 characters. Amber or red expands it to show that one metric, which side of pace you're on, and when it resets. Being blocked becomes something you can plan around.

Subscription and API users get the same light, and only the inputs change. API mode means walls in dollars instead of percentages. Forecasts ("~2h left", "~14 turns left") are added as a hint only once there are enough turns for the burn rate to be steady. Without that, they don't show.

```
green     ● ctx 22%
amber     ● wk 78% ▲12 · resets Thu 09:00
red       ● 5h 94% · resets 14:30 (47m)   ~3 turns
api       ● $7.40 today / $10
unknown   ○ ctx 4%                         (no reading yet)
```

### Weekly pace risk
Pace against the clock assumes usage is spread evenly across the window. That holds for the 5h window, which you use in one continuous stretch. It doesn't hold for the weekly window, because you work about 8 hours a day, not 24. After a heavy Monday you've used ~20% of the week while only ~5% of it has passed, which reads as `▲15`. That turns amber every workday and calms down overnight, so people learn to ignore it. For the weekly window, the pace arrow is only a note next to the number: the color comes from the absolute % and from the forecast at reset, and the forecast only counts once it's reliable. For the 5h window, pace can drive the color directly.

## Key Assumptions to Validate
- [ ] **`resetsAt` is present on every rate-limit reading** (the type marks it optional). Test: log `rateLimits` over a few real sessions.
- [ ] **API mode can be told apart from "no reading yet".** Rule: `cost > 0` and still no `rateLimits` after the first response means API mode. Test on both plan types.
- [ ] **Countdowns stay accurate between turns.** The line refreshes after each turn, so "47m" goes stale while you're idle. Test redrawing every 60s with `clock.every` and check it costs nothing (only local figures are read).
- [ ] **The weekly color logic doesn't cry wolf.** Test by replaying a real week of readings against the thresholds.
- [ ] **The forecast's "reliable" gate is easy to define.** Proposal: at least 5 turns in the window and burn-rate variation under X. Test against logged sessions before showing it.
- [ ] **The daily $ total stays correct across sessions running at the same time.** Store one entry per session id and add them up when reading, rather than having every session increment a shared counter.

## MVP Scope
**In:**
- the verdict (worst of all limits) and the line that adapts to it
- pace arrow
- reset time and countdown in red
- unknown state
- API $/day with a configurable budget
- configurable thresholds (defaults: amber 70%, red 90%, compaction amber 80%)
- alerts off, warn-once or every crossing (default: one toast per crossing, never repeated)
- redraw every 60s

**Out:** everything in Not Doing.

## Not Doing (and Why)
- **Showing every metric all the time:** that defeats the point of a quick look; `/usage` already exists for that.
- **History per repo or per project:** that's a dashboard, not a quick look. Phase 2.
- **"Compact now?" action hints:** compaction counts toward the light, but suggesting actions is a different product. Revisit once the light has earned trust.
- **Forecasts that are always on:** a wrong ETA is worse than none; they show only when reliable.
- **Desktop/IDE surfaces:** Phase 1 is terminal only.
- **Pacing the weekly window to working hours:** it fixes the pace risk properly but adds a schedule config. Use the absolute % and the forecast instead.

## Open Questions
- What does green show: `● ctx 22%`, just `●`, or the model name? Context changes every turn, so showing it is the current lean.
- Should two concurrent sessions each toast the same 5h crossing? (Accepted for the MVP.)
- What's the default daily $ budget for API users: unset (the light just shows spend), or a default such as $20?

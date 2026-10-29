# usage-line

A Claude Code mod that keeps every usage limit in the status line, each with its own traffic light:

```
🟢 5h 6% · 🟢 wk 13% ↓26 · 🟢 compact 3% · 🟢 cache 100% 5m · 72 skills · 0 mem   all clear
🟡 5h 72% · resets 01:10 (3h10m) · 🟢 wk 30% · 🟢 compact 12%   a limit needs you: its reset time
🔴 5h 94% ↑10 · resets 14:30 (47m) · ~3 turns · 🟡 wk 75% · …   red: plus a forecast if reliable
🟢 compact 6% · $7.40 today  API mode, no budget set
🟢 compact 6% · 🟡 $7.40/$10                                    API mode, with a budget
⚪ 5h – · ⚪ wk – · 🟢 compact 2%                                no reading yet
```

- **5h / wk** – share of the 5-hour and weekly rate-limit windows used (a gateway's **spend** limit too, when there is one).
- **compact** – how close the conversation is to auto-compaction.
- **cache** – share of the last response's input served from the prompt cache, then how long it stays warm (`5m`). `cold` means the next turn is billed at full price and burns more of your limits.
- **skills / mem** – skills and memory files loaded; amber only if together they take over 10% of the context.
- **$** – pay-per-token only: today's spend across sessions, with a light once you set a daily budget.
- **↑n / ↓n** – points ahead of or behind an even spread over the window. The 5-hour pace can turn its light amber on its own; the weekly pace only annotates, since nobody spends a week evenly.
- **resets** and **~N turns** – shown for the most urgent limit that isn't green; the forecast only after 5 turns at a steady rate.
- **Alerts** – a brief pop-up (toast) the first time that limit turns amber or red in a window; never two at once (configurable).

Everything is computed locally: no extra API calls. The line refreshes after each turn and every minute.

## Settings

In `/config`, under usage-line:

| setting | default |
|---|---|
| Amber / red at (% of a rate limit) | 70 / 90 |
| Amber / red at (% to auto-compact) | 80 / 95 |
| Daily budget (USD, pay-per-token only) | unset |
| Alerts: `once`, `every`, `off` | `once` |
| Prompt cache lifetime (minutes): 5 is the API default, 60 for the 1-hour cache | 5 |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-line --marketplace sprakash57/claude-usage-line
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install usage-line --marketplace sprakash57/claude-usage-line
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `sprakash57/claude-usage-line` → **Add plugin**.

## Develop

```
bun run test        # unit tests (spec/) and engine tests (tests/)
bun run typecheck
claude --plugin-dir .   # a session with the mod loaded from this folder, reloading on save
```

## Notes

Built on Claude Code's early-access plugin hooks API, which may change between releases.

## License

MIT

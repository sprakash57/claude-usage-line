# usage-line

A minimal Claude Code mod that keeps your usage in the status line:

```
5h 23% · wk 41% · ctx 38% · compact 52%
```

- **5h** – share of the 5-hour rate-limit window used
- **wk** – share of the weekly rate-limit window used
- **ctx** – how full the model's context window is
- **compact** – how close the conversation is to auto-compaction (estimated locally, no extra API calls)

Rate limits show `–` until the first response of a session, or when you are not on a subscription plan. The line refreshes at session start, after each turn, and whenever a rate-limit window moves a point.

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

## Notes

Built on Claude Code's early-access plugin hooks API, which may change between releases.

## License

MIT

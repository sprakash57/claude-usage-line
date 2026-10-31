// Records daily clone counts from GitHub's traffic API (which only keeps 14 days)
// into .github/clones.json, then writes the all-time total into README.md
// between the <!-- downloads --> markers.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const HISTORY = ".github/clones.json";
const README = "README.md";
const START = "<!-- downloads:start -->";
const END = "<!-- downloads:end -->";

async function fetchClones() {
  if (process.env.CLONES_FIXTURE) return JSON.parse(readFileSync(process.env.CLONES_FIXTURE, "utf8"));
  const { GITHUB_REPOSITORY: repo, TRAFFIC_TOKEN: token } = process.env;
  if (!repo || !token) throw new Error("GITHUB_REPOSITORY and TRAFFIC_TOKEN must be set");
  const res = await fetch(`https://api.github.com/repos/${repo}/traffic/clones?per=day`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`traffic API ${res.status}: ${await res.text()}`);
  return res.json();
}

const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, "utf8")) : {};
const { clones } = await fetchClones();

// A day's count only grows (today's is partial), so keep the larger value.
for (const { timestamp, count } of clones) {
  const day = timestamp.slice(0, 10);
  history[day] = Math.max(history[day] ?? 0, count);
}

const sorted = Object.fromEntries(Object.entries(history).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(HISTORY, JSON.stringify(sorted, null, 2) + "\n");

const total = Object.values(sorted).reduce((sum, n) => sum + n, 0);
const since = Object.keys(sorted).find((day) => sorted[day] > 0) ?? new Date().toISOString().slice(0, 10);
// HTML, not Markdown: GitHub doesn't render Markdown on a line that starts with an HTML comment.
const badge = `<img alt="downloads: ${total}" title="git clones since ${since}" src="https://img.shields.io/badge/downloads-${total}-blue">`;

const readme = readFileSync(README, "utf8");
const at = readme.indexOf(START), end = readme.indexOf(END);
if (at === -1 || end < at) throw new Error(`README.md needs ${START} and ${END} markers`);
writeFileSync(README, readme.slice(0, at + START.length) + badge + readme.slice(end));

console.log(`total clones: ${total} (since ${since})`);

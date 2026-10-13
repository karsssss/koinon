// Usage:
//   node sim/cli.ts run [--engagement low|medium|high] [--days N] [--seed N] [--seeds N] [--set path=value ...] [--json FILE]
//   node sim/cli.ts report [--seed N] [--seeds N] [--out FILE]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { overrideFromPath, ENGAGEMENT_LEVELS, type ConfigOverrides, type EngagementLevel } from "./config.ts";
import { DEFAULT_BASE_SEED, DEFAULT_SEEDS_PER_CELL, METRICS, runCell, runFullReport, seedList } from "./experiments.ts";
import { runSimulation } from "./engine.ts";
import { buildConfig } from "./config.ts";
import { renderReport } from "./report.ts";

function parse(argv: readonly string[]): { command: string; flags: Map<string, string[]> } {
  const [command = "run", ...rest] = argv;
  const flags = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`expected --flag value, got ${key ?? "nothing"}`);
    flags.set(key.slice(2), [...(flags.get(key.slice(2)) ?? []), value]);
    i++;
  }
  return { command, flags };
}

function one(flags: Map<string, string[]>, key: string, fallback: string): string {
  return flags.get(key)?.at(-1) ?? fallback;
}

function intFlag(flags: Map<string, string[]>, key: string, fallback: number): number {
  const n = Number(one(flags, key, String(fallback)));
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${key} must be a non-negative integer`);
  return n;
}

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${file}`);
}

function main(): void {
  const { command, flags } = parse(process.argv.slice(2));
  const seed = intFlag(flags, "seed", DEFAULT_BASE_SEED);

  if (command === "report") {
    const report = runFullReport(seed, intFlag(flags, "seeds", DEFAULT_SEEDS_PER_CELL));
    const markdown = renderReport(report);
    const out = flags.get("out")?.at(-1);
    if (out) write(out, markdown);
    else console.log(markdown);
    return;
  }

  if (command !== "run") throw new Error(`unknown command ${command}`);
  const engagement = one(flags, "engagement", "medium") as EngagementLevel;
  if (!ENGAGEMENT_LEVELS.includes(engagement)) throw new Error(`--engagement must be one of ${ENGAGEMENT_LEVELS.join(", ")}`);
  const days = intFlag(flags, "days", 90);
  const overrides: ConfigOverrides[] = (flags.get("set") ?? []).map((s) => {
    const eq = s.indexOf("=");
    if (eq < 1) throw new Error(`--set expects path=value, got ${s}`);
    return overrideFromPath(s.slice(0, eq), s.slice(eq + 1));
  });
  const seeds = intFlag(flags, "seeds", 1);

  if (seeds <= 1) {
    const result = runSimulation(buildConfig(...overrides, { seed, days, engagement }));
    const json = flags.get("json")?.at(-1);
    if (json) write(json, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ summary: result.summary, sources: result.sources, sinks: result.sinks, flows: result.flows, seasons: result.seasons, conservation: result.conservation }, null, 2));
    console.table(result.players.map((p) => ({ ...p })));
    return;
  }

  const c = runCell(`${engagement} / ${days}d`, engagement, days, seedList(seed, seeds), overrides);
  console.log(`${c.label}: ${c.runs} seeds from base ${seed}; conservation identity held in ${c.conservation.identityHeldRuns}/${c.runs} runs`);
  console.table(Object.fromEntries(METRICS.map((m) => [m.label, c.metrics[m.key]])));
}

main();

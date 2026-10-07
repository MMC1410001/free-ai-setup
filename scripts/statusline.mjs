#!/usr/bin/env node
/**
 * Claude Code status line: mode (FREE/PAID), context use, and token usage.
 * FREE shows OmniRoute usage today and the free allowance left.
 * PAID shows the plan limits Claude Code reports (Pro/Max only).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, gateway } from "./lib/common.mjs";
import { getUsage, shortLine, formatTokens } from "./lib/usage.mjs";

loadEnv();
let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* empty */ }

const norm = (u) => String(u || "").replace(/\/+$/, "").replace("://localhost", "://127.0.0.1");
const base = norm(gateway().base);

function projectUsesOmni() {
  const dir = input.workspace?.project_dir || input.cwd;
  if (!dir) return false;
  const f = join(dir, ".claude", "settings.local.json");
  if (!existsSync(f)) return false;
  try { return norm(JSON.parse(readFileSync(f, "utf8")).env?.ANTHROPIC_BASE_URL) === base; } catch { return false; }
}

const free = norm(process.env.ANTHROPIC_BASE_URL) === base || projectUsesOmni();
const c = { g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[36m", d: "\x1b[2m", r: "\x1b[0m" };
const parts = [];

parts.push(free ? `${c.g}FREE · OmniRoute${c.r}` : `${c.b}PAID · Claude${c.r}`);
if (input.model?.display_name) parts.push(input.model.display_name);

const cw = input.context_window || {};
if (cw.used_percentage != null) {
  parts.push(`context ${Math.round(cw.used_percentage)}% (${formatTokens(cw.total_input_tokens || 0)})`);
}

if (free) {
  const u = await getUsage({ timeoutMs: 1500 });
  parts.push(u.error ? `${c.y}${shortLine(u)}${c.r}` : shortLine(u));
} else {
  const rl = input.rate_limits || {};
  if (rl.five_hour?.used_percentage != null) parts.push(`5h limit ${Math.round(rl.five_hour.used_percentage)}% used`);
  if (rl.seven_day?.used_percentage != null) parts.push(`week ${Math.round(rl.seven_day.used_percentage)}% used`);
  if (rl.five_hour == null && input.cost?.total_cost_usd != null) {
    parts.push(`session ~$${input.cost.total_cost_usd.toFixed(2)}`);
  }
}

process.stdout.write(parts.join(`${c.d} | ${c.r}`) + "\n");

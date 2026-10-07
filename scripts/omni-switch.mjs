#!/usr/bin/env node
/**
 * Switch one project between paid Claude and free OmniRoute.
 *
 *   node omni-switch.mjs [status|free|paid|toggle|usage|help] [--dir <project>]
 *
 * Free mode adds OmniRoute env keys to <project>/.claude/settings.local.json.
 * Paid mode removes only those keys and restores any values they replaced,
 * so permissions and other settings in that file are kept.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadEnv, gateway, chatKey, isUp, readJson, writeJson, ensureDir, STATE_DIR } from "./lib/common.mjs";
import { getUsage, report } from "./lib/usage.mjs";

loadEnv();

const argv = process.argv.slice(2);
let dir = process.cwd();
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") dir = argv[++i] || dir;
  else if (argv[i].trim()) words.push(argv[i].trim().toLowerCase());
}
dir = resolve(dir);
const mode = words[0] || "status";

const FILE = join(dir, ".claude", "settings.local.json");
const STATE = join(STATE_DIR, "projects", createHash("sha1").update(dir).digest("hex").slice(0, 16) + ".json");
const { base } = gateway();

const RELOAD = `
-----------------------------------------------------------------
 ACTION: reload the window to apply the change.
   VS Code : Cmd/Ctrl+Shift+P -> "Developer: Reload Window"
   Terminal: exit Claude Code and start it again
 The first message before you reload can show an error. That is
 normal: the switch is already done.
-----------------------------------------------------------------`;

function ourEnv() {
  return {
    ANTHROPIC_BASE_URL: base,
    ANTHROPIC_AUTH_TOKEN: chatKey(),
    ANTHROPIC_MODEL: "default",
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    // Smaller than the 128k window of the NVIDIA fallback models, so a long
    // chat is compacted before a fallback model rejects it.
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "110000",
  };
}

function readSettings() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    console.error(`✖ ${FILE} is not valid JSON. Fix or remove it, then try again.`);
    process.exit(1);
  }
}

const norm = (u) => String(u || "").replace(/\/+$/, "").replace("://localhost", "://127.0.0.1");
const isFree = (s) => norm(s?.env?.ANTHROPIC_BASE_URL) === norm(base);

function keepOutOfGit() {
  const inRepo = spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (inRepo.status !== 0) return;
  const ignored = spawnSync("git", ["-C", dir, "check-ignore", "-q", FILE]);
  if (ignored.status === 0) return;
  const gi = join(dir, ".gitignore");
  const pre = existsSync(gi) && !readFileSync(gi, "utf8").endsWith("\n") ? "\n" : "";
  appendFileSync(gi, `${pre}.claude/settings.local.json\n`);
  console.log("  added .claude/settings.local.json to .gitignore (it holds your OmniRoute key)");
}

async function toFree() {
  const s = readSettings();
  if (isFree(s)) return console.log(`Already FREE (OmniRoute) in ${dir}`);
  if (!chatKey()) {
    console.error("✖ OMNIROUTE_API_KEY is missing. Run the installer again.");
    process.exit(1);
  }
  const env = s.env || {};
  const saved = {};
  for (const [k, v] of Object.entries(ourEnv())) {
    saved[k] = k in env ? env[k] : null;
    env[k] = v;
  }
  writeJson(STATE, { dir, saved, fileExisted: existsSync(FILE) });
  ensureDir(join(dir, ".claude"));
  writeFileSync(FILE, JSON.stringify({ ...s, env }, null, 2) + "\n", { mode: 0o600 });
  keepOutOfGit();
  console.log(`✓ FREE (OmniRoute) in ${dir}`);
  if (!(await isUp())) {
    console.log(`\n! OmniRoute is not running at ${base}. Start it with:\n    omniroute serve --no-tray --no-open --daemon`);
  }
  console.log(RELOAD);
}

function toPaid() {
  const s = readSettings();
  if (!isFree(s)) return console.log(`Already PAID in ${dir}`);
  const state = readJson(STATE, { saved: {} });
  const env = s.env || {};
  for (const k of Object.keys(ourEnv())) {
    const prev = state.saved?.[k];
    if (prev === undefined || prev === null) delete env[k];
    else env[k] = prev;
  }
  const next = { ...s, env };
  if (!Object.keys(env).length) delete next.env;
  if (!Object.keys(next).length && state.fileExisted === false) unlinkSync(FILE);
  else writeFileSync(FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  console.log(`✓ PAID in ${dir}`);
  console.log(RELOAD);
}

switch (mode) {
  case "status":
    console.log(`${isFree(readSettings()) ? "FREE (OmniRoute)" : "PAID"} in ${dir}`);
    console.log("Use: /omni free | /omni paid | /omni usage");
    break;
  case "free":
    await toFree();
    break;
  case "paid":
    toPaid();
    break;
  case "toggle":
    if (isFree(readSettings())) toPaid();
    else await toFree();
    break;
  case "usage":
    console.log(report(await getUsage({ maxAgeMs: 0 })));
    break;
  default:
    console.log("Usage: /omni [status|free|paid|toggle|usage]");
    process.exitCode = mode === "help" ? 0 : 1;
}

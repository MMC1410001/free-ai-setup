// Shared helpers for the free-ai-setup Node scripts. Pure Node 18+, no deps.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";
export const HOME = homedir();
export const ENV_PATH = join(ROOT, ".env");
export const STATE_DIR = join(ROOT, "state");
export const CLAUDE_DIR = process.env.CLAUDE_HOME_DIR || join(HOME, ".claude");

/** Forward slashes work for Node and for both Git Bash and PowerShell. */
export const slash = (p) => (IS_WIN ? p.replace(/\\/g, "/") : p);

// ── .env ────────────────────────────────────────────────────────────
export function readEnvFile(path = ENV_PATH) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Load .env into process.env without overriding values already set. */
export function loadEnv() {
  for (const [k, v] of Object.entries(readEnvFile())) {
    if (v && !process.env[k]) process.env[k] = v;
  }
}

/** Set KEY=value in .env, keeping comments and other lines. */
export function setEnvValue(key, value, path = ENV_PATH) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  const line = `${key}=${value}`;
  text = re.test(text) ? text.replace(re, line) : text.replace(/\s*$/, "\n") + line + "\n";
  writeFileSync(path, text, { mode: 0o600 });
  process.env[key] = value;
}

// ── gateway ─────────────────────────────────────────────────────────
export function gateway() {
  const host = process.env.OMNIROUTE_HOST || "127.0.0.1";
  const port = process.env.OMNIROUTE_PORT || "20128";
  return { host, port, base: `http://${host}:${port}` };
}

/** Key used by Claude Code for chat traffic. */
export const chatKey = () => process.env.OMNIROUTE_API_KEY || "";
/** Key with the "manage" scope, used for config and usage reads. */
export const adminKey = () => process.env.OMNIROUTE_ADMIN_KEY || process.env.OMNIROUTE_API_KEY || "";

export async function api(path, { method = "GET", body, key = adminKey(), timeoutMs = 15000 } = {}) {
  const { base } = gateway();
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, body: data };
}

export async function isUp(timeoutMs = 2500) {
  try {
    await fetch(gateway().base + "/", { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

// ── node + OmniRoute CLI ────────────────────────────────────────────
/**
 * A node path that survives a new shell. fnm hands out per-shell symlinks
 * under fnm_multishells that vanish; resolve those. Keep stable symlinks such
 * as /opt/homebrew/bin/node as they are, so a `brew upgrade` does not break us.
 */
export function stableNode() {
  const p = process.execPath;
  if (/fnm_multishells|\/T\/|\\Temp\\/.test(p)) {
    try { return realpathSync(p); } catch { /* fall through */ }
  }
  return p;
}

export const RUNTIME_DIR = join(ROOT, "runtime");
export const RUNTIME_CLI = join(RUNTIME_DIR, "node_modules", "omniroute", "bin", "omniroute.mjs");

/** Path to omniroute.mjs: source checkout, else the runtime/ install. */
export function omniCli() {
  const src = process.env.OMNIROUTE_SOURCE_DIR;
  if (src) return join(src, "bin", "omniroute.mjs");
  return RUNTIME_CLI;
}

/** Run the OmniRoute CLI. Returns { code, stdout, stderr }. */
export function omni(args, { input, inherit = false, env = {} } = {}) {
  const r = spawnSync(stableNode(), [omniCli(), ...args], {
    input,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    // The CLI sends OMNIROUTE_API_KEY to the server; it must be the admin key.
    env: { ...process.env, OMNIROUTE_API_KEY: adminKey(), OMNIROUTE_BASE_URL: gateway().base, ...env },
    timeout: 120000,
  });
  return { code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Parse the first JSON value in CLI output (it prints env notices first). */
export function parseJsonLoose(text) {
  // The CLI prints coloured notices (with "[" in ANSI codes) before the JSON.
  const i = text.search(/^[[{]/m);
  if (i < 0) return null;
  try { return JSON.parse(text.slice(i)); } catch { return null; }
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

export function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

export function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

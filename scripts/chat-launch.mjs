#!/usr/bin/env node
/**
 * Opens OmniRoute Chat in its own app window. Starts OmniRoute and the chat
 * server first when they are not running. Used by the desktop shortcuts.
 *
 *   node scripts/chat-launch.mjs [--no-open]
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { ROOT, HOME, IS_WIN, IS_MAC, loadEnv, isUp, gateway, omniCli, stableNode, ensureDir } from "./lib/common.mjs";

loadEnv();
const PORT = Number(process.env.OMNI_CHAT_PORT || 21128);
const URL_ = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logFile = () => openSync(join(ensureDir(join(HOME, ".omniroute", "logs")), "omniroute-chat.log"), "a");

async function chatUp() {
  try { return (await fetch(URL_ + "api/state", { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
}

function startDetached(args, env = {}) {
  const out = logFile();
  spawn(stableNode(), args, { detached: true, stdio: ["ignore", out, out], windowsHide: true, env: { ...process.env, ...env } }).unref();
}

async function waitFor(check, seconds) {
  for (let i = 0; i < seconds; i++) { if (await check()) return true; await sleep(1000); }
  return false;
}

if (!(await isUp())) {
  const { host, port } = gateway();
  const env = { OMNIROUTE_SERVER_HOST: host, PORT: port, OMNIROUTE_API_KEY: "", OMNIROUTE_ADMIN_KEY: "" };
  startDetached([omniCli(), "serve", "--no-tray", "--no-open"], env);
  await waitFor(isUp, 90);
}
if (!(await chatUp())) {
  startDetached([join(ROOT, "scripts", "chat-server.mjs")]);
  if (!(await waitFor(chatUp, 20))) { console.error("OmniRoute Chat did not start. Log: ~/.omniroute/logs/omniroute-chat.log"); process.exit(1); }
}
if (process.argv.includes("--no-open")) process.exit(0);

// Prefer an app window (no tabs or address bar); fall back to the default browser.
function openWindow() {
  if (IS_MAC) {
    for (const app of ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"]) {
      if (existsSync(`/Applications/${app}.app`) || existsSync(join(HOME, "Applications", `${app}.app`))) {
        return spawnSync("open", ["-na", app, "--args", `--app=${URL_}`]).status === 0 || spawnSync("open", [URL_]);
      }
    }
    return spawnSync("open", [URL_]);
  }
  if (IS_WIN) {
    const r = spawnSync("cmd", ["/c", "start", "", "msedge", `--app=${URL_}`], { windowsHide: true });
    if (r.status !== 0) spawnSync("cmd", ["/c", "start", "", URL_], { windowsHide: true });
    return;
  }
  for (const b of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    if (spawnSync("which", [b]).status === 0) return spawn(b, [`--app=${URL_}`], { detached: true, stdio: "ignore" }).unref();
  }
  spawn("xdg-open", [URL_], { detached: true, stdio: "ignore" }).unref();
}
openWindow();

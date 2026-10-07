#!/usr/bin/env node
/**
 * Kiro OAuth device login (optional provider: Claude Sonnet 4.5, free 50
 * credits per month).
 *
 * `omniroute providers auth kiro --social <x>` does not work in 3.8.51: the
 * CLI implements a redirect flow, the server a device flow, and the HTTP
 * methods are inverted on both endpoints, so it fails with 405. This drives
 * the real endpoints.
 *
 *   node scripts/kiro-login.mjs [google|github]
 */
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv, api, omni, gateway, IS_WIN, IS_MAC } from "./lib/common.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function openBrowser(url) {
  const [cmd, args] = IS_MAC ? ["open", [url]] : IS_WIN ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); } catch { /* URL is printed */ }
}

export async function kiroLogin(social = "github") {
  social = social.toLowerCase();
  if (!["google", "github"].includes(social)) throw new Error("choose google or github");

  const start = await api(`/api/oauth/kiro/social-authorize?provider=${social}`);
  if (!start.body?.authUrl) {
    throw new Error(`could not start Kiro login: ${JSON.stringify(start.body).slice(0, 200)}`);
  }
  const s = start.body;
  console.log(`\n  User code : ${s.userCode}`);
  console.log(`  Open      : ${s.authUrl}\n`);
  console.log(`  Sign in with ${social} in the browser and approve. Time limit: ${s.expiresIn}s.`);
  openBrowser(s.authUrl);

  const interval = Math.max((s.interval || 5) * 1000, 3000);
  const deadline = Date.now() + (s.expiresIn || 300) * 1000;
  process.stdout.write("  waiting");
  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await api("/api/oauth/kiro/social-exchange", {
      method: "POST",
      body: { deviceCode: s.deviceCode, provider: social },
    }).catch(() => ({ body: { status: "pending" } }));
    if (r.body?.success) {
      console.log("\n  ✓ Kiro connected");
      const act = omni(["providers", "edit", "kiro", "--active"]);
      console.log(act.code === 0 ? "  ✓ activated" : "  ! activate it in the dashboard: Providers → Kiro");
      return true;
    }
    if (r.body?.error && !/pending/i.test(JSON.stringify(r.body))) {
      throw new Error(JSON.stringify(r.body.error).slice(0, 200));
    }
    process.stdout.write(".");
  }
  throw new Error("timed out. Run it again to get a new code.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  kiroLogin(process.argv[2] || "github").catch((e) => {
    console.error(`\n✖ ${e?.message ?? e}\n  Is OmniRoute running at ${gateway().base}?`);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * Removes what install.mjs added. Your OmniRoute data (~/.omniroute) and the
 * setup folder stay, so you can delete them yourself or install again later.
 *
 *   node scripts/uninstall.mjs
 */
import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, IS_WIN, IS_MAC, HOME, CLAUDE_DIR, STATE_DIR, readJson, writeJson, loadEnv } from "./lib/common.mjs";
import { removeShortcuts } from "./lib/editor-shortcuts.mjs";

loadEnv();
const ok = (s) => console.log(`  ✓ ${s}`);

// 1. Put every project switched to free back to paid.
const projDir = join(STATE_DIR, "projects");
if (existsSync(projDir)) {
  for (const f of readdirSync(projDir)) {
    const { dir } = readJson(join(projDir, f), {});
    if (!dir || !existsSync(dir)) continue;
    spawnSync(process.execPath, [join(ROOT, "scripts", "omni-switch.mjs"), "paid", "--dir", dir], { stdio: "ignore" });
    ok(`paid mode restored: ${dir}`);
  }
}

// 2. Global /omni skill and status line.
rmSync(join(CLAUDE_DIR, "skills", "omni"), { recursive: true, force: true });
ok("removed the /omni skill");
for (const f of [join(CLAUDE_DIR, "settings.json")]) {
  const s = readJson(f, null);
  if (s?.statusLine?.command?.includes("statusline.mjs")) {
    delete s.statusLine;
    writeJson(f, s);
    ok(`removed the status line from ${f}`);
  }
}
rmSync(join(CLAUDE_DIR, "profiles", "omniroute"), { recursive: true, force: true });
ok("removed the claude-omni profile");

// 3. Editor switch shortcuts.
removeShortcuts({ ok });

// 4. Commands.
const bin = join(HOME, ".local", "bin");
for (const n of IS_WIN ? ["claude-omni.cmd", "omniroute.cmd"] : ["claude-omni", "omniroute"]) {
  try { unlinkSync(join(bin, n)); } catch { /* not there */ }
}
ok("removed the claude-omni and omniroute commands");

// 5. Chat app shortcuts.
const { rmSync: rm } = await import("node:fs");
if (IS_MAC) {
  rm(join(HOME, "Applications", "OmniRoute Chat.app"), { recursive: true, force: true });
  try { unlinkSync(join(HOME, "Desktop", "OmniRoute Chat.app")); } catch { /* none */ }
} else if (IS_WIN) {
  spawnSync("powershell", ["-NoProfile", "-Command",
    "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) 'OmniRoute Chat.lnk'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\OmniRoute Chat.lnk')"]);
} else {
  rm(join(HOME, ".local", "share", "applications", "omniroute-chat.desktop"), { force: true });
}
try { unlinkSync(join(bin, IS_WIN ? "omni-chat.cmd" : "omni-chat")); } catch { /* none */ }
ok("removed the OmniRoute Chat app shortcuts");

// 6. Autostart, then stop the server.
if (IS_WIN) {
  spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "scripts", "autostart-windows.ps1"), "uninstall"], { stdio: "inherit" });
} else {
  spawnSync("bash", [join(ROOT, "scripts", IS_MAC ? "autostart-mac.sh" : "autostart-linux.sh"), "uninstall"], { stdio: "inherit" });
}
const cli = join(ROOT, "runtime", "node_modules", "omniroute", "bin", "omniroute.mjs");
if (existsSync(cli)) spawnSync(process.execPath, [cli, "stop"], { stdio: "ignore", timeout: 30000 });
ok("OmniRoute stopped");

console.log(`
Done. Still on disk (delete them if you want):
  ${ROOT}            setup files, .env with your keys
  ${join(HOME, ".omniroute")}   OmniRoute data (providers, usage history)
`);

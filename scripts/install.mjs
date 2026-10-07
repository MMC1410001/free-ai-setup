#!/usr/bin/env node
/**
 * OmniRoute + Claude Code setup. macOS, Windows and Linux. Safe to run again.
 *
 *   node scripts/install.mjs [--yes] [--kiro|--no-kiro] [--no-autostart]
 *
 * --yes           no questions; NVIDIA_NIM_KEY must already be in .env or env
 * --kiro          also connect Kiro (browser login)   --no-kiro  skip Kiro
 * --no-autostart  do not start OmniRoute at login
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync, openSync, symlinkSync, unlinkSync, lstatSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import {
  ROOT, IS_WIN, IS_MAC, HOME, ENV_PATH, CLAUDE_DIR, RUNTIME_DIR, RUNTIME_CLI,
  loadEnv, setEnvValue, gateway, isUp, api, omni, omniCli, stableNode, slash,
  parseJsonLoose, ensureDir, readJson, writeJson, chatKey,
} from "./lib/common.mjs";
import { applyConfig } from "./apply-config.mjs";
import { kiroLogin, openBrowser } from "./kiro-login.mjs";
import { nvidiaKeyWorks, connectNvidia } from "./lib/providers.mjs";

const args = new Set(process.argv.slice(2));
const YES = args.has("--yes") || args.has("-y");
const KIRO = args.has("--kiro") ? "yes" : args.has("--no-kiro") ? "no" : "ask";
const AUTOSTART = !args.has("--no-autostart");

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const say = (s) => console.log(`\n${B(s)}`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const die = (s) => { console.error(`  \x1b[31m✖\x1b[0m ${s}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── prompts ─────────────────────────────────────────────────────────
async function ask(question, { secret = false, def = "" } = {}) {
  if (YES) return def;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (secret) {
    rl._writeToOutput = (s) => rl.output.write(/\r|\n/.test(s) ? s : s.startsWith(question) ? s : "*");
  }
  const answer = await new Promise((r) => rl.question(question, r));
  rl.close();
  if (secret) process.stdout.write("\n");
  return answer.trim() || def;
}
const yesNo = async (q, def = false) => /^y/i.test(await ask(`${q} ${def ? "[Y/n]" : "[y/N]"} `, { def: def ? "y" : "n" }));

// ── steps ───────────────────────────────────────────────────────────
function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 22)) {
    die(`Node ${process.versions.node} is too old. Install Node 24 LTS from https://nodejs.org and run the installer again.`);
  }
  ok(`Node ${process.versions.node}`);
}

function prepareEnv() {
  if (!existsSync(ENV_PATH)) {
    copyFileSync(join(ROOT, ".env.example"), ENV_PATH);
    ok("created .env");
  }
  loadEnv();
}

function installOmniRoute() {
  say("1/8  OmniRoute");
  if (process.env.OMNIROUTE_SOURCE_DIR) {
    if (!existsSync(omniCli())) die(`OMNIROUTE_SOURCE_DIR has no bin/omniroute.mjs: ${process.env.OMNIROUTE_SOURCE_DIR}`);
    return ok(`using source checkout ${process.env.OMNIROUTE_SOURCE_DIR}`);
  }
  const had = existsSync(RUNTIME_CLI);
  const npm = IS_WIN ? "npm.cmd" : "npm";
  if (had) {
    const latest = spawnSync(`${npm} view omniroute version`, { shell: true, encoding: "utf8" }).stdout.trim();
    const current = readJson(join(RUNTIME_DIR, "node_modules", "omniroute", "package.json"), {}).version;
    if (!latest || latest === current) return ok(`OmniRoute ${current} (up to date)`);
    console.log(`  updating OmniRoute ${current} -> ${latest} ...`);
  } else {
    console.log("  installing OmniRoute with npm. This takes about 5 minutes and uses about 2.5 GB.");
  }
  ensureDir(RUNTIME_DIR);
  const r = spawnSync(`${npm} install --prefix "${RUNTIME_DIR}" omniroute@latest --no-audit --no-fund --loglevel=error --no-update-notifier`, {
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0 || !existsSync(RUNTIME_CLI)) {
    if (had) return warn("update failed; keeping the installed version");
    die("npm install omniroute failed. Check your internet connection and run the installer again.");
  }
  const v = omni(["--version"]).stdout.trim().split(/\r?\n/).pop();
  ok(`OmniRoute ${v}`);
}

/** Browser libraries for the chat app (markdown, PDF, Word, Excel readers). */
function installChatLibs() {
  const dir = join(RUNTIME_DIR, "ui");
  if (existsSync(join(dir, "node_modules", "xlsx", "dist", "xlsx.full.min.js"))) return;
  ensureDir(dir);
  const npm = IS_WIN ? "npm.cmd" : "npm";
  const pkgs = "marked@12.0.2 dompurify@3.1.6 pdfjs-dist@3.11.174 mammoth@1.6.0 xlsx@0.18.5";
  const r = spawnSync(`${npm} install --prefix "${dir}" ${pkgs} --no-audit --no-fund --loglevel=error --no-update-notifier`, { stdio: "inherit", shell: true });
  if (r.status === 0) ok("chat app file readers installed");
  else warn("chat app file readers not installed; the app will load them from the internet");
}

function serverEnv() {
  const { host, port } = gateway();
  const env = { ...process.env, OMNIROUTE_SERVER_HOST: host, PORT: port };
  for (const k of ["OMNIROUTE_API_KEY", "OMNIROUTE_ADMIN_KEY", "NVIDIA_NIM_KEY"]) delete env[k];
  return env;
}

function installAutostart() {
  const env = { ...process.env, OMNI_NODE: stableNode(), OMNI_CLI: omniCli() };
  let r;
  if (IS_WIN) {
    r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "scripts", "autostart-windows.ps1"),
      "install", "-Node", stableNode(), "-Cli", omniCli()], { stdio: "inherit", env });
  } else {
    r = spawnSync("bash", [join(ROOT, "scripts", IS_MAC ? "autostart-mac.sh" : "autostart-linux.sh"), "install"], { stdio: "inherit", env });
  }
  if (r.status !== 0) warn("autostart was not installed; OmniRoute will need a manual start after a restart");
  return r.status === 0;
}

async function startServer() {
  say("2/8  Start OmniRoute");
  const { base } = gateway();
  if (await isUp()) return ok(`already running at ${base}`);
  const started = AUTOSTART && installAutostart();
  if (!started || !(await waitUp(20))) {
    const logDir = ensureDir(join(HOME, ".omniroute", "logs"));
    const out = openSync(join(logDir, "free-ai-setup.log"), "a");
    spawn(stableNode(), [omniCli(), "serve", "--no-tray", "--no-open"], {
      detached: true, stdio: ["ignore", out, out], env: serverEnv(), windowsHide: true,
    }).unref();
  }
  if (!(await waitUp(120))) die(`OmniRoute did not start. Log: ${join(HOME, ".omniroute", "logs")}`);
  ok(`running at ${base}`);
}

async function waitUp(seconds) {
  for (let i = 0; i < seconds; i += 2) {
    if (await isUp()) return true;
    await sleep(2000);
  }
  return false;
}

function createKey(name, scopes) {
  const body = JSON.stringify({ name, scopes });
  const r = omni(["api", "api-keys", "post-api-keys", "--body", body, "--output", "json"]);
  const data = parseJsonLoose(r.stdout);
  return data?.key && data.key.startsWith("sk-") ? data.key : null;
}

async function ensureKeys() {
  say("3/8  Gateway keys");
  if (!process.env.OMNIROUTE_ADMIN_KEY) {
    // An older .env may hold one key with the manage scope; keep using it.
    const k = createKey("free-ai-setup admin", ["manage"]);
    if (k) { setEnvValue("OMNIROUTE_ADMIN_KEY", k); ok("admin key created"); }
  } else ok("admin key present");
  if (!chatKey()) {
    const k = createKey("claude-code", []);
    if (k) { setEnvValue("OMNIROUTE_API_KEY", k); ok("Claude Code key created"); }
  } else ok("Claude Code key present");

  if (!chatKey()) {
    warn("Could not create the keys automatically.");
    if (YES) die("run the installer without --yes to paste a key by hand");
    console.log(`  Open ${gateway().base} → API Keys → Create (enable the "manage" scope).`);
    openBrowser(gateway().base);
    const k = await ask("  Paste the key (sk-...): ", { secret: true });
    if (!k.startsWith("sk-")) die("no key given");
    setEnvValue("OMNIROUTE_API_KEY", k);
  }
  const check = await api("/api/providers");
  if (!check.ok) die(`the admin key is not accepted (HTTP ${check.status}). Delete OMNIROUTE_ADMIN_KEY from ${ENV_PATH} and run again.`);
}

async function ensureNvidia() {
  say("4/8  NVIDIA NIM (required, free)");
  const conns = (await api("/api/providers")).body?.connections || [];
  if (conns.some((c) => c.provider === "nvidia")) return ok("NVIDIA NIM already connected");

  let key = process.env.NVIDIA_NIM_KEY || "";
  for (let attempt = 0; ; attempt++) {
    if (!key) {
      if (YES) die("NVIDIA_NIM_KEY is empty. Put it in .env or the environment.");
      console.log(`
  You need a free NVIDIA API key (starts with nvapi-):
    1. Open https://build.nvidia.com and sign in or create an account.
    2. Open any model page and click "Get API Key" (or Profile → API Keys).
    3. Click "Generate Key" and copy it.`);
      if (attempt === 0) openBrowser("https://build.nvidia.com");
      key = await ask("  Paste your NVIDIA API key: ", { secret: true });
    }
    if (!key) die("no NVIDIA key given");
    if (!key.startsWith("nvapi-")) warn("NVIDIA keys usually start with nvapi-");
    const works = await nvidiaKeyWorks(key);
    if (works === false) {
      warn("NVIDIA rejected this key. Check it and paste it again.");
      key = "";
      if (YES || attempt >= 2) die("NVIDIA key not accepted");
      continue;
    }
    if (works === null) warn("could not reach NVIDIA to check the key; continuing");
    break;
  }
  try { await connectNvidia(key); } catch (e) { die(e.message); }
  ok("NVIDIA NIM connected");
}

async function maybeKiro() {
  say("5/8  Kiro (optional, adds Claude Sonnet 4.5)");
  const conns = (await api("/api/providers")).body?.connections || [];
  if (conns.some((c) => c.provider === "kiro")) return ok("Kiro already connected");
  let want = KIRO === "yes";
  if (KIRO === "ask") {
    console.log("  Kiro gives 50 free credits per month for Claude Sonnet 4.5. It needs a");
    console.log("  Google or GitHub sign-in in the browser. You can skip it and add it later.");
    want = await yesNo("  Connect Kiro now?", false);
  }
  if (!want) return ok(`skipped. Add later: node "${join(ROOT, "scripts", "kiro-login.mjs")}" github`);
  const social = /^g(o|$)/i.test(await ask("  Sign in with github or google? [github] ", { def: "github" })) ? "google" : "github";
  try { await kiroLogin(social); } catch (e) { warn(`Kiro login failed: ${e.message}. You can run it later.`); }
}

function writeSkill() {
  const node = IS_WIN ? "node" : stableNode();
  const tmpl = readFileSync(join(ROOT, "skill", "SKILL.md.tmpl"), "utf8");
  const md = tmpl
    .replaceAll("__NODE_RULE__", IS_WIN ? "node" : node)
    .replaceAll("__NODE__", IS_WIN ? "node" : `"${node}"`)
    .replaceAll("__SCRIPT__", slash(join(ROOT, "scripts", "omni-switch.mjs")));
  const dir = ensureDir(join(CLAUDE_DIR, "skills", "omni"));
  writeFileSync(join(dir, "SKILL.md"), md);
  ok(`/omni skill for all projects: ${dir}`);
}

function setStatusLine(settingsPath) {
  const s = readJson(settingsPath, {});
  const node = IS_WIN ? "node" : `"${stableNode()}"`;
  const command = `${node} "${slash(join(ROOT, "scripts", "statusline.mjs"))}"`;
  const current = s.statusLine?.command || "";
  if (current && !current.includes("statusline.mjs")) {
    return warn(`kept your own status line in ${settingsPath}`);
  }
  s.statusLine = { type: "command", command, padding: 0, refreshInterval: 60 };
  writeJson(settingsPath, s);
  ok(`status line: ${settingsPath}`);
}

function writeProfile() {
  const { host, port } = gateway();
  const profile = process.env.CLAUDE_PROFILE_DIR || join(CLAUDE_DIR, "profiles", "omniroute");
  ensureDir(profile);
  const tmpl = readFileSync(join(ROOT, "claude-profile", "settings.json.template"), "utf8");
  const file = join(profile, "settings.json");
  const fresh = JSON.parse(tmpl.replaceAll("__HOST__", host).replaceAll("__PORT__", port));
  const old = readJson(file, {});
  writeJson(file, { ...old, ...fresh, env: { ...(old.env || {}), ...fresh.env } });
  setStatusLine(file);
  ok(`claude-omni profile: ${profile}`);
}

function installCommands() {
  const bin = ensureDir(join(HOME, ".local", "bin"));
  const node = stableNode();
  if (IS_WIN) {
    writeFileSync(join(bin, "claude-omni.cmd"),
      `@echo off\r\npowershell -ExecutionPolicy Bypass -NoProfile -File "${join(ROOT, "scripts", "claude-omni.ps1")}" %*\r\n`);
    writeFileSync(join(bin, "omniroute.cmd"), `@echo off\r\n"${node}" "${omniCli()}" %*\r\n`);
    const ps = `$p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; ` +
      `if(($p -split ';') -notcontains '${bin}'){[Environment]::SetEnvironmentVariable('Path',($p.TrimEnd(';')+';${bin}').TrimStart(';'),'User'); 'added'}`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
    if (/added/.test(r.stdout || "")) warn(`added ${bin} to your PATH; open a NEW terminal to use the commands`);
  } else {
    const link = join(bin, "claude-omni");
    try { if (lstatSync(link)) unlinkSync(link); } catch { /* none */ }
    symlinkSync(join(ROOT, "scripts", "claude-omni.sh"), link);
    chmodSync(join(ROOT, "scripts", "claude-omni.sh"), 0o755);
    const w = join(bin, "omniroute");
    writeFileSync(w, `#!/bin/sh\nexec "${node}" "${omniCli()}" "$@"\n`, { mode: 0o755 });
    const line = `export PATH="$HOME/.local/bin:$PATH"  # free-ai-setup`;
    const rcs = IS_MAC ? [".zshrc", ".bash_profile"] : [".bashrc", ".zshrc"];
    for (const rc of rcs) {
      const f = join(HOME, rc);
      if (!existsSync(f) && rc !== rcs[0]) continue;
      const text = existsSync(f) ? readFileSync(f, "utf8") : "";
      if (!text.includes(".local/bin")) writeFileSync(f, text + (text.endsWith("\n") || !text ? "" : "\n") + line + "\n");
    }
  }
  ok(`commands: claude-omni, omniroute (${bin})`);
}

async function claudeIntegration() {
  say("7/8  Claude Code (unchanged; adds /omni and claude-omni)");
  writeSkill();
  setStatusLine(join(CLAUDE_DIR, "settings.json"));
  writeProfile();
  installCommands();
  if (spawnSync(IS_WIN ? "where" : "which", ["claude"], { encoding: "utf8" }).status !== 0) {
    warn("the claude command is not installed. The VS Code extension works without it.");
    console.log(IS_WIN ? "    CLI install:  irm https://claude.ai/install.ps1 | iex" : "    CLI install:  curl -fsSL https://claude.ai/install.sh | bash");
  }
}

function installChatApp() {
  say("8/8  OmniRoute Chat (app for everyone)");
  const node = stableNode();
  const launcher = join(ROOT, "scripts", "chat-launch.mjs");
  const bin = ensureDir(join(HOME, ".local", "bin"));
  if (IS_MAC) {
    const app = join(HOME, "Applications", "OmniRoute Chat.app");
    ensureDir(join(app, "Contents", "MacOS"));
    ensureDir(join(app, "Contents", "Resources"));
    writeFileSync(join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>OmniRoute Chat</string>
  <key>CFBundleDisplayName</key><string>OmniRoute Chat</string>
  <key>CFBundleIdentifier</key><string>local.omniroute.chat</string>
  <key>CFBundleExecutable</key><string>OmniRoute Chat</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);
    const exe = join(app, "Contents", "MacOS", "OmniRoute Chat");
    writeFileSync(exe, `#!/bin/sh\nexec "${node}" "${launcher}"\n`, { mode: 0o755 });
    makeMacIcon(join(app, "Contents", "Resources", "icon.icns"));
    const desk = join(HOME, "Desktop", "OmniRoute Chat.app");
    try { if (lstatSync(desk)) unlinkSync(desk); } catch { /* none */ }
    let onDesk = true;
    try { symlinkSync(app, desk); } catch { onDesk = false; /* no Desktop folder, or it is protected */ }
    ok(`app: ${app}${onDesk ? " (also on the Desktop)" : ""}`);
  } else if (IS_WIN) {
    const vbs = join(ROOT, "scripts", "chat-launch.vbs");
    writeFileSync(vbs, `Set sh = CreateObject("WScript.Shell")\r\nsh.Run """${node}"" ""${launcher}""", 0, False\r\n`);
    const ico = join(ROOT, "ui", "icon.ico");
    const ps = [
      "$sh = New-Object -ComObject WScript.Shell",
      `foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'))) {`,
      "  $l = $sh.CreateShortcut((Join-Path $dir 'OmniRoute Chat.lnk'))",
      `  $l.TargetPath = "$env:WINDIR\\System32\\wscript.exe"`,
      `  $l.Arguments = '"${vbs}"'`,
      `  if (Test-Path '${ico}') { $l.IconLocation = '${ico}' }`,
      "  $l.Description = 'Chat with free AI models through OmniRoute'",
      "  $l.Save()",
      "}",
    ].join("\n");
    const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { encoding: "utf8" });
    if (r.status === 0) ok("shortcuts: Desktop and Start menu → OmniRoute Chat");
    else warn(`could not create shortcuts: ${(r.stderr || "").slice(0, 200)}`);
  } else {
    const dir = ensureDir(join(HOME, ".local", "share", "applications"));
    writeFileSync(join(dir, "omniroute-chat.desktop"),
      `[Desktop Entry]\nType=Application\nName=OmniRoute Chat\nExec="${node}" "${launcher}"\nIcon=${join(ROOT, "ui", "icon.svg")}\nTerminal=false\nCategories=Office;\n`);
    ok("app menu entry: OmniRoute Chat");
  }
  if (IS_WIN) writeFileSync(join(bin, "omni-chat.cmd"), `@echo off\r\n"${node}" "${launcher}" %*\r\n`);
  else writeFileSync(join(bin, "omni-chat"), `#!/bin/sh\nexec "${node}" "${launcher}" "$@"\n`, { mode: 0o755 });
  installChatLibs();
  ok("command: omni-chat");
}

/** Build a .icns from ui/icon-1024.png with macOS tools. Optional: a plain icon is fine. */
function makeMacIcon(dest) {
  try {
    const png = join(ROOT, "ui", "icon-1024.png");
    const set = ensureDir(join(ROOT, "state", "icon.iconset"));
    for (const n of [16, 32, 128, 256, 512]) {
      spawnSync("sips", ["-z", String(n), String(n), png, "--out", join(set, `icon_${n}x${n}.png`)], { stdio: "ignore" });
      spawnSync("sips", ["-z", String(n * 2), String(n * 2), png, "--out", join(set, `icon_${n}x${n}@2x.png`)], { stdio: "ignore" });
    }
    spawnSync("iconutil", ["-c", "icns", set, "-o", dest], { stdio: "ignore" });
  } catch { /* keep the default icon */ }
}

async function smokeTest() {
  console.log("\n  Test request through OmniRoute...");
  try {
    const r = await api("/v1/chat/completions", {
      method: "POST",
      key: chatKey(),
      timeoutMs: 120000,
      body: { model: "default", max_tokens: 600, messages: [{ role: "user", content: "Reply with the word OK only." }] },
    });
    const msg = r.body?.choices?.[0]?.message || {};
    const text = msg.content || msg.reasoning_content || msg.reasoning;
    if (r.ok && text) ok(`answer from ${r.body.model || "default"}: ${String(text).trim().replace(/\s+/g, " ").slice(0, 40)}`);
    else warn(`test request failed (HTTP ${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
  } catch (e) {
    warn(`test request failed: ${e.message}`);
  }
}

// ── main ────────────────────────────────────────────────────────────
console.log(B("\nOmniRoute setup for Claude Code"));
console.log(`  folder: ${ROOT}`);
checkNode();
prepareEnv();
installOmniRoute();
await startServer();
await ensureKeys();
await ensureNvidia();
await maybeKiro();
say("6/8  Routing config");
try { await applyConfig({ log: (s) => console.log("  " + s) }); } catch (e) { die(e.message); }
await claudeIntegration();
installChatApp();
await smokeTest();

const { base } = gateway();
console.log(`
${B("Done.")}
  Chat app (no terminal needed): open "OmniRoute Chat" from the
  ${IS_MAC ? "Desktop or Applications folder" : IS_WIN ? "Desktop or Start menu" : "app menu"}, or run: omni-chat

  Claude Code (VS Code chat or terminal), in any project:
    /omni free     use free OmniRoute in this project
    /omni paid     go back to your paid Claude
    /omni usage    tokens used and free allowance left
  After /omni free or /omni paid, reload the VS Code window.
  Terminal: claude-omni (free)  |  claude (paid, unchanged)

  Dashboard (advanced): ${base}
`);
if (!YES && (await yesNo("Open OmniRoute Chat now?", true))) {
  spawnSync(stableNode(), [join(ROOT, "scripts", "chat-launch.mjs")], { stdio: "inherit" });
}

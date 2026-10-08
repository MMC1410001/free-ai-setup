// Keyboard shortcuts that switch the open project between paid and free, in
// every VS Code-family editor found (VS Code, Cursor, Kiro, Antigravity, ...).
// They need no Claude at all, so they still work after the paid plan runs out
// and /omni can no longer answer.
//
//   macOS          Ctrl+Option+Cmd+F  free    Ctrl+Option+Cmd+P  paid
//   Windows/Linux  Ctrl+Alt+Shift+F   free    Ctrl+Alt+Shift+P   paid
//
// Each shortcut runs a user-level task (works in any folder), stored in the
// editor's User/tasks.json. Entries are written one per line and found by
// label, so install and remove edit only our lines and keep the user's own
// entries and comments (both files are JSON with comments).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, IS_WIN, IS_MAC, HOME, stableNode } from "./common.mjs";

const EDITORS = ["Code", "Code - Insiders", "Cursor", "Kiro", "Antigravity", "Windsurf"];
const LABEL = { free: "OmniRoute: switch to FREE", paid: "OmniRoute: switch to PAID" };
const MOD = IS_MAC ? "ctrl+alt+cmd" : "ctrl+alt+shift";
export const KEYS_HINT = IS_MAC ? "Ctrl+Option+Cmd+F (free) / +P (paid)" : "Ctrl+Alt+Shift+F (free) / +P (paid)";

function userDirs() {
  const base = IS_WIN ? process.env.APPDATA
    : IS_MAC ? join(HOME, "Library", "Application Support")
    : process.env.XDG_CONFIG_HOME || join(HOME, ".config");
  return EDITORS.filter((e) => existsSync(join(base, e))).map((e) => ({ name: e, dir: join(base, e, "User") }));
}

function task(mode) {
  const script = join(ROOT, "scripts", "omni-switch.mjs");
  const command = IS_WIN
    ? `node "${script}" ${mode} --dir "\${workspaceFolder}"`
    : `"${stableNode()}" "${script}" ${mode} --dir "\${workspaceFolder}" && bash "${join(ROOT, "scripts", "vscode-reload.sh")}"`;
  return { label: LABEL[mode], type: "shell", command, problemMatcher: [], presentation: { reveal: "always", panel: "shared", clear: true } };
}

/** Our entries, one JSON object per line, so stripOurs can find them again. */
const oneLine = (entries) => entries.map((e) => "    " + JSON.stringify(e)).join(",\n");

const binding = (mode) => ({ key: `${MOD}+${mode[0]}`, command: "workbench.action.tasks.runTask", args: LABEL[mode] });

/** Drop our one-line entries, then any comma left dangling before a closing bracket. */
function stripOurs(text) {
  const kept = text.split("\n").filter((l) => !Object.values(LABEL).some((lab) => l.includes(`"${lab}"`)));
  return kept.join("\n").replace(/,(\s*\n\s*\])/g, "$1");
}

/** Insert one-line entries right after the array opened by `opener` (a regex). */
function insertAfter(text, opener, entries) {
  const m = opener.exec(text);
  if (!m) return null;
  const at = m.index + m[0].length;
  const rest = text.slice(at).replace(/^\r?\n/, "");
  const lines = oneLine(entries);
  return text.slice(0, at) + "\n" + lines + (/^\s*\]/.test(rest) ? "\n" : ",\n") + rest;
}

/** Insert one-line entries just before the last closing bracket (later key bindings win). */
function insertAtEnd(text, entries) {
  const at = text.lastIndexOf("]");
  if (at < 0) return null;
  const head = text.slice(0, at).replace(/\s*$/, "");
  const lines = oneLine(entries);
  return head + (/[[,]$/.test(head) ? "" : ",") + "\n" + lines + "\n" + text.slice(at);
}

function upsert(file, fresh, insert, entries) {
  if (!existsSync(file)) { writeFileSync(file, fresh); return true; }
  const out = insert(stripOurs(readFileSync(file, "utf8")), entries);
  if (out == null) return false;
  writeFileSync(file, out);
  return true;
}

export function installShortcuts({ ok = console.log, warn = console.log } = {}) {
  const editors = userDirs();
  if (!editors.length) return warn("no VS Code-family editor found; skipped the switch shortcuts");
  for (const { name, dir } of editors) {
    mkdirSync(dir, { recursive: true });
    const tasks = [task("free"), task("paid")];
    const keys = [binding("free"), binding("paid")];
    const t = upsert(join(dir, "tasks.json"),
      `{\n  "version": "2.0.0",\n  "tasks": [\n${oneLine(tasks)}\n  ]\n}\n`, (s, e) => insertAfter(s, /"tasks"\s*:\s*\[/, e), tasks);
    const k = upsert(join(dir, "keybindings.json"),
      `// Place your key bindings in this file to override the defaults\n[\n${oneLine(keys)}\n]\n`,
      insertAtEnd, keys);
    if (t && k) ok(`${name}: switch shortcuts ${KEYS_HINT}`);
    else warn(`${name}: could not read ${t ? "keybindings.json" : "tasks.json"}; skipped the shortcuts`);
  }
}

export function removeShortcuts({ ok = console.log } = {}) {
  for (const { name, dir } of userDirs()) {
    for (const f of ["tasks.json", "keybindings.json"]) {
      const file = join(dir, f);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      const out = stripOurs(text);
      if (out !== text) writeFileSync(file, out);
    }
    ok(`${name}: removed the switch shortcuts`);
  }
}

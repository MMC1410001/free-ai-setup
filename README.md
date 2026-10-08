# free-ai-setup

Free AI chat and a free fallback for Claude Code, through the open-source [OmniRoute](https://github.com/diegosouzapw/OmniRoute) gateway. One installer for **macOS and Windows** (Linux works too). You only need a free NVIDIA account.

You get two things:

| For | What | How you open it |
| --- | --- | --- |
| Everyone (no terminal) | **OmniRoute Chat**: a ChatGPT-style app. Images, PDF, Word, Excel and text files. Model choice, usage, daily limit, keys. | Desktop / Applications / Start menu → **OmniRoute Chat** |
| Developers | **Claude Code free mode**: `/omni free` in any project, `claude-omni` in a terminal. Your paid `claude` stays exactly as it is. | VS Code chat or terminal |

The user guide (Word) and the video script are in [`docs/`](docs/).

---

## Install

**1. Get a free NVIDIA API key.** Open <https://build.nvidia.com>, sign in or create an account, click **Get API Key**, then **Generate Key**. Copy the key (it starts with `nvapi-`).

**2. Run one command.**

macOS (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/MMC1410001/free-ai-setup/main/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/MMC1410001/free-ai-setup/main/install.ps1 | iex
```

Or download the repo as a ZIP, unzip it and double-click **`Install-Mac.command`** or **`Install-Windows.cmd`**.

- macOS may say the file is from an unidentified developer: right-click it → **Open** → **Open**.
- Windows SmartScreen may show "Windows protected your PC": click **More info** → **Run anyway**.

**3. Answer the questions.** Paste your NVIDIA key. Say yes or no to Kiro (optional). Done.

The installer takes about 5–10 minutes the first time (OmniRoute is about 2.5 GB). It installs Node.js 24 if it is missing. It is safe to run again; a second run updates OmniRoute and repairs the setup.

Options (add after `bash -s --` on macOS, or to `install.ps1` on Windows):

| Option | Effect |
| --- | --- |
| `--kiro` / `--no-kiro` | Connect Kiro now, or skip the question |
| `--no-autostart` | Do not start OmniRoute at login |
| `--yes` | No questions (`NVIDIA_NIM_KEY` must be in the environment) |
| `--uninstall` | Remove the setup (see below) |

---

## Daily use

### OmniRoute Chat (everyone)

Open **OmniRoute Chat**. It starts OmniRoute when needed and opens in its own window.

- Type a message, or drop or paste files and images into the box.
- **Model** (top right): *Auto · best free model* tries the free models in order. *Auto · for images* uses models that can read images (chosen automatically when you attach an image).
- **Settings, keys and limits** (bottom left): NVIDIA key, Kiro sign-in, usage, your own daily token limit, model order, instructions for the AI.
- Chats are saved in this browser only.

Command: `omni-chat`. Address: <http://127.0.0.1:21128>.

### Claude Code (developers)

In any project, in the VS Code chat or the terminal:

| Command | Effect |
| --- | --- |
| `/omni free` | This project uses free OmniRoute |
| `/omni paid` | This project goes back to your paid Claude |
| `/omni usage` | Tokens used today and this month, free allowance left |
| `/omni` or `/omni status` | Show the mode |

After `/omni free` or `/omni paid`, reload the VS Code window (**Cmd/Ctrl+Shift+P → Developer: Reload Window**). The first message before the reload can show an error; the switch is already done.

**Start a new conversation after switching to free** (`/clear`). The free models hold at most 128K tokens, so a long paid conversation is too big for them, even to compact.

**Paid plan used up?** `/omni` needs Claude to answer, so it cannot run once your paid usage is gone. Use the keyboard shortcuts instead. The installer adds them to VS Code, Cursor, Kiro, Antigravity and Windsurf; they work in any project and switch and reload in one step:

| | macOS | Windows / Linux |
| --- | --- | --- |
| Switch to free | `Ctrl+Option+Cmd+F` | `Ctrl+Alt+Shift+F` |
| Switch to paid | `Ctrl+Option+Cmd+P` | `Ctrl+Alt+Shift+P` |

No shortcut? **Cmd/Ctrl+Shift+P → Tasks: Run Task → OmniRoute: switch to FREE**. Windows does not reload by itself; reload the window after the switch.

`/omni free` adds OmniRoute keys to `.claude/settings.local.json` in that project and adds that file to `.gitignore`. `/omni paid` removes only those keys and puts back the values they replaced, so your permissions, your paid model and other settings stay. Running `/omni free` again refreshes the keys.

Free mode sets three things besides the gateway address and key:

- **Model `free-chain`.** The VS Code extension sends the `model` from your settings, so without this the paid model (for example Opus) would go to OmniRoute. It is not called `default`: Claude Code reads that as an alias for your plan's default model.
- **Compaction at 100K tokens**, under the 128K window of the NVIDIA models.
- **claude.ai connectors off** (Slack, Notion and so on). Their tool definitions alone take about 40K tokens.

Terminal: `claude-omni` runs Claude Code through OmniRoute with its own profile. `claude` is your normal paid Claude Code, unchanged.

**Status line** (terminal Claude Code): `FREE · OmniRoute | context 12% | today 1.2M tok · 48 req | Kiro 4.3/50 credits left | NVIDIA 40 req/min`. In paid mode it shows your plan's 5-hour and weekly use (Pro/Max).

---

## What is free

| Provider | Free allowance | Notes |
| --- | --- | --- |
| **NVIDIA NIM** (required) | No token cap. About **40 requests per minute**. | NVIDIA Developer Program. For prototyping, research, development and testing, not production. About 80 models (Nemotron, DeepSeek, GLM, Kimi, Llama vision…). |
| **Kiro** (optional) | **50 credits per month**, reset on the 1st. | Claude Sonnet 4.5, Claude Haiku 4.5, Qwen3 Coder Next, GLM-5. Credits go fast with long Claude Code sessions; OmniRoute then falls back to NVIDIA. |
| OmniRoute | Free, open source (MIT). No limits of its own. | Its catalog lists many other free providers (about 1.5 billion documented free tokens per month across 34 pools, September 2026). Add them in the dashboard if you want; check each provider's terms. |

See usage at any time: OmniRoute Chat sidebar, Settings → Usage and limits, `/omni usage`, the status line, or the dashboard (<http://127.0.0.1:20128> → Usage).

---

## How it works

```
OmniRoute Chat ─┐
Claude Code ────┼──▶  OmniRoute (127.0.0.1:20128) ──▶ Kiro (optional) ──▶ NVIDIA NIM
claude-omni ────┘         combo "default" (text) / "vision" (images), auto-fallback
```

- Everything runs on your computer and listens on 127.0.0.1 only.
- The installer keeps all files in `~/.free-ai-setup` (Windows: `%USERPROFILE%\.free-ai-setup`), including `.env` with your keys. OmniRoute's data is in `~/.omniroute`.
- Free mode asks for the model `free-chain`, which OmniRoute maps to the `default` combo.
- Claude Code sends real Claude model names (for example `claude-opus-5-5`) when a chat switches mode midway. OmniRoute maps `claude-*` to the `default` combo too, so that does not fail with "Unable to determine provider".

## What's in here

| Path | Purpose |
| --- | --- |
| `install.sh`, `install.ps1` | Bootstrap: install Node if needed, fetch these files, run `scripts/install.mjs` |
| `Install-Mac.command`, `Install-Windows.cmd` | Double-click installers |
| `scripts/install.mjs` | The installer (all platforms) |
| `scripts/uninstall.mjs` | Undo the installer |
| `scripts/omni-switch.mjs` | `/omni` logic: status, free, paid, toggle, usage |
| `scripts/lib/editor-shortcuts.mjs` | Adds and removes the paid/free keyboard shortcuts in VS Code-family editors |
| `skill/SKILL.md.tmpl` | The global `/omni` skill (installed to `~/.claude/skills/omni`) |
| `scripts/statusline.mjs` | Claude Code status line with token use |
| `scripts/chat-server.mjs`, `ui/` | OmniRoute Chat (server and page) |
| `scripts/chat-launch.mjs` | Starts what is needed and opens the chat window |
| `scripts/apply-config.mjs` | Applies `config/` to OmniRoute (idempotent) |
| `config/combo.default.json`, `config/combo.vision.json` | Model order for text and for images |
| `config/model-mappings.json` | Model names that go to the `default` combo (`free-chain`, `claude-*`) |
| `config/settings.json` | Free-only lock |
| `scripts/kiro-login.mjs` | Kiro browser login (the built-in CLI command is broken in 3.8.51) |
| `scripts/autostart-*.{sh,ps1}` | Start OmniRoute at login (launchd, Scheduled Task, systemd) |
| `scripts/claude-omni.{sh,ps1}` | The `claude-omni` command |
| `.vscode/tasks.json` | VS Code tasks for this repo: Use PAID, Use FREE, Show mode |

---

## Update and uninstall

Update: run the install command again.

Uninstall:

```bash
bash ~/.free-ai-setup/install.sh --uninstall                              # macOS
```
```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.free-ai-setup\install.ps1" --uninstall   # Windows
```

This puts every project back to paid mode and removes `/omni`, the status line, the `claude-omni` profile, the editor switch shortcuts, the commands, the chat shortcuts and autostart. It keeps `~/.free-ai-setup` (with `.env`) and `~/.omniroute` (OmniRoute data) so you can delete them yourself.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Chat says "OmniRoute is not running" | Open OmniRoute Chat again (it starts OmniRoute), or run `omniroute serve --no-tray --no-open --daemon`. |
| "Too many requests" | NVIDIA allows about 40 requests per minute. Wait a minute. |
| "This chat is too long" | Start a new chat. The NVIDIA models have a 128k-token window. |
| A PDF gives no text | It is a scan. Send pages as images instead. |
| `/omni` not found in Claude Code | Run the installer again, then restart VS Code. On Windows, restart VS Code after Node.js is installed so `node` is on PATH. |
| 400 "Unable to determine provider for model 'claude-…'" | Run the installer again (it adds the `claude-*` mapping). |
| Free mode still shows Opus, or 400 "Ambiguous model 'claude-opus-5'" | The project was switched by an older version. Run `/omni free` again (or the shortcut), then reload the window. Run the installer again if OmniRoute does not know `free-chain`. |
| "Input exceeds context window … limit 128000" / "automatic compaction failed" | The conversation is bigger than the free models can take, often because it grew on paid first. Start a new conversation (`/clear`). |
| `providers auth kiro` → 405 | Upstream bug in 3.8.51. Use Settings → Kiro in the chat app, or `node scripts/kiro-login.mjs github`. |
| `omniroute autostart enable` → job exits 1 | Upstream bugs (`--tray` without a GUI, bare `node` under launchd). The installer uses `scripts/autostart-mac.sh` instead. |
| Provider added but unused | Connections start inactive: `omniroute providers edit "<name>" --active`. |
| Claude Code ignores the gateway | `ANTHROPIC_BASE_URL` must have no `/v1` suffix, and Claude Code reads env at startup: reload the window. |
| `claude-omni: command not found` | `~/.local/bin` is not on PATH. Open a new terminal (the installer added it). |

Health check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20128/    # 307 = up
bash ~/.free-ai-setup/scripts/autostart-mac.sh status
```

### Advanced: run OmniRoute from a source checkout

Set `OMNIROUTE_SOURCE_DIR` in `.env` to a checkout of OmniRoute and run the installer again. The npm copy in `runtime/` is then not used. Pick one mode per machine: two versions that share `~/.omniroute` can disagree about database migrations. Back up first: `omniroute backup create --name pre-switch`.

## Backups

Your configuration is **not** in this repo — it lives in `storage.sqlite` in the data directory. This repo can rebuild the combo and settings, but not your credentials.

```bash
omniroute backup create --name "$(date +%Y%m%d)"
```

The backup does **not** include `STORAGE_ENCRYPTION_KEY`, and provider credentials are encrypted with it. Without that key a restored database has unreadable credentials. Save it separately, in a password manager:

```bash
grep STORAGE_ENCRYPTION_KEY ~/.omniroute/.env
```

---

## Relationship to the OmniRoute source

This repo is standalone and does not vendor OmniRoute. If you also keep a source checkout (a fork of `diegosouzapw/OmniRoute`), point `OMNIROUTE_SOURCE_DIR` at it; otherwise ignore it entirely and stay on npm.

OmniRoute is MIT licensed. This repo contains only configuration and scripts.

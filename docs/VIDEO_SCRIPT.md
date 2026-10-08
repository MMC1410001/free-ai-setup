# Video script: Free AI with OmniRoute (Mac and Windows)

Length: about 9½ minutes. Audience: anyone; the Claude Code part is for developers.
Language: short, simple sentences (Simplified Technical English).
Record at 1920×1080. Zoom the screen to 125–150 % so text is easy to read.
Before you record: use a test computer or a new user account, so the screen shows a first install. Hide your real keys (blur them in editing).

| # | Time | Screen | Voice-over |
| --- | --- | --- | --- |
| 1 | 0:00–0:30 | Title card: "Free AI chat and free Claude Code with OmniRoute" | This video shows how to get free AI chat on your computer. It works on Mac and Windows. You need a free NVIDIA account. The setup takes about ten minutes. |
| 2 | 0:30–1:15 | Simple diagram: Chat app and Claude Code → OmniRoute → Kiro (optional) → NVIDIA | OmniRoute is a free program that runs on your computer. It sends your messages to free AI providers. When one provider is busy, it tries the next one. You get a chat app for everyone. Developers also get a free mode for Claude Code. |
| 3 | 1:15–2:15 | Browser: build.nvidia.com → Sign in → Get API Key → Generate Key → Copy | First, get your free NVIDIA key. Open build dot nvidia dot com. Sign in, or create a free account. Click Get API Key. Click Generate Key. Copy the key. It starts with "nvapi". Keep it private, like a password. |
| 4 | 2:15–2:45 | Slide: "What is free" table (NVIDIA, Kiro, OmniRoute) | NVIDIA has no token limit. You can send about forty requests per minute. NVIDIA allows this for development and testing, not for production. Kiro is optional. It gives fifty credits per month for Claude Sonnet. OmniRoute itself is free and open source. |
| 5 | 2:45–3:45 | Mac: open Terminal, paste the curl command, press Return | On a Mac, open Terminal. Paste this command and press Return. The installer gets everything it needs. If Node.js is missing, it installs it. Then your Mac asks for your login password. |
| 6 | 3:45–4:30 | Windows: Start → PowerShell, paste the irm command, Enter | On Windows, open PowerShell from the Start menu. Paste this command and press Enter. If Windows asks for permission to install Node.js, click Yes. |
| 7 | 4:30–5:00 | Alternative: GitHub → Code → Download ZIP → double-click Install file; show the macOS "Open" and Windows "Run anyway" steps | You can also download the ZIP file and double-click the installer. On a Mac, right-click the file and click Open. On Windows, click More info, then Run anyway. |
| 8 | 5:00–5:45 | Installer asks for the NVIDIA key (input hidden), then "Connect Kiro now?" | Paste your NVIDIA key and press Enter. The installer checks the key. Next it asks about Kiro. Type N to skip it. You can add Kiro later in the chat app. Wait until you see "Done". The first install takes about five to ten minutes. |
| 9 | 5:45–7:00 | Open "OmniRoute Chat" from Applications / Start menu. Type a question. Attach a PDF. Paste an image. | Open OmniRoute Chat. Type a question and press Enter. To add a file, click the paper clip, or drag the file into the box. You can add PDF, Word, Excel and text files. You can also paste an image. For images, the app uses a model that can read images. |
| 10 | 7:00–7:45 | Settings → Usage and limits; set a daily limit. Settings → Keys and providers → Sign in with GitHub (Kiro) | Click Settings. Usage and limits shows the tokens you used today and this month. Here you can set your own daily limit. Keys and providers is where you change your NVIDIA key or connect Kiro. |
| 11 | 7:45–8:45 | VS Code: Claude Code chat → /omni free → Reload Window → /clear → ask something → /omni usage → /omni paid → Reload | For developers: in Claude Code, type slash omni free. Then reload the window. This project now uses free models. Start a new conversation with slash clear. The free models cannot read a very long conversation. Type slash omni usage to see your tokens. Type slash omni paid to go back to your paid Claude, and reload again. Your normal Claude Code does not change. |
| 12 | 8:45–9:15 | VS Code: press Ctrl+Option+Cmd+F (Mac) / Ctrl+Alt+Shift+F (Windows); the task panel shows "FREE". Show the shortcut table on a slide. | When your paid Claude is used up, slash omni cannot answer. Use the keyboard shortcut instead. On a Mac, press Control, Option, Command and F. On Windows, press Control, Alt, Shift and F. The letter P goes back to paid. The shortcut works in every project. On Windows, reload the window after you switch. |
| 13 | 9:15–9:45 | Troubleshooting slide + end card with repo link | If the chat says OmniRoute is not running, open the app again. If you see "too many requests", wait one minute. To update, run the install command again. The link to the guide is below this video. Thank you. |

## Captions file
Use the voice-over column as the caption text. Keep each caption to two lines.

## Facts to check on the recording day
- NVIDIA sign-in screens and the "Get API Key" button position.
- NVIDIA rate limit (about 40 requests per minute) and Kiro free credits (50 per month).
- The installer output matches this script (step numbers 1/8 to 8/8).
- The switch shortcuts work in VS Code on both systems, and the Mac shortcut reloads the window by itself.

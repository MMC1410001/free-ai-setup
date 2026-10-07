// Provider helpers shared by the installer and the chat app.
import { api, omni, setEnvValue } from "./common.mjs";

export async function connections() {
  const r = await api("/api/providers");
  return r.body?.connections || [];
}

/** true = key works, false = rejected, null = could not check (network). */
export async function nvidiaKeyWorks(key) {
  try {
    const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "meta/llama-3.2-11b-vision-instruct", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(30000),
    });
    return !(r.status === 401 || r.status === 403);
  } catch {
    return null;
  }
}

/** Add NVIDIA, replacing an existing NVIDIA connection. Saves the key to .env. */
export async function connectNvidia(key) {
  for (const c of (await connections()).filter((c) => c.provider === "nvidia")) {
    await api(`/api/providers/${c.id}`, { method: "DELETE" });
  }
  const r = omni(["providers", "add", "nvidia", "--name", "NVIDIA NIM", "--credential-stdin", "--yes"], { input: key });
  omni(["providers", "edit", "NVIDIA NIM", "--active"]);
  if (!(await connections()).some((c) => c.provider === "nvidia")) {
    throw new Error(`could not add NVIDIA: ${(r.stderr || r.stdout).slice(-300)}`);
  }
  setEnvValue("NVIDIA_NIM_KEY", key);
}

/** Start a Kiro device login. Returns { authUrl, userCode, deviceCode, interval, expiresIn }. */
export async function kiroStart(social = "github") {
  const r = await api(`/api/oauth/kiro/social-authorize?provider=${social}`);
  if (!r.body?.authUrl) throw new Error(`could not start Kiro login: ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}

/** One poll. Returns "connected", "pending" or throws. */
export async function kiroPoll(deviceCode, social = "github") {
  const r = await api("/api/oauth/kiro/social-exchange", { method: "POST", body: { deviceCode, provider: social } })
    .catch(() => ({ body: { status: "pending" } }));
  if (r.body?.success) {
    omni(["providers", "edit", "kiro", "--active"]);
    return "connected";
  }
  if (r.body?.error && !/pending/i.test(JSON.stringify(r.body))) throw new Error(JSON.stringify(r.body.error).slice(0, 200));
  return "pending";
}

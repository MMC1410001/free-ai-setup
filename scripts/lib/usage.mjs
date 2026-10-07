// Reads token usage and free quotas from the local OmniRoute gateway.
import { join } from "node:path";
import { statSync } from "node:fs";
import { api, readJson, writeJson, STATE_DIR, gateway } from "./common.mjs";

const CACHE = join(STATE_DIR, "usage-cache.json");

const fmt = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0);
export const formatTokens = fmt;

/** Today's local date as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA");

/**
 * Returns { today, month, kiro, nvidia, providers, freeTier, error }.
 * Cached for maxAgeMs so the status line stays fast.
 */
export async function getUsage({ maxAgeMs = 60000, timeoutMs = 4000 } = {}) {
  try {
    if (Date.now() - statSync(CACHE).mtimeMs < maxAgeMs) return readJson(CACHE);
  } catch { /* no cache yet */ }

  const out = { fetchedAt: new Date().toISOString(), dashboard: gateway().base };
  try {
    const [analytics, limits, conns, free] = await Promise.all([
      api("/api/usage/analytics?range=30d", { timeoutMs }),
      api("/api/usage/provider-limits", { timeoutMs }),
      api("/api/providers", { timeoutMs }),
      api("/api/free-tier/summary", { timeoutMs }),
    ]);
    if (!analytics.ok) throw new Error(`usage API returned HTTP ${analytics.status}`);

    const trend = analytics.body?.dailyTrend || [];
    const t = trend.find((d) => d.date === today()) || {};
    const month = new Date().toISOString().slice(0, 7);
    const m = trend.filter((d) => String(d.date).startsWith(month));
    out.today = { tokens: t.totalTokens || 0, requests: t.requests || 0 };
    out.month = {
      tokens: m.reduce((a, d) => a + (d.totalTokens || 0), 0),
      requests: m.reduce((a, d) => a + (d.requests || 0), 0),
    };

    const list = conns.body?.connections || [];
    out.providers = list.filter((c) => c.isActive !== false).map((c) => c.provider);

    // Kiro reports real credit numbers through provider-limits.
    const kiroConn = list.find((c) => c.provider === "kiro");
    const cache = limits.body?.caches || {};
    const k = kiroConn && cache[kiroConn.id]?.quotas?.credit;
    if (k) out.kiro = { used: k.used, total: k.total, remaining: k.remaining, resetAt: k.resetAt };
    else if (kiroConn) out.kiro = { connected: true };

    // NVIDIA's free tier is rate-limited (about 40 requests/minute), not metered.
    if (list.some((c) => c.provider === "nvidia")) out.nvidia = { rpm: 40 };

    if (free.ok && free.body) {
      out.freeTier = { headline: free.body.headline, usedThisMonth: free.body.usedThisMonth };
    }
  } catch (e) {
    out.error = e?.name === "TimeoutError" ? "OmniRoute did not answer" : String(e?.message || e);
  }
  try { writeJson(CACHE, out); } catch { /* read-only is fine */ }
  return out;
}

/** One short line for the status bar. */
export function shortLine(u) {
  if (u.error) return `OmniRoute: ${u.error}`;
  const parts = [`today ${fmt(u.today?.tokens)} tok · ${u.today?.requests ?? 0} req`];
  if (u.kiro?.total) parts.push(`Kiro ${u.kiro.remaining.toFixed(1)}/${u.kiro.total} credits left`);
  if (u.nvidia) parts.push(`NVIDIA ${u.nvidia.rpm} req/min`);
  return parts.join(" · ");
}

/** Multi-line report for /omni usage. */
export function report(u) {
  if (u.error) return `OmniRoute usage is not available: ${u.error}\nStart it with: omniroute serve --no-tray --no-open --daemon`;
  const lines = [
    "OmniRoute usage (this computer)",
    `  Today      : ${fmt(u.today.tokens)} tokens, ${u.today.requests} requests`,
    `  This month : ${fmt(u.month.tokens)} tokens, ${u.month.requests} requests`,
    "",
    "Free allowance left",
  ];
  if (u.kiro?.total) {
    const reset = u.kiro.resetAt ? new Date(u.kiro.resetAt).toLocaleDateString() : "next month";
    lines.push(`  Kiro       : ${u.kiro.remaining.toFixed(2)} of ${u.kiro.total} credits (resets ${reset})`);
  } else if (u.kiro?.connected) {
    lines.push("  Kiro       : connected (credit data not synced yet)");
  } else {
    lines.push("  Kiro       : not connected (optional)");
  }
  lines.push(
    u.nvidia
      ? `  NVIDIA NIM : no token cap; limit is about ${u.nvidia.rpm} requests per minute`
      : "  NVIDIA NIM : not connected"
  );
  lines.push("", `Details: ${u.dashboard}  (Dashboard → Usage)`);
  return lines.join("\n");
}

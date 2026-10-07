#!/usr/bin/env node
/**
 * OmniRoute Chat: a small local chat app for people who do not use a terminal.
 * Serves ui/ and a JSON API on http://127.0.0.1:21128 (loopback only).
 *
 *   node scripts/chat-server.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import { ROOT, STATE_DIR, loadEnv, api, chatKey, gateway, isUp, readJson, writeJson, readEnvFile } from "./lib/common.mjs";
import { getUsage } from "./lib/usage.mjs";
import { connections, nvidiaKeyWorks, connectNvidia, kiroStart, kiroPoll } from "./lib/providers.mjs";
import { applyConfig } from "./apply-config.mjs";

loadEnv();
const PORT = Number(process.env.OMNI_CHAT_PORT || 21128);
const UI = join(ROOT, "ui");
const SETTINGS = join(STATE_DIR, "chat-settings.json");
const ROUTING = join(STATE_DIR, "routing.json");
const DEFAULTS = { dailyTokenLimit: 0, systemPrompt: "", defaultModel: "default" };
const TYPES = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon" };

// Browser libraries for markdown and file reading. The installer puts them in
// runtime/ui; when they are missing the page loads them from cdnjs instead.
const VENDOR_DIR = join(ROOT, "runtime", "ui", "node_modules");
const CDN = "https://cdnjs.cloudflare.com/ajax/libs";
const VENDOR = {
  "marked.min.js": ["marked/marked.min.js", `${CDN}/marked/12.0.2/marked.min.js`],
  "purify.min.js": ["dompurify/dist/purify.min.js", `${CDN}/dompurify/3.1.6/purify.min.js`],
  "pdf.min.js": ["pdfjs-dist/build/pdf.min.js", `${CDN}/pdf.js/3.11.174/pdf.min.js`],
  "pdf.worker.min.js": ["pdfjs-dist/build/pdf.worker.min.js", `${CDN}/pdf.js/3.11.174/pdf.worker.min.js`],
  "mammoth.browser.min.js": ["mammoth/mammoth.browser.min.js", `${CDN}/mammoth/1.6.0/mammoth.browser.min.js`],
  "xlsx.full.min.js": ["xlsx/dist/xlsx.full.min.js", `${CDN}/xlsx/0.18.5/xlsx.full.min.js`],
};

const settings = () => ({ ...DEFAULTS, ...readJson(SETTINGS, {}) });
const readCombo = (name) => {
  const custom = readJson(ROUTING, {});
  if (Array.isArray(custom[name]) && custom[name].length) return custom[name];
  return JSON.parse(readFileSync(join(ROOT, "config", `combo.${name}.json`), "utf8")).models;
};
/** Name OmniRoute accepts for one model of a chain. */
const directId = (m) => (m.model.startsWith(`${m.providerId}/`) && m.providerId === "kiro" ? m.model : `${m.providerId}/${m.model}`);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 40 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("Upload too large (limit 40 MB)"), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const hasImage = (messages) =>
  messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));

// ── state for the page ──────────────────────────────────────────────
async function state() {
  const up = await isUp();
  const conns = up ? await connections().catch(() => []) : [];
  const active = new Set(conns.filter((c) => c.isActive !== false).map((c) => c.provider));
  const chain = (name) => readCombo(name).map((m) => ({ ...m, id: directId(m), available: active.has(m.providerId) }));
  return {
    gatewayUp: up,
    dashboard: gateway().base,
    providers: { nvidia: active.has("nvidia"), kiro: active.has("kiro") },
    nvidiaKeyHint: (readEnvFile().NVIDIA_NIM_KEY || "").replace(/^(nvapi-.{4}).*(.{4})$/, "$1…$2"),
    settings: settings(),
    chains: { default: chain("default"), vision: chain("vision") },
    customRouting: existsSync(ROUTING),
    usage: up ? await getUsage({ maxAgeMs: 15000 }) : { error: "OmniRoute is not running" },
  };
}

// ── chat proxy (streams Server-Sent Events back to the page) ─────────
async function chat(req, res) {
  const body = await readBody(req);
  const s = settings();
  if (s.dailyTokenLimit > 0) {
    const u = await getUsage({ maxAgeMs: 30000 });
    if ((u.today?.tokens || 0) >= s.dailyTokenLimit) {
      return send(res, 429, { error: `Daily limit reached (${s.dailyTokenLimit.toLocaleString()} tokens). Change it in Settings → Limits.` });
    }
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (s.systemPrompt) messages.unshift({ role: "system", content: s.systemPrompt });
  let model = body.model || s.defaultModel || "default";
  if (model === "default" && hasImage(messages)) model = "vision";

  const ac = new AbortController();
  res.on("close", () => ac.abort());
  let upstream;
  try {
    upstream = await fetch(gateway().base + "/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chatKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
      signal: ac.signal,
    });
  } catch (e) {
    return send(res, 502, { error: `OmniRoute is not reachable: ${e.message}` });
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let msg = text;
    try { msg = JSON.parse(text).error?.message || text; } catch { /* plain text */ }
    return send(res, upstream.status, { error: msg.slice(0, 600) || `HTTP ${upstream.status}` });
  }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Model-Requested": model });
  Readable.fromWeb(upstream.body).on("error", () => res.end()).pipe(res);
}

// ── settings, keys, routing ─────────────────────────────────────────
async function handleApi(req, res, path) {
  if (req.method === "GET" && path === "/api/state") return send(res, 200, await state());

  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
  if (req.headers["x-omni-chat"] !== "1") return send(res, 403, { error: "forbidden" });

  if (path === "/api/chat") return chat(req, res);
  const body = await readBody(req);

  switch (path) {
    case "/api/settings": {
      const next = { ...settings() };
      if (body.dailyTokenLimit !== undefined) next.dailyTokenLimit = Math.max(0, Math.floor(Number(body.dailyTokenLimit) || 0));
      if (body.systemPrompt !== undefined) next.systemPrompt = String(body.systemPrompt).slice(0, 4000);
      if (body.defaultModel !== undefined) next.defaultModel = String(body.defaultModel);
      writeJson(SETTINGS, next);
      return send(res, 200, { ok: true, settings: next });
    }
    case "/api/nvidia-key": {
      const key = String(body.key || "").trim();
      if (!key) return send(res, 400, { error: "Paste a key first." });
      const works = await nvidiaKeyWorks(key);
      if (works === false) return send(res, 400, { error: "NVIDIA rejected this key. Copy it again from build.nvidia.com." });
      await connectNvidia(key);
      await applyConfig({ log: () => {} });
      return send(res, 200, { ok: true, checked: works === true });
    }
    case "/api/kiro/start":
      return send(res, 200, await kiroStart(body.social === "google" ? "google" : "github"));
    case "/api/kiro/poll": {
      const status = await kiroPoll(String(body.deviceCode || ""), body.social === "google" ? "google" : "github");
      if (status === "connected") await applyConfig({ log: () => {} });
      return send(res, 200, { status });
    }
    case "/api/routing": {
      const clean = (list) =>
        (Array.isArray(list) ? list : [])
          .filter((m) => m && typeof m.model === "string" && typeof m.providerId === "string")
          .map((m) => ({ model: m.model.trim(), providerId: m.providerId.trim() }))
          .filter((m) => m.model && m.providerId);
      if (body.reset) rmSync(ROUTING, { force: true });
      else writeJson(ROUTING, { default: clean(body.default), vision: clean(body.vision) });
      await applyConfig({ log: () => {} });
      return send(res, 200, { ok: true });
    }
    case "/api/catalog": {
      // Model ids NVIDIA offers to this key, for the "add model" box.
      const key = readEnvFile().NVIDIA_NIM_KEY;
      if (!key) return send(res, 200, { nvidia: [] });
      const r = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      }).then((r) => r.json()).catch(() => ({ data: [] }));
      return send(res, 200, { nvidia: (r.data || []).map((m) => m.id).sort() });
    }
  }
  return send(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    // Only answer this computer, and only for our own host name (DNS rebinding guard).
    const host = String(req.headers.host || "");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(res, 403, { error: "forbidden host" });
    const path = new URL(req.url, "http://x").pathname;
    if (path.startsWith("/api/")) return await handleApi(req, res, path);
    if (path.startsWith("/vendor/")) {
      const v = VENDOR[path.slice(8)];
      if (!v) return send(res, 404, { error: "not found" });
      const local = join(VENDOR_DIR, v[0]);
      if (!existsSync(local)) { res.writeHead(302, { Location: v[1] }); return res.end(); }
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "max-age=86400" });
      return res.end(readFileSync(local));
    }
    const file = path === "/" ? "index.html" : path.slice(1);
    const full = join(UI, file);
    if (!full.startsWith(UI) || !existsSync(full) || !TYPES[extname(full)]) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": TYPES[extname(full)], "Cache-Control": "no-cache" });
    res.end(readFileSync(full));
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.message || String(e) });
    else res.end();
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") { console.log(`OmniRoute Chat is already running on port ${PORT}`); process.exit(0); }
  throw e;
});
server.listen(PORT, "127.0.0.1", () => console.log(`OmniRoute Chat: http://127.0.0.1:${PORT}`));

#!/usr/bin/env node
/**
 * Applies config/ to a running OmniRoute instance. Idempotent.
 *
 *   node scripts/apply-config.mjs
 *
 * - settings.json        free-only lock
 * - combo.default.json   routing chain; models of providers that are not
 *                        connected are left out, so NVIDIA alone works
 * - combo.vision.json    chain for messages with images (chat app)
 * - model-mappings.json  send Claude model ids to the combo
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, STATE_DIR, loadEnv, api, adminKey, gateway, readJson } from "./lib/common.mjs";

const read = (f) => JSON.parse(readFileSync(join(ROOT, "config", f), "utf8"));
const listOf = (body, key) => (Array.isArray(body) ? body : body?.[key] ?? []);

export async function applyConfig({ log = console.log } = {}) {
  const { base } = gateway();
  if (!adminKey()) throw new Error("OMNIROUTE_ADMIN_KEY / OMNIROUTE_API_KEY is not set in .env");

  const ping = await api("/v1/models").catch((e) => ({ ok: false, status: 0, body: String(e) }));
  if (!ping.ok) throw new Error(`cannot reach OmniRoute at ${base} (status ${ping.status})`);
  log(`✓ OmniRoute reachable at ${base}`);

  // 1. Settings
  const settings = read("settings.json");
  const set = await api("/api/settings", { method: "PATCH", body: settings });
  if (!set.ok) throw new Error(`settings update failed (HTTP ${set.status})`);
  log(`✓ free-only lock: ${Object.keys(settings).join(", ")}`);

  // 2. Which providers are connected
  const conns = listOf((await api("/api/providers")).body, "connections");
  const active = new Set(conns.filter((c) => c.isActive !== false).map((c) => c.provider));
  if (!active.size) throw new Error("no provider is connected. Add your NVIDIA key first.");
  log(`✓ connected providers: ${[...active].join(", ")}`);

  // 3. Combos, limited to connected providers. A user-chosen order from the
  //    chat app (state/routing.json) replaces the default list.
  const custom = readJson(join(STATE_DIR, "routing.json"), {});
  const mapCfg = read("model-mappings.json");
  const mappings = listOf((await api("/api/model-combo-mappings")).body, "mappings");
  for (const m of mappings.filter((m) => mapCfg.patterns.includes(m.pattern))) {
    await api(`/api/model-combo-mappings/${m.id}`, { method: "DELETE" });
  }

  const ids = {};
  for (const file of ["combo.default.json", "combo.vision.json"]) {
    const combo = read(file);
    const wanted = Array.isArray(custom[combo.name]) && custom[combo.name].length ? custom[combo.name] : combo.models;
    const models = wanted.filter((m) => active.has(m.providerId));
    if (!models.length) {
      if (combo.name === "default") throw new Error("no combo model matches a connected provider");
      continue;
    }
    const combos = listOf((await api("/api/combos")).body, "combos");
    const prior = combos.find((c) => c.name === combo.name);
    if (prior?.id) await api(`/api/combos/${prior.id}`, { method: "DELETE" });
    const created = await api("/api/combos", {
      method: "POST",
      body: { name: combo.name, strategy: combo.strategy, models },
    });
    if (!created.ok) throw new Error(`combo '${combo.name}' create failed (HTTP ${created.status}) ${JSON.stringify(created.body).slice(0, 200)}`);
    ids[combo.name] =
      created.body?.id || created.body?.combo?.id ||
      listOf((await api("/api/combos")).body, "combos").find((c) => c.name === combo.name)?.id;
    log(`✓ combo '${combo.name}' (${combo.strategy}), ${models.length} models:`);
    models.forEach((m, i) => log(`    ${i + 1}. ${m.model}`));
  }
  const comboId = ids[mapCfg.combo];
  const combo = { name: mapCfg.combo };

  // 4. Model-name mappings
  for (const [i, pattern] of mapCfg.patterns.entries()) {
    const r = await api("/api/model-combo-mappings", {
      method: "POST",
      body: { pattern, comboId, priority: 100 - i },
    });
    log(`${r.ok ? "✓" : "!"} model name '${pattern}' -> '${combo.name}'${r.ok ? "" : ` (HTTP ${r.status})`}`);
  }
  return { comboId, providers: [...active] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  applyConfig().catch((e) => {
    console.error("✖ " + (e?.message ?? e));
    process.exit(1);
  });
}

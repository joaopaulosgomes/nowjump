// Mocked-instance tests for the registry: SNX-8 live tables, SNX-9 sys_id
// resolution, SNX-15 permission failures, SNX-13 production detection.
const assert = require("assert");
const path = require("path");
let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; } catch (e) { failed++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); }
}

// ---- minimal browser mocks ----
const listeners = {};
globalThis.window = {
  location: { origin: "https://acme.service-now.com", href: "https://acme.service-now.com/navpage.do" },
  addEventListener: (k, f) => (listeners[k] = (listeners[k] || []).concat(f)),
  removeEventListener: (k, f) => (listeners[k] = (listeners[k] || []).filter((x) => x !== f)),
  postMessage: (msg) => {
    if (msg.type === "nowjump:req") {
      setTimeout(() => (listeners.message || []).forEach((f) => f({ source: globalThis.window, data: { type: "nowjump:res", id: msg.id, token: "T".repeat(72), userId: "u1", userName: "joao.gomes" } })), 0);
    }
  }
};
globalThis.chrome = undefined;

// Fake instance: table -> rows, plus a set of forbidden tables.
const DB = {
  sys_db_object: [{ name: "ecc_queue", label: "Queue" }, { name: "ecc_agent", label: "MID Server" }, { name: "ecc_agent_issue", label: "MID Server Issue" }],
  incident: [{ sys_id: { value: "1".repeat(32) }, number: { display_value: "INC0010001", value: "INC0010001" }, short_description: { display_value: "MID down" }, sys_class_name: { value: "incident" } }],
  task: [{ sys_id: { value: "1".repeat(32) }, number: { display_value: "INC0010001", value: "INC0010001" }, short_description: { display_value: "MID down" }, sys_class_name: { value: "incident" } }],
  em_alert: [{ sys_id: { value: "a".repeat(32) }, number: { display_value: "Alert0010003", value: "Alert0010003" }, short_description: { display_value: "CPU high on mid01" } }],
  discovery_status: [{ sys_id: { value: "d".repeat(32) }, number: { display_value: "DIS0016339", value: "DIS0016339" }, short_description: { display_value: "" }, name: { display_value: "Nightly Linux" } }],
  reconcile_duplicate_task: [{ sys_id: { value: "b".repeat(32) }, number: { display_value: "DUP0001001", value: "DUP0001001" }, short_description: { display_value: "3 duplicate Computers" }, sys_class_name: { value: "reconcile_duplicate_task" }, duplicate_cis: { value: "c1,c2,c3" } }],
  gsw_task: [{ sys_id: { value: "e".repeat(32) }, number: { display_value: "GSTASK0001001", value: "GSTASK0001001" }, short_description: { display_value: "Guided setup step" }, sys_class_name: { value: "gsw_task" } }],
  sys_user_has_role: [{ "role.name": "admin" }, { "role.name": "itil" }],
  sys_properties: [{ value: "false" }]
};
const FORBIDDEN = new Set(["problem"]);
const NOT_ON_INSTANCE = new Set(["discovery_classy", "sn_customerservice_task", "cmdb_ci_kubernetes_cluster"]);
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push(url);
  if (opts && opts.signal && opts.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
  const m = url.match(/^\/api\/now\/table\/([a-z0-9_]+)(?:\/([0-9a-f]{32}))?\?(.*)$/);
  if (!m) return { ok: false, status: 404, json: async () => ({}) };
  const [, table, sysId, qs] = m;
  if (FORBIDDEN.has(table)) return { ok: false, status: 403, json: async () => ({}) };
  if (!DB[table]) return { ok: false, status: 404, json: async () => ({}) };
  const q = new URLSearchParams(qs).get("sysparm_query") || "";
  let rows = DB[table];
  const idm = q.match(/sys_id=([0-9a-f]{32})/);
  if (idm) rows = rows.filter((r) => (r.sys_id && (r.sys_id.value || r.sys_id)) === idm[1]);
  const num = q.match(/number=([A-Za-z0-9]+)/);
  if (num) rows = rows.filter((r) => r.number && (r.number.value || r.number).toUpperCase() === num[1].toUpperCase());
  const inq = q.match(/^nameIN(.+)$/);
  if (inq && table === "sys_db_object") rows = inq[1].split(",").filter((n) => !NOT_ON_INSTANCE.has(n)).map((n) => ({ name: n, label: n.replace(/_/g, " ") }));
  const like = q.match(/nameLIKE([^^]+)/);
  if (like) rows = rows.filter((r) => r.name.includes(decodeURIComponent(like[1])) || (r.label || "").toLowerCase().includes(decodeURIComponent(like[1])));
  if (sysId) { const one = rows.find((r) => (r.sys_id && (r.sys_id.value || r.sys_id)) === sysId); return one ? { ok: true, status: 200, json: async () => ({ result: one }) } : { ok: false, status: 404, json: async () => ({}) }; }
  return { ok: true, status: 200, json: async () => ({ result: rows }) };
};

for (const f of ["lib/context.js", "lib/match.js", "lib/store.js", "lib/api.js", "commands/curated.js", "commands/catalog.js", "commands/chain.js", "commands/registry.js"]) {
  require(path.join(__dirname, "..", "src", f));
}
const { registry: R, api: A, curated } = globalThis.NJ;
const ctx = { shell: "classic", table: null, sysId: null, list: false };
const fresh = () => ({ recents: [], usage: {}, tables: {}, missing: {} });
const empty = fresh();

(async () => {
  const sess = await A.session();
  await t("session token comes from bridge", () => assert.strictEqual(sess.token.length, 72));

  await t("curated + live tables merge without duplicates", async () => {
    const r = await R.search("ecc", ctx, sess, empty, "acme.service-now.com");
    const tables = r.matches.map((m) => m.table);
    assert.ok(tables.includes("ecc_queue") && tables.includes("ecc_agent"));
    assert.strictEqual(new Set(tables).size, tables.length);
    assert.strictEqual(r.matches[0].label, "ECC Queue");
  });

  await t("admin-only pages hidden until roles are cached, visible after", async () => {
    let r = await R.search("cache", ctx, sess, empty, "acme.service-now.com");
    assert.ok(!r.matches.some((m) => m.id === "cur:cache"), "hidden before roles load");
    await R.userRoles(sess); // the controller does this on open
    r = await R.search("cache", ctx, sess, empty, "acme.service-now.com");
    assert.ok(r.matches.some((m) => m.id === "cur:cache"));
  });

  await t("record number lookup lands on task subclass", async () => {
    const r = await R.search("inc0010001", ctx, sess, empty, "acme.service-now.com");
    assert.strictEqual(r.matches[0].kind, "record");
    assert.strictEqual(r.matches[0].table, "incident");
    assert.strictEqual(r.matches[0].url, "/incident.do?sys_id=" + "1".repeat(32));
  });

  await t("alert number resolves on em_alert with platform casing", async () => {
    const r = await R.search("alert0010003", ctx, sess, fresh(), "acme.service-now.com");
    assert.strictEqual(r.matches[0].table, "em_alert");
    assert.strictEqual(r.matches[0].label, "Alert0010003");
    assert.strictEqual(r.matches[0].url, "/em_alert.do?sys_id=" + "a".repeat(32));
  });
  await t("discovery status number resolves and shows schedule name", async () => {
    const r = await R.search("DIS0016339", ctx, sess, fresh(), "acme.service-now.com");
    assert.strictEqual(r.matches[0].table, "discovery_status");
    assert.strictEqual(r.matches[0].secondary, "Nightly Linux");
  });
  await t("duplicate task and guided setup numbers resolve to their own tables", async () => {
    assert.strictEqual((await R.search("DUP0001001", ctx, sess, fresh(), "acme.service-now.com")).matches[0].table, "reconcile_duplicate_task");
    assert.strictEqual((await R.search("GSTASK0001001", ctx, sess, fresh(), "acme.service-now.com")).matches[0].table, "gsw_task");
  });
  await t("unknown prefix falls back to task and reports the tables tried", async () => {
    calls.length = 0;
    const r = await R.search("XYZ0001234", ctx, sess, fresh(), "acme.service-now.com");
    assert.ok(calls.some((u) => u.includes("/api/now/table/task?")), "task tried");
    assert.strictEqual(r.matches.length, 0);
    assert.ok(/No record numbered XYZ0001234 in task/.test(r.notice), r.notice);
  });
  await t("CS numbers are no longer recognised as customer service cases", async () => {
    calls.length = 0;
    await R.search("CS9225508", ctx, sess, fresh(), "acme.service-now.com");
    assert.ok(!calls.some((u) => u.includes("sn_customerservice")), "no CSM table queried");
    assert.ok(!curated.SYS_ID_CANDIDATES.includes("sn_customerservice_case"));
  });
  await t("duplicate task chain opens the duplicate CIs list from the list field", async () => {
    const c = await R.contextCommands({ shell: "classic", table: "reconcile_duplicate_task", sysId: "b".repeat(32) }, sess, { workspacePath: "sow" }, undefined, fresh(), "acme.service-now.com");
    const dup = c.find((x) => x.id === "chain:duplicate_cis");
    assert.ok(dup, "chain present");
    assert.ok(dup.url.includes("sys_idINc1%2Cc2%2Cc3"), dup.url);
  });

  await t("sys_id resolves through candidates and counts forbidden tables", async () => {
    const r = await R.search("1".repeat(32), ctx, sess, empty, "acme.service-now.com");
    assert.strictEqual(r.matches.length, 1);
    assert.strictEqual(r.matches[0].label, "INC0010001");
  });

  await t("unknown sys_id produces a notice naming forbidden count", async () => {
    calls.length = 0;
    const r = await R.search("f".repeat(32), ctx, sess, empty, "acme.service-now.com");
    assert.strictEqual(r.matches.length, 0);
    assert.ok(/No record found/.test(r.notice));
    assert.ok(/1 of \d+ tables were not readable/.test(r.notice));
  });

  await t("recent tables are tried first", async () => {
    calls.length = 0;
    await R.search("f".repeat(32), ctx, sess, { recents: [{ table: "zzz_recent" }], usage: {}, tables: {} }, "acme.service-now.com");
    assert.ok(calls[0].startsWith("/api/now/table/zzz_recent?"));
  });

  await t("unknown bare table name still offers a direct jump", async () => {
    const r = await R.search("u_custom_thing", ctx, sess, empty, "acme.service-now.com");
    assert.ok(r.matches.some((m) => m.table === "u_custom_thing"));
  });

  await t("> prefix filters to curated only, no live query", async () => {
    calls.length = 0;
    await R.search(">ecc", ctx, sess, empty, "acme.service-now.com");
    assert.ok(!calls.some((u) => u.includes("nameLIKE")), "no live search");
  });

  await t("abort propagates as AbortError", async () => {
    const ac = new AbortController(); ac.abort();
    await assert.rejects(() => R.search("ecc", ctx, sess, empty, "acme.service-now.com", ac.signal), (e) => e.name === "AbortError");
  });

  await t("403 copy names the table", () => {
    assert.strictEqual(A.describe(new A.ApiError("forbidden", 403, "ecc_queue")), "You can't read ecc_queue on this instance. Check your roles or ask an admin.");
  });

  await t("catalog tables match locally without network", () => {
    const r = R.searchLocal("cmdb_ci_vm_inst", ctx, sess, fresh());
    assert.ok(r.some((m) => m.table === "cmdb_ci_vm_instance"), "catalog hit");
    assert.ok(r[0].fromCatalog);
  });

  await t("a curated table that does not exist on the instance is hidden after verification and cached", async () => {
    const hd = fresh();
    const local = R.searchLocal("classifier", ctx, sess, hd);
    assert.ok(local.some((m) => m.table === "discovery_classy"), "shown before verification");
    const r = await R.search("classifier", ctx, sess, hd, "acme.service-now.com");
    assert.ok(!r.matches.some((m) => m.table === "discovery_classy"), "hidden after verification");
    assert.ok(hd.missing.discovery_classy, "cached as missing");
    assert.ok(!R.searchLocal("classifier", ctx, sess, hd).some((m) => m.table === "discovery_classy"), "hidden locally on next keystroke");
  });

  await t("verification is one query per 60 unknown names and skips cached", async () => {
    const hd = fresh();
    hd.tables.ecc_queue = "Queue";
    calls.length = 0;
    const names = ["ecc_queue", "ecc_agent", "discovery_status", "discovery_classy"];
    const ok = await R.verifyTables(names, hd, "acme.service-now.com");
    const inCalls = calls.filter((u) => u.includes("nameIN"));
    assert.strictEqual(inCalls.length, 1);
    assert.ok(!inCalls[0].includes("ecc_queue"), "cached name not re-queried");
    assert.deepStrictEqual([...ok].sort(), ["discovery_status", "ecc_agent", "ecc_queue"]);
  });

  await t("chain entries pointing at missing tables are dropped", async () => {
    const hd = fresh();
    const c = await R.contextCommands({ shell: "classic", table: "sn_customerservice_case", sysId: "1".repeat(32) }, sess, { workspacePath: "sow" }, undefined, hd, "acme.service-now.com");
    assert.ok(!c.some((x) => x.table === "sn_customerservice_task"), "missing child table hidden");
  });

  await t("production false read from property", async () => assert.strictEqual(await R.isProduction(), false));

  await t("context commands include other-ui and update set shape", async () => {
    // No sys_user_preference table in fake DB -> update set silently absent, other-ui present.
    const c = await R.contextCommands({ shell: "classic", table: "incident", sysId: "1".repeat(32) }, sess, { workspacePath: "sow", otherUiNewTab: true });
    assert.strictEqual(c[0].id, "act:other-ui");
    assert.strictEqual(c[0].url, "/now/sow/record/incident/" + "1".repeat(32));
    assert.ok(c.some((x) => x.id.startsWith("chain:")));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

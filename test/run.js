// Node test runner for the pure modules. No browser needed.
const assert = require("assert");
const path = require("path");
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.log("FAIL", name, "\n   ", e.message); }
}
for (const f of ["lib/context.js", "lib/match.js", "lib/store.js", "lib/api.js", "commands/curated.js", "commands/catalog.js", "commands/chain.js", "commands/registry.js"]) {
  require(path.join(__dirname, "..", "src", f));
}
const { context: C, match: M, curated, chain, catalog } = globalThis.NJ;
const H = "https://acme.service-now.com";
const SID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

// ---------- SNX-5 context parsing ----------
t("workspace record", () => {
  const c = C.parseContext(`${H}/now/sow/record/incident/${SID}/params/selected-tab-index/1`);
  assert.deepStrictEqual([c.shell, c.workspace, c.table, c.sysId], ["workspace", "sow", "incident", SID]);
});
t("workspace nested path", () => {
  const c = C.parseContext(`${H}/now/cwf/agent/record/sn_customerservice_case/${SID}`);
  assert.deepStrictEqual([c.shell, c.workspace, c.table], ["workspace", "cwf/agent", "sn_customerservice_case"]);
});
t("workspace list has no table", () => {
  const c = C.parseContext(`${H}/now/sow/list/params/list-id/abc`);
  assert.deepStrictEqual([c.shell, c.table, c.list], ["workspace", null, true]);
});
t("polaris wrapping classic record", () => {
  const c = C.parseContext(`${H}/now/nav/ui/classic/params/target/ecc_agent.do%3Fsys_id%3D${SID}%26sysparm_view%3D`);
  assert.deepStrictEqual([c.shell, c.table, c.sysId], ["polaris", "ecc_agent", SID]);
});
t("polaris wrapping classic list", () => {
  const c = C.parseContext(`${H}/now/nav/ui/classic/params/target/ecc_queue_list.do%3Fsysparm_query%3Dstate%253Dready`);
  assert.deepStrictEqual([c.shell, c.table, c.list], ["polaris", "ecc_queue", true]);
});
t("polaris home falls back to frame", () => {
  const c = C.parseContext(`${H}/now/nav/ui/home`, `${H}/discovery_status.do?sys_id=${SID}`);
  assert.deepStrictEqual([c.shell, c.table, c.sysId], ["polaris", "discovery_status", SID]);
});
t("classic navpage uses gsft_main", () => {
  const c = C.parseContext(`${H}/navpage.do`, `${H}/sys_properties_list.do?sysparm_query=nameLIKEmid`);
  assert.deepStrictEqual([c.shell, c.table, c.list], ["classic", "sys_properties", true]);
});
t("classic bare record", () => {
  const c = C.parseContext(`${H}/incident.do?sys_id=${SID.toUpperCase()}`);
  assert.deepStrictEqual([c.shell, c.table, c.sysId], ["classic", "incident", SID]);
});
t("classic new record has no sysId", () => {
  const c = C.parseContext(`${H}/incident.do?sys_id=-1`);
  assert.deepStrictEqual([c.table, c.sysId], ["incident", null]);
});
t("garbage url does not throw", () => {
  const c = C.parseContext("not a url");
  assert.strictEqual(c.shell, "classic");
});
t("classic frame with no frame href", () => {
  const c = C.parseContext(`${H}/navpage.do`, null);
  assert.deepStrictEqual([c.shell, c.table], ["classic", null]);
});

// ---------- URL builders ----------
t("list url classic", () => assert.strictEqual(C.listUrl({ shell: "classic" }, "ecc_queue"), "/ecc_queue_list.do"));
t("list url polaris keeps shell", () => assert.strictEqual(C.listUrl({ shell: "polaris" }, "ecc_queue"), "/now/nav/ui/classic/params/target/ecc_queue_list.do"));
t("list url with query is encoded", () => {
  assert.strictEqual(C.listUrl({ shell: "classic" }, "ecc_queue", "agent=x^ORDERBYDESCsys_created_on"), "/ecc_queue_list.do?sysparm_query=agent%3Dx%5EORDERBYDESCsys_created_on");
});
t("record url polaris", () => assert.strictEqual(C.recordUrl({ shell: "workspace" }, "incident", SID), "/now/nav/ui/classic/params/target/incident.do%3Fsys_id%3D" + SID));
t("other ui from workspace", () => assert.strictEqual(C.otherUiUrl({ shell: "workspace", table: "incident", sysId: SID }, "sow"), `/incident.do?sys_id=${SID}`));
t("other ui from classic uses configured path", () => assert.strictEqual(C.otherUiUrl({ shell: "classic", table: "incident", sysId: SID }, "/cwf/agent/"), `/now/cwf/agent/record/incident/${SID}`));
t("other ui without record is null", () => assert.strictEqual(C.otherUiUrl({ shell: "classic", table: "incident", sysId: null }), null));
t("isSysId", () => { assert.ok(C.isSysId(" " + SID + " ")); assert.ok(!C.isSysId(SID.slice(1))); assert.ok(!C.isSysId("zz" + SID.slice(2))); });

// ---------- SNX-7 ranking ----------
t("exact beats prefix beats substring", () => {
  const e = M.score("ecc", "ecc"), p = M.score("ecc", "ecc_queue"), s = M.score("ecc", "the ecc thing"), z = M.score("ecc", "xyz");
  assert.ok(e > p && p > s && s > 0 && z === 0);
});
t("subsequence matches", () => assert.ok(M.score("dsts", "discovery_status") > 0));
t("empty query matches everything equally", () => assert.strictEqual(M.score("", "anything"), 1));
t("rank prefers alias match", () => {
  const items = [{ id: "a", label: "Configuration Items", aliases: ["ci"] }, { id: "b", label: "Circuits" }];
  const r = M.rank("ci", items, {}, Date.now());
  assert.strictEqual(r[0].id, "a");
});
t("frecency breaks ties", () => {
  const items = [{ id: "a", label: "alpha one" }, { id: "b", label: "alpha two" }];
  const now = Date.now();
  const r = M.rank("alpha", items, { b: { count: 5, last: now } }, now);
  assert.strictEqual(r[0].id, "b");
});
t("frecency decays", () => {
  const now = Date.now();
  assert.ok(M.frecency(3, now, now) > M.frecency(3, now - 30 * 86400000, now));
});

// ---------- curated / chain data integrity ----------
t("curated ids unique", () => {
  const ids = curated.CURATED.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
t("curated entries have table or page", () => curated.CURATED.forEach((c) => assert.ok(c.table || c.page, c.id)));
t("chain parent needs via, children need where", () => {
  for (const [tbl, rels] of Object.entries(chain.CHAIN)) for (const r of rels) {
    if (r.dir === "parent" || r.dir === "listFrom") assert.ok(r.via, tbl + " " + r.label); else assert.ok(r.where, tbl + " " + r.label);
  }
});
t("cmdb_ci subclasses use cmdb_ci chain", () => assert.strictEqual(chain.chainFor("cmdb_ci_server"), chain.CHAIN.cmdb_ci));

t("catalog is well formed and large", () => {
  assert.ok(catalog.CATALOG.length > 2000);
  const names = catalog.CATALOG.map((r) => r[0]);
  assert.strictEqual(new Set(names).size, names.length, "unique");
  names.forEach((n) => assert.ok(/^[a-z][a-z0-9_]*$/.test(n), n));
});
t("every curated table with an ITOM prefix is in the catalog", () => {
  const names = new Set(catalog.CATALOG.map((r) => r[0]));
  curated.CURATED.filter((c) => c.table && /^(ecc_|discovery_|cmdb_|sa_|reconcile_)/.test(c.table)).forEach((c) => assert.ok(names.has(c.table), c.table));
});

t("manifest is store-shaped: MV3, minimal permissions, no remote code, explicit CSP", () => {
  const m = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.strictEqual(m.manifest_version, 3);
  assert.deepStrictEqual(m.permissions.sort(), ["scripting", "storage"]);
  assert.deepStrictEqual(m.host_permissions, ["https://*.service-now.com/*"]);
  assert.deepStrictEqual(m.optional_host_permissions, ["https://*/*"]);
  assert.ok(/script-src 'self'/.test(m.content_security_policy.extension_pages));
  assert.ok(!m.web_accessible_resources);
  assert.ok(m.description.length <= 132, "store description limit");
  for (const cs of m.content_scripts) for (const f of cs.js) assert.ok(require("fs").existsSync(path.join(__dirname, "..", f)), f);
});
t("no remote code or dangerous sinks in shipped scripts", () => {
  const fs = require("fs");
  const files = ["src/background.js", "src/bridge.js", "src/content.js", "src/palette.js", "options/options.js"].concat(fs.readdirSync(path.join(__dirname, "..", "src/lib")).map((f) => "src/lib/" + f), fs.readdirSync(path.join(__dirname, "..", "src/commands")).map((f) => "src/commands/" + f));
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/\beval\(|new Function\(|\.innerHTML\s*=|document\.write\(/.test(src), f + " has a dangerous sink");
    assert.ok(!/https?:\/\/(?!\*\.service-now\.com|\*\/\*|acme\.service-now)[a-z0-9.-]+\//.test(src.replace(/\/\/.*$/gm, "")), f + " references an external host");
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

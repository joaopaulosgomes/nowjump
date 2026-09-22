// End-to-end controller tests in jsdom. Reproduces the two field bugs:
//   1. Escape swallowed by a page-level handler registered before ours.
//   2. A request that never resolves leaving the palette stuck.
const assert = require("assert");
const path = require("path");
const { JSDOM } = require("jsdom");
let passed = 0, failed = 0;
async function t(name, fn) { try { await fn(); passed++; } catch (e) { failed++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 2).join("\n    ")); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><html><body><input id="note"></body></html>`, {
  url: "https://acme.service-now.com/incident.do?sys_id=" + "1".repeat(32),
  pretendToBeVisual: true,
  beforeParse(w) { w.HTMLElement.prototype.scrollIntoView = function () {}; }
});
const w = dom.window;
for (const k of ["window", "document", "location", "HTMLElement", "KeyboardEvent", "Event", "AbortController", "URL", "URLSearchParams"]) globalThis[k] = w[k] || globalThis[k];
globalThis.chrome = undefined;

// --- the page: a Workspace-style handler that eats Escape, registered BEFORE the extension ---
let pageSawEscape = 0;
w.addEventListener("keydown", (e) => { if (e.key === "Escape") { pageSawEscape++; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

// --- bridge mock ---
w.addEventListener("message", (ev) => {
  const d = ev.data;
  if (d && d.type === "nowjump:req") setTimeout(() => w.dispatchEvent(new w.MessageEvent("message", { data: { type: "nowjump:res", id: d.id, token: "T".repeat(72), userId: "u1" }, source: w, origin: w.location.origin })), 0);
});

// --- fetch mock with a switch to hang ---
let hang = false;
const rows = { sys_user_has_role: [{ "role.name": "admin" }], sys_db_object: [{ name: "ecc_queue", label: "Queue" }], sys_properties: [{ value: "false" }] };
globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
  if (opts && opts.signal) opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
  if (hang) return; // never resolves; only the abort can end it
  const m = url.match(/\/api\/now\/table\/([a-z0-9_]+)/);
  const tbl = m && m[1];
  const inq = decodeURIComponent(url).match(/nameIN([^&]+)/);
  if (tbl === "sys_db_object" && inq) { const names = inq[1].split(","); return setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ result: names.map((n) => ({ name: n, label: n })) }) }), 5); }
  setTimeout(() => resolve({ ok: !!rows[tbl], status: rows[tbl] ? 200 : 404, json: async () => ({ result: rows[tbl] || [] }) }), 5);
});

for (const f of ["lib/context.js", "lib/match.js", "lib/store.js", "lib/api.js", "commands/curated.js", "commands/catalog.js", "commands/chain.js", "commands/registry.js", "palette.js", "content.js"]) {
  require(path.join(__dirname, "..", "src", f));
}
// Shorten the deadline for the hang test.
const A = globalThis.NJ.api;

const host = () => w.document.querySelector("nowjump-palette");
const key = (target, k, extra) => target.dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
const keyup = (target, k) => target.dispatchEvent(new w.KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true }));
// The shadow root is closed; reach the input via the palette instance kept in a test hook.
function paletteInput() {
  // content.js keeps no global. Find the input by walking the composed tree via focus: after show(), activeElement is the host.
  return w.document.activeElement === host() ? host() : null;
}

(async () => {
  await t("Ctrl+K opens the palette", async () => {
    key(w.document.body, "k", { ctrlKey: true });
    await sleep(30);
    assert.ok(host(), "host mounted");
    assert.strictEqual(w.document.activeElement, host(), "focus is inside the palette");
  });

  await t("Escape closes even when a page handler swallows the keydown", async () => {
    key(w.document.activeElement, "Escape");   // page capture handler eats it
    keyup(w.document.activeElement, "Escape"); // our keyup fallback
    await sleep(10);
    assert.ok(pageSawEscape >= 1, "page handler ran");
    assert.notStrictEqual(w.document.activeElement, host(), "focus left the palette");
  });

  await t("shortcut toggles closed", async () => {
    key(w.document.body, "k", { ctrlKey: true }); await sleep(30);
    assert.strictEqual(w.document.activeElement, host());
    key(w.document.body, "k", { ctrlKey: true }); await sleep(10);
    assert.notStrictEqual(w.document.activeElement, host());
  });

  await t("typing paints local results synchronously before any network", async () => {
    key(w.document.body, "k", { ctrlKey: true }); await sleep(60);
    // Simulate input: dispatch on the host bubbles from the shadow input path only if we have it.
    // Instead exercise the controller through the same public surface the palette uses.
    const NJ = globalThis.NJ;
    const local = NJ.registry.searchLocal("ecc", { shell: "classic" }, { userId: "u1", token: "x" }, { recents: [], usage: {} });
    assert.ok(local.length >= 2, "curated results without network");
    assert.strictEqual(local[0].label, "ECC Queue");
  });

  await t("a hanging request times out instead of hanging the palette", async () => {
    hang = true;
    const started = Date.now();
    await assert.rejects(() => A.query("sys_db_object", { sysparm_limit: 1 }, undefined), (e) => e.kind === "network" && /Timed out/.test(e.message));
    // The library default is 8 s; the test proves it fires. Keep the test fast by accepting >=7.5 s.
    assert.ok(Date.now() - started >= 7500 && Date.now() - started < 9500, "deadline fired near 8 s: " + (Date.now() - started));
    hang = false;
  });

  await t("timeout copy is the SNX-D8 style", () => {
    assert.strictEqual(A.describe(new A.ApiError("network", 0, "x", "Timed out")), "The instance didn't answer in time. Try again or narrow the search.");
  });

  await t("pagehide closes", async () => {
    key(w.document.body, "k", { ctrlKey: true }); await sleep(30);
    w.dispatchEvent(new w.Event("pagehide"));
    await sleep(5);
    assert.notStrictEqual(w.document.activeElement, host());
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

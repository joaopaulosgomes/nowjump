// jsdom tests for the palette shell keyboard contract (SNX-6, SNX-D4, SNX-D12).
const assert = require("assert");
const path = require("path");
const { JSDOM } = require("jsdom");
let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.log("FAIL", name, "\n   ", e.message); } }

const dom = new JSDOM(`<!doctype html><html><body><input id="note"><button id="b">x</button></body></html>`, { pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.HTMLElement = window.HTMLElement;
window.HTMLElement.prototype.scrollIntoView = function () {};
require(path.join(__dirname, "..", "src", "brand.js"));
require(path.join(__dirname, "..", "src", "palette.js"));
const Palette = globalThis.NJ.Palette;

const events = [];
const p = new Palette({
  onQuery: (q) => events.push(["query", q]),
  onExecute: (item, o) => events.push(["exec", item ? item.id : null, !!o.newTab]),
  onClose: () => events.push(["close"])
});
const key = (k, extra) => p.input.dispatchEvent(new window.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
const items = (n, g) => Array.from({ length: n }, (_, i) => ({ id: g + i, kind: "table", label: g + " " + i, meta: "t" + i }));

t("mounts a closed shadow root on <html>", () => {
  p.mount();
  const host = document.querySelector("nowjump-palette");
  assert.ok(host);
  assert.strictEqual(host.shadowRoot, null); // closed
});

t("brand row sits above the input with name and credit", () => {
  const brand = p.root.querySelector(".brand");
  assert.ok(brand, "brand row exists");
  assert.strictEqual(brand.nextElementSibling.className, "input-row");
  assert.strictEqual(brand.querySelector(".name").textContent, "NowJump");
  assert.strictEqual(brand.querySelector(".credit").textContent, "developed by Joao Gomes");
  assert.ok(brand.querySelector("img").src.startsWith("data:image/png;base64,"), "icon inlined, no runtime URL");
});

t("show focuses input and remembers previous focus", () => {
  document.getElementById("note").focus();
  p.show("incident · a1b2c3d4");
  assert.strictEqual(p.prevFocus.id, "note");
  assert.ok(p.open);
  assert.strictEqual(p.input.value, "");
});

t("renders groups with headers only when more than one group has items", () => {
  p.render([{ group: "context", items: items(2, "ctx") }, { group: "recents", items: [] }, { group: "matches", items: items(3, "m") }], null, false);
  const headers = Array.from(p.list.querySelectorAll(".group-h")).map((h) => h.textContent);
  assert.deepStrictEqual(headers, ["This record", "Matches"]);
  assert.strictEqual(p.items.length, 5);
  p.render([{ group: "matches", items: items(3, "m") }], null, false);
  assert.strictEqual(p.list.querySelectorAll(".group-h").length, 0);
});

t("group limit shows +N more footer that is not selectable", () => {
  p.render([{ group: "matches", items: items(40, "m") }], null, false);
  assert.strictEqual(p.items.length, 8);
  assert.ok(/\+32 more/.test(p.list.querySelector(".more").textContent));
});

t("first row selected by default, aria wired", () => {
  assert.strictEqual(p.items[0].el.getAttribute("aria-selected"), "true");
  assert.strictEqual(p.input.getAttribute("aria-activedescendant"), p.items[0].el.id);
  assert.strictEqual(p.list.getAttribute("role"), "listbox");
});

t("arrow keys wrap both ways, Tab moves down, Shift+Tab up", () => {
  key("ArrowUp"); assert.strictEqual(p.sel, 7);
  key("ArrowDown"); assert.strictEqual(p.sel, 0);
  key("Tab"); assert.strictEqual(p.sel, 1);
  key("Tab", { shiftKey: true }); assert.strictEqual(p.sel, 0);
});

t("Enter executes highlighted; Shift+Enter flags new tab", () => {
  events.length = 0;
  key("ArrowDown"); key("Enter");
  assert.deepStrictEqual(events[0], ["exec", "m1", false]);
  key("Enter", { shiftKey: true });
  assert.deepStrictEqual(events[1], ["exec", "m1", true]);
});

t("Enter with no items calls execute(null) for the recents fallback", () => {
  events.length = 0;
  p.render([], null, false);
  key("Enter");
  assert.deepStrictEqual(events[0], ["exec", null, false]);
});

t("empty render shows the no-match copy from SNX-D8", () => {
  assert.ok(/Nothing matches\. Try a table name, a record number, or a sys_id\./.test(p.list.textContent));
});

t("notice renders with danger styling", () => {
  p.render([], { text: "Your session expired. Reload the page and try again.", danger: true }, false);
  const n = p.list.querySelector(".notice.danger");
  assert.ok(n && /session expired/.test(n.textContent));
});

t("warn badge replaces meta for Default update set row", () => {
  p.render([{ group: "context", items: [{ id: "us", kind: "set", label: "Update set: Default", warn: true, meta: "switch" }] }], null, false);
  assert.strictEqual(p.list.querySelector(".badge.warn").textContent, "Default");
  assert.strictEqual(p.list.querySelector(".meta"), null);
});

t("typing emits onQuery", () => {
  events.length = 0;
  p.input.value = "ecc";
  p.input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepStrictEqual(events[0], ["query", "ecc"]);
});

t("Escape closes, hides, returns focus, fires onClose", () => {
  events.length = 0;
  key("Escape");
  assert.ok(!p.open);
  assert.ok(p.root.hidden);
  assert.strictEqual(document.activeElement.id, "note");
  assert.deepStrictEqual(events[0], ["close"]);
});

t("reopen clears query and items", () => {
  p.show("");
  assert.strictEqual(p.input.value, "");
  assert.ok(p.badge.hidden);
  p.close();
});

t("Esc actually removes the overlay from display, not just the hidden attribute", () => {
  // Regression: a stylesheet rule like `.backdrop { display: flex }` silently
  // overrides the browser's built-in `[hidden] { display: none }` rule,
  // because author normal rules always beat user-agent normal rules
  // regardless of specificity. Checking only `.hidden` here would have
  // passed while the overlay stayed visibly on screen.
  p.show("");
  assert.strictEqual(p.root.style.display, "flex");
  key("Escape");
  assert.ok(p.root.hidden);
  assert.strictEqual(p.root.style.display, "none");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

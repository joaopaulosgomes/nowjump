// NowJump service worker.
//
// Two jobs, both small:
//   1. Open the options page on install and on toolbar click.
//   2. Keep content scripts registered for any custom instance domains the
//      user has added. The manifest covers *.service-now.com statically;
//      everything else is an optional host permission granted by the user in
//      the options page and registered here with chrome.scripting. No code is
//      fetched or generated - the same bundled files are registered for the
//      extra origins.

const CONTENT_JS = [
  "src/brand.js", "src/lib/context.js", "src/lib/match.js", "src/lib/store.js", "src/lib/api.js",
  "src/commands/curated.js", "src/commands/catalog.js", "src/commands/chain.js", "src/commands/registry.js",
  "src/palette.js", "src/content.js"
];
const BRIDGE_JS = ["src/bridge.js"];
const ID_BRIDGE = "nowjump-bridge-custom";
const ID_CONTENT = "nowjump-content-custom";

function originPatterns(domain) {
  const d = String(domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return [];
  if (d.startsWith("*.")) return ["https://" + d + "/*"];
  return ["https://" + d + "/*", "https://*." + d + "/*"];
}

async function storedDomains() {
  const v = await chrome.storage.local.get("nj:domains");
  return Array.isArray(v["nj:domains"]) ? v["nj:domains"] : [];
}

async function grantedPatterns(domains) {
  const out = [];
  for (const d of domains) {
    for (const p of originPatterns(d)) {
      try {
        if (await chrome.permissions.contains({ origins: [p] })) out.push(p);
      } catch (_) {}
    }
  }
  return out;
}

async function syncRegistrations() {
  const domains = await storedDomains();
  const matches = await grantedPatterns(domains);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [ID_BRIDGE, ID_CONTENT] });
  } catch (_) {}
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([
    { id: ID_BRIDGE, js: BRIDGE_JS, matches, runAt: "document_idle", allFrames: true, world: "MAIN", persistAcrossSessions: true },
    { id: ID_CONTENT, js: CONTENT_JS, matches, runAt: "document_idle", allFrames: true, persistAcrossSessions: true }
  ]);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
  syncRegistrations().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => syncRegistrations().catch(() => {}));
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((changes) => {
  if (changes["nj:domains"]) syncRegistrations().catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => syncRegistrations().catch(() => {}));
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "nowjump:sync-domains") {
    syncRegistrations().then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: String(e && e.message) }));
    return true;
  }
  return false;
});

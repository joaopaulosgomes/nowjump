// NowJump storage. chrome.storage.local only - never sync. Everything is
// keyed by instance hostname so two instances never share recents.
//
// What is stored: sys_ids, table names, labels, counts, timestamps, and the
// user's settings. Never record content.
(function (root) {
  const SETTINGS_KEY = "nj:settings";
  const DEFAULTS = {
    shortcutKey: "k",
    shortcutMod: "ctrl-or-meta", // "ctrl-or-meta" | "ctrl" | "meta" | "alt"
    openInNewTab: false,
    otherUiNewTab: true,
    workspacePath: "sow",
    allowInFields: false,
    maxRecents: 30
  };

  function hasChrome() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function get(keys) {
    return new Promise((res) => {
      if (!hasChrome()) return res({});
      chrome.storage.local.get(keys, (v) => res(v || {}));
    });
  }
  function set(obj) {
    return new Promise((res) => {
      if (!hasChrome()) return res();
      chrome.storage.local.set(obj, () => res());
    });
  }

  async function settings() {
    const v = await get(SETTINGS_KEY);
    return Object.assign({}, DEFAULTS, v[SETTINGS_KEY] || {});
  }
  async function saveSettings(patch) {
    const cur = await settings();
    const next = Object.assign({}, cur, patch);
    await set({ [SETTINGS_KEY]: next });
    return next;
  }

  function hostKey(host) {
    return "nj:host:" + host;
  }

  async function hostData(host) {
    const v = await get(hostKey(host));
    const d = v[hostKey(host)] || {};
    return { recents: d.recents || [], usage: d.usage || {}, tables: d.tables || {}, missing: d.missing || {} };
  }

  // Record a use of a command. entry: {id, kind, label, secondary, url, table}
  async function recordUse(host, entry, max) {
    const d = await hostData(host);
    const now = Date.now();
    const u = d.usage[entry.id] || { count: 0, last: 0 };
    d.usage[entry.id] = { count: u.count + 1, last: now };
    d.recents = [Object.assign({}, entry, { last: now })].concat(d.recents.filter((r) => r.id !== entry.id));
    d.recents = d.recents.slice(0, max || DEFAULTS.maxRecents);
    // Prune usage for ids no longer in recents, so the map cannot grow forever.
    const keep = new Set(d.recents.map((r) => r.id));
    for (const k of Object.keys(d.usage)) if (!keep.has(k)) delete d.usage[k];
    await set({ [hostKey(host)]: d });
    return d;
  }

  // Cache of table name -> label discovered via sys_db_object.
  async function rememberTables(host, map) {
    const d = await hostData(host);
    Object.assign(d.tables, map);
    const keys = Object.keys(d.tables);
    if (keys.length > 400) {
      for (const k of keys.slice(0, keys.length - 400)) delete d.tables[k];
    }
    await set({ [hostKey(host)]: d });
  }

  // Existence cache. exists: name -> label. missing: name -> timestamp checked.
  // Missing entries expire after 7 days so a newly installed plugin shows up.
  const MISSING_TTL = 7 * 86400000;
  async function rememberExistence(host, existsMap, missingNames) {
    const d = await hostData(host);
    Object.assign(d.tables, existsMap || {});
    const now = Date.now();
    for (const n of missingNames || []) d.missing[n] = now;
    for (const n of Object.keys(d.missing)) if (now - d.missing[n] > MISSING_TTL || d.tables[n]) delete d.missing[n];
    const keys = Object.keys(d.tables);
    if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete d.tables[k];
    await set({ [hostKey(host)]: d });
    return d;
  }
  function isMissing(hostData, name) {
    const ts = hostData && hostData.missing && hostData.missing[name];
    return !!ts && Date.now() - ts < MISSING_TTL;
  }

  // Custom instance domains (hostnames or *.suffix). Default *.service-now.com
  // is in the manifest and never listed here.
  const DOMAINS_KEY = "nj:domains";
  async function domains() {
    const v = await get(DOMAINS_KEY);
    return Array.isArray(v[DOMAINS_KEY]) ? v[DOMAINS_KEY] : [];
  }
  async function saveDomains(list) {
    await set({ [DOMAINS_KEY]: list });
    return list;
  }

  async function clearAll() {
    return new Promise((res) => {
      if (!hasChrome()) return res();
      chrome.storage.local.clear(() => res());
    });
  }

  root.NJ = root.NJ || {};
  root.NJ.store = { DEFAULTS, settings, saveSettings, hostData, recordUse, rememberTables, rememberExistence, isMissing, domains, saveDomains, clearAll };
})(typeof globalThis !== "undefined" ? globalThis : this);

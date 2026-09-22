// NowJump controller. Runs in every frame but only the top frame owns a
// palette. Child frames forward the shortcut so it works while focus is in
// gsft_main.
//
// Two rules this file enforces above everything else:
//   1. There is always a way out. Escape, the shortcut, the backdrop, the
//      esc button, and page navigation all close the palette, and the
//      Escape path is handled at window level in the capture phase so page
//      code that swallows keyboard events cannot block it.
//   2. Nothing is allowed to leave the palette in a loading state. Every
//      request has a deadline, every handler is guarded, and a watchdog
//      replaces a stuck spinner with a notice.
(function () {
  const NJ = globalThis.NJ;
  if (!NJ || !NJ.context) return;
  const isTop = window.top === window;
  const HOST = location.host;

  // ---------- settings ----------
  let settings = Object.assign({}, NJ.store.DEFAULTS);
  NJ.store.settings().then((s) => (settings = s)).catch(() => {});
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes["nj:settings"]) settings = Object.assign({}, NJ.store.DEFAULTS, changes["nj:settings"].newValue || {});
    });
  }

  function inEditable(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return !!t.isContentEditable;
  }

  function isShortcut(e) {
    if ((e.key || "").toLowerCase() !== settings.shortcutKey) return false;
    switch (settings.shortcutMod) {
      case "ctrl":
        return e.ctrlKey && !e.metaKey && !e.altKey;
      case "meta":
        return e.metaKey && !e.ctrlKey && !e.altKey;
      case "alt":
        return e.altKey && !e.ctrlKey && !e.metaKey;
      default:
        return (e.ctrlKey || e.metaKey) && !e.altKey;
    }
  }

  function isOpen() {
    return !!(palette && palette.open);
  }

  // Capture phase on window. stopImmediatePropagation keeps Workspace from
  // also acting on the key.
  window.addEventListener(
    "keydown",
    (e) => {
      if (isTop && isOpen() && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        safe(closePalette);
        return;
      }
      if (!isShortcut(e)) return;
      if (isTop && isOpen()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        safe(closePalette); // shortcut toggles
        return;
      }
      if (inEditable(e.target) && !settings.allowInFields) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isTop) safe(openPalette);
      else window.top.postMessage({ type: "nowjump:open" }, location.origin);
    },
    true
  );

  // Fallback: if a page handler registered earlier on window swallowed the
  // keydown, the keyup still arrives. Closing twice is harmless.
  window.addEventListener(
    "keyup",
    (e) => {
      if (isTop && isOpen() && e.key === "Escape") {
        e.preventDefault();
        safe(closePalette);
      }
    },
    true
  );

  if (!isTop) return;

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "nowjump:open" && e.origin === location.origin) safe(openPalette);
  });
  window.addEventListener("pagehide", () => safe(closePalette));

  // ---------- state ----------
  let palette = null;
  let ctx = null;
  let sess = null;
  let hostData = { recents: [], usage: {}, tables: {} };
  let contextCmds = [];
  let matches = [];
  let notice = null;
  let query = "";
  let gen = 0; // increments on every open/close; stale async work checks it
  let abort = null;
  let contextAbort = null;
  let debounce = null;
  let watchdog = null;
  let submenu = null;

  const LIVE_DEBOUNCE_MS = 90;
  const WATCHDOG_MS = 10000;

  // Every entry point goes through this. A thrown error becomes a notice,
  // never a dead palette.
  function safe(fn, ...args) {
    try {
      const r = fn(...args);
      if (r && typeof r.catch === "function") r.catch(fail);
      return r;
    } catch (e) {
      fail(e);
    }
  }
  function fail(e) {
    if (e && e.name === "AbortError") return;
    notice = { text: NJ.api.describe(e), danger: true };
    clearTimeout(watchdog);
    try {
      paint(false);
    } catch (_) {
      // Rendering itself failed. Last resort: close so the page is usable.
      if (palette) palette.close();
    }
  }

  function frameHref() {
    try {
      const f = document.getElementById("gsft_main");
      return f && f.contentWindow ? f.contentWindow.location.href : null;
    } catch (_) {
      return null;
    }
  }

  function ctxLabel() {
    if (!ctx) return "";
    if (ctx.table && ctx.sysId) return ctx.table + " · " + ctx.sysId.slice(0, 8);
    if (ctx.table) return ctx.table + " list";
    return "";
  }

  function withDeadline(promise, ms, fallback) {
    return Promise.race([promise, new Promise((res) => setTimeout(() => res(fallback), ms))]);
  }

  async function openPalette() {
    if (!palette) palette = new NJ.Palette({ onQuery: (q) => safe(onQuery, q), onExecute: (i, o) => safe(onExecute, i, o), onClose });
    const myGen = ++gen;
    ctx = NJ.context.parseContext(location.href, frameHref());
    query = "";
    matches = [];
    notice = null;
    submenu = null;
    contextCmds = [];
    if (abort) abort.abort();
    if (contextAbort) contextAbort.abort();
    palette.show(ctxLabel());
    // Paint recents immediately from whatever we already have; storage catches up below.
    paint(false);

    const [s, d] = await Promise.all([
      withDeadline(NJ.api.session(), 5000, { token: null, userId: null, userName: null }),
      withDeadline(NJ.store.hostData(HOST), 1500, hostData)
    ]);
    if (myGen !== gen) return;
    sess = s;
    hostData = d;
    if (!sess.token) notice = { text: NJ.api.describe(new NJ.api.ApiError("notoken")), danger: true };
    paint(false);
    if (!sess.token) return;

    // Roles are needed for admin-only shortcuts; fetch once, don't block.
    NJ.registry
      .userRoles(sess)
      .then(() => myGen === gen && !query && paint(false))
      .catch(() => {});

    contextAbort = new AbortController();
    try {
      const cmds = await NJ.registry.contextCommands(ctx, sess, settings, contextAbort.signal, hostData, HOST);
      if (myGen !== gen) return;
      contextCmds = cmds;
      paint(false);
    } catch (e) {
      if (e && e.name !== "AbortError" && myGen === gen) paint(false);
    }
  }

  function closePalette() {
    if (palette) palette.close();
  }

  function onClose() {
    gen++;
    if (abort) abort.abort();
    if (contextAbort) contextAbort.abort();
    clearTimeout(debounce);
    clearTimeout(watchdog);
  }

  function filterContext(q) {
    if (!q) return contextCmds;
    return NJ.match.rank(q.replace(/^>\s*/, ""), contextCmds, hostData.usage, Date.now());
  }

  function paint(loading) {
    if (!palette || !palette.open) return;
    if (submenu) {
      palette.render([{ group: "matches", items: submenu.items }], submenu.notice || null, false);
      return;
    }
    const groups = [{ group: "context", items: filterContext(query) }];
    if (!query) groups.push({ group: "recents", items: NJ.registry.recentCommands(hostData) });
    else groups.push({ group: "matches", items: matches });
    palette.render(groups, notice, loading);
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (!isOpen()) return;
      if (abort) abort.abort();
      notice = { text: "The instance didn't answer in time. Showing the local list only. Try again or narrow the search.", danger: false };
      paint(false);
    }, WATCHDOG_MS);
  }

  function onQuery(q) {
    query = q;
    submenu = null;
    notice = null;
    if (abort) abort.abort();
    clearTimeout(debounce);
    clearTimeout(watchdog);

    if (!q.trim()) {
      matches = [];
      paint(false);
      return;
    }
    // Instant pass: curated matches, no network. Typing always shows something.
    matches = NJ.registry.searchLocal(q, ctx, sess || {}, hostData);
    const needsLive = !!(sess && sess.token);
    paint(needsLive && matches.length === 0);
    if (!needsLive) return;
    armWatchdog();
    debounce = setTimeout(() => safe(runSearch), LIVE_DEBOUNCE_MS);
  }

  async function runSearch() {
    const myGen = gen;
    const mine = (abort = new AbortController());
    const q = query;
    try {
      const r = await NJ.registry.search(q, ctx, sess || {}, hostData, HOST, mine.signal);
      if (mine.signal.aborted || q !== query || myGen !== gen) return;
      clearTimeout(watchdog);
      matches = r.matches;
      notice = r.notice ? { text: r.notice } : null;
      paint(false);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (q !== query || myGen !== gen) return;
      clearTimeout(watchdog);
      // Keep the local matches on screen; say why the live part failed.
      notice = { text: NJ.api.describe(e), danger: true };
      paint(false);
    }
  }

  function navigate(url, newTab) {
    const abs = new URL(url, location.origin).href;
    if (newTab) window.open(abs, "_blank", "noopener");
    else location.assign(abs);
  }

  async function onExecute(item, opts) {
    opts = opts || {};
    if (!item) {
      const rec = hostData.recents && hostData.recents[0];
      if (rec && rec.url) {
        navigate(rec.url, opts.newTab || settings.openInNewTab);
        closePalette();
      }
      return;
    }
    if (item.run) {
      const res = await item.run();
      if (res && res.submenu === "update-set") return openUpdateSetMenu(res);
      if (res && res.switchTo) return doSwitch(res);
      return;
    }
    if (!item.url) return;
    const newTab = opts.newTab || (item.newTab != null ? item.newTab : settings.openInNewTab);
    NJ.store
      .recordUse(HOST, { id: item.id, kind: item.kind, label: item.label, secondary: item.secondary, meta: item.meta, url: item.url, table: item.table || null, newTab: item.newTab }, settings.maxRecents)
      .catch(() => {});
    navigate(item.url, newTab);
    closePalette();
  }

  // ---------- update set submenu ----------
  async function openUpdateSetMenu(res) {
    submenu = { kind: "update-set", items: [], notice: { text: "Loading update sets…" }, prefId: res.prefId, currentId: res.currentId };
    paint(false);
    armWatchdog();
    try {
      const sets = await NJ.registry.inProgressSets();
      clearTimeout(watchdog);
      if (!submenu || submenu.kind !== "update-set") return;
      submenu.items = sets
        .filter((s) => NJ.api.val(s, "sys_id") !== res.currentId)
        .map((s) => ({
          id: "us:" + NJ.api.val(s, "sys_id"),
          kind: "set",
          label: NJ.api.dv(s, "name"),
          secondary: NJ.api.dv(s, "application") || undefined,
          meta: "switch",
          warn: NJ.api.val(s, "is_default") === "true",
          run: async () => ({ switchTo: NJ.api.val(s, "sys_id"), name: NJ.api.dv(s, "name"), prefId: res.prefId })
        }));
      submenu.notice = submenu.items.length ? null : { text: "No other in-progress update sets. Create one in Update Sets first." };
    } catch (e) {
      clearTimeout(watchdog);
      if (submenu) submenu.notice = { text: NJ.api.describe(e), danger: true };
    }
    paint(false);
  }

  async function doSwitch(res) {
    const cur = contextCmds.find((c) => c.id === "act:update-set");
    const from = cur ? cur.label.replace(/^Update set: /, "") : "current set";
    submenu = {
      kind: "confirm",
      items: [
        {
          id: "confirm:switch",
          kind: "action",
          label: "Switch to " + res.name,
          secondary: "from " + from + " - page will reload",
          run: async () => {
            try {
              await NJ.registry.switchUpdateSet(res.switchTo, res.prefId, sess);
              location.reload();
            } catch (e) {
              submenu = { kind: "confirm", items: [], notice: { text: NJ.api.describe(e), danger: true } };
              paint(false);
            }
          }
        },
        {
          id: "confirm:cancel",
          kind: "action",
          label: "Cancel",
          run: async () => {
            submenu = null;
            paint(false);
          }
        }
      ]
    };
    paint(false);
  }
})();

(async function () {
  const S = globalThis.NJ.store;
  const $ = (id) => document.getElementById(id);
  const fields = ["shortcutKey", "shortcutMod", "allowInFields", "openInNewTab", "otherUiNewTab", "workspacePath"];
  const status = $("status");

  function showShortcut(s) {
    const mod = { "ctrl-or-meta": "Ctrl / Cmd", ctrl: "Ctrl", meta: "Cmd", alt: "Alt" }[s.shortcutMod] || "Ctrl / Cmd";
    $("shortcut-display").textContent = mod + " " + String(s.shortcutKey).toUpperCase();
  }

  function flash(msg) {
    status.textContent = msg;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (status.textContent = ""), 1800);
  }

  function fill(s) {
    for (const f of fields) {
      const el = $(f);
      if (el.type === "checkbox") el.checked = !!s[f];
      else el.value = s[f];
    }
    showShortcut(s);
  }

  const s = await S.settings();
  fill(s);

  for (const f of fields) {
    $(f).addEventListener("change", async () => {
      const el = $(f);
      let v = el.type === "checkbox" ? el.checked : el.value.trim();
      if (f === "shortcutKey") {
        v = v.toLowerCase();
        if (!/^[a-z0-9]$/.test(v)) {
          flash("Use a single letter or digit.");
          el.value = s.shortcutKey;
          return;
        }
      }
      if (f === "workspacePath") v = v.replace(/^\/+|\/+$/g, "") || "sow";
      const next = await S.saveSettings({ [f]: v });
      Object.assign(s, next);
      showShortcut(next);
      flash("Saved");
    });
  }

  // ---------- custom instance domains ----------
  function normalizeDomain(v) {
    let d = String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    if (!d) return null;
    if (/^\*\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return d;
    return null;
  }
  function patternsFor(d) {
    return d.startsWith("*.") ? ["https://" + d + "/*"] : ["https://" + d + "/*", "https://*." + d + "/*"];
  }
  function syncBackground() {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type: "nowjump:sync-domains" }, () => res());
      } catch (_) {
        res();
      }
    });
  }
  async function renderDomains() {
    const list = await S.domains();
    const ul = $("domainList");
    ul.textContent = "";
    for (const d of list) {
      let granted = false;
      try {
        granted = await chrome.permissions.contains({ origins: patternsFor(d) });
      } catch (_) {}
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = d;
      const state = document.createElement("span");
      state.className = "state";
      state.textContent = granted ? "enabled" : "permission not granted";
      const btn = document.createElement("button");
      btn.textContent = granted ? "Remove" : "Allow";
      btn.addEventListener("click", async () => {
        if (granted) {
          try {
            await chrome.permissions.remove({ origins: patternsFor(d) });
          } catch (_) {}
          await S.saveDomains((await S.domains()).filter((x) => x !== d));
          await syncBackground();
          flash("Removed " + d);
        } else {
          const ok = await chrome.permissions.request({ origins: patternsFor(d) });
          await syncBackground();
          flash(ok ? "Enabled on " + d + ". Reload your instance tab." : "Permission declined.");
        }
        renderDomains();
      });
      li.appendChild(code);
      li.appendChild(state);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    $("domainHelp").textContent = list.length ? "After enabling a domain, reload any tab already open on that instance." : "";
  }
  $("domainAdd").addEventListener("click", async () => {
    const d = normalizeDomain($("domainInput").value);
    if (!d) {
      flash("Enter a hostname like itsm.example.com or *.example.com.");
      return;
    }
    if (/service-now\.com$/.test(d)) {
      flash("service-now.com is already covered.");
      return;
    }
    const list = await S.domains();
    if (!list.includes(d)) await S.saveDomains(list.concat(d));
    $("domainInput").value = "";
    let ok = false;
    try {
      ok = await chrome.permissions.request({ origins: patternsFor(d) });
    } catch (e) {
      flash("Chrome refused: " + (e && e.message ? e.message : "unknown error"));
    }
    await syncBackground();
    if (ok) flash("Enabled on " + d + ". Reload your instance tab.");
    renderDomains();
  });
  renderDomains();

  $("clear").addEventListener("click", async () => {
    if (!confirm("Clear recents, settings and custom domains for every instance? This can't be undone.")) return;
    for (const d of await S.domains()) {
      try {
        await chrome.permissions.remove({ origins: patternsFor(d) });
      } catch (_) {}
    }
    await S.clearAll();
    await syncBackground();
    renderDomains();
    const fresh = await S.settings();
    Object.assign(s, fresh);
    fill(fresh);
    flash("Cleared");
  });
})();

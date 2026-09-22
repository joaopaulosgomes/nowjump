// NowJump palette UI. Rendered in a closed shadow root attached to
// <html> so host CSS cannot reach it and its CSS cannot leak out.
//
// The palette is dumb on purpose: it renders groups of commands, reports
// keyboard intent to a controller, and shows notices. All data comes from
// content.js.
(function (root) {
  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483000;
  background: rgba(0,0,0,0.32);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text);
  --surface: #ffffff; --raised: #f5f5f4; --text: #1b1b1b; --text2: #5f5e5a; --muted: #8a8985;
  --border: #d9d7d0; --hl: #e8eef7; --hl-text: #0c447c; --warn-bg: #faeeda; --warn-text: #633806;
  --danger-bg: #fcebeb; --danger-text: #791f1f; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.backdrop[hidden] { display: none; }
@media (prefers-color-scheme: dark) {
  .backdrop {
    --surface: #1f2023; --raised: #2a2b2f; --text: #e8e6e1; --text2: #a5a39c; --muted: #77766f;
    --border: #3a3b40; --hl: #243247; --hl-text: #b5d4f4; --warn-bg: #412402; --warn-text: #fac775;
    --danger-bg: #501313; --danger-text: #f7c1c1;
  }
}
.panel {
  width: 560px; max-width: calc(100vw - 32px); max-height: 70vh;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  display: flex; flex-direction: column; overflow: hidden;
}
.brand { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--border); font: 11px/1 var(--mono); color: var(--muted); }
.brand .left { display: flex; align-items: center; gap: 8px; }
.brand img { height: 18px; width: auto; display: block; }
.brand .name { font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--text2); }
.brand .credit { font-size: 7px; letter-spacing: 0.02em; color: var(--muted); }
.input-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.input-row input {
  flex: 1; border: 0; outline: 0; background: transparent; color: var(--text);
  font: inherit; font-size: 15px; line-height: 20px; padding: 0; margin: 0;
}
.input-row input::placeholder { color: var(--muted); }
.hint { font: 11px/1 var(--mono); color: var(--muted); white-space: nowrap; }
.context-badge {
  font: 11px/1 var(--mono); color: var(--text2); background: var(--raised);
  border-radius: 6px; padding: 5px 8px; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.list { overflow-y: auto; padding: 6px 0; }
.group-h { font-size: 11px; color: var(--muted); padding: 8px 14px 4px; }
.row {
  display: grid; grid-template-columns: 52px minmax(0,1fr) auto; align-items: center; gap: 10px;
  padding: 7px 14px; cursor: pointer; min-height: 34px;
}
.row[aria-selected="true"] { background: var(--hl); }
.row[aria-selected="true"] .primary, .row[aria-selected="true"] .kind { color: var(--hl-text); }
.kind { font: 11px/1 var(--mono); color: var(--muted); }
.text { display: flex; gap: 8px; min-width: 0; align-items: baseline; }
.primary { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 40px; }
.secondary { font-size: 13px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 0; }
.meta { font: 11px/1 var(--mono); color: var(--muted); white-space: nowrap; }
.badge { font-size: 11px; font-weight: 500; border-radius: 6px; padding: 3px 7px; white-space: nowrap; }
.badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.more { font-size: 11px; color: var(--muted); padding: 4px 14px 8px 76px; }
.notice { font-size: 13px; color: var(--text2); padding: 14px; line-height: 1.5; }
.notice.danger { background: var(--danger-bg); color: var(--danger-text); }
.footer { display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid var(--border); font: 11px/1 var(--mono); color: var(--muted); }
.footer b { font-weight: 500; color: var(--text2); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: no-preference) {
  .panel { animation: in 90ms ease-out; }
  @keyframes in { from { transform: translateY(-4px); opacity: 0.6; } to { transform: none; opacity: 1; } }
}
`;

  const GROUP_LABEL = { context: "This record", recents: "Recent", matches: "Matches" };
  const GROUP_LIMIT = { context: 4, recents: 6, matches: 8 };

  function brandIconUrl() {
    return root.NJ && root.NJ.brand ? root.NJ.brand.icon : null;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  class Palette {
    constructor(handlers) {
      this.h = handlers; // {onQuery, onExecute, onClose}
      this.host = null;
      this.shadow = null;
      this.items = [];
      this.sel = 0;
      this.open = false;
      this.prevFocus = null;
      this.uid = 0;
    }

    mount() {
      if (this.host) return;
      this.host = document.createElement("nowjump-palette");
      this.host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;";
      this.shadow = this.host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = CSS;
      this.shadow.appendChild(style);
      this.root = el("div", "backdrop");
      this.root.hidden = true;
      this.root.style.display = "none";
      // Both events: some pages swallow one of them.
      for (const evt of ["mousedown", "click"]) {
        this.root.addEventListener(evt, (e) => {
          if (e.target === this.root) this.close();
        });
      }
      const panel = el("div", "panel");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", "NowJump");

      const brand = el("div", "brand");
      const left = el("div", "left");
      const iconUrl = brandIconUrl();
      if (iconUrl) {
        const img = document.createElement("img");
        img.src = iconUrl;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        left.appendChild(img);
      }
      left.appendChild(el("span", "name", "NowJump"));
      brand.appendChild(left);
      brand.appendChild(el("span", "credit", "developed by Joao Gomes"));

      const inputRow = el("div", "input-row");
      this.badge = el("div", "context-badge");
      this.badge.hidden = true;
      this.input = document.createElement("input");
      this.input.type = "text";
      this.input.placeholder = "Table, record number, sys_id, or action";
      this.input.setAttribute("role", "combobox");
      this.input.setAttribute("aria-expanded", "true");
      this.input.setAttribute("aria-autocomplete", "list");
      this.input.setAttribute("aria-controls", "nj-list");
      this.input.setAttribute("autocomplete", "off");
      this.input.setAttribute("spellcheck", "false");
      const hint = el("button", "hint", "esc");
      hint.type = "button";
      hint.setAttribute("aria-label", "Close");
      hint.style.cssText = "border:0;background:transparent;cursor:pointer;padding:4px 6px;border-radius:4px;";
      hint.addEventListener("click", () => this.close());
      inputRow.appendChild(this.badge);
      inputRow.appendChild(this.input);
      inputRow.appendChild(hint);

      this.list = el("div", "list");
      this.list.id = "nj-list";
      this.list.setAttribute("role", "listbox");
      this.live = el("div", "sr");
      this.live.setAttribute("aria-live", "polite");

      const footer = el("div", "footer");
      for (const [k, v] of [["↑↓", "move"], ["↵", "open"], ["⇧↵", "new tab"], [">", "actions only"]]) {
        const span = el("span");
        span.appendChild(el("b", null, k));
        span.appendChild(document.createTextNode(" " + v));
        footer.appendChild(span);
      }

      panel.appendChild(brand);
      panel.appendChild(inputRow);
      panel.appendChild(this.list);
      panel.appendChild(this.live);
      panel.appendChild(footer);
      this.root.appendChild(panel);
      this.shadow.appendChild(this.root);

      this.input.addEventListener("input", () => this.h.onQuery(this.input.value));
      this.input.addEventListener("keydown", (e) => this.onKey(e));
      // Focus trap: anything that tries to leave the input comes back.
      this.root.addEventListener("focusout", (e) => {
        if (this.open && !this.root.contains(e.relatedTarget)) setTimeout(() => this.open && this.input.focus(), 0);
      });
      document.documentElement.appendChild(this.host);
    }

    show(ctxLabel) {
      this.mount();
      this.prevFocus = document.activeElement;
      this.open = true;
      this.root.hidden = false;
      this.root.style.display = "flex";
      this.input.value = "";
      this.setContextBadge(ctxLabel);
      this.render([], null, true);
      this.input.focus();
    }

    close() {
      if (!this.open) return;
      this.open = false;
      this.root.hidden = true;
      this.root.style.display = "none";
      this.items = [];
      try {
        this.input.blur();
      } catch (_) {}
      const pf = this.prevFocus;
      this.prevFocus = null;
      if (pf && typeof pf.focus === "function") {
        try {
          pf.focus();
        } catch (_) {}
      }
      this.h.onClose && this.h.onClose();
    }

    setContextBadge(label) {
      if (label) {
        this.badge.textContent = label;
        this.badge.hidden = false;
      } else {
        this.badge.hidden = true;
      }
    }

    // groups: [{group:'context'|'recents'|'matches', items:[]}], notice: {text, danger?} | null
    render(groups, notice, loading) {
      this.list.textContent = "";
      this.items = [];
      const nonEmpty = groups.filter((g) => g.items.length);
      const showHeaders = nonEmpty.length > 1;
      for (const g of nonEmpty) {
        if (showHeaders) this.list.appendChild(el("div", "group-h", GROUP_LABEL[g.group] || g.group));
        const limit = GROUP_LIMIT[g.group] || 8;
        const shown = g.items.slice(0, limit);
        for (const it of shown) this.list.appendChild(this.row(it));
        if (g.items.length > limit) this.list.appendChild(el("div", "more", "+" + (g.items.length - limit) + " more - keep typing to narrow"));
      }
      if (notice) {
        const n = el("div", "notice" + (notice.danger ? " danger" : ""), notice.text);
        this.list.appendChild(n);
      } else if (!this.items.length && !loading) {
        this.list.appendChild(el("div", "notice", "Nothing matches. Try a table name, a record number, or a sys_id."));
      } else if (!this.items.length && loading) {
        this.list.appendChild(el("div", "notice", "Looking up…"));
      }
      this.sel = 0;
      this.paintSelection();
      this.live.textContent = this.items.length ? this.items.length + " results" : notice ? notice.text : "";
    }

    row(it) {
      const r = el("div", "row");
      r.setAttribute("role", "option");
      r.id = "nj-opt-" + ++this.uid;
      r.appendChild(el("span", "kind", it.kind || ""));
      const t = el("div", "text");
      t.appendChild(el("span", "primary", it.label || it.table || it.id || ""));
      if (it.secondary) t.appendChild(el("span", "secondary", it.secondary));
      r.appendChild(t);
      if (it.warn) {
        r.appendChild(el("span", "badge warn", "Default"));
      } else {
        r.appendChild(el("span", "meta", it.meta || ""));
      }
      const idx = this.items.length;
      this.items.push({ item: it, el: r });
      r.addEventListener("mousemove", () => {
        if (this.sel !== idx) {
          this.sel = idx;
          this.paintSelection();
        }
      });
      r.addEventListener("click", (e) => this.h.onExecute(it, { newTab: e.shiftKey || e.metaKey || e.ctrlKey }));
      return r;
    }

    paintSelection() {
      this.items.forEach((x, i) => x.el.setAttribute("aria-selected", i === this.sel ? "true" : "false"));
      const cur = this.items[this.sel];
      if (cur) {
        this.input.setAttribute("aria-activedescendant", cur.el.id);
        cur.el.scrollIntoView({ block: "nearest" });
      } else {
        this.input.removeAttribute("aria-activedescendant");
      }
    }

    move(delta) {
      if (!this.items.length) return;
      this.sel = (this.sel + delta + this.items.length) % this.items.length;
      this.paintSelection();
    }

    onKey(e) {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          this.close();
          break;
        case "ArrowDown":
        case "Tab":
          if (e.key === "Tab" && e.shiftKey) {
            e.preventDefault();
            this.move(-1);
            break;
          }
          e.preventDefault();
          this.move(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          this.move(-1);
          break;
        case "Enter": {
          e.preventDefault();
          const cur = this.items[this.sel];
          if (cur) this.h.onExecute(cur.item, { newTab: e.shiftKey || e.metaKey || e.ctrlKey });
          else this.h.onExecute(null, { newTab: e.shiftKey });
          break;
        }
        default:
          break;
      }
    }
  }

  root.NJ = root.NJ || {};
  root.NJ.Palette = Palette;
})(typeof globalThis !== "undefined" ? globalThis : this);

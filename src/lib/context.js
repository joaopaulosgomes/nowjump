// NowJump context detection. Pure functions only - no DOM access in here so
// the whole module runs under node for tests.
//
// Shells:
//   classic   - UI16, /navpage.do frameset or a bare /<table>.do page
//   polaris   - Next Experience shell wrapping classic pages under /now/nav/ui/classic/
//   workspace - a UXF workspace, /now/<workspace>/record/<table>/<sys_id>
(function (root) {
  const SYS_ID = /^[0-9a-f]{32}$/i;
  const TABLE = /^[a-z][a-z0-9_]*$/;

  function parseClassicPath(pathname, search) {
    // /incident.do?sys_id=..., /incident_list.do, /sys_properties_list.do?sysparm_query=...
    const m = pathname.match(/^\/([a-z][a-z0-9_]*)\.do$/i);
    if (!m) return null;
    const base = m[1];
    const params = new URLSearchParams(search || "");
    if (base.endsWith("_list")) {
      const table = base.slice(0, -5);
      return TABLE.test(table) ? { table, sysId: null, list: true } : null;
    }
    const sysId = params.get("sys_id");
    if (!TABLE.test(base)) return null;
    return {
      table: base,
      sysId: sysId && SYS_ID.test(sysId) ? sysId.toLowerCase() : null,
      list: false
    };
  }

  // href: top frame URL. frameHref: URL of gsft_main when present, else null.
  function parseContext(href, frameHref) {
    let url;
    try {
      url = new URL(href);
    } catch (_) {
      return { shell: "classic", table: null, sysId: null, list: false, workspace: null };
    }
    const path = url.pathname;

    // Workspace record: /now/sow/record/incident/<sys_id>
    let m = path.match(/^\/now\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)*?)\/record\/([a-z][a-z0-9_]*)\/([0-9a-f]{32})/i);
    if (m) {
      return { shell: "workspace", workspace: m[1], table: m[2], sysId: m[3].toLowerCase(), list: false };
    }
    // Workspace list: /now/sow/list/params/list-id/... - table not recoverable from URL
    m = path.match(/^\/now\/([a-z0-9_-]+)\/list\b/i);
    if (m) {
      return { shell: "workspace", workspace: m[1], table: null, sysId: null, list: true };
    }
    // Next Experience wrapping a classic page
    m = path.match(/^\/now\/nav\/ui\/classic\/params\/target\/(.+)$/i);
    if (m) {
      let target;
      try {
        target = decodeURIComponent(m[1]);
      } catch (_) {
        target = m[1];
      }
      const q = target.indexOf("?");
      const tPath = "/" + (q === -1 ? target : target.slice(0, q));
      const tSearch = q === -1 ? "" : target.slice(q);
      const inner = parseClassicPath(tPath, tSearch) || {};
      return { shell: "polaris", workspace: null, table: inner.table || null, sysId: inner.sysId || null, list: !!inner.list };
    }
    if (path.startsWith("/now/")) {
      // Some other Next Experience page. Fall back to the frame if one exists.
      const inner = frameHref ? parseContextFromFrame(frameHref) : {};
      return { shell: "polaris", workspace: null, table: inner.table || null, sysId: inner.sysId || null, list: !!inner.list };
    }
    // Classic frameset
    if (/^\/(navpage|nav_to)\.do$/i.test(path)) {
      const inner = frameHref ? parseContextFromFrame(frameHref) : {};
      return { shell: "classic", workspace: null, table: inner.table || null, sysId: inner.sysId || null, list: !!inner.list };
    }
    const direct = parseClassicPath(path, url.search) || {};
    return { shell: "classic", workspace: null, table: direct.table || null, sysId: direct.sysId || null, list: !!direct.list };
  }

  function parseContextFromFrame(frameHref) {
    try {
      const u = new URL(frameHref);
      return parseClassicPath(u.pathname, u.search) || {};
    } catch (_) {
      return {};
    }
  }

  // URL builders. Every builder returns an absolute path, never a full origin,
  // so the caller controls which instance it lands on.
  function classicTarget(target) {
    return "/now/nav/ui/classic/params/target/" + encodeURIComponent(target);
  }

  function listUrl(ctx, table, query) {
    const target = table + "_list.do" + (query ? "?sysparm_query=" + encodeURIComponent(query) : "");
    return ctx.shell === "classic" ? "/" + target : classicTarget(target);
  }

  function recordUrl(ctx, table, sysId) {
    const target = table + ".do?sys_id=" + sysId;
    return ctx.shell === "classic" ? "/" + target : classicTarget(target);
  }

  function pageUrl(ctx, page) {
    // page like "stats.do" or "cache.do"
    return ctx.shell === "classic" ? "/" + page : classicTarget(page);
  }

  // The "other" UI for the currently open record.
  function otherUiUrl(ctx, workspacePath) {
    if (!ctx.table || !ctx.sysId) return null;
    if (ctx.shell === "workspace") {
      return "/" + ctx.table + ".do?sys_id=" + ctx.sysId;
    }
    const ws = (workspacePath || "sow").replace(/^\/+|\/+$/g, "");
    return "/now/" + ws + "/record/" + ctx.table + "/" + ctx.sysId;
  }

  function isSysId(s) {
    return SYS_ID.test((s || "").trim());
  }

  root.NJ = root.NJ || {};
  root.NJ.context = { parseContext, listUrl, recordUrl, pageUrl, otherUiUrl, isSysId, SYS_ID, TABLE };
})(typeof globalThis !== "undefined" ? globalThis : this);

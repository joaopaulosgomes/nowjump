// NowJump command registry. Producers return plain command objects:
//   { id, kind, label, secondary?, meta?, url?, run?, newTab?, group }
// kind: table | page | record | action | set | recent
// group: context | recents | matches
//
// Nothing here touches the DOM. The palette renders whatever comes back.
(function (root) {
  const { context: C, match: M, api: A, curated, chain, catalog, store: S } = root.NJ;

  // ---------- helpers ----------
  // Record numbers: a letter prefix followed by at least four digits. The prefix
  // picks the table(s) to try; unknown prefixes fall back to `task`, which
  // covers every task-derived class through sys_class_name.
  const NUMBER_RE = /^([A-Za-z]{2,12})(\d{4,})$/;
  const NUMBER_TABLES = {
    INC: ["incident"],
    CHG: ["change_request"],
    CTASK: ["change_task"],
    PRB: ["problem"],
    PTASK: ["problem_task"],
    RITM: ["sc_req_item"],
    REQ: ["sc_request"],
    SCTASK: ["sc_task"],
    TASK: ["em_ci_severity_task", "task"],
    DUP: ["reconcile_duplicate_task"],
    CMDBTASK: ["cmdb_data_management_task"],
    RECOMP: ["cmdb_multisource_recomp_task"],
    DMND: ["dmn_demand"],
    GSTASK: ["gsw_task"],
    STRY: ["rm_story"],
    KB: ["kb_knowledge"],
    // Not task-derived: their own number fields.
    ALERT: ["em_alert"],
    DIS: ["discovery_status"]
  };
  const NUMBER_CASE = { ALERT: "Alert" }; // display case for prefixes the platform doesn't upper-case
  function numberTargets(term) {
    const m = term.trim().match(NUMBER_RE);
    if (!m) return null;
    const prefix = m[1].toUpperCase();
    const tables = (NUMBER_TABLES[prefix] || []).slice();
    if (!tables.includes("task") && !["ALERT", "DIS", "KB"].includes(prefix)) tables.push("task");
    const number = (NUMBER_CASE[prefix] || prefix) + m[2];
    return { prefix, number, tables };
  }

  let rolesCache = { userId: null, roles: null };
  async function userRoles(sess) {
    if (!sess.userId) return new Set();
    if (rolesCache.userId === sess.userId && rolesCache.roles) return rolesCache.roles;
    try {
      const rows = await A.query("sys_user_has_role", {
        sysparm_query: "user=" + sess.userId,
        sysparm_fields: "role.name",
        sysparm_limit: 300
      });
      const set = new Set(rows.map((r) => r["role.name"]).filter(Boolean));
      rolesCache = { userId: sess.userId, roles: set };
      return set;
    } catch (_) {
      return new Set();
    }
  }

  let prodCache = null;
  async function isProduction() {
    if (prodCache !== null) return prodCache;
    try {
      const rows = await A.query("sys_properties", {
        sysparm_query: "name=glide.installation.production",
        sysparm_fields: "value",
        sysparm_limit: 1
      });
      prodCache = rows.length ? String(rows[0].value).toLowerCase() === "true" : true;
    } catch (_) {
      prodCache = true; // unreadable = treat as production, hide write actions
    }
    return prodCache;
  }

  function tableCmd(ctx, table, label, id, extra) {
    return Object.assign(
      {
        id: id || "tbl:" + table,
        kind: "table",
        label: label || table,
        secondary: label && label !== table ? undefined : undefined,
        meta: table,
        url: C.listUrl(ctx, table),
        table,
        group: "matches"
      },
      extra || {}
    );
  }

  // ---------- curated ----------
  // Synchronous on purpose: this is what paints on every keystroke before any
  // network call. Role-restricted entries only appear once roles are cached.
  function curatedCommands(ctx, sess) {
    const roles = rolesCache.userId === (sess && sess.userId) && rolesCache.roles ? rolesCache.roles : new Set();
    const out = [];
    for (const c of curated.CURATED) {
      if (c.roles && !c.roles.some((r) => roles.has(r))) continue;
      if (c.table) {
        out.push({ id: c.id, kind: "table", label: c.label, aliases: c.aliases, meta: c.table, table: c.table, url: C.listUrl(ctx, c.table), group: "matches" });
      } else if (c.page) {
        out.push({ id: c.id, kind: "page", label: c.label, aliases: c.aliases, meta: c.page, url: C.pageUrl(ctx, c.page), group: "matches" });
      }
    }
    return out;
  }

  // ---------- offline catalog ----------
  let catalogCmds = null;
  function catalogCommands(ctx) {
    if (!catalogCmds || catalogCmds.shell !== ctx.shell) {
      const list = (catalog && catalog.CATALOG ? catalog.CATALOG : []).map(([name, label]) => ({
        id: "tbl:" + name, kind: "table", label: label && label !== name ? label : name,
        secondary: label && label !== name ? name : undefined, meta: name, table: name,
        url: C.listUrl(ctx, name), group: "matches", fromCatalog: true
      }));
      catalogCmds = { shell: ctx.shell, list };
    }
    return catalogCmds.list;
  }

  // ---------- existence verification ----------
  // Ask the instance which of these tables exist. Results are cached per
  // host; only unknown names hit the network. Returns Set of existing names.
  async function verifyTables(names, hostData, host, signal) {
    const known = new Set();
    const unknown = [];
    for (const n of new Set(names.filter(Boolean))) {
      if (hostData.tables && hostData.tables[n]) known.add(n);
      else if (S.isMissing(hostData, n)) continue;
      else unknown.push(n);
    }
    if (!unknown.length) return known;
    const found = {};
    for (let i = 0; i < unknown.length; i += 60) {
      const chunk = unknown.slice(i, i + 60);
      let rows;
      try {
        rows = await A.query("sys_db_object", { sysparm_query: "nameIN" + chunk.join(","), sysparm_fields: "name,label", sysparm_limit: chunk.length }, signal);
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        // Can't verify (403 on sys_db_object, network). Treat unknown as existing rather than hide everything.
        for (const n of chunk) known.add(n);
        continue;
      }
      for (const r of rows) {
        found[r.name] = r.label || r.name;
        known.add(r.name);
      }
    }
    const missing = unknown.filter((n) => !known.has(n));
    if (host && (Object.keys(found).length || missing.length)) {
      S.rememberExistence(host, found, missing).then((d) => Object.assign(hostData, { tables: d.tables, missing: d.missing })).catch(() => {});
      // Update in-memory copy now so the next keystroke benefits before the write lands.
      hostData.tables = Object.assign({}, hostData.tables, found);
      const now = Date.now();
      hostData.missing = Object.assign({}, hostData.missing);
      for (const n of missing) hostData.missing[n] = now;
    }
    return known;
  }

  function dropMissing(items, hostData) {
    return items.filter((it) => !it.table || !S.isMissing(hostData, it.table));
  }

  // ---------- live table search (SNX-8) ----------
  async function liveTables(ctx, query, signal, host) {
    const q = query.trim();
    if (q.length < 2 || !/^[a-z0-9_ ]+$/i.test(q)) return [];
    const enc = encodeURIComponent(q);
    const rows = await A.query(
      "sys_db_object",
      {
        sysparm_query: "nameLIKE" + enc + "^ORlabelLIKE" + enc + "^ORDERBYname",
        sysparm_fields: "name,label",
        sysparm_limit: 12
      },
      signal
    );
    const map = {};
    const out = rows.map((r) => {
      map[r.name] = r.label;
      return { id: "tbl:" + r.name, kind: "table", label: r.label || r.name, secondary: r.label && r.label !== r.name ? r.name : undefined, meta: r.name, table: r.name, url: C.listUrl(ctx, r.name), group: "matches" };
    });
    if (host && rows.length) root.NJ.store.rememberTables(host, map);
    return out;
  }

  // ---------- record number lookup ----------
  async function byNumber(ctx, term, hostData, signal) {
    const t = numberTargets(term);
    if (!t) return [];
    const fields = "sys_id,number,short_description,sys_class_name,name";
    let lastErr = null;
    for (const table of t.tables) {
      if (S.isMissing(hostData, table)) continue;
      try {
        const rows = await A.query(table, { sysparm_query: "number=" + t.number, sysparm_fields: fields, sysparm_limit: 1, sysparm_display_value: "all" }, signal);
        if (rows.length) {
          const r = rows[0];
          const cls = A.val(r, "sys_class_name") || table;
          const sid = A.val(r, "sys_id");
          return [{ id: "rec:" + cls + ":" + sid, kind: "record", label: A.dv(r, "number") || t.number, secondary: A.dv(r, "short_description") || A.dv(r, "name") || undefined, meta: cls, url: C.recordUrl(ctx, cls, sid), table: cls, sysId: sid, group: "matches" }];
        }
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        if (e instanceof A.ApiError && e.kind === "notfound") {
          S.rememberExistence(root.location ? root.location.host : "", {}, [table]).catch(() => {});
          continue;
        }
        lastErr = e; // 403 on one table: keep trying the others
      }
    }
    if (lastErr && lastErr instanceof A.ApiError && lastErr.kind !== "forbidden") throw lastErr;
    return [];
  }

  // ---------- sys_id resolution (SNX-9) ----------
  async function resolveSysId(ctx, sysId, hostData, signal) {
    const id = sysId.trim().toLowerCase();
    const recentTables = (hostData.recents || []).map((r) => r.table).filter(Boolean);
    const seen = new Set();
    const candidates = [];
    for (const t of recentTables.concat(curated.SYS_ID_CANDIDATES)) {
      if (!seen.has(t) && !S.isMissing(hostData, t)) {
        seen.add(t);
        candidates.push(t);
      }
    }
    const fields = "sys_id,number,name,short_description,sys_class_name";
    const results = [];
    const notFound = [];
    let forbidden = 0;
    // Batches of 6 keep the instance from seeing a burst of 30 parallel queries.
    for (let i = 0; i < candidates.length && !results.length; i += 6) {
      const batch = candidates.slice(i, i + 6);
      const settled = await Promise.allSettled(
        batch.map((t) => A.query(t, { sysparm_query: "sys_id=" + id, sysparm_fields: fields, sysparm_limit: 1, sysparm_display_value: "all" }, signal).then((rows) => ({ t, rows })))
      );
      for (const s of settled) {
        if (s.status === "rejected") {
          if (s.reason && s.reason.name === "AbortError") throw s.reason;
          if (s.reason instanceof A.ApiError && s.reason.kind === "forbidden") forbidden++;
          if (s.reason instanceof A.ApiError && s.reason.kind === "notfound") notFound.push(batch[settled.indexOf(s)]);
          continue;
        }
        if (s.value.rows.length) {
          const r = s.value.rows[0];
          const cls = A.val(r, "sys_class_name") || s.value.t;
          // task and incident both answer for an incident sys_id; keep one row per sys_id.
          if (results.some((x) => x.sysId === id && x.table === cls)) continue;
          const label = A.dv(r, "number") || A.dv(r, "name") || cls;
          results.push({ id: "rec:" + cls + ":" + id, kind: "record", label, secondary: A.dv(r, "short_description") || undefined, meta: cls, url: C.recordUrl(ctx, cls, id), table: cls, sysId: id, group: "matches" });
        }
      }
    }
    if (notFound.length && root.location) S.rememberExistence(root.location.host, {}, notFound).catch(() => {});
    return { results, forbidden, tried: candidates.length };
  }

  // ---------- context: other UI (SNX-11) ----------
  function otherUiCommand(ctx, settings) {
    const url = C.otherUiUrl(ctx, settings.workspacePath);
    if (!url) return null;
    const target = ctx.shell === "workspace" ? "classic UI" : "Workspace";
    return { id: "act:other-ui", kind: "action", label: "Open in " + target, secondary: ctx.table, meta: "⇧↵ new tab", url, newTab: settings.otherUiNewTab, group: "context", table: ctx.table };
  }

  // ---------- context: chain (SNX-12) ----------
  async function chainCommands(ctx, signal) {
    if (!ctx.table || !ctx.sysId) return [];
    const rels = chain.chainFor(ctx.table);
    if (!rels.length) return [];
    const out = [];
    // Parent relations need the open record's reference values. One fetch covers them all.
    const parentRels = rels.filter((r) => r.dir === "parent" || r.dir === "listFrom");
    let rec = null;
    if (parentRels.length) {
      try {
        rec = await A.getRecord(ctx.table, ctx.sysId, parentRels.map((r) => r.via).join(","), signal);
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
      }
    }
    for (const r of rels) {
      if (r.dir === "listFrom") {
        const ids = rec ? A.val(rec, r.via) : "";
        if (!ids) continue;
        out.push({ id: "chain:" + r.via, kind: "table", label: r.label, meta: r.table, url: C.listUrl(ctx, r.table, "sys_idIN" + ids), table: r.table, group: "context" });
        continue;
      }
      if (r.dir === "parent") {
        const tid = rec ? A.val(rec, r.via) : "";
        if (!tid) continue;
        out.push({ id: "chain:" + r.via, kind: "record", label: r.label, secondary: A.dv(rec, r.via) || undefined, meta: r.table, url: C.recordUrl(ctx, r.table, tid), table: r.table, sysId: tid, group: "context" });
      } else {
        const op = r.whereOp || "=";
        const q = r.where + op + ctx.sysId + (r.extraQuery ? "^" + r.extraQuery : "");
        out.push({ id: "chain:" + r.table + ":" + r.where, kind: "table", label: r.label, meta: r.table, url: C.listUrl(ctx, r.table, q), table: r.table, group: "context" });
      }
    }
    return out;
  }

  // ---------- context: update set (SNX-13) ----------
  async function currentUpdateSet(sess) {
    if (!sess.userId) return null;
    const prefs = await A.query("sys_user_preference", {
      sysparm_query: "name=sys_update_set^user=" + sess.userId,
      sysparm_fields: "sys_id,value",
      sysparm_limit: 1
    });
    if (!prefs.length || !prefs[0].value) return { prefId: null, set: null };
    const set = await A.getRecord("sys_update_set", prefs[0].value, "sys_id,name,is_default,state,application");
    return { prefId: prefs[0].sys_id, set };
  }

  async function inProgressSets() {
    return A.query("sys_update_set", {
      sysparm_query: "state=in progress^ORDERBYDESCsys_updated_on",
      sysparm_fields: "sys_id,name,is_default,application",
      sysparm_display_value: "all",
      sysparm_limit: 8
    });
  }

  async function switchUpdateSet(setId, prefId, sess) {
    // Preferred: the picker endpoint the platform's own header uses.
    try {
      await A.request("PUT", "/api/now/ui/concoursepicker/updateset", { sysparm_value: setId });
      return "picker";
    } catch (e) {
      if (!(e instanceof A.ApiError) || e.kind === "unauthorized") throw e;
    }
    // Fallback: write the preference directly.
    if (prefId) {
      await A.patchRecord("sys_user_preference", prefId, { value: setId });
      return "preference";
    }
    await A.request("POST", "/api/now/table/sys_user_preference", { name: "sys_update_set", user: sess.userId, value: setId }, { table: "sys_user_preference" });
    return "preference-created";
  }

  async function updateSetCommand(sess, signal) {
    let cur;
    try {
      cur = await currentUpdateSet(sess);
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      return null;
    }
    if (!cur) return null;
    const prod = await isProduction();
    const set = cur.set;
    const isDefault = set ? A.val(set, "is_default") === "true" : true;
    const name = set ? A.dv(set, "name") || A.val(set, "name") : "Default";
    return {
      id: "act:update-set",
      kind: "set",
      label: "Update set: " + name,
      secondary: prod ? "production - read only" : isDefault ? "work here is usually a mistake" : A.dv(set, "application") || undefined,
      meta: prod ? "" : "switch",
      warn: isDefault && !prod,
      group: "context",
      prod,
      prefId: cur.prefId,
      currentId: set ? A.val(set, "sys_id") : null,
      // run returns a "submenu" descriptor the palette knows how to render.
      run: prod ? null : async () => ({ submenu: "update-set", prefId: cur.prefId, currentId: set ? A.val(set, "sys_id") : null })
    };
  }

  // ---------- assembled producers ----------
  async function contextCommands(ctx, sess, settings, signal, hostData, host) {
    const out = [];
    const other = otherUiCommand(ctx, settings);
    if (other) out.push(other);
    if (ctx.table && ctx.sysId) {
      try {
        let chained = await chainCommands(ctx, signal);
        if (hostData) {
          const exists = await verifyTables(chained.map((c) => c.table), hostData, host, signal);
          chained = chained.filter((c) => !c.table || exists.has(c.table));
        }
        out.push(...chained);
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
      }
    }
    const us = await updateSetCommand(sess, signal);
    if (us) out.push(us);
    return out;
  }

  function recentCommands(hostData) {
    return (hostData.recents || []).map((r) => Object.assign({}, r, { kind: r.kind === "action" ? "action" : r.kind, group: "recents" }));
  }

  // Instant, network-free pass. Called on every keystroke.
  function searchLocal(query, ctx, sess, hostData) {
    const q = query.trim();
    const actionsOnly = q.startsWith(">");
    const term = actionsOnly ? q.slice(1).trim() : q;
    if (C.isSysId(term) || NUMBER_RE.test(term)) return [];
    const now = Date.now();
    const cur = M.rank(term, curatedCommands(ctx, sess), hostData.usage, now);
    const seen = new Set(cur.map((c) => c.table).filter(Boolean));
    const cat = actionsOnly || term.length < 2 ? [] : M.rank(term, catalogCommands(ctx), hostData.usage, now).filter((c) => !seen.has(c.table)).slice(0, 20);
    const local = dropMissing(cur.concat(cat), hostData);
    if (term && C.TABLE.test(term) && !local.some((m) => m.table === term) && !S.isMissing(hostData, term)) {
      local.push(tableCmd(ctx, term, term + " (open list)", "tbl:" + term));
    }
    return local;
  }

  // The full search entry point. Returns {matches:[], notice:string|null}.
  async function search(query, ctx, sess, hostData, host, signal) {
    const q = query.trim();
    const actionsOnly = q.startsWith(">");
    const term = actionsOnly ? q.slice(1).trim() : q;
    const now = Date.now();

    if (C.isSysId(term)) {
      const r = await resolveSysId(ctx, term, hostData, signal);
      if (r.results.length) return { matches: r.results, notice: null };
      const forb = r.forbidden ? " " + r.forbidden + " of " + r.tried + " tables were not readable." : "";
      return { matches: [], notice: "No record found for that sys_id in the tables checked." + forb + " Type a table name to search there directly." };
    }

    if (NUMBER_RE.test(term)) {
      const recs = await byNumber(ctx, term, hostData, signal);
      if (recs.length) return { matches: recs, notice: null };
      const t = numberTargets(term);
      return { matches: [], notice: "No record numbered " + t.number + " in " + t.tables.join(", ") + ". Check the number, or type a table name to search there." };
    }

    const local = searchLocal(query, ctx, sess, hostData);
    let live = [];
    if (!actionsOnly && term.length >= 2) {
      try {
        live = await liveTables(ctx, term, signal, host);
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        if (e instanceof A.ApiError && e.kind !== "forbidden") return { matches: local, notice: A.describe(e) };
        // forbidden on sys_db_object: silently rely on curated list
      }
    }
    // Merge: local wins on collision, live fills the rest. Live results are
    // real by definition; local ones get verified against this instance.
    const seen = new Set(local.map((c) => c.table).filter(Boolean));
    const merged = local.concat(live.filter((l) => !seen.has(l.table)));
    const liveNames = new Set(live.map((l) => l.table));
    const toVerify = merged.filter((m) => m.table && !liveNames.has(m.table)).map((m) => m.table);
    const exists = await verifyTables(toVerify, hostData, host, signal);
    const verified = merged.filter((m) => !m.table || liveNames.has(m.table) || exists.has(m.table));
    let notice = null;
    if (!verified.length && merged.length) notice = "None of the matching tables exist on this instance.";
    return { matches: verified, notice };
  }

  root.NJ.registry = { search, searchLocal, verifyTables, contextCommands, recentCommands, inProgressSets, switchUpdateSet, isProduction, userRoles };
})(typeof globalThis !== "undefined" ? globalThis : this);

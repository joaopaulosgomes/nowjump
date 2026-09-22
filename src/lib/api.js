// NowJump instance API. Wraps the Table API with:
//   - session token acquisition via the MAIN-world bridge, with an HTML fallback
//   - typed errors so the UI can name what happened (SNX-15)
//   - AbortSignal support so stale queries are cancelled (SNX-D4 keystroke spec)
//   - one retry maximum, and only on a network failure, never on 4xx
(function (root) {
  class ApiError extends Error {
    constructor(kind, status, table, message) {
      super(message || kind);
      this.kind = kind; // "unauthorized" | "forbidden" | "notfound" | "network" | "notoken" | "http"
      this.status = status || 0;
      this.table = table || null;
    }
  }

  let tokenCache = { token: null, userId: null, userName: null, at: 0 };
  let reqSeq = 0;

  function askBridge(timeoutMs) {
    return new Promise((resolve) => {
      const id = "nj" + ++reqSeq + "_" + Date.now();
      let done = false;
      const onMsg = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.type !== "nowjump:res" || d.id !== id) return;
        done = true;
        window.removeEventListener("message", onMsg);
        resolve({ token: d.token || null, userId: d.userId || null, userName: d.userName || null });
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "nowjump:req", id }, window.location.origin);
      setTimeout(() => {
        if (done) return;
        window.removeEventListener("message", onMsg);
        resolve({ token: null, userId: null, userName: null });
      }, timeoutMs || 400);
    });
  }

  // Fallback: the classic navpage embeds g_ck in a script tag.
  async function scrapeToken() {
    try {
      const r = await fetch("/navpage.do", { credentials: "same-origin", signal: AbortSignal.timeout(4000) });
      if (!r.ok) return null;
      const html = await r.text();
      const m = html.match(/g_ck\s*=\s*['"]([0-9a-f]{72})['"]/i);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  async function session(force) {
    const fresh = Date.now() - tokenCache.at < 10 * 60 * 1000;
    if (!force && tokenCache.token && fresh) return tokenCache;
    const b = await askBridge();
    let token = b.token;
    if (!token) token = await scrapeToken();
    tokenCache = { token, userId: b.userId, userName: b.userName, at: Date.now() };
    return tokenCache;
  }

  // Every request carries a hard deadline. A hung fetch becomes a "network"
  // error the UI can show, never a spinner that lives forever.
  const REQUEST_TIMEOUT_MS = 8000;

  function withTimeout(signal, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
    if (signal) {
      if (signal.aborted) ctrl.abort(signal.reason);
      else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
    }
    return { signal: ctrl.signal, done: () => clearTimeout(timer), timedOut: () => ctrl.signal.aborted && !(signal && signal.aborted) };
  }

  async function request(method, path, body, opts) {
    opts = opts || {};
    const s = await session();
    if (!s.token) throw new ApiError("notoken", 0, opts.table, "No session token available");
    const headers = {
      Accept: "application/json",
      "X-UserToken": s.token
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let attempt = 0;
    for (;;) {
      attempt++;
      let res;
      const t = withTimeout(opts.signal, opts.timeoutMs || REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(path, {
          method,
          headers,
          credentials: "same-origin",
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: t.signal
        });
      } catch (e) {
        t.done();
        if (e && e.name === "AbortError") {
          if (t.timedOut()) throw new ApiError("network", 0, opts.table, "Timed out");
          throw e; // caller cancelled
        }
        if (attempt < 2) continue; // one retry, network only
        throw new ApiError("network", 0, opts.table, "Network failure");
      }
      t.done();
      if (res.status === 401) {
        tokenCache.at = 0;
        throw new ApiError("unauthorized", 401, opts.table);
      }
      if (res.status === 403) throw new ApiError("forbidden", 403, opts.table);
      if (res.status === 404) throw new ApiError("notfound", 404, opts.table);
      if (!res.ok) throw new ApiError("http", res.status, opts.table, "HTTP " + res.status);
      if (res.status === 204) return null;
      return res.json();
    }
  }

  function q(params) {
    const sp = new URLSearchParams();
    for (const k of Object.keys(params)) {
      if (params[k] !== undefined && params[k] !== null) sp.set(k, String(params[k]));
    }
    return sp.toString();
  }

  // Table API helpers. Every call carries its table so errors can name it.
  async function query(table, params, signal) {
    const data = await request("GET", "/api/now/table/" + table + "?" + q(params), undefined, { table, signal });
    return (data && data.result) || [];
  }

  async function getRecord(table, sysId, fields, signal) {
    const data = await request(
      "GET",
      "/api/now/table/" + table + "/" + sysId + "?" + q({ sysparm_fields: fields, sysparm_display_value: "all", sysparm_exclude_reference_link: true }),
      undefined,
      { table, signal }
    );
    return data && data.result;
  }

  async function patchRecord(table, sysId, body) {
    const data = await request("PATCH", "/api/now/table/" + table + "/" + sysId, body, { table });
    return data && data.result;
  }

  // Display value of a field returned with sysparm_display_value=all.
  function dv(rec, field) {
    const v = rec && rec[field];
    if (v == null) return "";
    if (typeof v === "object") return v.display_value != null ? String(v.display_value) : v.value != null ? String(v.value) : "";
    return String(v);
  }
  function val(rec, field) {
    const v = rec && rec[field];
    if (v == null) return "";
    if (typeof v === "object") return v.value != null ? String(v.value) : "";
    return String(v);
  }

  // Human copy for an error, from the SNX-D8 table.
  function describe(err) {
    if (!(err instanceof ApiError)) return "Couldn't complete that. Try again.";
    switch (err.kind) {
      case "unauthorized":
        return "Your session expired. Reload the page and try again.";
      case "forbidden":
        return "You can't read " + (err.table || "that table") + " on this instance. Check your roles or ask an admin.";
      case "notoken":
        return "Couldn't get a session token from this page. Reload and try again.";
      case "network":
        return err.message === "Timed out" ? "The instance didn't answer in time. Try again or narrow the search." : "Couldn't reach the instance. Check the connection and retry.";
      case "notfound":
        return (err.table || "That table") + " doesn't exist on this instance.";
      default:
        return "The instance returned HTTP " + err.status + ". Try again.";
    }
  }

  root.NJ = root.NJ || {};
  root.NJ.api = { ApiError, session, request, query, getRecord, patchRecord, dv, val, describe };
})(typeof globalThis !== "undefined" ? globalThis : this);

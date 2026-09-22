// NowJump fuzzy matching and ranking. Pure functions.
//
// score(query, text) -> number, higher is better, 0 means no match.
// Ranking combines match quality with a per-item frecency value supplied by
// the caller, so this module knows nothing about storage.
(function (root) {
  function norm(s) {
    return (s || "").toLowerCase().trim();
  }

  // Subsequence match with bonuses for prefix, word-start and contiguity.
  function score(query, text) {
    const q = norm(query);
    const t = norm(text);
    if (!q) return 1;
    if (!t) return 0;
    if (t === q) return 1000;
    if (t.startsWith(q)) return 800 + Math.max(0, 50 - (t.length - q.length));
    const wordIdx = t.indexOf(" " + q);
    const usIdx = t.indexOf("_" + q);
    if (wordIdx !== -1 || usIdx !== -1) return 600;
    const sub = t.indexOf(q);
    if (sub !== -1) return 400 + Math.max(0, 50 - sub);

    // Subsequence: every char of q appears in order in t.
    let ti = 0;
    let contiguous = 0;
    let best = 0;
    let lastHit = -2;
    for (let qi = 0; qi < q.length; qi++) {
      const idx = t.indexOf(q[qi], ti);
      if (idx === -1) return 0;
      if (idx === lastHit + 1) {
        contiguous++;
        best = Math.max(best, contiguous);
      } else {
        contiguous = 0;
      }
      lastHit = idx;
      ti = idx + 1;
    }
    return 100 + best * 10 - Math.min(80, t.length - q.length);
  }

  // Frecency: recency decays over ~7 days, frequency is log-scaled.
  function frecency(count, lastUsedMs, nowMs) {
    if (!count) return 0;
    const ageDays = Math.max(0, (nowMs - (lastUsedMs || 0)) / 86400000);
    const recency = Math.exp(-ageDays / 7);
    return Math.log2(count + 1) * (0.5 + recency);
  }

  // items: [{ label, aliases?: [], ...}] ; usage: id -> {count,last}
  function rank(query, items, usage, nowMs) {
    const out = [];
    for (const it of items) {
      if (!it) continue;
      const cands = [it.label || ""].concat(it.aliases || [], it.secondary ? [it.secondary] : []);
      let s = 0;
      for (const c of cands) s = Math.max(s, score(query, c));
      if (s === 0) continue;
      const u = usage && usage[it.id];
      const f = u ? frecency(u.count, u.last, nowMs) : 0;
      out.push({ item: it, score: s + f * 20 });
    }
    out.sort((a, b) => b.score - a.score || String(a.item.label || "").localeCompare(String(b.item.label || "")));
    return out.map((o) => o.item);
  }

  root.NJ = root.NJ || {};
  root.NJ.match = { score, frecency, rank };
})(typeof globalThis !== "undefined" ? globalThis : this);

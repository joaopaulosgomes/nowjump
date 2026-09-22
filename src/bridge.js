// NowJump page-world bridge. Runs in the MAIN world so it can read the
// session token and user identity that the instance already exposes to its
// own scripts. It never touches the DOM and never initiates network calls.
//
// Contract: on window message {type:"nowjump:req", id} it replies with
// {type:"nowjump:res", id, token, userId, userName}. Values may be null.

(() => {
  if (window.__nowjumpBridge) return;
  window.__nowjumpBridge = true;

  function pick(...fns) {
    for (const fn of fns) {
      try {
        const v = fn();
        if (typeof v === "string" && v.length) return v;
      } catch (_) {}
    }
    return null;
  }

  function mainFrame() {
    const f = document.getElementById("gsft_main");
    return f && f.contentWindow ? f.contentWindow : null;
  }

  function collect() {
    const mf = mainFrame();
    return {
      token: pick(
        () => window.g_ck,
        () => window.NOW && window.NOW.g_ck,
        () => mf && mf.g_ck
      ),
      userId: pick(
        () => window.NOW && window.NOW.user_id,
        () => window.NOW && window.NOW.user && window.NOW.user.userID,
        () => window.g_user && window.g_user.userID,
        () => mf && mf.g_user && mf.g_user.userID
      ),
      userName: pick(
        () => window.NOW && window.NOW.user_name,
        () => window.NOW && window.NOW.user && window.NOW.user.userName,
        () => window.g_user && window.g_user.userName,
        () => mf && mf.g_user && mf.g_user.userName
      )
    };
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.type !== "nowjump:req") return;
    window.postMessage({ type: "nowjump:res", id: d.id, ...collect() }, window.location.origin);
  });
})();

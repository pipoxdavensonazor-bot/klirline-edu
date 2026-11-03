/* NORIA — installation de l'application depuis l'écran de connexion.
   Android, Chrome et tablettes : beforeinstallprompt, puis bouton « Installer l'app ».
   iPhone et iPad : pas d'invite du navigateur ; on explique « Sur l'écran d'accueil ».
   Déjà ouverte en application : rien. */
(function (root) {
  "use strict";

  function isIos(nav) {
    const n = nav || {};
    const ua = n.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS se présente comme un Mac tactile, sans le jeton d'un navigateur de bureau.
    const touchMac = n.platform === "MacIntel" && n.maxTouchPoints > 1;
    if (!touchMac) return false;
    if (/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Firefox|Edg\//i.test(ua)) return false;
    return true;
  }

  function isStandalone(win) {
    const nav = (win && win.navigator) || {};
    if (nav.standalone === true) return true;
    if (!win || typeof win.matchMedia !== "function") return false;
    return ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((mode) => {
      try { return win.matchMedia("(display-mode: " + mode + ")").matches; }
      catch (e) { return false; }
    });
  }

  // "prompt" : bouton qui appelle l'invite native. "ios" : mode d'emploi. "hidden" : rien.
  function offer(state) {
    const s = state || {};
    if (s.installed || s.standalone) return "hidden";
    if (s.prompt) return "prompt";
    if (s.ios && !s.chromium) return "ios";
    return "hidden";
  }

  function createController(win) {
    const target = win || {};
    const state = { promptEvent: null, installed: false, chromium: false, onChange: null };
    function note() { if (typeof state.onChange === "function") state.onChange(); }
    if (typeof target.addEventListener === "function") {
      target.addEventListener("beforeinstallprompt", (e) => {
        if (e && e.preventDefault) e.preventDefault();
        state.chromium = true;
        state.promptEvent = e;
        note();
      });
      target.addEventListener("appinstalled", () => {
        state.promptEvent = null;
        state.installed = true;
        note();
      });
    }
    return {
      kind() {
        return offer({
          installed: state.installed,
          standalone: isStandalone(target),
          prompt: !!state.promptEvent,
          ios: isIos(target.navigator || {}),
          chromium: state.chromium,
        });
      },
      onChange(fn) { state.onChange = fn; },
      async prompt() {
        const ev = state.promptEvent;
        if (!ev || typeof ev.prompt !== "function") return "unavailable";
        state.promptEvent = null;
        try {
          await ev.prompt();
          const choice = ev.userChoice ? await ev.userChoice : null;
          if (choice && choice.outcome === "accepted") state.installed = true;
          return (choice && choice.outcome) || "dismissed";
        } catch (e) {
          return "error";
        } finally {
          note();
        }
      },
    };
  }

  const api = { isIos, isStandalone, offer, createController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) root.NORIA_PWA = createController(root);
})(typeof window !== "undefined" ? window : globalThis);

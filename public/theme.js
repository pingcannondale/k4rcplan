(function () {
  var K = "k4rc-theme", d = document.documentElement, mq = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
  function pref() { try { return localStorage.getItem(K) || "dark"; } catch (e) { return "dark"; } }
  function mode(p) { return p === "auto" ? (mq && mq.matches ? "light" : "dark") : p; }
  function apply() {
    var m = mode(pref()); d.setAttribute("data-mode", m);
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", m === "light" ? "#efeff0" : "#0e0f11");
  }
  var L = [["dark", "มืด"], ["light", "สว่าง"], ["auto", "ออโต้"]];
  window.k4Theme = {
    get: pref,
    set: function (p, el) {
      try { localStorage.setItem(K, p); } catch (e) {}
      apply();
      if (el && el.parentNode) [].forEach.call(el.parentNode.children, function (b) { b.setAttribute("aria-pressed", b === el ? "true" : "false"); });
    },
    seg: function () {
      var p = pref();
      return '<div class="xsg thm" role="group" aria-label="ธีมสี">' + L.map(function (x) {
        return '<button type="button" aria-pressed="' + (p === x[0]) + '" onclick="k4Theme.set(\'' + x[0] + '\',this)">' + x[1] + "</button>";
      }).join("") + "</div>";
    }
  };
  apply();
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (pref() === "auto") apply(); });
})();

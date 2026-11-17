// Theme toggle (light / dark), shared by every page.
(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme-toggle");
  function current() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (btn) {
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }
  // Placeholder links (dashed buttons) do nothing until filled in.
  document.querySelectorAll('a[aria-disabled="true"]').forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); });
  });
})();

// Project "Read more" panels (slide-over dialogs on projects.html).
(function () {
  var dialogs = document.querySelectorAll("dialog.drawer");
  if (!dialogs.length) return;

  function open(id) {
    var d = document.getElementById(id);
    if (!d || d.open) return;
    d.showModal();
    d.querySelector(".drawer-body").scrollTop = 0;
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }

  document.querySelectorAll("[data-open]").forEach(function (b) {
    b.addEventListener("click", function () { open(b.getAttribute("data-open")); });
  });

  dialogs.forEach(function (d) {
    d.querySelector(".drawer-close").addEventListener("click", function () { d.close(); });
    // Click on the dimmed backdrop (outside the panel) closes it.
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    d.addEventListener("close", function () {
      if (location.hash === "#" + d.id) history.replaceState(null, "", location.pathname + location.search);
      var trigger = document.querySelector('[data-open="' + d.id + '"]');
      if (trigger) trigger.focus();
    });
  });

  // Open directly from a shared link like projects.html#agb-thesis
  if (location.hash) open(location.hash.slice(1));
})();

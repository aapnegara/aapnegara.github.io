// Stellar wind background.
// A "star" sits at the cerulean glow in the top-right corner. Particles flow out of it
// following the beta-velocity law used for stellar winds,
//     v(r) = v_inf * (1 - R*/r)^beta,
// so they accelerate near the star and then coast. Every so often a denser, directional
// gust is ejected with a faint arc front (like a CME, or an episodic AGB shell).
// Honors "reduce motion" (draws one still frame) and pauses when the tab is hidden.
(function () {
  var canvas = document.createElement("canvas");
  canvas.className = "wind-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // ---- Tunable parameters -------------------------------------------------
  var R_STAR = 26;          // stellar radius in px (particles are launched just outside it)
  var BETA = 1.0;           // beta-law exponent (~0.5–1 for hot stars, ~1+ for cool winds)
  var V_INF = 0.045;        // terminal speed, px per ms (≈45 px/s: calm)
  var GUST_EVERY = [10000, 16000];  // ms between gusts (random in this range)
  var GUST_PARTICLES = 45;
  var GUST_SPEEDUP = 1.9;   // gusts travel faster than the steady wind
  // -------------------------------------------------------------------------

  var W = 0, H = 0, dpr = 1, sx = 0, sy = 0, maxR = 0, target = 0;
  var parts = [], fronts = [];
  var running = false, last = 0, nextGust = 0, launchAcc = 0, theme = {};

  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : darkQuery.matches;
  }
  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
  }
  function readTheme() {
    var dark = isDark();
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b78b8";
    theme = {
      rgb: dark ? "160, 215, 255" : hexToRgb(accent),
      alpha: dark ? 0.55 : 0.32,
      glow: dark ? 0.22 : 0.12
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var mobile = W < 760;
    sx = W * (mobile ? 0.92 : 0.86);
    sy = H * (mobile ? 0.06 : 0.1);
    maxR = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy)) + 40;
    target = Math.round(Math.min(420, (W * H) / 2400));   // average particles in flight   // steady-wind particle budget
  }

  function speed(r, vinf) {
    var x = 1 - R_STAR / r;
    return vinf * (x > 0 ? Math.pow(x, BETA) : 0);
  }

  function launch(theta, vinf, gust) {
    parts.push({
      r: R_STAR * 1.04 + (gust ? Math.random() * 30 : Math.random() * 3),   // gusts launch as a thick shell
      th: theta,
      vinf: vinf,
      size: gust ? 0.8 + Math.random() * 0.7 : 0.5 + Math.random() * 0.8,
      gust: gust,
      bright: gust ? 0.85 : 0.4 + Math.random() * 0.55,
      jitter: (Math.random() - 0.5) * 0.00004   // slow angular drift = a little turbulence
    });
  }

  function steadyLaunch() {
    launch(Math.random() * Math.PI * 2, V_INF * (0.75 + Math.random() * 0.5), false);
  }

  function gust() {
    // Aim into the visible page: from the top-right star toward lower-left.
    var centre = Math.PI * (0.4 + Math.random() * 0.42);   // ~70°–145°: down and down-left (canvas y points down)
    var width = Math.PI * (0.18 + Math.random() * 0.1);     // ~30°–50° wide cone
    var vinf = V_INF * GUST_SPEEDUP;
    for (var i = 0; i < GUST_PARTICLES; i++) {
      launch(centre + (Math.random() - 0.5) * width, vinf * (0.85 + Math.random() * 0.3), true);
    }
    fronts.push({ r: R_STAR * 1.1, th: centre, width: width * 1.1, vinf: vinf, age: 0 });
  }
  window.windGust = gust;   // handy for testing: call windGust() in the console

  function step(dt) {
    // Constant mass-loss rate: launch particles at a steady rate so that, on average,
    // about `target` are in flight (rate = target / crossing time).
    launchAcc += dt * target / (maxR / V_INF);
    while (launchAcc >= 1) { steadyLaunch(); launchAcc -= 1; }

    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.r += speed(p.r, p.vinf) * dt;
      p.th += p.jitter * dt;
      if (p.r > maxR) parts.splice(i, 1);
    }
    for (var j = fronts.length - 1; j >= 0; j--) {
      var f = fronts[j];
      f.r += speed(f.r, f.vinf) * dt;
      f.age += dt;
      if (f.r > maxR) fronts.splice(j, 1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // the star itself: a soft glow
    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R_STAR * 3.5);
    g.addColorStop(0, "rgba(" + theme.rgb + "," + (theme.glow * 1.6).toFixed(3) + ")");
    g.addColorStop(0.35, "rgba(" + theme.rgb + "," + theme.glow.toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + theme.rgb + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, R_STAR * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // wind particles: short streaks along the flow, fading with distance
    ctx.lineCap = "round";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var c = Math.cos(p.th), s = Math.sin(p.th);
      var x = sx + p.r * c, y = sy + p.r * s;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      var fade = Math.max(0, 1 - p.r / maxR);
      var a = theme.alpha * p.bright * (0.35 + 0.65 * fade);
      var len = 1.5 + speed(p.r, p.vinf) * (p.gust ? 90 : 60);
      ctx.strokeStyle = "rgba(" + theme.rgb + "," + a.toFixed(3) + ")";
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - c * len, y - s * len);
      ctx.stroke();
    }

    // gust fronts: a faint arc that thins out as it expands
    for (var j = 0; j < fronts.length; j++) {
      var f = fronts[j];
      var fa = theme.alpha * 0.45 * Math.max(0, 1 - f.r / maxR) * Math.min(1, f.age / 400);
      ctx.strokeStyle = "rgba(" + theme.rgb + "," + fa.toFixed(3) + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, f.r, f.th - f.width / 2, f.th + f.width / 2);
      ctx.stroke();
    }
  }

  // Run the wind for a while before showing it, so the page loads with the flow already established.
  function prewarm() {
    parts = []; fronts = [];
    for (var t = 0; t < 60000; t += 50) step(50);
  }

  function frame(t) {
    if (!running) return;
    var dt = last ? Math.min(t - last, 50) : 16;
    last = t;
    if (t > nextGust) {
      gust();
      nextGust = t + GUST_EVERY[0] + Math.random() * (GUST_EVERY[1] - GUST_EVERY[0]);
    }
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (reduceMotion.matches) { running = false; draw(); return; }
    if (running) return;
    running = true;
    last = 0;
    if (!nextGust) nextGust = performance.now() + 3500;   // first gust soon after load
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  readTheme();
  resize();
  prewarm();
  start();
  if (!running) draw();

  window.addEventListener("resize", function () { resize(); if (!running) draw(); });
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  reduceMotion.addEventListener("change", function () { stop(); start(); });
  darkQuery.addEventListener("change", function () { readTheme(); if (!running) draw(); });
  new MutationObserver(function () { readTheme(); if (!running) draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();

// Animated sky: twinkling stars + occasional shooting stars behind the page content.
// Dark mode: white-blue stars. Light mode: faint stars in the accent colour.
// Honors "reduce motion" (draws a still sky) and pauses when the tab is hidden.
(function () {
  var canvas = document.createElement("canvas");
  canvas.className = "sky-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  var W = 0, H = 0, dpr = 1;
  var stars = [], meteors = [];
  var nextMeteor = 0, running = false, last = 0;
  var theme = {};

  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : darkQuery.matches;
  }

  function readTheme() {
    var dark = isDark();
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b78b8";
    theme = {
      dark: dark,
      star: dark ? "220, 235, 255" : hexToRgb(accent),
      maxAlpha: dark ? 0.9 : 0.35,
      meteor: dark ? "200, 235, 255" : hexToRgb(accent),
      meteorAlpha: dark ? 0.95 : 0.55
    };
  }

  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStars();
    if (!running) drawStill();
  }

  function makeStars() {
    var count = Math.min(220, Math.round((W * H) / 8000));
    stars = [];
    for (var i = 0; i < count; i++) {
      var big = Math.random() < 0.08;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: big ? 1.2 + Math.random() * 0.8 : 0.4 + Math.random() * 0.8,
        base: 0.25 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 1.6,   // twinkle rate
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function drawStars(t) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = t === null ? 1 : 0.55 + 0.45 * Math.sin(s.phase + t * 0.001 * s.speed);
      var a = s.base * tw * theme.maxAlpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + theme.star + "," + a.toFixed(3) + ")";
      ctx.fill();
      if (s.r > 1.2 && theme.dark) {
        // soft glow on the brighter stars
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + theme.star + "," + (a * 0.12).toFixed(3) + ")";
        ctx.fill();
      }
    }
  }

  function spawnMeteor() {
    var dir = Math.random() < 0.5 ? 1 : -1;                          // left-to-right or right-to-left
    var angle = Math.PI / 6 + Math.random() * Math.PI / 9;           // 30–50° below horizontal
    var speed = 0.7 + Math.random() * 0.5;                           // px per ms
    meteors.push({
      x: dir > 0 ? Math.random() * W * 0.6 : W * 0.4 + Math.random() * W * 0.6,
      y: Math.random() * H * 0.45,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
      len: 110 + Math.random() * 110,
      life: 0,
      maxLife: 700 + Math.random() * 500
    });
  }
  window.skyShoot = spawnMeteor; // handy for testing: call skyShoot() in the console

  function drawMeteors(dt) {
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      var p = m.life / m.maxLife;
      if (p >= 1) { meteors.splice(i, 1); continue; }
      var fade = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;   // quick fade-in, slow fade-out
      var sp = Math.hypot(m.vx, m.vy);
      var tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      var g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, "rgba(" + theme.meteor + "," + (theme.meteorAlpha * fade).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + theme.meteor + ",0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // bright head
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + theme.meteor + "," + (theme.meteorAlpha * fade).toFixed(3) + ")";
      ctx.fill();
    }
  }

  function frame(t) {
    if (!running) return;
    var dt = last ? Math.min(t - last, 50) : 16;
    last = t;
    ctx.clearRect(0, 0, W, H);
    drawStars(t);
    if (t > nextMeteor) {
      spawnMeteor();
      nextMeteor = t + 4000 + Math.random() * 5000;
    }
    drawMeteors(dt);
    requestAnimationFrame(frame);
  }

  function drawStill() {
    ctx.clearRect(0, 0, W, H);
    drawStars(null);
  }

  function start() {
    if (reduceMotion.matches) { running = false; drawStill(); return; }
    if (running) return;
    running = true;
    last = 0;
    nextMeteor = performance.now() + 1500; // first one shortly after load
    requestAnimationFrame(frame);
  }

  function stop() { running = false; }

  readTheme();
  resize();
  start();

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  reduceMotion.addEventListener("change", function () { stop(); start(); });
  darkQuery.addEventListener("change", function () { readTheme(); if (!running) drawStill(); });
  new MutationObserver(function () { readTheme(); if (!running) drawStill(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();

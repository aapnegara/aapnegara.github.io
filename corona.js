// Solar corona background: magnetic loops on the solar limb, with plasma flowing along them
// and occasional magnetic reconnection events (a loop stretches, its legs pinch into an
// X-point, a flash, a plasmoid is ejected, and the loop below relaxes and re-forms).
// Teal colour follows the convention for SDO/AIA 131 Å images of hot flaring plasma.
// Honors "reduce motion" (draws one still frame) and pauses when the tab is hidden.
(function () {
  var canvas = document.createElement("canvas");
  canvas.className = "corona-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // ---- Tunable parameters -------------------------------------------------
  var LOOPS_DESKTOP = 7;
  var LOOPS_MOBILE = 5;
  var EVENT_EVERY = [14000, 20000];   // ms between reconnection events
  var BLOBS_PER_LOOP = 3;             // plasma blobs flowing along each loop
  // -------------------------------------------------------------------------

  var W = 0, H = 0, dpr = 1, mobile = false;
  var cx = 0, cy = 0, Rs = 0, a0 = 0, a1 = 0;     // Sun centre, radius, visible limb angles
  var loops = [], plasmoids = [], flashes = [];
  var running = false, last = 0, clock = 0, nextEvent = 0, theme = {};

  // ---------- helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(p) { return p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p); }
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
  function rgba(rgb, a) { return "rgba(" + rgb + "," + Math.max(0, a).toFixed(3) + ")"; }

  function readTheme() {
    var dark = isDark();
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b78b8";
    var k = mobile ? 0.7 : 1;
    // Full effect on Home; dimmer behind the reading pages so body text stays calm.
    if (!document.body.classList.contains("home")) k *= 0.55;
    theme = dark ? {
      rgb: "125, 215, 255", loop: 0.42 * k, blob: 0.8 * k, flash: 1.0 * k,
      disk0: 0.02 * k, disk1: 0.08 * k, corona: 0.12 * k, blend: "lighter"
    } : {
      rgb: hexToRgb(accent), loop: 0.3 * k, blob: 0.55 * k, flash: 0.7 * k,
      disk0: 0.015 * k, disk1: 0.06 * k, corona: 0.09 * k, blend: "source-over"
    };
  }

  // ---------- geometry ----------
  // The limb is a large circle whose visible arc runs from the bottom edge to the right edge.
  function geometry() {
    mobile = W < 760;
    var A = mobile ? [0.35 * W, H] : [0.52 * W, H];
    var B = mobile ? [W, 0.84 * H] : [W, 0.52 * H];
    var dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy);
    Rs = d * 1.15;
    var h = Math.sqrt(Rs * Rs - d * d / 4);
    cx = (A[0] + B[0]) / 2 + (-dy / d) * h;
    cy = (A[1] + B[1]) / 2 + (dx / d) * h;
    a0 = Math.atan2(A[1] - cy, A[0] - cx);
    a1 = Math.atan2(B[1] - cy, B[0] - cx);
  }
  function limb(a) { return [cx + Rs * Math.cos(a), cy + Rs * Math.sin(a)]; }

  function makeLoops() {
    loops = [];
    var n = mobile ? LOOPS_MOBILE : LOOPS_DESKTOP;
    var m = (a1 - a0) * 0.1, span = (a1 - a0) - 2 * m;
    for (var i = 0; i < n; i++) {
      var sep = rand(80, 200) * (mobile ? 0.45 : 1);          // footpoint separation, px
      var L = {
        am: a0 + m + span * (i + 0.5 + rand(-0.3, 0.3)) / n,  // mid-angle on the limb
        da: sep / (2 * Rs),                                    // half footpoint separation (rad)
        H0: sep * rand(0.45, 0.85),                            // resting height, px (≈ semicircular arches)
        H: 0, s: 0, phase: rand(0, 6.28), bright: 0,
        state: "idle", t: 0, blobs: []
      };
      L.H = L.H0;
      for (var b = 0; b < BLOBS_PER_LOOP; b++) {
        L.blobs.push({ t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, v: rand(0.00008, 0.00018) });
      }
      loops.push(L);
    }
  }

  // Cubic Bezier for a loop. s = 0: round arch. s > 1: legs cross near the top (X-point).
  function shape(L) {
    var P1 = limb(L.am - L.da), P2 = limb(L.am + L.da);
    var nx = Math.cos(L.am), ny = Math.sin(L.am);
    var ux = P2[0] - P1[0], uy = P2[1] - P1[1], len = Math.hypot(ux, uy);
    ux /= len; uy /= len;
    var half = len / 2;
    var Hh = L.H * (1 + 0.04 * Math.sin(clock * 0.0006 + L.phase)) * 4 / 3;  // peak height = H
    L.P1 = P1; L.P2 = P2; L.nx = nx; L.ny = ny;
    L.C1 = [P1[0] + nx * Hh + ux * L.s * half, P1[1] + ny * Hh + uy * L.s * half];
    L.C2 = [P2[0] + nx * Hh - ux * L.s * half, P2[1] + ny * Hh - uy * L.s * half];
  }
  function bez(L, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * L.P1[0] + b * L.C1[0] + c * L.C2[0] + d * L.P2[0],
            a * L.P1[1] + b * L.C1[1] + c * L.C2[1] + d * L.P2[1]];
  }

  // ---------- reconnection events ----------
  function triggerEvent(L) {
    if (!L) {
      var idle = loops.filter(function (x) { return x.state === "idle"; });
      if (!idle.length) return;
      // Use loops on the right-hand part of the limb, so plasmoids fly away from the page text.
      idle.sort(function (p, q) { return q.am - p.am; });
      L = idle[Math.floor(Math.random() * Math.ceil(idle.length / 2))];
    }
    L.state = "stretch"; L.t = 0;
  }
  window.coronaEvent = function () { triggerEvent(); };   // handy for testing: coronaEvent() in the console

  function updateLoop(L, dt) {
    L.t += dt;
    if (L.state === "stretch") {                 // rise and pinch the legs together
      var p = ease(L.t / 2600);
      L.H = L.H0 * (1 + 0.9 * p);
      L.s = 1.9 * p;
      if (L.t >= 2600) reconnect(L);
    } else if (L.state === "snap") {             // cusp-shaped post-reconnection loop relaxes
      var q = ease(L.t / 900);
      L.H = L.H0 * 0.55;
      L.s = 0.9 * (1 - q);
      if (L.t >= 900) { L.state = "recover"; L.t = 0; }
    } else if (L.state === "recover") {          // slowly re-forms to its resting height
      var r = ease(L.t / 9000);
      L.H = L.H0 * (0.55 + 0.45 * r);
      L.s = 0;
      if (L.t >= 9000) { L.state = "idle"; L.t = 0; L.H = L.H0; }
    }
    L.bright *= Math.exp(-dt / 2500);
    for (var i = 0; i < L.blobs.length; i++) {
      var b = L.blobs[i];
      b.t += b.v * dt * b.dir;
      if (b.t > 1 || b.t < 0) {                  // plasma reaches a footpoint: send a new blob up
        b.dir = Math.random() < 0.5 ? 1 : -1;
        b.t = b.dir > 0 ? 0 : 1;
        b.v = rand(0.00008, 0.00018);
      }
    }
  }

  function reconnect(L) {
    shape(L);
    var p3 = bez(L, 0.3), p7 = bez(L, 0.7), top = bez(L, 0.5);
    var X = [(p3[0] + p7[0]) / 2, (p3[1] + p7[1]) / 2];
    var sparks = [];
    for (var k = 0; k < 18; k++) sparks.push({ a: rand(0, Math.PI * 2), v: rand(0.05, 0.16) });
    flashes.push({ x: X[0], y: X[1], nx: L.nx, ny: L.ny, age: 0, dur: 1400, r: 18 + L.H0 * 0.12, sparks: sparks });
    L.bright = 1.6;
    plasmoids.push({
      x: (X[0] + top[0]) / 2, y: (X[1] + top[1]) / 2,
      nx: L.nx, ny: L.ny, rot: L.am + Math.PI / 2,
      r: Math.max(8, Math.hypot(top[0] - X[0], top[1] - X[1]) * 0.45),
      age: 0, dur: 4200, v: 0.06
    });
    L.state = "snap"; L.t = 0;
  }

  // ---------- drawing ----------
  function drawSun() {
    var g = ctx.createRadialGradient(cx, cy, Rs, cx, cy, Rs + 170);
    g.addColorStop(0, rgba(theme.rgb, theme.corona));
    g.addColorStop(1, rgba(theme.rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, Rs + 170, 0, Math.PI * 2); ctx.fill();
    var d = ctx.createRadialGradient(cx, cy, Rs * 0.9, cx, cy, Rs);
    d.addColorStop(0, rgba(theme.rgb, theme.disk0));
    d.addColorStop(1, rgba(theme.rgb, theme.disk1));
    ctx.fillStyle = d;
    ctx.beginPath(); ctx.arc(cx, cy, Rs, 0, Math.PI * 2); ctx.fill();
  }

  function drawLoop(L) {
    shape(L);
    var a = theme.loop * (1 + 0.9 * L.bright);
    ctx.beginPath();
    ctx.moveTo(L.P1[0], L.P1[1]);
    ctx.bezierCurveTo(L.C1[0], L.C1[1], L.C2[0], L.C2[1], L.P2[0], L.P2[1]);
    ctx.strokeStyle = rgba(theme.rgb, a * 0.22); ctx.lineWidth = 7; ctx.stroke();   // soft glow
    ctx.strokeStyle = rgba(theme.rgb, a);        ctx.lineWidth = 1.3; ctx.stroke(); // field line
    for (var i = 0; i < L.blobs.length; i++) {
      var b = L.blobs[i], p = bez(L, b.t), fade = Math.sin(Math.PI * b.t);
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(theme.rgb, theme.blob * 0.25 * fade); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(theme.rgb, theme.blob * fade); ctx.fill();
    }
  }

  function drawPlasmoids(dt) {
    for (var i = plasmoids.length - 1; i >= 0; i--) {
      var p = plasmoids[i];
      p.age += dt;
      if (p.age > p.dur) { plasmoids.splice(i, 1); continue; }
      var f = p.age / p.dur;
      p.x += p.nx * p.v * dt; p.y += p.ny * p.v * dt;
      var r = p.r * (1 + 0.9 * f), a = theme.loop * 1.4 * (1 - f) * Math.min(1, p.age / 200);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 1.35, r, p.rot, 0, Math.PI * 2);
      ctx.fillStyle = rgba(theme.rgb, a * 0.12); ctx.fill();
      ctx.strokeStyle = rgba(theme.rgb, a * 0.25); ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = rgba(theme.rgb, a); ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  function drawFlashes(dt) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      f.age += dt;
      if (f.age > f.dur) { flashes.splice(i, 1); continue; }
      var p = f.age / f.dur;
      var rise = Math.min(1, f.age / 90);                      // near-instant onset
      var a = theme.flash * rise * Math.pow(1 - p, 1.6);

      // 1. wide, soft glow that briefly lights up the surroundings
      var R = f.r * (4 + 3 * p);
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      g.addColorStop(0, rgba(theme.rgb, a * 0.45));
      g.addColorStop(1, rgba(theme.rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();

      // 2. white-hot core
      var r = f.r * (0.8 + 1.2 * p);
      var c2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      c2.addColorStop(0, rgba("255, 255, 255", Math.min(1, a * 1.6)));
      c2.addColorStop(0.3, rgba("210, 245, 255", a));
      c2.addColorStop(1, rgba(theme.rgb, 0));
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();

      // 3. outflow jets along the current sheet (reconnection outflows, up and down)
      var jl = f.r * (1.5 + 5 * Math.sqrt(p));
      ctx.lineCap = "round";
      for (var s = -1; s <= 1; s += 2) {
        var jx = f.x + f.nx * jl * s, jy = f.y + f.ny * jl * s;
        var jg = ctx.createLinearGradient(f.x, f.y, jx, jy);
        jg.addColorStop(0, rgba("235, 250, 255", a));
        jg.addColorStop(1, rgba(theme.rgb, 0));
        ctx.strokeStyle = jg; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(jx, jy); ctx.stroke();
      }

      // 4. expanding shock ring
      var ring = f.r * (1 + 6 * p);
      ctx.strokeStyle = rgba(theme.rgb, a * 0.9 * (1 - p));
      ctx.lineWidth = 2.2 * (1 - p) + 0.4;
      ctx.beginPath(); ctx.arc(f.x, f.y, ring, 0, Math.PI * 2); ctx.stroke();

      // 5. sparks (accelerated particles) flying out
      for (var k = 0; k < f.sparks.length; k++) {
        var sp = f.sparks[k], d = sp.v * f.age;
        var sx = f.x + Math.cos(sp.a) * d, sy = f.y + Math.sin(sp.a) * d;
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba("230, 250, 255", a * (1 - p)); ctx.fill();
      }
    }
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    drawSun();
    ctx.globalCompositeOperation = theme.blend;
    for (var i = 0; i < loops.length; i++) drawLoop(loops[i]);
    drawPlasmoids(dt);
    drawFlashes(dt);
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- loop / lifecycle ----------
  function frame(t) {
    if (!running) return;
    var dt = last ? Math.min(t - last, 50) : 16;
    last = t; clock += dt;
    if (clock > nextEvent) {
      triggerEvent();
      nextEvent = clock + rand(EVENT_EVERY[0], EVENT_EVERY[1]);
    }
    for (var i = 0; i < loops.length; i++) updateLoop(loops[i], dt);
    draw(dt);
    requestAnimationFrame(frame);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geometry(); readTheme(); makeLoops();
    plasmoids = []; flashes = [];
    if (!running) draw(0);
  }

  function start() {
    if (reduceMotion.matches) { running = false; draw(0); return; }
    if (running) return;
    running = true; last = 0;
    if (!nextEvent) nextEvent = clock + 4000;   // first event soon after load
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  resize();
  start();

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  reduceMotion.addEventListener("change", function () { stop(); start(); });
  darkQuery.addEventListener("change", function () { readTheme(); if (!running) draw(0); });
  new MutationObserver(function () { readTheme(); if (!running) draw(0); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();

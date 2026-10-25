/* YAYL effects gallery.
   Classic script (file:// safe). Builds 30 progress effects, each tagged with the
   library/technique it uses and a weight. Progress is driven by --p (0..1). */
(function () {
  "use strict";

  var MOCK = (window.YAYL_MOCK = window.YAYL_MOCK || {});
  var I18N = MOCK.I18N || { vi: {}, en: {} };
  var params = new URLSearchParams(window.location.search);
  var lang = params.get("lang") === "en" ? "en" : "vi";

  function txt(key) {
    var dict = I18N[lang] || I18N.vi || {};
    return dict[key] || (I18N.vi && I18N.vi[key]) || key;
  }

  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  var WAVE_D =
    "M0 13 Q75 3 150 13 T300 13 T450 13 T600 13 T750 13 T900 13 T1050 13 T1200 13 " +
    "T1350 13 T1500 13 T1650 13 T1800 13 T1950 13 T2100 13 T2250 13 T2400 13 V26 H0 Z";
  var WAVE_CALM_D =
    "M0 13 Q75 5 150 13 T300 13 T450 13 T600 13 T750 13 T900 13 T1050 13 T1200 13 " +
    "T1350 13 T1500 13 T1650 13 T1800 13 T1950 13 T2100 13 T2250 13 T2400 13 V26 H0 Z";

  var WAVE_LINE =
    "M0 13 Q75 3 150 13 T300 13 T450 13 T600 13 T750 13 T900 13 T1050 13 T1200 13 " +
    "T1350 13 T1500 13 T1650 13 T1800 13 T1950 13 T2100 13 T2250 13 T2400 13";

  function waves(count, d) {
    var path = d || WAVE_D;
    var out = "";
    for (var i = 0; i < count; i += 1) out += '<path d="' + path + '"></path>';
    out += '<path class="fxcrest" d="' + WAVE_LINE + '"></path>';
    return '<svg class="fxwaves" viewBox="0 0 2400 26" preserveAspectRatio="none" aria-hidden="true">' + out + "</svg>";
  }

  function makeBtn(id, inner, labelHtml) {
    var btn = el("div", "fxbtn");
    btn.setAttribute("data-fx", id);
    btn.innerHTML =
      (inner || "") +
      '<span class="fxgloss"></span>' +
      '<span class="fxlabel">' +
      (labelHtml || txt("anim.buttonLoading") + ' &middot; <b class="fxpct">42%</b>') +
      "</span>";
    return btn;
  }

  /* ---------------------------------------------------------------- builders */

  function fxWaveMulti(stage) {
    stage.appendChild(makeBtn("wave-multi", '<div class="fxfill-v">' + waves(3) + "</div>"));
    return {};
  }

  function fxBubbles(stage) {
    var btn = makeBtn("bubbles", '<div class="fxfill-v"><span class="fxbubbles"></span></div>');
    stage.appendChild(btn);
    var fill = btn.querySelector(".fxfill-v");
    var layer = btn.querySelector(".fxbubbles");
    function spawn() {
      if (reduced() || !window.anime) return;
      var h = fill.clientHeight;
      if (h < 10) return;
      var size = 3 + Math.random() * 4;
      var b = el("span", "fxbubble");
      b.style.left = 6 + Math.random() * (btn.clientWidth - 12) + "px";
      b.style.width = size + "px";
      b.style.height = size + "px";
      layer.appendChild(b);
      anime({
        targets: b,
        translateY: [0, -h - 6],
        opacity: [0, 0.9, 0],
        duration: 900 + Math.random() * 700,
        easing: "easeOutSine",
        complete: function () {
          b.remove();
        }
      });
    }
    if (!reduced() && window.anime) {
      window.setInterval(spawn, 300);
      spawn();
    }
    return {};
  }

  function fxTide(stage) {
    stage.appendChild(makeBtn("tide", '<div class="fxtide">' + waves(1) + "</div>"));
    return {};
  }

  function fxBigDrop(stage) {
    var btn = makeBtn("bigdrop", '<div class="fxfill-v"></div><span class="fxdropwrap"></span>');
    stage.appendChild(btn);
    var fill = btn.querySelector(".fxfill-v");
    var wrap = btn.querySelector(".fxdropwrap");
    function cycle() {
      if (reduced() || !window.anime) return;
      var h = fill.clientHeight - 6;
      if (h < 12) return;
      var surface = btn.clientHeight - fill.clientHeight;
      var x = btn.clientWidth * 0.5;
      var drop = el("span", "fxdrop");
      drop.style.left = x + "px";
      var s1 = el("span", "fxsplash");
      s1.style.left = x + "px";
      s1.style.top = surface + "px";
      var s2 = el("span", "fxsplash");
      s2.style.left = x + "px";
      s2.style.top = surface + "px";
      wrap.appendChild(drop);
      wrap.appendChild(s1);
      wrap.appendChild(s2);
      anime
        .timeline({
          complete: function () {
            drop.remove();
            s1.remove();
            s2.remove();
          }
        })
        .add({ targets: drop, translateY: [0, h], duration: 520, easing: "easeInQuad" })
        .add(
          {
            targets: [s1, s2],
            scale: [0.2, 1.7],
            opacity: [0, 0.85, 0],
            duration: 640,
            delay: anime.stagger(120),
            easing: "easeOutQuad"
          },
          "-=40"
        );
    }
    if (!reduced() && window.anime) {
      window.setInterval(cycle, 1400);
      cycle();
    }
    return {};
  }

  function fxReflect(stage) {
    stage.appendChild(
      makeBtn("reflect", '<div class="fxfill-v">' + waves(1) + '<span class="fxreflect"></span></div>')
    );
    return {};
  }

  function fxSlime(stage) {
    stage.appendChild(makeBtn("slime", '<div class="fxslime"></div>'));
    return {};
  }

  function fxGradientRun(stage) {
    stage.appendChild(makeBtn("gradient-run", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxStripes(stage) {
    stage.appendChild(makeBtn("stripes", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxSegmented(stage) {
    stage.appendChild(makeBtn("segmented", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxBorderSweep(stage) {
    var rects =
      '<rect class="fxoutline__bg" x="1" y="1" width="298" height="54" rx="27"></rect>' +
      '<rect class="fxoutline__fg" x="1" y="1" width="298" height="54" rx="27"></rect>' +
      '<rect class="fxoutline__spark" x="1" y="1" width="298" height="54" rx="27"></rect>';
    var btn = makeBtn(
      "border-sweep",
      '<div class="fxfill-h"></div><svg class="fxoutline" viewBox="0 0 300 56" preserveAspectRatio="none">' +
        rects +
        "</svg>"
    );
    stage.appendChild(btn);
    var P = 660;
    var fg = btn.querySelector(".fxoutline__fg");
    var spark = btn.querySelector(".fxoutline__spark");
    spark.style.strokeDasharray = "46 " + P;
    function update(p) {
      fg.style.strokeDasharray = P * p + " " + P;
    }
    update(0.42);
    return { update: update };
  }

  function fxComet(stage) {
    stage.appendChild(makeBtn("comet", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxScanline(stage) {
    stage.appendChild(makeBtn("scanline", '<div class="fxfill-h"></div><span class="fxscan"></span>'));
    return {};
  }

  function fxSand(stage) {
    var btn = makeBtn("sand", '<canvas class="fxcanvas"></canvas><div class="fxfill-v" style="display:none"></div>');
    stage.appendChild(btn);
    var canvas = btn.querySelector(".fxcanvas");
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = 0;
    var h = 56;
    var noise = [];
    var grains = [];
    function resize() {
      w = btn.clientWidth || 300;
      h = btn.clientHeight || 56;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      noise = [];
      for (var x = 0; x < w; x += 5) noise.push(Math.random() * 3 - 1.5);
    }
    resize();
    function prog() {
      var value = parseFloat(getComputedStyle(btn).getPropertyValue("--p"));
      return isNaN(value) ? 0.42 : value;
    }
    function accent() {
      return (getComputedStyle(btn).getPropertyValue("--accent") || "#f2b544").trim();
    }
    function draw() {
      if (!w || !h) resize();
      ctx.clearRect(0, 0, w, h);
      var level = h * (1 - prog());
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent();
      for (var x = 0, i = 0; x < w; x += 5, i += 1) {
        var top = level + (noise[i] || 0);
        ctx.fillRect(x, top, 4, h - top);
      }
      for (var k = 0; k < 24; k += 1) {
        var g = grains[k];
        if (!g) {
          g = grains[k] = { x: Math.random() * w, y: Math.random() * level, v: 1.4 + Math.random() * 2.4, s: 1 + Math.random() };
        }
        g.y += g.v;
        if (g.y >= level) {
          g.y = Math.random() * level * 0.4;
          g.x = Math.random() * w;
        }
        ctx.globalAlpha = 0.9;
        ctx.fillRect(g.x, g.y, g.s, g.s);
      }
      ctx.globalAlpha = 1;
    }
    function frame() {
      draw();
      if (!reduced()) requestAnimationFrame(frame);
    }
    frame();
    return {
      update: function () {
        draw();
      }
    };
  }

  function fxHeat(stage) {
    var btn = makeBtn("heat", '<div class="fxfill-h fx-heat"></div>');
    stage.appendChild(btn);
    var fill = btn.querySelector(".fxfill-h");
    function update(p) {
      var hue = 120 - p * 120;
      fill.style.background =
        "linear-gradient(90deg, hsl(" +
        (hue - 14).toFixed(0) +
        " 80% 46%), hsl(" +
        hue.toFixed(0) +
        " 88% 58%), hsl(" +
        (hue + 12).toFixed(0) +
        " 92% 68%))";
    }
    update(0.42);
    return { update: update };
  }

  function ringNode(extra) {
    var r = el("div", "fxring");
    r.innerHTML =
      '<svg viewBox="0 0 64 64"><circle class="fxring__bg" cx="32" cy="32" r="26"></circle>' +
      '<circle class="fxring__fg" cx="32" cy="32" r="26"></circle></svg>' +
      '<span class="fxring__pct">42%</span>' +
      (extra || "");
    return r;
  }

  function ringProgress(stage, extra) {
    var r = ringNode(extra);
    stage.appendChild(r);
    var fg = r.querySelector(".fxring__fg");
    var pct = r.querySelector(".fxring__pct");
    var C = 2 * Math.PI * 26;
    fg.style.strokeDasharray = String(C);
    function update(p) {
      fg.style.strokeDashoffset = String(C * (1 - p));
      pct.textContent = Math.round(p * 100) + "%";
    }
    update(0.42);
    return { update: update };
  }

  function fxRing(stage) {
    return ringProgress(stage, "");
  }

  function fxRingDot(stage) {
    return ringProgress(stage, '<span class="fxorbit"><i></i></span>');
  }

  function fxRingSweep(stage) {
    return ringProgress(stage, '<span class="fxsweep"></span>');
  }

  function fxHourglass(stage) {
    var g = el("div", "fxhour");
    g.innerHTML =
      '<div class="fxhour__top"><i></i></div>' +
      '<div class="fxhour__bot"><i></i></div>' +
      '<span class="fxhour__stream"></span>';
    stage.appendChild(g);
    return {};
  }

  function fxOdometer(stage) {
    var o = el("div", "fxodo");
    var cols = [];
    for (var i = 0; i < 3; i += 1) {
      var d = el("span", "fxdigit");
      var col = el("span", "fxdigit__col");
      var html = "";
      for (var n = 0; n < 10; n += 1) html += "<span>" + n + "</span>";
      col.innerHTML = html;
      d.appendChild(col);
      o.appendChild(d);
      cols.push({ node: d, col: col });
    }
    var sign = el("span", "fxodo__sign");
    sign.textContent = "%";
    o.appendChild(sign);
    stage.appendChild(o);
    function update(p) {
      var value = Math.round(p * 100);
      var text = String(value);
      var pad = value < 100 ? "0" + text : text;
      for (var i = 0; i < 3; i += 1) {
        var digit = parseInt(pad.charAt(i), 10) || 0;
        cols[i].col.style.transform = "translateY(" + -digit * 30 + "px)";
        cols[i].node.style.visibility = value < 100 && i === 0 ? "hidden" : "visible";
      }
    }
    update(0.42);
    return { update: update };
  }

  function fxTextWipe(stage) {
    var s = el("span", "fxwipe");
    stage.appendChild(s);
    function update(p) {
      s.textContent = txt("anim.buttonLoading") + " " + Math.round(p * 100) + "%";
    }
    update(0.42);
    return { update: update };
  }

  function fxDots(stage) {
    var wrap = el("div", "fxdotwrap");
    var dots = el("div", "fxdots");
    dots.innerHTML = "<i></i><i></i><i></i>";
    var pct = el("span", "fxdotwrap__pct");
    wrap.appendChild(dots);
    wrap.appendChild(pct);
    stage.appendChild(wrap);
    function update(p) {
      pct.textContent = Math.round(p * 100) + "%";
    }
    update(0.42);
    return { update: update };
  }

  function fxBlocks(stage) {
    var N = 14;
    var wrap = el("div", "fxblocks");
    for (var i = 0; i < N; i += 1) wrap.appendChild(el("span", "fxblock"));
    stage.appendChild(wrap);
    var blocks = wrap.children;
    function update(p) {
      var on = Math.round(p * N);
      for (var i = 0; i < N; i += 1) blocks[i].classList.toggle("is-on", i < on);
    }
    update(0.42);
    return { update: update };
  }

  function fxPixels(stage) {
    var N = 56;
    var wrap = el("div", "fxpixels");
    for (var i = 0; i < N; i += 1) wrap.appendChild(el("span", "fxpixel"));
    stage.appendChild(wrap);
    var cells = wrap.children;
    function update(p) {
      var on = Math.round(p * N);
      for (var i = 0; i < N; i += 1) cells[i].classList.toggle("is-on", i < on);
    }
    update(0.42);
    return { update: update };
  }

  function fxEnergy(stage) {
    stage.appendChild(makeBtn("energy", '<div class="fxfill-h"></div><span class="fxchannel"><i></i></span>'));
    return {};
  }

  function fxTurbine(stage) {
    var t = el("div", "fxturbine");
    var blades = "";
    for (var i = 0; i < 6; i += 1) {
      blades += '<rect x="30" y="4" width="4" height="24" rx="2" transform="rotate(' + i * 60 + " 32 32)\"></rect>";
    }
    t.innerHTML = '<svg viewBox="0 0 64 64">' + blades + '</svg><span class="fxturbine__pct">42%</span>';
    stage.appendChild(t);
    var pct = t.querySelector(".fxturbine__pct");
    function update(p) {
      pct.textContent = Math.round(p * 100) + "%";
    }
    update(0.42);
    return { update: update };
  }

  function fxMaterialWavy(stage) {
    stage.appendChild(makeBtn("material-wavy", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxThin(stage) {
    var t = el("div", "fxthin");
    t.innerHTML = "<i></i>";
    stage.appendChild(t);
    return {};
  }

  function fxHoyoPlay(stage) {
    var arrow =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"></path><path d="m7 10 5 5 5-5"></path></svg>';
    var label = arrow + " " + txt("anim.buttonLoading") + ' <b class="fxpct">42%</b>';
    stage.appendChild(makeBtn("hoyoplay", '<div class="fxfill-h"></div>', label));
    return {};
  }

  function fxGooey(stage) {
    var g = el("div", "fxgoo");
    for (var i = 0; i < 4; i += 1) {
      var b = el("i");
      b.style.left = 10 + i * 48 + "px";
      b.style.animationDelay = i * 0.24 + "s";
      g.appendChild(b);
    }
    stage.appendChild(g);
    return {};
  }

  function fxGlass(stage) {
    stage.appendChild(makeBtn("glass", '<div class="fxfill-h"></div>'));
    return {};
  }

  function fxLiquidPro(stage) {
    stage.appendChild(makeBtn("liquid-pro", '<div class="fxfill-v fx-lux">' + waves(3) + "</div>"));
    return {};
  }

  function fxBarPro(stage) {
    stage.appendChild(
      makeBtn(
        "bar-pro",
        '<div class="fxfill-h fx-luxbar"><span class="fxsheen"></span><span class="fxedge"></span></div>'
      )
    );
    return {};
  }

  function fxRingPro(stage) {
    return ringProgress(stage, '<span class="fxsweep"></span><span class="fxorbit"><i></i></span>');
  }

  function fxBlocksPro(stage) {
    var N = 14;
    var wrap = el("div", "fxblocks fxblocks--pro");
    for (var i = 0; i < N; i += 1) wrap.appendChild(el("span", "fxblock"));
    stage.appendChild(wrap);
    var blocks = wrap.children;
    function update(p) {
      var on = Math.round(p * N);
      for (var i = 0; i < N; i += 1) blocks[i].classList.toggle("is-on", i < on);
    }
    update(0.42);
    return { update: update };
  }

  function fxStagger(stage) {
    var btn = makeBtn("stagger", '<div class="fxfill-h"></div><span class="fxdots"></span>');
    stage.appendChild(btn);
    var grid = btn.querySelector(".fxdots");
    var N = 40;
    for (var i = 0; i < N; i += 1) grid.appendChild(el("span", "fxdot"));
    var dots = grid.children;
    function update(p) {
      var on = Math.round(p * N);
      for (var i = 0; i < N; i += 1) dots[i].classList.toggle("is-on", i < on);
    }
    update(0.42);
    if (window.anime && !reduced()) {
      anime({
        targets: dots,
        scale: [1, 1.5, 1],
        duration: 1300,
        delay: anime.stagger(65, { grid: [8, 5], from: "first" }),
        loop: true,
        easing: "easeInOutSine"
      });
    }
    return { update: update };
  }

  function fxRunner(stage) {
    var d =
      "M28 3 H272 A25 25 0 0 1 297 28 A25 25 0 0 1 272 53 H28 A25 25 0 0 1 3 28 A25 25 0 0 1 28 3 Z";
    var btn = makeBtn(
      "runner",
      '<div class="fxfill-h"></div>' +
        '<svg class="fxrunner" viewBox="0 0 300 56" preserveAspectRatio="none">' +
        '<path class="fxrunner-track" d="' + d + '"></path>' +
        '<path class="fxrunner-arc" d="' + d + '"></path>' +
        "</svg>" +
        '<span class="fxrunner-dot"></span>'
    );
    stage.appendChild(btn);
    var track = btn.querySelector(".fxrunner-track");
    var arc = btn.querySelector(".fxrunner-arc");
    var dot = btn.querySelector(".fxrunner-dot");
    var total = 0;
    function length() {
      if (!total) {
        try {
          total = track.getTotalLength() || 660;
        } catch (e) {
          total = 660;
        }
      }
      return total;
    }
    function update(p) {
      var L = length();
      arc.style.strokeDasharray = String(L);
      arc.style.strokeDashoffset = String(L * (1 - p));
    }
    update(0.42);
    if (window.anime && !reduced()) {
      window.setTimeout(function () {
        var motion = anime.path(track);
        anime({
          targets: dot,
          translateX: motion("x"),
          translateY: motion("y"),
          duration: 2800,
          easing: "linear",
          loop: true
        });
      }, 30);
    }
    return { update: update };
  }

  function fxMorph(stage) {
    var svg =
      '<svg class="fxwaves" viewBox="0 0 2400 26" preserveAspectRatio="none">' +
      '<path class="fxmorph" d="M0 13 Q150 0 300 13 T600 13 T900 13 T1200 13 T1500 13 T1800 13 T2100 13 T2400 13 V26 H0 Z"></path>' +
      "</svg>";
    stage.appendChild(makeBtn("morph", '<div class="fxfill-v">' + svg + "</div>"));
    var path = stage.querySelector(".fxmorph");
    if (window.anime && !reduced()) {
      anime({
        targets: path,
        d: [
          { value: "M0 13 Q150 0 300 13 T600 13 T900 13 T1200 13 T1500 13 T1800 13 T2100 13 T2400 13 V26 H0 Z" },
          { value: "M0 13 Q150 26 300 13 T600 13 T900 13 T1200 13 T1500 13 T1800 13 T2100 13 T2400 13 V26 H0 Z" }
        ],
        duration: 2600,
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine"
      });
    }
    return {};
  }

  function fxSpring(stage) {
    var btn = makeBtn("spring", '<div class="fxfill-h fx-spring"></div>');
    stage.appendChild(btn);
    var fill = btn.querySelector(".fxfill-h");
    var displayed = 42;
    var running = null;
    var pending = null;
    function apply(v) {
      var clamped = Math.max(0, Math.min(100, v));
      fill.style.width = clamped + "%";
      displayed = clamped;
    }
    apply(displayed);
    function run(target) {
      var proxy = { v: displayed };
      running = anime({
        targets: proxy,
        v: target,
        duration: 900,
        easing: "spring(1, 70, 12, 0)",
        update: function () {
          apply(proxy.v);
        },
        complete: function () {
          running = null;
          if (pending !== null && Math.abs(pending - displayed) > 0.5) {
            var next = pending;
            pending = null;
            run(next);
          }
        }
      });
    }
    function update(p) {
      var target = p * 100;
      if (!window.anime) return;
      if (running) {
        pending = target;
        return;
      }
      if (Math.abs(target - displayed) < 0.4) return;
      run(target);
    }
    return { update: update };
  }

  function fxBurst(stage) {
    var btn = makeBtn("burst", '<div class="fxfill-h"></div><span class="fxburst-wrap"></span>');
    stage.appendChild(btn);
    var wrap = btn.querySelector(".fxburst-wrap");
    var lastMilestone = -1;
    function burst(count, x, y) {
      if (!window.anime || reduced()) return;
      for (var i = 0; i < count; i += 1) {
        (function () {
          var s = el("span", "fxburst");
          var ang = anime.random(0, 360);
          var dist = anime.random(16, 54);
          s.style.left = x + "px";
          s.style.top = y + "px";
          wrap.appendChild(s);
          anime({
            targets: s,
            translateX: Math.cos((ang * Math.PI) / 180) * dist,
            translateY: Math.sin((ang * Math.PI) / 180) * dist,
            scale: [1, 0],
            opacity: [1, 0],
            duration: anime.random(420, 780),
            easing: "easeOutQuad",
            complete: function () {
              s.remove();
            }
          });
        })();
      }
    }
    function update(p) {
      var pct = Math.round(p * 100);
      var milestone = Math.floor(pct / 10) * 10;
      if (milestone < lastMilestone) lastMilestone = -1;
      if (milestone > lastMilestone && milestone > 0) {
        lastMilestone = milestone;
        burst(milestone >= 100 ? 22 : 8, btn.clientWidth * p, btn.clientHeight / 2);
      }
    }
    return { update: update };
  }

  function fxOrbitAnime(stage) {
    var result = ringProgress(stage, '<span class="fxorbitdots"><i></i><i></i><i></i></span>');
    var wrap = stage.querySelector(".fxorbitdots");
    if (window.anime && !reduced() && wrap) {
      anime({
        targets: wrap,
        rotate: [0, 340],
        duration: 2200,
        direction: "alternate",
        loop: true,
        easing: "easeInOutQuad"
      });
    }
    return result;
  }

  function fxBubbleFlow(stage) {
    // Chosen effect: implemented as a standalone component so the gallery and
    // the real UI share one source of truth (assets/js/bubble-progress.js).
    var btn = makeBtn("bubbleflow", "");
    stage.appendChild(btn);
    if (!window.YAYL_BUBBLES) return {};
    var bp = window.YAYL_BUBBLES.create(btn, { progress: 0.42 });
    return {
      update: function (p) {
        bp.setProgress(p);
      }
    };
  }

  /* ------------------------------------------------------------------ catalog */

  var CATALOG = [
    { group: "basic", id: "bubbleflow", name: { vi: "Bong bóng nổi (đã chốt)", en: "Rising bubbles (chosen)" }, desc: { vi: "Hiệu ứng tải đã chốt. Bong bóng sinh ở gốc tiến trình, nổi tới mặt thoáng (đầu tiến trình) rồi vỡ. Component riêng: assets/js/bubble-progress.js.", en: "The chosen download effect. Bubbles are born at the start of progress, rise to the surface (the front) and pop. Standalone component: assets/js/bubble-progress.js." }, lib: ["anime.js", "CSS"], w: 1, build: fxBubbleFlow },

    { group: "water", id: "wave-multi", name: { vi: "Sóng xô nhiều lớp", en: "Layered waves" }, desc: { vi: "3 lớp sóng lệch pha; mực nước đúng theo tiến trình.", en: "3 offset wave layers; the level follows progress." }, lib: ["CSS", "SVG"], w: 1, build: fxWaveMulti },
    { group: "water", id: "bubbles", name: { vi: "Bong bóng nổi", en: "Rising bubbles" }, desc: { vi: "Bọt khí nổi trong phần đã tải (tạo bằng anime.js).", en: "Bubbles rise inside the filled part (spawned by anime.js)." }, lib: ["anime.js", "CSS"], w: 2, build: fxBubbles },
    { group: "water", id: "tide", name: { vi: "Thuỷ triều", en: "Tide" }, desc: { vi: "Mặt nước dâng lên rút xuống nhẹ theo nhịp.", en: "The surface gently rises and falls." }, lib: ["CSS", "SVG"], w: 1, build: fxTide },
    { group: "water", id: "bigdrop", name: { vi: "Giọt lớn + splash", en: "Big drop + splash" }, desc: { vi: "Giọt to rơi xuống, sóng tròn lan ra (timeline anime.js).", en: "A big drop falls and rings splash out (anime.js timeline)." }, lib: ["anime.js"], w: 2, build: fxBigDrop },
    { group: "water", id: "reflect", name: { vi: "Nước phản chiếu", en: "Reflective water" }, desc: { vi: "Ánh phản chiếu mờ ngay trên mặt nước.", en: "A soft reflection just above the surface." }, lib: ["CSS", "SVG"], w: 1, build: fxReflect },
    { group: "water", id: "slime", name: { vi: "Slime dâng", en: "Rising slime" }, desc: { vi: "Chất nhớt dâng và biến dạng mặt tiếp xúc.", en: "Goo rises and morphs its surface." }, lib: ["CSS"], w: 2, build: fxSlime },

    { group: "bar", id: "gradient-run", name: { vi: "Gradient chạy", en: "Running gradient" }, desc: { vi: "Dải màu chảy trong phần đã tải.", en: "A colour gradient flows inside the filled part." }, lib: ["CSS"], w: 1, build: fxGradientRun },
    { group: "bar", id: "stripes", name: { vi: "Sọc chéo", en: "Diagonal stripes" }, desc: { vi: "Sọc chéo trượt như thanh đang xử lý.", en: "Diagonal stripes slide, like a working bar." }, lib: ["CSS"], w: 1, build: fxStripes },
    { group: "bar", id: "segmented", name: { vi: "Phân đoạn", en: "Segmented" }, desc: { vi: "Fill chia thành từng ô bằng mask.", en: "The fill is split into cells with a mask." }, lib: ["CSS"], w: 1, build: fxSegmented },
    { group: "bar", id: "border-sweep", name: { vi: "Viền sáng chạy", en: "Border sweep" }, desc: { vi: "Ánh sáng chạy dọc viền; phần sáng theo tiến trình.", en: "Light runs along the outline; the lit arc follows progress." }, lib: ["SVG", "WAAPI"], w: 1, build: fxBorderSweep },
    { group: "bar", id: "comet", name: { vi: "Comet / đuôi sao", en: "Comet tail" }, desc: { vi: "Đầu thanh có đuôi sáng kéo dài.", en: "The leading edge drags a glowing tail." }, lib: ["CSS"], w: 1, build: fxComet },
    { group: "bar", id: "scanline", name: { vi: "Scanline", en: "Scanline" }, desc: { vi: "Đường quét sáng ở đầu thanh, nền có vân quét.", en: "A bright scan line at the edge, scanlines behind." }, lib: ["CSS"], w: 1, build: fxScanline },
    { group: "bar", id: "sand", name: { vi: "Cát lấp đầy", en: "Falling sand" }, desc: { vi: "Hạt cát rơi tích thành cột (canvas 2D).", en: "Grains fall and pile into a column (canvas 2D)." }, lib: ["Canvas 2D"], w: 2, build: fxSand },
    { group: "bar", id: "heat", name: { vi: "Đổi màu nhiệt", en: "Heat colour" }, desc: { vi: "Màu fill chuyển xanh → vàng → đỏ theo tiến trình.", en: "Fill colour shifts green → amber → red with progress." }, lib: ["CSS", "JS"], w: 1, build: fxHeat },

    { group: "ring", id: "ring", name: { vi: "Vòng quanh icon", en: "Progress ring" }, desc: { vi: "Cung tiến trình ôm lấy tâm, số ở giữa.", en: "A progress arc with the number in the middle." }, lib: ["SVG", "JS"], w: 1, build: fxRing },
    { group: "ring", id: "ring-dot", name: { vi: "Vòng + điểm chạy", en: "Ring + orbiting dot" }, desc: { vi: "Một điểm sáng chạy quanh vòng.", en: "A bright dot orbits the ring." }, lib: ["SVG", "CSS"], w: 1, build: fxRingDot },
    { group: "ring", id: "ring-sweep", name: { vi: "Vòng + vệt quét", en: "Ring + sweep" }, desc: { vi: "Vệt sáng conic quét quanh vành.", en: "A conic light sweeps around the rim." }, lib: ["CSS"], w: 1, build: fxRingSweep },
    { group: "ring", id: "hourglass", name: { vi: "Đồng hồ cát", en: "Hourglass" }, desc: { vi: "Cát chảy từ buồng trên xuống theo tiến trình.", en: "Sand drains from the top chamber as progress grows." }, lib: ["CSS"], w: 2, build: fxHourglass },

    { group: "text", id: "odometer", name: { vi: "Nhảy số odometer", en: "Odometer" }, desc: { vi: "Từng chữ số cuộn như công-tơ mét.", en: "Each digit rolls like an odometer." }, lib: ["CSS", "JS"], w: 1, build: fxOdometer },
    { group: "text", id: "text-wipe", name: { vi: "Text wipe", en: "Text wipe" }, desc: { vi: "Chữ sáng dần theo tiến trình (background-clip).", en: "Text lights up with progress (background-clip)." }, lib: ["CSS"], w: 1, build: fxTextWipe },
    { group: "text", id: "breathe-dots", name: { vi: "Chấm nhịp thở", en: "Breathing dots" }, desc: { vi: "Ba chấm nhấp nhô cạnh số phần trăm.", en: "Three pulsing dots next to the percentage." }, lib: ["CSS"], w: 1, build: fxDots },

    { group: "block", id: "blocks", name: { vi: "Khối xếp chồng", en: "Stacked blocks" }, desc: { vi: "Các khối sáng dần như xây tường.", en: "Blocks light up as if building a wall." }, lib: ["CSS", "JS"], w: 1, build: fxBlocks },
    { group: "block", id: "pixels", name: { vi: "Lưới pixel", en: "Pixel grid" }, desc: { vi: "Ô vuông sáng dần theo tiến trình.", en: "Cells light up with progress." }, lib: ["CSS", "JS"], w: 2, build: fxPixels },
    { group: "block", id: "energy", name: { vi: "Năng lượng chạy khe", en: "Energy channel" }, desc: { vi: "Ánh sáng chạy trong rãnh giữa nút.", en: "Light runs inside a channel in the button." }, lib: ["CSS"], w: 1, build: fxEnergy },
    { group: "block", id: "turbine", name: { vi: "Turbine", en: "Turbine" }, desc: { vi: "Cánh quạt xoay liên tục cạnh số tiến trình.", en: "A fan spins next to the progress number." }, lib: ["CSS", "SVG"], w: 1, build: fxTurbine },

    { group: "style", id: "material-wavy", name: { vi: "Material 3 wavy", en: "Material 3 wavy" }, desc: { vi: "Kiểu thanh gợn sóng của Google Material 3.", en: "Google Material 3 wavy progress style." }, lib: ["CSS"], w: 1, build: fxMaterialWavy },
    { group: "style", id: "steam-thin", name: { vi: "Steam / Epic mảnh", en: "Steam / Epic thin" }, desc: { vi: "Thanh mảnh + vệt sáng quét, tối giản.", en: "A thin bar with a shimmer sweep." }, lib: ["CSS"], w: 1, build: fxThin },
    { group: "style", id: "hoyoplay", name: { vi: "HoYoPlay / Hypergryph", en: "HoYoPlay / Hypergryph" }, desc: { vi: "Icon mũi tên + fill + số, kiểu launcher game.", en: "Arrow icon + fill + number, game-launcher style." }, lib: ["CSS", "SVG"], w: 1, build: fxHoyoPlay },
    { group: "style", id: "gooey", name: { vi: "Gooey (SVG filter)", en: "Gooey (SVG filter)" }, desc: { vi: "Giọt dính như thạch nhờ filter blur + contrast.", en: "Blobs merge like jelly via a blur+contrast filter." }, lib: ["SVG filter"], w: 2, build: fxGooey },
    { group: "style", id: "glass", name: { vi: "Glass refraction", en: "Glass refraction" }, desc: { vi: "Khúc xạ bằng feTurbulence + feDisplacementMap — nặng, không khuyến khích.", en: "Refraction via feTurbulence + feDisplacementMap — heavy, not recommended." }, lib: ["SVG filter"], w: 3, build: fxGlass },

    { group: "premium", id: "liquid-pro", name: { vi: "Liquid Pro (tinh chỉnh)", en: "Liquid Pro (refined)" }, desc: { vi: "Bản tinh chỉnh: nước dâng 3 lớp sóng + đỉnh sáng + đổi sắc nhẹ.", en: "Refined: 3-layer liquid with a lit crest and a soft hue shift." }, lib: ["CSS", "SVG"], w: 1, build: fxLiquidPro },
    { group: "premium", id: "bar-pro", name: { vi: "Bar Pro (tinh chỉnh)", en: "Bar Pro (refined)" }, desc: { vi: "Kết hợp gradient chạy + vệt sáng + đầu neon.", en: "Running gradient + sheen + neon edge combined." }, lib: ["CSS"], w: 1, build: fxBarPro },
    { group: "premium", id: "ring-pro", name: { vi: "Ring Pro (tinh chỉnh)", en: "Ring Pro (refined)" }, desc: { vi: "Vòng + vệt quét + điểm chạy, viền dày và có quầng sáng.", en: "Ring with sweep + orbiting dot, thicker and glowing." }, lib: ["CSS", "SVG"], w: 1, build: fxRingPro },
    { group: "premium", id: "blocks-pro", name: { vi: "Blocks Pro (tinh chỉnh)", en: "Blocks Pro (refined)" }, desc: { vi: "Khối có bevel + quầng sáng, trông nổi khối hơn.", en: "Blocks with a bevel and glow for more depth." }, lib: ["CSS", "JS"], w: 1, build: fxBlocksPro },

    { group: "anime", id: "stagger", name: { vi: "Lưới stagger", en: "Stagger grid" }, desc: { vi: "40 chấm dợn theo làn sóng chéo bằng anime.stagger(); chấm sáng theo tiến trình.", en: "40 dots ripple in a diagonal wave via anime.stagger(); lit by progress." }, lib: ["anime.js"], w: 1, build: fxStagger },
    { group: "anime", id: "runner", name: { vi: "Sao chổi chạy viền", en: "Path runner" }, desc: { vi: "Điểm sáng chạy đúng theo viền bằng anime.path(); cung sáng theo tiến trình.", en: "A dot follows the outline via anime.path(); the arc follows progress." }, lib: ["anime.js", "SVG"], w: 1, build: fxRunner },
    { group: "anime", id: "morph", name: { vi: "Sóng biến hình", en: "Morph wave" }, desc: { vi: "anime.js nội suy thuộc tính d để mặt sóng đổi hình liên tục.", en: "anime.js interpolates the d attribute so the wave surface morphs." }, lib: ["anime.js", "SVG"], w: 1, build: fxMorph },
    { group: "anime", id: "spring", name: { vi: "Thanh lò xo", en: "Spring bar" }, desc: { vi: "Fill đuổi theo tiến trình bằng easing spring() — có độ nảy.", en: "The fill chases progress with a spring() easing — it overshoots." }, lib: ["anime.js"], w: 1, build: fxSpring },
    { group: "anime", id: "burst", name: { vi: "Toé sáng mốc 10%", en: "Milestone burst" }, desc: { vi: "Mỗi mốc 10% bắn ra tia hạt bằng anime timeline + random.", en: "Every 10% fires a burst of particles via anime timeline + random." }, lib: ["anime.js"], w: 2, build: fxBurst },
    { group: "anime", id: "orbit-anime", name: { vi: "Vệ tinh quay", en: "Orbiting dots" }, desc: { vi: "Ba điểm sáng quay qua lại quanh vòng bằng anime.js.", en: "Three dots swing around the ring using anime.js." }, lib: ["anime.js", "SVG"], w: 1, build: fxOrbitAnime }
  ];

  var GROUPS = [
    { id: "basic", key: "fx.groupBasic" },
    { id: "water", key: "fx.groupWater" },
    { id: "bar", key: "fx.groupBar" },
    { id: "ring", key: "fx.groupRing" },
    { id: "text", key: "fx.groupText" },
    { id: "block", key: "fx.groupBlock" },
    { id: "style", key: "fx.groupStyle" },
    { id: "premium", key: "fx.groupPremium" },
    { id: "anime", key: "fx.groupAnime" }
  ];

  var demos = [];

  function weightMeter(weight) {
    var meter = el("span", "fxw fxw--" + weight);
    for (var i = 0; i < 3; i += 1) {
      var dot = document.createElement("i");
      if (i < weight) dot.className = "is-on";
      meter.appendChild(dot);
    }
    return meter;
  }

  function buildCard(def) {
    var card = el("article", "fxcard");
    var head = el("div", "fxcard__head");
    var name = el("div", "fxcard__name");
    name.textContent = def.name[lang] || def.name.vi;
    var tags = el("div", "fxcard__tags");
    for (var i = 0; i < def.lib.length; i += 1) {
      var tag = el("span", "fxtag");
      tag.textContent = def.lib[i];
      tags.appendChild(tag);
    }
    tags.appendChild(weightMeter(def.w));
    head.appendChild(name);
    head.appendChild(tags);

    var stage = el("div", "fxstage");
    var desc = el("p", "fxdesc");
    desc.textContent = def.desc[lang] || def.desc.vi;

    card.appendChild(head);
    card.appendChild(stage);
    card.appendChild(desc);

    var demo = def.build(stage) || {};
    demos.push(demo);
    return card;
  }

  function render() {
    var grid = document.getElementById("fxGrid");
    if (!grid) return;
    for (var g = 0; g < GROUPS.length; g += 1) {
      var header = el("div", "fxgroup");
      header.textContent = txt(GROUPS[g].key);
      grid.appendChild(header);
      for (var c = 0; c < CATALOG.length; c += 1) {
        if (CATALOG[c].group === GROUPS[g].id) grid.appendChild(buildCard(CATALOG[c]));
      }
    }
  }

  var currentValue = 42;
  var simTimer = null;
  var simStart = 0;
  var simFrom = 0;
  var simSpan = 0;

  function durationMs() {
    var sel = document.getElementById("fxDuration");
    return sel ? parseInt(sel.value, 10) : 6000;
  }

  function updateElapsed() {
    var node = document.getElementById("fxElapsed");
    if (!node) return;
    var total = durationMs() / 1000;
    node.textContent = ((currentValue / 100) * total).toFixed(1) + "s / " + total.toFixed(1) + "s";
  }

  function setPlaying(on) {
    var btn = document.getElementById("fxPlay");
    var label = document.getElementById("fxPlayLabel");
    if (btn) {
      btn.classList.toggle("is-playing", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (label) label.textContent = on ? txt("fx.pause") : txt("fx.simulate");
  }

  function setProgress(value, fromSim) {
    var v = Math.max(0, Math.min(100, Math.round(value)));
    currentValue = v;
    var p = v / 100;
    var i;
    var btns = document.querySelectorAll(".fxbtn");
    for (i = 0; i < btns.length; i += 1) btns[i].style.setProperty("--p", String(p));
    var stages = document.querySelectorAll(".fxstage");
    for (i = 0; i < stages.length; i += 1) stages[i].style.setProperty("--p", String(p));
    var pcts = document.querySelectorAll(".fxpct");
    for (i = 0; i < pcts.length; i += 1) pcts[i].textContent = v + "%";
    for (i = 0; i < demos.length; i += 1) if (demos[i].update) demos[i].update(p);
    var out = document.getElementById("fxOut");
    if (out) out.textContent = v + "%";
    var range = document.getElementById("fxRange");
    if (range && !fromSim) range.value = String(v);
    updateElapsed();
  }

  function stopSim() {
    if (simTimer) {
      window.clearInterval(simTimer);
      simTimer = null;
    }
    setPlaying(false);
  }

  function simTick() {
    var elapsed = Date.now() - simStart;
    var ratio = simSpan <= 0 ? 1 : Math.min(1, elapsed / simSpan);
    setProgress(simFrom + (100 - simFrom) * ratio, true);
    if (ratio >= 1) {
      stopSim();
      setProgress(100, true);
    }
  }

  function startSim() {
    stopSim();
    simFrom = currentValue;
    simSpan = Math.max(80, durationMs() * (1 - currentValue / 100));
    simStart = Date.now();
    simTimer = window.setInterval(simTick, 40);
    setPlaying(true);
    simTick();
  }

  function initControl() {
    var range = document.getElementById("fxRange");
    if (range) {
      range.addEventListener("input", function () {
        if (simTimer) stopSim();
        setProgress(parseInt(range.value, 10), true);
      });
    }

    var playBtn = document.getElementById("fxPlay");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (simTimer) {
          stopSim();
        } else {
          if (currentValue >= 100) setProgress(0);
          startSim();
        }
      });
    }

    var resetBtn = document.getElementById("fxReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        stopSim();
        setProgress(0);
      });
    }

    var durSel = document.getElementById("fxDuration");
    if (durSel) durSel.addEventListener("change", updateElapsed);

    setProgress(parseInt(range ? range.value : "42", 10));
  }

  function init() {
    document.documentElement.lang = lang;
    render();
    initControl();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    window.setTimeout(init, 0);
  }
})();

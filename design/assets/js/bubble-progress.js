/* YAYL — bubble progress (chosen download effect).
   Classic script, file:// safe. Requires anime.js for the bubbles; the fill
   works without it. See assets/css/components/bubble-progress.css for styles.

   var bp = YAYL_BUBBLES.create(host, { progress: 0.42, interval: 200 });
   bp.setProgress(0.6);   // 0..1
   bp.destroy();
*/
(function () {
  "use strict";

  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function create(host, options) {
    if (!host) return null;
    var opts = options || {};
    var config = {
      interval: opts.interval || 200,
      sizeMin: opts.sizeMin || 4,
      sizeMax: opts.sizeMax || 15,
      durationMin: opts.durationMin || 900,
      durationMax: opts.durationMax || 1700,
      startJitter: opts.startJitter == null ? 8 : opts.startJitter
    };

    var root = document.createElement("div");
    root.className = "bp";
    var fill = document.createElement("div");
    fill.className = "bp__fill";
    var layer = document.createElement("span");
    layer.className = "bp__layer";
    root.appendChild(fill);
    root.appendChild(layer);
    host.appendChild(root);

    var progress = 0;
    var timer = null;

    function setProgress(value) {
      progress = Math.max(0, Math.min(1, Number(value) || 0));
      root.style.setProperty("--bp-p", String(progress));
    }

    function spawn() {
      if (reduced() || !window.anime) return;
      var w = host.clientWidth || root.clientWidth || 0;
      var h = host.clientHeight || root.clientHeight || 0;
      if (!w || !h) return;
      var front = w * progress;
      var size = config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin);
      if (front < size + 14) return;
      // Born at the start of the progress, rising to the surface at the front.
      var startX = 4 + Math.random() * config.startJitter;
      var targetX = Math.max(startX + 12, front - size * 0.6);
      var y = size / 2 + 4 + Math.random() * Math.max(1, h - size - 8);
      var wobble = 3 + Math.random() * 6;
      var bubble = document.createElement("span");
      bubble.className = "bp__bubble";
      bubble.style.left = startX + "px";
      bubble.style.top = y - size / 2 + "px";
      bubble.style.width = size + "px";
      bubble.style.height = size + "px";
      layer.appendChild(bubble);
      window.anime({
        targets: bubble,
        translateX: [0, targetX - startX],
        translateY: [0, -wobble, 0, wobble, 0],
        scale: [0.7, 1.05, 1.18, 1.3],
        opacity: [0, 1, 1, 0],
        duration: config.durationMin + Math.random() * (config.durationMax - config.durationMin),
        easing: "easeInOutSine",
        complete: function () {
          bubble.remove();
        }
      });
    }

    function start() {
      if (timer || reduced() || !window.anime) return;
      timer = window.setInterval(spawn, config.interval);
      spawn();
    }

    function destroy() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      if (window.anime) window.anime.remove(layer.querySelectorAll(".bp__bubble"));
      root.remove();
    }

    setProgress(opts.progress != null ? opts.progress : 0);
    start();

    return { setProgress: setProgress, destroy: destroy, element: root };
  }

  window.YAYL_BUBBLES = { create: create };
})();

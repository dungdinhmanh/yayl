/* YAYL update-button animation proposals.
   The fill level is driven by --p so every demo reflects real progress.
   anime.js adds the falling drops; the rest is CSS. */
(function () {
  "use strict";

  function prefersReduced() {
    return (
      document.body.dataset.motion === "reduced" ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
  }

  function setProgress(value) {
    var p = Math.max(0, Math.min(100, value)) / 100;
    document.querySelectorAll(".dlbtn").forEach(function (btn) {
      btn.style.setProperty("--p", String(p));
    });
    document.querySelectorAll("[data-pct]").forEach(function (el) {
      el.textContent = Math.round(p * 100) + "%";
    });
    var out = document.getElementById("dlfxOut");
    if (out) out.textContent = Math.round(p * 100) + "%";
  }

  function initControl() {
    var range = document.getElementById("dlfxRange");
    if (!range) return;
    range.addEventListener("input", function () {
      setProgress(parseInt(range.value, 10));
    });
    setProgress(parseInt(range.value, 10));
  }

  function initDrops() {
    var btn = document.querySelector('.dlbtn[data-fx="drops"]');
    if (!btn) return;
    var label = btn.querySelector(".dlbtn__label");
    var layer = document.createElement("span");
    layer.className = "dlbtn__layer";
    btn.insertBefore(layer, label);

    function surfaceY() {
      var p = parseFloat(getComputedStyle(btn).getPropertyValue("--p")) || 0;
      return btn.clientHeight * (1 - p);
    }

    function spawn() {
      if (prefersReduced()) return;
      var width = btn.clientWidth;
      var y = surfaceY();
      if (y < 12) return;
      var x = 24 + Math.random() * (width - 48);

      var drop = document.createElement("span");
      drop.className = "dlbtn__drop";
      drop.style.left = x + "px";
      layer.appendChild(drop);

      var ripple = document.createElement("span");
      ripple.className = "dlbtn__ripple";
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      layer.appendChild(ripple);

      if (window.anime) {
        anime({
          targets: drop,
          translateY: [0, y - 6],
          opacity: [0, 1, 1],
          duration: 620,
          easing: "easeInQuad",
          complete: function () {
            drop.remove();
          }
        });
        anime({
          targets: ripple,
          scale: [0.15, 1.7],
          opacity: [0, 0.7, 0],
          duration: 780,
          delay: 540,
          easing: "easeOutQuad",
          complete: function () {
            ripple.remove();
          }
        });
      } else {
        drop.remove();
        ripple.remove();
      }
    }

    if (window.anime && !prefersReduced()) {
      window.setInterval(spawn, 280);
      spawn();
    }
  }

  function init() {
    initControl();
    initDrops();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    window.setTimeout(init, 0);
  }
})();

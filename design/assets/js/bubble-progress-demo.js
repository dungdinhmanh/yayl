/* Demo wiring for design/bubble-progress.html. */
(function () {
  "use strict";

  var MOCK = (window.YAYL_MOCK = window.YAYL_MOCK || {});
  var I18N = MOCK.I18N || { vi: {}, en: {} };
  var lang = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "vi";

  function txt(key) {
    var dict = I18N[lang] || I18N.vi || {};
    return dict[key] || (I18N.vi && I18N.vi[key]) || key;
  }

  function init() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = txt(key);
    });

    var buttonHost = document.getElementById("bpButton");
    var barHost = document.getElementById("bpBar");
    var caption = document.querySelector("[data-bp-caption]");
    var instances = [];
    if (buttonHost && window.YAYL_BUBBLES) instances.push(window.YAYL_BUBBLES.create(buttonHost, { progress: 0.42 }));
    if (barHost && window.YAYL_BUBBLES) instances.push(window.YAYL_BUBBLES.create(barHost, { progress: 0.42, sizeMax: 10 }));

    var range = document.getElementById("bpRange");
    var out = document.getElementById("bpOut");
    var elapsed = document.getElementById("bpElapsed");
    var playBtn = document.getElementById("bpPlay");
    var playLabel = document.getElementById("bpPlayLabel");
    var resetBtn = document.getElementById("bpReset");
    var durSel = document.getElementById("bpDuration");

    var current = 42;
    var timer = null;
    var start = 0;
    var from = 0;
    var span = 0;

    function durationMs() {
      return durSel ? parseInt(durSel.value, 10) : 6000;
    }

    function updateElapsed() {
      if (!elapsed) return;
      var total = durationMs() / 1000;
      elapsed.textContent = ((current / 100) * total).toFixed(1) + "s / " + total.toFixed(1) + "s";
    }

    function setPlaying(on) {
      if (playBtn) {
        playBtn.classList.toggle("is-playing", on);
        playBtn.setAttribute("aria-pressed", on ? "true" : "false");
      }
      if (playLabel) playLabel.textContent = on ? txt("fx.pause") : txt("fx.simulate");
    }

    function apply(value) {
      current = Math.max(0, Math.min(100, Math.round(value)));
      var p = current / 100;
      for (var i = 0; i < instances.length; i += 1) instances[i].setProgress(p);
      if (range) range.value = String(current);
      if (out) out.textContent = current + "%";
      if (caption) caption.textContent = txt("anim.buttonLoading") + " · " + current + "%";
      updateElapsed();
    }

    function stop() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      setPlaying(false);
    }

    function tick() {
      var ratio = span <= 0 ? 1 : Math.min(1, (Date.now() - start) / span);
      apply(from + (100 - from) * ratio);
      if (ratio >= 1) {
        stop();
        apply(100);
      }
    }

    function play() {
      stop();
      from = current;
      span = Math.max(80, durationMs() * (1 - current / 100));
      start = Date.now();
      timer = window.setInterval(tick, 40);
      setPlaying(true);
      tick();
    }

    if (range) {
      range.addEventListener("input", function () {
        stop();
        apply(parseInt(range.value, 10));
      });
    }
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (timer) stop();
        else {
          if (current >= 100) apply(0);
          play();
        }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        stop();
        apply(0);
      });
    }
    if (durSel) durSel.addEventListener("change", updateElapsed);

    apply(42);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else window.setTimeout(init, 0);
})();

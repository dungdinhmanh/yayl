/* YAYL update-button animation proposals.
   Uses anime.js when available; falls back to the CSS keyframes otherwise. */
(function () {
  "use strict";

  function init() {
    if (!window.anime) return;
    var demos = document.querySelectorAll(".btn-demo");
    if (!demos.length) return;
    document.body.classList.add("has-anime");

    demos.forEach(function (demo) {
      var fill = demo.querySelector(".btn-demo-fill");

      if (demo.classList.contains("is-drops")) {
        var layer = document.createElement("span");
        layer.className = "btn-demo-layer";
        demo.appendChild(layer);
        for (var i = 0; i < 6; i += 1) {
          var drop = document.createElement("span");
          drop.className = "btn-demo-drop";
          drop.style.left = 10 + i * 30 + "px";
          layer.appendChild(drop);
        }
        anime({
          targets: layer.querySelectorAll(".btn-demo-drop"),
          translateY: [0, 46],
          opacity: [0, 1, 0],
          duration: 950,
          delay: anime.stagger(130),
          loop: true,
          easing: "easeInQuad"
        });
      }

      if (demo.classList.contains("is-liquid")) {
        var wave = document.createElement("span");
        wave.className = "btn-demo-wave";
        demo.appendChild(wave);
        anime({
          targets: wave,
          translateX: ["-45%", "115%"],
          duration: 1800,
          direction: "alternate",
          loop: true,
          easing: "easeInOutSine"
        });
        if (fill) {
          anime({
            targets: fill,
            translateY: [8, -2],
            scaleX: [1.03, 1],
            duration: 2400,
            direction: "alternate",
            loop: true,
            easing: "easeInOutSine"
          });
        }
      }

      if (demo.classList.contains("is-wave")) {
        var band = document.createElement("span");
        band.className = "btn-demo-band";
        demo.appendChild(band);
        anime({
          targets: band,
          translateX: ["-120%", "220%"],
          duration: 1300,
          loop: true,
          easing: "linear"
        });
      }

      if (demo.classList.contains("is-dots")) {
        var track = document.createElement("span");
        track.className = "btn-demo-layer";
        demo.appendChild(track);
        for (var d = 0; d < 4; d += 1) {
          var dot = document.createElement("span");
          dot.className = "btn-demo-particle";
          track.appendChild(dot);
        }
        anime({
          targets: track.querySelectorAll(".btn-demo-particle"),
          translateX: [-16, 196],
          opacity: [0, 1, 0],
          duration: 1200,
          delay: anime.stagger(160),
          loop: true,
          easing: "linear"
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    window.setTimeout(init, 0);
  }
})();

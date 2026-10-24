/* YAYL download badge — standalone factory.
   Scale is handled by CSS via --dl-badge-size; this file only builds/states the badge.
   The glyph lives in one SVG so centering survives zoom and DPI scaling. */
(function () {
  "use strict";

  var SVG =
    '<svg class="dl-badge__svg" viewBox="0 0 24 24" aria-hidden="true">' +
    '<g class="dl-badge__arrow" transform="translate(12 12) scale(0.75) translate(-12 -12)">' +
    '<g>' +
    '<animateTransform attributeName="transform" type="translate" values="0 -8;0 0;0 0;0 8;0 8" keyTimes="0;0.16;0.52;0.78;1" dur="1.9s" repeatCount="indefinite"></animateTransform>' +
    '<path d="M12 5v13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path>' +
    '<path d="m6.5 13 5.5 5.5L17.5 13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>' +
    "</g>" +
    "</g>" +
    '<g class="dl-badge__pause" transform="translate(12 12) scale(0.75) translate(-12 -12)">' +
    '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"></rect>' +
    '<rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"></rect>' +
    "</g>" +
    "</svg>";

  window.YAYL_BADGE = {
    create: function (state, options) {
      var opts = options || {};
      var badge = document.createElement("span");
      badge.className = "dl-badge" + (opts.corner ? " dl-badge--corner" : "");
      badge.setAttribute("data-state", state || "idle");
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = SVG;
      if (opts.size) {
        badge.style.setProperty("--dl-badge-size", opts.size);
      }
      return badge;
    },
    setState: function (badge, state) {
      if (badge) badge.setAttribute("data-state", state || "idle");
    }
  };
})();

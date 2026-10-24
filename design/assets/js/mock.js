/* YAYL UI lab — core runtime. Classic script, file:// safe. */
(function () {
  "use strict";

  var Y = window.YAYL_MOCK || {};
  var params = new URLSearchParams(window.location.search);
  var page = document.body.dataset.page || "home";
  var games = Y.GAMES || {};
  var states = Y.STATE_META || {};
  var i18n = Y.I18N || { vi: {}, en: {} };
  var icons = Y.ICONS || {};

  function validGame(value) {
    return Object.prototype.hasOwnProperty.call(games, value) ? value : "arknights";
  }

  function validState(value, fallback) {
    return Object.prototype.hasOwnProperty.call(states, value) ? value : fallback;
  }

  var initialGame = validGame(params.get("game"));
  var initialLang = params.get("lang") === "en" ? "en" : "vi";
  var initialState;
  var initialStep = Math.min(3, Math.max(1, parseInt(params.get("step") || "1", 10) || 1));

  if (page === "download") {
    initialState = validState(params.get("state"), "downloading");
    if (["ready", "update", "install"].indexOf(initialState) !== -1) {
      initialState = "downloading";
    }
  } else if (page === "home") {
    initialState = validState(params.get("state"), "ready");
  } else {
    initialState = validState(params.get("state"), "ready");
  }

  var app = {
    params: params,
    page: page,
    current: {
      game: initialGame,
      state: initialState,
      lang: initialLang,
      step: initialStep
    },
    t: t,
    icon: function (name) {
      return icons[name] || "";
    },
    game: function () {
      return games[app.current.game] || games.arknights;
    },
    meta: function () {
      return states[app.current.state] || states.ready;
    },
    setGame: setGame,
    setState: setState,
    setLang: setLang,
    setMotion: setMotion,
    setStep: setStep,
    render: render,
    showToast: showToast,
    openConfirm: openConfirm,
    wireImage: wireImage,
    setArt: setArt,
    updateQuery: updateQuery,
    format: format
  };

  window.YAYL_MOCK.app = app;

  function format(key, vars) {
    var dict = i18n[app.current.lang] || i18n.vi;
    var value = dict[key];
    if (value === undefined) value = i18n.vi[key];
    if (value === undefined) value = key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.split("{" + name + "}").join(String(vars[name]));
      });
    }
    return value;
  }

  function t(key, vars) {
    return format(key, vars);
  }

  function updateQuery(key, value) {
    params.set(key, value);
    try {
      var next = window.location.pathname + "?" + params.toString();
      window.history.replaceState(null, "", next);
    } catch (error) {
      /* file:// in some browsers disallows history updates; the mock still works. */
    }
  }

  function setGame(id) {
    if (!games[id] || app.current.game === id) return;
    app.current.game = id;
    document.body.dataset.game = id;
    updateQuery("game", id);
    render();
  }

  function setState(id) {
    if (!states[id] || app.current.state === id) return;
    app.current.state = id;
    document.body.dataset.state = id;
    updateQuery("state", id);
    render();
  }

  function setLang(lang) {
    if (lang !== "vi" && lang !== "en") return;
    app.current.lang = lang;
    document.documentElement.lang = lang;
    document.body.dataset.lang = lang;
    updateQuery("lang", lang);
    render();
  }

  function setMotion(reduced) {
    document.body.dataset.motion = reduced ? "reduced" : "full";
    updateToolbarMotion();
  }

  function setStep(step) {
    var next = Math.min(3, Math.max(1, parseInt(step, 10) || 1));
    app.current.step = next;
    updateQuery("step", String(next));
    if (typeof Y.setPageStep === "function") {
      Y.setPageStep(next);
    }
    updateToolbar();
  }

  function wireImage(img) {
    if (!img || img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = "1";
    img.addEventListener("error", function () {
      img.classList.add("is-missing");
    });
    if (img.complete && img.naturalWidth === 0) {
      img.classList.add("is-missing");
    }
  }

  var RAIL_PATH = "M28 3 H39 A14 14 0 0 1 53 17 V39 A14 14 0 0 1 39 53 H17 A14 14 0 0 1 3 39 V17 A14 14 0 0 1 17 3 H28";

  function ensureRailProgress() {
    document.querySelectorAll(".game-thumb-wrap").forEach(function (wrap) {
      if (wrap.querySelector(".rail-progress")) return;
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "rail-progress");
      svg.setAttribute("viewBox", "0 0 56 56");
      svg.setAttribute("aria-hidden", "true");
      var bg = document.createElementNS("http://www.w3.org/2000/svg", "path");
      bg.setAttribute("class", "rail-progress-bg");
      bg.setAttribute("pathLength", "100");
      bg.setAttribute("d", RAIL_PATH);
      var fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
      fill.setAttribute("class", "rail-progress-fill");
      fill.setAttribute("pathLength", "100");
      fill.setAttribute("d", RAIL_PATH);
      fill.setAttribute("data-rail-fill", "");
      svg.appendChild(bg);
      svg.appendChild(fill);
      wrap.insertBefore(svg, wrap.firstChild);
    });
  }

  var NAV_DL_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/></svg>';

  function ensureNavDownloadAnim() {
    document.querySelectorAll('.nav-item[href="download.html"], .icon-btn[href="download.html"]').forEach(function (item) {
      if (item.querySelector(".nav-dl-anim")) return;
      var span = document.createElement("span");
      span.className = "nav-dl-anim";
      span.setAttribute("aria-hidden", "true");
      span.innerHTML = NAV_DL_SVG;
      item.appendChild(span);
    });
  }

  function setArt(img, gameId) {
    if (!img) return;
    var entry = games[gameId] || games.arknights;
    var next = entry.art;
    if (img.getAttribute("src") !== next) {
      img.classList.remove("is-missing");
      img.setAttribute("src", next);
    }
    wireImage(img);
  }

  function applyLanguage() {
    document.documentElement.lang = app.current.lang;
    document.body.dataset.lang = app.current.lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  function applyGameData() {
    var game = app.game();
    var lang = app.current.lang;

    document.querySelectorAll("[data-game-name]").forEach(function (el) {
      el.textContent = game.name;
    });
    document.querySelectorAll("[data-game-title]").forEach(function (el) {
      el.textContent = game.title;
    });
    document.querySelectorAll("[data-game-region]").forEach(function (el) {
      el.textContent = game.region;
    });
    document.querySelectorAll("[data-game-version]").forEach(function (el) {
      el.textContent = game.version;
    });
    document.querySelectorAll("[data-game-latest]").forEach(function (el) {
      el.textContent = game.latest;
    });
    document.querySelectorAll("[data-game-size]").forEach(function (el) {
      el.textContent = game.size;
    });
    document.querySelectorAll("[data-game-required]").forEach(function (el) {
      el.textContent = game.required;
    });
    document.querySelectorAll("[data-game-update-size]").forEach(function (el) {
      el.textContent = game.updateSize;
    });
    document.querySelectorAll("[data-game-free]").forEach(function (el) {
      el.textContent = game.free;
    });
    document.querySelectorAll("[data-game-drive]").forEach(function (el) {
      el.textContent = game.drive;
    });
    document.querySelectorAll("[data-game-path]").forEach(function (el) {
      el.textContent = game.path;
    });
    document.querySelectorAll("[data-game-root]").forEach(function (el) {
      el.textContent = game.root;
    });
    document.querySelectorAll("[data-game-exe]").forEach(function (el) {
      el.textContent = game.exe;
    });
    document.querySelectorAll("[data-game-cdn]").forEach(function (el) {
      el.textContent = game.cdn;
    });
    document.querySelectorAll("[data-game-files]").forEach(function (el) {
      el.textContent = game.files;
    });
    document.querySelectorAll("[data-game-downloaded]").forEach(function (el) {
      el.textContent = game.downloaded;
    });
    document.querySelectorAll("[data-game-total]").forEach(function (el) {
      el.textContent = game.total;
    });
    document.querySelectorAll("[data-game-playtime]").forEach(function (el) {
      el.textContent = game.playtime[lang];
    });
    document.querySelectorAll("[data-game-last]").forEach(function (el) {
      el.textContent = game.lastPlayed[lang];
    });
    document.querySelectorAll("[data-game-sub]").forEach(function (el) {
      el.textContent = game.subtitle[lang];
    });
    document.querySelectorAll("[data-game-tag]").forEach(function (el) {
      el.textContent = game.tag;
    });
  }

  function applyActiveGame() {
    var active = app.current.game;

    document.querySelectorAll("[data-game-id]").forEach(function (el) {
      if (el.classList.contains("game-card") || el.classList.contains("top-tab") || el.classList.contains("game-settings-tab")) {
        el.classList.toggle("is-active", el.getAttribute("data-game-id") === active);
      }
    });

    document.querySelectorAll(".game-card[data-game-id]").forEach(function (card) {
      var id = card.getAttribute("data-game-id");
      var game = games[id];
      if (!game) return;
      var isActive = id === active;
      var stateId = isActive ? app.current.state : "ready";
      card.dataset.status = statusKind(stateId);
      var versionEl = card.querySelector("[data-card-version]");
      if (versionEl) versionEl.textContent = game.version;
      var stateEl = card.querySelector("[data-card-state]");
      if (stateEl) stateEl.textContent = sidebarStateLabel(stateId, game);
      var badge = card.querySelector("[data-card-badge]");
      if (badge) {
        var badgeText = sidebarBadge(stateId);
        badge.hidden = !badgeText;
        badge.textContent = badgeText || "";
      }
      var thumb = card.querySelector(".game-thumb");
      if (thumb) setArt(thumb, id);
      var isDownloading =
        isActive && ["downloading", "paused", "verifying"].indexOf(app.current.state) !== -1;
      var progress = isDownloading ? (states[app.current.state] && states[app.current.state].progress) || 42 : 0;
      card.classList.toggle("is-downloading", isDownloading);
      var railFill = card.querySelector("[data-rail-fill]");
      if (railFill) {
        railFill.style.strokeDashoffset = String(100 - progress);
      }
    });

    document.querySelectorAll(".top-tab[data-game-id]").forEach(function (tab) {
      var thumb = tab.querySelector(".top-tab-thumb");
      if (thumb) setArt(thumb, tab.getAttribute("data-game-id"));
    });

    document.querySelectorAll(".game-select[data-game-id]").forEach(function (item) {
      var thumb = item.querySelector(".game-select-thumb");
      if (thumb) setArt(thumb, item.getAttribute("data-game-id"));
    });

    document.querySelectorAll(".game-settings-tab[data-game-id]").forEach(function (tab) {
      var img = tab.querySelector("img");
      if (img) setArt(img, tab.getAttribute("data-game-id"));
    });

    document.querySelectorAll(".backdrop-art[data-active-art]").forEach(function (img) {
      setArt(img, active);
    });
  }

  function statusKind(stateId) {
    if (stateId === "update") return "update";
    if (stateId === "downloading" || stateId === "verifying") return "download";
    if (stateId === "paused") return "paused";
    if (stateId === "error" || stateId === "offline") return "error";
    if (stateId === "install") return "install";
    return "ready";
  }

  function sidebarStateLabel(stateId, game) {
    if (stateId === "downloading") return t("home.status.downloading") + " · 42%";
    if (stateId === "paused") return t("home.status.paused");
    if (stateId === "verifying") return t("home.status.verifying");
    if (stateId === "update") return t("home.status.update");
    if (stateId === "install") return t("home.status.install");
    if (stateId === "running") return t("home.status.running");
    if (stateId === "error") return t("home.status.error");
    if (stateId === "offline") return t("home.status.offline");
    return t("home.status.ready");
  }

  function sidebarBadge(stateId) {
    if (stateId === "update") return t("home.updateChip", { version: app.game().latest }).replace(" · " + app.game().latest, "");
    if (stateId === "downloading") return "42%";
    if (stateId === "paused") return "PAUSE";
    if (stateId === "verifying") return "CRC";
    if (stateId === "error") return "ERR";
    if (stateId === "install") return "NEW";
    return "";
  }

  function applyToolbar() {
    var panel = document.getElementById("mockPanel");
    if (!panel) return;
    var gameSelect = panel.querySelector("[data-mock-game]");
    if (gameSelect) gameSelect.value = app.current.game;
    var stateSelect = panel.querySelector("[data-mock-state]");
    if (stateSelect) stateSelect.value = app.current.state;
    var langSelect = panel.querySelector("[data-mock-lang]");
    if (langSelect) langSelect.value = app.current.lang;
    var stepSelect = panel.querySelector("[data-mock-step]");
    if (stepSelect) stepSelect.value = String(app.current.step);
    updateToolbarMotion();
  }

  function updateToolbarMotion() {
    var button = document.querySelector("[data-mock-motion]");
    if (!button) return;
    var reduced = document.body.dataset.motion === "reduced";
    button.classList.toggle("is-active", reduced);
    button.textContent = reduced ? "Motion: off" : "Motion: on";
  }

  function render() {
    document.body.dataset.game = app.current.game;
    document.body.dataset.state = app.current.state;
    applyLanguage();
    applyGameData();
    applyActiveGame();
    if (typeof Y.renderPage === "function") {
      Y.renderPage(app);
    }
    var isDownloading = ["downloading", "paused", "verifying"].indexOf(app.current.state) !== -1;
    document.querySelectorAll('.nav-item[href="download.html"], .icon-btn[href="download.html"]').forEach(function (item) {
      item.classList.toggle("is-downloading", isDownloading);
    });
    applyToolbar();
  }

  function buildToolbar() {
    if (page === "index" || params.get("ui") === "0") return;

    var stateOptions = "";
    if (page === "home") {
      stateOptions = Y.HOME_STATES.map(function (id) {
        return '<option value="' + id + '">' + stateLabel(id) + "</option>";
      }).join("");
    } else if (page === "download") {
      stateOptions = Y.DOWNLOAD_STATES.map(function (id) {
        return '<option value="' + id + '">' + stateLabel(id) + "</option>";
      }).join("");
    }

    var fab = document.createElement("button");
    fab.type = "button";
    fab.className = "mock-fab";
    fab.id = "mockFab";
    fab.setAttribute("aria-label", "Open UI lab controls");
    fab.innerHTML = app.icon("flask") + "<span>UI LAB</span>";
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.className = "mock-panel";
    panel.id = "mockPanel";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="mock-panel-head">' +
        '<div class="mock-panel-title">' + app.icon("flask") + "<span>UI Lab controls</span></div>" +
        '<button type="button" class="mock-panel-close" id="mockClose" aria-label="Close controls">' + app.icon("x") + "</button>" +
      "</div>" +
      '<div class="mock-panel-body">' +
        (stateOptions ? '<div class="mock-field"><label for="mockState">State</label><select id="mockState" data-mock-state>' + stateOptions + "</select></div>" : "") +
        '<div class="mock-field"><label for="mockGame">Game</label><select id="mockGame" data-mock-game>' +
          '<option value="arknights">Arknights</option><option value="stella">Stella Sora</option>' +
        "</select></div>" +
        '<div class="mock-field"><label for="mockLang">Language</label><select id="mockLang" data-mock-lang>' +
          '<option value="vi">Tiếng Việt</option><option value="en">English</option>' +
        "</select></div>" +
        (page === "first-run" ? '<div class="mock-field"><label for="mockStep">Step</label><select id="mockStep" data-mock-step><option value="1">01 · Language</option><option value="2">02 · Games</option><option value="3">03 · Done</option></select></div>' : "") +
        '<div class="mock-panel-actions"><button type="button" class="mock-toggle" data-mock-motion>Motion: on</button></div>' +
        '<div class="mock-panel-note">Mock only. Add <code>?ui=0</code> to hide this panel. <code>?state=</code>, <code>?lang=</code>, <code>?game=</code> are also supported.</div>' +
      "</div>";
    document.body.appendChild(panel);

    fab.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
    });

    document.getElementById("mockClose").addEventListener("click", function () {
      panel.hidden = true;
    });

    var gameSelect = panel.querySelector("[data-mock-game]");
    if (gameSelect) {
      gameSelect.addEventListener("change", function () {
        setGame(gameSelect.value);
      });
    }

    var stateSelect = panel.querySelector("[data-mock-state]");
    if (stateSelect) {
      stateSelect.addEventListener("change", function () {
        setState(stateSelect.value);
      });
    }

    var langSelect = panel.querySelector("[data-mock-lang]");
    if (langSelect) {
      langSelect.addEventListener("change", function () {
        setLang(langSelect.value);
      });
    }

    var stepSelect = panel.querySelector("[data-mock-step]");
    if (stepSelect) {
      stepSelect.addEventListener("change", function () {
        setStep(stepSelect.value);
      });
    }

    var motion = panel.querySelector("[data-mock-motion]");
    if (motion) {
      motion.addEventListener("click", function () {
        setMotion(document.body.dataset.motion !== "reduced");
      });
    }

    if (params.get("ui") === "1") {
      panel.hidden = false;
    }

    document.addEventListener("keydown", function (event) {
      if (event.ctrlKey && event.shiftKey && (event.key === "L" || event.key === "l")) {
        event.preventDefault();
        panel.hidden = !panel.hidden;
      }
    });
  }

  function stateLabel(id) {
    var key = states[id] && states[id].status;
    return key ? t(key) : id;
  }

  function showToast(title, text, tone) {
    var stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }

    var toast = document.createElement("div");
    toast.className = "toast" + (tone === "error" ? " is-error" : "");
    toast.innerHTML = app.icon(tone === "error" ? "alert" : "check");
    var copy = document.createElement("div");
    copy.className = "toast-copy";
    var heading = document.createElement("div");
    heading.className = "toast-title";
    heading.textContent = title;
    var body = document.createElement("div");
    body.className = "toast-text";
    body.textContent = text;
    copy.appendChild(heading);
    copy.appendChild(body);
    toast.appendChild(copy);
    stack.appendChild(toast);

    window.setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      window.setTimeout(function () {
        toast.remove();
      }, 220);
    }, 3800);
  }

  function openConfirm(options) {
    var opts = options || {};
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    var tone = opts.tone === "accent" ? " is-accent" : "";
    var checkHtml = opts.requireCheck
      ? '<label class="modal-check"><input type="checkbox" id="modalCheck"><span>' + (opts.checkLabel || "") + "</span></label>"
      : "";
    var pathHtml = opts.path ? '<div class="modal-path">' + escapeHtml(opts.path) + "</div>" : "";
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
        '<div class="modal-head">' +
          '<div class="modal-icon' + tone + '">' + app.icon(opts.icon || "alert") + "</div>" +
          '<div><div class="modal-title" id="modalTitle">' + escapeHtml(opts.title || "") + "</div>" +
          '<div class="modal-text">' + escapeHtml(opts.text || "") + "</div></div>" +
        "</div>" +
        '<div class="modal-body">' + pathHtml + checkHtml + "</div>" +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-modal-cancel>' + escapeHtml(opts.cancelLabel || t("common.cancel")) + "</button>" +
          '<button type="button" class="btn ' + (opts.tone === "accent" ? "btn-primary" : "btn-danger") + ' btn-sm" data-modal-confirm>' + escapeHtml(opts.confirmLabel || t("common.confirm")) + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(backdrop);

    var confirm = backdrop.querySelector("[data-modal-confirm]");
    var cancel = backdrop.querySelector("[data-modal-cancel]");
    var check = backdrop.querySelector("#modalCheck");
    if (opts.requireCheck && check) {
      confirm.disabled = true;
      check.addEventListener("change", function () {
        confirm.disabled = !check.checked;
      });
    }

    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }

    function onKey(event) {
      if (event.key === "Escape") close();
    }

    cancel.addEventListener("click", close);
    confirm.addEventListener("click", function () {
      close();
      if (typeof opts.onConfirm === "function") opts.onConfirm();
    });
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", onKey);
    window.setTimeout(function () {
      cancel.focus();
    }, 30);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setupCommon() {
    document.querySelectorAll("img").forEach(wireImage);
    ensureRailProgress();
    ensureNavDownloadAnim();

    document.querySelectorAll(".game-card[data-game-id], .top-tab[data-game-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        setGame(button.getAttribute("data-game-id"));
      });
    });

    document.querySelectorAll("[data-window-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-window-action");
        showToast("UI Lab", "Window action: " + action + " (mock).", "success");
      });
    });
    buildToolbar();
  }

  function init() {
    document.body.dataset.game = app.current.game;
    document.body.dataset.state = app.current.state;
    document.documentElement.lang = app.current.lang;
    if (page === "download") {
      document.body.dataset.state = app.current.state;
    }
    setupCommon();
    if (Y.pages && typeof Y.pages[page] === "function") {
      Y.pages[page](app);
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    window.setTimeout(init, 0);
  }
})();
